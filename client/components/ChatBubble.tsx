import React, { useState } from "react";
import { Alert, Pressable, View, StyleSheet } from "react-native";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as Clipboard from "expo-clipboard";
import { ThemedText } from "@/components/ThemedText";
import { useTheme } from "@/hooks/useTheme";
import { Colors, Spacing, BorderRadius, Typography } from "@/constants/theme";
import { reportAIContent, type AIReportSurface } from "@/lib/ai-reporting";
import { track } from "@/lib/telemetry";

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
  const [feedbackState, setFeedbackState] = useState<
    "idle" | "helpful" | "unhelpful"
  >("idle");

  const copyResponse = async () => {
    await Clipboard.setStringAsync(message);
    Haptics.selectionAsync().catch(() => {});
  };

  const setFeedback = (next: "helpful" | "unhelpful") => {
    if (feedbackState !== "idle") return;
    setFeedbackState(next);
    track(
      next === "helpful"
        ? "coach_response_helpful"
        : "coach_response_unhelpful",
    );
    Haptics.selectionAsync().catch(() => {});
  };

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
        {!isUser && !isTyping && reportSurface === "coach" ? (
          <View style={styles.responseActions}>
            <Pressable
              onPress={copyResponse}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel="Copy coach response"
              style={({ pressed }) => [
                styles.actionButton,
                { opacity: pressed ? 0.45 : 0.75 },
              ]}
            >
              <Feather name="copy" size={13} color={theme.textSecondary} />
            </Pressable>
            <Pressable
              onPress={() => setFeedback("helpful")}
              disabled={feedbackState !== "idle"}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel="Mark coach response helpful"
              accessibilityState={{ selected: feedbackState === "helpful" }}
              style={({ pressed }) => [
                styles.actionButton,
                {
                  opacity: pressed
                    ? 0.45
                    : feedbackState === "unhelpful"
                      ? 0.35
                      : 0.75,
                },
              ]}
            >
              <Feather
                name="thumbs-up"
                size={13}
                color={
                  feedbackState === "helpful"
                    ? theme.accent
                    : theme.textSecondary
                }
              />
            </Pressable>
            <Pressable
              onPress={() => setFeedback("unhelpful")}
              disabled={feedbackState !== "idle"}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel="Mark coach response not helpful"
              accessibilityState={{ selected: feedbackState === "unhelpful" }}
              style={({ pressed }) => [
                styles.actionButton,
                {
                  opacity: pressed
                    ? 0.45
                    : feedbackState === "helpful"
                      ? 0.35
                      : 0.75,
                },
              ]}
            >
              <Feather
                name="thumbs-down"
                size={13}
                color={
                  feedbackState === "unhelpful"
                    ? theme.warning
                    : theme.textSecondary
                }
              />
            </Pressable>
            {reportSurface ? (
              <Pressable
                onPress={confirmReport}
                disabled={reportState !== "idle"}
                hitSlop={10}
                accessibilityRole="button"
                accessibilityLabel={
                  reportState === "reported"
                    ? "AI response reported"
                    : "Report this AI response"
                }
                style={({ pressed }) => [
                  styles.reportButton,
                  {
                    opacity: pressed
                      ? 0.45
                      : reportState === "idle"
                        ? 0.75
                        : 0.4,
                  },
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
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    minHeight: 24,
  },
  responseActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    alignItems: "center",
    gap: Spacing.md,
    marginTop: Spacing.sm,
  },
  actionButton: {
    minWidth: 24,
    minHeight: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  reportText: {
    ...Typography.caption,
  },
});
