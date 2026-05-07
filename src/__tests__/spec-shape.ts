// Type-level smoke test for the public surface. Runs through `tsc --noEmit`
// (i.e. `npm run typecheck`) and is excluded from the bob build output by
// the default exclude pattern `**/{__tests__,__fixtures__,__mocks__}/**`.
//
// Never imported at runtime; the function below exists so any breaking
// change to the spec or the index re-exports is caught statically before
// publish.

import {
  NitroCompass,
  addCalibrationListener,
  addHeadingListener,
  addInterferenceListener,
  useCompass,
} from '../index'
import type {
  AccuracyQuality,
  CompassSample,
  DebugInfo,
  NitroCompassHybridObject,
  PermissionStatus,
  SensorDiagnostics,
  SensorKind,
  UseCompassOptions,
  UseCompassResult,
} from '../index'

export function _publicSurfaceShape(): {
  has: boolean
  started: boolean
  current: CompassSample | undefined
  diagnostics: SensorDiagnostics | undefined
} {
  const api: NitroCompassHybridObject = NitroCompass

  const has: boolean = api.hasCompass()
  const started: boolean = api.isStarted()

  api.start(1, (sample: CompassSample) => {
    const heading: number = sample.heading
    const accuracy: number = sample.accuracy
    const fieldUt: number = sample.fieldStrengthMicroTesla
    return heading + accuracy + fieldUt
  })
  api.setFilter(2)
  api.stop()

  const current: CompassSample | undefined = api.getCurrentHeading()
  const diagnostics: SensorDiagnostics | undefined = api.getDiagnostics()
  if (diagnostics !== undefined) {
    const kind: SensorKind = diagnostics.sensor
    const ok:
      | 'magnetometer'
      | 'coreLocation'
      | 'rotationVector'
      | 'geomagneticRotationVector' = kind
    void ok
  }

  api.setDeclination(0)
  api.setLocation(40.7128, -74.006)
  const debug: DebugInfo = api.getDebugInfo()
  const interferenceActive: boolean = debug.interferenceActive
  const msSinceLastBiasJump: number = debug.msSinceLastBiasJump
  const expectedFieldMicroTesla: number = debug.expectedFieldMicroTesla
  const lastFieldMicroTesla: number = debug.lastFieldMicroTesla
  const fusedYawDeg: number = debug.fusedYawDeg
  const lastYawRateDegPerS: number = debug.lastYawRateDegPerS
  const hasGameRotationVector: boolean = debug.hasGameRotationVector
  const usingUncalibratedMag: boolean = debug.usingUncalibratedMag
  void interferenceActive
  void msSinceLastBiasJump
  void expectedFieldMicroTesla
  void lastFieldMicroTesla
  void fusedYawDeg
  void lastYawRateDegPerS
  void hasGameRotationVector
  void usingUncalibratedMag
  api.setOnCalibrationNeeded((quality: AccuracyQuality) => {
    const ok: 'high' | 'medium' | 'low' | 'unreliable' = quality
    return ok
  })
  api.setOnInterferenceDetected((interferenceDetected: boolean) => {
    const ok: boolean = interferenceDetected
    return ok
  })
  api.setPauseOnBackground(true)
  api.recalibrate()

  const status: PermissionStatus = api.getPermissionStatus()
  const okStatus: 'granted' | 'denied' | 'unknown' = status
  void okStatus
  void api.requestPermission().then((s: PermissionStatus) => {
    const ok: 'granted' | 'denied' | 'unknown' = s
    return ok
  })

  // Multi-listener fan-out helpers.
  const offH: () => void = addHeadingListener((s: CompassSample) => {
    void s.heading
  })
  const offC: () => void = addCalibrationListener((q: AccuracyQuality) => {
    void q
  })
  const offI: () => void = addInterferenceListener((b: boolean) => {
    void b
  })
  offH()
  offC()
  offI()

  // Hook surface — typed without invoking (would need a renderer).
  const _useCompass: (
    options?: UseCompassOptions
  ) => UseCompassResult = useCompass
  void _useCompass

  return { has, started, current, diagnostics }
}
