## [1.0.6](https://github.com/omarsdev/react-native-nitro-compass/compare/v1.0.5...v1.0.6) (2026-05-07)

### 💨 Performance Improvements

* **example:** smooth dial via Reanimated + direct sensor subscription ([1f59133](https://github.com/omarsdev/react-native-nitro-compass/commit/1f5913386bfec0747a8dcd9e7fda7f0dd5665cd5))

## [1.0.5](https://github.com/omarsdev/react-native-nitro-compass/compare/v1.0.4...v1.0.5) (2026-05-07)

### 🛠️ Other changes

* **deps:** bump com.android.tools.build:gradle in /android ([#2](https://github.com/omarsdev/react-native-nitro-compass/issues/2)) ([8332001](https://github.com/omarsdev/react-native-nitro-compass/commit/833200125f54aaa29e1241529456042eb93c8246))

## [1.0.4](https://github.com/omarsdev/react-native-nitro-compass/compare/v1.0.3...v1.0.4) (2026-05-07)

### 🛠️ Other changes

* **deps:** bump xcodeproj from 1.25.1 to 1.27.0 in /example ([#5](https://github.com/omarsdev/react-native-nitro-compass/issues/5)) ([48d9787](https://github.com/omarsdev/react-native-nitro-compass/commit/48d97874df728f31df929ddf00f2c799648815fe))

## [1.0.3](https://github.com/omarsdev/react-native-nitro-compass/compare/v1.0.2...v1.0.3) (2026-05-07)

### 🛠️ Other changes

* **deps:** bump actions/cache from 4 to 5 ([#1](https://github.com/omarsdev/react-native-nitro-compass/issues/1)) ([d55abd7](https://github.com/omarsdev/react-native-nitro-compass/commit/d55abd70ad2cc728e3357f22dc705b58614241ca))
* **deps:** bump actions/checkout from 4 to 6 ([#3](https://github.com/omarsdev/react-native-nitro-compass/issues/3)) ([375e782](https://github.com/omarsdev/react-native-nitro-compass/commit/375e78263326163d724d43d0b5effec69e975fd5))
* **deps:** bump concurrent-ruby from 1.3.3 to 1.3.6 in /example ([#4](https://github.com/omarsdev/react-native-nitro-compass/issues/4)) ([2f44e62](https://github.com/omarsdev/react-native-nitro-compass/commit/2f44e62a089eac9649f1f8baadd7c02e57caca32))

## [1.0.2](https://github.com/omarsdev/react-native-nitro-compass/compare/v1.0.1...v1.0.2) (2026-05-07)

### 🛠️ Other changes

* **deps-dev:** bump @types/jest from 29.5.14 to 30.0.0 ([#9](https://github.com/omarsdev/react-native-nitro-compass/issues/9)) ([6fb06ba](https://github.com/omarsdev/react-native-nitro-compass/commit/6fb06ba15e5a5d54a75d9c8f549c90152bb86100))
* **deps-dev:** bump the react-native-cli group across 1 directory with 3 updates ([#7](https://github.com/omarsdev/react-native-nitro-compass/issues/7)) ([4fda4d5](https://github.com/omarsdev/react-native-nitro-compass/commit/4fda4d5d8509e2031989ef7bf14e4189f0811b70))

## [1.0.1](https://github.com/omarsdev/react-native-nitro-compass/compare/v1.0.0...v1.0.1) (2026-05-07)

### 🛠️ Other changes

* **deps-dev:** bump react-native from 0.84.1 to 0.85.3 ([9fe69b4](https://github.com/omarsdev/react-native-nitro-compass/commit/9fe69b4e682aef4cd97b57f36918fb20f27a5d2e))

## 1.0.0 (2026-05-07)

### ✨ Features

* add cli example app for testing ([2da440e](https://github.com/omarsdev/react-native-nitro-compass/commit/2da440e17f04c7416cf5f861cfcd67839bd006fc))
* add getCurrentHeading, setDeclination, setOnCalibrationNeeded ([8a1fc82](https://github.com/omarsdev/react-native-nitro-compass/commit/8a1fc8283103554090b486b7bbd8ac8f97f0dea9))
* Android stale-sample watchdog for OEM sensor stalls ([4527f0b](https://github.com/omarsdev/react-native-nitro-compass/commit/4527f0b6fbbdbf76e7ef188011b6972a4b59ec4b))
* magnetic interference detection + example overhaul ([32cf3ea](https://github.com/omarsdev/react-native-nitro-compass/commit/32cf3eae462dc4de69cda984d86dc3d3db269c87))
* permission API + cross-platform reliability fixes ([21a9941](https://github.com/omarsdev/react-native-nitro-compass/commit/21a9941ab2bb900132fff7a9f2e4b9f4a2e0a4b2))
* phase 4 hardening — iOS deinit, Android C7 fix, background pause/resume ([71801f3](https://github.com/omarsdev/react-native-nitro-compass/commit/71801f3e19bb1ef4a9675bf9c26573dd6fc7b5eb))
* phase 6 DX — isStarted, setFilter, getDiagnostics ([95e6fdf](https://github.com/omarsdev/react-native-nitro-compass/commit/95e6fdf88ae2133889af5bbad1206477b2386a2d))
* useCompass hook + multi-listener fan-out ([b4c52c5](https://github.com/omarsdev/react-native-nitro-compass/commit/b4c52c5c627885e52c07bcf52a689c1223e6a92a))

### 🐛 Bug Fixes

* iOS interference detection — use calibrated magnetic field ([a5e604f](https://github.com/omarsdev/react-native-nitro-compass/commit/a5e604f79f0a8b915cbcb3fd460532a1aeb33293))
* iOS main-thread CLLocationManager init + prepare script ([84d4644](https://github.com/omarsdev/react-native-nitro-compass/commit/84d46449130c5e16bd5c237bdb16dfac06b63975))
* phase 1 correctness — iOS orientation, Android stop() race, filter=0 contract ([f2b094c](https://github.com/omarsdev/react-native-nitro-compass/commit/f2b094cfb4f4329a498090e2bdb90240a0b9d0a6))
* prefer activity display for surface rotation on Android (foldables/multi-window) ([fc029df](https://github.com/omarsdev/react-native-nitro-compass/commit/fc029df7ab6de9fc1fd4d6f4b6a866c9976b3b8b))

### 🔄 Code Refactors

* split example into focused components, dogfood useCompass ([b6f3cf9](https://github.com/omarsdev/react-native-nitro-compass/commit/b6f3cf9472a092a9a4a4344a9ee97529ef20a7a2))

### 🛠️ Other changes

* **deps-dev:** bump react and @types/react ([dc4f874](https://github.com/omarsdev/react-native-nitro-compass/commit/dc4f874022bd09568b3a2a894641cae601be37cf))
* phase 3 packaging — Expo config plugin, JS CI, fix repo URLs ([f9e3e4f](https://github.com/omarsdev/react-native-nitro-compass/commit/f9e3e4fc448d20fb5d5c74a32f95989f692fc288))
* phase 5 polish — engines, type smoke test, tarball cleanup, README ([794da37](https://github.com/omarsdev/react-native-nitro-compass/commit/794da37f6692b0b04f819ebf7a61521f8d886898))
