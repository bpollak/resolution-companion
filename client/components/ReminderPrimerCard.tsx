import React, { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { ThemedText } from "@/components/ThemedText";
import { useTheme } from "@/hooks/useTheme";
import { BorderRadius, Spacing } from "@/constants/theme";
import { REMINDER_BUCKETS, suggestReminderBucket } from "@/lib/notifications";
import type { ElementalAction } from "@/lib/storage";

// Explains the one reminder before iOS asks, so the permission prompt arrives
// with context instead of cold after setup.
export function ReminderPrimerCard({
  actions,
  startLabel,
  onAnswer,
}: {
  actions: ElementalAction[];
  /** "January 1" when the plan starts later; reminders begin that day. */
  startLabel?: string;
  onAnswer: (accept: boolean) => void;
}) {
  const { theme, isDark } = useTheme();
  const [busy, setBusy] = useState(false);
  const anchors = actions.map((action) => action.anchorLink).filter(Boolean);
  const time = REMINDER_BUCKETS[suggestReminderBucket(anchors)].label;
  const routine = anchors[0];

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
          borderColor: `${theme.accent}40`,
        },
      ]}
    >
      <View style={styles.titleRow}>
        <Feather name="bell" size={18} color={theme.accent} />
        <ThemedText style={styles.title}>Want a nudge?</ThemedText>
      </View>
      <ThemedText style={{ color: theme.textSecondary }}>
        One reminder at {time}
        {routine ? `, around “${routine}”` : ""}, only on days your habit
        isn&rsquo;t done yet. It stays quiet once you&rsquo;re done
        {startLabel ? `, and starts ${startLabel}` : ""}.
      </ThemedText>
      <View style={styles.buttons}>
        <Pressable
          onPress={() => answer(true)}
          disabled={busy}
          accessibilityRole="button"
          accessibilityLabel={`Turn on a reminder at ${time}`}
          hitSlop={8}
          pressRetentionOffset={12}
          style={({ pressed }) => [
            styles.primary,
            { backgroundColor: theme.accent, opacity: pressed ? 0.7 : 1 },
          ]}
        >
          <ThemedText style={{ color: theme.buttonText, fontWeight: "700" }}>
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
          <ThemedText style={{ color: theme.accent, fontWeight: "600" }}>
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
    paddingHorizontal: Spacing.xl,
    borderRadius: BorderRadius.full,
    justifyContent: "center",
  },
  secondary: { minHeight: 44, justifyContent: "center" },
});
