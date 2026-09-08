import React from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { ThemedText } from "@/components/ThemedText";
import { useTheme } from "@/hooks/useTheme";
import { BorderRadius, Spacing, Typography } from "@/constants/theme";

export function WitnessCelebrationCard({
  witnessName,
  onShare,
  onDismiss,
}: {
  witnessName: string;
  onShare: () => void;
  onDismiss: () => void;
}) {
  const { theme } = useTheme();
  return (
    <View style={[styles.card, { backgroundColor: theme.cardBackground }]}>
      <View style={styles.header}>
        <Feather name="users" size={18} color={theme.accent} />
        <ThemedText style={styles.title}>Someone in your corner</ThemedText>
        <Pressable
          onPress={onDismiss}
          hitSlop={12}
          pressRetentionOffset={16}
          accessibilityRole="button"
          accessibilityLabel="Dismiss witness celebration"
          style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
        >
          <Feather name="x" size={18} color={theme.textSecondary} />
        </Pressable>
      </View>
      <ThemedText style={[styles.body, { color: theme.textSecondary }]}>
        Let {witnessName} witness last week’s progress. This is celebration
        only—you choose the message and app in the share sheet.
      </ThemedText>
      <Pressable
        onPress={onShare}
        accessibilityRole="button"
        accessibilityLabel={`Share last week's celebration with ${witnessName}`}
        style={({ pressed }) => [
          styles.share,
          { borderColor: theme.accent, opacity: pressed ? 0.7 : 1 },
        ]}
      >
        <Feather name="send" size={15} color={theme.accent} />
        <ThemedText style={[styles.shareText, { color: theme.accent }]}>
          Share celebration
        </ThemedText>
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
    marginBottom: Spacing.sm,
  },
  title: { ...Typography.headline, flex: 1 },
  body: { ...Typography.body, lineHeight: 23 },
  share: {
    minHeight: 48,
    borderWidth: 1,
    borderRadius: BorderRadius.full,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    marginTop: Spacing.md,
  },
  shareText: { ...Typography.headline },
});
