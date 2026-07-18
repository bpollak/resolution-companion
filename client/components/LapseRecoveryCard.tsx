import React from "react";
import { View, StyleSheet, Pressable } from "react-native";
import { Feather } from "@expo/vector-icons";

import { ThemedText } from "@/components/ThemedText";
import { useTheme } from "@/hooks/useTheme";
import { Colors, Spacing, BorderRadius, Typography } from "@/constants/theme";

interface LapseRecoveryCardProps {
  onCoachPress: () => void;
  onDismiss: () => void;
}

/**
 * Gentle re-engagement after 2+ consecutive fully-missed scheduled days.
 * Frames the lapse as a plan problem, not a person problem, and routes to
 * the Coach tab where the plan can bend.
 */
export function LapseRecoveryCard({
  onCoachPress,
  onDismiss,
}: LapseRecoveryCardProps) {
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
        <Feather name="sunrise" size={18} color={theme.accent} />
        <ThemedText style={styles.title}>
          Rough couple of days &mdash; that happens
        </ThemedText>
        <Pressable
          onPress={onDismiss}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Dismiss check-in suggestion"
          style={styles.close}
        >
          <Feather name="x" size={18} color={theme.textSecondary} />
        </Pressable>
      </View>
      <ThemedText style={[styles.body, { color: theme.textSecondary }]}>
        Your plan can bend before it breaks. The 2-minute versions still count,
        and your coach can help make things easier.
      </ThemedText>
      <Pressable
        onPress={onCoachPress}
        hitSlop={4}
        accessibilityRole="button"
        accessibilityLabel="Open the Coach tab to adjust your plan"
        style={({ pressed }) => [
          styles.cta,
          { borderColor: theme.accent },
          { opacity: pressed ? 0.7 : 1 },
          pressed && styles.ctaPressed,
        ]}
      >
        <Feather name="message-circle" size={16} color={theme.accent} />
        <ThemedText style={[styles.ctaText, { color: theme.accent }]}>
          Talk it through with your coach
        </ThemedText>
        <Feather name="chevron-right" size={16} color={theme.accent} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: Spacing.lg,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.lg,
    borderWidth: 1,
    borderColor: "rgba(0, 217, 255, 0.3)",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  title: {
    ...Typography.body,
    fontWeight: "600",
    flex: 1,
  },
  close: {
    padding: Spacing.xs,
  },
  body: {
    ...Typography.small,
    lineHeight: 20,
    marginBottom: Spacing.md,
  },
  cta: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    borderColor: "rgba(0, 217, 255, 0.5)",
    alignSelf: "flex-start",
  },
  ctaPressed: {
    transform: [{ scale: 0.97 }],
  },
  ctaText: {
    ...Typography.small,
    fontWeight: "600",
  },
});
