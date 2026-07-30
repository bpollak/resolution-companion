import React, { useEffect } from "react";
import { View, StyleSheet } from "react-native";
import { Feather } from "@expo/vector-icons";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
  withDelay,
  interpolate,
  Extrapolation,
} from "react-native-reanimated";
import { ThemedText } from "@/components/ThemedText";
import { useTheme } from "@/hooks/useTheme";
import { Colors, Spacing, BorderRadius, Typography } from "@/constants/theme";

// Same palette as the onboarding logo's gradient dots. Exported (with
// BurstDot) so the milestone celebration reuses the same visual language.
export const BURST_DOTS = [
  { angle: 0, color: Colors.dark.accent },
  { angle: 60, color: "#FF6B9D" },
  { angle: 120, color: "#9B6BFF" },
  { angle: 180, color: "#6BFFB8" },
  { angle: 240, color: Colors.dark.warning },
  { angle: 300, color: Colors.dark.success },
];
const BURST_DISTANCE = 72;

export function BurstDot({
  angle,
  color,
  active,
}: {
  angle: number;
  color: string;
  active: boolean;
}) {
  const progress = useSharedValue(0);

  useEffect(() => {
    if (active) {
      progress.value = 0;
      progress.value = withDelay(
        200,
        withSpring(1, { damping: 14, stiffness: 90 }),
      );
    }
  }, [active, progress]);

  const style = useAnimatedStyle(() => {
    const rad = (angle * Math.PI) / 180;
    return {
      opacity: interpolate(
        progress.value,
        [0, 0.15, 1],
        [0, 1, 0],
        Extrapolation.CLAMP,
      ),
      transform: [
        { translateX: progress.value * Math.cos(rad) * BURST_DISTANCE },
        { translateY: progress.value * Math.sin(rad) * BURST_DISTANCE },
      ],
    };
  });

  return (
    <Animated.View
      style={[styles.burstDot, { backgroundColor: color }, style]}
    />
  );
}

interface DayCompleteCardProps {
  personaName: string;
  isFirstEver: boolean;
  /** True only when the last action was just checked off (animates the card). */
  celebrate: boolean;
}

export function DayCompleteCard({
  personaName,
  isFirstEver,
  celebrate,
}: DayCompleteCardProps) {
  const { theme, isDark } = useTheme();
  const opacity = useSharedValue(celebrate ? 0 : 1);
  const translateY = useSharedValue(celebrate ? 16 : 0);

  useEffect(() => {
    if (celebrate) {
      opacity.value = withDelay(150, withTiming(1, { duration: 350 }));
      translateY.value = withDelay(
        150,
        withSpring(0, { damping: 16, stiffness: 160 }),
      );
    }
  }, [celebrate, opacity, translateY]);

  const cardStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
  }));

  return (
    <Animated.View
      style={[
        styles.card,
        {
          backgroundColor: isDark
            ? Colors.dark.backgroundDefault
            : Colors.light.backgroundDefault,
        },
        cardStyle,
      ]}
    >
      <View style={styles.checkContainer}>
        {BURST_DOTS.map((dot) => (
          <BurstDot
            key={dot.angle}
            angle={dot.angle}
            color={dot.color}
            active={celebrate}
          />
        ))}
        <View style={[styles.checkCircle, { backgroundColor: theme.success }]}>
          <Feather name="check" size={28} color={theme.buttonText} />
        </View>
      </View>

      <ThemedText style={styles.title}>Day complete.</ThemedText>
      <ThemedText style={[styles.subtitle, { color: theme.textSecondary }]}>
        Every action today was a vote for {personaName}.
      </ThemedText>
      {isFirstEver ? (
        <ThemedText style={[styles.firstEver, { color: theme.accent }]}>
          This is how it starts.
        </ThemedText>
      ) : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    alignItems: "center",
    padding: Spacing["2xl"],
    borderRadius: BorderRadius.md,
  },
  checkContainer: {
    width: 64,
    height: 64,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Spacing.lg,
  },
  checkCircle: {
    width: 56,
    height: 56,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.dark.success,
    alignItems: "center",
    justifyContent: "center",
  },
  burstDot: {
    position: "absolute",
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  title: {
    ...Typography.title,
    textAlign: "center",
    marginBottom: Spacing.xs,
  },
  subtitle: {
    ...Typography.body,
    textAlign: "center",
  },
  firstEver: {
    ...Typography.small,
    fontWeight: "600",
    marginTop: Spacing.sm,
  },
});
