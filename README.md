# react-native-nitro-compass

Fast, accurate compass heading for React Native, powered by [Nitro Modules](https://github.com/mrousavy/nitro).

- **Android**: `Sensor.TYPE_ROTATION_VECTOR` (gyro + accel + magnetometer sensor fusion), with `TYPE_GEOMAGNETIC_ROTATION_VECTOR` fallback for gyroless devices. Sensor delivery on a dedicated `HandlerThread` — never blocks the UI thread. Heading accuracy taken from `event.values[4]` of the rotation vector.
- **iOS**: `CLLocationManager` heading via `CLHeading.magneticHeading`. Apple's stack already handles sensor fusion natively.
- **JS API**: type-safe Nitro callbacks — no `NativeEventEmitter`, no string event names.

## Why

Most React Native compass libraries use the legacy `accelerometer + magnetometer + getRotationMatrix` Android approach, which is laggy, noisy, and requires a figure-8 calibration on every session. This library uses Android's modern fused rotation-vector sensor (recommended by Google since 2013), giving you stable headings without calibration on virtually any modern device.

## Requirements

- React Native 0.76.0 or higher
- Node 18.0.0 or higher
- `react-native-nitro-modules` peer dependency

## Install

```sh
npm install react-native-nitro-compass react-native-nitro-modules
```

iOS:

```sh
cd ios && pod install
```

## Usage

```ts
import { NitroCompass } from 'react-native-nitro-compass'

if (NitroCompass.hasCompass()) {
  NitroCompass.start(1, ({ heading, accuracy }) => {
    console.log(`heading: ${heading.toFixed(1)}°, accuracy: ±${accuracy}°`)
  })
}

// later…
NitroCompass.stop()
```

### API

```ts
NitroCompass.start(filterDegrees: number, onHeading: (sample: CompassSample) => void): void
NitroCompass.stop(): void
NitroCompass.isStarted(): boolean
NitroCompass.hasCompass(): boolean

NitroCompass.setFilter(degrees: number): void
NitroCompass.getCurrentHeading(): CompassSample | undefined
NitroCompass.getDiagnostics(): SensorDiagnostics | undefined
NitroCompass.setDeclination(degrees: number): void
NitroCompass.setOnCalibrationNeeded(onChange: (quality: AccuracyQuality) => void): void
NitroCompass.setPauseOnBackground(enabled: boolean): void

interface CompassSample {
  heading: number   // degrees, [0, 360); magnetic by default, true-north if setDeclination was called
  accuracy: number  // degrees, smaller is better; -1 if unknown
}

type AccuracyQuality = 'high' | 'medium' | 'low' | 'unreliable'
type SensorKind = 'rotationVector' | 'geomagneticRotationVector' | 'coreLocation'
interface SensorDiagnostics { sensor: SensorKind }
```

- `filterDegrees` — minimum change between successive samples before the next one is delivered. Pass `0` for "every event"; typical UI values are `1`–`3`. Use `setFilter()` to change live without tearing down the subscription.
- `start()` is idempotent in the destructive sense — calling it while already started silently replaces the previous subscription with the new callback. `stop()` is idempotent and safe from inside the `onHeading` callback.
- `getDiagnostics()` reports which sensor would produce headings on this device — useful for explaining quality differences (e.g. a phone falling back to `geomagneticRotationVector` will be more susceptible to magnetic interference than one using `rotationVector`). Safe to call before `start()`.
- `accuracy` is a numeric uncertainty (degrees). On iOS it comes from `CLHeading.headingAccuracy` directly. On Android it comes from `event.values[4]` of the rotation-vector sensor; if the sensor stack does not publish that (rare), the module falls back to a coarse degree estimate from `SensorManager.SENSOR_STATUS_*` (`HIGH→5°`, `MEDIUM→15°`, `LOW→30°`).
- `getCurrentHeading()` returns the most recently emitted sample (with declination already applied), or `undefined` if not started yet or no sample has arrived.

### Calibration

`setOnCalibrationNeeded(cb)` registers a callback fired whenever the calibration bucket transitions. Buckets are derived from numeric accuracy on both platforms using the same thresholds, so values agree across iOS and Android: `<5°` → `'high'`, `<15°` → `'medium'`, `<30°` → `'low'`, otherwise `'unreliable'`. On iOS, the system's "wave the device in a figure-8" prompt is suppressed and reported to your callback as `'unreliable'` — show your own UI when you receive that bucket.

```ts
NitroCompass.setOnCalibrationNeeded((q) => {
  if (q === 'unreliable') showCalibrationToast()
})
```

### Magnetic vs true north

Headings are **magnetic** by default. You can either apply declination in JS, or let the native side do it once via `setDeclination(deg)` so every emitted sample (and `getCurrentHeading()`) is true-north.

```ts
import geomagnetism from 'geomagnetism'

const declination = geomagnetism.model().point([lat, lon]).decl

// Option A — JS-side
const trueHeading = (heading + declination + 360) % 360

// Option B — native-side (subsequent samples are true-north)
NitroCompass.setDeclination(declination)
```

Pass `0` to revert to magnetic. Declination survives `stop()`/`start()` cycles.

### Background pause

By default the underlying sensor / location-manager subscription is silently paused while the app is backgrounded and resumed when it returns to the foreground; the JS callback and any declination set via `setDeclination` are preserved across the pause. To opt out (e.g. for a fitness tracker that needs heading while screen-off):

```ts
NitroCompass.setPauseOnBackground(false)
```

## Permissions

- **iOS**: requires `NSLocationWhenInUseUsageDescription` in `Info.plist`. `CLLocationManager` only emits headings when location permission is granted.
- **Android**: no permission required for the rotation-vector sensor.

## Example app

A bare React Native CLI app under [example/](./example) (RN 0.84.1, New Arch enabled) consumes the library via a local symlink. Use it to test changes on a real device — the iOS Simulator has no compass and the Android emulator's magnetometer is faked.

First-time setup:

```sh
cd example
npm install                       # symlinks ../ as react-native-nitro-compass
cd ios && bundle install && bundle exec pod install && cd ..
```

Run on a device:

```sh
# Terminal 1 — Metro
npm start

# Terminal 2 — build & launch
npm run ios -- --device           # physical iPhone
npm run android                   # physical device or emulator
```

If you change the Nitrogen spec or any native source, regenerate and rebuild:

```sh
# from the repo root
npm run codegen
# then in example/
cd ios && bundle exec pod install && cd ..   # iOS only
npm run ios       # or npm run android
```

The example imports `NitroCompass` directly from the workspace `src/` (via Metro `watchFolders`), so editing TypeScript only requires a Metro reload.

## Acknowledgments

The Android rotation-vector pattern (sensor fusion, surface-rotation remapping, `getOrientation` extraction) is adapted from the MIT-licensed [Andromeda](https://github.com/kylecorry31/andromeda) sensor library by Kyle Corry, which powers the [Trail Sense](https://github.com/kylecorry31/Trail-Sense) wilderness navigation app.

Bootstrapped with [create-nitro-module](https://github.com/patrickkabwe/create-nitro-module).

## License

MIT — see [LICENSE](./LICENSE).
