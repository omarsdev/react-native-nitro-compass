package com.margelo.nitro.nitrocompass

import android.app.Activity
import android.app.ActivityManager
import android.app.Application
import android.content.Context
import android.hardware.GeomagneticField
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
 * Computes heading directly from raw `TYPE_ACCELEROMETER` +
 * `TYPE_MAGNETIC_FIELD` via `SensorManager.getRotationMatrix()` /
 * `getOrientation()`. This path is *stateless*: the moment external
 * interference (a magnet, a laptop, etc.) is removed, the very next
 * magnetometer sample produces the correct heading.
 *
 * The fused `TYPE_ROTATION_VECTOR` sensor would be smoother in steady
 * state, but its OS-level Kalman filter can hold a poisoned bias estimate
 * for many seconds after a strong field excursion — a recovery delay
 * that's the dominant complaint vs. consumer compass apps. Smoothing the
 * raw fix instead, via the existing EMA on (sin θ, cos θ), restores
 * the steady-state feel without the recovery penalty.
 */
@DoNotStrip
@Keep
class HybridNitroCompass : HybridNitroCompassSpec() {

  companion object {
    // Sensor.TYPE_ACCELEROMETER + TYPE_MAGNETIC_FIELD at SENSOR_DELAY_GAME
    // both fire ~50Hz. If neither has produced an event in 1.5s while
    // the app is foregrounded, assume the sensor stack froze and force
    // a re-registration — same watchdog policy as the previous
    // rotation-vector implementation.
    private const val WATCHDOG_PERIOD_MS = 1_500L
    private const val STALE_THRESHOLD_NS = 1_500_000_000L

    // Earth's magnetic field magnitude is typically 25–65 µT. Anything
    // outside this band (with a small grace margin) is treated as
    // external interference — laptops, monitors, car engines, and
    // structural steel routinely push readings well above 100 µT.
    private const val EARTH_FIELD_MIN_UT = 20.0
    private const val EARTH_FIELD_MAX_UT = 70.0

    // Default low-pass smoothing for the heading. The raw mag/accel
    // computation produces a usable but noisier signal than the OS's
    // gyro-fused rotation vector, so the dial visibly jitters by 1–3°
    // at rest. Smoothing (sin θ, cos θ) instead of θ avoids 359°→0°
    // wraparound artifacts. α=0.2 gives a ~5-sample time constant — at
    // SENSOR_DELAY_GAME (~20ms) that's ~100ms of lag, imperceptible
    // compared to the noise it removes. Tunable live via setSmoothing().
    private const val DEFAULT_SMOOTHING_ALPHA = 0.2

    // Input low-pass on the accel and mag *vectors* before they enter
    // getRotationMatrix(). Killing the noise at its source matters more
    // than smoothing the output heading, because rotation-matrix math
    // amplifies small input noise non-linearly.
    //
    // Per FSensor / Trail-Sense conventions we use *different* α per
    // sensor — accel is jerk-noisy (high-frequency), mag is hard-iron-
    // drift-noisy (low-frequency). And α is *adaptive* on the gyro-
    // derived yaw rate: stronger filter when still (kills steady-state
    // jitter), weaker filter on fast turns (avoids visible lag).
    private const val INPUT_FILTER_ALPHA_ACCEL_STILL = 0.05f
    private const val INPUT_FILTER_ALPHA_ACCEL_FAST = 0.25f
    private const val INPUT_FILTER_ALPHA_MAG_STILL = 0.10f
    private const val INPUT_FILTER_ALPHA_MAG_FAST = 0.40f
    private const val YAW_RATE_STILL_DEG_S = 5.0
    private const val YAW_RATE_FAST_DEG_S = 30.0

    // Complementary filter blend on yaw: each magnetometer sample pulls
    // the gyro-integrated `fusedYawDeg` toward the mag-derived yaw by
    // this fraction. α=0.02 at 50Hz → time constant ≈ 1 s. Small enough
    // that mag noise is averaged out; large enough that consumer-grade
    // gyro drift can't accumulate visibly before correction. Skipped
    // entirely while interference is active so a magnet doesn't pull
    // the fusion off-truth — gyro carries heading until the field clears.
    private const val MAG_CORRECTION_ALPHA = 0.02

    // Hard-iron bias jump threshold (µT, per axis). The OS's bias
    // estimate shifts when it observes a sustained change in the local
    // field — placing or removing a magnet on top of the device does
    // exactly this. A jump > 1 µT on any axis means the OS just
    // decided the field environment shifted, which we treat as a soft
    // interference event even when field magnitude stays within the
    // Earth band (e.g. another phone placed on top — moderate
    // perturbation, magnitude check misses it). Only meaningful when
    // we're subscribed to TYPE_MAGNETIC_FIELD_UNCALIBRATED, which
    // reports the bias estimate alongside raw values.
    private const val BIAS_JUMP_UT = 1.0f
    // Grace window after the most recent bias jump. While within this
    // window we treat the mag stack as unsettled (ongoing interference)
    // — gyro alone carries heading until the OS settles its estimate
    // and we trust mag again. 1.5 s comfortably covers OEM bias-update
    // cadence without leaving a long stale interference flag.
    private const val BIAS_JUMP_GRACE_NS = 1_500_000_000L

    // Tightened interference-band tolerance applied around the
    // user-provided location's expected field strength, when one has
    // been supplied via setLocation(). Earth's field varies from
    // ~25 µT at the equator to ~65 µT near the poles, so a generic
    // 20–70 band is too loose at one extreme and too tight at the
    // other. ±15 µT centered on `expectedFieldUt` catches weak
    // interference while still tolerating sensor noise + altitude
    // variation.
    private const val LOCATION_FIELD_TOLERANCE_UT = 15.0
  }

  @Volatile private var filterDeg: Double = 1.0
  @Volatile private var lastEmittedHeading: Double = Double.NaN
  @Volatile private var lastAccuracyDeg: Double = -1.0
  @Volatile private var lastFieldUt: Double = -1.0
  @Volatile private var lastSample: CompassSample? = null
  @Volatile private var lastQuality: AccuracyQuality? = null
  @Volatile private var declinationDeg: Double = 0.0
  @Volatile private var pauseOnBackground: Boolean = true
  @Volatile private var started: Boolean = false
  @Volatile private var isSubscribed: Boolean = false
  @Volatile private var lastEventNs: Long = 0L
  // Separate timestamp for game-RV so the watchdog can detect
  // gyro-only freezes (heading silently stops tracking rotation
  // during interference if game-RV freezes alone — the accel+mag
  // pair keeps `lastEventNs` fresh and the watchdog wouldn't fire).
  @Volatile private var lastGameRvEventNs: Long = 0L
  @Volatile private var lastInterference: Boolean? = null
  @Volatile private var currentActivityRef: WeakReference<Activity>? = null
  @Volatile private var smoothedSin: Double = Double.NaN
  @Volatile private var smoothedCos: Double = Double.NaN
  @Volatile private var smoothingAlpha: Double = DEFAULT_SMOOTHING_ALPHA
  // Last raw quality from the OS, before the interference downgrade is
  // applied. Used to re-derive `lastQuality` when interference toggles.
  @Volatile private var lastRawQuality: AccuracyQuality? = null
  // Snapshot of `lastRawQuality` at the moment interference *started*.
  // The OS magnetometer accuracy bucket can stay at LOW/UNRELIABLE for
  // many seconds after a magnet event (it only refreshes when the user
  // moves the phone enough to recalibrate), but the underlying
  // calibration didn't actually change — the field is back in the
  // Earth band, so the heading is trustworthy. Restoring this snapshot
  // when interference clears lets the calibration banner auto-dismiss
  // without forcing the user to perform a motion or tap Refresh.
  @Volatile private var preInterferenceRawQuality: AccuracyQuality? = null

  // Latest *low-pass-filtered* accelerometer + magnetometer vectors.
  // Both are needed for every heading computation; we hold a smoothed
  // version of each (input LP via INPUT_FILTER_ALPHA) and recompute
  // heading on every magnetic event. Filtering at the input — before
  // getRotationMatrix runs — kills jitter much more effectively than
  // filtering the output heading, because the rotation-matrix math
  // amplifies small input noise non-linearly.
  private val latestAccel = FloatArray(3)
  private val latestMag = FloatArray(3)
  @Volatile private var hasAccel = false
  @Volatile private var hasMag = false

  // Expected magnetic field magnitude at the user's location (µT),
  // computed from `GeomagneticField` (Android's bundled WMM2025) when
  // setLocation() is called. `-1.0` means no location has been
  // supplied — fall back to the generic 20–70 µT band for interference
  // detection.
  @Volatile private var expectedFieldUt: Double = -1.0

  // Hard-iron bias estimate from TYPE_MAGNETIC_FIELD_UNCALIBRATED.
  // Holds the *previous* event's bias so we can spot jumps; bias jumps
  // happen when the OS revises its hard-iron estimate in response to
  // a changed field environment (e.g. magnet on/off). When we're on
  // the calibrated-mag fallback (no uncalibrated sensor), `hasBias`
  // stays false and these are unused.
  private val lastBias = FloatArray(3)
  @Volatile private var hasBias = false
  @Volatile private var lastBiasJumpNs = 0L
  @Volatile private var usingUncalibratedMag = false

  private val rotationMatrix = FloatArray(9)
  private val inclinationMatrix = FloatArray(9)
  private val remappedMatrix = FloatArray(9)
  private val orientation = FloatArray(3)

  // Game-rotation-vector–derived gyro-corrected yaw. Game-RV is
  // gyro+accel only (no mag), so it's *not* poisoned by magnetic
  // events the way TYPE_ROTATION_VECTOR is. We use it as an incremental
  // yaw rate (Δyaw between events) and integrate that into
  // `fusedYawDeg`; magnetometer samples then pull `fusedYawDeg` toward
  // absolute mag-derived yaw via a small complementary blend
  // (MAG_CORRECTION_ALPHA). Net effect: heading tracks fast turns
  // smoothly via gyro, doesn't drift over time thanks to mag, and
  // sails through transient magnet events instead of freezing at
  // last-good. Old/cheap devices may lack a gyro entirely (no game-RV
  // sensor) — we silently fall back to pure mag+accel and behavior is
  // identical to the prior implementation.
  @Volatile private var fusedYawDeg: Double = Double.NaN
  @Volatile private var lastGameRvYawDeg: Double = Double.NaN
  @Volatile private var lastGameRvTimeNs: Long = 0L
  @Volatile private var lastYawRateDegPerS: Double = 0.0
  @Volatile private var hasGameRv: Boolean = false
  // True when interference just cleared and the next mag-derived yaw
  // should snap `fusedYawDeg` directly instead of slowly correcting via
  // MAG_CORRECTION_ALPHA. Without this snap, heading would lag for
  // ~1 s while the complementary filter pulled gyro-integrated truth
  // toward post-magnet truth.
  @Volatile private var seedFusedYaw: Boolean = false
  private val gameRvRotationMatrix = FloatArray(9)
  private val gameRvRemappedMatrix = FloatArray(9)
  private val gameRvOrientation = FloatArray(3)

  private val epoch = AtomicInteger(0)
  private val activityCounter = AtomicInteger(0)
  private var sensorThread: HandlerThread? = null
  private var sensorHandler: Handler? = null
  private var activeListener: SensorEventListener? = null
  private var lifecycleCallbacks: Application.ActivityLifecycleCallbacks? = null
  // Callback fields are written from the JS thread (start, setOnX) and
  // read from the sensor HandlerThread on every event. @Volatile gives
  // them a happens-before guarantee so a late-registered listener
  // becomes visible to the sensor thread on the next event.
  @Volatile private var onHeading: ((CompassSample) -> Unit)? = null
  @Volatile private var calibrationCb: ((AccuracyQuality) -> Unit)? = null
  @Volatile private var interferenceCb: ((Boolean) -> Unit)? = null

  private val watchdogHandler = Handler(Looper.getMainLooper())
  private val watchdogRunnable = object : Runnable {
    override fun run() {
      // When the app is backgrounded, the OS legitimately suspends or
      // throttles non-wake-up sensors (Doze on API 23+, background limits
      // on API 26+). Re-registering won't change that — it just burns
      // power flapping every 1.5s. Skip the staleness check and re-arm.
      val backgrounded = activityCounter.get() == 0
      val now = SystemClock.elapsedRealtimeNanos()
      val accelMagStale = lastEventNs > 0L && now - lastEventNs > STALE_THRESHOLD_NS
      // Only watchdog game-RV if we actually have it — older devices
      // without a gyro never produce game-RV events, and we shouldn't
      // re-subscribe everything just because game-RV is silent there.
      val gameRvStale = hasGameRv && lastGameRvEventNs > 0L &&
        now - lastGameRvEventNs > STALE_THRESHOLD_NS
      if (!backgrounded && (accelMagStale || gameRvStale)) {
        synchronized(this@HybridNitroCompass) {
          if (started && isSubscribed) {
            unsubscribeLocked()
            subscribeLocked()
            lastEventNs = SystemClock.elapsedRealtimeNanos()
            lastGameRvEventNs = 0L
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
      // NaN/-Inf would silently freeze heading delivery (`delta < NaN`
      // is always false, suppressing every sample). Coerce to a sane
      // default — same defensive policy as setFilter().
      filterDeg = if (filterDegrees.isFinite()) filterDegrees.coerceAtLeast(0.0) else 0.0
      this.onHeading = onHeading
      lastEmittedHeading = Double.NaN
      lastAccuracyDeg = -1.0
      lastFieldUt = -1.0
      lastSample = null
      lastQuality = null
      lastRawQuality = null

      registerLifecycleCallbacks()
      try {
        subscribeLocked()
      } catch (t: Throwable) {
        // Roll back so a later lifecycle resubscribe (onActivityStarted ->
        // handleForeground) doesn't keep re-throwing from inside Android's
        // Activity dispatch and crash the app on devices without a
        // magnetometer.
        stopLocked()
        throw t
      }
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
    if (sm.getDefaultSensor(Sensor.TYPE_ACCELEROMETER) == null) return false
    return sm.getDefaultSensor(Sensor.TYPE_MAGNETIC_FIELD_UNCALIBRATED) != null ||
      sm.getDefaultSensor(Sensor.TYPE_MAGNETIC_FIELD) != null
  }

  override fun isStarted(): Boolean = started

  override fun setFilter(degrees: Double) {
    // Reject NaN/-Inf: these compare unordered against any value, so
    // the deadband check (`delta < filterDeg`) would silently suppress
    // every sample if filterDeg became NaN.
    if (!degrees.isFinite()) return
    filterDeg = degrees.coerceAtLeast(0.0)
  }

  override fun setSmoothing(alpha: Double) {
    // Lower bound is 0.01 (not 0): at α=0 the EMA never updates, so
    // `smoothedSin/Cos` would freeze at the first sample and the
    // surfaced heading would never move — a footgun if a caller
    // computes a small alpha and accidentally rounds to zero.
    if (!alpha.isFinite()) return
    smoothingAlpha = alpha.coerceIn(0.01, 1.0)
  }

  override fun getDiagnostics(): SensorDiagnostics? {
    val sm = NitroModules.applicationContext?.getSystemService(Context.SENSOR_SERVICE) as? SensorManager
      ?: return null
    if (sm.getDefaultSensor(Sensor.TYPE_ACCELEROMETER) == null) return null
    val hasMagSensor = sm.getDefaultSensor(Sensor.TYPE_MAGNETIC_FIELD_UNCALIBRATED) != null ||
      sm.getDefaultSensor(Sensor.TYPE_MAGNETIC_FIELD) != null
    if (!hasMagSensor) return null
    return SensorDiagnostics(SensorKind.MAGNETOMETER)
  }

  override fun getDebugInfo(): DebugInfo {
    val msSinceJump = if (lastBiasJumpNs > 0L) {
      (SystemClock.elapsedRealtimeNanos() - lastBiasJumpNs) / 1_000_000.0
    } else {
      -1.0
    }
    return DebugInfo(
      interferenceActive = lastInterference == true,
      msSinceLastBiasJump = msSinceJump,
      expectedFieldMicroTesla = expectedFieldUt,
      lastFieldMicroTesla = lastFieldUt,
      fusedYawDeg = fusedYawDeg,
      lastYawRateDegPerS = lastYawRateDegPerS,
      hasGameRotationVector = hasGameRv,
      usingUncalibratedMag = usingUncalibratedMag
    )
  }

  override fun getCurrentHeading(): CompassSample? = lastSample

  override fun setDeclination(degrees: Double) {
    // NaN propagates through the emit math (heading + declinationDeg)
    // and would poison every emission until reset.
    if (!degrees.isFinite()) return
    declinationDeg = degrees
  }

  override fun setLocation(latitude: Double, longitude: Double) {
    val invalid = latitude.isNaN() || longitude.isNaN() ||
      abs(latitude) > 90.0 || abs(longitude) > 180.0
    expectedFieldUt = if (invalid) {
      // Caller signaled "clear" — revert to the generic 20–70 µT band.
      -1.0
    } else {
      // GeomagneticField returns nT; we work in µT throughout the rest
      // of the file, so divide. Altitude defaults to 0 m — its effect
      // is < 0.03 % per km, well inside the ±15 µT tolerance.
      val gf = GeomagneticField(
        latitude.toFloat(),
        longitude.toFloat(),
        0f,
        System.currentTimeMillis()
      )
      gf.fieldStrength.toDouble() / 1000.0
    }
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

  override fun recalibrate() {
    synchronized(this) {
      if (!started) return
      // Re-register the sensor listeners. On many Android OEMs the
      // unregister/register cycle nudges the magnetometer driver into
      // re-evaluating soft/hard-iron calibration, which can unstick an
      // UNRELIABLE bucket that's lingering after a strong field
      // excursion. At minimum it gives the consumer a deterministic
      // "try again" button.
      val wasSubscribed = isSubscribed
      if (wasSubscribed) unsubscribeLocked()

      // Wipe everything that could carry stale state into the fresh
      // subscription. The next sensor events will reseed the input LP,
      // the output EMA, and the gyro fusion from current truth.
      lastEmittedHeading = Double.NaN
      lastAccuracyDeg = -1.0
      lastFieldUt = -1.0
      lastSample = null
      lastQuality = null
      lastRawQuality = null
      preInterferenceRawQuality = null
      lastInterference = null
      smoothedSin = Double.NaN
      smoothedCos = Double.NaN
      hasAccel = false
      hasMag = false
      hasBias = false
      lastBiasJumpNs = 0L
      fusedYawDeg = Double.NaN
      lastGameRvYawDeg = Double.NaN
      lastGameRvTimeNs = 0L
      lastYawRateDegPerS = 0.0
      hasGameRv = false
      seedFusedYaw = false

      if (wasSubscribed) subscribeLocked()
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
    preInterferenceRawQuality = null
  }

  private fun subscribeLocked() {
    if (isSubscribed) return
    val sm = context.getSystemService(Context.SENSOR_SERVICE) as? SensorManager
      ?: throw IllegalStateException("SensorManager unavailable")
    val accel = sm.getDefaultSensor(Sensor.TYPE_ACCELEROMETER)
      ?: throw IllegalStateException("No accelerometer on this device")
    // Prefer TYPE_MAGNETIC_FIELD_UNCALIBRATED — it reports the OS's
    // hard-iron bias estimate alongside raw values, so we can detect
    // bias jumps (a much more reliable interference signal than field
    // magnitude alone — catches "weak" magnet events where the
    // magnitude stays in the Earth band but the OS still revises its
    // bias). We apply the bias correction ourselves, so the heading
    // computation is identical to the calibrated path.
    val magUncal = sm.getDefaultSensor(Sensor.TYPE_MAGNETIC_FIELD_UNCALIBRATED)
    val magCal = sm.getDefaultSensor(Sensor.TYPE_MAGNETIC_FIELD)
    val mag = magUncal ?: magCal
      ?: throw IllegalStateException("No magnetometer on this device")
    usingUncalibratedMag = magUncal != null

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
        // The magnetometer's accuracy bucket is the figure-8 calibration
        // signal we want to surface. Accelerometer accuracy is rarely
        // meaningful for compass UX — ignore it. Both calibrated and
        // uncalibrated mag report the same bucket semantics, so accept
        // either.
        if (sensor.type == Sensor.TYPE_MAGNETIC_FIELD ||
          sensor.type == Sensor.TYPE_MAGNETIC_FIELD_UNCALIBRATED
        ) {
          handleMagAccuracyChanged(accuracy)
        }
      }
    }
    sm.registerListener(listener, accel, SensorManager.SENSOR_DELAY_GAME, handler)
    sm.registerListener(listener, mag, SensorManager.SENSOR_DELAY_GAME, handler)

    // Game-RV is *optional*. It's gyro+accel only (no mag), so it's
    // immune to magnetic interference and never bias-poisoned the way
    // TYPE_ROTATION_VECTOR is. Old/cheap devices may lack a gyro
    // entirely — we silently fall back to pure mag+accel and behavior
    // stays identical to the prior implementation.
    val gameRv: Sensor? = sm.getDefaultSensor(Sensor.TYPE_GAME_ROTATION_VECTOR)
    gameRv?.let {
      sm.registerListener(listener, it, SensorManager.SENSOR_DELAY_GAME, handler)
    }

    sensorThread = thread
    sensorHandler = handler
    activeListener = listener
    isSubscribed = true

    hasAccel = false
    hasMag = false
    hasBias = false
    lastBiasJumpNs = 0L
    smoothedSin = Double.NaN
    smoothedCos = Double.NaN
    fusedYawDeg = Double.NaN
    lastGameRvYawDeg = Double.NaN
    lastGameRvTimeNs = 0L
    lastYawRateDegPerS = 0.0
    hasGameRv = false
    seedFusedYaw = false
    lastEventNs = 0L
    lastGameRvEventNs = 0L
    watchdogHandler.removeCallbacks(watchdogRunnable)
    watchdogHandler.postDelayed(watchdogRunnable, WATCHDOG_PERIOD_MS)
  }

  private fun unsubscribeLocked() {
    watchdogHandler.removeCallbacks(watchdogRunnable)
    if (!isSubscribed) {
      sensorThread?.quitSafely()
      sensorThread = null
      sensorHandler = null
      activeListener = null
      return
    }
    epoch.incrementAndGet()
    val sm = NitroModules.applicationContext?.getSystemService(Context.SENSOR_SERVICE) as? SensorManager
    activeListener?.let { sm?.unregisterListener(it) }
    activeListener = null
    sensorHandler = null
    sensorThread?.quitSafely()
    sensorThread = null
    isSubscribed = false
  }

  private fun registerLifecycleCallbacks() {
    if (lifecycleCallbacks != null) return
    val app = NitroModules.applicationContext?.applicationContext as? Application ?: return
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
        try {
          subscribeLocked()
        } catch (_: Throwable) {
          // Never throw from an Activity lifecycle callback — would crash
          // the host app. If the sensor is unavailable, stay unsubscribed.
          stopLocked()
        }
      }
    }
  }

  private fun handleSensorEvent(event: SensorEvent) {
    when (event.sensor.type) {
      Sensor.TYPE_ACCELEROMETER -> {
        if (!event.values[0].isFinite() || !event.values[1].isFinite() ||
          !event.values[2].isFinite()
        ) return
        if (!hasAccel) {
          // Seed with the first sample to avoid an artificial ramp-up
          // from zero, which would skew the orientation calc for
          // ~1 second after subscription.
          latestAccel[0] = event.values[0]
          latestAccel[1] = event.values[1]
          latestAccel[2] = event.values[2]
        } else {
          val a = adaptiveInputAlpha(INPUT_FILTER_ALPHA_ACCEL_STILL, INPUT_FILTER_ALPHA_ACCEL_FAST)
          latestAccel[0] = a * event.values[0] + (1f - a) * latestAccel[0]
          latestAccel[1] = a * event.values[1] + (1f - a) * latestAccel[1]
          latestAccel[2] = a * event.values[2] + (1f - a) * latestAccel[2]
        }
        hasAccel = true
        lastEventNs = SystemClock.elapsedRealtimeNanos()
      }
      Sensor.TYPE_MAGNETIC_FIELD, Sensor.TYPE_MAGNETIC_FIELD_UNCALIBRATED -> {
        // Uncalibrated mag delivers 6 floats: raw[0..2] and the OS's
        // hard-iron bias estimate[3..5]. We apply the bias correction
        // ourselves (mathematically equivalent to the calibrated path)
        // and additionally use bias *jumps* as a separate interference
        // signal — when the OS revises its bias, the field environment
        // just changed (likely a magnet on/off), even if the corrected
        // magnitude stays in the Earth band.
        if (!event.values[0].isFinite() || !event.values[1].isFinite() ||
          !event.values[2].isFinite()
        ) return
        val correctedX: Float
        val correctedY: Float
        val correctedZ: Float
        if (event.sensor.type == Sensor.TYPE_MAGNETIC_FIELD_UNCALIBRATED) {
          val biasX = event.values[3]
          val biasY = event.values[4]
          val biasZ = event.values[5]
          if (hasBias) {
            if (abs(biasX - lastBias[0]) > BIAS_JUMP_UT ||
              abs(biasY - lastBias[1]) > BIAS_JUMP_UT ||
              abs(biasZ - lastBias[2]) > BIAS_JUMP_UT
            ) {
              lastBiasJumpNs = SystemClock.elapsedRealtimeNanos()
            }
          }
          lastBias[0] = biasX
          lastBias[1] = biasY
          lastBias[2] = biasZ
          hasBias = true
          correctedX = event.values[0] - biasX
          correctedY = event.values[1] - biasY
          correctedZ = event.values[2] - biasZ
        } else {
          // Calibrated mag — the OS already subtracted its bias estimate.
          correctedX = event.values[0]
          correctedY = event.values[1]
          correctedZ = event.values[2]
        }

        if (!hasMag) {
          latestMag[0] = correctedX
          latestMag[1] = correctedY
          latestMag[2] = correctedZ
        } else {
          val a = adaptiveInputAlpha(INPUT_FILTER_ALPHA_MAG_STILL, INPUT_FILTER_ALPHA_MAG_FAST)
          latestMag[0] = a * correctedX + (1f - a) * latestMag[0]
          latestMag[1] = a * correctedY + (1f - a) * latestMag[1]
          latestMag[2] = a * correctedZ + (1f - a) * latestMag[2]
        }
        hasMag = true
        lastEventNs = SystemClock.elapsedRealtimeNanos()

        // Use *raw* (unfiltered) corrected magnitude for the
        // interference signal so it responds instantly to spikes. The
        // LP-filtered vector is only used downstream for the heading
        // calc. Interference is OR-combined with the bias-jump signal
        // inside evaluateInterference.
        val rx = correctedX.toDouble()
        val ry = correctedY.toDouble()
        val rz = correctedZ.toDouble()
        val magnitude = sqrt(rx * rx + ry * ry + rz * rz)
        lastFieldUt = magnitude
        evaluateInterference(magnitude)

        // Recompute heading on every mag event (the limiting-rate
        // sensor). If we don't have an accelerometer reading yet, hold
        // off — we need both for getRotationMatrix.
        if (hasAccel) computeAndDeliverHeading()
      }
      Sensor.TYPE_GAME_ROTATION_VECTOR -> {
        // Game-RV is gyro+accel only. We extract a *yaw delta* between
        // events, integrate it into `fusedYawDeg`, and let mag samples
        // pull `fusedYawDeg` toward absolute truth via the small blend
        // in computeAndDeliverHeading. We track its freshness in a
        // separate `lastGameRvEventNs` (not the shared `lastEventNs`)
        // so the watchdog can detect a gyro-only freeze without being
        // suppressed by accel/mag continuing to fire.
        // Reject non-finite sensor values up-front. Some Samsung /
        // MediaTek HALs occasionally emit a single NaN sample; without
        // this guard, NaN would propagate through getRotationMatrixFromVector
        // and permanently poison `fusedYawDeg` until recalibrate().
        if (!event.values[0].isFinite() || !event.values[1].isFinite() ||
          !event.values[2].isFinite() || !event.values[3].isFinite()
        ) return
        lastGameRvEventNs = SystemClock.elapsedRealtimeNanos()
        SensorManager.getRotationMatrixFromVector(gameRvRotationMatrix, event.values)
        val (axisX, axisY) = when (currentSurfaceRotation()) {
          Surface.ROTATION_90 -> SensorManager.AXIS_Y to SensorManager.AXIS_MINUS_X
          Surface.ROTATION_180 -> SensorManager.AXIS_MINUS_X to SensorManager.AXIS_MINUS_Y
          Surface.ROTATION_270 -> SensorManager.AXIS_MINUS_Y to SensorManager.AXIS_X
          else -> SensorManager.AXIS_X to SensorManager.AXIS_Y
        }
        // remapCoordinateSystem returns false for invalid axis pairs
        // (the input matrix is left as zero-init garbage). Skip the
        // sample on failure so getOrientation() doesn't read from a
        // stale/zero matrix.
        if (!SensorManager.remapCoordinateSystem(
            gameRvRotationMatrix, axisX, axisY, gameRvRemappedMatrix
          )
        ) return
        SensorManager.getOrientation(gameRvRemappedMatrix, gameRvOrientation)
        var yawDeg = Math.toDegrees(gameRvOrientation[0].toDouble())
        if (yawDeg.isNaN()) return
        if (yawDeg < 0.0) yawDeg += 360.0

        val nowNs = SystemClock.elapsedRealtimeNanos()
        if (lastGameRvTimeNs > 0L && !lastGameRvYawDeg.isNaN()) {
          // Wrap Δyaw to (-180, 180] so a yaw transition like
          // 350°→10° produces +20° rather than -340°.
          var dYaw = yawDeg - lastGameRvYawDeg
          while (dYaw > 180.0) dYaw -= 360.0
          while (dYaw < -180.0) dYaw += 360.0
          val dtSec = (nowNs - lastGameRvTimeNs) / 1e9
          if (dtSec > 0.001) {
            // EMA the yaw rate so a single 100°/s spike on a still
            // device can't transiently weaken the input low-pass and
            // amplify steady-state jitter. α=0.3 → ~3-sample window.
            val instantaneous = dYaw / dtSec
            lastYawRateDegPerS = if (lastYawRateDegPerS == 0.0) {
              instantaneous
            } else {
              0.3 * instantaneous + 0.7 * lastYawRateDegPerS
            }
          }
          if (!fusedYawDeg.isNaN()) {
            // Integrate gyro-derived yaw rate into the fused estimate.
            val next = wrap360(fusedYawDeg + dYaw)
            // Defensive: if any prior arithmetic poisoned fusedYawDeg
            // with NaN (e.g. via a downstream mixYawCircular that read
            // NaN inputs), reseed from raw mag yaw on the next mag
            // sample by leaving fusedYawDeg as NaN here.
            fusedYawDeg = if (next.isFinite()) next else Double.NaN
          }
        }
        lastGameRvYawDeg = yawDeg
        lastGameRvTimeNs = nowNs
        hasGameRv = true
      }
      else -> Unit
    }
  }

  private fun computeAndDeliverHeading() {
    val ok = SensorManager.getRotationMatrix(
      rotationMatrix,
      inclinationMatrix,
      latestAccel,
      latestMag
    )
    // getRotationMatrix returns false in degenerate cases (e.g. accel
    // vector parallel to mag vector — extremely rare in practice).
    // Skip the sample rather than emit garbage.
    if (!ok) return

    val (axisX, axisY) = when (currentSurfaceRotation()) {
      Surface.ROTATION_90 -> SensorManager.AXIS_Y to SensorManager.AXIS_MINUS_X
      Surface.ROTATION_180 -> SensorManager.AXIS_MINUS_X to SensorManager.AXIS_MINUS_Y
      Surface.ROTATION_270 -> SensorManager.AXIS_MINUS_Y to SensorManager.AXIS_X
      else -> SensorManager.AXIS_X to SensorManager.AXIS_Y
    }
    if (!SensorManager.remapCoordinateSystem(
        rotationMatrix, axisX, axisY, remappedMatrix
      )
    ) return
    SensorManager.getOrientation(remappedMatrix, orientation)

    var magYawDeg = Math.toDegrees(orientation[0].toDouble())
    if (magYawDeg.isNaN()) return
    if (magYawDeg < 0.0) magYawDeg += 360.0

    // Drive the output from `fusedYawDeg` whenever we have a working
    // gyro stream. Mag samples *correct* the gyro-integrated estimate
    // toward absolute truth via a small complementary blend; during
    // active interference we skip the correction entirely so a magnet
    // can't pull fusion off-truth, and gyro alone carries heading
    // until the field clears. When interference has *just* cleared,
    // `seedFusedYaw` forces a one-shot snap so the user sees the new
    // truth immediately instead of lagging through the ~1 s mag-blend
    // time constant.
    val headingDeg: Double = if (!hasGameRv) {
      // No gyro available — fall back to the prior pure-mag path.
      // Keep `fusedYawDeg` seeded for the moment game-RV starts firing.
      fusedYawDeg = magYawDeg
      magYawDeg
    } else if (fusedYawDeg.isNaN() || !fusedYawDeg.isFinite() || seedFusedYaw) {
      // Either we've never seeded fusion yet, or a prior arithmetic step
      // poisoned it with NaN/Inf. Either way, snap to the current
      // mag-derived truth so a single bad sample can't permanently
      // freeze heading delivery.
      seedFusedYaw = false
      fusedYawDeg = magYawDeg
      magYawDeg
    } else if (lastInterference == true) {
      // Trust gyro alone during interference — skip the mag mix.
      fusedYawDeg
    } else {
      val mixed = mixYawCircular(fusedYawDeg, magYawDeg, MAG_CORRECTION_ALPHA)
      fusedYawDeg = if (mixed.isFinite()) mixed else magYawDeg
      fusedYawDeg
    }

    val smoothed = smoothHeading(headingDeg)

    val prev = lastEmittedHeading
    val delta = if (prev.isNaN()) Double.MAX_VALUE else shortestArc(prev, smoothed)
    if (filterDeg > 0.0 && delta < filterDeg) return
    lastEmittedHeading = smoothed

    var emitted = smoothed + declinationDeg
    emitted = ((emitted % 360.0) + 360.0) % 360.0
    val sample = CompassSample(emitted, lastAccuracyDeg, lastFieldUt)
    lastSample = sample
    onHeading?.invoke(sample)
  }

  private fun evaluateInterference(magnitude: Double) {
    // When a user location has been provided via setLocation(), the
    // interference band is centered on the WMM-derived expected field
    // strength with a tight ±LOCATION_FIELD_TOLERANCE_UT margin —
    // catches weak interference the generic 20–70 µT band misses.
    // Without a location, we fall back to the generic band that
    // covers Earth's full latitude range.
    val (minUt, maxUt) = if (expectedFieldUt > 0.0) {
      Pair(
        expectedFieldUt - LOCATION_FIELD_TOLERANCE_UT,
        expectedFieldUt + LOCATION_FIELD_TOLERANCE_UT
      )
    } else {
      Pair(EARTH_FIELD_MIN_UT, EARTH_FIELD_MAX_UT)
    }
    val magnitudeOutOfBand = magnitude < minUt || magnitude > maxUt
    // A recent OS bias jump (only available on the uncalibrated mag
    // path) means the field environment shifted enough for the OS to
    // revise its hard-iron estimate. That's a reliable signal of a
    // magnet-on/off event even when the corrected magnitude stays in
    // the Earth band — common when one phone is placed on top of
    // another. We hold this gate true for BIAS_JUMP_GRACE_NS after
    // the most recent jump, then let it fall back to magnitude alone.
    val biasJumpRecent = lastBiasJumpNs > 0L &&
      (SystemClock.elapsedRealtimeNanos() - lastBiasJumpNs) < BIAS_JUMP_GRACE_NS
    val isInterference = magnitudeOutOfBand || biasJumpRecent
    val previous = lastInterference
    if (previous == isInterference) return
    lastInterference = isInterference
    interferenceCb?.invoke(isInterference)

    if (previous != true && isInterference) {
      // Interference just started — snapshot the raw quality so we
      // can restore it when the field clears. The OS will likely
      // downgrade the bucket while the magnet is present; that
      // downgrade reflects the *symptom*, not a real change in
      // calibration state.
      preInterferenceRawQuality = lastRawQuality
    }

    // When interference clears, the EMA on (sin θ, cos θ) is still
    // weighted with magnet-influenced samples from the last few
    // hundred ms. Resetting it forces the next emission to snap to the
    // current (post-magnet) truth instead of dragging the bad average
    // forward. Same for the input LP — a magnet pulls the magnetometer
    // far enough that the LP needs many samples to forget it.
    //
    // `seedFusedYaw` makes the next mag-derived yaw replace the
    // gyro-integrated `fusedYawDeg` outright, instead of correcting
    // it via the slow ~1 s complementary blend. Without this snap the
    // user sees a visible lag while the blend pulls fusion toward the
    // post-magnet truth.
    //
    // We also restore the pre-interference quality bucket. Without this,
    // the OS's lazy refresh leaves the bucket at UNRELIABLE long after
    // the field is back in the Earth band, so the calibration banner
    // hangs even though the heading is correct. If we have no snapshot
    // (interference fired before the OS ever reported a bucket), we
    // default to MEDIUM — a usable heading that doesn't trigger the
    // calibration banner. The OS will downgrade us via
    // onAccuracyChanged if it actually disagrees.
    if (previous == true && !isInterference) {
      smoothedSin = Double.NaN
      smoothedCos = Double.NaN
      hasMag = false
      lastEmittedHeading = Double.NaN
      seedFusedYaw = true
      lastRawQuality = preInterferenceRawQuality ?: AccuracyQuality.MEDIUM
      preInterferenceRawQuality = null
    }

    // Pump the (possibly restored) raw quality back through
    // fireCalibration so the interference-aware downgrade is applied
    // on the way in, and the post-clear restore propagates out.
    lastRawQuality?.let { fireCalibration(it) }
    refreshSyntheticAccuracy()
  }

  private fun handleMagAccuracyChanged(accuracy: Int) {
    val quality = when (accuracy) {
      SensorManager.SENSOR_STATUS_ACCURACY_HIGH -> AccuracyQuality.HIGH
      SensorManager.SENSOR_STATUS_ACCURACY_MEDIUM -> AccuracyQuality.MEDIUM
      SensorManager.SENSOR_STATUS_ACCURACY_LOW -> AccuracyQuality.LOW
      else -> AccuracyQuality.UNRELIABLE
    }
    fireCalibration(quality)
    refreshSyntheticAccuracy()
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

  private fun degreesFor(quality: AccuracyQuality): Double = when (quality) {
    AccuracyQuality.HIGH -> 5.0
    AccuracyQuality.MEDIUM -> 15.0
    AccuracyQuality.LOW -> 30.0
    AccuracyQuality.UNRELIABLE -> -1.0
  }

  // Magnetic interference is a separate signal from magnetometer
  // calibration — accel can keep its bucket "HIGH" even while the field
  // is being skewed by external metal/electronics. Reporting
  // `quality=high` while `interfering=true` is contradictory UX, so we
  // downgrade the surfaced bucket by one notch when interference is
  // currently detected.
  private fun effectiveQuality(raw: AccuracyQuality): AccuracyQuality {
    if (lastInterference != true) return raw
    return when (raw) {
      AccuracyQuality.HIGH -> AccuracyQuality.MEDIUM
      AccuracyQuality.MEDIUM -> AccuracyQuality.LOW
      AccuracyQuality.LOW -> AccuracyQuality.UNRELIABLE
      AccuracyQuality.UNRELIABLE -> AccuracyQuality.UNRELIABLE
    }
  }

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
    // gives the wrong rotation.
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

  // Wrap a degree value into [0, 360).
  private fun wrap360(deg: Double): Double {
    val m = deg % 360.0
    return if (m < 0.0) m + 360.0 else m
  }

  // Linear-interpolate `a` towards `b` on the circle by `t ∈ [0, 1]`.
  // Operates on (sin, cos) so it correctly handles the 0/360°
  // wraparound (e.g. blending 350° and 10° produces 0°, not 180°).
  // Equivalent to a 2-sample SLERP at this precision.
  private fun mixYawCircular(a: Double, b: Double, t: Double): Double {
    val ar = Math.toRadians(a)
    val br = Math.toRadians(b)
    val sa = Math.sin(ar); val ca = Math.cos(ar)
    val sb = Math.sin(br); val cb = Math.cos(br)
    val s = (1.0 - t) * sa + t * sb
    val c = (1.0 - t) * ca + t * cb
    var deg = Math.toDegrees(Math.atan2(s, c))
    if (deg < 0.0) deg += 360.0
    return deg
  }

  // Linearly interpolate the input low-pass α between `still` (slow
  // smoothing) and `fast` (light smoothing) based on the gyro-derived
  // yaw rate. Stationary device → strong filter (kills jitter); rapid
  // turn → weak filter (avoids lag). Falls back to the `still` value
  // when the gyro hasn't reported yet.
  private fun adaptiveInputAlpha(still: Float, fast: Float): Float {
    if (!hasGameRv) return still
    val rate = abs(lastYawRateDegPerS)
    if (rate <= YAW_RATE_STILL_DEG_S) return still
    if (rate >= YAW_RATE_FAST_DEG_S) return fast
    val t = ((rate - YAW_RATE_STILL_DEG_S) / (YAW_RATE_FAST_DEG_S - YAW_RATE_STILL_DEG_S)).toFloat()
    return still + t * (fast - still)
  }
}
