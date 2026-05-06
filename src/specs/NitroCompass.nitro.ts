import type { HybridObject } from 'react-native-nitro-modules'

/**
 * One compass heading sample, delivered to the JS callback registered with
 * `start()`. Both fields are in degrees.
 *
 * - `heading`: heading clockwise from north, in `[0, 360)`. Magnetic by
 *   default; if you call `setDeclination(deg)` the offset is applied
 *   natively before this sample is delivered (and reflected in
 *   `getCurrentHeading()`).
 * - `accuracy`: estimated heading uncertainty in degrees, or `-1` when the
 *   platform has not yet reported a usable accuracy. Smaller is better.
 *   On Android this is read from `event.values[4]` of the rotation-vector
 *   sensor when available, otherwise mapped from `SensorManager.SENSOR_STATUS_*`.
 *   On iOS this is `CLHeading.headingAccuracy`.
 */
export interface CompassSample {
  heading: number
  accuracy: number
}

/**
 * Coarse calibration bucket reported via `setOnCalibrationNeeded`. Buckets
 * are derived from numeric heading accuracy on both platforms (same
 * thresholds), so values agree across iOS and Android:
 *
 *   `<5°` → `high`, `<15°` → `medium`, `<30°` → `low`, otherwise `unreliable`.
 *
 * On iOS `unreliable` is also reported when the system asks to display
 * its built-in calibration UI (we suppress it).
 */
export type AccuracyQuality = 'high' | 'medium' | 'low' | 'unreliable'

/**
 * Native compass module. Pull this from `NitroModules.createHybridObject`
 * via the bundled `NitroCompass` export, e.g.:
 *
 * ```ts
 * import { NitroCompass } from 'react-native-nitro-compass'
 *
 * NitroCompass.start(1, ({ heading, accuracy }) => {
 *   console.log(heading, accuracy)
 * })
 * NitroCompass.stop()
 * ```
 */
export interface NitroCompass extends HybridObject<{ ios: 'swift'; android: 'kotlin' }> {
  /**
   * Begin emitting heading samples to `onHeading`.
   *
   * @param filterDegrees Minimum change (in degrees) between samples before
   *   the next one is emitted. Pass `0` for "every event"; typical UI values
   *   are 1–3.
   * @param onHeading JS callback invoked on each accepted sample. Called on
   *   the JS thread.
   */
  start(filterDegrees: number, onHeading: (sample: CompassSample) => void): void

  /** Stop the underlying sensor / location-manager subscription. */
  stop(): void

  /**
   * Whether the device has the hardware required for a compass reading.
   * Android: a rotation-vector sensor (fused or geomagnetic) is present.
   * iOS: `CLLocationManager.headingAvailable()`.
   */
  hasCompass(): boolean

  /**
   * Last sample emitted by the active subscription, with declination
   * already applied. Returns `undefined` when not started, or when started
   * but no sample has arrived yet.
   */
  getCurrentHeading(): CompassSample | undefined

  /**
   * Magnetic-to-true offset (degrees, signed) added to every heading
   * before it leaves the native side. Pass `0` to revert to magnetic.
   * Survives across `start`/`stop`. Apply your own declination from a
   * model like `geomagnetism` keyed on the user's lat/lon.
   */
  setDeclination(degrees: number): void

  /**
   * Register a callback fired when the calibration bucket transitions.
   * Replaces any previously registered callback. Pass a no-op to mute.
   * The callback is invoked on the JS thread.
   */
  setOnCalibrationNeeded(onChange: (quality: AccuracyQuality) => void): void
}
