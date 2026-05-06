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
class HybridNitroCompass : HybridNitroCompassSpec(), SensorEventListener {

  @Volatile private var filterDeg: Double = 1.0
  @Volatile private var lastEmittedHeading: Double = Double.NaN
  @Volatile private var lastAccuracyDeg: Double = -1.0

  private val rotationMatrix = FloatArray(16)
  private val remappedMatrix = FloatArray(16)
  private val orientation = FloatArray(3)

  private var sensorThread: HandlerThread? = null
  private var sensorHandler: Handler? = null
  private var activeSensor: Sensor? = null
  private var onHeading: ((CompassSample) -> Unit)? = null

  private val context: Context
    get() = NitroModules.applicationContext
      ?: throw IllegalStateException("NitroModules.applicationContext is null — was Nitro installed?")

  override fun start(filterDegrees: Double, onHeading: (sample: CompassSample) -> Unit) {
    stop()
    filterDeg = filterDegrees.coerceAtLeast(0.0)
    this.onHeading = onHeading

    val sm = context.getSystemService(Context.SENSOR_SERVICE) as? SensorManager
      ?: throw IllegalStateException("SensorManager unavailable")

    val sensor = sm.getDefaultSensor(Sensor.TYPE_ROTATION_VECTOR)
      ?: sm.getDefaultSensor(Sensor.TYPE_GEOMAGNETIC_ROTATION_VECTOR)
      ?: throw IllegalStateException("No rotation sensor on this device")

    val thread = HandlerThread("NitroCompass-Sensor").also { it.start() }
    val handler = Handler(thread.looper)
    sm.registerListener(this, sensor, SensorManager.SENSOR_DELAY_GAME, handler)

    sensorThread = thread
    sensorHandler = handler
    activeSensor = sensor
    lastEmittedHeading = Double.NaN
    lastAccuracyDeg = -1.0
  }

  override fun stop() {
    val sm = NitroModules.applicationContext?.getSystemService(Context.SENSOR_SERVICE) as? SensorManager
    sm?.unregisterListener(this)
    activeSensor = null
    sensorHandler = null
    sensorThread?.quitSafely()
    sensorThread = null
    onHeading = null
  }

  override fun hasCompass(): Boolean {
    val sm = NitroModules.applicationContext?.getSystemService(Context.SENSOR_SERVICE) as? SensorManager
      ?: return false
    return sm.getDefaultSensor(Sensor.TYPE_ROTATION_VECTOR) != null ||
      sm.getDefaultSensor(Sensor.TYPE_GEOMAGNETIC_ROTATION_VECTOR) != null
  }

  override fun onSensorChanged(event: SensorEvent) {
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
      lastAccuracyDeg = Math.toDegrees(event.values[4].toDouble())
    }

    val prev = lastEmittedHeading
    val delta = if (prev.isNaN()) Double.MAX_VALUE else shortestArc(prev, heading)
    if (delta < filterDeg) return
    lastEmittedHeading = heading

    onHeading?.invoke(CompassSample(heading, lastAccuracyDeg))
  }

  override fun onAccuracyChanged(sensor: Sensor, accuracy: Int) {
    if (lastAccuracyDeg < 0.0) {
      lastAccuracyDeg = when (accuracy) {
        SensorManager.SENSOR_STATUS_ACCURACY_HIGH -> 5.0
        SensorManager.SENSOR_STATUS_ACCURACY_MEDIUM -> 15.0
        SensorManager.SENSOR_STATUS_ACCURACY_LOW -> 30.0
        else -> -1.0
      }
    }
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
