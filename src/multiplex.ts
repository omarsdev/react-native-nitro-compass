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
    calibrationListeners.delete(cb)
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
    interferenceListeners.delete(cb)
  }
}
