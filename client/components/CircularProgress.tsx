import React, { useEffect } from "react";
import { View, StyleSheet } from "react-native";
import Svg, { Circle, G } from "react-native-svg";
import Animated, {
  useSharedValue,
  useAnimatedProps,
  withSpring,
  useDerivedValue,
  interpolate,
  Extrapolation,
  useAnimatedStyle,
  withTiming,
  withSequence,
  SharedValue,
  runOnJS,
} from "react-native-reanimated";
import { ThemedText } from "@/components/ThemedText";
import { Colors, Typography } from "@/constants/theme";
import { useTheme } from "@/hooks/useTheme";

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

interface CircularProgressProps {
  progress: number;
  size?: number;
  strokeWidth?: number;
  label?: string;
  animated?: boolean;
}

const springConfig = {
  damping: 20,
  stiffness: 90,
  mass: 1,
};

export function CircularProgress({
  progress,
  size = 160,
  strokeWidth = 12,
  label,
  animated = true,
}: CircularProgressProps) {
  const { isDark } = useTheme();
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  
  const animatedProgress = useSharedValue(0);
  const glowOpacity = useSharedValue(0);

  useEffect(() => {
    if (animated) {
      animatedProgress.value = withSpring(progress, springConfig);
      
      if (progress >= 80) {
        glowOpacity.value = withSequence(
          withTiming(0.6, { duration: 300 }),
          withTiming(0.3, { duration: 500 })
        );
      } else {
        glowOpacity.value = withTiming(0, { duration: 300 });
      }
    } else {
      animatedProgress.value = progress;
    }
  }, [progress, animated]);

  const progressColor = progress >= 80 
    ? Colors.dark.success 
    : progress >= 50 
      ? Colors.dark.accent 
      : Colors.dark.warning;

  const animatedProps = useAnimatedProps(() => {
    const strokeDashoffset = circumference - (animatedProgress.value / 100) * circumference;
    return {
      strokeDashoffset,
    };
  });

  const displayProgress = useDerivedValue(() => {
    return Math.round(animatedProgress.value);
  });

  const glowStyle = useAnimatedStyle(() => ({
    shadowColor: progressColor,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: glowOpacity.value,
    shadowRadius: 15,
  }));

  return (
    <Animated.View style={[styles.container, glowStyle]}>
      <Svg width={size} height={size}>
        <G rotation="-90" origin={`${size / 2}, ${size / 2}`}>
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke={isDark ? Colors.dark.backgroundSecondary : Colors.light.backgroundSecondary}
            strokeWidth={strokeWidth}
            fill="none"
          />
          <AnimatedCircle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke={progressColor}
            strokeWidth={strokeWidth}
            fill="none"
            strokeDasharray={`${circumference} ${circumference}`}
            strokeLinecap="round"
            animatedProps={animatedProps}
          />
        </G>
      </Svg>
      <View style={[styles.labelContainer, { width: size, height: size }]}>
        <AnimatedPercentage progress={displayProgress} color={progressColor} />
        {label ? (
          <ThemedText style={styles.label}>{label}</ThemedText>
        ) : null}
      </View>
    </Animated.View>
  );
}

function AnimatedPercentage({ progress, color }: { progress: SharedValue<number>; color: string }) {
  const [displayValue, setDisplayValue] = React.useState(0);
  
  useDerivedValue(() => {
    const rounded = Math.round(progress.value);
    runOnJS(setDisplayValue)(rounded);
  }, [progress]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: interpolate(progress.value, [0, 100], [0.9, 1], Extrapolation.CLAMP) }],
  }));

  return (
    <Animated.View style={animatedStyle}>
      <ThemedText style={[styles.percentage, { color }]}>
        {displayValue}%
      </ThemedText>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    justifyContent: "center",
  },
  labelContainer: {
    position: "absolute",
    alignItems: "center",
    justifyContent: "center",
  },
  percentage: {
    ...Typography.largeTitle,
    fontWeight: "700",
  },
  label: {
    ...Typography.caption,
    marginTop: 4,
    opacity: 0.7,
  },
});
