## [1.2.5](https://github.com/omarsdev/react-native-nitro-compass/compare/v1.2.4...v1.2.5) (2026-05-10)

### 🐛 Bug Fixes

* **android:** prevent crash on devices without magnetometer ([32aef76](https://github.com/omarsdev/react-native-nitro-compass/commit/32aef76d37f924dd514ba75970e6444eb695b8bd))
* **android:** prevent crash on devices without magnetometer ([884eba4](https://github.com/omarsdev/react-native-nitro-compass/commit/884eba45b55603b7f08ed64110af7e3c4535d40f))

## [1.2.4](https://github.com/omarsdev/react-native-nitro-compass/compare/v1.2.3...v1.2.4) (2026-05-07)

### 🛠️ Other changes

* **deps:** bump actions/setup-node from 4 to 6 ([#15](https://github.com/omarsdev/react-native-nitro-compass/issues/15)) ([7fb91cf](https://github.com/omarsdev/react-native-nitro-compass/commit/7fb91cf2b0bd07e9e08a14a2ac7dbc807b354827))

## [1.2.3](https://github.com/omarsdev/react-native-nitro-compass/compare/v1.2.2...v1.2.3) (2026-05-07)

### 🛠️ Other changes

* **deps-dev:** bump react-native-builder-bob from 0.40.18 to 0.41.0 ([#18](https://github.com/omarsdev/react-native-nitro-compass/issues/18)) ([f21ea20](https://github.com/omarsdev/react-native-nitro-compass/commit/f21ea20669b187dba03289a8e60e8467fe8d75d1))

## [1.2.2](https://github.com/omarsdev/react-native-nitro-compass/compare/v1.2.1...v1.2.2) (2026-05-07)

### 🛠️ Other changes

* **deps-dev:** bump eslint from 8.57.1 to 10.3.0 in /example ([#20](https://github.com/omarsdev/react-native-nitro-compass/issues/20)) ([1e21131](https://github.com/omarsdev/react-native-nitro-compass/commit/1e211313ddd3223c16b49bb0deee9dd0bbd2ca0d))
* **deps-dev:** bump prettier from 2.8.8 to 3.8.3 in /example ([#19](https://github.com/omarsdev/react-native-nitro-compass/issues/19)) ([ada6b9b](https://github.com/omarsdev/react-native-nitro-compass/commit/ada6b9bee1ca77aff722cf0d9b48db8079c2e9b6))
* **deps-dev:** bump react and @types/react ([#16](https://github.com/omarsdev/react-native-nitro-compass/issues/16)) ([3f32ed4](https://github.com/omarsdev/react-native-nitro-compass/commit/3f32ed4f1d8861f40501d2345f7c0e2c3f34f926))
* **deps:** bump actions/checkout from 4 to 6 ([#14](https://github.com/omarsdev/react-native-nitro-compass/issues/14)) ([f4d2a54](https://github.com/omarsdev/react-native-nitro-compass/commit/f4d2a545ac86da4dfbf1e730f13a998146c066e2))
* **deps:** bump com.android.tools.build:gradle in /android ([#13](https://github.com/omarsdev/react-native-nitro-compass/issues/13)) ([4300b9f](https://github.com/omarsdev/react-native-nitro-compass/commit/4300b9fa9deebc59b96586e9588d8dc82273900b))

## [1.2.1](https://github.com/omarsdev/react-native-nitro-compass/compare/v1.2.0...v1.2.1) (2026-05-07)

### 📚 Documentation

* **readme:** redesign for top-tier RN library structure ([c052bcb](https://github.com/omarsdev/react-native-nitro-compass/commit/c052bcba0470e322df5754171b78bced12c4f360))

## [1.2.0](https://github.com/omarsdev/react-native-nitro-compass/compare/v1.1.0...v1.2.0) (2026-05-07)

### ✨ Features

* **android:** raw-sensor heading with gyro fusion, bias-jump interference, debug API ([7a4042e](https://github.com/omarsdev/react-native-nitro-compass/commit/7a4042e6ba604c9b058078b9eac96c9ad71d3971))
* **example:** wire setLocation to react-native-geolocation-service ([3e1770f](https://github.com/omarsdev/react-native-nitro-compass/commit/3e1770fc2396c192d9c8fde90528f87b3e84fc98))
* **hook:** expose recalibrate, setLocation, permission, getCurrentHeading ([937e2f0](https://github.com/omarsdev/react-native-nitro-compass/commit/937e2f0efef526a880cfedb6f039fdf748424587))

### 🐛 Bug Fixes

* **compass:** production-readiness fixes from cross-platform audit ([78a1511](https://github.com/omarsdev/react-native-nitro-compass/commit/78a15116a8df4ec4b00208006a03ed4206bae548))

## [1.1.0](https://github.com/omarsdev/react-native-nitro-compass/compare/v1.0.9...v1.1.0) (2026-05-07)

### ✨ Features

* **android:** smoothing, accuracy fix, interference-aware quality ([90287fb](https://github.com/omarsdev/react-native-nitro-compass/commit/90287fb5b88d7ebcada650ede8065803bb04ce6a))
* **example:** wire smoothingAlpha into useCompass demo ([2847a54](https://github.com/omarsdev/react-native-nitro-compass/commit/2847a543f2a8a9154fdee104f47a7d1e6d3dfe32))
* **hook:** expose smoothingAlpha option in useCompass ([7483c91](https://github.com/omarsdev/react-native-nitro-compass/commit/7483c91223119a171d4574f5eac7fe15d2b0568f))
* **spec:** add setSmoothing(alpha) hybrid method ([532dba9](https://github.com/omarsdev/react-native-nitro-compass/commit/532dba92258817eb2887b5c45b7eb6584230d8b2))

### 🐛 Bug Fixes

* **ios:** tune heading accuracy buckets, add setSmoothing no-op ([53488d9](https://github.com/omarsdev/react-native-nitro-compass/commit/53488d9d50d71cc945af000448db3b8909630bbd))

### 📚 Documentation

* **readme:** cover accuracy buckets, smoothing, interference downgrade ([60f68a7](https://github.com/omarsdev/react-native-nitro-compass/commit/60f68a7209e96b8c82a0bd31a0210fbcc1da4684))

### 🛠️ Other changes

* **example:** switch nitro-compass dep from file: to link: ([f5689bf](https://github.com/omarsdev/react-native-nitro-compass/commit/f5689bfc6a892e8c326a8b9518cf0aa7300bea4b))

## [1.0.9](https://github.com/omarsdev/react-native-nitro-compass/compare/v1.0.8...v1.0.9) (2026-05-07)

### 📚 Documentation

* **readme:** document useCompass hook and Reanimated dial recipe ([83f6691](https://github.com/omarsdev/react-native-nitro-compass/commit/83f6691c174293f0021ef49c6b6fd142e9e8215d))

## [1.0.8](https://github.com/omarsdev/react-native-nitro-compass/compare/v1.0.7...v1.0.8) (2026-05-07)

### 🛠️ Other changes

* **npm:** standardize repo metadata for GitHub package linking ([72f7143](https://github.com/omarsdev/react-native-nitro-compass/commit/72f7143e795c2cdcf267be07dc457db23ca93659))

## [1.0.7](https://github.com/omarsdev/react-native-nitro-compass/compare/v1.0.6...v1.0.7) (2026-05-07)

### 🐛 Bug Fixes

* **android:** pin AGP to 8.12.0 to match RN gradle plugin ([7222b6a](https://github.com/omarsdev/react-native-nitro-compass/commit/7222b6a42f0608e339a2e713607c79526e1780c9))

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
