import React, { useState } from "react";
import { StyleSheet, View, Pressable } from "react-native";
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
  onAdjust,
}: {
  actions: ElementalAction[];
  rhythms: ActionRhythm[];
  onAdjust: (actionId: string) => void;
}) {
  const { theme, isDark } = useTheme();
  const [showAll, setShowAll] = useState(false);
  const ranked = [...rhythms].sort(
    (a, b) =>
      Number(b.category === "worth-simplifying") -
      Number(a.category === "worth-simplifying"),
  );
  const visibleRhythms = showAll ? ranked : ranked.slice(0, 1);
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
        Planned days in the last 4 weeks. Your milestone progress stays with
        you.
      </ThemedText>
      <View style={styles.rhythms}>
        {visibleRhythms.map((rhythm) => {
          const copy = CATEGORY_COPY[rhythm.category];
          return (
            <Pressable
              key={rhythm.actionId}
              onPress={() => onAdjust(rhythm.actionId)}
              accessibilityRole="button"
              accessibilityLabel={`Adjust ${actionById.get(rhythm.actionId)?.title ?? "habit"}. ${copy.label}`}
              hitSlop={8}
              pressRetentionOffset={12}
              style={({ pressed }) => [
                styles.rhythm,
                { borderTopColor: theme.border, opacity: pressed ? 0.6 : 1 },
              ]}
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
                <ThemedText style={styles.actionTitle}>
                  {actionById.get(rhythm.actionId)?.title ?? "Action"}
                </ThemedText>
                <ThemedText
                  style={[styles.category, { color: theme.textSecondary }]}
                >
                  {rhythm.scheduled < 4
                    ? "Still learning your rhythm"
                    : `${copy.label} · ${rhythm.completed}/${rhythm.scheduled} completed`}
                </ThemedText>
                <ThemedText style={[styles.category, { color: theme.accent }]}>
                  Adjust this habit →
                </ThemedText>
              </View>
            </Pressable>
          );
        })}
      </View>
      {rhythms.length > 1 ? (
        <Pressable
          onPress={() => setShowAll((value) => !value)}
          accessibilityRole="button"
          accessibilityState={{ expanded: showAll }}
          accessibilityLabel={
            showAll ? "Show fewer habits" : `See all ${rhythms.length} habits`
          }
          hitSlop={8}
          pressRetentionOffset={12}
          style={({ pressed }) => ({
            minHeight: 44,
            justifyContent: "center",
            opacity: pressed ? 0.6 : 1,
          })}
        >
          <ThemedText style={{ color: theme.accent }}>
            {showAll ? "Show less" : `See all ${rhythms.length} habits`}
          </ThemedText>
        </Pressable>
      ) : null}
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
