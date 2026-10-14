import React, { useEffect, useMemo } from "react";
import { View, StyleSheet, Pressable } from "react-native";
import Svg, { Polyline, Circle } from "react-native-svg";
import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";

import { ThemedText } from "@/components/ThemedText";
import { useTheme } from "@/hooks/useTheme";
import { Colors, Spacing, BorderRadius, Typography } from "@/constants/theme";
import type { ElementalAction, DailyLog } from "@/lib/storage";
import {
  buildInsightsNarrative,
  computeWeekdayProfile,
  computeWeeklyTrend,
} from "@/lib/insights";
import { track } from "@/lib/telemetry";
import { withAlpha } from "@/lib/color";

interface InsightsPanelProps {
  actions: ElementalAction[];
  dailyLogs: DailyLog[];
  personaName: string;
  isPremium: boolean;
  /** Opens the paywall with insights context. */
  onUpgrade: () => void;
}

const SPARK_WIDTH = 260;
const SPARK_HEIGHT = 48;

/**
 * Premium insights: day-of-week profile, momentum sparkline, and ONE
 * narrative + recommendation (the Oura pattern — story, not dashboards).
 * Free users see the merged Premium card instead, never a blurred tease of
 * their own data.
 */
export function InsightsPanel({
  actions,
  dailyLogs,
  personaName,
  isPremium,
  onUpgrade,
}: InsightsPanelProps) {
  const { theme, isDark } = useTheme();

  const weekdayProfile = useMemo(
    () => computeWeekdayProfile(actions, dailyLogs),
    [actions, dailyLogs],
  );
  const trend = useMemo(
    () => computeWeeklyTrend(actions, dailyLogs),
    [actions, dailyLogs],
  );
  const narrative = useMemo(
    () => buildInsightsNarrative(weekdayProfile, trend, personaName),
    [weekdayProfile, trend, personaName],
  );

  useEffect(() => {
    if (isPremium) track("insights_viewed");
  }, [isPremium]);

  const cardBackground = isDark
    ? Colors.dark.backgroundDefault
    : Colors.light.backgroundDefault;

  // Free users get the one Premium card on Journey: Insights leads because
  // it is the part they can't see, followed by the other Premium unlocks.
  if (!isPremium) {
    return (
      <Pressable
        onPress={onUpgrade}
        hitSlop={8}
        pressRetentionOffset={12}
        accessibilityRole="button"
        accessibilityLabel="Premium. See when you show up and how your consistency is trending, plus unlimited milestones, plans and coaching. See plans."
        style={({ pressed }) => [
          styles.card,
          {
            backgroundColor: cardBackground,
            borderColor: theme.border,
            opacity: pressed ? 0.85 : 1,
            transform: [{ scale: pressed ? 0.98 : 1 }],
          },
        ]}
      >
        <View style={styles.header}>
          <MaterialCommunityIcons
            name="chart-timeline-variant"
            size={18}
            color={theme.accent}
          />
          <ThemedText style={styles.title}>Insights with Premium</ThemedText>
          <Feather name="lock" size={16} color={theme.textSecondary} />
        </View>
        <ThemedText style={[styles.lockedText, { color: theme.textSecondary }]}>
          See when you show up and how your consistency is trending. Plus
          unlimited milestones, plans and coaching.
        </ThemedText>
        <View style={styles.cta}>
          <ThemedText style={[styles.ctaText, { color: theme.accent }]}>
            See plans
          </ThemedText>
          <Feather name="arrow-right" size={14} color={theme.accent} />
        </View>
      </Pressable>
    );
  }

  const sparkPoints = trend
    .map((point, i) => {
      const x = trend.length > 1 ? (i / (trend.length - 1)) * SPARK_WIDTH : 0;
      const y = SPARK_HEIGHT - (point.score / 100) * SPARK_HEIGHT;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  const lastPoint = trend[trend.length - 1];
  const lastX = SPARK_WIDTH;
  const lastY = SPARK_HEIGHT - (lastPoint.score / 100) * SPARK_HEIGHT;

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: cardBackground,
          borderColor: withAlpha(theme.accent, 0.3),
        },
      ]}
    >
      <View style={styles.header}>
        <MaterialCommunityIcons
          name="chart-timeline-variant"
          size={18}
          color={theme.accent}
        />
        <ThemedText style={styles.title}>Insights</ThemedText>
      </View>

      <ThemedText style={styles.narrativeHeadline}>
        {narrative.headline}
      </ThemedText>

      <View style={styles.sectionLabelRow}>
        <ThemedText
          style={[styles.sectionLabel, { color: theme.textSecondary }]}
        >
          WHEN YOU SHOW UP · 8 WEEKS
        </ThemedText>
      </View>
      <View
        style={styles.weekdayRow}
        accessibilityLabel={`Completions by weekday. Best day: ${weekdayProfile.bestDay ?? "none yet"}.`}
      >
        {weekdayProfile.profile.map((entry) => {
          const heightRatio =
            weekdayProfile.maxCompletions > 0
              ? entry.completions / weekdayProfile.maxCompletions
              : 0;
          const isBest =
            entry.day === weekdayProfile.bestDay && entry.completions > 0;
          return (
            <View key={entry.day} style={styles.weekdayCol}>
              <View style={styles.barTrack}>
                <View
                  style={[
                    styles.barFill,
                    {
                      height: `${Math.max(heightRatio * 100, entry.completions > 0 ? 8 : 0)}%`,
                      backgroundColor: isBest
                        ? theme.accent
                        : isDark
                          ? Colors.dark.backgroundTertiary
                          : Colors.light.backgroundTertiary,
                    },
                  ]}
                />
              </View>
              <ThemedText
                style={[
                  styles.weekdayLabel,
                  {
                    color: isBest ? theme.accent : theme.textSecondary,
                    fontWeight: isBest ? "700" : "400",
                  },
                ]}
              >
                {entry.day.slice(0, 1)}
              </ThemedText>
            </View>
          );
        })}
      </View>

      <View style={styles.sectionLabelRow}>
        <ThemedText
          style={[styles.sectionLabel, { color: theme.textSecondary }]}
        >
          MOMENTUM · WEEKLY CONSISTENCY
        </ThemedText>
        <ThemedText style={[styles.sparkValue, { color: theme.accent }]}>
          {lastPoint.score}%
        </ThemedText>
      </View>
      <Svg
        width="100%"
        height={SPARK_HEIGHT + 8}
        viewBox={`0 -4 ${SPARK_WIDTH} ${SPARK_HEIGHT + 8}`}
        accessibilityLabel="Weekly consistency trend over the last 8 weeks"
      >
        <Polyline
          points={sparkPoints}
          fill="none"
          stroke={theme.accent}
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
          opacity={0.9}
        />
        <Circle cx={lastX} cy={lastY} r={3.5} fill={theme.accent} />
      </Svg>

      <View style={styles.recommendationRow}>
        <Feather name="compass" size={14} color={theme.success} />
        <ThemedText
          style={[styles.recommendation, { color: theme.textSecondary }]}
        >
          {narrative.recommendation}
        </ThemedText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: Spacing.lg,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.xl,
    borderWidth: 1,
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
  narrativeHeadline: {
    ...Typography.headline,
    marginBottom: Spacing.lg,
  },
  sectionLabelRow: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    marginBottom: Spacing.sm,
  },
  sectionLabel: {
    ...Typography.caption,
    letterSpacing: 1,
    fontWeight: "600",
  },
  sparkValue: {
    ...Typography.body,
    fontWeight: "700",
  },
  weekdayRow: {
    flexDirection: "row",
    gap: Spacing.sm,
    marginBottom: Spacing.lg,
    height: 72,
  },
  weekdayCol: {
    flex: 1,
    alignItems: "center",
    gap: Spacing.xs,
  },
  barTrack: {
    flex: 1,
    width: "100%",
    justifyContent: "flex-end",
  },
  barFill: {
    width: "100%",
    borderRadius: 4,
  },
  weekdayLabel: {
    ...Typography.caption,
  },
  recommendationRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: Spacing.sm,
    marginTop: Spacing.md,
  },
  recommendation: {
    ...Typography.small,
    flex: 1,
    lineHeight: 19,
  },
  lockedText: {
    ...Typography.small,
    lineHeight: 20,
  },
  cta: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    marginTop: Spacing.md,
  },
  ctaText: {
    ...Typography.small,
    fontWeight: "600",
  },
});
