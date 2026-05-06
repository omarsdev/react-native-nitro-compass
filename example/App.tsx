/**
 * NitroCompass example app — minimal screen that exercises the
 * `hasCompass`, `start`, and `stop` API surface with a live dial.
 */

import { useEffect, useState } from 'react';
import {
  Animated,
  Easing,
  Pressable,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  NitroCompass,
  type CompassSample,
} from 'react-native-nitro-compass';

const cardinal = (deg: number) => {
  const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  return dirs[Math.round(deg / 45) % 8];
};

function App() {
  const [sample, setSample] = useState<CompassSample | null>(null);
  const [running, setRunning] = useState(false);
  const [hasCompass, setHasCompass] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rotation] = useState(() => new Animated.Value(0));

  useEffect(() => {
    try {
      setHasCompass(NitroCompass.hasCompass());
    } catch (e) {
      setError(String(e));
    }
  }, []);

  useEffect(() => {
    if (!running) {
      return;
    }
    try {
      NitroCompass.start(1, next => {
        setSample(next);
        Animated.timing(rotation, {
          toValue: -next.heading,
          duration: 80,
          easing: Easing.linear,
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
  }, [running, rotation]);

  const spin = rotation.interpolate({
    inputRange: [-360, 0],
    outputRange: ['-360deg', '0deg'],
  });

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#111" />
      <Text style={styles.title}>NitroCompass</Text>
      <Text style={styles.meta}>
        hasCompass: {hasCompass === null ? '…' : hasCompass ? 'yes' : 'no'}
      </Text>

      <Animated.View style={[styles.dial, { transform: [{ rotate: spin }] }]}>
        <Text style={[styles.tick, styles.tickN]}>N</Text>
        <Text style={[styles.tick, styles.tickE]}>E</Text>
        <Text style={[styles.tick, styles.tickS]}>S</Text>
        <Text style={[styles.tick, styles.tickW]}>W</Text>
        <View style={styles.needle} />
      </Animated.View>

      <Text style={styles.heading}>
        {sample ? `${sample.heading.toFixed(1)}°` : '—'}
      </Text>
      <Text style={styles.cardinal}>
        {sample ? cardinal(sample.heading) : ''}
      </Text>
      <Text style={styles.accuracy}>
        accuracy:{' '}
        {sample
          ? sample.accuracy < 0
            ? 'unknown'
            : `±${sample.accuracy.toFixed(1)}°`
          : '—'}
      </Text>

      <Pressable
        onPress={() => setRunning(r => !r)}
        style={({ pressed }) => [
          styles.button,
          {
            opacity: pressed ? 0.7 : 1,
            backgroundColor: running ? '#b00' : '#0a7',
          },
        ]}>
        <Text style={styles.buttonText}>{running ? 'Stop' : 'Start'}</Text>
      </Pressable>

      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const DIAL_SIZE = 240;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#111',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 12,
  },
  title: { color: '#fff', fontSize: 22, fontWeight: '600' },
  meta: { color: '#888', fontSize: 13 },
  dial: {
    width: DIAL_SIZE,
    height: DIAL_SIZE,
    borderRadius: DIAL_SIZE / 2,
    borderWidth: 2,
    borderColor: '#444',
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 16,
  },
  tick: {
    color: '#ddd',
    fontSize: 16,
    fontWeight: '600',
    position: 'absolute',
  },
  tickN: { top: 8, color: '#f55' },
  tickE: { right: 8 },
  tickS: { bottom: 8 },
  tickW: { left: 8 },
  needle: {
    position: 'absolute',
    top: 12,
    width: 4,
    height: DIAL_SIZE / 2 - 12,
    backgroundColor: '#f55',
    borderRadius: 2,
  },
  heading: { color: '#fff', fontSize: 40, fontVariant: ['tabular-nums'] },
  cardinal: { color: '#aaa', fontSize: 18, letterSpacing: 2 },
  accuracy: { color: '#888', fontSize: 13 },
  button: {
    marginTop: 16,
    paddingHorizontal: 28,
    paddingVertical: 12,
    borderRadius: 24,
  },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  error: {
    color: '#f88',
    fontSize: 12,
    marginTop: 8,
    textAlign: 'center',
  },
});

export default App;
