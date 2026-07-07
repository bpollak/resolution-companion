import React, { useState, useRef, useMemo } from "react";
import {
  View,
  ScrollView,
  StyleSheet,
  TextInput,
  Pressable,
  FlatList,
  ActivityIndicator,
  Platform,
  KeyboardAvoidingView,
  Alert,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { useNavigation } from "@react-navigation/native";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";

import { useTheme } from "@/hooks/useTheme";
import { useApp } from "@/context/AppContext";
import { Colors, Spacing, Typography, BorderRadius } from "@/constants/theme";
import { ThemedText } from "@/components/ThemedText";
import { ChatBubble } from "@/components/ChatBubble";
import { AIConsentModal } from "@/components/AIConsentModal";
import { getReflectionResponse, AIMessage, getMonthlyContext } from "@/lib/ai";
import { logger } from "@/lib/logger";

type PeriodType = "monthly";

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
}

export default function ReflectScreen() {
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const tabBarHeight = useBottomTabBarHeight();
  const navigation = useNavigation<any>();
  const { theme, isDark } = useTheme();
  const {
    hasOnboarded,
    momentumScore,
    persona,
    addReflection,
    canUseReflection,
    incrementReflectionCount,
    subscription,
    monthlyReflectionCount,
    reflections,
    aiConsent,
    setAiConsent,
  } = useApp();

  const [selectedPeriod, setSelectedPeriod] = useState<PeriodType | null>(null);
  const [isInSession, setIsInSession] = useState(false);
  const [showConsentModal, setShowConsentModal] = useState(false);
  const [pendingPeriod, setPendingPeriod] = useState<PeriodType | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [streamingText, setStreamingText] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [viewingPastSession, setViewingPastSession] = useState<string | null>(
    null,
  );

  const flatListRef = useRef<FlatList>(null);

  const sortedReflections = useMemo(
    () =>
      [...reflections].sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      ),
    [reflections],
  );

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  const startReflection = async (period: PeriodType) => {
    if (!persona) {
      return;
    }

    if (!canUseReflection()) {
      // Arriving from the 10/10 gate: the paywall opens with a context card
      // explaining exactly which cap was hit
      navigation.navigate("Subscription", { source: "coach-limit" });
      return;
    }

    if (!aiConsent) {
      setPendingPeriod(period);
      setShowConsentModal(true);
      return;
    }

    await beginReflectionSession(period);
  };

  const handleConsentAgree = async () => {
    setShowConsentModal(false);
    await setAiConsent(true);
    const period = pendingPeriod;
    setPendingPeriod(null);
    // Call the session starter directly: the aiConsent value captured by
    // startReflection's closure is still false until the next render.
    if (period) {
      await beginReflectionSession(period);
    }
  };

  const handleConsentDecline = () => {
    setShowConsentModal(false);
    setPendingPeriod(null);
  };

  const beginReflectionSession = async (period: PeriodType) => {
    if (!persona) {
      return;
    }

    setSelectedPeriod(period);
    setIsInSession(true);
    setIsLoading(true);
    setIsStreaming(true);
    setStreamingText("");

    const monthlyContext = getMonthlyContext(momentumScore);

    if (persona.createdAt) {
      const createdDate = new Date(persona.createdAt);
      const today = new Date();
      const daysSince = Math.floor(
        (today.getTime() - createdDate.getTime()) / (1000 * 60 * 60 * 24),
      );
      monthlyContext.personaCreatedAt = persona.createdAt;
      monthlyContext.daysSincePersonaCreated = daysSince;
    }

    try {
      const response = await getReflectionResponse(
        [
          {
            role: "user",
            content: `I'm ready for my monthly check-in. My persona is "${persona.name}". Please help me review my progress this month.`,
          },
        ],
        momentumScore,
        period,
        (chunk) => {
          setStreamingText((prev) => prev + chunk);
        },
        monthlyContext,
      );

      setIsStreaming(false);
      const aiMessage: ChatMessage = {
        id: Date.now().toString(),
        role: "assistant",
        content: response,
      };
      setMessages([aiMessage]);
      setStreamingText("");
    } catch (error) {
      logger.error("Failed to start reflection:", error);
      setIsStreaming(false);
      setStreamingText("");
      // Don't leave the user stranded in an empty session
      setIsInSession(false);
      setSelectedPeriod(null);
      Alert.alert(
        "Connection Issue",
        "We couldn't reach your AI coach. Please check your internet connection and try again.",
      );
    } finally {
      setIsLoading(false);
    }
  };

  const sendMessage = async () => {
    if (!inputText.trim() || isLoading) return;

    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      role: "user",
      content: inputText.trim(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInputText("");
    setIsLoading(true);
    setIsStreaming(true);
    setStreamingText("");

    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }

    try {
      const aiMessages: AIMessage[] = messages.map((m) => ({
        role: m.role,
        content: m.content,
      }));
      aiMessages.push({ role: "user", content: userMessage.content });

      const monthlyContext = getMonthlyContext(momentumScore);

      if (persona?.createdAt) {
        const createdDate = new Date(persona.createdAt);
        const today = new Date();
        const daysSince = Math.floor(
          (today.getTime() - createdDate.getTime()) / (1000 * 60 * 60 * 24),
        );
        monthlyContext.personaCreatedAt = persona.createdAt;
        monthlyContext.daysSincePersonaCreated = daysSince;
      }

      const response = await getReflectionResponse(
        aiMessages,
        momentumScore,
        selectedPeriod || "monthly",
        (chunk) => {
          setStreamingText((prev) => prev + chunk);
        },
        monthlyContext,
      );

      setIsStreaming(false);
      const aiMessage: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: response,
      };
      setMessages((prev) => [...prev, aiMessage]);
      setStreamingText("");
    } catch (error) {
      logger.error("Failed to send message:", error);
      setIsStreaming(false);
      setStreamingText("");
    } finally {
      setIsLoading(false);
    }
  };

  const finishReflection = async () => {
    if (messages.length > 0 && selectedPeriod) {
      const userMessages = messages
        .filter((m) => m.role === "user")
        .map((m) => m.content)
        .join("\n");
      const aiMessages = messages
        .filter((m) => m.role === "assistant")
        .map((m) => m.content)
        .join("\n");
      const conversationData = JSON.stringify(messages);

      await addReflection({
        periodType: selectedPeriod,
        userInput: userMessages,
        aiFeedback: aiMessages,
        momentumScore,
        conversation: conversationData,
      });

      await incrementReflectionCount();

      if (Platform.OS !== "web") {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    }

    setIsInSession(false);
    setSelectedPeriod(null);
    setMessages([]);
  };

  const handleCloseSession = () => {
    if (messages.length === 0) {
      setIsInSession(false);
      setSelectedPeriod(null);
      return;
    }

    if (Platform.OS === "web") {
      if (window.confirm("Save this coaching session before closing?")) {
        finishReflection();
      } else {
        setIsInSession(false);
        setSelectedPeriod(null);
        setMessages([]);
      }
    } else {
      Alert.alert(
        "End Session",
        "Would you like to save this coaching session?",
        [
          {
            text: "Discard",
            style: "destructive",
            onPress: () => {
              setIsInSession(false);
              setSelectedPeriod(null);
              setMessages([]);
            },
          },
          {
            text: "Save",
            onPress: finishReflection,
          },
        ],
      );
    }
  };

  const renderMessage = ({ item }: { item: ChatMessage }) => (
    <ChatBubble message={item.content} isUser={item.role === "user"} />
  );

  if (!hasOnboarded) {
    return (
      <View
        style={[
          styles.container,
          {
            backgroundColor: theme.backgroundRoot,
            paddingTop: headerHeight + Spacing.xl,
            paddingBottom: tabBarHeight + Spacing.xl,
          },
        ]}
      >
        <View style={styles.emptyContainer}>
          <Feather name="edit-3" size={64} color={theme.textSecondary} />
          <ThemedText
            style={[styles.emptyText, { color: theme.textSecondary }]}
          >
            Complete onboarding to access coaching
          </ThemedText>
        </View>
      </View>
    );
  }

  if (viewingPastSession) {
    const session = reflections.find((r) => r.id === viewingPastSession);
    if (session) {
      let conversationMessages: ChatMessage[] = [];
      if (session.conversation) {
        try {
          conversationMessages = JSON.parse(session.conversation);
        } catch (error) {
          logger.error(
            "Failed to parse stored reflection conversation:",
            error,
          );
          conversationMessages = [];
        }
      }

      const hasFullConversation = conversationMessages.length > 0;

      return (
        <View
          style={[
            styles.chatContainer,
            { backgroundColor: theme.backgroundRoot },
          ]}
        >
          <View
            style={[
              styles.chatHeader,
              { paddingTop: headerHeight + Spacing.sm },
            ]}
          >
            <Pressable
              onPress={() => setViewingPastSession(null)}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Back to check-in list"
              style={({ pressed }) => [
                styles.closeButton,
                { opacity: pressed ? 0.6 : 1 },
              ]}
            >
              <Feather name="arrow-left" size={24} color={theme.text} />
            </Pressable>
            <ThemedText style={styles.chatHeaderTitle}>
              {formatDate(session.createdAt)}
            </ThemedText>
            <View style={styles.doneButton}>
              <ThemedText
                style={[
                  styles.pastSessionMomentumValue,
                  { color: Colors.dark.accent },
                ]}
              >
                {session.momentumScore}%
              </ThemedText>
            </View>
          </View>

          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={[
              styles.messageList,
              { paddingBottom: tabBarHeight + Spacing.xl },
            ]}
            scrollIndicatorInsets={{ bottom: insets.bottom }}
          >
            {hasFullConversation ? (
              conversationMessages.map((msg, index) => (
                <ChatBubble
                  key={msg.id || `${session.id}-${index}`}
                  message={msg.content}
                  isUser={msg.role === "user"}
                />
              ))
            ) : (
              <>
                <ChatBubble message={session.aiFeedback} isUser={false} />
                {session.userInput ? (
                  <ChatBubble message={session.userInput} isUser={true} />
                ) : null}
              </>
            )}
          </ScrollView>
        </View>
      );
    }
  }

  if (!isInSession) {
    return (
      <ScrollView
        style={{ flex: 1, backgroundColor: theme.backgroundRoot }}
        contentContainerStyle={{
          paddingTop: headerHeight + Spacing.xl,
          paddingBottom: tabBarHeight + Spacing.xl,
          paddingHorizontal: Spacing.lg,
        }}
        scrollIndicatorInsets={{ bottom: insets.bottom }}
      >
        <View style={styles.header}>
          <ThemedText style={styles.title}>AI Coaching</ThemedText>
          <ThemedText style={[styles.subtitle, { color: theme.textSecondary }]}>
            Get personalized coaching to review your progress and receive
            guidance.
          </ThemedText>
        </View>

        <View style={styles.scoreCard}>
          <ThemedText
            style={[styles.scoreLabel, { color: Colors.dark.accent }]}
          >
            Current Momentum
          </ThemedText>
          <ThemedText style={styles.scoreValue}>{momentumScore}%</ThemedText>
          <ThemedText
            style={[styles.scoreHint, { color: theme.textSecondary }]}
          >
            {momentumScore >= 80
              ? "Excellent! You're building strong habits."
              : momentumScore >= 50
                ? "Good progress! Let's keep the momentum going."
                : "Every step counts. Let's find ways to reduce friction."}
          </ThemedText>
          <ThemedText
            style={[styles.scoreExplain, { color: theme.textSecondary }]}
          >
            Your completion rate for scheduled actions over the past 7 days
          </ThemedText>
        </View>

        <View style={styles.sessionsCard}>
          <View style={styles.sessionsInfo}>
            <ThemedText style={styles.sessionsLabel}>
              {subscription.isPremium
                ? "Unlimited Check-ins"
                : "Free Check-ins"}
            </ThemedText>
            <ThemedText
              style={[
                styles.sessionsCount,
                {
                  color:
                    monthlyReflectionCount >= 10 && !subscription.isPremium
                      ? Colors.dark.error
                      : Colors.dark.accent,
                },
              ]}
            >
              {subscription.isPremium
                ? "Unlimited"
                : `${10 - monthlyReflectionCount} of 10`}
            </ThemedText>
            <ThemedText
              style={[styles.sessionsHint, { color: theme.textSecondary }]}
            >
              {subscription.isPremium
                ? "Premium members get unlimited coaching"
                : "Included free — resets at the start of each month"}
            </ThemedText>
          </View>
          {!subscription.isPremium && monthlyReflectionCount >= 7 ? (
            <Pressable
              onPress={() => navigation.navigate("Subscription")}
              accessibilityRole="button"
              accessibilityLabel="Upgrade to Premium for unlimited check-ins"
              style={({ pressed }) => [
                styles.upgradeLink,
                { opacity: pressed ? 0.7 : 1 },
              ]}
            >
              <Feather name="zap" size={16} color={Colors.dark.accent} />
              <ThemedText
                style={[styles.upgradeLinkText, { color: Colors.dark.accent }]}
              >
                Upgrade to Premium
              </ThemedText>
            </Pressable>
          ) : null}
        </View>

        <ThemedText style={styles.sectionTitle}>Monthly Check-in</ThemedText>

        {canUseReflection() ? (
          <Pressable
            onPress={() => startReflection("monthly")}
            accessibilityRole="button"
            accessibilityLabel={`Your coach is ready for your ${new Date().toLocaleDateString("en-US", { month: "long" })} check-in. Start the conversation.`}
            style={({ pressed }) => [
              styles.coachInvite,
              {
                backgroundColor: isDark
                  ? Colors.dark.backgroundDefault
                  : Colors.light.backgroundDefault,
              },
              pressed && styles.heroCtaPressed,
            ]}
          >
            <View style={styles.coachInviteRow}>
              <View style={styles.coachInviteAvatar}>
                <Feather name="compass" size={22} color={Colors.dark.accent} />
              </View>
              <View
                style={[
                  styles.coachInviteBubble,
                  {
                    backgroundColor: isDark
                      ? Colors.dark.backgroundSecondary
                      : Colors.light.backgroundSecondary,
                  },
                ]}
              >
                <ThemedText style={styles.coachInviteText}>
                  Ready to look at{" "}
                  {new Date().toLocaleDateString("en-US", { month: "long" })}{" "}
                  together? Let&rsquo;s see what&rsquo;s working.
                </ThemedText>
              </View>
            </View>
            <View style={styles.coachInviteButton}>
              <ThemedText style={styles.coachInviteButtonText}>
                Start check-in
              </ThemedText>
              <Feather name="arrow-right" size={18} color="#000000" />
            </View>
          </Pressable>
        ) : (
          <Pressable
            onPress={() => startReflection("monthly")}
            accessibilityRole="button"
            accessibilityLabel="Monthly check-in limit reached. Upgrade to Premium for unlimited coaching"
            style={({ pressed }) => [
              styles.heroCtaLocked,
              {
                backgroundColor: isDark
                  ? Colors.dark.backgroundDefault
                  : Colors.light.backgroundDefault,
                borderColor: theme.border,
              },
              pressed && styles.heroCtaPressed,
            ]}
          >
            <View
              style={[
                styles.heroCtaLockedIcon,
                {
                  backgroundColor: isDark
                    ? Colors.dark.backgroundTertiary
                    : Colors.light.backgroundTertiary,
                },
              ]}
            >
              <Feather name="lock" size={24} color={theme.textSecondary} />
            </View>
            <View style={styles.heroCtaContent}>
              <ThemedText style={styles.heroCtaLockedTitle}>
                Limit reached
              </ThemedText>
              <ThemedText
                style={[
                  styles.heroCtaLockedSubtitle,
                  { color: theme.textSecondary },
                ]}
              >
                Premium removes the cap &mdash; unlimited check-ins
              </ThemedText>
            </View>
            <Feather
              name="chevron-right"
              size={20}
              color={theme.textSecondary}
            />
          </Pressable>
        )}

        {sortedReflections.length > 0 ? (
          <>
            <ThemedText
              style={[styles.sectionTitle, { marginTop: Spacing.xl }]}
            >
              Past Sessions
            </ThemedText>
            {sortedReflections.slice(0, 5).map((reflection) => (
              <Pressable
                key={reflection.id}
                onPress={() => setViewingPastSession(reflection.id)}
                accessibilityRole="button"
                accessibilityLabel={`Open check-in from ${formatDate(reflection.createdAt)}, momentum ${reflection.momentumScore} percent`}
                style={({ pressed }) => [
                  styles.pastSessionCard,
                  {
                    backgroundColor: isDark
                      ? Colors.dark.backgroundDefault
                      : Colors.light.backgroundDefault,
                    opacity: pressed ? 0.8 : 1,
                  },
                  pressed && styles.cardPressed,
                ]}
              >
                <View style={styles.pastSessionIcon}>
                  <Feather
                    name="message-circle"
                    size={20}
                    color={Colors.dark.accent}
                  />
                </View>
                <View style={styles.pastSessionContent}>
                  <ThemedText style={styles.pastSessionDate}>
                    {formatDate(reflection.createdAt)}
                  </ThemedText>
                  <ThemedText
                    style={[
                      styles.pastSessionPreview,
                      { color: theme.textSecondary },
                    ]}
                    numberOfLines={1}
                  >
                    {reflection.aiFeedback.slice(0, 60)}...
                  </ThemedText>
                </View>
                <View style={styles.pastSessionMomentum}>
                  <ThemedText
                    style={[
                      styles.pastSessionMomentumValue,
                      { color: Colors.dark.accent },
                    ]}
                  >
                    {reflection.momentumScore}%
                  </ThemedText>
                </View>
                <Feather
                  name="chevron-right"
                  size={18}
                  color={theme.textSecondary}
                />
              </Pressable>
            ))}
          </>
        ) : null}

        <AIConsentModal
          visible={showConsentModal}
          onAgree={handleConsentAgree}
          onDecline={handleConsentDecline}
        />
      </ScrollView>
    );
  }

  return (
    <KeyboardAvoidingView
      style={[styles.chatContainer, { backgroundColor: theme.backgroundRoot }]}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={0}
    >
      <View
        style={[styles.chatHeader, { paddingTop: headerHeight + Spacing.sm }]}
      >
        <Pressable
          onPress={handleCloseSession}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="End session"
          style={({ pressed }) => [
            styles.closeButton,
            { opacity: pressed ? 0.6 : 1 },
          ]}
        >
          <Feather name="x" size={24} color={theme.text} />
        </Pressable>
        <ThemedText style={styles.chatHeaderTitle}>
          {selectedPeriod?.charAt(0).toUpperCase()}
          {selectedPeriod?.slice(1)} Check-in
        </ThemedText>
        <Pressable
          onPress={finishReflection}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Save this session"
          style={({ pressed }) => [
            styles.doneButton,
            { opacity: pressed ? 0.6 : 1 },
          ]}
        >
          <ThemedText
            style={[styles.doneButtonText, { color: Colors.dark.accent }]}
          >
            Save
          </ThemedText>
        </Pressable>
      </View>

      <FlatList
        ref={flatListRef}
        data={messages}
        renderItem={renderMessage}
        keyExtractor={(item) => item.id}
        contentContainerStyle={[styles.messageList, { paddingBottom: 80 }]}
        onContentSizeChange={() => flatListRef.current?.scrollToEnd()}
        keyboardShouldPersistTaps="handled"
        ListFooterComponent={
          isStreaming && streamingText ? (
            <ChatBubble message={streamingText} isUser={false} />
          ) : isLoading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="small" color={Colors.dark.accent} />
            </View>
          ) : null
        }
      />

      <View
        style={[
          styles.inputContainer,
          {
            paddingBottom: tabBarHeight + Spacing.md,
            backgroundColor: isDark
              ? Colors.dark.backgroundDefault
              : Colors.light.backgroundDefault,
          },
        ]}
      >
        <TextInput
          style={[
            styles.input,
            {
              backgroundColor: isDark
                ? Colors.dark.backgroundSecondary
                : Colors.light.backgroundSecondary,
              color: theme.text,
            },
          ]}
          value={inputText}
          onChangeText={setInputText}
          placeholder="Share your thoughts..."
          placeholderTextColor={theme.textSecondary}
          multiline
          maxLength={500}
          editable={!isLoading}
        />
        <Pressable
          onPress={sendMessage}
          disabled={!inputText.trim() || isLoading}
          accessibilityRole="button"
          accessibilityLabel="Send message"
          accessibilityState={{ disabled: !inputText.trim() || isLoading }}
          style={({ pressed }) => [
            styles.sendButton,
            {
              backgroundColor:
                inputText.trim() && !isLoading
                  ? Colors.dark.accent
                  : isDark
                    ? Colors.dark.backgroundTertiary
                    : Colors.light.backgroundTertiary,
              opacity: pressed ? 0.8 : 1,
            },
          ]}
        >
          {isLoading ? (
            <ActivityIndicator size="small" color={theme.text} />
          ) : (
            <Feather
              name="send"
              size={20}
              color={inputText.trim() ? "#000000" : theme.textSecondary}
            />
          )}
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: Spacing.lg,
  },
  loadingContainer: {
    paddingVertical: Spacing.lg,
    paddingHorizontal: Spacing.lg,
    alignItems: "flex-start",
  },
  emptyContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.lg,
  },
  emptyText: {
    ...Typography.body,
    textAlign: "center",
  },
  header: {
    marginBottom: Spacing["2xl"],
  },
  title: {
    ...Typography.title,
    marginBottom: Spacing.sm,
  },
  subtitle: {
    ...Typography.body,
  },
  scoreCard: {
    alignItems: "center",
    padding: Spacing["2xl"],
    marginBottom: Spacing["2xl"],
  },
  scoreLabel: {
    ...Typography.caption,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: Spacing.xs,
  },
  scoreValue: {
    fontSize: 64,
    fontWeight: "700",
    marginBottom: Spacing.sm,
  },
  scoreHint: {
    ...Typography.body,
    textAlign: "center",
  },
  scoreExplain: {
    ...Typography.caption,
    textAlign: "center",
    marginTop: Spacing.sm,
  },
  sessionsCard: {
    backgroundColor: "rgba(0, 217, 255, 0.08)",
    borderRadius: BorderRadius.md,
    padding: Spacing.xl,
    marginBottom: Spacing["2xl"],
    alignItems: "center",
  },
  sessionsInfo: {
    alignItems: "center",
    marginBottom: Spacing.md,
  },
  sessionsLabel: {
    ...Typography.caption,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: Spacing.sm,
  },
  sessionsCount: {
    fontSize: 32,
    fontWeight: "700",
    marginBottom: Spacing.xs,
  },
  sessionsHint: {
    ...Typography.small,
    textAlign: "center",
  },
  upgradeLink: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    borderColor: Colors.dark.accent,
  },
  upgradeLinkText: {
    ...Typography.body,
    fontWeight: "600",
  },
  sectionTitle: {
    ...Typography.headline,
    marginBottom: Spacing.md,
  },
  heroCta: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.dark.accent,
    padding: Spacing.xl,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.md,
  },
  coachInvite: {
    padding: Spacing.lg,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: "rgba(0, 217, 255, 0.25)",
    marginBottom: Spacing.md,
    gap: Spacing.md,
  },
  coachInviteRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: Spacing.sm,
  },
  coachInviteAvatar: {
    width: 40,
    height: 40,
    borderRadius: BorderRadius.full,
    backgroundColor: "rgba(0, 217, 255, 0.15)",
    alignItems: "center",
    justifyContent: "center",
  },
  coachInviteBubble: {
    flex: 1,
    padding: Spacing.md,
    borderRadius: BorderRadius.lg,
    borderBottomLeftRadius: Spacing.xs,
  },
  coachInviteText: {
    ...Typography.body,
    lineHeight: 24,
  },
  coachInviteButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.xs,
    backgroundColor: Colors.dark.accent,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.full,
  },
  coachInviteButtonText: {
    ...Typography.body,
    fontWeight: "600",
    color: "#000000",
  },
  heroCtaPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.98 }],
  },
  heroCtaIcon: {
    width: 48,
    height: 48,
    borderRadius: BorderRadius.full,
    backgroundColor: "rgba(0, 0, 0, 0.15)",
    alignItems: "center",
    justifyContent: "center",
    marginRight: Spacing.lg,
  },
  heroCtaContent: {
    flex: 1,
    marginRight: Spacing.md,
  },
  heroCtaTitle: {
    ...Typography.headline,
    color: "#000000",
    marginBottom: Spacing.xs,
  },
  heroCtaSubtitle: {
    ...Typography.small,
    lineHeight: 20,
    color: "rgba(0, 0, 0, 0.7)",
  },
  heroCtaLocked: {
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.xl,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    marginBottom: Spacing.md,
  },
  heroCtaLockedIcon: {
    width: 48,
    height: 48,
    borderRadius: BorderRadius.full,
    alignItems: "center",
    justifyContent: "center",
    marginRight: Spacing.lg,
  },
  heroCtaLockedTitle: {
    ...Typography.headline,
    marginBottom: Spacing.xs,
  },
  heroCtaLockedSubtitle: {
    ...Typography.small,
    lineHeight: 20,
  },
  cardPressed: {
    transform: [{ scale: 0.98 }],
  },
  pastSessionCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.lg,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.sm,
  },
  pastSessionIcon: {
    width: 40,
    height: 40,
    borderRadius: BorderRadius.full,
    backgroundColor: "rgba(0, 217, 255, 0.1)",
    alignItems: "center",
    justifyContent: "center",
    marginRight: Spacing.md,
  },
  pastSessionContent: {
    flex: 1,
  },
  pastSessionDate: {
    ...Typography.body,
    fontWeight: "600",
    marginBottom: 2,
  },
  pastSessionPreview: {
    ...Typography.small,
  },
  pastSessionMomentum: {
    marginRight: Spacing.sm,
  },
  pastSessionMomentumValue: {
    ...Typography.body,
    fontWeight: "700",
  },
  chatContainer: {
    flex: 1,
  },
  chatHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.md,
  },
  closeButton: {
    padding: Spacing.sm,
  },
  chatHeaderTitle: {
    ...Typography.headline,
    flex: 1,
    textAlign: "center",
  },
  doneButton: {
    padding: Spacing.sm,
  },
  doneButtonText: {
    ...Typography.body,
    fontWeight: "600",
  },
  messageList: {
    paddingVertical: Spacing.lg,
    flexGrow: 1,
  },
  inputContainer: {
    flexDirection: "row",
    alignItems: "flex-end",
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    gap: Spacing.sm,
  },
  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 120,
    borderRadius: BorderRadius.lg,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    ...Typography.body,
  },
  sendButton: {
    width: 44,
    height: 44,
    borderRadius: BorderRadius.full,
    alignItems: "center",
    justifyContent: "center",
  },
});
