import React from "react";
import { View, StyleSheet } from "react-native";
import { Feather } from "@expo/vector-icons";
import { ThemedText } from "@/components/ThemedText";
import { useTheme } from "@/hooks/useTheme";
import { Colors, Spacing, BorderRadius, Typography } from "@/constants/theme";

interface ChatBubbleProps {
  message: string;
  isUser: boolean;
  isTyping?: boolean;
}

export function ChatBubble({ message, isUser, isTyping }: ChatBubbleProps) {
  const { theme, isDark } = useTheme();

  return (
    <View style={[styles.container, isUser ? styles.userContainer : styles.aiContainer]}>
      {!isUser ? (
        <View style={styles.avatarContainer}>
          <View style={styles.avatar}>
            <Feather name="compass" size={16} color={Colors.dark.accent} />
          </View>
        </View>
      ) : null}
      <View
        style={[
          styles.bubble,
          isUser
            ? {
                backgroundColor: Colors.dark.accent,
                borderBottomRightRadius: Spacing.xs,
              }
            : {
                backgroundColor: isDark
                  ? Colors.dark.backgroundSecondary
                  : Colors.light.backgroundSecondary,
                borderBottomLeftRadius: Spacing.xs,
              },
        ]}
      >
        <ThemedText
          style={[
            styles.text,
            { color: isUser ? "#000000" : theme.text },
          ]}
        >
          {isTyping ? `${message}...` : message}
        </ThemedText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginVertical: Spacing.xs,
    paddingHorizontal: Spacing.lg,
    flexDirection: "row",
    alignItems: "flex-end",
  },
  userContainer: {
    justifyContent: "flex-end",
  },
  aiContainer: {
    justifyContent: "flex-start",
  },
  avatarContainer: {
    marginRight: Spacing.sm,
    marginBottom: Spacing.xs,
  },
  avatar: {
    width: 28,
    height: 28,
    borderRadius: BorderRadius.full,
    backgroundColor: "rgba(0, 217, 255, 0.15)",
    alignItems: "center",
    justifyContent: "center",
  },
  bubble: {
    maxWidth: "75%",
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    borderRadius: BorderRadius.lg,
  },
  text: {
    ...Typography.body,
  },
});
