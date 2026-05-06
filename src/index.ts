import { NitroModules } from 'react-native-nitro-modules'
import type {
  CompassSample,
  NitroCompass as NitroCompassSpec,
} from './specs/NitroCompass.nitro'

export type { CompassSample }
export type { NitroCompassSpec as NitroCompassHybridObject }

export const NitroCompass =
  NitroModules.createHybridObject<NitroCompassSpec>('NitroCompass')
