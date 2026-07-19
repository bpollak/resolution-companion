import React from "react";
import { View, StyleSheet, Pressable } from "react-native";
import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";

import { ThemedText } from "@/components/ThemedText";
import { useTheme } from "@/hooks/useTheme";
import type { MonthRecap } from "@/lib/recap";
import { Colors, Spacing, BorderRadius, Typography } from "@/constants/theme";

interface MonthRecapCardProps {
  recap: MonthRecap;
  onOpen: () => void;
  onDismiss: () => void;
}

/**
 * Entry card for the "Month in Votes" story, shown on Today during the first
 * days of a new month — the clean slate gets a closing ceremony before the
 * fresh start.
 */
export function MonthRecapCard({
  recap,
  onOpen,
  onDismiss,
}: MonthRecapCardProps) {
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
        <MaterialCommunityIcons
          name="calendar-star"
          size={18}
          color={theme.accent}
        />
        <ThemedText style={styles.title}>{recap.monthLabel}, closed</ThemedText>
        <Pressable
          onPress={onDismiss}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Dismiss month recap"
          style={styles.close}
        >
          <Feather name="x" size={18} color={theme.textSecondary} />
        </Pressable>
      </View>

      <ThemedText style={styles.headline}>
        {recap.votesCast} {recap.votesCast === 1 ? "vote" : "votes"} for{" "}
        {recap.personaName}
      </ThemedText>
      <ThemedText style={[styles.sub, { color: theme.textSecondary }]}>
        {recap.comeback
          ? "Including a comeback worth celebrating."
          : "Your month, told the no-guilt way."}
      </ThemedText>

      <Pressable
        onPress={onOpen}
        hitSlop={8}
        pressRetentionOffset={12}
        accessibilityRole="button"
        accessibilityLabel="Open your Month in Votes story"
        style={({ pressed }) => [styles.cta, { opacity: pressed ? 0.7 : 1 }]}
      >
        <ThemedText style={[styles.ctaText, { color: theme.accent }]}>
          See your story
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
  headline: {
    ...Typography.headline,
    marginBottom: Spacing.xs,
  },
  sub: {
    ...Typography.small,
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
