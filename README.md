# react-native-nitro-compass

[![npm version](https://img.shields.io/npm/v/react-native-nitro-compass.svg)](https://www.npmjs.com/package/react-native-nitro-compass)
[![license](https://img.shields.io/npm/l/react-native-nitro-compass.svg)](./LICENSE)
[![react-native](https://img.shields.io/badge/react--native-0.76%2B-61dafb)](https://reactnative.dev)

Fast, accurate compass heading for React Native, powered by [Nitro Modules](https://github.com/mrousavy/nitro). Survives magnetic interference, supports true-north via geomagnetic location lookup, and drives a 60 fps Reanimated dial without thrashing React.

```ts
import { useCompass } from 'react-native-nitro-compass'

function CompassScreen() {
  const { reading, quality, interfering } = useCompass()
  return <Text>{reading?.heading.toFixed(0)}°</Text>
}
```

## Features

- **Stateless interference recovery.** Heading snaps back the instant a magnet or laptop is removed — no waiting for the OS Kalman filter to unstick.
- **Gyro complementary fusion.** `TYPE_GAME_ROTATION_VECTOR` carries heading smoothly through rapid turns and transient magnet events; mag samples pull it back to absolute via a ~1 s blend.
- **Bias-jump interference detection.** Catches weak magnet events the field-magnitude check alone misses — e.g. another phone placed on top, where the corrected magnitude stays in-band but the OS still revises its hard-iron bias.
- **Location-aware.** `setLocation(lat, lon)` tightens the Android interference band using the bundled WMM2025 model.
- **Type-safe Nitro callbacks.** No `NativeEventEmitter`, no string event names.
- **Ergonomic React hook.** `useCompass()` bundles subscription lifecycle, calibration/interference observation, and live-tuneable knobs into one call. Multiple mounts safely share a single native subscription.
- **Reanimated-friendly.** Direct `addHeadingListener()` for 60 fps animations that run entirely on the UI thread.
- **Live diagnostics.** `getDebugInfo()` surfaces all internal state for self-diagnosing user reports.
- **Permission-aware.** Built-in `requestPermission()` / `permission` state — no extra dependency for the iOS authorization flow.

## Table of contents

- [Installation](#installation)
- [Permissions](#permissions)
- [Quick start](#quick-start)
- [`useCompass()` hook](#usecompass-hook)
- [Listener helpers](#listener-helpers)
- [Imperative API](#imperative-api)
- [Recipes](#recipes)
  - [True-north heading from location](#true-north-heading-from-location)
  - [Smooth dial animation (Reanimated)](#smooth-dial-animation-reanimated)
  - [Location-tightened interference](#location-tightened-interference)
  - [Calibration UI](#calibration-ui)
  - [Custom diagnostics panel](#custom-diagnostics-panel)
- [Types](#types)
- [Architecture](#architecture)
- [Troubleshooting](#troubleshooting)
- [Example app](#example-app)
- [Acknowledgments](#acknowledgments)
- [License](#license)

## Installation

```sh
npm install react-native-nitro-compass react-native-nitro-modules
# or
yarn add react-native-nitro-compass react-native-nitro-modules
```

iOS:

```sh
cd ios && pod install
```

**Requirements**: React Native ≥ 0.76, Node ≥ 18, [`react-native-nitro-modules`](https://github.com/mrousavy/nitro) installed as a peer dependency.

## Permissions

|                              | iOS                                                              | Android                                       |
| ---                          | ---                                                              | ---                                           |
| Compass heading              | `NSLocationWhenInUseUsageDescription` in `Info.plist`            | none — sensors are unrestricted               |
| `setLocation()` (optional)   | reuses the same key — no extra permission                        | `ACCESS_COARSE_LOCATION` in your manifest     |

### iOS

Add to `ios/<YourApp>/Info.plist`:

```xml
<key>NSLocationWhenInUseUsageDescription</key>
<string>Used to read the device compass heading.</string>
```

`CLLocationManager` only emits headings when location authorization is granted. The hook exposes `permission` and `requestPermission()` so you don't need a separate library to drive the prompt.

### Android

The compass itself needs **no permission** — Android exposes the magnetometer and accelerometer to all apps. Only add `ACCESS_COARSE_LOCATION` if you plan to call `setLocation()` (or use the location recipe below):

```xml
<!-- android/app/src/main/AndroidManifest.xml -->
<uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />
```

## Quick start

```tsx
import { Text, View } from 'react-native'
import { useCompass } from 'react-native-nitro-compass'

function Compass() {
  const { reading, quality, interfering, hasCompass } = useCompass()

  if (!hasCompass) return <Text>No compass on this device.</Text>
  if (!reading) return <Text>Acquiring heading…</Text>

  return (
    <View>
      <Text>{reading.heading.toFixed(0)}° (±{reading.accuracy.toFixed(0)}°)</Text>
      {quality === 'unreliable' && <Text>Calibration needed</Text>}
      {interfering && <Text>Magnetic interference detected</Text>}
    </View>
  )
}
```

That's the whole API for 90% of apps. Read on for true-north, smoother animation, and tunable behavior.

## `useCompass()` hook

```ts
function useCompass(options?: UseCompassOptions): UseCompassResult
```

Wraps the entire surface — subscription lifecycle, calibration/interference callbacks, live-tuneable knobs, permission flow — into one ergonomic call. Multiple `useCompass()` mounts safely share the same underlying native subscription.

### Options

| Option              | Type      | Default | Description                                                                                                              |
| ---                 | ---       | ---     | ---                                                                                                                      |
| `filterDegrees`     | `number`  | `1`     | Minimum change between successive samples in degrees. Pass `0` for "every event".                                        |
| `smoothingAlpha`    | `number`  | `0.2`   | Low-pass smoothing factor (EMA α) on Android. `1.0` disables smoothing; smaller values smooth more. No-op on iOS.        |
| `declination`       | `number`  | `0`     | Magnetic-to-true offset in signed degrees. When non-zero, every emitted sample is true-north. See [recipe](#true-north-heading-from-location). |
| `pauseOnBackground` | `boolean` | `true`  | Pause the underlying sensor / location-manager subscription while the app is backgrounded.                               |
| `enabled`           | `boolean` | `true`  | Toggle the heading subscription without unmounting. When `false`, `reading` stops updating but calibration/interference observation continues. |

`filterDegrees`, `smoothingAlpha`, `declination`, and `pauseOnBackground` map to global state on `NitroCompass` — if multiple hooks set them, last-write-wins.

### Result

| Field                | Type                                          | Description                                                                                                              |
| ---                  | ---                                           | ---                                                                                                                      |
| `reading`            | `CompassSample \| null`                       | Latest emitted sample, or `null` until the first arrives.                                                                |
| `quality`            | `AccuracyQuality \| null`                     | Coarse calibration bucket. Show your own calibration UI on `'unreliable'`.                                               |
| `interfering`        | `boolean`                                     | `true` while external magnetic interference is detected.                                                                 |
| `hasCompass`         | `boolean`                                     | Hardware availability — read once on first render.                                                                       |
| `diagnostics`        | `SensorDiagnostics \| undefined`              | Which sensor backs the readings on this device.                                                                          |
| `permission`         | `PermissionStatus`                            | Latest platform permission state. iOS may transition `'unknown'` → `'granted'`/`'denied'` after `requestPermission()`.   |
| `getCurrentHeading`  | `() => CompassSample \| undefined`            | Synchronous read of the most recent sample. Stable identity.                                                             |
| `recalibrate`        | `() => void`                                  | Force a best-effort sensor recalibration. Stable identity.                                                               |
| `setLocation`        | `(lat: number, lon: number) => void`          | Tighten the Android interference gate via WMM2025. No-op on iOS. Stable identity.                                        |
| `requestPermission`  | `() => Promise<PermissionStatus>`             | Prompt the platform permission dialog and update the hook's `permission` field. Stable identity.                         |

The four function fields all have stable identities (via `useCallback`) so consumers' `useEffect` deps don't churn on every render.

## Listener helpers

For non-React code, three reference-counted listener primitives are exported. The first heading listener calls `start()` natively; the last `unsubscribe()` calls `stop()`.

```ts
import {
  addHeadingListener,
  addCalibrationListener,
  addInterferenceListener,
} from 'react-native-nitro-compass'

const off = addHeadingListener(({ heading, accuracy, fieldStrengthMicroTesla }) => {
  // …
})
// later
off()
```

Mixing listener helpers with direct `NitroCompass.setOnCalibrationNeeded()` / `setOnInterferenceDetected()` will clobber the multiplex's internal callback slot — pick one path. `useCompass()` itself uses these helpers, so mixing the hook with `addHeadingListener` is fine.

## Imperative API

For full control, drive the native HybridObject directly:

```ts
import { NitroCompass } from 'react-native-nitro-compass'

if (NitroCompass.hasCompass()) {
  NitroCompass.start(1, ({ heading }) => console.log(heading))
}
NitroCompass.stop()
```

| Method                                                                       | Description                                                                                                              |
| ---                                                                          | ---                                                                                                                      |
| `start(filterDegrees, onHeading)`                                            | Begin emitting samples to `onHeading`. Idempotent — replaces any prior subscription.                                     |
| `stop()`                                                                     | Stop the subscription. Safe to call when not started.                                                                    |
| `isStarted()`                                                                | `true` between `start()` and `stop()`.                                                                                   |
| `hasCompass()`                                                               | Hardware availability check.                                                                                             |
| `setFilter(degrees)`                                                         | Update the deadband filter live without restarting.                                                                      |
| `setSmoothing(alpha)`                                                        | Update the EMA smoothing factor (Android). Range `(0, 1]`. No-op on iOS.                                                 |
| `setDeclination(degrees)`                                                    | Apply a magnetic-to-true offset to every emitted heading.                                                                |
| `setLocation(latitude, longitude)`                                           | Tighten the Android interference gate using WMM2025. Pass `NaN` to revert. No-op on iOS.                                 |
| `setPauseOnBackground(enabled)`                                              | Toggle automatic pause/resume on background.                                                                             |
| `getCurrentHeading()`                                                        | Most recent sample, or `undefined`.                                                                                      |
| `getDiagnostics()`                                                           | Which sensor backs headings on this device.                                                                              |
| `getDebugInfo()`                                                             | Live snapshot of internal pipeline state — see [DebugInfo](#types).                                                      |
| `setOnCalibrationNeeded(cb)`                                                 | Subscribe to calibration-bucket transitions.                                                                             |
| `setOnInterferenceDetected(cb)`                                              | Subscribe to magnetic-interference transitions.                                                                          |
| `recalibrate()`                                                              | Force a best-effort recalibration (re-register sensors on Android, dismiss heading-calibration overlay on iOS).          |
| `getPermissionStatus()`                                                      | Synchronous read of the platform permission state.                                                                       |
| `requestPermission()`                                                        | Promise — prompts iOS dialog if `notDetermined`, resolves with the resulting status.                                     |

## Recipes

### True-north heading from location

Headings are **magnetic** by default. To convert to true-north you need the [magnetic declination](https://en.wikipedia.org/wiki/Magnetic_declination) at the user's location — it varies from ~0° on the agonic line to ±25° in some parts of the world. The library applies an offset for you when you call `setDeclination(deg)`; you compute that offset from a WMM model.

Pair any geolocation library with [`geomagnetism`](https://github.com/manuelbieh/geomagnetism) (a static WMM2025 lookup, no native deps):

```sh
yarn add react-native-geolocation-service geomagnetism
```

```tsx
import { useEffect } from 'react'
import { Platform, PermissionsAndroid } from 'react-native'
import Geolocation from 'react-native-geolocation-service'
import geomagnetism from 'geomagnetism'
import { useCompass } from 'react-native-nitro-compass'

async function ensureLocationPermission(): Promise<boolean> {
  if (Platform.OS === 'android') {
    const result = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION,
    )
    return result === PermissionsAndroid.RESULTS.GRANTED
  }
  return true
}

function CompassScreen() {
  const compass = useCompass()
  const { setLocation } = compass

  useEffect(() => {
    let cancelled = false
    void (async () => {
      if (!(await ensureLocationPermission()) || cancelled) return

      Geolocation.getCurrentPosition(
        ({ coords }) => {
          if (cancelled) return
          // Tighten the interference band (Android-only).
          setLocation(coords.latitude, coords.longitude)
          // Apply true-north declination to every subsequent sample.
          const decl = geomagnetism.model().point([coords.latitude, coords.longitude]).decl
          NitroCompass.setDeclination(decl)
        },
        () => {/* fall back to magnetic heading + generic interference band */},
        { enableHighAccuracy: false, timeout: 15_000, maximumAge: 60_000 },
      )
    })()
    return () => { cancelled = true }
  }, [setLocation])

  return <Text>{compass.reading?.heading.toFixed(0)}° true</Text>
}
```

A few notes:

- **One-shot is enough.** Both declination and `expectedField` vary slowly with position (< 0.5 % per km), so a single fix at app start is fine for stationary users. For long-distance travelers, add a `Geolocation.watchPosition` with `distanceFilter: 10_000` (10 km) and `interval: 600_000` (10 min) — same accuracy, negligible battery cost. **Don't poll every second** — it has zero accuracy benefit and significant battery cost.
- **Pass `NaN, NaN` and `0`** to revert when the user disables location: `setLocation(NaN, NaN); NitroCompass.setDeclination(0)`.
- **iOS**: `setLocation` is a no-op (`CLLocationManager` already uses GPS-derived location internally), but `setDeclination` works the same way as on Android — both platforms apply it before the heading hits your callback.

### Smooth dial animation (Reanimated)

`useCompass()` triggers a React render on every emitted sample — fine for a numeric readout, but a rotating dial driven that way will jitter at high sample rates. For 60 fps animation, subscribe with `addHeadingListener` and write directly into a Reanimated shared value on the UI thread:

```tsx
import { useEffect, useRef } from 'react'
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

The pattern is used in [`example/components/Compass.tsx`](./example/components/Compass.tsx).

### Location-tightened interference

`setLocation(lat, lon)` replaces the generic 20–70 µT "Earth field" band with `expectedField ± 15 µT`, where `expectedField` comes from the WMM2025 model bundled in Android's `GeomagneticField`. This catches weak interference at high or low latitudes where the natural field exceeds 60 µT — exactly the cases where the generic band is too loose.

The recipe is identical to [True-north heading from location](#true-north-heading-from-location); call both `setLocation` and `setDeclination` with the same fix.

### Calibration UI

```tsx
import { Pressable, Text, View } from 'react-native'
import { useCompass } from 'react-native-nitro-compass'

function CalibrationBanner() {
  const { quality, recalibrate } = useCompass()
  if (quality !== 'unreliable' && quality !== 'low') return null

  return (
    <View style={styles.banner}>
      <Text>Tilt and rotate the device in different directions until accuracy improves.</Text>
      <Pressable onPress={recalibrate}>
        <Text>Refresh</Text>
      </Pressable>
    </View>
  )
}
```

`recalibrate()` re-registers the sensor listeners on Android (which often nudges the magnetometer driver to re-evaluate calibration) and dismisses the iOS heading-calibration overlay. The user still has to move the device — this just clears cached state so progress is reflected promptly.

### Custom diagnostics panel

For self-diagnosing user bug reports, poll `getDebugInfo()` behind a hidden footer:

```tsx
import { useEffect, useState } from 'react'
import { NitroCompass, type DebugInfo } from 'react-native-nitro-compass'

function DebugPanel() {
  const [info, setInfo] = useState<DebugInfo | null>(null)
  useEffect(() => {
    const id = setInterval(() => {
      try { setInfo(NitroCompass.getDebugInfo()) } catch {}
    }, 250)
    return () => clearInterval(id)
  }, [])
  // …render info.interferenceActive, info.usingUncalibratedMag, info.fusedYawDeg, etc.
}
```

A complete implementation lives at [`example/components/DebugPanel.tsx`](./example/components/DebugPanel.tsx).

## Types

```ts
interface CompassSample {
  heading: number                  // [0, 360); magnetic by default, true-north if setDeclination was called
  accuracy: number                 // degrees; smaller is better; -1 if unknown
  fieldStrengthMicroTesla: number  // µT magnitude of the local magnetic field; -1 until first reading
}

type AccuracyQuality = 'high' | 'medium' | 'low' | 'unreliable'

type PermissionStatus = 'granted' | 'denied' | 'unknown'

type SensorKind =
  | 'magnetometer'                 // Android raw mag + accel
  | 'coreLocation'                 // iOS CLLocationManager
  | 'rotationVector'               // legacy, no longer returned
  | 'geomagneticRotationVector'    // legacy, no longer returned

interface SensorDiagnostics {
  sensor: SensorKind
}

interface DebugInfo {
  interferenceActive: boolean
  msSinceLastBiasJump: number       // -1 if never seen / iOS
  expectedFieldMicroTesla: number   // -1 if setLocation() not called
  lastFieldMicroTesla: number       // -1 if no reading
  fusedYawDeg: number               // NaN before first sample / iOS
  lastYawRateDegPerS: number        // 0 if game-RV unavailable
  hasGameRotationVector: boolean    // false on iOS
  usingUncalibratedMag: boolean     // false on iOS
}
```

### `AccuracyQuality` thresholds

The bucket is derived from a numeric heading-accuracy estimate on both platforms, but the thresholds differ because the underlying scales disagree:

- **Android** — direct mapping from `SensorManager.SENSOR_STATUS_*`: `HIGH` → `high`, `MEDIUM` → `medium`, `LOW` → `low`, `UNRELIABLE`/`NO_CONTACT` → `unreliable`. The numeric `accuracy` field on `CompassSample` is a synthetic upper bound (`<5°`, `<15°`, `<30°`, `-1`).
- **iOS** — bucketed from `CLHeading.headingAccuracy` (degrees) with relaxed thresholds because Apple's stack rarely reports under 5° even on a perfectly-calibrated compass: `<20°` → `high`, `<35°` → `medium`, `<55°` → `low`, otherwise `unreliable`.

When magnetic interference is detected on Android, the surfaced bucket is downgraded by one notch (`high` → `medium`, etc.) — calibration ("the magnetometer needs tuning") and interference ("the field is currently being skewed") are independent signals, and surfacing `quality='high'` alongside `interfering=true` is contradictory UX.

## Architecture

### Why not `TYPE_ROTATION_VECTOR`

Most React Native compass libraries use Android's `TYPE_ROTATION_VECTOR`, which feels great until you put a magnet, a phone, or a laptop next to the device — the OS-level Kalman filter then holds a poisoned bias estimate for many seconds after the source is removed. This library computes heading directly from raw `accelerometer + magnetometer` via `getRotationMatrix()` (the same approach used by popular consumer compass apps), so recovery from interference is instant.

We trade a few degrees of steady-state jitter for stateless behavior, then add back smoothness via two layers:

1. **Adaptive input low-pass** on the accel and mag *vectors* before they enter `getRotationMatrix()`. Different α per sensor (accel is jerk-noisy, mag is hard-iron-noisy), and α is adaptive on gyro-derived yaw rate — strong filter when still, weak when turning fast.
2. **Gyro complementary fusion** on top of the result. `TYPE_GAME_ROTATION_VECTOR` provides a Δyaw between events; we integrate that into a `fusedYawDeg` and let mag samples pull it back to absolute via a small (~1 s time constant) blend. During interference the blend is disabled — gyro alone carries heading until the field clears, then a one-shot snap re-syncs.

The output is then run through an EMA on `(sin θ, cos θ)` (handles 359°→0° wraparound cleanly) before delivery — tunable via `setSmoothing()`.

### Magnetic interference

Detection on **Android** combines two signals:

1. The raw magnetic field magnitude leaving the Earth band (~20–70 µT, or `expectedField ± 15 µT` if you've called `setLocation`).
2. Recent OS hard-iron-bias jumps on `TYPE_MAGNETIC_FIELD_UNCALIBRATED`.

The bias-jump signal catches *weak* interference events the magnitude check alone would miss — e.g. another phone placed on top of yours, where the corrected field magnitude stays near 50 µT but the OS still revises its bias estimate. Either signal flips `interfering` to `true`; both must clear (and a 1.5 s grace window expire) before `false` is reported.

On **iOS**, detection uses `CMDeviceMotion.magneticField` (calibrated, with the device's own hard-iron bias subtracted in real time). Transitions wait for CoreMotion's bias estimate to converge (5 consecutive non-`uncalibrated` samples — typically a second or two of normal device movement after subscribe) so the first second post-`start()` doesn't fire false positives.

### Background pause

By default the underlying sensor / location-manager subscription is silently paused while the app is backgrounded and resumed on foreground — the JS callback, declination, and other settings are preserved across the pause. To opt out (e.g. for a fitness tracker that needs heading while screen-off):

```ts
NitroCompass.setPauseOnBackground(false)
```

## Troubleshooting

### Heading is consistently off by N degrees

You're seeing magnetic heading; you wanted true-north. Apply declination from a WMM model — see [True-north heading from location](#true-north-heading-from-location).

If the offset is much larger than expected (>30°), the device is likely in a building with steel framing or near a strong electromagnetic source; check `interfering` and `lastFieldMicroTesla` via `getDebugInfo()`.

### Heading is jittery

- **Android**: increase `setSmoothing` damping — try `0.1` or `0.05` (default is `0.2`). Smaller α = more smoothing.
- **Both platforms**: increase `filterDegrees` — `2` or `3` is plenty for a UI dial.
- For 60 fps animations, subscribe with `addHeadingListener` and write directly into a Reanimated shared value (see the [Reanimated recipe](#smooth-dial-animation-reanimated)).

### Calibration banner won't clear

Call `recalibrate()` (or expose a "Refresh" button to the user). On Android this re-registers the sensor listeners, which often nudges the driver to re-evaluate calibration. The user still has to move the device — this just clears cached state so progress is reflected promptly.

If the banner clears and immediately re-shows, the device is likely under sustained interference — check `interfering` and walk away from the source.

### iOS: `start()` throws `Location authorization denied`

The user has denied location permission in Settings. Drive the prompt via the hook:

```tsx
const { permission, requestPermission } = useCompass()
if (permission === 'unknown') requestPermission()
```

iOS does not re-prompt once permission is denied — direct the user to Settings via `Linking.openSettings()`.

### Android: heading is silent, no events

- Verify `hasCompass` is `true`. The Android emulator has a faked magnetometer; on a real device, `getDefaultSensor(TYPE_MAGNETIC_FIELD)` should return non-null.
- Wrap the start in a try/catch — `subscribe` will throw if either accelerometer or magnetometer is missing on the device (extremely rare on modern hardware). Always gate `subscribe()` on `hasCompass()` so the throw is the exceptional path, not the normal one.

### Android: devices without a magnetometer

A small fraction of Android hardware (some budget phones, rugged industrial units, ChromeOS tablets) ships without a magnetometer. The library:

- Returns `false` from `hasCompass()` on those devices — always check it before subscribing.
- Throws `IllegalStateException("No magnetometer on this device")` from `subscribe()` if you bypass the guard. The throw is contained to the calling frame: it does **not** propagate from any internal `Application.ActivityLifecycleCallbacks`, so a missing sensor cannot crash the host app on foreground transitions.
- Declares `<uses-feature android:name="android.hardware.sensor.compass" android:required="false" />` in its manifest, so Play Store metadata correctly reflects that the library tolerates missing hardware. Override to `required="true"` in your app manifest if your product is unusable without a compass.

### Simulator shows no heading

The iOS Simulator has no compass hardware — testing requires a physical device. The Android emulator's magnetometer is faked and stationary at a single point; it'll respond to manual rotation in the emulator's "Sensors" panel but won't track movement.

## Example app

A bare React Native CLI app under [example/](./example) (RN 0.85.3, New Arch enabled) consumes the library via a local symlink. It demos the full surface — `useCompass()` for the readout, calibration / interference banners, a Reanimated-driven dial, location-tightened interference via `react-native-geolocation-service`, and a collapsible debug panel polling `getDebugInfo()`. Use it to test changes on a real device — the iOS Simulator has no compass.

```sh
cd example
npm install                                           # symlinks ../ as react-native-nitro-compass
cd ios && bundle install && bundle exec pod install   # iOS only

# back in example/
npm start                                             # Metro
npm run ios -- --device                               # physical iPhone
npm run android                                       # physical device or emulator
```

If you change the Nitro spec or any native source, regenerate and rebuild:

```sh
# from the repo root
npm run codegen
# then in example/
cd ios && bundle exec pod install && cd ..
npm run ios       # or npm run android
```

## Acknowledgments

The Android sensor pattern (raw mag + accel fusion via `getRotationMatrix`, surface-rotation remapping, `getOrientation` extraction, EMA on `(sin θ, cos θ)`) is adapted from the MIT-licensed [Andromeda](https://github.com/kylecorry31/andromeda) sensor library by Kyle Corry, which powers the [Trail Sense](https://github.com/kylecorry31/Trail-Sense) wilderness navigation app.

Bootstrapped with [create-nitro-module](https://github.com/patrickkabwe/create-nitro-module).

## License

[MIT](./LICENSE)
