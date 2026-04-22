import React from "react";
import { View, StyleSheet } from "react-native";
import { Feather } from "@expo/vector-icons";

import { ThemedText } from "@/components/ThemedText";
import { useTheme } from "@/hooks/useTheme";
import { Colors, Spacing, Typography, BorderRadius } from "@/constants/theme";

interface AiDisclosureProps {
  variant?: "banner" | "inline";
}

/**
 * Small "AI-generated — powered by OpenAI" badge shown next to AI features
 * so users know when a third-party model is processing their text. Apple has
 * been flagging generative-AI apps that ship without an in-app disclosure.
 */
export function AiDisclosure({ variant = "inline" }: AiDisclosureProps) {
  const { theme } = useTheme();

  return (
    <View
      style={[
        variant === "banner" ? styles.banner : styles.inline,
        { backgroundColor: "rgba(0, 217, 255, 0.08)" },
      ]}
      accessibilityRole="text"
      accessibilityLabel="This feature is AI-generated, powered by OpenAI"
    >
      <Feather name="cpu" size={14} color={Colors.dark.accent} />
      <ThemedText style={[styles.text, { color: theme.textSecondary }]}>
        AI-generated · Powered by OpenAI
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  inline: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: Spacing.xs,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.full,
  },
  banner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
  },
  text: {
    ...Typography.caption,
  },
});
