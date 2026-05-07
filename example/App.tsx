/**
 * NitroCompass example — dogfoods the bundled `useCompass()` hook.
 *
 * Layout: this file owns the screen orchestration (state for the four
 * UI knobs + the hook call). All visual subunits live in
 * `./components/*` and the StyleSheet lives in `./styles`.
 */
import {useState} from 'react';
import {Pressable, ScrollView, StatusBar, Text, View} from 'react-native';
import {SafeAreaProvider, SafeAreaView} from 'react-native-safe-area-context';
import {useCompass} from 'react-native-nitro-compass';

import {Alerts} from './components/Alerts';
import {Compass} from './components/Compass';
import {Controls} from './components/Controls';
import {DebugPanel} from './components/DebugPanel';
import {Header} from './components/Header';
import {Readout} from './components/Readout';
import {DEMO_DECLINATION_DEG, type Filter, type Smoothing} from './utils';
import {styles} from './styles';

function CompassScreen() {
  const [running, setRunning] = useState(false);
  const [filter, setFilter] = useState<Filter>(1);
  const [smoothing, setSmoothing] = useState<Smoothing>(0.2);
  const [pauseOnBackground, setPauseOnBackground] = useState(true);
  const [trueNorthDemo, setTrueNorthDemo] = useState(false);

  const {reading, quality, interfering, hasCompass, diagnostics} = useCompass({
    filterDegrees: filter,
    smoothingAlpha: smoothing,
    declination: trueNorthDemo ? DEMO_DECLINATION_DEG : 0,
    pauseOnBackground,
    enabled: running,
  });

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
