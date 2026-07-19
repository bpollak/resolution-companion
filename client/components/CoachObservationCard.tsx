import React from "react";
import { View, StyleSheet, Pressable } from "react-native";
import { Feather } from "@expo/vector-icons";

import { ThemedText } from "@/components/ThemedText";
import { useTheme } from "@/hooks/useTheme";
import type { CoachObservation } from "@/lib/insights";
import { Colors, Spacing, BorderRadius, Typography } from "@/constants/theme";

interface CoachObservationCardProps {
  observation: CoachObservation;
  onOpenCoach: () => void;
  onDismiss: () => void;
}

/**
 * The coach's one proactive weekly observation, surfaced on Today. Locally
 * computed and always an affirmation — this is what "someone in your corner"
 * means mechanically: the coach speaks first, once a week, when there is
 * genuinely something to say.
 */
export function CoachObservationCard({
  observation,
  onOpenCoach,
  onDismiss,
}: CoachObservationCardProps) {
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
        <Feather name="message-circle" size={18} color={theme.accent} />
        <ThemedText style={styles.title}>Your coach noticed</ThemedText>
        <Pressable
          onPress={onDismiss}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Dismiss coach observation"
          style={styles.close}
        >
          <Feather name="x" size={18} color={theme.textSecondary} />
        </Pressable>
      </View>

      <ThemedText style={[styles.text, { color: theme.text }]}>
        {observation.text}
      </ThemedText>

      <Pressable
        onPress={onOpenCoach}
        hitSlop={8}
        pressRetentionOffset={12}
        accessibilityRole="button"
        accessibilityLabel="Talk it through with your coach"
        style={({ pressed }) => [styles.cta, { opacity: pressed ? 0.7 : 1 }]}
      >
        <ThemedText style={[styles.ctaText, { color: theme.accent }]}>
          Talk it through
        </ThemedText>
        <Feather name="arrow-right" size={14} color={theme.accent} />
      </Pressable>
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
  text: {
    ...Typography.body,
    lineHeight: 22,
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
