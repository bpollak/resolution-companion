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
  // Each fact once: the detail line usually states the value already
  const showValue =
    !!evidence.value && !evidence.detail.includes(evidence.value);
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
        <Feather name="activity" size={16} color={theme.textSecondary} />
        <ThemedText style={[styles.eyebrow, { color: theme.textSecondary }]}>
          {evidence.eyebrow}
        </ThemedText>
        {showValue ? (
          // Static figure: accent would read as a tappable control beside
          // the sheet's accent "Done"
          <ThemedText style={[styles.value, { color: theme.text }]}>
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
    // No border: bordered surfaces in the sheet are the tappable chips
    borderRadius: BorderRadius.lg,
  },
  header: { flexDirection: "row", alignItems: "center", gap: Spacing.sm },
  eyebrow: {
    ...Typography.small,
    fontWeight: "600",
    flex: 1,
  },
  value: { ...Typography.body, fontWeight: "800" },
  headline: { ...Typography.headline, marginTop: Spacing.md },
  detail: { ...Typography.small, lineHeight: 20, marginTop: Spacing.sm },
});
