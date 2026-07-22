import React, { useState } from "react";
import { Alert, Pressable, View, StyleSheet } from "react-native";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { ThemedText } from "@/components/ThemedText";
import { useTheme } from "@/hooks/useTheme";
import { Colors, Spacing, BorderRadius, Typography } from "@/constants/theme";
import { reportAIContent, type AIReportSurface } from "@/lib/ai-reporting";

interface ChatBubbleProps {
  message: string;
  isUser: boolean;
  isTyping?: boolean;
  reportSurface?: AIReportSurface;
}

export const ChatBubble = React.memo(function ChatBubble({
  message,
  isUser,
  isTyping,
  reportSurface,
}: ChatBubbleProps) {
  const { theme, isDark } = useTheme();
  const [reportState, setReportState] = useState<
    "idle" | "submitting" | "reported"
  >("idle");

  const confirmReport = () => {
    Alert.alert(
      "Report AI Response?",
      "Send this response to Resolution Companion for safety review. Your report includes the response text and an anonymous device identifier.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Report",
          onPress: async () => {
            setReportState("submitting");
            try {
              await reportAIContent(message, reportSurface!);
              setReportState("reported");
              Haptics.notificationAsync(
                Haptics.NotificationFeedbackType.Success,
              );
              Alert.alert("Reported", "Thank you. We’ll review this response.");
            } catch {
              setReportState("idle");
              Alert.alert(
                "Couldn’t Send Report",
                "Please check your connection and try again.",
              );
            }
          },
        },
      ],
    );
  };

  return (
    <View
      style={[
        styles.container,
        isUser ? styles.userContainer : styles.aiContainer,
      ]}
      accessible={false}
    >
      {!isUser ? (
        <View style={styles.avatarContainer}>
          <View style={styles.avatar}>
            <Feather name="compass" size={16} color={theme.accent} />
          </View>
        </View>
      ) : null}
      <View
        style={[
          styles.bubble,
          isUser
            ? {
                backgroundColor: theme.accent,
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
          accessible={true}
          accessibilityRole="text"
          accessibilityLabel={`${isUser ? "You" : "AI coach"}: ${message}${isTyping ? " (typing)" : ""}`}
          style={[
            styles.text,
            { color: isUser ? theme.buttonText : theme.text },
          ]}
        >
          {isTyping ? `${message}...` : message}
        </ThemedText>
        {!isUser && !isTyping && reportSurface ? (
          <Pressable
            onPress={confirmReport}
            disabled={reportState !== "idle"}
            hitSlop={12}
            pressRetentionOffset={12}
            accessibilityRole="button"
            accessibilityLabel={
              reportState === "reported"
                ? "AI response reported"
                : "Report this AI response"
            }
            style={({ pressed }) => [
              styles.reportButton,
              { opacity: pressed ? 0.55 : reportState === "idle" ? 0.8 : 0.5 },
            ]}
          >
            <Feather
              name={reportState === "reported" ? "check" : "flag"}
              size={13}
              color={theme.textSecondary}
            />
            <ThemedText
              style={[styles.reportText, { color: theme.textSecondary }]}
            >
              {reportState === "submitting"
                ? "Reporting…"
                : reportState === "reported"
                  ? "Reported"
                  : "Report"}
            </ThemedText>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
});

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
  reportButton: {
    alignSelf: "flex-end",
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    marginTop: Spacing.sm,
    minHeight: 24,
  },
  reportText: {
    ...Typography.caption,
  },
});
