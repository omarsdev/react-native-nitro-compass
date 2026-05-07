import {useEffect, useRef} from 'react';
import {Animated, Easing, Text, View} from 'react-native';
import {CARDINALS, TICK_DEGS} from '../utils';
import {styles} from '../styles';

interface Props {
  /** Current heading in degrees, [0, 360). `null` if no sample yet. */
  heading: number | null;
}

/**
 * The rotating compass dial. Owns its animation state internally so the
 * parent only has to feed in the latest heading. Uses an unwrapped angle
 * so 359° → 1° animates +2°, not -358°.
 */
export function Compass({heading}: Props) {
  const rotation = useRef(new Animated.Value(0)).current;
  const lastUnwrappedRef = useRef(0);

  useEffect(() => {
    if (heading == null) {
      return;
    }
    const last = lastUnwrappedRef.current;
    const wrapped = ((last % 360) + 360) % 360;
    let delta = heading - wrapped;
    if (delta > 180) {
      delta -= 360;
    } else if (delta < -180) {
      delta += 360;
    }
    const target = last + delta;
    lastUnwrappedRef.current = target;
    Animated.timing(rotation, {
      toValue: -target,
      duration: 90,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();
  }, [heading, rotation]);

  const spin = rotation.interpolate({
    inputRange: [0, 360],
    outputRange: ['0deg', '360deg'],
  });

  return (
    <View style={styles.dialWrap}>
      <Animated.View style={[styles.dial, {transform: [{rotate: spin}]}]}>
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
