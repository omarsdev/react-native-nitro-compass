# Android Compass Stability — Research & Roadmap

Synthesized from web research + prior architecture decisions for `react-native-nitro-compass`.
Date: 2026-05-07.

---

## TL;DR

The library already made the most important architectural call right (raw accel+mag over `TYPE_ROTATION_VECTOR`). The next-best stability gains come from:

1. **Game-RV gyro fusion with mag dropout on interference** — biggest UX win.
2. **`GeomagneticField` to tighten the interference gate** — small change, sharper detection.
3. **Split + adaptive input α** — observable steadiness improvement, no API change.

Hold off on Madgwick/Mahony, Kalman, sphere-fit calibration, and FOP-as-dependency.

---

## What the library already has right

- **Raw `TYPE_ACCELEROMETER` + `TYPE_MAGNETIC_FIELD`** via `getRotationMatrix()` + `getOrientation()` — chosen because the `TYPE_ROTATION_VECTOR` HAL keeps a stateful Kalman with poisoned bias estimates after magnet exposure. Raw is stateless, instant-recovery. Confirmed by the ION/NAVIGATION 2024 paper "Robust Determination of Smartphone Heading by Mitigation of Magnetic Anomalies": *suppress* mag updates during anomalies, don't let a stateful filter absorb them.
- **Output EMA on `sin/cos`** of heading — correct for the 0/360° wraparound; mathematically equivalent to a 2-sample SLERP with linear weights. Don't change.
- **Interference → clear EMA reset + `recalibrate()`** — matches Google's Fused Orientation Provider blueprint (the Android Maps internal compass), which "suppresses heading updates during magnetic anomalies."
- **Banner copy: "tilt and rotate"** — correct. Figure-8 is folklore. Pitch+roll motion is what actually clears the OEM hard-iron bias bucket on Android.

---

## Top 3 improvements to ship next (ranked)

### 1. Game-RV gyro fusion with mag dropout — biggest UX win

Subscribe `TYPE_GAME_ROTATION_VECTOR` (gyro+accel only, no mag — explicitly **not** poisoned by magnetic events) and run a complementary blend on yaw:

```
yaw_t = α · (yaw_{t-1} + Δyaw_gyro) + (1-α) · yaw_mag     // α ≈ 0.98 at 50 Hz, T ≈ 0.49 s
yaw_t = yaw_{t-1} + Δyaw_gyro                             // when interference flag is set
```

Drop mag entirely while interference is active, let pure gyro carry heading until field clears. This is structurally what FOP does. Eliminates jitter at rest and smooths through transient interference instead of freezing at last-good.

- **Complexity:** M (~80 lines in `HybridNitroCompass.kt`, no public API change).
- **Regression risk:** Low. Game-RV is HAL-stable, not bias-poisonable. Preserves `recalibrate()` semantics. Fall back to raw mag+accel if gyro is absent.

### 2. `GeomagneticField` to tighten the interference gate

Replace the static 25–65 µT band with `expectedField ± 15 µT` derived from Android's built-in `GeomagneticField` API (ships WMM2025 in-platform — free, on-device, no network on the hot path).

- Catches weak/local interference the generic band lets through, especially at high/low latitudes (where field is 55–60 µT and the generic 65 µT ceiling lets weak interference slip).
- Bonus: free `getDeclination()` for optional true-north output.

- **Complexity:** S.
- **Regression risk:** Very low — only changes when the interference flag fires. Needs a one-time GPS fix; falls back to current band without it.

### 3. Split + adaptive input α (one PR, three sub-changes)

- **Split α** — accel α ≈ 0.10, mag α ≈ 0.20. Different noise profiles: accel carries jerk (high-frequency), mag carries hard-iron + thermal drift (low-frequency). Trust mag more on short timescales. Matches FSensor (canonical 207★ Android reference).
- **Adaptive α on |ω|** — gate on gyro magnitude. Stationary → α = 0.05; fast turn → α = 0.35. Documented in every Android compass recipe.

- **Complexity:** S.
- **Regression risk:** Low; bounded α range, can A/B against current 0.15.

---

## Anti-recommendations — research-validated, do NOT do

| Approach | Why not |
|---|---|
| **Madgwick / Mahony AHRS** | Wrong tool for compass UI. β tuning is per-device, and these filters can't *reject* mag updates — only attenuate. Reintroduces a softer version of the rotation-vector trap. |
| **Kalman on yaw** | You escaped one stateful filter; don't add another. Complementary filter is 5 lines and has identical UX behavior at this SNR. |
| **Sphere-fit calibration on `TYPE_MAGNETIC_FIELD`** | Android already runs hard-iron estimation under that channel. Re-doing it fights the OEM HAL. Use `TYPE_MAGNETIC_FIELD_UNCALIBRATED` only as an interference *signal* (bias jumps trigger EMA reset), not as a calibration replacement. |
| **Heavy output smoothing (α < 0.1)** | Feels broken. Users perceive >150 ms group delay as "compass UI is laggy." |
| **Trusting `SENSOR_STATUS_ACCURACY_HIGH`** | Well-documented to lie ("HIGH" reported while still uncalibrated). Treat `LOW`/`UNRELIABLE` as negative signals only; treat `MEDIUM`/`HIGH` as "no information." |
| **GPS bearing as compass replacement** | GPS bearing noise dominates at <3 m/s (±5–15° at walking speed). Above ~3 m/s it's more accurate than any phone compass — but expose it separately, don't fuse into heading. |
| **Figure-8 calibration copy** | Folklore. Pitch + roll is what clears the bucket on Android. (Already removed — stay removed.) |

---

## Optional later (after device validation)

4. **Expose `gpsBearing` as a separate field.** Don't fuse. Lets navigation apps prefer it above ~3 m/s. **S, very low risk.**
5. **Mag-uncalibrated bias-jump as interference signal** behind a flag. Catches car-door-magnet style events where field magnitude looks normal but bias just shifted. **M, medium risk** — needs jump-threshold tuning.
6. **Higher input rate** — `SENSOR_DELAY_GAME` (~20 ms) on mag if not already, decimate to UI rate. More samples per LP-window for the same group delay.

---

## Filter design — reference values

| Parameter | Recommended | Rationale |
|---|---|---|
| Input LP α (accel) | 0.10 | Jerk-noisy; smooth harder. |
| Input LP α (mag) | 0.20 | Drift-noisy; trust short-term, recover long-term via OEM bias est. |
| Adaptive α range (gated on \|ω\|) | 0.05 (still) → 0.35 (fast turn) | From plaw.info and Tales of Code. |
| Output EMA α | 0.20 (current default) | OK; do not go below 0.1. |
| Game-RV / mag complementary α | 0.98 / 0.02 at 50 Hz (T ≈ 0.49 s) | Canonical complementary-filter time constant. |
| Interference gate | expectedField ± 15 µT | Tighter than 25–65 µT generic band. |
| GPS-bearing-trust speed | > 3 m/s | Below this, GPS bearing noise dominates. |

---

## Public API impact

All three top recommendations land **without** changing the public API:

- `setSmoothing(alpha)` — keep semantics; alpha still controls output EMA.
- `recalibrate()` — keep; behavior unchanged externally (resets gyro integrator + mag EMA + bias state under the hood).
- `fieldStrengthMicroTesla` — keep; reported regardless of fusion strategy.
- `SensorKind` — extend with `'gameRotationVector'` value when game-RV is the active source. Existing values stay in the union.

---

## Sequencing

Ship 1 + 2 + 3 as **one PR**. They're complementary — the sharper interference gate from #2 makes the mag dropout in #1 fire at the right moments. After device validation, decide on 4–6.

---

## Sources

- [Android Position Sensors documentation](https://developer.android.com/develop/sensors-and-location/sensors/sensors_position)
- [Android `GeomagneticField` API](https://developer.android.com/reference/android/hardware/GeomagneticField)
- [Android Sensor Types (AOSP)](https://source.android.com/docs/core/interaction/sensors/sensor-types)
- [Introducing the Fused Orientation Provider API (Android Developers Blog, 2024)](https://android-developers.googleblog.com/2024/03/introducing-fused-orientation-provider-api.html)
- [Robust Determination of Smartphone Heading by Mitigation of Magnetic Anomalies (NAVIGATION/ION, 2024)](https://navi.ion.org/content/71/1/navi.632)
- [9-DoF IMU EKF with Bias Consideration (MDPI Sensors, 2022)](https://www.mdpi.com/1424-8220/22/9/3416)
- [Madgwick Filter — AHRS docs](https://ahrs.readthedocs.io/en/latest/filters/madgwick.html)
- [Madgwick original report (UW CSE466)](https://courses.cs.washington.edu/courses/cse466/14au/labs/l4/madgwick_internal_report.pdf)
- [Android Sensor Fusion Tutorial (plaw.info)](https://plaw.info/articles/sensorfusion/)
- [KalebKE / FSensor — Android Sensor Filter and Fusion (207★)](https://github.com/KalebKE/FSensor)
- [Smoothing Sensor Data with a Low-Pass Filter (Thom Nichols)](http://blog.thomnichols.org/2011/08/smoothing-sensor-data-with-a-low-pass-filter)
- [Android Acceleration Sensor: Low-Pass Filter (Kircher Electronics)](http://kircherelectronics.com/index.php/2017/12/28/android-acceleration-sensors-low-pass-filter/)
- [Smooth compass needle with low-pass filter (christine-coenen.de)](https://christine-coenen.de/blog/2014/07/02/smooth-compass-needle-in-android-or-any-angle-with-low-pass-filter/)
- [Developing a Compass Android Application (Tales of Code)](https://talesofcode.com/developing-compass-android-application/)
- [Magnetometer Calibration (Teslabs)](https://teslabs.com/articles/magnetometer-calibration/)
- [Simple and Effective Magnetometer Calibration (kriswiner)](https://github.com/kriswiner/MPU6050/wiki/Simple-and-Effective-Magnetometer-Calibration)
- [`magcal` — MATLAB sphere fitting reference](https://www.mathworks.com/help/nav/ref/magcal.html)
- [Lowpass Filter Orientation Using Quaternion SLERP (MathWorks)](https://www.mathworks.com/help/nav/ug/lowpass-filter-orientation-using-quaternion-slerp.html)
- [Implementing a Tilt-Compensated eCompass (Freescale AN4248)](https://www.mikrocontroller.net/attachment/292888/AN4248.pdf)
- [How Accurate Are Phone Compasses? (PointMe.live)](https://www.pointme.live/blog/how-accurate-are-phone-compasses.html)
- [The compass is not working on my Android phone (Stonekick)](https://stonekick.com/blog/the-compass-is-not-working-on-my-android-phone.html)
- [flutter_compass Issue #8 — accuracy reporting unreliability](https://github.com/hemanthrajv/flutter_compass/issues/8)
- [info448 Android Sensors lecture notes](https://info448-s17.github.io/lecture-notes/sensors.html)
