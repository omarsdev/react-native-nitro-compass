import {Pressable, Switch, Text, View} from 'react-native';
import {FILTERS, type Filter} from '../utils';
import {styles} from '../styles';

interface Props {
  filter: Filter;
  onFilterChange: (f: Filter) => void;
  pauseOnBackground: boolean;
  onPauseOnBackgroundChange: (b: boolean) => void;
  trueNorthDemo: boolean;
  onTrueNorthDemoChange: (b: boolean) => void;
}

export function Controls({
  filter,
  onFilterChange,
  pauseOnBackground,
  onPauseOnBackgroundChange,
  trueNorthDemo,
  onTrueNorthDemoChange,
}: Props) {
  return (
    <View style={styles.controls}>
      <View style={styles.row}>
        <Text style={styles.label}>Filter</Text>
        <View style={styles.segmented}>
          {FILTERS.map(deg => {
            const active = filter === deg;
            return (
              <Pressable
                key={deg}
                onPress={() => onFilterChange(deg)}
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
          onValueChange={onPauseOnBackgroundChange}
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
          onValueChange={onTrueNorthDemoChange}
          thumbColor="#fff"
          trackColor={{false: '#333', true: '#0a7'}}
        />
      </View>
    </View>
  );
}
