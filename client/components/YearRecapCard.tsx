import React from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import { ThemedText } from "@/components/ThemedText";
import { useTheme } from "@/hooks/useTheme";
import { BorderRadius, Spacing, Typography } from "@/constants/theme";
import type { YearRecap } from "@/lib/recap";

export function YearRecapCard({
  recap,
  onOpen,
  onDismiss,
}: {
  recap: YearRecap;
  onOpen: () => void;
  onDismiss: () => void;
}) {
  const { theme } = useTheme();
  return (
    <View style={[styles.card, { backgroundColor: theme.cardBackground }]}>
      <View style={styles.header}>
        <MaterialCommunityIcons
          name="compass-outline"
          size={19}
          color={theme.accent}
        />
        <ThemedText style={styles.title}>The Year You Became</ThemedText>
        <Pressable
          onPress={onDismiss}
          hitSlop={12}
          pressRetentionOffset={16}
          accessibilityRole="button"
          accessibilityLabel="Dismiss year recap"
          style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
        >
          <Feather name="x" size={18} color={theme.textSecondary} />
        </Pressable>
      </View>
      <ThemedText style={[styles.number, { color: theme.accent }]}>
        {recap.votesCast}
      </ThemedText>
      <ThemedText style={styles.headline}>
        votes for {recap.personaName} in {recap.yearLabel}
      </ThemedText>
      <ThemedText style={[styles.body, { color: theme.textSecondary }]}>
        Your premium year-in-review celebrates the returns, floor saves, and
        quiet evidence—not perfection.
      </ThemedText>
      <Pressable
        onPress={onOpen}
        accessibilityRole="button"
        accessibilityLabel={`Open The Year You Became for ${recap.yearLabel}`}
        style={({ pressed }) => [
          styles.open,
          { borderColor: theme.accent, opacity: pressed ? 0.7 : 1 },
        ]}
      >
        <ThemedText style={[styles.openText, { color: theme.accent }]}>
          See your story
        </ThemedText>
        <Feather name="arrow-right" size={16} color={theme.accent} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: BorderRadius.md,
    padding: Spacing.lg,
    marginBottom: Spacing.lg,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  title: { ...Typography.headline, flex: 1 },
  number: {
    fontSize: 42,
    lineHeight: 48,
    fontWeight: "800",
    marginTop: Spacing.md,
  },
  headline: { ...Typography.h4 },
  body: { ...Typography.body, lineHeight: 23, marginTop: Spacing.sm },
  open: {
    minHeight: 48,
    borderWidth: 1,
    borderRadius: BorderRadius.full,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    marginTop: Spacing.md,
  },
  openText: { ...Typography.headline },
});
