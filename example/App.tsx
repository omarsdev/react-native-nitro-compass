/**
 * NitroCompass example — exercises the full library surface:
 *   hasCompass, getDiagnostics, start, stop, setFilter,
 *   setDeclination, setPauseOnBackground,
 *   setOnCalibrationNeeded, setOnInterferenceDetected.
 *
 * The dial uses an unwrapped angle so animation always takes the
 * shortest arc — no backflip when heading crosses 0° / 360°.
 */

import {useEffect, useRef, useState} from 'react';
import {
  Animated,
  Easing,
  Pressable,
  StatusBar,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import {SafeAreaProvider, SafeAreaView} from 'react-native-safe-area-context';
import {
  NitroCompass,
  type AccuracyQuality,
  type CompassSample,
  type SensorKind,
} from 'react-native-nitro-compass';

const cardinal = (deg: number) => {
  const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  return dirs[Math.round(deg / 45) % 8];
};

const sensorLabel = (k: SensorKind | undefined) => {
  switch (k) {
    case 'rotationVector':
      return 'rotation-vector (fused)';
    case 'geomagneticRotationVector':
      return 'geomagnetic (no gyro)';
    case 'coreLocation':
      return 'CoreLocation';
    default:
      return 'no compass';
  }
};

const qualityColor = (q: AccuracyQuality | null) => {
  switch (q) {
    case 'high':
      return '#0a7';
    case 'medium':
      return '#cb0';
    case 'low':
      return '#c70';
    case 'unreliable':
      return '#c33';
    default:
      return '#666';
  }
};

const FILTERS = [0, 1, 2, 5] as const;
type Filter = (typeof FILTERS)[number];

const TICK_DEGS = [
  0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330,
] as const;

const CARDINALS = [
  {deg: 0, label: 'N', isNorth: true},
  {deg: 90, label: 'E', isNorth: false},
  {deg: 180, label: 'S', isNorth: false},
  {deg: 270, label: 'W', isNorth: false},
] as const;

// Demo offset to visualize that setDeclination shifts every emitted sample
// natively. Real apps should pull declination from a model like
// `geomagnetism` keyed on the user's lat/lon.
const DEMO_DECLINATION_DEG = 5;

function CompassScreen() {
  const [sample, setSample] = useState<CompassSample | null>(null);
  const [running, setRunning] = useState(false);
  const [hasCompass, setHasCompass] = useState<boolean | null>(null);
  const [sensorKind, setSensorKind] = useState<SensorKind | undefined>();
  const [quality, setQuality] = useState<AccuracyQuality | null>(null);
  const [interfering, setInterfering] = useState(false);
  const [filter, setFilter] = useState<Filter>(1);
  const [pauseOnBackground, setPauseOnBackground] = useState(true);
  const [trueNorthDemo, setTrueNorthDemo] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const rotation = useRef(new Animated.Value(0)).current;
  const lastUnwrappedRef = useRef(0);

  // One-shot capability probe.
  useEffect(() => {
    try {
      setHasCompass(NitroCompass.hasCompass());
      setSensorKind(NitroCompass.getDiagnostics()?.sensor);
    } catch (e) {
      setError(String(e));
    }
  }, []);

  // Persistent callbacks survive stop/start; register once.
  useEffect(() => {
    NitroCompass.setOnCalibrationNeeded(setQuality);
    NitroCompass.setOnInterferenceDetected(setInterfering);
  }, []);

  // Live-tuneable knobs.
  useEffect(() => {
    NitroCompass.setFilter(filter);
  }, [filter]);

  useEffect(() => {
    NitroCompass.setPauseOnBackground(pauseOnBackground);
  }, [pauseOnBackground]);

  useEffect(() => {
    NitroCompass.setDeclination(trueNorthDemo ? DEMO_DECLINATION_DEG : 0);
  }, [trueNorthDemo]);

  // Subscription lifecycle. `filter` is intentionally captured at start
  // time only — toggling it while running re-calls setFilter via the
  // effect above, no need to tear down the subscription.
  useEffect(() => {
    if (!running) {
      return;
    }
    try {
      NitroCompass.start(filter, next => {
        setSample(next);
        // Shortest-arc unwrap: keep extending an integer-track angle so
        // 359° → 1° animates +2°, not -358°.
        const last = lastUnwrappedRef.current;
        const wrapped = ((last % 360) + 360) % 360;
        let delta = next.heading - wrapped;
        if (delta > 180) {
          delta -= 360;
        } else if (delta < -180) {
          delta += 360;
        }
        const target = last + delta;
        lastUnwrappedRef.current = target;
        Animated.timing(rotation, {
          toValue: -target,
          duration: 90,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }).start();
      });
    } catch (e) {
      setError(String(e));
      setRunning(false);
    }
    return () => {
      try {
        NitroCompass.stop();
      } catch {}
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running, rotation]);

  const spin = rotation.interpolate({
    inputRange: [0, 360],
    outputRange: ['0deg', '360deg'],
  });

  const showCalibrationBanner = quality === 'unreliable' || quality === 'low';

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#0d0d10" />

      <View style={styles.header}>
        <Text style={styles.title}>NitroCompass</Text>
        <Text style={styles.sensorChip}>{sensorLabel(sensorKind)}</Text>
      </View>

      {hasCompass === false && (
        <Text style={styles.error}>This device has no compass hardware.</Text>
      )}

      <View style={styles.dialWrap}>
        <Animated.View style={[styles.dial, {transform: [{rotate: spin}]}]}>
          {TICK_DEGS.map(deg => {
            const major = deg % 90 === 0;
            return (
              <View
                key={deg}
                pointerEvents="none"
                style={[styles.spoke, {transform: [{rotate: `${deg}deg`}]}]}>
                <View
                  style={[
                    styles.tick,
                    {
                      height: major ? 14 : 8,
                      width: major ? 3 : 2,
                      backgroundColor: deg === 0 ? '#f55' : '#555',
                    },
                  ]}
                />
              </View>
            );
          })}

          {CARDINALS.map(({deg, label, isNorth}) => (
            <View
              key={label}
              pointerEvents="none"
              style={[styles.spoke, {transform: [{rotate: `${deg}deg`}]}]}>
              <Text
                style={[styles.cardinalLabel, isNorth && styles.cardinalNorth]}>
                {label}
              </Text>
            </View>
          ))}
        </Animated.View>
        <View style={styles.needle} />
      </View>

      <View style={styles.readout}>
        <Text style={styles.heading}>
          {sample ? `${sample.heading.toFixed(0)}°` : '—'}
        </Text>
        <Text style={styles.cardinal}>
          {sample ? cardinal(sample.heading) : ''}
        </Text>
        <View style={styles.accRow}>
          <View
            style={[styles.accDot, {backgroundColor: qualityColor(quality)}]}
          />
          <Text style={styles.accuracy}>
            {sample
              ? sample.accuracy < 0
                ? 'accuracy unknown'
                : `±${sample.accuracy.toFixed(0)}°`
              : '—'}
            {quality ? ` · ${quality}` : ''}
          </Text>
        </View>
      </View>

      {(interfering || showCalibrationBanner) && (
        <View style={styles.banners}>
          {interfering && (
            <Text style={[styles.banner, styles.bannerInterference]}>
              ⚠  Magnetic interference — move away from electronics or metal.
            </Text>
          )}
          {showCalibrationBanner && (
            <Text style={[styles.banner, styles.bannerCalibration]}>
              ⚠  Calibration needed — wave the device in a figure-8.
            </Text>
          )}
        </View>
      )}

      <View style={styles.controls}>
        <View style={styles.row}>
          <Text style={styles.label}>Filter</Text>
          <View style={styles.segmented}>
            {FILTERS.map(deg => {
              const active = filter === deg;
              return (
                <Pressable
                  key={deg}
                  onPress={() => setFilter(deg)}
                  style={[styles.segment, active && styles.segmentActive]}>
                  <Text
                    style={[
                      styles.segmentText,
                      active && styles.segmentTextActive,
                    ]}>
                    {deg === 0 ? 'all' : `${deg}°`}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View style={styles.row}>
          <Text style={styles.label}>Pause on background</Text>
          <Switch
            value={pauseOnBackground}
            onValueChange={setPauseOnBackground}
            thumbColor="#fff"
            trackColor={{false: '#333', true: '#0a7'}}
          />
        </View>

        <View style={styles.row}>
          <View>
            <Text style={styles.label}>True north (demo +5°)</Text>
            <Text style={styles.labelSub}>
              Real apps: pull declination from `geomagnetism`
            </Text>
          </View>
          <Switch
            value={trueNorthDemo}
            onValueChange={setTrueNorthDemo}
            thumbColor="#fff"
            trackColor={{false: '#333', true: '#0a7'}}
          />
        </View>
      </View>

      <Pressable
        onPress={() => setRunning(r => !r)}
        disabled={hasCompass === false}
        style={({pressed}) => [
          styles.button,
          {
            opacity: pressed ? 0.7 : hasCompass === false ? 0.4 : 1,
            backgroundColor: running ? '#b33' : '#0a7',
          },
        ]}>
        <Text style={styles.buttonText}>{running ? 'Stop' : 'Start'}</Text>
      </Pressable>

      {error && <Text style={styles.error}>{error}</Text>}
    </SafeAreaView>
  );
}

function App() {
  return (
    <SafeAreaProvider>
      <CompassScreen />
    </SafeAreaProvider>
  );
}

const DIAL_SIZE = 260;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0d0d10',
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  title: {color: '#fff', fontSize: 22, fontWeight: '600'},
  sensorChip: {
    color: '#aab',
    fontSize: 11,
    backgroundColor: '#1c1c22',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    overflow: 'hidden',
  },
  dialWrap: {
    alignSelf: 'center',
    width: DIAL_SIZE,
    height: DIAL_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 12,
  },
  dial: {
    width: DIAL_SIZE,
    height: DIAL_SIZE,
    borderRadius: DIAL_SIZE / 2,
    borderWidth: 1.5,
    borderColor: '#2a2a30',
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Each tick / cardinal label sits inside a dial-sized "spoke" wrapper that
  // is rotated into position. The wrapper centers its child horizontally and
  // anchors it at the top edge, so rotating the wrapper sweeps the child
  // around the dial's true geometric center — no manual trig.
  spoke: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
  },
  tick: {
    marginTop: 6,
    borderRadius: 2,
  },
  cardinalLabel: {
    marginTop: 22,
    color: '#bbb',
    fontSize: 18,
    fontWeight: '600',
  },
  cardinalNorth: {color: '#f55'},
  needle: {
    position: 'absolute',
    top: 4,
    width: 0,
    height: 0,
    borderLeftWidth: 7,
    borderRightWidth: 7,
    borderTopWidth: 0,
    borderBottomWidth: 14,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderBottomColor: '#f55',
  },
  readout: {alignItems: 'center', gap: 4, marginVertical: 4},
  heading: {
    color: '#fff',
    fontSize: 56,
    fontVariant: ['tabular-nums'],
    fontWeight: '300',
  },
  cardinal: {color: '#aaa', fontSize: 20, letterSpacing: 4},
  accRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
  },
  accDot: {width: 8, height: 8, borderRadius: 4},
  accuracy: {color: '#999', fontSize: 13},
  banners: {gap: 6, marginTop: 8},
  banner: {
    fontSize: 12,
    color: '#fff',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    overflow: 'hidden',
  },
  bannerInterference: {backgroundColor: '#a23'},
  bannerCalibration: {backgroundColor: '#a72'},
  controls: {gap: 14, marginTop: 16},
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  label: {color: '#ddd', fontSize: 14},
  labelSub: {color: '#777', fontSize: 11, marginTop: 2},
  segmented: {
    flexDirection: 'row',
    backgroundColor: '#1c1c22',
    borderRadius: 8,
    padding: 2,
  },
  segment: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  segmentActive: {backgroundColor: '#2c2c34'},
  segmentText: {color: '#888', fontSize: 12},
  segmentTextActive: {color: '#fff', fontWeight: '600'},
  button: {
    marginTop: 16,
    paddingHorizontal: 28,
    paddingVertical: 14,
    borderRadius: 28,
    alignSelf: 'center',
    minWidth: 180,
    alignItems: 'center',
  },
  buttonText: {color: '#fff', fontSize: 16, fontWeight: '600'},
  error: {color: '#f88', fontSize: 12, marginTop: 8, textAlign: 'center'},
});

export default App;
