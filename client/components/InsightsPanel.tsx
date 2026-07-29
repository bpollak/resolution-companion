import React, { useEffect, useMemo } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Feather } from "@expo/vector-icons";

import { ThemedText } from "@/components/ThemedText";
import { useTheme } from "@/hooks/useTheme";
import { Colors, Spacing, BorderRadius, Typography } from "@/constants/theme";
import type { ElementalAction, DailyLog } from "@/lib/storage";
import type { DailyContextEntry } from "@/lib/daily-context";
import { computeContextPatterns } from "@/lib/evidence";
import { track } from "@/lib/telemetry";

interface InsightsPanelProps {
  actions: ElementalAction[];
  dailyLogs: DailyLog[];
  dailyContexts: DailyContextEntry[];
  personaName: string;
  onTuneUp?: () => void;
}

/**
 * Free, local context associations. Patterns only appear after enough
 * context-tagged scheduled days to keep one unusual week from becoming a
 * claim about the user.
 */
export function InsightsPanel({
  actions,
  dailyLogs,
  dailyContexts,
  personaName,
  onTuneUp,
}: InsightsPanelProps) {
  const { theme, isDark } = useTheme();
  const result = useMemo(
    () => computeContextPatterns(actions, dailyLogs, dailyContexts),
    [actions, dailyContexts, dailyLogs],
  );

  useEffect(() => {
    if (result.patterns.length > 0) track("context_pattern_viewed");
  }, [result.patterns.length]);

  const cardBackground = isDark
    ? Colors.dark.backgroundDefault
    : Colors.light.backgroundDefault;
  const progress = Math.min(
    100,
    Math.round((result.taggedScheduledDays / result.minimumDays) * 100),
  );

  return (
    <View style={[styles.card, { backgroundColor: cardBackground }]}>
      <View style={styles.header}>
        <View style={styles.icon}>
          <Feather name="compass" size={18} color={theme.accent} />
        </View>
        <View style={styles.headerCopy}>
          <ThemedText style={styles.title}>What Helps You Show Up</ThemedText>
          <ThemedText style={[styles.subtitle, { color: theme.textSecondary }]}>
            Private, on-device associations for {personaName}
          </ThemedText>
        </View>
      </View>

      {result.taggedScheduledDays < result.minimumDays ? (
        <>
          <ThemedText style={styles.progressHeadline}>
            {result.taggedScheduledDays} of {result.minimumDays} context-tagged
            days
          </ThemedText>
          <View
            style={[
              styles.progressTrack,
              {
                backgroundColor: isDark
                  ? Colors.dark.backgroundTertiary
                  : Colors.light.backgroundTertiary,
              },
            ]}
            accessibilityLabel={`${progress}% of the context needed for patterns`}
          >
            <View
              style={[
                styles.progressFill,
                { width: `${progress}%`, backgroundColor: theme.accent },
              ]}
            />
          </View>
          <ThemedText
            style={[styles.explanation, { color: theme.textSecondary }]}
          >
            Add optional context on Today or a recent calendar day. Patterns
            wait for at least 14 scheduled days, including four days on each
            side of a comparison.
          </ThemedText>
        </>
      ) : result.patterns.length === 0 ? (
        <ThemedText
          style={[styles.explanation, { color: theme.textSecondary }]}
        >
          You have enough context, but no useful association is stable yet. That
          is a valid result; the app will keep listening without forcing a
          story.
        </ThemedText>
      ) : (
        <>
          {result.patterns.map((pattern) => (
            <View
              key={pattern.id}
              accessible
              accessibilityLabel={`${pattern.headline}. ${pattern.detail}`}
              style={[
                styles.pattern,
                { borderColor: "rgba(0, 217, 255, 0.25)" },
              ]}
            >
              <View style={styles.patternHeader}>
                <Feather
                  name={pattern.side === "helped" ? "arrow-up-right" : "wind"}
                  size={16}
                  color={
                    pattern.side === "helped" ? theme.success : theme.warning
                  }
                />
                <ThemedText style={styles.patternTitle}>
                  {pattern.headline}
                </ThemedText>
              </View>
              <ThemedText
                style={[styles.patternDetail, { color: theme.textSecondary }]}
              >
                {pattern.detail}
              </ThemedText>
            </View>
          ))}
          {onTuneUp ? (
            <Pressable
              onPress={onTuneUp}
              hitSlop={8}
              pressRetentionOffset={12}
              accessibilityRole="button"
              accessibilityLabel="Ask Coach for a Plan Tune-Up based on these patterns"
              style={({ pressed }) => [
                styles.tuneUpButton,
                {
                  borderColor: theme.accent,
                  opacity: pressed ? 0.65 : 1,
                  transform: [{ scale: pressed ? 0.98 : 1 }],
                },
              ]}
            >
              <Feather name="refresh-cw" size={15} color={theme.accent} />
              <ThemedText style={[styles.tuneUpText, { color: theme.accent }]}>
                Ask Coach for a Plan Tune-Up
              </ThemedText>
            </Pressable>
          ) : null}
        </>
      )}
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
    gap: Spacing.md,
    marginBottom: Spacing.lg,
  },
  icon: {
    width: 38,
    height: 38,
    borderRadius: BorderRadius.full,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0, 217, 255, 0.1)",
  },
  headerCopy: {
    flex: 1,
  },
  title: {
    ...Typography.body,
    fontWeight: "600",
  },
  subtitle: {
    ...Typography.caption,
    marginTop: 3,
  },
  progressHeadline: {
    ...Typography.headline,
    marginBottom: Spacing.sm,
  },
  progressTrack: {
    height: 6,
    borderRadius: BorderRadius.full,
    overflow: "hidden",
    marginBottom: Spacing.md,
  },
  progressFill: {
    height: "100%",
    borderRadius: BorderRadius.full,
  },
  explanation: {
    ...Typography.small,
    lineHeight: 20,
  },
  pattern: {
    borderTopWidth: 1,
    paddingTop: Spacing.md,
    marginTop: Spacing.sm,
    marginBottom: Spacing.md,
  },
  patternHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: Spacing.sm,
  },
  patternTitle: {
    ...Typography.body,
    fontWeight: "600",
    flex: 1,
  },
  patternDetail: {
    ...Typography.small,
    lineHeight: 20,
    marginTop: Spacing.sm,
  },
  tuneUpButton: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    borderWidth: 1,
    borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.lg,
    marginTop: Spacing.sm,
  },
  tuneUpText: {
    ...Typography.small,
    fontWeight: "700",
  },
});
