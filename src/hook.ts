import { useEffect, useRef, useState } from 'react'
import type {
  AccuracyQuality,
  CompassSample,
  SensorDiagnostics,
} from './specs/NitroCompass.nitro'
import { NitroCompass } from './native'
import {
  addCalibrationListener,
  addHeadingListener,
  addInterferenceListener,
} from './multiplex'

export interface UseCompassOptions {
  /**
   * Minimum change between samples in degrees. Pass `0` for "every
   * event". Default `1`. Updated live via `NitroCompass.setFilter()`.
   * Note: this is global state shared with any other consumer of
   * the library — last-write-wins.
   */
  filterDegrees?: number
  /**
   * Magnetic-to-true offset in signed degrees. Default `0` (magnetic).
   * Pull from a model like `geomagnetism` keyed on the user's lat/lon.
   * Like `filterDegrees`, this is shared global state.
   */
  declination?: number
  /**
   * Pause the underlying sensor when the app is backgrounded. Default
   * `true`. Shared global state.
   */
  pauseOnBackground?: boolean
  /**
   * Toggle the heading subscription without unmounting the hook.
   * Default `true`. When `false`, the hook still observes calibration
   * and interference (so you can show warnings) but won't tear down
   * its own state — `reading` simply stops updating.
   */
  enabled?: boolean
}

export interface UseCompassResult {
  /** Latest emitted sample, or `null` until the first arrives. */
  reading: CompassSample | null
  /** Coarse accuracy bucket, or `null` until the first transition. */
  quality: AccuracyQuality | null
  /** Whether external magnetic interference is currently detected. */
  interfering: boolean
  /** Hardware availability — read once on first render. */
  hasCompass: boolean
  /** Which sensor backs the readings on this device. */
  diagnostics: SensorDiagnostics | undefined
}

/**
 * Ergonomic React wrapper for the NitroCompass surface. Handles
 * subscription lifecycle, callback registration, and the live-tuneable
 * knobs. Multiple instances mounted at once safely share the same
 * underlying native subscription via the multi-listener primitives in
 * `./multiplex`.
 */
export function useCompass(
  options: UseCompassOptions = {}
): UseCompassResult {
  const {
    filterDegrees = 1,
    declination = 0,
    pauseOnBackground = true,
    enabled = true,
  } = options

  const [reading, setReading] = useState<CompassSample | null>(null)
  const [quality, setQuality] = useState<AccuracyQuality | null>(null)
  const [interfering, setInterfering] = useState(false)

  const [hasCompass] = useState(() => NitroCompass.hasCompass())
  const [diagnostics] = useState(() => NitroCompass.getDiagnostics())

  // Tracked via ref so the heading-subscription effect can re-apply
  // the user's filter after a stop/start cycle without restarting on
  // every filterDegrees change.
  const filterRef = useRef(filterDegrees)
  filterRef.current = filterDegrees

  useEffect(() => {
    NitroCompass.setFilter(filterDegrees)
  }, [filterDegrees])

  useEffect(() => {
    NitroCompass.setDeclination(declination)
  }, [declination])

  useEffect(() => {
    NitroCompass.setPauseOnBackground(pauseOnBackground)
  }, [pauseOnBackground])

  useEffect(() => {
    if (!hasCompass) return
    return addCalibrationListener(setQuality)
  }, [hasCompass])

  useEffect(() => {
    if (!hasCompass) return
    return addInterferenceListener(setInterfering)
  }, [hasCompass])

  useEffect(() => {
    if (!hasCompass || !enabled) return
    const off = addHeadingListener(setReading)
    // Multiplex starts the sensor with a default filter; re-apply the
    // current option after subscribing.
    NitroCompass.setFilter(filterRef.current)
    return off
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasCompass, enabled])

  return { reading, quality, interfering, hasCompass, diagnostics }
}
