import React from "react";
import { StyleSheet, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { ThemedText } from "@/components/ThemedText";
import { useTheme } from "@/hooks/useTheme";
import { BorderRadius, Colors, Spacing, Typography } from "@/constants/theme";
import type { ElementalAction } from "@/lib/storage";
import type { ActionRhythm } from "@/lib/ambient-coach";

const CATEGORY_COPY = {
  "working-well": { label: "Working well", icon: "check-circle" as const },
  "still-forming": { label: "Still forming", icon: "clock" as const },
  "worth-simplifying": {
    label: "Worth simplifying",
    icon: "minimize-2" as const,
  },
};

export function JourneyFramingCard({
  actions,
  rhythms,
}: {
  actions: ElementalAction[];
  rhythms: ActionRhythm[];
}) {
  const { theme, isDark } = useTheme();
  const actionById = new Map(actions.map((action) => [action.id, action]));

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: isDark
            ? Colors.dark.backgroundDefault
            : Colors.light.backgroundDefault,
          borderColor: theme.border,
        },
      ]}
    >
      <View style={styles.header}>
        <View>
          <ThemedText style={[styles.eyebrow, { color: theme.accent }]}>
            YOUR RHYTHM
          </ThemedText>
          <ThemedText style={styles.title}>How the plan is fitting</ThemedText>
        </View>
        <Feather name="activity" size={20} color={theme.accent} />
      </View>
      <ThemedText style={[styles.explainer, { color: theme.textSecondary }]}>
        Based on the last 28 scheduled days. These labels guide the plan; they
        never reduce milestone progress.
      </ThemedText>
      <View style={styles.rhythms}>
        {rhythms.map((rhythm) => {
          const copy = CATEGORY_COPY[rhythm.category];
          return (
            <View
              key={rhythm.actionId}
              style={[styles.rhythm, { borderTopColor: theme.border }]}
            >
              <Feather
                name={copy.icon}
                size={16}
                color={
                  rhythm.category === "worth-simplifying"
                    ? theme.warning
                    : rhythm.category === "working-well"
                      ? theme.success
                      : theme.accent
                }
              />
              <View style={styles.rhythmText}>
                <ThemedText style={styles.actionTitle} numberOfLines={1}>
                  {actionById.get(rhythm.actionId)?.title ?? "Action"}
                </ThemedText>
                <ThemedText
                  style={[styles.category, { color: theme.textSecondary }]}
                >
                  {copy.label} · {rhythm.completed}/{rhythm.scheduled} completed
                </ThemedText>
              </View>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    marginBottom: Spacing.xl,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  eyebrow: { ...Typography.caption, fontWeight: "800", letterSpacing: 1 },
  title: { ...Typography.headline, marginTop: 3 },
  explainer: { ...Typography.small, lineHeight: 19, marginTop: Spacing.sm },
  rhythms: { marginTop: Spacing.md },
  rhythm: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingVertical: Spacing.md,
  },
  rhythmText: { flex: 1 },
  actionTitle: { ...Typography.body, fontWeight: "600" },
  category: { ...Typography.caption, marginTop: 2 },
});
