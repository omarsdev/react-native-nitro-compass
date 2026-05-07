import type { HybridObject } from 'react-native-nitro-modules'

/**
 * One compass heading sample, delivered to the JS callback registered with
 * `start()`. Angular fields are in degrees; field strength is in microtesla.
 *
 * - `heading`: heading clockwise from north, in `[0, 360)`. Magnetic by
 *   default; if you call `setDeclination(deg)` the offset is applied
 *   natively before this sample is delivered (and reflected in
 *   `getCurrentHeading()`).
 * - `accuracy`: estimated heading uncertainty in degrees, or `-1` when the
 *   platform has not yet reported a usable accuracy. Smaller is better.
 *   On Android, mapped from the magnetometer's `SENSOR_STATUS_*` accuracy
 *   bucket (the figure-8 calibration signal). On iOS this is
 *   `CLHeading.headingAccuracy`.
 * - `fieldStrengthMicroTesla`: magnitude of the local magnetic field in
 *   microteslas (µT), or `-1` when no reading is available yet. Earth's
 *   field is normally 25–65 µT; values well outside this band signal
 *   external interference (laptops, monitors, magnets, metal). Useful
 *   for rendering a "strength" meter à la consumer compass apps.
 */
export interface CompassSample {
  heading: number
  accuracy: number
  fieldStrengthMicroTesla: number
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
 * - `magnetometer` — Android raw `TYPE_MAGNETIC_FIELD` + `TYPE_ACCELEROMETER`
 *   computed via `SensorManager.getRotationMatrix()` + `getOrientation()`.
 *   Stateless: snaps back instantly when external interference (magnets,
 *   electronics) is removed, instead of waiting for OS-level fusion to
 *   re-converge.
 * - `coreLocation` — iOS `CLLocationManager` heading. Apple's stack
 *   handles fusion natively.
 * - `rotationVector` / `geomagneticRotationVector` — legacy values kept
 *   in the union for source compatibility; no longer returned by current
 *   builds.
 */
export type SensorKind =
  | 'magnetometer'
  | 'coreLocation'
  | 'rotationVector'
  | 'geomagneticRotationVector'

export interface SensorDiagnostics {
  sensor: SensorKind
}

/**
 * Live introspection of the native compass pipeline. Use for
 * diagnosing user-reported issues (heading wrong, banner stuck,
 * compass frozen) — none of these fields are needed for normal
 * operation.
 *
 * Numeric fields use `-1` (or `NaN` for `fusedYawDeg`) as a
 * "not-applicable / not-yet-available" sentinel; consumers should
 * treat those as missing rather than literal values. Most fields
 * are Android-only — iOS uses `CLLocationManager` and doesn't expose
 * the underlying state, so the iOS implementation reports a minimal
 * subset (`lastFieldMicroTesla`, `interferenceActive`).
 */
export interface DebugInfo {
  /**
   * Whether the library currently considers external interference to
   * be active. Driven by field-magnitude band checks AND (Android,
   * uncalibrated mag only) recent OS hard-iron-bias jumps.
   */
  interferenceActive: boolean
  /**
   * Milliseconds since the most recent OS hard-iron bias jump on
   * Android's uncalibrated magnetometer. `-1` if never seen.
   * iOS / fallback path: always `-1`.
   */
  msSinceLastBiasJump: number
  /**
   * The expected magnetic field magnitude (µT) at the user's
   * location, derived from `setLocation()`. Used to tighten the
   * interference band. `-1` if `setLocation()` hasn't been called
   * with valid coordinates.
   */
  expectedFieldMicroTesla: number
  /**
   * Most recent measured field magnitude (µT) — same value surfaced
   * on `CompassSample.fieldStrengthMicroTesla`. `-1` if no reading.
   */
  lastFieldMicroTesla: number
  /**
   * Current value of the gyro-corrected fused yaw (deg, [0, 360)).
   * `NaN` before any sample has been processed, or on iOS where
   * gyro fusion is handled inside CLLocationManager.
   */
  fusedYawDeg: number
  /**
   * Latest yaw rate (deg/s) derived from game-rotation-vector
   * deltas. Used to drive the adaptive input low-pass filter.
   * `0` if game-RV is unavailable / hasn't fired yet.
   */
  lastYawRateDegPerS: number
  /** Whether `TYPE_GAME_ROTATION_VECTOR` is currently producing events. Always `false` on iOS. */
  hasGameRotationVector: boolean
  /**
   * Whether Android is sourcing magnetometer data from
   * `TYPE_MAGNETIC_FIELD_UNCALIBRATED` (preferred — bias-jump
   * detection works) vs. the `TYPE_MAGNETIC_FIELD` fallback. Always
   * `false` on iOS.
   */
  usingUncalibratedMag: boolean
}

/**
 * Platform permission state required to deliver headings.
 *
 * - `granted` — headings will deliver. iOS: `authorizedAlways` /
 *   `authorizedWhenInUse`. Android: always (sensors require no permission).
 * - `denied` — user has refused or the OS has restricted access (e.g.
 *   parental controls). On iOS, `start()` will throw with this status.
 * - `unknown` — iOS `notDetermined`: nothing has been asked yet. Calling
 *   `requestPermission()` is the way to resolve from `unknown` to
 *   `granted`/`denied`.
 */
export type PermissionStatus = 'granted' | 'denied' | 'unknown'

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
   * Set the low-pass smoothing factor (EMA α) applied to heading samples
   * before delivery. Range `(0, 1]`. Default `0.2` ≈ 100ms time constant
   * at Android's typical 50 Hz sample rate.
   *
   * - `1.0` disables smoothing (every sample passes through unfiltered).
   * - Smaller values smooth more — eliminates rotation-vector jitter at
   *   the cost of a small amount of latency.
   *
   * Implemented as a circular EMA on `(sin θ, cos θ)` so the 359°→0°
   * wraparound doesn't bias the average. Survives `start`/`stop`.
   *
   * **No-op on iOS.** `CLLocationManager` filters heading internally with
   * Apple's own algorithm; layering EMA on top would only add latency.
   */
  setSmoothing(alpha: number): void

  /**
   * Describe which underlying sensor / framework would produce headings on
   * this device. Returns `undefined` if the device has no compass hardware
   * (equivalent to `hasCompass() === false`). Safe to call before `start()`.
   */
  getDiagnostics(): SensorDiagnostics | undefined

  /**
   * Snapshot of the internal compass pipeline. Only intended for
   * diagnosing user-reported issues — see {@link DebugInfo} for
   * field-by-field semantics. Cheap to call (no allocations beyond
   * the returned object); poll at any rate the host UI prefers.
   */
  getDebugInfo(): DebugInfo

  /**
   * Whether the device has the hardware required for a compass reading.
   * Android: both a magnetometer and an accelerometer are present.
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
   * Set the user's geographic location for a tighter interference
   * gate. With a valid location, the library replaces the generic
   * 20–70 µT "Earth field band" with `expectedField ± 15 µT`, where
   * `expectedField` comes from the WMM2025 model shipped on Android
   * (`GeomagneticField`). This catches weak interference the generic
   * band misses — especially at high/low latitudes where Earth's
   * field is naturally near or above 60 µT.
   *
   * Pass `NaN` for either coordinate, or values outside the valid
   * range (`|lat| > 90`, `|lon| > 180`), to revert to the generic
   * band. Survives across `start`/`stop`.
   *
   * **No-op on iOS.** `CLLocationManager` uses GPS-derived location
   * internally for all field-related reasoning; layering our own
   * lookup on top would be redundant.
   */
  setLocation(latitude: number, longitude: number): void

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
   * iOS uses `CMDeviceMotion.magneticField` — the calibrated field
   * with the device's own hard-iron bias subtracted in real time.
   * No transitions are reported until CoreMotion's bias estimate
   * converges (a second or two of normal device movement); that's
   * required, otherwise raw readings dominated by internal bias
   * would fire false alarms continuously.
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

  /**
   * Force a best-effort sensor recalibration. Resets internal smoothing
   * and quality-bucket state, then re-registers the underlying sensor
   * listeners. On many Android OEMs the re-registration nudges the
   * magnetometer driver to re-evaluate soft/hard-iron calibration, which
   * unsticks an `UNRELIABLE` bucket that's lingering after a strong
   * magnetic excursion (e.g. another phone placed on top, then removed).
   *
   * On iOS this dismisses the system heading-calibration overlay and
   * stops/restarts heading updates. Apple's stack handles the
   * underlying calibration internally.
   *
   * Idempotent — safe to call when not started, in which case it's a
   * no-op. Calibration recovery still requires the user to move the
   * device through varying orientations; this method just clears the
   * library's cached state so progress is reflected promptly.
   */
  recalibrate(): void

  /**
   * Read the current platform permission state synchronously.
   * On Android this is always `'granted'` (sensors require no permission);
   * on iOS it maps `CLLocationManager.authorizationStatus`.
   */
  getPermissionStatus(): PermissionStatus

  /**
   * Request the platform permission required to deliver headings. On iOS
   * this prompts the system "Allow location" dialog if the status is
   * `'unknown'` and resolves once the user makes a choice. If already
   * `'granted'` or `'denied'` it resolves immediately with that value
   * (iOS does not re-prompt). On Android it resolves immediately with
   * `'granted'`.
   */
  requestPermission(): Promise<PermissionStatus>
}
