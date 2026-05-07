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
