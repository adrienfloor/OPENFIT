import { useEffect, useRef } from 'react';
import { Animated, Easing, View, StyleSheet } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { colors } from '../theme';

interface Props {
  /** Diameter in px. */
  size?: number;
  /** Stroke colour; defaults to brand accent. */
  color?: string;
  /** Optional inline style on the wrapper (margin, alignSelf, etc). */
  style?: React.ComponentProps<typeof View>['style'];
}

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

/**
 * Themed replacement for the platform ActivityIndicator. A 3/4 stroke arc
 * spinning at constant velocity in the brand accent. Using react-native-svg
 * (already a dep) keeps the look identical across Android versions instead
 * of inheriting Material's per-version progress styling.
 */
export function Loader({ size = 28, color = colors.accent, style }: Props) {
  const rotation = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(rotation, {
        toValue: 1,
        duration: 900,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [rotation]);

  const spin = rotation.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  const strokeWidth = Math.max(2, Math.round(size / 9));
  const r = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * r;
  // Show ~75 % of the circumference, like the iOS spinner arc.
  const dash = circumference * 0.75;
  const gap = circumference - dash;

  return (
    <View style={[styles.wrap, { width: size, height: size }, style]}>
      <Animated.View style={{ transform: [{ rotate: spin }] }}>
        <Svg width={size} height={size}>
          <AnimatedCircle
            cx={size / 2}
            cy={size / 2}
            r={r}
            stroke={color}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            fill="none"
            strokeDasharray={`${dash} ${gap}`}
          />
        </Svg>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'center' },
});
