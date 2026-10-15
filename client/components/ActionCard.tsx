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
import { CompletionCheck } from "@/components/CompletionCheck";

const springConfig = {
  damping: 12,
  stiffness: 180,
  mass: 0.8,
};

interface ActionCardProps {
  action: ElementalAction;
  log: DailyLog | null;
  onToggle: (actionId: string, kind?: "full" | "kickstart") => void;
  /** Omitted when the plan has one milestone, where it only repeats the plan. */
  /** Footer link to the coach; given only to the habit the coach would open on. */
  onAskCoach?: (actionId: string) => void;
}

// Memoized: TodayScreen renders one card per action, and a toggle should only
// re-render the card whose log changed
export const ActionCard = React.memo(function ActionCard({
  action,
  log,
  onToggle,
  onAskCoach,
}: ActionCardProps) {
  const { theme, isDark } = useTheme();
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
  }, [checkScale, completionGlow, isCompleted, wasCompleted]);

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

  const buttonAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: buttonScale.value }],
  }));

  const glowStyle = useAnimatedStyle(() => ({
    shadowColor: theme.success,
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

  const kickstart = action.kickstartVersion?.trim();

  return (
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
      <ThemedText style={styles.title}>{action.title}</ThemedText>
      {action.anchorLink ? (
        <ThemedText style={[styles.cue, { color: theme.textSecondary }]}>
          When: {action.anchorLink}
        </ThemedText>
      ) : null}

      <Pressable
        onPress={handlePress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        hitSlop={8}
        pressRetentionOffset={20}
        accessibilityRole="button"
        accessibilityState={{ selected: isCompleted }}
        accessibilityLabel={
          isCompleted
            ? `${action.title} completed. Tap to undo`
            : `Mark ${action.title} complete`
        }
        style={styles.togglePressable}
      >
        <Animated.View
          style={[
            styles.toggleButton,
            {
              // Every pending habit is a peer, so each gets the same filled
              // button; a single filled card read as "this one matters more".
              backgroundColor: isCompleted ? theme.success : theme.accent,
              borderColor: isCompleted ? "transparent" : theme.accent,
            },
            buttonAnimatedStyle,
            isCompleted ? glowStyle : undefined,
          ]}
        >
          <Animated.View style={checkAnimatedStyle}>
            <Feather
              name={isCompleted ? "check" : "circle"}
              size={24}
              color={theme.buttonText}
            />
          </Animated.View>
          <ThemedText
            style={[
              styles.toggleText,
              {
                color: theme.buttonText,
              },
            ]}
          >
            {isCompleted ? "Completed" : "Mark Complete"}
          </ThemedText>
        </Animated.View>
      </Pressable>

      {/* Only while pending: a done habit has no fallback to log, and a
          static copy of this row looked tappable. */}
      {kickstart && !isCompleted ? (
        <Pressable
          onPress={() => {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            onToggle(action.id, "kickstart");
          }}
          hitSlop={8}
          pressRetentionOffset={16}
          accessibilityRole="button"
          accessibilityLabel={`I did the 2-minute version of ${action.title}`}
          accessibilityHint={`Logs the 2-minute version: ${kickstart}`}
          style={({ pressed }) => [
            styles.backupRow,
            { opacity: pressed ? 0.6 : 1 },
          ]}
        >
          <Feather name="zap" size={16} color={theme.warning} />
          <ThemedText
            style={[styles.backupText, { color: theme.textSecondary }]}
          >
            Too busy? Just: {kickstart}
          </ThemedText>
          <ThemedText style={styles.backupAction}>I did this</ThemedText>
        </Pressable>
      ) : null}

      {onAskCoach && !isCompleted ? (
        <Pressable
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            onAskCoach(action.id);
          }}
          hitSlop={10}
          pressRetentionOffset={12}
          accessibilityRole="button"
          accessibilityLabel={`Ask Coach about ${action.title}`}
          style={({ pressed }) => [
            styles.coachLink,
            { opacity: pressed ? 0.6 : 1 },
          ]}
        >
          <Feather
            name="message-circle"
            size={15}
            color={theme.textSecondary}
          />
          <ThemedText
            style={[styles.coachLinkText, { color: theme.textSecondary }]}
          >
            Ask Coach
          </ThemedText>
        </Pressable>
      ) : null}
    </View>
  );
});

interface CompletedActionRowProps {
  action: ElementalAction;
  log: DailyLog;
  onToggle: (actionId: string) => void;
  /** Saved one-line "how it went" note for this completion, if any. */
  note?: string;
  /** Opens the add/edit note prompt. Omit to hide the affordance. */
  onNotePress?: (actionId: string) => void;
}

// Completed actions collapse to this compact row so the deck visually clears
// as the day progresses. Memoized like ActionCard: onToggle must be a stable
// reference so a toggle only re-renders the row whose log changed.
export const CompletedActionRow = React.memo(function CompletedActionRow({
  action,
  log,
  onToggle,
  note,
  onNotePress,
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

  const completionBadge =
    log.completionSource === "health"
      ? { icon: "heart" as const, label: "Completed by Health" }
      : log.completionKind === "kickstart"
        ? { icon: "zap" as const, label: "2-minute version" }
        : null;

  return (
    <Animated.View style={rowStyle}>
      <View
        style={[
          styles.compactRow,
          {
            backgroundColor: isDark
              ? Colors.dark.backgroundDefault
              : Colors.light.backgroundDefault,
          },
        ]}
      >
        <Pressable
          onPress={handlePress}
          hitSlop={8}
          pressRetentionOffset={20}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: true }}
          accessibilityLabel={`${action.title} completed. Undo${completionBadge ? `, ${completionBadge.label}` : ""}`}
          accessibilityHint="Marks this action as not done"
          style={({ pressed }) => [
            styles.compactMain,
            { opacity: pressed ? 0.8 : 1 },
          ]}
        >
          <CompletionCheck checked />
          <View style={styles.compactTextCol}>
            <ThemedText
              style={[styles.compactTitle, { color: theme.textSecondary }]}
              numberOfLines={1}
            >
              {action.title}
            </ThemedText>
            {completionBadge ? (
              <View style={styles.completionBadge} accessible={false}>
                <Feather
                  name={completionBadge.icon}
                  size={11}
                  color={theme.textSecondary}
                />
                <ThemedText
                  style={[
                    styles.completionBadgeText,
                    { color: theme.textSecondary },
                  ]}
                >
                  {completionBadge.label}
                </ThemedText>
              </View>
            ) : null}
            {note ? (
              <ThemedText
                style={[styles.compactNote, { color: theme.textSecondary }]}
                numberOfLines={1}
              >
                &ldquo;{note}&rdquo;
              </ThemedText>
            ) : null}
          </View>
          <ThemedText style={[styles.compactUndo, { color: theme.accent }]}>
            Undo
          </ThemedText>
        </Pressable>
        {onNotePress ? (
          <Pressable
            onPress={() => onNotePress(action.id)}
            hitSlop={10}
            pressRetentionOffset={12}
            accessibilityRole="button"
            accessibilityLabel={
              note
                ? `Edit your note for ${action.title}`
                : `Add a note about how ${action.title} went`
            }
            style={({ pressed }) => [
              styles.compactNoteButton,
              { opacity: pressed ? 0.6 : 1 },
            ]}
          >
            <Feather
              name={note ? "message-square" : "edit-3"}
              size={15}
              color={note ? theme.accent : theme.textSecondary}
            />
          </Pressable>
        ) : null}
      </View>
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
  compactMain: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  compactTextCol: {
    flex: 1,
  },
  compactUndo: {
    ...Typography.caption,
    fontWeight: "700",
    marginLeft: Spacing.sm,
  },
  // Done reads as the check plus secondary text; strikethrough made a
  // finished habit look cancelled.
  compactTitle: {
    ...Typography.body,
  },
  compactNote: {
    ...Typography.caption,
    fontStyle: "italic",
    marginTop: 2,
  },
  completionBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 2,
  },
  completionBadgeText: {
    ...Typography.caption,
    fontWeight: "600",
  },
  compactNoteButton: {
    padding: Spacing.xs,
    marginLeft: Spacing.sm,
  },
  title: {
    fontSize: 20,
    lineHeight: 26,
    fontWeight: "700",
  },
  cue: {
    fontSize: 15,
    lineHeight: 20,
    marginTop: Spacing.xs,
  },
  togglePressable: {
    marginTop: Spacing.md,
  },
  backupRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    minHeight: 44,
    marginTop: Spacing.sm,
  },
  backupText: {
    fontSize: 15,
    lineHeight: 20,
    flex: 1,
  },
  backupAction: {
    fontSize: 15,
    fontWeight: "600",
  },
  coachLink: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: Spacing.xs,
    minHeight: 44,
  },
  coachLinkText: {
    ...Typography.small,
    fontWeight: "600",
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
