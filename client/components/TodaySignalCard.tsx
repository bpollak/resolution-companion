import React from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { ThemedText } from "@/components/ThemedText";
import { useTheme } from "@/hooks/useTheme";
import { BorderRadius, Colors, Spacing, Typography } from "@/constants/theme";
import type { TodaySignal } from "@/lib/ambient-coach";

interface TodaySignalCardProps {
  signal: TodaySignal;
  completed: number;
  scheduled: number;
  streakLabel: string;
  consistency: number;
  onPrimary?: () => void;
  onCoach?: () => void;
}

export function TodaySignalCard({
  signal,
  completed,
  scheduled,
  streakLabel,
  consistency,
  onPrimary,
  onCoach,
}: TodaySignalCardProps) {
  const { theme, isDark } = useTheme();
  // The frame carries the signal's meaning; actions stay accent-colored.
  // Green = done, amber = gentle friction, accent = everything else (with
  // the icon differentiating pattern/rest/ordinary days).
  const frame =
    signal.kind === "complete"
      ? { color: theme.success, icon: "check-circle" as const }
      : signal.kind === "reduce-friction"
        ? { color: theme.warning, icon: "wind" as const }
        : signal.kind === "protect-pattern"
          ? { color: theme.accent, icon: "eye" as const }
          : signal.kind === "rest"
            ? { color: theme.accent, icon: "moon" as const }
            : { color: theme.accent, icon: "compass" as const };
  const press = (callback?: () => void) => {
    if (!callback) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    callback();
  };
  return (
    <View style={styles.container}>
      <View style={styles.stats}>
        <View style={styles.stat}>
          <ThemedText style={[styles.statValue, { color: theme.accent }]}>
            {scheduled === 0 ? "Rest" : `${completed}/${scheduled}`}
          </ThemedText>
          <ThemedText
            style={[styles.statLabel, { color: theme.textSecondary }]}
          >
            Today
          </ThemedText>
        </View>
        <View style={[styles.divider, { backgroundColor: theme.border }]} />
        <View style={styles.stat}>
          <ThemedText style={styles.statValue}>{streakLabel}</ThemedText>
          <ThemedText
            style={[styles.statLabel, { color: theme.textSecondary }]}
          >
            Continuity
          </ThemedText>
        </View>
        <View style={[styles.divider, { backgroundColor: theme.border }]} />
        <View style={styles.stat}>
          <ThemedText style={styles.statValue}>{consistency}%</ThemedText>
          <ThemedText
            style={[styles.statLabel, { color: theme.textSecondary }]}
          >
            This month
          </ThemedText>
        </View>
      </View>
      <View
        style={[
          styles.card,
          {
            backgroundColor: isDark
              ? Colors.dark.backgroundDefault
              : Colors.light.backgroundDefault,
            borderColor: `${frame.color}55`,
          },
        ]}
      >
        <View style={styles.eyebrowRow}>
          <Feather name={frame.icon} size={16} color={frame.color} />
          <ThemedText style={[styles.eyebrow, { color: frame.color }]}>
            {signal.eyebrow}
          </ThemedText>
        </View>
        <ThemedText style={styles.headline}>{signal.headline}</ThemedText>
        <ThemedText style={[styles.detail, { color: theme.textSecondary }]}>
          {signal.detail}
        </ThemedText>
        {(signal.primaryLabel && onPrimary) ||
        (signal.coachPrompt && onCoach) ? (
          <View style={styles.actions}>
            {signal.primaryLabel && onPrimary ? (
              <Pressable
                onPress={() => press(onPrimary)}
                accessibilityRole="button"
                accessibilityLabel={signal.primaryLabel}
                style={({ pressed }) => [
                  styles.primary,
                  {
                    backgroundColor: theme.accent,
                    opacity: pressed ? 0.78 : 1,
                  },
                ]}
              >
                <ThemedText
                  style={[styles.primaryText, { color: theme.buttonText }]}
                >
                  {signal.primaryLabel}
                </ThemedText>
              </Pressable>
            ) : null}
            {signal.coachPrompt && onCoach ? (
              <Pressable
                onPress={() => press(onCoach)}
                hitSlop={8}
                pressRetentionOffset={12}
                accessibilityRole="button"
                accessibilityLabel="Ask Coach about this"
                style={({ pressed }) => [
                  styles.coach,
                  { opacity: pressed ? 0.6 : 1 },
                ]}
              >
                <Feather name="message-circle" size={15} color={theme.accent} />
                <ThemedText style={[styles.coachText, { color: theme.accent }]}>
                  Ask Coach
                </ThemedText>
              </Pressable>
            ) : null}
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginBottom: Spacing.xl },
  stats: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: Spacing.md,
  },
  stat: { flex: 1, alignItems: "center" },
  statValue: { ...Typography.body, fontWeight: "700" },
  statLabel: { ...Typography.caption, marginTop: 2 },
  divider: { width: StyleSheet.hairlineWidth, height: 34 },
  card: { borderRadius: BorderRadius.lg, borderWidth: 1, padding: Spacing.lg },
  eyebrowRow: { flexDirection: "row", alignItems: "center", gap: Spacing.sm },
  eyebrow: {
    ...Typography.caption,
    fontWeight: "700",
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  headline: { ...Typography.headline, marginTop: Spacing.md },
  detail: { ...Typography.body, lineHeight: 22, marginTop: Spacing.sm },
  actions: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: Spacing.md,
    marginTop: Spacing.lg,
  },
  primary: {
    minHeight: 44,
    borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.lg,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryText: { ...Typography.body, fontWeight: "700" },
  coach: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    paddingHorizontal: Spacing.sm,
  },
  coachText: { ...Typography.small, fontWeight: "700" },
});
