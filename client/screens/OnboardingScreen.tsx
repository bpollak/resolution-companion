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
  deriveResolution,
  pickResolutionMessage,
  type OnboardingPlanDraft,
} from "@/lib/onboarding-plan";
import {
  approvalClearsCoachTranscript,
  createStarterPlanDraft,
  isSelfSetupDraft,
} from "@/lib/starter-plan";
import { storage } from "@/lib/storage";
import { logger } from "@/lib/logger";
import { track } from "@/lib/telemetry";

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
}
type Stage = "welcome" | "chat" | "review";

// One tap gets a New Year's user past the blank box; Coach narrows it down.
const RESOLUTION_STARTERS = [
  "Get fit",
  "Lose weight",
  "Save money",
  "Read more",
  "Sleep better",
  "Less phone time",
  "Stress less",
  "Learn a skill",
  "Something else",
];

export default function OnboardingScreen() {
  const insets = useSafeAreaInsets();
  const [keyboardVisible, setKeyboardVisible] = useState(Keyboard.isVisible());
  const navigation = useNavigation<any>();
  const { theme } = useTheme();
  const { aiConsent, setAiConsent, refreshData, personas } = useApp();
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
  const inputRef = useRef<TextInput>(null);
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
        // Legacy manual drafts stay stored, but only Coach-created and
        // self-setup plans resume.
        if (
          (savedDraft?.usesAI === true || isSelfSetupDraft(savedDraft)) &&
          Array.isArray(savedDraft?.suggestions)
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
  // The no-AI path: a local starter draft the person edits and approves.
  const setUpMyself = () => {
    touchedRef.current = true;
    cancelRequest();
    Keyboard.dismiss();
    setConsentPaused(false);
    setError(null);
    setDraft(createStarterPlanDraft(personas.map((persona) => persona.name)));
    setStage("review");
    Haptics.selectionAsync().catch(() => {});
  };
  // A saved self-made draft would otherwise leave "Resume my plan review" as
  // the only way forward, hiding Coach for good.
  const switchToCoach = () => {
    touchedRef.current = true;
    setDraft(null);
    // Queued behind pending draft saves so a late keystroke save cannot
    // restore the discarded draft on the next launch.
    draftWrite.current = draftWrite.current
      .catch(() => {})
      .then(() => storage.setOnboardingDraft(null));
    draftWrite.current.catch((cause) =>
      logger.warn("Plan draft clear failed:", cause),
    );
    Haptics.selectionAsync().catch(() => {});
    chooseCoach();
  };
  const sendMessage = (consentOverride = false, starter?: string) => {
    const text = (starter ?? inputText).trim();
    if (!text || busy) return;
    if (!aiConsent && !consentOverride) {
      if (starter) setInputText(starter);
      consentIntent.current = "send";
      setShowConsentModal(true);
      return;
    }
    const conversation: ChatMessage[] = [
      ...messages,
      { id: `${Date.now()}-user`, role: "user", content: text },
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
        resolution: deriveResolution(
          pickResolutionMessage(
            messages
              .filter((message) => message.role === "user")
              .map((message) => message.content),
          ),
        ),
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
    if (!draft || savingRef.current) return;
    savingRef.current = true;
    setBusy("save");
    setError(null);
    try {
      await draftWrite.current.catch(() => {});
      await storage.setOnboardingDraft(draft);
      await storage.commitOnboardingPlan(draft);
      await storage.setOnboardingDraft(null);
      if (approvalClearsCoachTranscript(draft)) {
        await storage.setOnboardingMessages([]);
      }
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

  // A self-made plan goes back to the welcome choices, not into a Coach chat.
  const returnsToCoach = messages.length > 0 && !isSelfSetupDraft(draft);
  const back = () => {
    if (busy === "save") return;
    Keyboard.dismiss();
    cancelRequest();
    setError(null);
    if (stage === "welcome") navigation.goBack();
    else if (stage === "review" && returnsToCoach) beginChat();
    else setStage("welcome");
  };
  const button = (
    label: string,
    action: () => void,
    primary = false,
    disabled = false,
    hint?: string,
  ) => (
    <Pressable
      onPress={action}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={hint}
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
              : stage === "review" && returnsToCoach
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
        {/* Welcome's own heading names the screen, so its header stays
            empty rather than repeating a second title. */}
        {stage === "welcome" ? (
          <View style={styles.headerCopy} />
        ) : (
          <View
            style={styles.headerCopy}
            accessible
            accessibilityRole="header"
            accessibilityLabel={`Step ${step} of 2. ${stepTitle}`}
            accessibilityLiveRegion="polite"
          >
            <ThemedText
              style={[styles.stepLabel, { color: theme.textSecondary }]}
            >
              Step {step} of 2
            </ThemedText>
            <ThemedText style={styles.headerTitle}>{stepTitle}</ThemedText>
          </View>
        )}
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
              What&rsquo;s your resolution?
            </ThemedText>
            <ThemedText style={{ color: theme.textSecondary }}>
              Coach turns it into one small habit. You decide when it starts.
            </ThemedText>
            <View style={styles.overview}>
              {[
                [
                  "Talk with Coach",
                  "Share your resolution and the days that fit.",
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
              Coach needs an internet connection and your permission to use AI.
              Free includes 10 Coach conversations a month.
            </ThemedText>
            {consentPaused ? (
              <ThemedText
                accessibilityLiveRegion="polite"
                style={{ color: theme.textSecondary }}
              >
                AI coaching is off. You can set up your plan yourself now, or
                start with Coach whenever you are ready.
              </ThemedText>
            ) : null}
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
              !(consentPaused && !draft),
            )}
            {isSelfSetupDraft(draft)
              ? button(
                  "Build my plan with Coach",
                  switchToCoach,
                  false,
                  false,
                  "Discards your starter plan and opens Coach.",
                )
              : draft
                ? null
                : button(
                    "Set it up myself",
                    setUpMyself,
                    consentPaused,
                    false,
                    "Opens an editable starter plan. No AI is used.",
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
              : "Share your resolution and the days that fit. You’ll review the plan before it starts."}
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
                {!busy &&
                !error &&
                messages.length > 0 &&
                !messages.some((message) => message.role === "user") ? (
                  <View
                    style={styles.starters}
                    accessibilityLabel="Resolution ideas"
                  >
                    {RESOLUTION_STARTERS.map((starter) => (
                      <Pressable
                        key={starter}
                        onPress={() =>
                          starter === "Something else"
                            ? inputRef.current?.focus()
                            : sendMessage(false, starter)
                        }
                        accessibilityRole="button"
                        accessibilityLabel={
                          starter === "Something else"
                            ? "Type your own resolution"
                            : `Send: ${starter}`
                        }
                        hitSlop={6}
                        pressRetentionOffset={12}
                        style={({ pressed }) => [
                          styles.starter,
                          {
                            borderColor: theme.accent,
                            backgroundColor: theme.backgroundSecondary,
                            opacity: pressed ? 0.6 : 1,
                          },
                        ]}
                      >
                        <ThemedText
                          style={{ color: theme.text, fontWeight: "600" }}
                        >
                          {starter}
                        </ThemedText>
                      </Pressable>
                    ))}
                  </View>
                ) : null}
                {/* Only once Coach stops asking: a clarifying question means
                    the plan would have to guess the missing detail. */}
                {canPreview &&
                messages.at(-1)?.role === "assistant" &&
                !messages.at(-1)?.content.trim().endsWith("?") ? (
                  <View style={styles.inlineReview}>
                    {button("Review my plan", previewPlan, true)}
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
              ref={inputRef}
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
    gap: Spacing.sm,
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
  starters: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.sm,
    paddingTop: Spacing.sm,
  },
  starter: {
    minHeight: 40,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    justifyContent: "center",
  },
  inlineReview: { paddingTop: Spacing.md },
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
