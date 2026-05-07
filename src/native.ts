import { NitroModules } from 'react-native-nitro-modules'
import type { NitroCompass as NitroCompassSpec } from './specs/NitroCompass.nitro'

export const NitroCompass =
  NitroModules.createHybridObject<NitroCompassSpec>('NitroCompass')
