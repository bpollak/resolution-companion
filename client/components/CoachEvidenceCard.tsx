import React from "react";
import { StyleSheet, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { ThemedText } from "@/components/ThemedText";
import { useTheme } from "@/hooks/useTheme";
import { BorderRadius, Colors, Spacing, Typography } from "@/constants/theme";
import type { CoachEvidenceSnapshot } from "@/lib/storage";

export function CoachEvidenceCard({
  evidence,
}: {
  evidence: CoachEvidenceSnapshot;
}) {
  const { theme, isDark } = useTheme();
  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: isDark
            ? Colors.dark.backgroundDefault
            : Colors.light.backgroundDefault,
          borderColor: `${theme.accent}33`,
        },
      ]}
    >
      <View style={styles.header}>
        <Feather name="activity" size={16} color={theme.accent} />
        <ThemedText style={[styles.eyebrow, { color: theme.accent }]}>
          {evidence.eyebrow}
        </ThemedText>
        {evidence.value ? (
          <ThemedText style={[styles.value, { color: theme.accent }]}>
            {evidence.value}
          </ThemedText>
        ) : null}
      </View>
      <ThemedText style={styles.headline}>{evidence.headline}</ThemedText>
      <ThemedText style={[styles.detail, { color: theme.textSecondary }]}>
        {evidence.detail}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.md,
    padding: Spacing.lg,
    borderWidth: 1,
    borderRadius: BorderRadius.lg,
  },
  header: { flexDirection: "row", alignItems: "center", gap: Spacing.sm },
  eyebrow: {
    ...Typography.caption,
    fontWeight: "700",
    flex: 1,
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  value: { ...Typography.body, fontWeight: "800" },
  headline: { ...Typography.headline, marginTop: Spacing.md },
  detail: { ...Typography.small, lineHeight: 20, marginTop: Spacing.sm },
});
