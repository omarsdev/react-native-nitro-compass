import {Text, View} from 'react-native';
import type {SensorKind} from 'react-native-nitro-compass';
import {sensorLabel} from '../utils';
import {styles} from '../styles';

interface Props {
  sensorKind: SensorKind | undefined;
}

export function Header({sensorKind}: Props) {
  return (
    <View style={styles.header}>
      <Text style={styles.title}>NitroCompass</Text>
      <Text style={styles.sensorChip}>{sensorLabel(sensorKind)}</Text>
    </View>
  );
}
