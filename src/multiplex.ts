/**
 * JS-side fan-out so multiple consumers can subscribe to the same
 * compass stream without clobbering each other. The native API is
 * single-callback by design (start, setOnCalibrationNeeded,
 * setOnInterferenceDetected each own one slot); these helpers wrap
 * that into multi-listener primitives with reference-counted
 * lifecycle.
 *
 * Mixing direct `NitroCompass.start()` / `setOnCalibrationNeeded()` /
 * `setOnInterferenceDetected()` calls with these helpers will
 * clobber the multiplex's internal callback slot — pick one path.
 */
import type {
  AccuracyQuality,
  CompassSample,
} from './specs/NitroCompass.nitro'
import { NitroCompass } from './native'

type HeadingListener = (sample: CompassSample) => void
type CalibrationListener = (quality: AccuracyQuality) => void
type InterferenceListener = (interferenceDetected: boolean) => void

const headingListeners = new Set<HeadingListener>()
const calibrationListeners = new Set<CalibrationListener>()
const interferenceListeners = new Set<InterferenceListener>()

let calibrationRegistered = false
let interferenceRegistered = false

const DEFAULT_FILTER_DEG = 1

function dispatchHeading(sample: CompassSample) {
  for (const cb of Array.from(headingListeners)) {
    try {
      cb(sample)
    } catch (e) {
      console.error('[NitroCompass] heading listener threw:', e)
    }
  }
}

function dispatchCalibration(quality: AccuracyQuality) {
  for (const cb of Array.from(calibrationListeners)) {
    try {
      cb(quality)
    } catch (e) {
      console.error('[NitroCompass] calibration listener threw:', e)
    }
  }
}

function dispatchInterference(detected: boolean) {
  for (const cb of Array.from(interferenceListeners)) {
    try {
      cb(detected)
    } catch (e) {
      console.error('[NitroCompass] interference listener threw:', e)
    }
  }
}

/**
 * Subscribe to heading samples. The first listener implicitly calls
 * `NitroCompass.start()`; the last `unsubscribe()` calls
 * `NitroCompass.stop()`. Returns the unsubscribe function.
 *
 * Filter, declination, and pauseOnBackground remain global state on
 * `NitroCompass` and are shared across all listeners — call
 * `NitroCompass.setFilter()` etc. directly to tune them.
 */
export function addHeadingListener(cb: HeadingListener): () => void {
  const wasEmpty = headingListeners.size === 0
  headingListeners.add(cb)
  if (wasEmpty) {
    NitroCompass.start(DEFAULT_FILTER_DEG, dispatchHeading)
  }
  return () => {
    if (!headingListeners.delete(cb)) return
    if (headingListeners.size === 0) {
      NitroCompass.stop()
    }
  }
}

// Module-level no-op kept stable so we can swap it back into the native
// callback slot when the last listener leaves — releasing references
// to old dispatcher closures, which matters when the JS module is
// re-evaluated (Metro Fast Refresh, jest module reset).
const NOOP_CALIBRATION = (_: AccuracyQuality) => {}
const NOOP_INTERFERENCE = (_: boolean) => {}

/**
 * Subscribe to calibration-bucket transitions. Only fires while a
 * heading subscription is active. Returns the unsubscribe function.
 */
export function addCalibrationListener(
  cb: CalibrationListener
): () => void {
  if (!calibrationRegistered) {
    NitroCompass.setOnCalibrationNeeded(dispatchCalibration)
    calibrationRegistered = true
  }
  calibrationListeners.add(cb)
  return () => {
    if (!calibrationListeners.delete(cb)) return
    if (calibrationListeners.size === 0) {
      // Detach our dispatcher from the native side. Without this, a
      // module reload (Metro Fast Refresh, jest resetModules) leaves
      // the old dispatcher pinned in native memory while a new module
      // load installs a *second* dispatcher pointing at a fresh
      // listener Set — splitting events between the two and silently
      // dropping the now-orphaned listeners.
      NitroCompass.setOnCalibrationNeeded(NOOP_CALIBRATION)
      calibrationRegistered = false
    }
  }
}

/**
 * Subscribe to magnetic-interference transitions. Only fires while a
 * heading subscription is active. Returns the unsubscribe function.
 */
export function addInterferenceListener(
  cb: InterferenceListener
): () => void {
  if (!interferenceRegistered) {
    NitroCompass.setOnInterferenceDetected(dispatchInterference)
    interferenceRegistered = true
  }
  interferenceListeners.add(cb)
  return () => {
    if (!interferenceListeners.delete(cb)) return
    if (interferenceListeners.size === 0) {
      NitroCompass.setOnInterferenceDetected(NOOP_INTERFERENCE)
      interferenceRegistered = false
    }
  }
}
