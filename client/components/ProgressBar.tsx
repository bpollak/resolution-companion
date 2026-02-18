import React, { useEffect } from "react";
import { View, StyleSheet } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { Colors, BorderRadius, Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/useTheme";

interface ProgressBarProps {
  progress: number;
  height?: number;
  color?: string;
}

export function ProgressBar({ progress, height = 8, color }: ProgressBarProps) {
  const { isDark } = useTheme();
  const animatedWidth = useSharedValue(0);

  useEffect(() => {
    animatedWidth.value = withTiming(progress, { duration: 300 });
  }, [progress, animatedWidth]);

  const animatedStyle = useAnimatedStyle(() => ({
    width: `${animatedWidth.value}%`,
  }));

  const barColor = color || (progress >= 80 
    ? Colors.dark.success 
    : progress >= 50 
      ? Colors.dark.accent 
      : Colors.dark.warning);

  return (
    <View
      style={[
        styles.container,
        {
          height,
          backgroundColor: isDark
            ? Colors.dark.backgroundTertiary
            : Colors.light.backgroundTertiary,
        },
      ]}
    >
      <Animated.View
        style={[
          styles.fill,
          { backgroundColor: barColor, height },
          animatedStyle,
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: "100%",
    borderRadius: BorderRadius.full,
    overflow: "hidden",
  },
  fill: {
    borderRadius: BorderRadius.full,
  },
});
