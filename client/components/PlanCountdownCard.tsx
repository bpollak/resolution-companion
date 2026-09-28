import React from "react";
import { StyleSheet, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { ThemedText } from "@/components/ThemedText";
import { useTheme } from "@/hooks/useTheme";
import { BorderRadius, Spacing, Typography } from "@/constants/theme";
import type { ElementalAction } from "@/lib/storage";
import { daysUntil } from "@/lib/onboarding-plan";

// Shown on Today when a plan was set up ahead of its start day (usually
// January 1): nothing is scheduled yet, so there is nothing to miss.
export function PlanCountdownCard({
  start,
  firstAction,
  resolution,
}: {
  start: Date;
  firstAction?: ElementalAction;
  resolution?: string;
}) {
  const { theme, isDark } = useTheme();
  const days = daysUntil(start);
  const startLabel = start.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
  });
  const countdown = days <= 1 ? "Starts tomorrow" : `${days} days to go`;

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: isDark
            ? theme.backgroundDefault
            : theme.backgroundSecondary,
          borderColor: `${theme.accent}40`,
        },
      ]}
      accessible
      accessibilityLabel={`Your plan starts ${startLabel}. ${countdown}.${firstAction ? ` First habit: ${firstAction.title}.` : ""}`}
    >
      <View style={styles.eyebrowRow}>
        <Feather name="calendar" size={16} color={theme.accent} />
        <ThemedText style={[styles.eyebrow, { color: theme.accent }]}>
          Starts {startLabel}
        </ThemedText>
      </View>
      <ThemedText style={styles.countdown}>{countdown}</ThemedText>
      {resolution ? (
        <ThemedText style={{ color: theme.textSecondary }}>
          Your resolution: {resolution}
        </ThemedText>
      ) : null}
      {firstAction ? (
        <View style={styles.preview}>
          <ThemedText style={styles.label}>Your first habit</ThemedText>
          <ThemedText>{firstAction.title}</ThemedText>
          {firstAction.kickstartVersion ? (
            <ThemedText style={{ color: theme.textSecondary }}>
              Busy day? Just: {firstAction.kickstartVersion}
            </ThemedText>
          ) : null}
        </View>
      ) : null}
      <ThemedText style={{ color: theme.textSecondary }}>
        Get ready this week: tell one person your resolution, and set out what
        you&rsquo;ll need on day one. Nothing counts as missed before{" "}
        {startLabel}.
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    gap: Spacing.sm,
    marginBottom: Spacing.lg,
  },
  eyebrowRow: { flexDirection: "row", alignItems: "center", gap: Spacing.xs },
  eyebrow: {
    ...Typography.small,
    fontWeight: "700",
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  countdown: { fontSize: 28, lineHeight: 34, fontWeight: "700" },
  preview: { gap: 2, paddingVertical: Spacing.xs },
  label: { ...Typography.small, fontWeight: "600" },
});
