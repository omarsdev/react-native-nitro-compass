import {Text, View} from 'react-native';
import type {AccuracyQuality, CompassSample} from 'react-native-nitro-compass';
import {cardinal, qualityColor} from '../utils';
import {styles} from '../styles';

interface Props {
  reading: CompassSample | null;
  quality: AccuracyQuality | null;
}

export function Readout({reading, quality}: Props) {
  return (
    <View style={styles.readout}>
      <Text style={styles.heading}>
        {reading ? `${reading.heading.toFixed(0)}°` : '—'}
      </Text>
      <Text style={styles.cardinal}>
        {reading ? cardinal(reading.heading) : ''}
      </Text>
      <View style={styles.accRow}>
        <View
          style={[styles.accDot, {backgroundColor: qualityColor(quality)}]}
        />
        <Text style={styles.accuracy}>
          {reading
            ? reading.accuracy < 0
              ? 'accuracy unknown'
              : `±${reading.accuracy.toFixed(0)}°`
            : '—'}
          {quality ? ` · ${quality}` : ''}
        </Text>
      </View>
    </View>
  );
}
