# react-native-nitro-compass

Fast, accurate compass heading for React Native, powered by [Nitro Modules](https://github.com/mrousavy/nitro).

- **Android**: raw `TYPE_MAGNETIC_FIELD` + `TYPE_ACCELEROMETER` fed through `SensorManager.getRotationMatrix()` + `getOrientation()`. This path is **stateless** — when a magnet or laptop is removed, the very next sample produces the correct heading instead of waiting for OS-level fusion to re-converge. Sensor delivery on a dedicated `HandlerThread` — never blocks the UI thread.
- **iOS**: `CLLocationManager` heading via `CLHeading.magneticHeading`. Apple's stack already handles sensor fusion natively.
- **JS API**: type-safe Nitro callbacks — no `NativeEventEmitter`, no string event names.

## Why

Most React Native compass libraries use Android's `TYPE_ROTATION_VECTOR`, which feels great until you put a magnet, a phone, or a laptop next to the device — then the OS-level Kalman filter holds a poisoned bias estimate for many seconds after the source is removed. This library computes heading directly from raw `accelerometer + magnetometer` via `getRotationMatrix()` (the same approach used by popular consumer compass apps), so recovery from interference is instant. We trade a few degrees of steady-state jitter for stateless behaviour, then add back smoothness via a tunable EMA on `(sin θ, cos θ)` (`setSmoothing()`).

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
NitroCompass.setSmoothing(alpha: number): void
NitroCompass.getCurrentHeading(): CompassSample | undefined
NitroCompass.getDiagnostics(): SensorDiagnostics | undefined
NitroCompass.setDeclination(degrees: number): void
NitroCompass.setOnCalibrationNeeded(onChange: (quality: AccuracyQuality) => void): void
NitroCompass.setOnInterferenceDetected(onChange: (interferenceDetected: boolean) => void): void
NitroCompass.setPauseOnBackground(enabled: boolean): void

interface CompassSample {
  heading: number   // degrees, [0, 360); magnetic by default, true-north if setDeclination was called
  accuracy: number  // degrees, smaller is better; -1 if unknown
}

type AccuracyQuality = 'high' | 'medium' | 'low' | 'unreliable'
type SensorKind =
  | 'magnetometer'
  | 'coreLocation'
  | 'rotationVector' // legacy, no longer returned
  | 'geomagneticRotationVector' // legacy, no longer returned
interface SensorDiagnostics { sensor: SensorKind }
```

- `filterDegrees` — minimum change between successive samples before the next one is delivered. Pass `0` for "every event"; typical UI values are `1`–`3`. Use `setFilter()` to change live without tearing down the subscription.
- `setSmoothing(alpha)` — low-pass smoothing factor (EMA α) applied to heading samples on Android. Range `(0, 1]`, default `0.2` (~100 ms time constant at 50 Hz). `1.0` disables smoothing; smaller values smooth more (kills jitter, adds a touch of latency). **No-op on iOS** — `CLLocationManager` filters internally with Apple's own algorithm, so layering an EMA on top would only add latency. See [Smoothing](#smoothing) below.
- `start()` is idempotent in the destructive sense — calling it while already started silently replaces the previous subscription with the new callback. `stop()` is idempotent and safe from inside the `onHeading` callback.
- `getDiagnostics()` reports which sensor would produce headings on this device. On Android this is always `magnetometer` for current builds (older versions returned `rotationVector` / `geomagneticRotationVector`); on iOS it's `coreLocation`. Safe to call before `start()`.
- `accuracy` is a numeric uncertainty (degrees). On iOS it comes from `CLHeading.headingAccuracy` directly. On Android it's a coarse degree estimate derived from the magnetometer's `SensorManager.SENSOR_STATUS_*` accuracy bucket — Android's figure-8 calibration signal — mapped to `HIGH→5°`, `MEDIUM→15°`, `LOW→30°`.
- `fieldStrengthMicroTesla` is the magnitude of the local magnetic field in µT, or `-1` until the first reading lands. Earth's field is normally 25–65 µT — values well outside this band signal external interference (laptops, monitors, magnets, ferrous metal). Useful for rendering a field-strength meter à la consumer compass apps.
- `getCurrentHeading()` returns the most recently emitted sample (with declination already applied), or `undefined` if not started yet or no sample has arrived.

### Calibration

`setOnCalibrationNeeded(cb)` registers a callback fired whenever the calibration bucket transitions. Each platform's bucket is derived from its **native** accuracy semantics, since the underlying values are not directly comparable:

- **iOS** uses `CLHeading.headingAccuracy` (degrees). Apple is conservative — even well-calibrated iPhones typically report `10–15°` and rarely below `5°` (per [Apple staff on the developer forums](https://developer.apple.com/forums/thread/79687)). Buckets: `<20°` → `'high'`, `<35°` → `'medium'`, `<55°` → `'low'`, otherwise `'unreliable'`. The system's "wave the device in a figure-8" prompt is suppressed and reported to your callback as `'unreliable'` — show your own UI when you receive that bucket.
- **Android** uses the magnetometer's `SensorManager.SENSOR_STATUS_*` bucket from `onAccuracyChanged` directly (`HIGH` / `MEDIUM` / `LOW` / `UNRELIABLE`) — Android's signal that the user should do (or has done) a figure-8 to recalibrate. **When magnetic interference is currently detected, the surfaced bucket is downgraded by one notch** (`HIGH→MEDIUM`, `MEDIUM→LOW`, `LOW→UNRELIABLE`) — calibration ("the magnetometer needs to be tuned") and interference ("the field is currently being skewed by something nearby") are independent signals, and surfacing `quality='high'` alongside `interfering=true` is contradictory UX.

Both platforms can plausibly emit `'high'` on a clean device — the threshold split just reflects each OS's reporting style.

```ts
NitroCompass.setOnCalibrationNeeded((q) => {
  if (q === 'unreliable') showCalibrationToast()
})
```

### Magnetic interference

`setOnInterferenceDetected(cb)` fires `true` when the raw magnetic field magnitude leaves the normal Earth band (~20–70 µT) and `false` when it returns. Typical sources are laptops, monitors, car engines, and large steel structures — these can skew heading by tens of degrees.

Interference is surfaced three ways: (1) directly via this callback, (2) on Android, the calibration bucket emitted by `setOnCalibrationNeeded` is downgraded by one notch while interference is detected (see the Calibration section above), and (3) every `CompassSample` carries `fieldStrengthMicroTesla` so you can render a live strength meter. On iOS, the calibration downgrade is skipped — `CLLocationManager`'s own accuracy reporting already responds to magnetometer disturbance, so a separate downgrade would double-count.

```ts
NitroCompass.setOnInterferenceDetected((interfering) => {
  if (interfering) showInterferenceWarning()
  else hideInterferenceWarning()
})
```

Android uses `Sensor.TYPE_MAGNETIC_FIELD` at ~5 Hz. iOS uses `CMDeviceMotion.magneticField` (calibrated, with the device's own hard-iron bias subtracted in real time) — note that no transitions are reported on iOS until CoreMotion's bias estimate converges, typically a second or two of normal device movement. Only triggered while `start()` is active; no debounce, so brief excursions still fire.

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

### Smoothing

Android's raw accelerometer + magnetometer heading jitters by `±1–3°` even at rest. iOS's `CLLocationManager` filters internally; Android does not. The library applies a circular EMA low-pass filter on `(sin θ, cos θ)` (handles `359°→0°` wraparound cleanly) before delivering samples, with `α = 0.2` by default — the same value used in [phishman3579/android-compass](https://github.com/phishman3579/android-compass/blob/master/src/com/jwetherell/compass/common/LowPassFilter.java) and within the range used by [Trail Sense](https://github.com/kylecorry31/Trail-Sense)'s production compass code.

Tune live:

```ts
NitroCompass.setSmoothing(0.2)   // default — kills jitter, ~100 ms latency
NitroCompass.setSmoothing(0.4)   // snappier, more visible jitter
NitroCompass.setSmoothing(1.0)   // disabled — every sample passes through
```

`setSmoothing` is a no-op on iOS — Apple's stack already filters heading internally, so layering an EMA on top would only add latency without removing noise.

### Background pause

By default the underlying sensor / location-manager subscription is silently paused while the app is backgrounded and resumed when it returns to the foreground; the JS callback and any declination set via `setDeclination` are preserved across the pause. To opt out (e.g. for a fitness tracker that needs heading while screen-off):

```ts
NitroCompass.setPauseOnBackground(false)
```

### `useCompass()` hook

For React consumers, the bundled hook wraps the entire surface — subscription lifecycle, calibration/interference callbacks, and the live-tuneable knobs — into one ergonomic call. Multiple `useCompass()` mounts safely share the same underlying native subscription via JS-side fan-out, so two screens can both consume heading without clobbering each other.

```tsx
import { useCompass } from 'react-native-nitro-compass'

function CompassView() {
  const { reading, quality, interfering, hasCompass } = useCompass({
    filterDegrees: 1,
    smoothingAlpha: 0.2,
    declination: 0,
    pauseOnBackground: true,
    enabled: true,
  })

  if (!hasCompass) return <Text>No compass on this device.</Text>
  if (!reading) return <Text>Acquiring heading…</Text>

  return (
    <View>
      <Text>{reading.heading.toFixed(0)}° (±{reading.accuracy.toFixed(0)}°)</Text>
      {quality === 'unreliable' && <Text>Calibration needed</Text>}
      {interfering && <Text>Magnetic interference</Text>}
    </View>
  )
}
```

```ts
function useCompass(options?: UseCompassOptions): UseCompassResult
```

#### Options

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `filterDegrees` | `number` | `1` | Minimum change between successive samples in degrees. Pass `0` for "every event". Updated live via `NitroCompass.setFilter()` whenever the prop changes. |
| `smoothingAlpha` | `number` | `0.2` | Low-pass smoothing factor (EMA α) on Android. `1.0` disables smoothing; smaller values smooth more. No-op on iOS. See [Smoothing](#smoothing). |
| `declination` | `number` | `0` | Magnetic-to-true offset in signed degrees. Pull from a model like [`geomagnetism`](https://github.com/kahirokunn/geomagnetism) keyed on the user's lat/lon. When non-zero, every emitted sample is true-north. |
| `pauseOnBackground` | `boolean` | `true` | Pause the underlying sensor / location-manager subscription while the app is backgrounded and resume on foreground. |
| `enabled` | `boolean` | `true` | Toggle the heading subscription without unmounting. When `false`, `reading` stops updating but calibration and interference observation continue (so you can still show warnings). |

`filterDegrees`, `smoothingAlpha`, `declination`, and `pauseOnBackground` map to global state on `NitroCompass` — if multiple hooks set them, last-write-wins.

#### Result

| Field | Type | Description |
| --- | --- | --- |
| `reading` | `CompassSample \| null` | Latest emitted sample (`{ heading, accuracy }`), or `null` until the first arrives. Heading is true-north when `declination` is set, magnetic otherwise. |
| `quality` | `AccuracyQuality \| null` | Coarse calibration bucket — `'high'`, `'medium'`, `'low'`, or `'unreliable'`. `null` until the first transition. Show your own calibration UI on `'unreliable'`. |
| `interfering` | `boolean` | `true` while the raw magnetic field magnitude is outside the normal Earth band (~20–70 µT) — laptops, monitors, car engines, steel structures. |
| `hasCompass` | `boolean` | Hardware availability — read once on first render. Render a fallback when `false`. |
| `diagnostics` | `SensorDiagnostics \| undefined` | Which sensor backs the readings on this device (`magnetometer` on Android, `coreLocation` on iOS). Useful for explaining quality differences. |

For non-React state managers, lower-level `addHeadingListener(cb): () => void`, `addCalibrationListener(cb): () => void`, and `addInterferenceListener(cb): () => void` are also exported. They are reference-counted: the first heading listener calls `start()`, the last unsubscribe calls `stop()`. Mixing these helpers with direct `NitroCompass.start()` / `setOnCalibrationNeeded()` / `setOnInterferenceDetected()` will clobber the multiplex's internal callback slot — pick one path.

### Smooth dial animation (Reanimated)

`useCompass()` returns React state, so each sample re-renders the consumer — fine for a numeric readout, but a rotating dial driven that way will jitter on faster filter values. For 60 fps animations, subscribe with `addHeadingListener` and write directly into a Reanimated shared value on the UI thread:

```tsx
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated'
import { addHeadingListener } from 'react-native-nitro-compass'

function Dial() {
  const angle = useSharedValue(0)
  const last = useRef(0)

  useEffect(() => addHeadingListener(({ heading }) => {
    // unwrap so 359° → 1° animates +2°, not -358°
    const wrapped = ((last.current % 360) + 360) % 360
    let delta = heading - wrapped
    if (delta > 180) delta -= 360
    else if (delta < -180) delta += 360
    last.current += delta
    angle.value = withTiming(last.current, { duration: 80, easing: Easing.out(Easing.quad) })
  }), [angle])

  const style = useAnimatedStyle(() => ({ transform: [{ rotate: `${-angle.value}deg` }] }))
  return <Animated.View style={[styles.dial, style]}>{/* ticks */}</Animated.View>
}
```

The same pattern is used in [example/components/Compass.tsx](./example/components/Compass.tsx).

## Permissions

- **iOS**: requires `NSLocationWhenInUseUsageDescription` in `Info.plist`. `CLLocationManager` only emits headings when location permission is granted.
- **Android**: no permission required for the magnetometer or accelerometer.

## Example app

A bare React Native CLI app under [example/](./example) (RN 0.85.3, New Arch enabled) consumes the library via a local symlink. It demos the full surface — `useCompass()` for the readout, calibration / interference banners, and a Reanimated-driven dial that subscribes via `addHeadingListener` so the rotation runs entirely on the UI thread. Use it to test changes on a real device — the iOS Simulator has no compass and the Android emulator's magnetometer is faked.

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

The Android sensor pattern (raw mag + accel fusion via `getRotationMatrix`, surface-rotation remapping, `getOrientation` extraction, EMA on `(sin θ, cos θ)`) is adapted from the MIT-licensed [Andromeda](https://github.com/kylecorry31/andromeda) sensor library by Kyle Corry, which powers the [Trail Sense](https://github.com/kylecorry31/Trail-Sense) wilderness navigation app.

Bootstrapped with [create-nitro-module](https://github.com/patrickkabwe/create-nitro-module).

## License

MIT — see [LICENSE](./LICENSE).
