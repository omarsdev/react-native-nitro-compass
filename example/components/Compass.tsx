import {useEffect, useRef} from 'react';
import {Text, View} from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import {addHeadingListener} from 'react-native-nitro-compass';
import {CARDINALS, TICK_DEGS} from '../utils';
import {styles} from '../styles';

interface Props {
  /** Mirrors the parent's start/stop. When false the dial holds its
   *  last position instead of unsubscribing the visual itself — the
   *  underlying sensor is still gated by the parent's `useCompass`. */
  enabled: boolean;
}

/**
 * The rotating compass dial. Subscribes to the heading stream
 * directly so each sensor sample writes a Reanimated shared value on
 * the UI thread — the dial never triggers a React render. Uses an
 * unwrapped angle so 359° → 1° animates +2°, not -358°.
 */
export function Compass({enabled}: Props) {
  const angle = useSharedValue(0);
  const lastRef = useRef(0);

  useEffect(() => {
    if (!enabled) {
      return;
    }
    return addHeadingListener(({heading}) => {
      const last = lastRef.current;
      const wrapped = ((last % 360) + 360) % 360;
      let delta = heading - wrapped;
      if (delta > 180) {
        delta -= 360;
      } else if (delta < -180) {
        delta += 360;
      }
      const target = last + delta;
      lastRef.current = target;
      angle.value = withTiming(target, {
        duration: 80,
        easing: Easing.out(Easing.quad),
      });
    });
  }, [enabled, angle]);

  const dialStyle = useAnimatedStyle(() => ({
    transform: [{rotate: `${-angle.value}deg`}],
  }));

  return (
    <View style={styles.dialWrap}>
      <Animated.View style={[styles.dial, dialStyle]}>
        {TICK_DEGS.map(deg => {
          const major = deg % 90 === 0;
          return (
            <View
              key={deg}
              pointerEvents="none"
              style={[styles.spoke, {transform: [{rotate: `${deg}deg`}]}]}>
              <View
                style={[
                  styles.tick,
                  {
                    height: major ? 14 : 8,
                    width: major ? 3 : 2,
                    backgroundColor: deg === 0 ? '#f55' : '#555',
                  },
                ]}
              />
            </View>
          );
        })}

        {CARDINALS.map(({deg, label, isNorth}) => (
          <View
            key={label}
            pointerEvents="none"
            style={[styles.spoke, {transform: [{rotate: `${deg}deg`}]}]}>
            <Text
              style={[styles.cardinalLabel, isNorth && styles.cardinalNorth]}>
              {label}
            </Text>
          </View>
        ))}
      </Animated.View>
      <View style={styles.needle} />
    </View>
  );
}
