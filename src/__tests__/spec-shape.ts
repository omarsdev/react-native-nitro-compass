// Type-level smoke test for the public surface. Runs through `tsc --noEmit`
// (i.e. `npm run typecheck`) and is excluded from the bob build output by
// the default exclude pattern `**/{__tests__,__fixtures__,__mocks__}/**`.
//
// Never imported at runtime; the function below exists so any breaking
// change to the spec or the index re-exports is caught statically before
// publish.

import { NitroCompass } from '../index'
import type {
  AccuracyQuality,
  CompassSample,
  NitroCompassHybridObject,
} from '../index'

export function _publicSurfaceShape(): {
  has: boolean
  current: CompassSample | undefined
} {
  const api: NitroCompassHybridObject = NitroCompass

  const has: boolean = api.hasCompass()

  api.start(1, (sample: CompassSample) => {
    const heading: number = sample.heading
    const accuracy: number = sample.accuracy
    return heading + accuracy
  })
  api.stop()

  const current: CompassSample | undefined = api.getCurrentHeading()

  api.setDeclination(0)
  api.setOnCalibrationNeeded((quality: AccuracyQuality) => {
    const ok: 'high' | 'medium' | 'low' | 'unreliable' = quality
    return ok
  })
  api.setPauseOnBackground(true)

  return { has, current }
}
