import React, { useEffect } from "react";
import { View, StyleSheet, Pressable } from "react-native";
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

// Same palette as the onboarding logo's gradient dots
const BURST_DOTS = [
  { angle: 0, color: Colors.dark.accent },
  { angle: 60, color: "#FF6B9D" },
  { angle: 120, color: "#9B6BFF" },
  { angle: 180, color: "#6BFFB8" },
  { angle: 240, color: Colors.dark.warning },
  { angle: 300, color: Colors.dark.success },
];
const BURST_DISTANCE = 72;

function BurstDot({
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
  streak: number;
  personaName: string;
  momentum: number;
  momentumDelta: number;
  tomorrowCount: number;
  tomorrowFirstTitle?: string;
  isFirstEver: boolean;
  /** True only when the last action was just checked off (animates the card). */
  celebrate: boolean;
  onTomorrowPress: () => void;
}

export function DayCompleteCard({
  streak,
  personaName,
  momentum,
  momentumDelta,
  tomorrowCount,
  tomorrowFirstTitle,
  isFirstEver,
  celebrate,
  onTomorrowPress,
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
        <View style={styles.checkCircle}>
          <Feather name="check" size={28} color="#000000" />
        </View>
      </View>

      <ThemedText style={styles.title}>Day complete.</ThemedText>
      <ThemedText style={[styles.subtitle, { color: theme.textSecondary }]}>
        That&rsquo;s {streak} {streak === 1 ? "day" : "days"} of becoming{" "}
        {personaName}.
      </ThemedText>
      {isFirstEver ? (
        <ThemedText style={[styles.firstEver, { color: Colors.dark.accent }]}>
          This is how it starts.
        </ThemedText>
      ) : null}

      <View style={styles.momentumRow}>
        <Feather name="zap" size={16} color={Colors.dark.warning} />
        <ThemedText style={styles.momentumText}>
          {new Date().toLocaleDateString("en-US", { month: "long" })}{" "}
          consistency: {momentum}%
        </ThemedText>
        {momentumDelta > 0 ? (
          <ThemedText
            style={[styles.momentumDelta, { color: Colors.dark.success }]}
          >
            +{momentumDelta} today
          </ThemedText>
        ) : null}
      </View>

      {tomorrowCount > 0 ? (
        <Pressable
          onPress={onTomorrowPress}
          accessibilityRole="button"
          accessibilityLabel={`View tomorrow's ${tomorrowCount} ${tomorrowCount === 1 ? "action" : "actions"} in the calendar`}
          style={({ pressed }) => [
            styles.tomorrowRow,
            { opacity: pressed ? 0.7 : 1 },
          ]}
        >
          <ThemedText
            style={[styles.tomorrowText, { color: theme.textSecondary }]}
            numberOfLines={1}
          >
            Tomorrow: {tomorrowCount} action{tomorrowCount === 1 ? "" : "s"}
            {tomorrowFirstTitle ? ` · ${tomorrowFirstTitle}` : ""}
          </ThemedText>
          <Feather name="chevron-right" size={16} color={Colors.dark.accent} />
        </Pressable>
      ) : (
        <ThemedText
          style={[styles.tomorrowText, { color: theme.textSecondary }]}
        >
          Tomorrow: rest day. You&rsquo;ve earned it.
        </ThemedText>
      )}
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
  momentumRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    marginTop: Spacing.lg,
    marginBottom: Spacing.lg,
  },
  momentumText: {
    ...Typography.body,
    fontWeight: "600",
  },
  momentumDelta: {
    ...Typography.small,
    fontWeight: "600",
  },
  tomorrowRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    maxWidth: "100%",
  },
  tomorrowText: {
    ...Typography.small,
    fontWeight: "500",
  },
});
