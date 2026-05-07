import {Pressable, Text, View} from 'react-native';
import type {AccuracyQuality} from 'react-native-nitro-compass';
import {NitroCompass} from 'react-native-nitro-compass';
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
 *
 * The calibration banner exposes a Refresh button that calls
 * `NitroCompass.recalibrate()`. Different OEMs respond to different
 * motions (figure-8, pitching, rolling) so the copy asks for
 * "different directions" generically; the button gives the user a
 * deterministic way to re-evaluate state when motion alone hasn't
 * unstuck the bucket.
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
        <View style={[styles.banner, styles.bannerCalibration]}>
          <Text style={styles.bannerText}>
            ⚠  Calibration needed — tilt and rotate the device in different
            directions until accuracy improves.
          </Text>
          <Pressable
            onPress={() => NitroCompass.recalibrate()}
            style={({pressed}) => [
              styles.refreshButton,
              {opacity: pressed ? 0.7 : 1},
            ]}>
            <Text style={styles.refreshButtonText}>Refresh</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}
