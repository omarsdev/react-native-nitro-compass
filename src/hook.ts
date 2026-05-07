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
   * Low-pass smoothing factor (EMA α) applied to heading samples.
   * Range `(0, 1]`. Default `0.2` ≈ 100ms time constant at typical
   * Android sample rates. `1.0` disables smoothing. Smaller values
   * smooth more (kills jitter, adds a touch of latency).
   *
   * No-op on iOS — CLLocationManager filters internally.
   * Shared global state — last-write-wins.
   */
  smoothingAlpha?: number
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
    smoothingAlpha = 0.2,
    declination = 0,
    pauseOnBackground = true,
    enabled = true,
  } = options

  const [reading, setReading] = useState<CompassSample | null>(null)
  const [quality, setQuality] = useState<AccuracyQuality | null>(null)
  const [interfering, setInterfering] = useState(false)

  // Wrap in try/catch so a missing/misconfigured native module doesn't
  // throw during render — return safe defaults and let the host UI
  // surface "no compass". Without this, the throw bubbles up and
  // becomes a render error that blanks the screen.
  const [hasCompass] = useState(() => {
    try {
      return NitroCompass.hasCompass()
    } catch {
      return false
    }
  })
  const [diagnostics] = useState(() => {
    try {
      return NitroCompass.getDiagnostics()
    } catch {
      return undefined
    }
  })

  // Tracked via refs so the heading-subscription effect can re-apply
  // the user's filter and smoothing after a stop/start cycle without
  // restarting on every option change.
  const filterRef = useRef(filterDegrees)
  filterRef.current = filterDegrees
  const smoothingRef = useRef(smoothingAlpha)
  smoothingRef.current = smoothingAlpha

  useEffect(() => {
    NitroCompass.setFilter(filterDegrees)
  }, [filterDegrees])

  useEffect(() => {
    NitroCompass.setSmoothing(smoothingAlpha)
  }, [smoothingAlpha])

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
    if (!hasCompass || !enabled) {
      // When the user disables the hook, clear stale UI state.
      // Without this, `reading` / `interfering` keep their last value
      // forever, so the consumer's UI can't tell "subscription is off"
      // from "compass is currently quiet".
      setReading(null)
      setInterfering(false)
      return
    }
    let off: (() => void) | undefined
    try {
      off = addHeadingListener(setReading)
      // Multiplex starts the sensor with a default filter; re-apply
      // the current options after subscribing. recalibrate() can also
      // reset native smoothing state, so we pin our chosen alpha back
      // here as well.
      NitroCompass.setFilter(filterRef.current)
      NitroCompass.setSmoothing(smoothingRef.current)
    } catch (e) {
      // start() throws on iOS when location authorization is denied.
      // Swallow it here so the hook tree doesn't unmount; consumers
      // should call NitroCompass.requestPermission() explicitly before
      // setting enabled=true if they want to recover.
      // eslint-disable-next-line no-console
      console.warn('[NitroCompass] failed to start heading subscription:', e)
    }
    return off
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasCompass, enabled])

  return { reading, quality, interfering, hasCompass, diagnostics }
}
