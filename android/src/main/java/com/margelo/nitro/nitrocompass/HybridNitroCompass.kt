package com.margelo.nitro.nitrocompass

import android.content.Context
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.os.Build
import android.os.Handler
import android.os.HandlerThread
import android.view.Surface
import android.view.WindowManager
import androidx.annotation.Keep
import com.facebook.proguard.annotations.DoNotStrip
import com.margelo.nitro.NitroModules
import java.util.concurrent.atomic.AtomicInteger
import kotlin.math.abs

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

  @Volatile private var filterDeg: Double = 1.0
  @Volatile private var lastEmittedHeading: Double = Double.NaN
  @Volatile private var lastAccuracyDeg: Double = -1.0
  @Volatile private var lastSample: CompassSample? = null
  @Volatile private var lastQuality: AccuracyQuality? = null
  @Volatile private var declinationDeg: Double = 0.0

  private val rotationMatrix = FloatArray(16)
  private val remappedMatrix = FloatArray(16)
  private val orientation = FloatArray(3)

  private val epoch = AtomicInteger(0)
  private var sensorThread: HandlerThread? = null
  private var sensorHandler: Handler? = null
  private var activeSensor: Sensor? = null
  private var activeListener: SensorEventListener? = null
  private var onHeading: ((CompassSample) -> Unit)? = null
  private var calibrationCb: ((AccuracyQuality) -> Unit)? = null

  private val context: Context
    get() = NitroModules.applicationContext
      ?: throw IllegalStateException("NitroModules.applicationContext is null — was Nitro installed?")

  override fun start(filterDegrees: Double, onHeading: (sample: CompassSample) -> Unit) {
    synchronized(this) {
      stopLocked()
      val myEpoch = epoch.incrementAndGet()
      filterDeg = filterDegrees.coerceAtLeast(0.0)
      this.onHeading = onHeading
      lastEmittedHeading = Double.NaN
      lastAccuracyDeg = -1.0
      lastSample = null
      lastQuality = null

      val sm = context.getSystemService(Context.SENSOR_SERVICE) as? SensorManager
        ?: throw IllegalStateException("SensorManager unavailable")

      val sensor = sm.getDefaultSensor(Sensor.TYPE_ROTATION_VECTOR)
        ?: sm.getDefaultSensor(Sensor.TYPE_GEOMAGNETIC_ROTATION_VECTOR)
        ?: throw IllegalStateException("No rotation sensor on this device")

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

      sensorThread = thread
      sensorHandler = handler
      activeSensor = sensor
      activeListener = listener
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

  override fun getCurrentHeading(): CompassSample? = lastSample

  override fun setDeclination(degrees: Double) {
    declinationDeg = degrees
  }

  override fun setOnCalibrationNeeded(onChange: (quality: AccuracyQuality) -> Unit) {
    calibrationCb = onChange
  }

  private fun stopLocked() {
    epoch.incrementAndGet()
    val sm = NitroModules.applicationContext?.getSystemService(Context.SENSOR_SERVICE) as? SensorManager
    activeListener?.let { sm?.unregisterListener(it) }
    activeListener = null
    activeSensor = null
    sensorHandler = null
    sensorThread?.quitSafely()
    sensorThread = null
    onHeading = null
    lastSample = null
    lastQuality = null
  }

  private fun handleSensorEvent(event: SensorEvent) {
    val type = event.sensor.type
    if (type != Sensor.TYPE_ROTATION_VECTOR &&
      type != Sensor.TYPE_GEOMAGNETIC_ROTATION_VECTOR
    ) return

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

    if (event.values.size > 4 && event.values[4] >= 0f) {
      val acc = Math.toDegrees(event.values[4].toDouble())
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

  private fun handleAccuracyChanged(accuracy: Int) {
    val quality = when (accuracy) {
      SensorManager.SENSOR_STATUS_ACCURACY_HIGH -> AccuracyQuality.HIGH
      SensorManager.SENSOR_STATUS_ACCURACY_MEDIUM -> AccuracyQuality.MEDIUM
      SensorManager.SENSOR_STATUS_ACCURACY_LOW -> AccuracyQuality.LOW
      else -> AccuracyQuality.UNRELIABLE
    }
    if (lastAccuracyDeg < 0.0) {
      lastAccuracyDeg = when (quality) {
        AccuracyQuality.HIGH -> 5.0
        AccuracyQuality.MEDIUM -> 15.0
        AccuracyQuality.LOW -> 30.0
        AccuracyQuality.UNRELIABLE -> -1.0
      }
    }
    fireCalibration(quality)
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

  private fun fireCalibration(quality: AccuracyQuality) {
    if (quality == lastQuality) return
    lastQuality = quality
    calibrationCb?.invoke(quality)
  }

  private fun currentSurfaceRotation(): Int {
    val ctx = NitroModules.applicationContext
    val activity = ctx?.currentActivity
    return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
      activity?.display?.rotation ?: Surface.ROTATION_0
    } else {
      @Suppress("DEPRECATION")
      (ctx?.getSystemService(Context.WINDOW_SERVICE) as? WindowManager)
        ?.defaultDisplay?.rotation ?: Surface.ROTATION_0
    }
  }

  private fun shortestArc(from: Double, to: Double): Double {
    val diff = ((to - from + 540.0) % 360.0) - 180.0
    return abs(diff)
  }
}
