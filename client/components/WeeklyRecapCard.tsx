import React from "react";
import { View, StyleSheet, Pressable } from "react-native";
import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";

import { ThemedText } from "@/components/ThemedText";
import { useTheme } from "@/hooks/useTheme";
import type { WeeklyRecapResult, StreakResult } from "@/lib/progress";
import { Colors, Spacing, BorderRadius, Typography } from "@/constants/theme";

interface WeeklyRecapCardProps {
  recap: WeeklyRecapResult;
  streak: StreakResult;
  personaName: string;
  onDismiss: () => void;
  /** Opens the free 3-minute weekly review with the coach. */
  onStartReview?: () => void;
}

/**
 * Templated Monday recap of the past week (no AI cost): actions completed
 * vs scheduled, consistency movement vs the prior week, best day, and streak
 * status — identity-framed, shown once per week.
 */
export function WeeklyRecapCard({
  recap,
  streak,
  personaName,
  onDismiss,
  onStartReview,
}: WeeklyRecapCardProps) {
  const { theme, isDark } = useTheme();
  const { lastWeek, prevWeek } = recap;
  const scoreDelta = lastWeek.score - prevWeek.score;

  const streakLine = streak.shieldUsed
    ? "Streak protected by your shield"
    : streak.current > 0
      ? `${streak.current}-day streak alive`
      : "Fresh start this week";

  const identityLine =
    prevWeek.scheduled > 0 && scoreDelta < 0
      ? `New week, fresh ballot — every log is a vote for ${personaName}.`
      : `Another week of becoming ${personaName}.`;

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: isDark
            ? Colors.dark.backgroundDefault
            : Colors.light.backgroundDefault,
        },
      ]}
    >
      <View style={styles.header}>
        <Feather name="bar-chart-2" size={18} color={theme.accent} />
        <ThemedText style={styles.title}>Last week</ThemedText>
        <Pressable
          onPress={onDismiss}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Dismiss weekly recap"
          style={styles.close}
        >
          <Feather name="x" size={18} color={theme.textSecondary} />
        </Pressable>
      </View>

      <View style={styles.statRow}>
        <ThemedText style={styles.statHeadline}>
          {lastWeek.completed} of {lastWeek.scheduled} actions
        </ThemedText>
        <ThemedText style={[styles.statScore, { color: theme.accent }]}>
          {lastWeek.score}%
        </ThemedText>
        {prevWeek.scheduled > 0 && scoreDelta !== 0 ? (
          <ThemedText
            style={[
              styles.statDelta,
              {
                color: scoreDelta > 0 ? theme.success : theme.error,
              },
            ]}
          >
            {scoreDelta > 0 ? "▲" : "▼"}
            {Math.abs(scoreDelta)} vs prior week
          </ThemedText>
        ) : null}
      </View>

      <View style={styles.detailRow}>
        {lastWeek.bestDay ? (
          <View style={styles.detailItem}>
            <Feather name="star" size={14} color={theme.warning} />
            <ThemedText
              style={[styles.detailText, { color: theme.textSecondary }]}
            >
              Best day: {lastWeek.bestDay}
            </ThemedText>
          </View>
        ) : null}
        <View style={styles.detailItem}>
          {streak.shieldUsed ? (
            <Feather name="shield" size={14} color={theme.accent} />
          ) : (
            <MaterialCommunityIcons
              name="fire"
              size={14}
              color={streak.current > 0 ? theme.warning : theme.textSecondary}
            />
          )}
          <ThemedText
            style={[styles.detailText, { color: theme.textSecondary }]}
          >
            {streakLine}
          </ThemedText>
        </View>
      </View>

      <ThemedText style={[styles.identityLine, { color: theme.textSecondary }]}>
        {identityLine}
      </ThemedText>

      {onStartReview ? (
        <Pressable
          onPress={onStartReview}
          hitSlop={8}
          pressRetentionOffset={12}
          accessibilityRole="button"
          accessibilityLabel="Start your free 3-minute weekly review with the coach"
          style={({ pressed }) => [
            styles.reviewCta,
            { opacity: pressed ? 0.7 : 1 },
          ]}
        >
          <Feather name="message-circle" size={14} color={theme.accent} />
          <ThemedText style={[styles.reviewCtaText, { color: theme.accent }]}>
            3-min weekly review with your coach
          </ThemedText>
          <Feather name="arrow-right" size={14} color={theme.accent} />
        </Pressable>
      ) : null}
    </View>
  );
}

interface BeatLastWeekCardProps {
  lastWeekCompleted: number;
  onDismiss: () => void;
}

/**
 * Sunday-evening goal-gradient nudge: shown when this week is exactly one
 * log away from beating last week's total.
 */
export function BeatLastWeekCard({
  lastWeekCompleted,
  onDismiss,
}: BeatLastWeekCardProps) {
  const { theme, isDark } = useTheme();

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: isDark
            ? Colors.dark.backgroundDefault
            : Colors.light.backgroundDefault,
        },
      ]}
    >
      <View style={styles.header}>
        <Feather name="trending-up" size={18} color={theme.accent} />
        <ThemedText style={styles.title}>So close</ThemedText>
        <Pressable
          onPress={onDismiss}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Dismiss beat-last-week nudge"
          style={styles.close}
        >
          <Feather name="x" size={18} color={theme.textSecondary} />
        </Pressable>
      </View>
      <ThemedText style={[styles.nudgeText, { color: theme.textSecondary }]}>
        You&rsquo;re tied with last week ({lastWeekCompleted} log
        {lastWeekCompleted === 1 ? "" : "s"}). One more tonight beats it.
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: Spacing.lg,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.xl,
    borderWidth: 1,
    borderColor: "rgba(0, 217, 255, 0.3)",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  title: {
    ...Typography.body,
    fontWeight: "600",
    flex: 1,
  },
  close: {
    padding: Spacing.xs,
  },
  statRow: {
    flexDirection: "row",
    alignItems: "baseline",
    flexWrap: "wrap",
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  statHeadline: {
    ...Typography.headline,
  },
  statScore: {
    ...Typography.headline,
  },
  statDelta: {
    ...Typography.caption,
    fontWeight: "600",
  },
  detailRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.lg,
    marginBottom: Spacing.sm,
  },
  detailItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
  },
  detailText: {
    ...Typography.caption,
    lineHeight: 17,
  },
  identityLine: {
    ...Typography.small,
    fontStyle: "italic",
  },
  reviewCta: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    marginTop: Spacing.md,
  },
  reviewCtaText: {
    ...Typography.small,
    fontWeight: "600",
  },
  nudgeText: {
    ...Typography.small,
    lineHeight: 20,
  },
});
