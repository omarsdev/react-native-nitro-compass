import { NitroModules } from 'react-native-nitro-modules'
import type {
  AccuracyQuality,
  CompassSample,
  NitroCompass as NitroCompassSpec,
} from './specs/NitroCompass.nitro'

export type { AccuracyQuality, CompassSample }
export type { NitroCompassSpec as NitroCompassHybridObject }

export const NitroCompass =
  NitroModules.createHybridObject<NitroCompassSpec>('NitroCompass')
