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
  onToggle: () => void;
  benchmarkTitle?: string;
}

export function ActionCard({ action, log, onToggle, benchmarkTitle }: ActionCardProps) {
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
        withDelay(300, withTiming(0, { duration: 400 }))
      );
      checkScale.value = withSequence(
        withSpring(1.3, { damping: 8, stiffness: 300 }),
        withSpring(1, springConfig)
      );
    }
    wasCompleted.value = isCompleted;
  }, [isCompleted]);

  const handlePress = async () => {
    buttonScale.value = withSequence(
      withSpring(0.92, { damping: 15, stiffness: 400 }),
      withSpring(1, springConfig)
    );
    
    if (!isCompleted) {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } else {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    onToggle();
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
    shadowOpacity: interpolate(completionGlow.value, [0, 1], [0, 0.8], Extrapolation.CLAMP),
    shadowRadius: interpolate(completionGlow.value, [0, 1], [0, 20], Extrapolation.CLAMP),
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
          <ThemedText style={styles.kickstart}>
            {action.kickstartVersion}
          </ThemedText>
        </View>
        
        {action.anchorLink ? (
          <View style={[styles.anchorContainer, { backgroundColor: isDark ? Colors.dark.backgroundSecondary : Colors.light.backgroundSecondary }]}>
            <Feather name="link" size={14} color={Colors.dark.accent} style={styles.anchorIcon} />
            <View style={styles.anchorContent}>
              <ThemedText style={[styles.anchorLabel, { color: Colors.dark.accent }]}>
                Anchor
              </ThemedText>
              <ThemedText style={[styles.anchor, { color: theme.textSecondary }]}>
                {action.anchorLink}
              </ThemedText>
            </View>
          </View>
        ) : null}

        <Pressable onPress={handlePress}>
          <Animated.View
            style={[
              styles.toggleButton,
              {
                backgroundColor: isCompleted
                  ? Colors.dark.success
                  : isDark
                    ? Colors.dark.backgroundTertiary
                    : Colors.light.backgroundTertiary,
              },
              buttonAnimatedStyle,
              isCompleted ? glowStyle : undefined,
            ]}
          >
            <Animated.View style={checkAnimatedStyle}>
              <Feather
                name={isCompleted ? "check" : "circle"}
                size={24}
                color={isCompleted ? "#000000" : theme.textSecondary}
              />
            </Animated.View>
            <ThemedText
              style={[
                styles.toggleText,
                { color: isCompleted ? "#000000" : theme.text },
              ]}
            >
              {isCompleted ? "Completed" : "Mark Complete"}
            </ThemedText>
          </Animated.View>
        </Pressable>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: BorderRadius.md,
    padding: Spacing.lg,
    marginBottom: Spacing.md,
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
  kickstart: {
    ...Typography.kickstart,
    flex: 1,
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
  },
  toggleButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.sm,
    gap: Spacing.sm,
  },
  toggleText: {
    ...Typography.body,
    fontWeight: "600",
  },
});
