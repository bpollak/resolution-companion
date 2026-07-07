import React, { useEffect } from "react";
import { View, StyleSheet, Pressable } from "react-native";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withSequence,
  withTiming,
  withDelay,
  interpolate,
  Extrapolation,
} from "react-native-reanimated";
import { ThemedText } from "@/components/ThemedText";
import { useTheme } from "@/hooks/useTheme";
import { Colors, Spacing, BorderRadius, Typography } from "@/constants/theme";
import type { ElementalAction, DailyLog } from "@/lib/storage";

const springConfig = {
  damping: 12,
  stiffness: 180,
  mass: 0.8,
};

interface ActionCardProps {
  action: ElementalAction;
  log: DailyLog | null;
  onToggle: (actionId: string) => void;
  benchmarkTitle?: string;
}

// Memoized: TodayScreen renders one card per action, and a toggle should only
// re-render the card whose log changed
export const ActionCard = React.memo(function ActionCard({
  action,
  log,
  onToggle,
  benchmarkTitle,
}: ActionCardProps) {
  const { theme, isDark } = useTheme();
  const scale = useSharedValue(1);
  const buttonScale = useSharedValue(1);
  const completionGlow = useSharedValue(0);
  const checkScale = useSharedValue(1);
  const isCompleted = log?.status === true;
  const wasCompleted = useSharedValue(isCompleted);

  useEffect(() => {
    if (isCompleted && !wasCompleted.value) {
      completionGlow.value = withSequence(
        withTiming(1, { duration: 200 }),
        withDelay(300, withTiming(0, { duration: 400 })),
      );
      checkScale.value = withSequence(
        withSpring(1.3, { damping: 8, stiffness: 300 }),
        withSpring(1, springConfig),
      );
    }
    wasCompleted.value = isCompleted;
  }, [isCompleted]);

  // Scale down the moment the finger lands — feedback while the touch is
  // still held reads as "responsive"; waiting for release reads as lag
  const handlePressIn = () => {
    buttonScale.value = withSpring(0.92, { damping: 15, stiffness: 400 });
  };

  const handlePressOut = () => {
    buttonScale.value = withSpring(1, springConfig);
  };

  const handlePress = () => {
    // Fire-and-forget: awaiting the haptic engine here delayed the actual
    // toggle by a native round-trip, making taps feel dead under load
    if (!isCompleted) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } else {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    onToggle(action.id);
  };

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const buttonAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: buttonScale.value }],
  }));

  const glowStyle = useAnimatedStyle(() => ({
    shadowColor: Colors.dark.success,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: interpolate(
      completionGlow.value,
      [0, 1],
      [0, 0.8],
      Extrapolation.CLAMP,
    ),
    shadowRadius: interpolate(
      completionGlow.value,
      [0, 1],
      [0, 20],
      Extrapolation.CLAMP,
    ),
  }));

  const checkAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: checkScale.value }],
  }));

  return (
    <Animated.View style={animatedStyle}>
      <View
        style={[
          styles.container,
          {
            backgroundColor: isDark
              ? Colors.dark.backgroundDefault
              : Colors.light.backgroundDefault,
          },
        ]}
      >
        {benchmarkTitle ? (
          <ThemedText style={[styles.benchmark, { color: Colors.dark.accent }]}>
            {benchmarkTitle}
          </ThemedText>
        ) : null}

        <ThemedText style={styles.title}>{action.title}</ThemedText>

        <View style={styles.kickstartContainer}>
          <Feather
            name="zap"
            size={16}
            color={Colors.dark.warning}
            style={styles.zapIcon}
          />
          <View style={styles.kickstartContent}>
            <ThemedText
              style={[styles.kickstartLabel, { color: Colors.dark.warning }]}
            >
              Too busy? Just:
            </ThemedText>
            <ThemedText style={styles.kickstart}>
              {action.kickstartVersion}
            </ThemedText>
          </View>
        </View>

        {action.anchorLink ? (
          <View
            style={[
              styles.anchorContainer,
              {
                backgroundColor: isDark
                  ? Colors.dark.backgroundSecondary
                  : Colors.light.backgroundSecondary,
              },
            ]}
          >
            <Feather
              name="link"
              size={14}
              color={Colors.dark.accent}
              style={styles.anchorIcon}
            />
            <View style={styles.anchorContent}>
              <ThemedText
                style={[styles.anchorLabel, { color: Colors.dark.accent }]}
              >
                When:
              </ThemedText>
              <ThemedText
                style={[styles.anchor, { color: theme.textSecondary }]}
              >
                {action.anchorLink}
              </ThemedText>
            </View>
          </View>
        ) : null}

        <Pressable
          onPress={handlePress}
          onPressIn={handlePressIn}
          onPressOut={handlePressOut}
          accessibilityRole="button"
          accessibilityState={{ selected: isCompleted }}
          accessibilityLabel={
            isCompleted
              ? `${action.title} completed. Tap to undo`
              : `Mark ${action.title} complete`
          }
        >
          <Animated.View
            style={[
              styles.toggleButton,
              {
                backgroundColor: isCompleted
                  ? Colors.dark.success
                  : isDark
                    ? Colors.dark.backgroundTertiary
                    : Colors.light.backgroundTertiary,
                borderColor: isCompleted
                  ? "transparent"
                  : "rgba(0, 217, 255, 0.5)",
              },
              buttonAnimatedStyle,
              isCompleted ? glowStyle : undefined,
            ]}
          >
            <Animated.View style={checkAnimatedStyle}>
              <Feather
                name={isCompleted ? "check" : "circle"}
                size={24}
                color={isCompleted ? "#000000" : Colors.dark.accent}
              />
            </Animated.View>
            <ThemedText
              style={[
                styles.toggleText,
                { color: isCompleted ? "#000000" : Colors.dark.accent },
              ]}
            >
              {isCompleted ? "Completed" : "Mark Complete"}
            </ThemedText>
          </Animated.View>
        </Pressable>
      </View>
    </Animated.View>
  );
});

interface CompletedActionRowProps {
  action: ElementalAction;
  onToggle: (actionId: string) => void;
}

// Completed actions collapse to this compact row so the deck visually clears
// as the day progresses. Memoized like ActionCard: onToggle must be a stable
// reference so a toggle only re-renders the row whose log changed.
export const CompletedActionRow = React.memo(function CompletedActionRow({
  action,
  onToggle,
}: CompletedActionRowProps) {
  const { theme, isDark } = useTheme();
  const opacity = useSharedValue(0);
  const translateY = useSharedValue(6);

  useEffect(() => {
    opacity.value = withTiming(1, { duration: 250 });
    translateY.value = withSpring(0, springConfig);
  }, [opacity, translateY]);

  const rowStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
  }));

  const handlePress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onToggle(action.id);
  };

  return (
    <Animated.View style={rowStyle}>
      <Pressable
        onPress={handlePress}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: true }}
        accessibilityLabel={action.title}
        accessibilityHint="Marks this action as not done"
        style={({ pressed }) => [
          styles.compactRow,
          {
            backgroundColor: isDark
              ? Colors.dark.backgroundDefault
              : Colors.light.backgroundDefault,
            opacity: pressed ? 0.8 : 1,
          },
        ]}
      >
        <View style={styles.compactCheck}>
          <Feather name="check" size={14} color="#000000" />
        </View>
        <ThemedText
          style={[styles.compactTitle, { color: theme.textSecondary }]}
          numberOfLines={1}
        >
          {action.title}
        </ThemedText>
      </Pressable>
    </Animated.View>
  );
});

const styles = StyleSheet.create({
  container: {
    borderRadius: BorderRadius.md,
    padding: Spacing.lg,
    marginBottom: Spacing.md,
  },
  compactRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    marginBottom: Spacing.sm,
  },
  compactCheck: {
    width: 22,
    height: 22,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.dark.success,
    alignItems: "center",
    justifyContent: "center",
  },
  compactTitle: {
    ...Typography.body,
    flex: 1,
    textDecorationLine: "line-through",
  },
  benchmark: {
    ...Typography.caption,
    fontWeight: "600",
    marginBottom: Spacing.xs,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  title: {
    ...Typography.headline,
    marginBottom: Spacing.sm,
  },
  kickstartContainer: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: Spacing.sm,
  },
  zapIcon: {
    marginRight: Spacing.xs,
    marginTop: 2,
  },
  kickstartContent: {
    flex: 1,
  },
  kickstartLabel: {
    ...Typography.caption,
    fontWeight: "600",
    marginBottom: 2,
  },
  kickstart: {
    ...Typography.kickstart,
    lineHeight: 27,
  },
  anchorContainer: {
    flexDirection: "row",
    alignItems: "flex-start",
    padding: Spacing.sm,
    borderRadius: BorderRadius.sm,
    marginBottom: Spacing.lg,
  },
  anchorIcon: {
    marginRight: Spacing.sm,
    marginTop: 2,
  },
  anchorContent: {
    flex: 1,
  },
  anchorLabel: {
    ...Typography.caption,
    fontWeight: "600",
    marginBottom: 2,
  },
  anchor: {
    ...Typography.small,
    lineHeight: 20,
  },
  toggleButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.sm,
    borderWidth: 1.5,
    gap: Spacing.sm,
  },
  toggleText: {
    ...Typography.body,
    fontWeight: "600",
  },
});
