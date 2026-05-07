/**
 * Live introspection of `NitroCompass.getDebugInfo()` rendered as a
 * collapsible footer. Intended to make user bug reports
 * self-diagnosing: have the user open this panel during a misbehaving
 * session and screenshot the values.
 */
import {useEffect, useState} from 'react';
import {Pressable, Text, View} from 'react-native';
import {NitroCompass, type DebugInfo} from 'react-native-nitro-compass';
import {styles} from '../styles';

const POLL_MS = 250;

export function DebugPanel() {
  const [open, setOpen] = useState(false);
  const [info, setInfo] = useState<DebugInfo | null>(null);

  useEffect(() => {
    if (!open) return;
    const tick = () => {
      try {
        setInfo(NitroCompass.getDebugInfo());
      } catch {
        // Native side absent (e.g. web target) or transiently throwing
        // — keep the panel mounted, just don't update.
      }
    };
    tick();
    const id = setInterval(tick, POLL_MS);
    return () => clearInterval(id);
  }, [open]);

  return (
    <View style={styles.debugPanel}>
      <Pressable
        onPress={() => setOpen(o => !o)}
        style={({pressed}) => [
          styles.debugToggle,
          {opacity: pressed ? 0.6 : 1},
        ]}>
        <Text style={styles.debugToggleText}>
          {open ? '▾ Debug' : '▸ Debug'}
        </Text>
      </Pressable>
      {open && info && (
        <View style={styles.debugBody}>
          <Row k="interferenceActive" v={String(info.interferenceActive)} />
          <Row
            k="usingUncalibratedMag"
            v={String(info.usingUncalibratedMag)}
          />
          <Row
            k="hasGameRotationVector"
            v={String(info.hasGameRotationVector)}
          />
          <Row k="lastField (µT)" v={fmtField(info.lastFieldMicroTesla)} />
          <Row
            k="expectedField (µT)"
            v={fmtField(info.expectedFieldMicroTesla)}
          />
          <Row k="fusedYaw (°)" v={fmtAngle(info.fusedYawDeg)} />
          <Row
            k="yawRate (°/s)"
            v={info.lastYawRateDegPerS.toFixed(2)}
          />
          <Row
            k="sinceBiasJump"
            v={fmtMs(info.msSinceLastBiasJump)}
          />
        </View>
      )}
    </View>
  );
}

function Row({k, v}: {k: string; v: string}) {
  return (
    <View style={styles.debugRow}>
      <Text style={styles.debugKey}>{k}</Text>
      <Text style={styles.debugValue}>{v}</Text>
    </View>
  );
}

function fmtField(n: number): string {
  return n === -1 ? '—' : n.toFixed(1);
}

function fmtAngle(n: number): string {
  return Number.isNaN(n) ? '—' : n.toFixed(1);
}

function fmtMs(ms: number): string {
  if (ms === -1) return '—';
  if (ms < 1000) return `${ms} ms`;
  return `${(ms / 1000).toFixed(1)} s`;
}
