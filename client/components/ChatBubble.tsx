import React from "react";
import { View, StyleSheet, Pressable, Alert, Platform } from "react-native";
import { Feather } from "@expo/vector-icons";
import { ThemedText } from "@/components/ThemedText";
import { useTheme } from "@/hooks/useTheme";
import { Colors, Spacing, BorderRadius, Typography } from "@/constants/theme";
import { getApiUrl, getAuthHeaders } from "@/lib/query-client";
import { storage } from "@/lib/storage";
import { logger } from "@/lib/logger";

interface ChatBubbleProps {
  message: string;
  isUser: boolean;
  isTyping?: boolean;
}

async function submitReport(message: string, reason: string) {
  try {
    const deviceId = await storage.getDeviceId();
    const response = await fetch(
      new URL("/api/report-content", getApiUrl()).toString(),
      {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify({
          deviceId,
          reason,
          messageContent: message,
        }),
      },
    );
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    Alert.alert(
      "Thanks for reporting",
      "We've received your report and will review this content.",
    );
  } catch (error) {
    logger.error("Failed to report content:", error);
    Alert.alert(
      "Report Failed",
      "We couldn't submit your report right now. Please try again.",
    );
  }
}

function reportAiMessage(message: string) {
  const reasons = [
    { label: "Harmful or unsafe", value: "harmful" },
    { label: "Inaccurate", value: "inaccurate" },
    { label: "Offensive", value: "offensive" },
    { label: "Other", value: "other" },
  ];

  if (Platform.OS === "web") {
    const picked = window.prompt(
      "Why are you reporting this message? (harmful / inaccurate / offensive / other)",
      "other",
    );
    if (picked) submitReport(message, picked);
    return;
  }

  Alert.alert("Report AI Message", "Why are you reporting this?", [
    ...reasons.map((r) => ({
      text: r.label,
      onPress: () => submitReport(message, r.value),
    })),
    { text: "Cancel", style: "cancel" as const },
  ]);
}

export function ChatBubble({ message, isUser, isTyping }: ChatBubbleProps) {
  const { theme, isDark } = useTheme();

  const bubble = (
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
        style={[styles.text, { color: isUser ? "#000000" : theme.text }]}
      >
        {isTyping ? `${message}...` : message}
      </ThemedText>
    </View>
  );

  return (
    <View
      style={[
        styles.container,
        isUser ? styles.userContainer : styles.aiContainer,
      ]}
    >
      {!isUser ? (
        <View style={styles.avatarContainer}>
          <View style={styles.avatar}>
            <Feather name="compass" size={16} color={Colors.dark.accent} />
          </View>
        </View>
      ) : null}
      {isUser ? (
        bubble
      ) : (
        <Pressable
          onLongPress={() => reportAiMessage(message)}
          delayLongPress={400}
          accessibilityRole="button"
          accessibilityLabel="AI message. Long press to report."
          accessibilityHint="Long press to report this message as inappropriate"
        >
          {bubble}
        </Pressable>
      )}
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
