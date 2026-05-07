import {Pressable, Switch, Text, View} from 'react-native';
import {FILTERS, SMOOTHINGS, type Filter, type Smoothing} from '../utils';
import {styles} from '../styles';

interface Props {
  filter: Filter;
  onFilterChange: (f: Filter) => void;
  smoothing: Smoothing;
  onSmoothingChange: (s: Smoothing) => void;
  pauseOnBackground: boolean;
  onPauseOnBackgroundChange: (b: boolean) => void;
  trueNorthDemo: boolean;
  onTrueNorthDemoChange: (b: boolean) => void;
}

export function Controls({
  filter,
  onFilterChange,
  smoothing,
  onSmoothingChange,
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
        <View>
          <Text style={styles.label}>Smoothing</Text>
          <Text style={styles.labelSub}>Android only — iOS filters natively</Text>
        </View>
        <View style={styles.segmented}>
          {SMOOTHINGS.map(({label, alpha}) => {
            const active = smoothing === alpha;
            return (
              <Pressable
                key={label}
                onPress={() => onSmoothingChange(alpha)}
                style={[styles.segment, active && styles.segmentActive]}>
                <Text
                  style={[
                    styles.segmentText,
                    active && styles.segmentTextActive,
                  ]}>
                  {label}
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
