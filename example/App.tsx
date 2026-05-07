/**
 * NitroCompass example — dogfoods the bundled `useCompass()` hook.
 *
 * Layout: this file owns the screen orchestration (state for the four
 * UI knobs + the hook call). All visual subunits live in
 * `./components/*` and the StyleSheet lives in `./styles`.
 */
import {useEffect, useState} from 'react';
import {
  PermissionsAndroid,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  Text,
  View,
} from 'react-native';
import {SafeAreaProvider, SafeAreaView} from 'react-native-safe-area-context';
import Geolocation from 'react-native-geolocation-service';
import {useCompass} from 'react-native-nitro-compass';

import {Alerts} from './components/Alerts';
import {Compass} from './components/Compass';
import {Controls, type LocationStatus} from './components/Controls';
import {DebugPanel} from './components/DebugPanel';
import {Header} from './components/Header';
import {Readout} from './components/Readout';
import {DEMO_DECLINATION_DEG, type Filter, type Smoothing} from './utils';
import {styles} from './styles';

async function ensureLocationPermission(): Promise<boolean> {
  if (Platform.OS === 'android') {
    const result = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION,
    );
    return result === PermissionsAndroid.RESULTS.GRANTED;
  }
  // iOS — react-native-geolocation-service prompts via the existing
  // NSLocationWhenInUseUsageDescription, so we just defer to the
  // library's own request flow.
  return true;
}

function CompassScreen() {
  const [running, setRunning] = useState(false);
  const [filter, setFilter] = useState<Filter>(1);
  const [smoothing, setSmoothing] = useState<Smoothing>(0.2);
  const [pauseOnBackground, setPauseOnBackground] = useState(true);
  const [trueNorthDemo, setTrueNorthDemo] = useState(false);
  const [useLocation, setUseLocation] = useState(false);
  const [locationStatus, setLocationStatus] = useState<LocationStatus>('off');

  const {reading, quality, interfering, hasCompass, diagnostics, setLocation} =
    useCompass({
      filterDegrees: filter,
      smoothingAlpha: smoothing,
      declination: trueNorthDemo ? DEMO_DECLINATION_DEG : 0,
      pauseOnBackground,
      enabled: running,
    });

  useEffect(() => {
    if (!useLocation) {
      // Toggling off — revert to the generic 20–70 µT band.
      setLocation(NaN, NaN);
      setLocationStatus('off');
      return;
    }

    let cancelled = false;
    setLocationStatus('requesting');

    void (async () => {
      const ok = await ensureLocationPermission();
      if (cancelled) return;
      if (!ok) {
        setLocationStatus('denied');
        return;
      }
      Geolocation.getCurrentPosition(
        ({coords}) => {
          if (cancelled) return;
          setLocation(coords.latitude, coords.longitude);
          setLocationStatus({
            kind: 'located',
            lat: coords.latitude,
            lon: coords.longitude,
          });
        },
        () => {
          // Timeout / no fix — fall back to the generic band, but
          // surface the failure so the user knows why they don't see
          // a tightened gate.
          if (!cancelled) setLocationStatus('unavailable');
        },
        {enableHighAccuracy: false, timeout: 15_000, maximumAge: 60_000},
      );
    })();

    return () => {
      cancelled = true;
    };
  }, [useLocation, setLocation]);

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#0d0d10" />

      <View style={styles.topBar}>
        <Header sensorKind={diagnostics?.sensor} />
        <Pressable
          onPress={() => setRunning(r => !r)}
          disabled={!hasCompass}
          style={({pressed}) => [
            styles.topButton,
            {
              opacity: pressed ? 0.7 : !hasCompass ? 0.4 : 1,
              backgroundColor: running ? '#b33' : '#0a7',
            },
          ]}>
          <Text style={styles.topButtonText}>
            {running ? 'Stop' : 'Start'}
          </Text>
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}>
        {!hasCompass && (
          <Text style={styles.error}>
            This device has no compass hardware.
          </Text>
        )}

        <Compass enabled={running} />

        <Readout reading={reading} quality={quality} />

        <Alerts interfering={interfering} quality={quality} />

        <Controls
          filter={filter}
          onFilterChange={setFilter}
          smoothing={smoothing}
          onSmoothingChange={setSmoothing}
          pauseOnBackground={pauseOnBackground}
          onPauseOnBackgroundChange={setPauseOnBackground}
          trueNorthDemo={trueNorthDemo}
          onTrueNorthDemoChange={setTrueNorthDemo}
          useLocation={useLocation}
          onUseLocationChange={setUseLocation}
          locationStatus={locationStatus}
        />

        <DebugPanel />
      </ScrollView>
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

export default App;
