import React from "react";
import { View, StyleSheet } from "react-native";
import { ThemedText } from "@/components/ThemedText";
import { useTheme } from "@/hooks/useTheme";
import { Colors, Spacing, BorderRadius, Typography } from "@/constants/theme";

interface StatChipProps {
  /** Leading icon element (e.g. a Feather icon). */
  icon: React.ReactNode;
  text: string;
  /** Optional trailing detail (e.g. a delta like "▲3"). */
  detail?: string;
  detailColor?: string;
}

export function StatChip({ icon, text, detail, detailColor }: StatChipProps) {
  const { theme, isDark } = useTheme();

  return (
    <View
      style={[
        styles.chip,
        {
          backgroundColor: isDark
            ? Colors.dark.backgroundDefault
            : Colors.light.backgroundDefault,
        },
      ]}
    >
      {icon}
      <ThemedText style={styles.text}>{text}</ThemedText>
      {detail ? (
        <ThemedText
          style={[styles.detail, { color: detailColor ?? theme.textSecondary }]}
        >
          {detail}
        </ThemedText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.full,
  },
  text: {
    ...Typography.small,
    fontWeight: "600",
  },
  detail: {
    ...Typography.caption,
    fontWeight: "600",
  },
});
