import { useEffect, useRef } from 'react';
import { Animated, View } from 'react-native';
import { colors } from './theme';

export default function TypingDots({ size = 7, color = colors.pink }) {
  const vals = useRef([0, 1, 2].map(() => new Animated.Value(0))).current;
  useEffect(() => {
    const loops = vals.map((v, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(i * 140),
          Animated.timing(v, { toValue: 1, duration: 320, useNativeDriver: true }),
          Animated.timing(v, { toValue: 0, duration: 320, useNativeDriver: true }),
          Animated.delay(Math.max(0, (2 - i) * 140)),
        ]),
      ),
    );
    loops.forEach((l) => l.start());
    return () => loops.forEach((l) => l.stop());
  }, [vals]);

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, height: size + 8 }} accessibilityLabel="Loading">
      {vals.map((v, i) => (
        <Animated.View
          key={i}
          style={{
            width: size, height: size, borderRadius: size / 2, backgroundColor: color,
            opacity: v.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1] }),
            transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [0, -4] }) }],
          }}
        />
      ))}
    </View>
  );
}
