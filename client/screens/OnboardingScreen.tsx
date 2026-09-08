import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  View,
  StyleSheet,
  TextInput,
  Pressable,
  FlatList,
  ScrollView,
  ActivityIndicator,
  Platform,
  KeyboardAvoidingView,
  Keyboard,
  Alert,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useTheme } from "@/hooks/useTheme";
import { useApp } from "@/context/AppContext";
import { Spacing, Typography, BorderRadius } from "@/constants/theme";
import { ThemedText } from "@/components/ThemedText";
import { ChatBubble } from "@/components/ChatBubble";
import { AIConsentModal } from "@/components/AIConsentModal";
import { OnboardingPlanReview } from "@/components/OnboardingPlanReview";
import {
  getOnboardingResponse,
  extractPersonaFromConversation,
  type AIMessage,
} from "@/lib/ai";
import {
  createPlanDraft,
  type OnboardingPlanDraft,
} from "@/lib/onboarding-plan";
import { storage } from "@/lib/storage";
import { logger } from "@/lib/logger";
import { track } from "@/lib/telemetry";

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
}
type Stage = "welcome" | "chat" | "review";

export default function OnboardingScreen() {
  const insets = useSafeAreaInsets();
  const [keyboardVisible, setKeyboardVisible] = useState(Keyboard.isVisible());
  const navigation = useNavigation<any>();
  const { theme } = useTheme();
  const { aiConsent, setAiConsent, refreshData } = useApp();
  const [stage, setStage] = useState<Stage>("welcome");
  const [draft, setDraft] = useState<OnboardingPlanDraft | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState("");
  const [streamingText, setStreamingText] = useState("");
  const [busy, setBusy] = useState<"reply" | "extract" | "save" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [failedRequest, setFailedRequest] = useState<
    "reply" | "extract" | null
  >(null);
  const [showConsentModal, setShowConsentModal] = useState(false);
  const [consentPaused, setConsentPaused] = useState(false);
  const consentIntent = useRef<"start" | "send" | "retry" | "extract">("start");
  const [ready, setReady] = useState(false);
  const activeRequest = useRef<AbortController | null>(null);
  const savingRef = useRef(false);
  const draftWrite = useRef(Promise.resolve());
  const touchedRef = useRef(false);
  const listRef = useRef<FlatList>(null);
  const nearBottom = useRef(true);

  useEffect(() => {
    const show = Keyboard.addListener(
      Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow",
      () => setKeyboardVisible(true),
    );
    const hide = Keyboard.addListener(
      Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide",
      () => setKeyboardVisible(false),
    );
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  useEffect(() => {
    let mounted = true;
    track("onboarding_started");
    Promise.all([storage.getOnboardingDraft(), storage.getOnboardingMessages()])
      .then(([savedDraft, transcript]) => {
        if (!mounted || touchedRef.current) return;
        setMessages(
          transcript.map(({ id, role, content }) => ({ id, role, content })),
        );
        // Legacy manual drafts stay stored, but only Coach-created plans resume.
        if (
          savedDraft?.usesAI === true &&
          Array.isArray(savedDraft.suggestions)
        ) {
          setDraft(savedDraft);
          setStage("review");
        } else if (transcript.length > 0) {
          setStage("chat");
          if (transcript.at(-1)?.role === "user") {
            setError("Your last message is saved. Retry when you are ready.");
            setFailedRequest("reply");
          }
        }
      })
      .catch((cause) => logger.warn("Onboarding restore unavailable:", cause))
      .finally(() => {
        if (mounted) setReady(true);
      });
    return () => {
      mounted = false;
      activeRequest.current?.abort();
      activeRequest.current = null;
    };
  }, []);

  useEffect(() => {
    if (!ready || !draft) return;
    // Ordered writes prevent a slow keystroke save from restoring a cleared draft.
    draftWrite.current = draftWrite.current
      .catch(() => {})
      .then(() => storage.setOnboardingDraft(draft));
    draftWrite.current.catch((cause) =>
      logger.warn("Plan draft save failed:", cause),
    );
  }, [draft, ready]);

  useEffect(() => {
    if (!ready || messages.length === 0) return;
    storage
      .setOnboardingMessages(
        messages.map((message) => ({
          ...message,
          createdAt: new Date().toISOString(),
        })),
      )
      .catch(() => {});
  }, [messages, ready]);

  const scrollToEnd = useCallback(() => {
    if (nearBottom.current)
      requestAnimationFrame(() =>
        listRef.current?.scrollToEnd({ animated: false }),
      );
  }, []);
  useEffect(scrollToEnd, [messages, streamingText, busy, error, scrollToEnd]);

  const cancelRequest = () => {
    activeRequest.current?.abort();
    activeRequest.current = null;
    setBusy(null);
    setStreamingText("");
  };

  const requestReply = async (conversation: ChatMessage[]) => {
    if (activeRequest.current || savingRef.current) return;
    const controller = new AbortController();
    activeRequest.current = controller;
    setError(null);
    setFailedRequest(null);
    setBusy("reply");
    setStreamingText("");
    try {
      const response = await getOnboardingResponse(
        conversation,
        (chunk) => {
          if (activeRequest.current === controller)
            setStreamingText((text) => text + chunk);
        },
        controller.signal,
      );
      if (activeRequest.current !== controller) return;
      setMessages([
        ...conversation,
        { id: `${Date.now()}-assistant`, role: "assistant", content: response },
      ]);
    } catch (cause) {
      if (activeRequest.current !== controller) return;
      logger.warn("Onboarding reply unavailable:", cause);
      setError(
        conversation.length === 0
          ? "Coach could not connect. Please retry when you are ready."
          : "Coach could not finish that reply. Your message is saved.",
      );
      setFailedRequest("reply");
    } finally {
      if (activeRequest.current === controller) {
        activeRequest.current = null;
        setStreamingText("");
        setBusy(null);
      }
    }
  };

  const stopRequest = () => {
    const request = busy;
    cancelRequest();
    setFailedRequest(request === "extract" ? "extract" : "reply");
    setError(
      messages.length > 0
        ? "Stopped. Your conversation is saved. Retry when you are ready."
        : "Stopped. Retry when you are ready to begin.",
    );
  };

  const beginChat = () => {
    touchedRef.current = true;
    setStage("chat");
    if (messages.length === 0) void requestReply([]);
    else if (messages.at(-1)?.role === "user") {
      setError("Your last message is saved. Retry when you are ready.");
      setFailedRequest("reply");
    }
  };
  const chooseCoach = () => {
    touchedRef.current = true;
    setConsentPaused(false);
    if (!aiConsent) {
      consentIntent.current = "start";
      setShowConsentModal(true);
    } else beginChat();
  };
  const sendMessage = (consentOverride = false) => {
    if (!inputText.trim() || busy) return;
    if (!aiConsent && !consentOverride) {
      consentIntent.current = "send";
      setShowConsentModal(true);
      return;
    }
    const conversation: ChatMessage[] = [
      ...messages,
      { id: `${Date.now()}-user`, role: "user", content: inputText.trim() },
    ];
    setMessages(conversation);
    setInputText("");
    nearBottom.current = true;
    void requestReply(conversation);
  };

  const reviewAIPlan = async (consentOverride = false) => {
    if (inputText.trim()) {
      setFailedRequest("extract");
      setError("Send or clear your message before previewing your plan.");
      return;
    }
    if (!aiConsent && !consentOverride) {
      consentIntent.current = "extract";
      setShowConsentModal(true);
      return;
    }
    if (activeRequest.current || savingRef.current) return;
    const controller = new AbortController();
    activeRequest.current = controller;
    setBusy("extract");
    setError(null);
    setFailedRequest(null);
    try {
      const proposal = await extractPersonaFromConversation(
        messages as AIMessage[],
        controller.signal,
      );
      if (activeRequest.current !== controller) return;
      setDraft({
        ...createPlanDraft(proposal, true),
        sourceMessageId: messages
          .filter((message) => message.role === "user")
          .at(-1)?.id,
      });
      Keyboard.dismiss();
      setStage("review");
    } catch (cause) {
      if (activeRequest.current !== controller) return;
      logger.warn("Plan proposal unavailable:", cause);
      setError(
        "Your conversation is saved. Please retry when you are ready to review your plan.",
      );
      setFailedRequest("extract");
    } finally {
      if (activeRequest.current === controller) {
        activeRequest.current = null;
        setBusy(null);
      }
    }
  };

  const previewPlan = () => {
    Keyboard.dismiss();
    if (!draft) {
      void reviewAIPlan();
      return;
    }
    const viewDraft = () => {
      setError(null);
      setStage("review");
    };
    const lastUserMessage = messages
      .filter((message) => message.role === "user")
      .at(-1);
    if (lastUserMessage && draft.sourceMessageId !== lastUserMessage.id) {
      // Keep edited drafts intact unless the person chooses to replace them.
      Alert.alert(
        "Update your plan?",
        "Use this conversation to create a new draft, or keep your current plan. Updating replaces any edits you made to the current plan.",
        [
          { text: "Update draft", onPress: () => void reviewAIPlan() },
          { text: "View current draft", onPress: viewDraft },
          { text: "Keep chatting", style: "cancel" },
        ],
      );
    } else viewDraft();
  };

  const retryRequest = () => {
    if (!aiConsent) {
      consentIntent.current = failedRequest === "extract" ? "extract" : "retry";
      setShowConsentModal(true);
    } else if (failedRequest === "extract") void reviewAIPlan();
    else void requestReply(messages);
  };

  const approve = async () => {
    if (draft?.usesAI !== true || savingRef.current) return;
    savingRef.current = true;
    setBusy("save");
    setError(null);
    try {
      await draftWrite.current.catch(() => {});
      await storage.setOnboardingDraft(draft);
      await storage.commitOnboardingPlan(draft);
      await storage.setOnboardingDraft(null);
      await storage.setOnboardingMessages([]);
      await refreshData();
      track("onboarding_completed");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(
        () => {},
      );
      navigation.reset({
        index: 0,
        routes: [{ name: "Main", state: { routes: [{ name: "TodayTab" }] } }],
      });
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Your plan could not be saved. Please retry.",
      );
    } finally {
      savingRef.current = false;
      setBusy(null);
    }
  };

  const back = () => {
    if (busy === "save") return;
    Keyboard.dismiss();
    cancelRequest();
    setError(null);
    if (stage === "welcome") navigation.goBack();
    else if (stage === "review" && messages.length > 0) beginChat();
    else setStage("welcome");
  };
  const button = (
    label: string,
    action: () => void,
    primary = false,
    disabled = false,
  ) => (
    <Pressable
      onPress={action}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      hitSlop={8}
      pressRetentionOffset={12}
      style={({ pressed }) => [
        styles.button,
        {
          backgroundColor: primary ? theme.accent : theme.backgroundSecondary,
          borderColor: theme.border,
          opacity: disabled ? 0.45 : pressed ? 0.65 : 1,
        },
      ]}
    >
      <ThemedText
        style={{
          color: primary ? theme.buttonText : theme.accent,
          fontWeight: "600",
          flexShrink: 1,
        }}
      >
        {label}
      </ThemedText>
    </Pressable>
  );

  const requesting = busy === "reply" || busy === "extract";
  const canPreview =
    !busy &&
    !inputText.trim() &&
    Boolean(
      draft || (messages.some((message) => message.role === "user") && !error),
    );
  const step = stage === "review" ? 2 : 1;
  const stepTitle = stage === "review" ? "Review your plan" : "Talk with Coach";

  return (
    <KeyboardAvoidingView
      style={[
        styles.container,
        {
          backgroundColor: theme.backgroundRoot,
          paddingTop: insets.top,
        },
      ]}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <View style={styles.header}>
        <Pressable
          onPress={back}
          disabled={busy === "save"}
          accessibilityRole="button"
          accessibilityLabel={
            stage === "welcome"
              ? "Close onboarding"
              : stage === "review" && messages.length > 0
                ? "Back to Coach"
                : "Back to onboarding"
          }
          hitSlop={12}
          pressRetentionOffset={16}
          style={({ pressed }) => ({
            minWidth: 44,
            minHeight: 44,
            justifyContent: "center",
            opacity: pressed ? 0.6 : 1,
          })}
        >
          <Feather
            name={stage === "welcome" ? "x" : "arrow-left"}
            size={24}
            color={theme.text}
          />
        </Pressable>
        <View
          style={styles.headerCopy}
          accessible
          accessibilityRole="header"
          accessibilityLabel={
            stage === "welcome"
              ? "Set up your plan"
              : `Step ${step} of 2. ${stepTitle}`
          }
          accessibilityLiveRegion="polite"
        >
          <ThemedText
            style={[styles.stepLabel, { color: theme.textSecondary }]}
          >
            {stage === "welcome" ? "BEFORE YOU BEGIN" : `STEP ${step} OF 2`}
          </ThemedText>
          <ThemedText style={styles.headerTitle}>
            {stage === "welcome" ? "Set up your plan" : stepTitle}
          </ThemedText>
        </View>
        {stage === "chat" ? (
          <Pressable
            onPress={previewPlan}
            disabled={!canPreview}
            accessibilityRole="button"
            accessibilityLabel="Preview my plan"
            accessibilityHint="Opens step 2 to review your plan before starting"
            accessibilityState={{ disabled: !canPreview }}
            hitSlop={8}
            pressRetentionOffset={12}
            style={({ pressed }) => [
              styles.headerAction,
              { opacity: !canPreview ? 0.4 : pressed ? 0.6 : 1 },
            ]}
          >
            <ThemedText style={{ color: theme.accent, fontWeight: "600" }}>
              Preview
            </ThemedText>
            <Feather name="chevron-right" size={18} color={theme.accent} />
          </Pressable>
        ) : null}
      </View>
      {stage !== "welcome" ? (
        <View
          style={styles.progress}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        >
          {[1, 2].map((item) => (
            <View
              key={item}
              style={[
                styles.progressSegment,
                { backgroundColor: item <= step ? theme.accent : theme.border },
              ]}
            />
          ))}
        </View>
      ) : null}
      {!ready ? (
        <ActivityIndicator color={theme.accent} />
      ) : stage === "welcome" ? (
        <>
          <ScrollView
            style={styles.scrollViewport}
            contentContainerStyle={styles.welcome}
            contentInsetAdjustmentBehavior="never"
          >
            <Feather name="compass" size={44} color={theme.accent} />
            <ThemedText style={styles.heading} accessibilityRole="header">
              Who would you like to become?
            </ThemedText>
            <ThemedText style={{ color: theme.textSecondary }}>
              Start small. Coach will help you find a habit that fits your life.
            </ThemedText>
            <View style={styles.overview}>
              {[
                [
                  "Talk with Coach",
                  "Share what you want to work on and the days that fit.",
                ],
                [
                  "Review your plan",
                  "Check your habit and schedule. Start when it feels right.",
                ],
              ].map(([title, detail], index) => (
                <View key={title} style={styles.overviewStep}>
                  <View
                    style={[
                      styles.stepNumber,
                      { backgroundColor: theme.backgroundSecondary },
                    ]}
                  >
                    <ThemedText
                      style={{ color: theme.accent, fontWeight: "600" }}
                    >
                      {index + 1}
                    </ThemedText>
                  </View>
                  <View style={{ flex: 1, gap: 4 }}>
                    <ThemedText style={{ fontWeight: "600" }}>
                      {title}
                    </ThemedText>
                    <ThemedText style={{ color: theme.textSecondary }}>
                      {detail}
                    </ThemedText>
                  </View>
                </View>
              ))}
            </View>
            <ThemedText style={{ color: theme.textSecondary }}>
              Requires an internet connection and your permission to use AI.
            </ThemedText>
            {consentPaused ? (
              <ThemedText
                accessibilityLiveRegion="polite"
                style={{ color: theme.textSecondary }}
              >
                Setup is paused. Start with Coach whenever you are ready to
                allow AI coaching.
              </ThemedText>
            ) : null}
            <ThemedText style={{ color: theme.textSecondary }}>
              Free includes your first plan, daily tracking, and 10 Coach
              conversations each month.
            </ThemedText>
          </ScrollView>
          <View
            style={[styles.welcomeFooter, { borderTopColor: theme.border }]}
          >
            {button(
              draft
                ? "Resume my plan review"
                : messages.length > 0
                  ? "Resume my conversation"
                  : "Build a plan with Coach",
              draft
                ? () => {
                    setError(null);
                    setStage("review");
                  }
                : chooseCoach,
              true,
            )}
          </View>
        </>
      ) : stage === "review" && draft ? (
        <OnboardingPlanReview
          draft={draft}
          onChange={(next) => {
            setDraft(next);
            setError(null);
          }}
          onApprove={approve}
          saving={busy === "save"}
          error={error}
        />
      ) : (
        <>
          <ThemedText
            style={[styles.chatGuidance, { color: theme.textSecondary }]}
          >
            {inputText.trim()
              ? "Send your message before previewing your plan."
              : "Share a habit and the days that fit. Preview when you’re ready."}
          </ThemedText>
          <FlatList
            style={styles.scrollViewport}
            ref={listRef}
            data={messages}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <ChatBubble
                message={item.content}
                isUser={item.role === "user"}
                reportSurface="onboarding"
              />
            )}
            contentContainerStyle={styles.messages}
            contentInsetAdjustmentBehavior="never"
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            onContentSizeChange={scrollToEnd}
            onLayout={scrollToEnd}
            onScroll={(event) => {
              const { contentOffset, contentSize, layoutMeasurement } =
                event.nativeEvent;
              nearBottom.current =
                contentSize.height -
                  layoutMeasurement.height -
                  contentOffset.y <
                80;
            }}
            scrollEventThrottle={16}
            ListFooterComponent={
              <>
                {streamingText ? (
                  <ChatBubble message={streamingText} isUser={false} isTyping />
                ) : busy ? (
                  <View
                    accessible
                    accessibilityRole="text"
                    accessibilityLiveRegion="polite"
                    style={styles.wait}
                  >
                    <ActivityIndicator color={theme.accent} />
                    <ThemedText>
                      {busy === "extract"
                        ? "Preparing a plan for you to review…"
                        : "Coach is thinking…"}
                    </ThemedText>
                  </View>
                ) : null}
              </>
            }
          />
          {error ? (
            <View
              style={[
                styles.recovery,
                {
                  borderTopColor: theme.border,
                  backgroundColor: theme.backgroundSecondary,
                },
              ]}
            >
              <ThemedText
                accessibilityRole="alert"
                style={[styles.recoveryText, { color: theme.textSecondary }]}
              >
                {error}
              </ThemedText>
              <Pressable
                onPress={retryRequest}
                disabled={
                  failedRequest === "extract" && Boolean(inputText.trim())
                }
                accessibilityRole="button"
                accessibilityLabel="Retry"
                accessibilityState={{
                  disabled:
                    failedRequest === "extract" && Boolean(inputText.trim()),
                }}
                hitSlop={8}
                pressRetentionOffset={12}
                style={({ pressed }) => [
                  styles.headerAction,
                  {
                    opacity:
                      failedRequest === "extract" && inputText.trim()
                        ? 0.4
                        : pressed
                          ? 0.6
                          : 1,
                  },
                ]}
              >
                <Feather name="rotate-cw" size={18} color={theme.accent} />
                <ThemedText style={{ color: theme.accent, fontWeight: "600" }}>
                  Retry
                </ThemedText>
              </Pressable>
            </View>
          ) : null}
          <View style={[styles.composer, { borderTopColor: theme.border }]}>
            <TextInput
              value={inputText}
              onChangeText={setInputText}
              editable={busy !== "extract"}
              multiline
              accessibilityLabel="Message your onboarding coach"
              placeholder="Tell Coach what fits your life"
              placeholderTextColor={theme.textSecondary}
              style={[
                styles.input,
                {
                  color: theme.text,
                  backgroundColor: theme.backgroundSecondary,
                },
              ]}
            />
            <Pressable
              onPress={requesting ? stopRequest : () => sendMessage()}
              disabled={!requesting && !inputText.trim()}
              accessibilityRole="button"
              accessibilityLabel={
                requesting ? "Stop Coach response" : "Send message"
              }
              accessibilityState={{
                disabled: !requesting && !inputText.trim(),
              }}
              hitSlop={8}
              pressRetentionOffset={12}
              style={({ pressed }) => [
                styles.send,
                {
                  backgroundColor: requesting
                    ? theme.backgroundSecondary
                    : theme.accent,
                  borderWidth: requesting ? 1 : 0,
                  borderColor: theme.border,
                  opacity:
                    !requesting && !inputText.trim() ? 0.4 : pressed ? 0.6 : 1,
                },
              ]}
            >
              <Feather
                name={requesting ? "square" : "arrow-up"}
                color={requesting ? theme.accent : theme.buttonText}
                size={22}
              />
            </Pressable>
          </View>
        </>
      )}
      {keyboardVisible ? (
        <View
          style={[
            styles.keyboardToolbar,
            {
              borderTopColor: theme.border,
              backgroundColor: theme.backgroundSecondary,
            },
          ]}
        >
          <Pressable
            onPress={Keyboard.dismiss}
            accessibilityRole="button"
            accessibilityLabel="Hide keyboard"
            accessibilityHint="Keeps your text and closes the keyboard"
            hitSlop={8}
            pressRetentionOffset={12}
            style={({ pressed }) => [
              styles.keyboardDismiss,
              { opacity: pressed ? 0.6 : 1 },
            ]}
          >
            <ThemedText style={styles.keyboardDismissText}>
              Hide keyboard
            </ThemedText>
            <Feather name="chevron-down" size={18} color={theme.text} />
          </Pressable>
        </View>
      ) : null}
      {/* Padding mode owns the parent's bottom padding, so safe area must be a child. */}
      <View
        pointerEvents="none"
        style={{ height: keyboardVisible ? 0 : insets.bottom, flexShrink: 0 }}
      />
      <AIConsentModal
        visible={showConsentModal}
        onDecline={() => {
          setShowConsentModal(false);
          setConsentPaused(true);
        }}
        onAgree={async () => {
          await setAiConsent(true);
          setShowConsentModal(false);
          if (consentIntent.current === "extract") void reviewAIPlan(true);
          else if (consentIntent.current === "send") sendMessage(true);
          else if (consentIntent.current === "retry")
            void requestReply(messages);
          else beginChat();
        }}
      />
    </KeyboardAvoidingView>
  );
}
const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollViewport: { flex: 1, minHeight: 0 },
  keyboardToolbar: {
    flexShrink: 0,
    alignItems: "flex-end",
    paddingHorizontal: Spacing.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  keyboardDismiss: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    paddingVertical: Spacing.sm,
  },
  keyboardDismissText: { fontSize: 14, lineHeight: 20, fontWeight: "600" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    gap: Spacing.sm,
  },
  headerCopy: { flex: 1, gap: 2 },
  stepLabel: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "600",
    letterSpacing: 0.8,
  },
  headerTitle: { fontSize: 18, lineHeight: 24, fontWeight: "600" },
  headerAction: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    flexShrink: 0,
  },
  progress: {
    flexDirection: "row",
    gap: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.sm,
  },
  progressSegment: { height: 3, borderRadius: 2, flex: 1 },
  overview: { gap: Spacing.lg },
  overviewStep: { flexDirection: "row", gap: Spacing.md },
  stepNumber: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  welcomeFooter: {
    flexShrink: 0,
    padding: Spacing.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  heading: { fontSize: 28, fontWeight: "700", lineHeight: 34 },
  welcome: { padding: Spacing.lg, gap: Spacing.lg, paddingBottom: 40 },
  button: {
    minHeight: 48,
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    alignItems: "center",
    justifyContent: "center",
  },
  messages: { paddingHorizontal: Spacing.lg, paddingBottom: Spacing.md },
  wait: {
    flexDirection: "row",
    gap: Spacing.sm,
    padding: Spacing.md,
    flexWrap: "wrap",
  },
  recovery: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    gap: Spacing.md,
    flexDirection: "row",
    alignItems: "center",
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  recoveryText: { flex: 1, fontSize: 14, lineHeight: 20 },
  chatGuidance: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.xs,
    paddingBottom: Spacing.md,
    fontSize: 13,
    lineHeight: 18,
  },
  composer: {
    flexShrink: 0,
    flexDirection: "row",
    gap: Spacing.sm,
    padding: Spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    alignItems: "flex-end",
  },
  input: {
    ...Typography.body,
    flex: 1,
    minHeight: 48,
    maxHeight: 120,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
  },
  send: {
    minHeight: 48,
    minWidth: 48,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: BorderRadius.full,
  },
});
