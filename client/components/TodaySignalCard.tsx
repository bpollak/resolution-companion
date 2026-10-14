import React from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { ThemedText } from "@/components/ThemedText";
import { useTheme } from "@/hooks/useTheme";
import { BorderRadius, Colors, Spacing, Typography } from "@/constants/theme";
import type { TodaySignal } from "@/lib/ambient-coach";
import { withAlpha } from "@/lib/color";

interface TodaySignalCardProps {
  signal: TodaySignal;
  onPrimary?: () => void;
  onCoach?: () => void;
}

// Today renders this only for signals the habit card can't carry itself
// (a gentler restart or a coach observation); the progress line and the
// "Ask Coach" link for an ordinary day live on Today and the habit card.
export function TodaySignalCard({
  signal,
  onPrimary,
  onCoach,
}: TodaySignalCardProps) {
  const { theme, isDark } = useTheme();
  const compact =
    signal.kind === "next-action" || signal.kind === "reduce-friction";
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
      <View
        style={[
          styles.card,
          compact && { paddingVertical: Spacing.sm },
          {
            backgroundColor: isDark
              ? Colors.dark.backgroundDefault
              : Colors.light.backgroundDefault,
            borderColor: withAlpha(frame.color, 0.33),
          },
        ]}
      >
        <View style={styles.eyebrowRow}>
          <Feather name={frame.icon} size={16} color={frame.color} />
          <ThemedText style={[styles.eyebrow, { color: theme.textSecondary }]}>
            {signal.eyebrow}
          </ThemedText>
        </View>
        <ThemedText style={styles.headline}>
          {signal.kind === "reduce-friction"
            ? "Welcome back. Start small."
            : signal.kind === "next-action"
              ? "One small step today"
              : signal.headline}
        </ThemedText>
        {!compact ? (
          <ThemedText style={[styles.detail, { color: theme.textSecondary }]}>
            {signal.detail}
          </ThemedText>
        ) : null}
        {(signal.primaryLabel && onPrimary) ||
        (signal.coachPrompt && onCoach) ? (
          <View style={styles.actions}>
            {signal.primaryLabel && onPrimary ? (
              <Pressable
                onPress={() => press(onPrimary)}
                accessibilityRole="button"
                accessibilityLabel={signal.primaryLabel}
                hitSlop={8}
                pressRetentionOffset={12}
                style={({ pressed }) => [
                  styles.primary,
                  {
                    borderColor: theme.accent,
                    opacity: pressed ? 0.7 : 1,
                  },
                ]}
              >
                <ThemedText
                  style={[styles.primaryText, { color: theme.accent }]}
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
  container: { marginBottom: Spacing.lg },
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
    marginTop: Spacing.sm,
  },
  // Outlined: the habit card's Mark Complete is Today's one filled button
  primary: {
    minHeight: 44,
    borderWidth: 1,
    borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.lg,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryText: { ...Typography.body, fontWeight: "700", flexShrink: 1 },
  coach: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    paddingHorizontal: Spacing.sm,
  },
  coachText: { ...Typography.small, fontWeight: "700" },
});
