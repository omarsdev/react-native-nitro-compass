import type { HybridObject } from 'react-native-nitro-modules'

/**
 * One compass heading sample, delivered to the JS callback registered with
 * `start()`. Both fields are in degrees.
 *
 * - `heading`: magnetic heading clockwise from north, in `[0, 360)`. Apply
 *   your own declination if you need true north.
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
}
