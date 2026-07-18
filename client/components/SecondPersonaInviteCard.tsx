import React from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useTheme } from "@/hooks/useTheme";
import { ThemedText } from "@/components/ThemedText";
import { BorderRadius, Spacing, Typography } from "@/constants/theme";

export function SecondPersonaInviteCard({
  personaName,
  onExplore,
  onDismiss,
}: {
  personaName: string;
  onExplore: () => void;
  onDismiss: () => void;
}) {
  const { theme } = useTheme();
  return (
    <View
      style={[
        styles.card,
        { backgroundColor: theme.cardBackground, borderColor: theme.border },
      ]}
    >
      <View style={styles.header}>
        <View style={[styles.icon, { backgroundColor: `${theme.accent}18` }]}>
          <Feather name="layers" size={18} color={theme.accent} />
        </View>
        <View style={styles.copy}>
          <ThemedText style={styles.eyebrow}>ANOTHER PART OF YOU</ThemedText>
          <ThemedText style={styles.title}>
            {personaName} has a rhythm now
          </ThemedText>
        </View>
        <Pressable
          onPress={onDismiss}
          hitSlop={12}
          pressRetentionOffset={16}
          accessibilityRole="button"
          accessibilityLabel="Dismiss second journey invitation for this month"
          style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1 })}
        >
          <Feather name="x" size={18} color={theme.textSecondary} />
        </Pressable>
      </View>
      <ThemedText style={[styles.body, { color: theme.textSecondary }]}>
        If another identity matters to you, you can start it when you&rsquo;re
        ready. Your current journey stays exactly as it is.
      </ThemedText>
      <Pressable
        onPress={onExplore}
        accessibilityRole="button"
        accessibilityLabel="Explore another journey"
        style={({ pressed }) => [
          styles.action,
          { borderColor: theme.accent, opacity: pressed ? 0.7 : 1 },
        ]}
      >
        <ThemedText style={[styles.actionText, { color: theme.accent }]}>
          Explore another journey
        </ThemedText>
        <Feather name="arrow-right" size={16} color={theme.accent} />
      </Pressable>
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
  header: { flexDirection: "row", alignItems: "flex-start", gap: Spacing.md },
  icon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  copy: { flex: 1 },
  eyebrow: {
    ...Typography.caption,
    fontWeight: "700",
    letterSpacing: 0.8,
  },
  title: { ...Typography.headline, marginTop: 2 },
  body: { ...Typography.body, lineHeight: 23, marginTop: Spacing.md },
  action: {
    minHeight: 48,
    borderWidth: 1,
    borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.lg,
    marginTop: Spacing.lg,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
  },
  actionText: { ...Typography.body, fontWeight: "700" },
});
