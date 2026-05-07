package com.margelo.nitro.nitrocompass

import android.app.Activity
import android.app.ActivityManager
import android.app.Application
import android.content.Context
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.hardware.display.DisplayManager
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.HandlerThread
import android.os.Looper
import android.os.SystemClock
import android.view.Display
import android.view.Surface
import java.lang.ref.WeakReference
import androidx.annotation.Keep
import com.facebook.proguard.annotations.DoNotStrip
import com.margelo.nitro.NitroModules
import com.margelo.nitro.core.Promise
import java.util.concurrent.atomic.AtomicInteger
import kotlin.math.abs
import kotlin.math.sqrt

/**
 * Android implementation of NitroCompass.
 *
 * Uses Sensor.TYPE_ROTATION_VECTOR (gyro+accel+mag fused) with a
 * TYPE_GEOMAGNETIC_ROTATION_VECTOR fallback for gyroless / budget devices.
 * Sensor delivery happens on a dedicated HandlerThread so it never blocks
 * the UI thread; samples are forwarded to the JS callback directly.
 *
 * The math is adapted from the MIT-licensed Andromeda library that powers
 * the Trail Sense app: https://github.com/kylecorry31/andromeda
 */
@DoNotStrip
@Keep
class HybridNitroCompass : HybridNitroCompassSpec() {

  companion object {
    // Some Android sensor stacks (notably certain Samsung/Huawei builds)
    // can silently stall after a screen off / sensor pressure event.
    // The rotation-vector sensor at SENSOR_DELAY_GAME nominally fires
    // every ~20ms; if no event has arrived in 1.5s we assume the stack
    // froze and force a re-registration.
    private const val WATCHDOG_PERIOD_MS = 1_500L
    private const val STALE_THRESHOLD_NS = 1_500_000_000L

    // Earth's magnetic field magnitude is typically 25–65 µT. Anything
    // outside this band (with a small grace margin) is treated as
    // external interference — laptops, monitors, car engines, and
    // structural steel routinely push readings well above 100 µT.
    private const val EARTH_FIELD_MIN_UT = 20.0
    private const val EARTH_FIELD_MAX_UT = 70.0

    // Default low-pass smoothing for the rotation-vector output. iOS's
    // CLLocationManager already filters heading internally; the raw
    // Android rotation vector does not, so the dial visibly jitters
    // by 1–3° at rest. Smoothing (sin θ, cos θ) instead of θ avoids
    // 359°→0° wraparound artifacts. α=0.2 gives a ~5-sample time
    // constant — at SENSOR_DELAY_GAME (~20ms) that's ~100ms of lag,
    // imperceptible compared to the noise it removes. Tunable live
    // via setSmoothing().
    private const val DEFAULT_SMOOTHING_ALPHA = 0.2
  }

  @Volatile private var filterDeg: Double = 1.0
  @Volatile private var lastEmittedHeading: Double = Double.NaN
  @Volatile private var lastAccuracyDeg: Double = -1.0
  @Volatile private var lastSample: CompassSample? = null
  @Volatile private var lastQuality: AccuracyQuality? = null
  @Volatile private var declinationDeg: Double = 0.0
  @Volatile private var pauseOnBackground: Boolean = true
  @Volatile private var started: Boolean = false
  @Volatile private var isSubscribed: Boolean = false
  @Volatile private var lastEventNs: Long = 0L
  @Volatile private var lastInterference: Boolean? = null
  @Volatile private var currentActivityRef: WeakReference<Activity>? = null
  @Volatile private var smoothedSin: Double = Double.NaN
  @Volatile private var smoothedCos: Double = Double.NaN
  @Volatile private var smoothingAlpha: Double = DEFAULT_SMOOTHING_ALPHA
  // Tracks whether the rotation-vector sensor publishes a per-sample
  // accuracy in `event.values[4]`. Many devices don't, in which case the
  // synthetic degree floor derived from SENSOR_STATUS_* is the only
  // accuracy signal available — and we have to keep it updated.
  @Volatile private var hasPerSampleAccuracy: Boolean = false
  // Last raw quality from the OS, before the interference downgrade is
  // applied. Used to re-derive `lastQuality` when interference toggles.
  @Volatile private var lastRawQuality: AccuracyQuality? = null

  private val rotationMatrix = FloatArray(16)
  private val remappedMatrix = FloatArray(16)
  private val orientation = FloatArray(3)

  private val epoch = AtomicInteger(0)
  private val activityCounter = AtomicInteger(0)
  private var sensorThread: HandlerThread? = null
  private var sensorHandler: Handler? = null
  private var activeSensor: Sensor? = null
  private var activeListener: SensorEventListener? = null
  private var lifecycleCallbacks: Application.ActivityLifecycleCallbacks? = null
  private var onHeading: ((CompassSample) -> Unit)? = null
  private var calibrationCb: ((AccuracyQuality) -> Unit)? = null
  private var interferenceCb: ((Boolean) -> Unit)? = null

  private val watchdogHandler = Handler(Looper.getMainLooper())
  private val watchdogRunnable = object : Runnable {
    override fun run() {
      // When the app is backgrounded, the OS legitimately suspends or
      // throttles non-wake-up sensors (Doze on API 23+, background limits
      // on API 26+). Re-registering the listener won't change that — it
      // just burns power flapping every 1.5s. Skip the staleness check
      // and re-arm; we'll resume normal watchdog behaviour on foreground.
      val backgrounded = activityCounter.get() == 0
      val last = lastEventNs
      val now = SystemClock.elapsedRealtimeNanos()
      if (!backgrounded && last > 0L && now - last > STALE_THRESHOLD_NS) {
        synchronized(this@HybridNitroCompass) {
          if (started && isSubscribed) {
            unsubscribeLocked()
            subscribeLocked()
            // subscribeLocked() re-arms the watchdog itself, so don't
            // double-post below. Reset the timestamp to give the fresh
            // subscription a full window before being judged stale.
            lastEventNs = SystemClock.elapsedRealtimeNanos()
          }
        }
        return
      }
      if (started && isSubscribed) {
        watchdogHandler.postDelayed(this, WATCHDOG_PERIOD_MS)
      }
    }
  }

  private val context: Context
    get() = NitroModules.applicationContext
      ?: throw IllegalStateException("NitroModules.applicationContext is null — was Nitro installed?")

  override fun start(filterDegrees: Double, onHeading: (sample: CompassSample) -> Unit) {
    synchronized(this) {
      stopLocked()
      started = true
      filterDeg = filterDegrees.coerceAtLeast(0.0)
      this.onHeading = onHeading
      lastEmittedHeading = Double.NaN
      lastAccuracyDeg = -1.0
      lastSample = null
      lastQuality = null

      hasPerSampleAccuracy = false
      lastRawQuality = null
      registerLifecycleCallbacks()
      subscribeLocked()
    }
  }

  override fun stop() {
    synchronized(this) {
      stopLocked()
    }
  }

  override fun hasCompass(): Boolean {
    val sm = NitroModules.applicationContext?.getSystemService(Context.SENSOR_SERVICE) as? SensorManager
      ?: return false
    return sm.getDefaultSensor(Sensor.TYPE_ROTATION_VECTOR) != null ||
      sm.getDefaultSensor(Sensor.TYPE_GEOMAGNETIC_ROTATION_VECTOR) != null
  }

  override fun isStarted(): Boolean = started

  override fun setFilter(degrees: Double) {
    filterDeg = degrees.coerceAtLeast(0.0)
  }

  override fun setSmoothing(alpha: Double) {
    smoothingAlpha = alpha.coerceIn(0.0, 1.0)
  }

  override fun getDiagnostics(): SensorDiagnostics? {
    val sm = NitroModules.applicationContext?.getSystemService(Context.SENSOR_SERVICE) as? SensorManager
      ?: return null
    return when {
      sm.getDefaultSensor(Sensor.TYPE_ROTATION_VECTOR) != null ->
        SensorDiagnostics(SensorKind.ROTATIONVECTOR)
      sm.getDefaultSensor(Sensor.TYPE_GEOMAGNETIC_ROTATION_VECTOR) != null ->
        SensorDiagnostics(SensorKind.GEOMAGNETICROTATIONVECTOR)
      else -> null
    }
  }

  override fun getCurrentHeading(): CompassSample? = lastSample

  override fun setDeclination(degrees: Double) {
    declinationDeg = degrees
  }

  override fun setOnCalibrationNeeded(onChange: (quality: AccuracyQuality) -> Unit) {
    calibrationCb = onChange
  }

  override fun setOnInterferenceDetected(onChange: (interferenceDetected: Boolean) -> Unit) {
    interferenceCb = onChange
    // Replay the current state so a late-registering consumer sees the
    // truth instead of waiting for the next transition (which may never
    // arrive if the field stays stable).
    lastInterference?.let(onChange)
  }

  override fun setPauseOnBackground(enabled: Boolean) {
    synchronized(this) {
      pauseOnBackground = enabled
      if (enabled && started && isSubscribed && activityCounter.get() == 0) {
        unsubscribeLocked()
      } else if (!enabled && started && !isSubscribed) {
        subscribeLocked()
      }
    }
  }

  // Sensors don't require a runtime permission on Android, so both
  // permission methods are unconditionally granted.
  override fun getPermissionStatus(): PermissionStatus = PermissionStatus.GRANTED

  override fun requestPermission(): Promise<PermissionStatus> {
    val p = Promise<PermissionStatus>()
    p.resolve(PermissionStatus.GRANTED)
    return p
  }

  private fun stopLocked() {
    started = false
    unsubscribeLocked()
    unregisterLifecycleCallbacks()
    onHeading = null
    lastSample = null
    lastQuality = null
    lastInterference = null
  }

  private fun subscribeLocked() {
    if (isSubscribed) return
    val sm = context.getSystemService(Context.SENSOR_SERVICE) as? SensorManager
      ?: throw IllegalStateException("SensorManager unavailable")
    val sensor = sm.getDefaultSensor(Sensor.TYPE_ROTATION_VECTOR)
      ?: sm.getDefaultSensor(Sensor.TYPE_GEOMAGNETIC_ROTATION_VECTOR)
      ?: throw IllegalStateException("No rotation sensor on this device")

    val myEpoch = epoch.incrementAndGet()
    val thread = HandlerThread("NitroCompass-Sensor").also { it.start() }
    val handler = Handler(thread.looper)
    val listener = object : SensorEventListener {
      override fun onSensorChanged(event: SensorEvent) {
        if (myEpoch != epoch.get()) return
        handleSensorEvent(event)
      }

      override fun onAccuracyChanged(sensor: Sensor, accuracy: Int) {
        if (myEpoch != epoch.get()) return
        handleAccuracyChanged(accuracy)
      }
    }
    sm.registerListener(listener, sensor, SensorManager.SENSOR_DELAY_GAME, handler)

    // Optional second subscription for magnetic-interference detection.
    // 5Hz is plenty (we only care about transitions in/out of the
    // Earth-field band) and keeps power cost negligible. Same listener
    // instance — events are demuxed by sensor type in handleSensorEvent.
    sm.getDefaultSensor(Sensor.TYPE_MAGNETIC_FIELD)?.let { magSensor ->
      sm.registerListener(listener, magSensor, SensorManager.SENSOR_DELAY_NORMAL, handler)
    }

    sensorThread = thread
    sensorHandler = handler
    activeSensor = sensor
    activeListener = listener
    isSubscribed = true

    smoothedSin = Double.NaN
    smoothedCos = Double.NaN
    lastEventNs = 0L
    watchdogHandler.removeCallbacks(watchdogRunnable)
    watchdogHandler.postDelayed(watchdogRunnable, WATCHDOG_PERIOD_MS)
  }

  private fun unsubscribeLocked() {
    watchdogHandler.removeCallbacks(watchdogRunnable)
    if (!isSubscribed) {
      sensorThread?.quitSafely()
      sensorThread = null
      sensorHandler = null
      activeSensor = null
      activeListener = null
      return
    }
    epoch.incrementAndGet()
    val sm = NitroModules.applicationContext?.getSystemService(Context.SENSOR_SERVICE) as? SensorManager
    activeListener?.let { sm?.unregisterListener(it) }
    activeListener = null
    activeSensor = null
    sensorHandler = null
    sensorThread?.quitSafely()
    sensorThread = null
    isSubscribed = false
  }

  private fun registerLifecycleCallbacks() {
    if (lifecycleCallbacks != null) return
    val app = NitroModules.applicationContext?.applicationContext as? Application ?: return
    // start() can be called from a headless / background context (e.g. a
    // headless JS task, or before any Activity has come up). Don't assume
    // foreground — query the OS so pauseOnBackground=true actually keeps
    // the sensor unsubscribed when the app isn't user-visible.
    activityCounter.set(if (isAppInForeground(app)) 1 else 0)
    val cb = object : Application.ActivityLifecycleCallbacks {
      override fun onActivityCreated(activity: Activity, savedInstanceState: Bundle?) {
        captureActivity(activity)
      }
      override fun onActivityStarted(activity: Activity) {
        captureActivity(activity)
        if (activityCounter.getAndIncrement() == 0) handleForeground()
      }
      override fun onActivityResumed(activity: Activity) {
        captureActivity(activity)
      }
      override fun onActivityPaused(activity: Activity) {}
      override fun onActivityStopped(activity: Activity) {
        if (activityCounter.decrementAndGet() == 0) handleBackground()
      }
      override fun onActivitySaveInstanceState(activity: Activity, outState: Bundle) {}
      override fun onActivityDestroyed(activity: Activity) {
        if (currentActivityRef?.get() == activity) {
          currentActivityRef = null
        }
      }
    }
    app.registerActivityLifecycleCallbacks(cb)
    lifecycleCallbacks = cb
  }

  private fun unregisterLifecycleCallbacks() {
    val cb = lifecycleCallbacks ?: return
    val app = NitroModules.applicationContext?.applicationContext as? Application
    app?.unregisterActivityLifecycleCallbacks(cb)
    lifecycleCallbacks = null
    activityCounter.set(0)
    currentActivityRef = null
  }

  private fun captureActivity(activity: Activity) {
    currentActivityRef = WeakReference(activity)
  }

  private fun isAppInForeground(app: Application): Boolean {
    val am = app.getSystemService(Context.ACTIVITY_SERVICE) as? ActivityManager ?: return true
    val procs = am.runningAppProcesses ?: return true
    val pid = android.os.Process.myPid()
    for (proc in procs) {
      if (proc.pid == pid) {
        return proc.importance <= ActivityManager.RunningAppProcessInfo.IMPORTANCE_VISIBLE
      }
    }
    return true
  }

  private fun handleBackground() {
    synchronized(this) {
      if (pauseOnBackground && started && isSubscribed) {
        unsubscribeLocked()
      }
    }
  }

  private fun handleForeground() {
    synchronized(this) {
      if (pauseOnBackground && started && !isSubscribed) {
        subscribeLocked()
      }
    }
  }

  private fun handleSensorEvent(event: SensorEvent) {
    val type = event.sensor.type
    if (type == Sensor.TYPE_MAGNETIC_FIELD) {
      handleMagneticEvent(event)
      return
    }
    if (type != Sensor.TYPE_ROTATION_VECTOR &&
      type != Sensor.TYPE_GEOMAGNETIC_ROTATION_VECTOR
    ) return

    lastEventNs = SystemClock.elapsedRealtimeNanos()

    SensorManager.getRotationMatrixFromVector(rotationMatrix, event.values)

    val (axisX, axisY) = when (currentSurfaceRotation()) {
      Surface.ROTATION_90 -> SensorManager.AXIS_Y to SensorManager.AXIS_MINUS_X
      Surface.ROTATION_180 -> SensorManager.AXIS_MINUS_X to SensorManager.AXIS_MINUS_Y
      Surface.ROTATION_270 -> SensorManager.AXIS_MINUS_Y to SensorManager.AXIS_X
      else -> SensorManager.AXIS_X to SensorManager.AXIS_Y
    }
    SensorManager.remapCoordinateSystem(rotationMatrix, axisX, axisY, remappedMatrix)
    SensorManager.getOrientation(remappedMatrix, orientation)

    var heading = Math.toDegrees(orientation[0].toDouble())
    if (heading < 0.0) heading += 360.0
    heading = smoothHeading(heading)

    if (event.values.size > 4 && event.values[4] >= 0f) {
      val acc = Math.toDegrees(event.values[4].toDouble())
      hasPerSampleAccuracy = true
      lastAccuracyDeg = acc
      fireCalibration(qualityFor(acc))
    }

    val prev = lastEmittedHeading
    val delta = if (prev.isNaN()) Double.MAX_VALUE else shortestArc(prev, heading)
    if (filterDeg > 0.0 && delta < filterDeg) return
    lastEmittedHeading = heading

    var emitted = heading + declinationDeg
    emitted = ((emitted % 360.0) + 360.0) % 360.0
    val sample = CompassSample(emitted, lastAccuracyDeg)
    lastSample = sample
    onHeading?.invoke(sample)
  }

  private fun handleMagneticEvent(event: SensorEvent) {
    if (event.values.size < 3) return
    val x = event.values[0]
    val y = event.values[1]
    val z = event.values[2]
    val magnitude = sqrt((x * x + y * y + z * z).toDouble())
    val isInterference = magnitude < EARTH_FIELD_MIN_UT || magnitude > EARTH_FIELD_MAX_UT
    if (lastInterference == isInterference) return
    lastInterference = isInterference
    interferenceCb?.invoke(isInterference)
    // External interference makes the heading less trustworthy even when
    // the OS rotation-vector accuracy hasn't downgraded (gyro+accel can
    // keep its bucket high while the magnetometer is being skewed). Pump
    // the last raw quality back through fireCalibration so the
    // interference-aware downgrade is applied, and refresh the synthetic
    // degree value to match.
    lastRawQuality?.let { fireCalibration(it) }
    if (!hasPerSampleAccuracy) refreshSyntheticAccuracy()
  }

  private fun handleAccuracyChanged(accuracy: Int) {
    val quality = when (accuracy) {
      SensorManager.SENSOR_STATUS_ACCURACY_HIGH -> AccuracyQuality.HIGH
      SensorManager.SENSOR_STATUS_ACCURACY_MEDIUM -> AccuracyQuality.MEDIUM
      SensorManager.SENSOR_STATUS_ACCURACY_LOW -> AccuracyQuality.LOW
      else -> AccuracyQuality.UNRELIABLE
    }
    fireCalibration(quality)
    if (!hasPerSampleAccuracy) refreshSyntheticAccuracy()
  }

  private fun smoothHeading(degrees: Double): Double {
    val rad = Math.toRadians(degrees)
    val s = Math.sin(rad)
    val c = Math.cos(rad)
    val ss = smoothedSin
    val cs = smoothedCos
    if (ss.isNaN() || cs.isNaN()) {
      smoothedSin = s
      smoothedCos = c
      return degrees
    }
    val a = smoothingAlpha
    if (a >= 1.0) {
      smoothedSin = s
      smoothedCos = c
      return degrees
    }
    val newSin = a * s + (1.0 - a) * ss
    val newCos = a * c + (1.0 - a) * cs
    smoothedSin = newSin
    smoothedCos = newCos
    var deg = Math.toDegrees(Math.atan2(newSin, newCos))
    if (deg < 0.0) deg += 360.0
    return deg
  }

  private fun qualityFor(accuracyDeg: Double): AccuracyQuality {
    return when {
      accuracyDeg < 0 -> AccuracyQuality.UNRELIABLE
      accuracyDeg < 5 -> AccuracyQuality.HIGH
      accuracyDeg < 15 -> AccuracyQuality.MEDIUM
      accuracyDeg < 30 -> AccuracyQuality.LOW
      else -> AccuracyQuality.UNRELIABLE
    }
  }

  private fun degreesFor(quality: AccuracyQuality): Double = when (quality) {
    AccuracyQuality.HIGH -> 5.0
    AccuracyQuality.MEDIUM -> 15.0
    AccuracyQuality.LOW -> 30.0
    AccuracyQuality.UNRELIABLE -> -1.0
  }

  // Magnetic interference is a separate signal from rotation-vector
  // accuracy on Android — gyro+accel can keep the OS bucket "HIGH" even
  // while the magnetometer is being skewed by a laptop / car / steel.
  // Reporting `quality=high` while `interfering=true` is contradictory
  // UX, so we downgrade the surfaced bucket by one notch when
  // interference is currently detected.
  private fun effectiveQuality(raw: AccuracyQuality): AccuracyQuality {
    if (lastInterference != true) return raw
    return when (raw) {
      AccuracyQuality.HIGH -> AccuracyQuality.MEDIUM
      AccuracyQuality.MEDIUM -> AccuracyQuality.LOW
      AccuracyQuality.LOW -> AccuracyQuality.UNRELIABLE
      AccuracyQuality.UNRELIABLE -> AccuracyQuality.UNRELIABLE
    }
  }

  // For devices that don't publish a per-sample accuracy in
  // event.values[4], the only accuracy signal is the OS bucket. Map the
  // current effective bucket back to a representative degree value so
  // CompassSample.accuracy reflects interference too.
  private fun refreshSyntheticAccuracy() {
    val raw = lastRawQuality ?: return
    lastAccuracyDeg = degreesFor(effectiveQuality(raw))
  }

  private fun fireCalibration(quality: AccuracyQuality) {
    lastRawQuality = quality
    val effective = effectiveQuality(quality)
    if (effective == lastQuality) return
    lastQuality = effective
    calibrationCb?.invoke(effective)
  }

  private fun currentSurfaceRotation(): Int {
    // Prefer the *activity's* display when available — on foldables and
    // multi-window setups the activity's display can differ from the
    // primary display, so reading via DisplayManager.DEFAULT_DISPLAY
    // gives the wrong rotation. Activity.getDisplay() is API 30+;
    // fall back to the deprecated WindowManager.defaultDisplay path on
    // older devices, and to DisplayManager when we have no activity
    // (early in the process before any lifecycle callback has fired).
    val activity = currentActivityRef?.get()
    if (activity != null) {
      val display: Display? = try {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
          activity.display
        } else {
          @Suppress("DEPRECATION")
          activity.windowManager.defaultDisplay
        }
      } catch (_: Throwable) {
        null
      }
      if (display != null) return display.rotation
    }
    val ctx = NitroModules.applicationContext ?: return Surface.ROTATION_0
    val dm = ctx.getSystemService(Context.DISPLAY_SERVICE) as? DisplayManager
      ?: return Surface.ROTATION_0
    @Suppress("DEPRECATION")
    return dm.getDisplay(Display.DEFAULT_DISPLAY)?.rotation ?: Surface.ROTATION_0
  }

  private fun shortestArc(from: Double, to: Double): Double {
    val diff = ((to - from + 540.0) % 360.0) - 180.0
    return abs(diff)
  }
}
