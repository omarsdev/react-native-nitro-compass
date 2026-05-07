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
 * Identifies which underlying sensor / framework is producing headings.
 *
 * - `rotationVector` — Android `Sensor.TYPE_ROTATION_VECTOR` (gyro + accel
 *   + magnetometer fused). Best quality.
 * - `geomagneticRotationVector` — Android
 *   `Sensor.TYPE_GEOMAGNETIC_ROTATION_VECTOR` (accel + magnetometer only).
 *   Used as fallback on gyroless / budget devices; lower update rate and
 *   more susceptible to magnetic interference.
 * - `coreLocation` — iOS `CLLocationManager` heading. Apple's stack
 *   handles fusion natively.
 */
export type SensorKind =
  | 'rotationVector'
  | 'geomagneticRotationVector'
  | 'coreLocation'

export interface SensorDiagnostics {
  sensor: SensorKind
}

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
   * Begin emitting heading samples to `onHeading`. If `start()` has already
   * been called without a matching `stop()`, the previous subscription is
   * silently torn down and replaced — the old `onHeading` is detached.
   *
   * @param filterDegrees Minimum change (in degrees) between samples before
   *   the next one is emitted. Pass `0` for "every event"; typical UI values
   *   are 1–3. Use `setFilter()` to update without restarting.
   * @param onHeading JS callback invoked on each accepted sample. Called on
   *   the JS thread; calling `stop()` from inside this callback is safe.
   */
  start(filterDegrees: number, onHeading: (sample: CompassSample) => void): void

  /** Stop the underlying sensor / location-manager subscription. Idempotent — safe to call when not started. */
  stop(): void

  /** Whether `start()` has been called without a matching `stop()`. */
  isStarted(): boolean

  /**
   * Update the deadband filter live without tearing down the subscription.
   * Same semantics as the `filterDegrees` argument to `start()`. Has no
   * effect until `start()` is called.
   */
  setFilter(degrees: number): void

  /**
   * Describe which underlying sensor / framework would produce headings on
   * this device. Returns `undefined` if the device has no compass hardware
   * (equivalent to `hasCompass() === false`). Safe to call before `start()`.
   */
  getDiagnostics(): SensorDiagnostics | undefined

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

  /**
   * Register a callback fired when external magnetic interference is
   * detected — typical sources are laptops, monitors, car engines, and
   * large steel structures, all of which can skew heading by tens of
   * degrees while the calibration bucket still reads `'medium'` or
   * better. Fires `true` when the raw magnetic field magnitude leaves
   * the normal Earth band (~20–70 µT) and `false` when it returns.
   * Only transitions are reported; the callback is debounce-free, so
   * brief excursions still fire.
   *
   * Replaces any previously registered callback. Pass a no-op to mute.
   * The callback is invoked on the JS thread. Only meaningful while
   * `start()` is active.
   *
   * iOS uses raw (uncalibrated) magnetometer data via CoreMotion, which
   * includes some device-internal bias; the transition behaviour
   * matches Android's `Sensor.TYPE_MAGNETIC_FIELD`, but absolute
   * magnitudes can differ by a few µT.
   */
  setOnInterferenceDetected(onChange: (interferenceDetected: boolean) => void): void

  /**
   * Toggle automatic pause/resume on app background/foreground. Default
   * `true`. When enabled, the underlying sensor / location-manager
   * subscription is silently paused while the app is backgrounded and
   * resumed when it returns to the foreground; the JS callback and
   * declination are preserved across the pause. Call before or after
   * `start()`; takes effect immediately.
   */
  setPauseOnBackground(enabled: boolean): void
}
