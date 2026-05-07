import {Text, View} from 'react-native';
import type {AccuracyQuality} from 'react-native-nitro-compass';
import {styles} from '../styles';

interface Props {
  interfering: boolean;
  quality: AccuracyQuality | null;
}

/**
 * Two stacked warning banners. Calibration fires when the bucket drops
 * to `'low'` or `'unreliable'`; interference fires whenever raw mag
 * field magnitude leaves the Earth band — these often co-occur but
 * are surfaced separately so the consumer can show distinct copy.
 */
export function Alerts({interfering, quality}: Props) {
  const showCalibration = quality === 'unreliable' || quality === 'low';
  if (!interfering && !showCalibration) {
    return null;
  }

  return (
    <View style={styles.banners}>
      {interfering && (
        <Text style={[styles.banner, styles.bannerInterference]}>
          ⚠  Magnetic interference — move away from electronics or metal.
        </Text>
      )}
      {showCalibration && (
        <Text style={[styles.banner, styles.bannerCalibration]}>
          ⚠  Calibration needed — wave the device in a figure-8.
        </Text>
      )}
    </View>
  );
}
