import { NitroModules } from 'react-native-nitro-modules'
import type {
  AccuracyQuality,
  CompassSample,
  NitroCompass as NitroCompassSpec,
  SensorDiagnostics,
  SensorKind,
} from './specs/NitroCompass.nitro'

export type { AccuracyQuality, CompassSample, SensorDiagnostics, SensorKind }
export type { NitroCompassSpec as NitroCompassHybridObject }

export const NitroCompass =
  NitroModules.createHybridObject<NitroCompassSpec>('NitroCompass')
