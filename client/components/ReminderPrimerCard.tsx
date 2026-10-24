import React, { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { ThemedText } from "@/components/ThemedText";
import { useTheme } from "@/hooks/useTheme";
import { BorderRadius, Spacing } from "@/constants/theme";
import { withAlpha } from "@/lib/color";
import { REMINDER_BUCKETS, suggestReminderBucket } from "@/lib/notifications";
import { parseReminderTime, reminderTimeLabel } from "@/lib/habit-reminders";
import type { ElementalAction } from "@/lib/storage";

// Explains the reminders before iOS asks, so the permission prompt arrives
// with context instead of cold after setup.
export function ReminderPrimerCard({
  actions,
  startLabel,
  onAnswer,
  filled = false,
}: {
  actions: ElementalAction[];
  /** "January 1" when the plan starts later; reminders begin that day. */
  startLabel?: string;
  onAnswer: (accept: boolean) => void;
  /** Fill "Turn on" only when no habit button is on screen to compete with. */
  filled?: boolean;
}) {
  const { theme, isDark } = useTheme();
  const [busy, setBusy] = useState(false);
  const anchors = actions.map((action) => action.anchorLink).filter(Boolean);
  const time = REMINDER_BUCKETS[suggestReminderBucket(anchors)].label;
  const routine = anchors[0];
  // Habits with their own time get their own nudge; the daily reminder only
  // covers the rest, so it is mentioned only when some habit has no time.
  const timed = actions.filter((action) =>
    parseReminderTime(action.reminderTime),
  );
  const times = [
    ...new Set(
      timed
        .map((action) => action.reminderTime as string)
        .sort()
        .map(reminderTimeLabel),
    ),
  ];
  const hasUntimed = timed.length < actions.length;
  const allTimes =
    hasUntimed && !times.includes(time) ? [...times, time] : times;

  const answer = (accept: boolean) => {
    if (busy) return;
    setBusy(true);
    onAnswer(accept);
  };

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: isDark
            ? theme.backgroundDefault
            : theme.backgroundSecondary,
          borderColor: withAlpha(theme.accent, 0.25),
        },
      ]}
    >
      <View style={styles.titleRow}>
        <Feather name="bell" size={18} color={theme.accent} />
        <ThemedText style={styles.title}>Want a nudge?</ThemedText>
      </View>
      <ThemedText style={{ color: theme.textSecondary }}>
        {times.length > 0
          ? `Reminders at ${joinTimes(allTimes)}, only on days a habit isn’t done yet. Each stays quiet once its habit is done${startLabel ? `, and they start ${startLabel}` : ""}.`
          : `One reminder at ${time}${routine ? `, around “${routine}”` : ""}, only on days your habit isn’t done yet. It stays quiet once you’re done${startLabel ? `, and starts ${startLabel}` : ""}.`}
      </ThemedText>
      <View style={styles.buttons}>
        <Pressable
          onPress={() => answer(true)}
          disabled={busy}
          accessibilityRole="button"
          accessibilityLabel={
            times.length > 0
              ? `Turn on reminders at ${joinTimes(allTimes)}`
              : `Turn on a reminder at ${time}`
          }
          hitSlop={8}
          pressRetentionOffset={12}
          style={({ pressed }) => [
            styles.primary,
            {
              borderColor: theme.accent,
              backgroundColor: filled ? theme.accent : "transparent",
              opacity: pressed ? 0.7 : 1,
            },
          ]}
        >
          <ThemedText
            style={{
              color: filled ? theme.buttonText : theme.accent,
              fontWeight: "700",
            }}
          >
            Turn on
          </ThemedText>
        </Pressable>
        <Pressable
          onPress={() => answer(false)}
          disabled={busy}
          accessibilityRole="button"
          accessibilityLabel="Not now. You can turn reminders on in Profile."
          hitSlop={8}
          pressRetentionOffset={12}
          style={({ pressed }) => [
            styles.secondary,
            { opacity: pressed ? 0.6 : 1 },
          ]}
        >
          <ThemedText style={{ color: theme.textSecondary, fontWeight: "600" }}>
            Not now
          </ThemedText>
        </Pressable>
      </View>
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
  titleRow: { flexDirection: "row", alignItems: "center", gap: Spacing.sm },
  title: { fontSize: 18, fontWeight: "700" },
  buttons: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.lg,
    marginTop: Spacing.xs,
  },
  primary: {
    minHeight: 44,
    borderWidth: 1,
    paddingHorizontal: Spacing.xl,
    borderRadius: BorderRadius.full,
    justifyContent: "center",
  },
  secondary: { minHeight: 44, justifyContent: "center" },
});

function joinTimes(times: string[]): string {
  if (times.length <= 1) return times[0] ?? "";
  return `${times.slice(0, -1).join(", ")} and ${times[times.length - 1]}`;
}
