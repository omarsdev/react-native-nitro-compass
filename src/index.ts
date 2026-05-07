import type {
  AccuracyQuality,
  CompassSample,
  DebugInfo,
  NitroCompass as NitroCompassSpec,
  PermissionStatus,
  SensorDiagnostics,
  SensorKind,
} from './specs/NitroCompass.nitro'

export { NitroCompass } from './native'

export type {
  AccuracyQuality,
  CompassSample,
  DebugInfo,
  PermissionStatus,
  SensorDiagnostics,
  SensorKind,
}
export type { NitroCompassSpec as NitroCompassHybridObject }

export {
  addCalibrationListener,
  addHeadingListener,
  addInterferenceListener,
} from './multiplex'

export { useCompass } from './hook'
export type { UseCompassOptions, UseCompassResult } from './hook'
