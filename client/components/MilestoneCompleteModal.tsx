import React, { useEffect } from "react";
import { View, StyleSheet, Pressable, Modal, Platform } from "react-native";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
  withDelay,
} from "react-native-reanimated";

import { ThemedText } from "@/components/ThemedText";
import { BurstDot, BURST_DOTS } from "@/components/DayCompleteCard";
import { useTheme } from "@/hooks/useTheme";
import { useApp } from "@/context/AppContext";
import { MILESTONE_TARGET_DAYS } from "@/lib/progress";
import { navigationRef } from "@/navigation/navigationRef";
import { Colors, Spacing, BorderRadius, Typography } from "@/constants/theme";

interface MilestoneCompleteModalProps {
  milestoneTitle: string;
  personaName: string;
  /** Cosmetic reward newly unlocked by this milestone, when there is one. */
  rewardTitle?: string;
  rewardDescription?: string;
  onAddNext: () => void;
  onDismiss: () => void;
}

/**
 * One-time celebration when a milestone's status flips to completed.
 * Reuses the DayCompleteCard visual language (burst dots, check circle,
 * identity framing) as a modal moment rather than an inline card.
 */
export function MilestoneCompleteModal({
  milestoneTitle,
  personaName,
  rewardTitle,
  rewardDescription,
  onAddNext,
  onDismiss,
}: MilestoneCompleteModalProps) {
  const { theme, isDark } = useTheme();
  const opacity = useSharedValue(0);
  const scale = useSharedValue(0.92);

  useEffect(() => {
    opacity.value = withDelay(100, withTiming(1, { duration: 300 }));
    scale.value = withDelay(
      100,
      withSpring(1, { damping: 16, stiffness: 160 }),
    );
    if (Platform.OS !== "web") {
      // Double haptic: reads as an event, not an acknowledgment
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      const timer = setTimeout(() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [opacity, scale]);

  const cardStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scale: scale.value }],
  }));

  return (
    <Modal
      visible
      transparent
      animationType="fade"
      onRequestClose={onDismiss}
      accessibilityViewIsModal
    >
      <View style={styles.backdrop}>
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
          <View style={styles.iconContainer}>
            {BURST_DOTS.map((dot) => (
              <BurstDot
                key={dot.angle}
                angle={dot.angle}
                color={dot.color}
                active
              />
            ))}
            <View style={styles.iconCircle}>
              <Feather name="award" size={30} color="#000000" />
            </View>
          </View>

          <ThemedText style={[styles.eyebrow, { color: Colors.dark.accent }]}>
            Milestone complete
          </ThemedText>
          <ThemedText style={styles.title}>{milestoneTitle}</ThemedText>
          <ThemedText style={[styles.body, { color: theme.textSecondary }]}>
            You did the thing on {MILESTONE_TARGET_DAYS} scheduled days &mdash;
            that&rsquo;s not a plan anymore, it&rsquo;s a habit. More proof
            you&rsquo;re becoming {personaName}.
          </ThemedText>

          {rewardTitle ? (
            <View style={styles.rewardRow}>
              <Feather name="unlock" size={16} color={Colors.dark.warning} />
              <View style={styles.rewardText}>
                <ThemedText style={styles.rewardTitle}>
                  Unlocked: {rewardTitle}
                </ThemedText>
                {rewardDescription ? (
                  <ThemedText
                    style={[
                      styles.rewardDescription,
                      { color: theme.textSecondary },
                    ]}
                  >
                    {rewardDescription}
                  </ThemedText>
                ) : null}
              </View>
            </View>
          ) : null}

          <Pressable
            onPress={onAddNext}
            accessibilityRole="button"
            accessibilityLabel="Add your next milestone"
            style={({ pressed }) => [
              styles.primaryButton,
              { opacity: pressed ? 0.8 : 1 },
            ]}
          >
            <ThemedText style={styles.primaryButtonText}>
              Add your next milestone
            </ThemedText>
            <Feather name="arrow-right" size={16} color="#000000" />
          </Pressable>
          <Pressable
            onPress={onDismiss}
            accessibilityRole="button"
            accessibilityLabel="Dismiss milestone celebration"
            style={({ pressed }) => [
              styles.secondaryButton,
              { opacity: pressed ? 0.6 : 1 },
            ]}
          >
            <ThemedText
              style={[
                styles.secondaryButtonText,
                { color: theme.textSecondary },
              ]}
            >
              Keep going
            </ThemedText>
          </Pressable>
        </Animated.View>
      </View>
    </Modal>
  );
}

/**
 * Bridges AppContext's milestone-flip detection to the celebration modal.
 * Mounted once in App (outside the navigator tree), so the moment appears
 * from whichever screen the flip happened on. The "next milestone" CTA
 * routes into the existing BenchmarkEditor via the container ref.
 */
export function MilestoneCelebrationHost() {
  const {
    milestoneCelebration,
    celebrationReward,
    dismissMilestoneCelebration,
    persona,
  } = useApp();

  if (!milestoneCelebration) return null;

  return (
    <MilestoneCompleteModal
      milestoneTitle={milestoneCelebration.title}
      personaName={persona?.name ?? "your persona"}
      rewardTitle={celebrationReward?.title}
      rewardDescription={celebrationReward?.description}
      onAddNext={() => {
        dismissMilestoneCelebration();
        if (navigationRef.isReady()) {
          navigationRef.navigate("BenchmarkEditor", {});
        }
      }}
      onDismiss={dismissMilestoneCelebration}
    />
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.65)",
    alignItems: "center",
    justifyContent: "center",
    padding: Spacing.xl,
  },
  rewardRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: Spacing.sm,
    backgroundColor: "rgba(255, 184, 0, 0.08)",
    borderRadius: BorderRadius.sm,
    padding: Spacing.md,
    marginBottom: Spacing.lg,
    alignSelf: "stretch",
  },
  rewardText: {
    flex: 1,
    gap: 2,
  },
  rewardTitle: {
    ...Typography.small,
    fontWeight: "700",
  },
  rewardDescription: {
    ...Typography.caption,
    lineHeight: 16,
  },
  card: {
    width: "100%",
    maxWidth: 400,
    alignItems: "center",
    padding: Spacing["2xl"],
    borderRadius: BorderRadius.lg,
  },
  iconContainer: {
    width: 64,
    height: 64,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Spacing.lg,
  },
  iconCircle: {
    width: 56,
    height: 56,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.dark.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  eyebrow: {
    ...Typography.caption,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: Spacing.xs,
  },
  title: {
    ...Typography.title,
    textAlign: "center",
    marginBottom: Spacing.sm,
  },
  body: {
    ...Typography.body,
    textAlign: "center",
    marginBottom: Spacing.xl,
  },
  primaryButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.xs,
    backgroundColor: Colors.dark.accent,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.xl,
    borderRadius: BorderRadius.full,
    alignSelf: "stretch",
  },
  primaryButtonText: {
    ...Typography.body,
    fontWeight: "600",
    color: "#000000",
  },
  secondaryButton: {
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    marginTop: Spacing.xs,
  },
  secondaryButtonText: {
    ...Typography.small,
    fontWeight: "500",
  },
});
