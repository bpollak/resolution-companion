import React, { useState, useRef } from "react";
import {
  View,
  StyleSheet,
  TextInput,
  Pressable,
  FlatList,
  ScrollView,
  ActivityIndicator,
  Alert,
  Platform,
  KeyboardAvoidingView,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";

import { useTheme } from "@/hooks/useTheme";
import { useApp } from "@/context/AppContext";
import { Colors, Spacing, Typography, BorderRadius } from "@/constants/theme";
import { ThemedText } from "@/components/ThemedText";
import { ChatBubble } from "@/components/ChatBubble";
import { AIConsentModal } from "@/components/AIConsentModal";
import {
  getOnboardingResponse,
  extractPersonaFromConversation,
  AIMessage,
} from "@/lib/ai";
import { sortWeekdays } from "@/lib/progress";
import { storage } from "@/lib/storage";
import { logger } from "@/lib/logger";
import { track } from "@/lib/telemetry";
import {
  STARTER_BENCHMARKS as DEFAULT_BENCHMARKS,
  ensureDayScheduled,
} from "@/lib/starter-plan";

const MIN_ACTIONS_PER_PERSONA = 3;
const MAX_ACTIONS_PER_PERSONA = 5;

// The no-AI starter plan (also pads a sparse AI plan) lives in lib/starter-plan
// so its "at least one action on every weekday" invariant can be unit-tested.

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
}

const ACCENT_COLORS = {
  cyan: "#00D9FF",
  pink: "#FF6B9D",
  purple: "#9B6BFF",
  green: "#6BFFB8",
  orange: "#FFB86B",
};

interface IntroPage {
  icon: keyof typeof Feather.glyphMap;
  title: string;
  subtitle: string;
  details?: {
    icon: keyof typeof Feather.glyphMap;
    text: string;
    color: string;
  }[];
}

const INTRO_PAGES: IntroPage[] = [
  {
    icon: "compass",
    title: "Welcome to Resolution Companion",
    subtitle:
      "Build better habits and make real progress on your goals with personalized daily actions and AI-powered coaching.",
    details: [
      {
        icon: "target",
        text: "Daily habit tracking",
        color: ACCENT_COLORS.cyan,
      },
      {
        icon: "message-circle",
        text: "AI coaching sessions",
        color: ACCENT_COLORS.pink,
      },
      {
        icon: "trending-up",
        text: "Progress insights",
        color: ACCENT_COLORS.purple,
      },
    ],
  },
  {
    icon: "message-circle",
    title: "Start with a Quick Chat",
    subtitle:
      "Answer a couple of questions about what you'd like to improve. We'll create a personalized plan just for you.",
    details: [
      {
        icon: "clock",
        text: "Takes about 2 minutes",
        color: ACCENT_COLORS.cyan,
      },
      {
        icon: "shield",
        text: "AI powered by OpenAI — only with your consent",
        color: ACCENT_COLORS.green,
      },
    ],
  },
  {
    icon: "zap",
    title: "Free vs Premium",
    subtitle: "Get started for free, or unlock everything with Premium.",
    details: [
      {
        icon: "user",
        text: "Free: 1 plan, 10 coaching check-ins/month",
        color: ACCENT_COLORS.cyan,
      },
      {
        icon: "star",
        text: "Premium: Unlimited plans & coaching",
        color: ACCENT_COLORS.orange,
      },
      {
        icon: "edit-2",
        text: "Both: Full customization of your plan",
        color: ACCENT_COLORS.green,
      },
    ],
  },
];

const STEP_COLORS = [
  ACCENT_COLORS.cyan,
  ACCENT_COLORS.pink,
  ACCENT_COLORS.purple,
];

export default function OnboardingScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const { theme, isDark } = useTheme();
  const {
    setHasOnboarded,
    setPersona,
    setBenchmarks,
    setActions,
    aiConsent,
    setAiConsent,
  } = useApp();

  const [introPage, setIntroPage] = useState(0);
  const [showIntro, setShowIntro] = useState(true);
  const [showConsentModal, setShowConsentModal] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [conversationComplete, setConversationComplete] = useState(false);
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractStage, setExtractStage] = useState(0);

  const EXTRACT_STAGES = [
    "Reading your goals...",
    "Shaping who you're becoming...",
    "Designing your milestones...",
    "Scheduling your first week...",
  ];

  React.useEffect(() => {
    track("onboarding_started");
  }, []);

  // Cycle staged copy while the plan is being built so the wait reads as
  // craftsmanship rather than a stuck spinner
  React.useEffect(() => {
    if (!isExtracting) {
      setExtractStage(0);
      return;
    }
    const interval = setInterval(() => {
      setExtractStage((prev) =>
        prev < EXTRACT_STAGES.length - 1 ? prev + 1 : prev,
      );
    }, 4000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isExtracting]);
  const [streamingText, setStreamingText] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);

  const flatListRef = useRef<FlatList>(null);
  const messageCount = useRef(0);

  // Deferring to the next frame lets the freshly-swapped message finish
  // layout first — a synchronous scrollToEnd computes a stale offset and
  // lands short, tucking the last lines under the input (mirrors
  // ReflectScreen's scrollToEndIfNeeded).
  const scrollChatToEnd = React.useCallback(() => {
    requestAnimationFrame(() => {
      flatListRef.current?.scrollToEnd({ animated: false });
    });
  }, []);
  // Set when the user starts a fresh interview this session, so a slow
  // transcript restore can't clobber a conversation already in progress
  const startedFreshRef = useRef(false);

  // Resume an interrupted AI interview: restore the saved transcript and
  // skip the intro so an app switch or crash doesn't restart the interview.
  React.useEffect(() => {
    (async () => {
      try {
        const stored = await storage.getOnboardingMessages();
        if (stored.length === 0 || startedFreshRef.current) return;
        setMessages(
          stored.map(({ id, role, content }) => ({ id, role, content })),
        );
        const userTurns = stored.filter((m) => m.role === "user").length;
        messageCount.current = userTurns;
        if (userTurns >= 2) setConversationComplete(true);
        setShowIntro(false);
      } catch {
        // A failed restore just means starting fresh
      }
    })();
  }, []);

  // Persist the transcript as it grows (fire-and-forget; cleared on success)
  React.useEffect(() => {
    if (messages.length === 0) return;
    storage
      .setOnboardingMessages(
        messages.map((m) => ({ ...m, createdAt: new Date().toISOString() })),
      )
      .catch(() => {});
  }, [messages]);

  // Follow the conversation after every commit — streaming growth, the
  // final message swap, and the conversation-complete panel all move the
  // bottom after the list's own callbacks have already fired
  React.useEffect(() => {
    scrollChatToEnd();
  }, [
    messages,
    streamingText,
    isStreaming,
    conversationComplete,
    scrollChatToEnd,
  ]);

  const handleBeginOnboarding = async () => {
    if (!aiConsent) {
      setShowConsentModal(true);
      return;
    }
    await beginChat();
  };

  const beginChat = async () => {
    startedFreshRef.current = true;
    setShowIntro(false);
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    await startConversation();
  };

  const handleConsentAgree = async () => {
    setShowConsentModal(false);
    await setAiConsent(true);
    await beginChat();
  };

  const handleConsentDecline = () => {
    setShowConsentModal(false);
    const message =
      "No problem — AI coaching stays off. You can start with a ready-made starter plan and enable AI coaching later in Profile.";
    if (Platform.OS === "web") {
      if (window.confirm(message)) {
        createStarterPlan();
      }
      return;
    }
    Alert.alert("Continue Without AI?", message, [
      { text: "Go Back", style: "cancel" },
      { text: "Use Starter Plan", onPress: () => createStarterPlan() },
    ]);
  };

  // Builds a persona locally from the default benchmarks — no network calls,
  // so declining AI consent still produces a fully working app.
  const createStarterPlan = async () => {
    setIsExtracting(true);
    try {
      const persona = await setPersona({
        name: "Momentum Builder",
        description: "Building better habits one small daily action at a time.",
      });
      await savePlan(persona.id, DEFAULT_BENCHMARKS);
      await setHasOnboarded(true);
      track("onboarding_declined_ai");
      track("onboarding_completed");
      storage.setOnboardingMessages([]).catch(() => {});

      if (Platform.OS !== "web") {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }

      // Land on Today so the first thing users see is the actions they can
      // check off right now (the Progress tab shows the plan-review guide)
      navigation.reset({
        index: 0,
        routes: [
          {
            name: "Main",
            state: {
              routes: [{ name: "TodayTab" }],
            },
          },
        ],
      });
    } catch (error) {
      logger.error("Failed to create starter plan:", error);
      Alert.alert("Error", "We couldn't set up your plan. Please try again.");
    } finally {
      setIsExtracting(false);
    }
  };

  const VALID_DAYS = [
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
    "Sunday",
  ];

  // The AI occasionally returns cadences the schedule model can't represent
  // ("First Thursday", "Last Tuesday"). Keep only real weekday names; an
  // action with none left falls back to the plan's most common weekdays so
  // it can actually be scheduled (and its milestone can progress).
  const sanitizeFrequency = (
    frequency: string[],
    fallback: string[],
  ): string[] => {
    const cleaned = (frequency || [])
      .map((day) =>
        VALID_DAYS.find(
          (d) => d.toLowerCase() === String(day).trim().toLowerCase(),
        ),
      )
      .filter((d): d is string => Boolean(d));
    return sortWeekdays(cleaned.length > 0 ? [...new Set(cleaned)] : fallback);
  };

  const savePlan = async (
    personaId: string,
    benchmarksToUse: typeof DEFAULT_BENCHMARKS,
  ) => {
    const results = benchmarksToUse.map((b) => {
      const benchmark = {
        id: Date.now().toString() + Math.random().toString(36).substr(2),
        personaId,
        title: b.title,
        targetDate: null,
        status: "active" as const,
        createdAt: new Date().toISOString(),
      };
      return { benchmark, action: b.elementalAction };
    });

    // Fallback days = the most common valid weekdays across the plan, so a
    // sanitized action lands on days the user actually said they're free
    const dayCounts = new Map<string, number>();
    for (const r of results) {
      for (const day of r.action.frequency || []) {
        const valid = VALID_DAYS.find(
          (d) => d.toLowerCase() === String(day).trim().toLowerCase(),
        );
        if (valid) dayCounts.set(valid, (dayCounts.get(valid) || 0) + 1);
      }
    }
    const fallbackDays =
      dayCounts.size > 0
        ? [[...dayCounts.entries()].sort((a, b) => b[1] - a[1])[0][0]]
        : ["Monday", "Wednesday", "Friday"];

    const allBenchmarks = results.map((r) => r.benchmark);
    const allActions = results.map((r, index) => ({
      id: Date.now().toString() + index + Math.random().toString(36).substr(2),
      benchmarkId: allBenchmarks[index].id,
      title: r.action.title,
      frequency: sanitizeFrequency(r.action.frequency, fallbackDays),
      anchorLink: r.action.anchorLink,
      kickstartVersion: r.action.kickstartVersion,
      createdAt: new Date().toISOString(),
    }));

    // Activation guarantee: never land on an empty Today right after
    // onboarding. If the plan doesn't schedule anything for the install
    // weekday, add just that day to the first action (other days untouched).
    const todayName = new Date().toLocaleDateString("en-US", {
      weekday: "long",
    });
    const finalActions = ensureDayScheduled(allActions, todayName);

    await setBenchmarks(allBenchmarks);
    await setActions(finalActions);
  };

  const startConversation = async () => {
    setIsLoading(true);
    setIsStreaming(true);
    setStreamingText("");
    try {
      const response = await getOnboardingResponse([], (chunk) => {
        setStreamingText((prev) => prev + chunk);
      });

      setIsStreaming(false);
      const aiMessage: ChatMessage = {
        id: Date.now().toString(),
        role: "assistant",
        content: response,
      };
      setMessages([aiMessage]);
      setStreamingText("");
    } catch (error) {
      logger.error("Failed to start conversation:", error);
      Alert.alert("Error", "Failed to connect to AI. Please try again.");
      setIsStreaming(false);
      setStreamingText("");
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
    messageCount.current += 1;

    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }

    try {
      const aiMessages: AIMessage[] = messages.map((m) => ({
        role: m.role,
        content: m.content,
      }));
      aiMessages.push({ role: "user", content: userMessage.content });

      const response = await getOnboardingResponse(aiMessages, (chunk) => {
        setStreamingText((prev) => prev + chunk);
      });

      setIsStreaming(false);
      const aiMessage: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: response,
      };
      setMessages((prev) => [...prev, aiMessage]);
      setStreamingText("");

      if (messageCount.current >= 2) {
        setConversationComplete(true);
      }
    } catch (error) {
      logger.error("Failed to send message:", error);
      Alert.alert("Error", "Failed to get AI response. Please try again.");
      setIsStreaming(false);
      setStreamingText("");
    } finally {
      setIsLoading(false);
    }
  };

  const finishOnboarding = async () => {
    setIsExtracting(true);
    try {
      const aiMessages: AIMessage[] = messages.map((m) => ({
        role: m.role,
        content: m.content,
      }));

      const personaData = await extractPersonaFromConversation(aiMessages);

      let benchmarksToUse = personaData.benchmarks;
      while (benchmarksToUse.length < MIN_ACTIONS_PER_PERSONA) {
        const nextDefault = DEFAULT_BENCHMARKS[benchmarksToUse.length];
        if (nextDefault) {
          benchmarksToUse.push(nextDefault);
        } else {
          break;
        }
      }
      if (benchmarksToUse.length > MAX_ACTIONS_PER_PERSONA) {
        benchmarksToUse = benchmarksToUse.slice(0, MAX_ACTIONS_PER_PERSONA);
      }

      const persona = await setPersona({
        name: personaData.personaName,
        description: personaData.personaDescription,
      });

      await savePlan(persona.id, benchmarksToUse);
      await setHasOnboarded(true);
      track("onboarding_completed");
      storage.setOnboardingMessages([]).catch(() => {});

      if (Platform.OS !== "web") {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }

      // Land on Today so the first thing users see is the actions they can
      // check off right now (the Progress tab shows the plan-review guide)
      navigation.reset({
        index: 0,
        routes: [
          {
            name: "Main",
            state: {
              routes: [{ name: "TodayTab" }],
            },
          },
        ],
      });
    } catch (error) {
      logger.error("Failed to extract persona:", error);
      if (Platform.OS === "web") {
        if (
          window.confirm(
            "We couldn't create your plan. Check your internet connection and retry?",
          )
        ) {
          setIsExtracting(false);
          finishOnboarding();
          return;
        }
      } else {
        Alert.alert(
          "Connection Issue",
          "We couldn't create your plan. Please check your internet connection and try again.",
          [
            { text: "Not Now", style: "cancel" },
            { text: "Retry", onPress: () => finishOnboarding() },
          ],
        );
      }
    } finally {
      setIsExtracting(false);
    }
  };

  const renderMessage = ({ item }: { item: ChatMessage }) => (
    <ChatBubble message={item.content} isUser={item.role === "user"} />
  );

  const handleNextPage = () => {
    if (introPage < INTRO_PAGES.length - 1) {
      setIntroPage(introPage + 1);
      if (Platform.OS !== "web") {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }
    }
  };

  const handlePrevPage = () => {
    if (introPage > 0) {
      setIntroPage(introPage - 1);
      if (Platform.OS !== "web") {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }
    }
  };

  const currentIntroPage = INTRO_PAGES[introPage];
  const isLastIntroPage = introPage === INTRO_PAGES.length - 1;

  if (showIntro) {
    return (
      <View
        style={[styles.container, { backgroundColor: theme.backgroundRoot }]}
      >
        <View style={[styles.header, { paddingTop: insets.top + Spacing.md }]}>
          {navigation.canGoBack() ? (
            <Pressable
              onPress={() => navigation.goBack()}
              hitSlop={4}
              style={({ pressed }) => [
                styles.closeButton,
                { opacity: pressed ? 0.6 : 1 },
              ]}
              accessibilityRole="button"
              accessibilityLabel="Close"
            >
              <Feather name="x" size={24} color={theme.text} />
            </Pressable>
          ) : (
            <View style={styles.headerSpacer} />
          )}
          <View style={styles.headerSpacer} />
        </View>

        <ScrollView
          delaysContentTouches={false}
          style={styles.introScroll}
          contentContainerStyle={styles.introPageContent}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.introHero}>
            <View style={styles.heroLogoContainer}>
              <View
                style={[
                  styles.heroGlowRing,
                  { borderColor: STEP_COLORS[introPage] + "40" },
                ]}
              />
              <View style={styles.heroLogoInner}>
                <View
                  style={[
                    styles.heroLogoCore,
                    { backgroundColor: STEP_COLORS[introPage] + "30" },
                  ]}
                >
                  <Feather
                    name={currentIntroPage.icon}
                    size={40}
                    color={STEP_COLORS[introPage]}
                  />
                </View>
              </View>
            </View>
            <ThemedText style={styles.introTitle}>
              {currentIntroPage.title}
            </ThemedText>
            <ThemedText
              style={[styles.introSubtitle, { color: theme.textSecondary }]}
            >
              {currentIntroPage.subtitle}
            </ThemedText>
          </View>

          {currentIntroPage.details ? (
            <View style={styles.introDetailsContainer}>
              {currentIntroPage.details.map((detail, index) => (
                <View
                  key={index}
                  style={[
                    styles.introDetailRow,
                    {
                      backgroundColor: isDark
                        ? Colors.dark.backgroundDefault
                        : Colors.light.backgroundDefault,
                    },
                  ]}
                >
                  <View
                    style={[
                      styles.introDetailIcon,
                      { backgroundColor: detail.color + "20" },
                    ]}
                  >
                    <Feather
                      name={detail.icon}
                      size={18}
                      color={detail.color}
                    />
                  </View>
                  <ThemedText style={styles.introDetailText}>
                    {detail.text}
                  </ThemedText>
                </View>
              ))}
            </View>
          ) : null}
        </ScrollView>

        <View
          style={[
            styles.introFooter,
            {
              paddingBottom: Math.max(insets.bottom, 20) + Spacing.xl,
              backgroundColor: theme.backgroundRoot,
            },
          ]}
        >
          <View style={styles.paginationDots}>
            {INTRO_PAGES.map((_, index) => (
              <View
                key={index}
                style={[
                  styles.paginationDot,
                  {
                    backgroundColor:
                      index === introPage
                        ? STEP_COLORS[introPage]
                        : theme.backgroundTertiary,
                    width: index === introPage ? 24 : 8,
                  },
                ]}
              />
            ))}
          </View>

          <View style={styles.introButtonRow}>
            {introPage > 0 ? (
              <Pressable
                onPress={handlePrevPage}
                accessibilityRole="button"
                accessibilityLabel="Previous page"
                style={({ pressed }) => [
                  styles.backButton,
                  {
                    backgroundColor: isDark
                      ? Colors.dark.backgroundDefault
                      : Colors.light.backgroundDefault,
                    opacity: pressed ? 0.8 : 1,
                  },
                ]}
              >
                <Feather name="arrow-left" size={20} color={theme.text} />
              </Pressable>
            ) : null}
            <Pressable
              onPress={isLastIntroPage ? handleBeginOnboarding : handleNextPage}
              style={({ pressed }) => [
                styles.beginButton,
                { flex: 1, opacity: pressed ? 0.8 : 1 },
              ]}
            >
              <ThemedText style={styles.beginButtonText}>
                {isLastIntroPage ? "Let's Get Started" : "Continue"}
              </ThemedText>
              <Feather name="arrow-right" size={20} color="#000000" />
            </Pressable>
          </View>

          {isLastIntroPage ? (
            <ThemedText
              style={[styles.introFooterNote, { color: theme.textSecondary }]}
            >
              Takes about 2 minutes
            </ThemedText>
          ) : null}
        </View>

        <AIConsentModal
          visible={showConsentModal}
          onAgree={handleConsentAgree}
          onDecline={handleConsentDecline}
        />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: theme.backgroundRoot }]}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={0}
    >
      <View style={[styles.header, { paddingTop: insets.top + Spacing.md }]}>
        <Pressable
          onPress={() => navigation.goBack()}
          hitSlop={4}
          style={({ pressed }) => [
            styles.closeButton,
            { opacity: pressed ? 0.6 : 1 },
          ]}
          accessibilityRole="button"
          accessibilityLabel="Close"
        >
          <Feather name="x" size={24} color={theme.text} />
        </Pressable>
        <ThemedText style={styles.headerTitle}>Create Your Plan</ThemedText>
        <View style={styles.headerSpacer} />
      </View>

      <View style={styles.progressBarContainer}>
        <View style={styles.progressSteps}>
          <View
            style={[
              styles.progressStep,
              { backgroundColor: Colors.dark.accent },
            ]}
          />
          <View
            style={[
              styles.progressStep,
              {
                backgroundColor:
                  messageCount.current >= 1
                    ? Colors.dark.accent
                    : theme.backgroundTertiary,
              },
            ]}
          />
          <View
            style={[
              styles.progressStep,
              {
                backgroundColor: conversationComplete
                  ? Colors.dark.accent
                  : theme.backgroundTertiary,
              },
            ]}
          />
        </View>
        <ThemedText
          style={[styles.progressStepLabel, { color: theme.textSecondary }]}
        >
          {conversationComplete
            ? "Step 3 of 3: Build your plan"
            : messageCount.current >= 1
              ? "Step 2 of 3: Tell us more"
              : "Step 1 of 3: Share your vision"}
        </ThemedText>
      </View>

      <FlatList
        ref={flatListRef}
        data={messages}
        renderItem={renderMessage}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.messageList}
        onContentSizeChange={scrollChatToEnd}
        // Re-anchor when the VIEWPORT shrinks, not just when content grows:
        // the keyboard (KAV padding) and the "Create My Plan" panel both
        // steal height after the last content change, leaving the final AI
        // bubble cut off behind them (mirrors ReflectScreen's onLayout).
        onLayout={scrollChatToEnd}
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

      {conversationComplete && !isExtracting ? (
        <View
          style={[
            styles.finishContainer,
            { paddingBottom: insets.bottom + Spacing.lg },
          ]}
        >
          <View style={styles.progressIndicator}>
            <Feather
              name="check-circle"
              size={16}
              color={Colors.dark.success}
            />
            <ThemedText
              style={[styles.progressText, { color: theme.textSecondary }]}
            >
              Your plan is ready to build
            </ThemedText>
          </View>
          <Pressable
            onPress={finishOnboarding}
            accessibilityRole="button"
            accessibilityLabel="Create my plan"
            style={({ pressed }) => [
              styles.finishButton,
              { opacity: pressed ? 0.8 : 1 },
            ]}
          >
            <ThemedText style={styles.finishButtonText}>
              Create My Plan
            </ThemedText>
            <Feather name="arrow-right" size={20} color="#000000" />
          </Pressable>
        </View>
      ) : null}

      {isExtracting ? (
        <View
          style={[
            styles.extractingContainer,
            { paddingBottom: insets.bottom + Spacing.lg },
          ]}
        >
          <ActivityIndicator size="large" color={Colors.dark.accent} />
          <ThemedText
            style={[styles.extractingText, { color: theme.textSecondary }]}
          >
            {EXTRACT_STAGES[extractStage]}
          </ThemedText>
        </View>
      ) : null}

      {!conversationComplete && !isExtracting ? (
        <View
          style={[
            styles.inputContainer,
            {
              paddingBottom: insets.bottom + Spacing.md,
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
            placeholder="Share your aspirations..."
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
      ) : null}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.md,
  },
  closeButton: {
    padding: Spacing.sm,
  },
  headerTitle: {
    ...Typography.headline,
    flex: 1,
    textAlign: "center",
  },
  headerSpacer: {
    width: 40,
  },
  progressBarContainer: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.md,
    alignItems: "center",
  },
  progressSteps: {
    flexDirection: "row",
    gap: Spacing.sm,
    marginBottom: Spacing.xs,
  },
  progressStep: {
    width: 60,
    height: 4,
    borderRadius: 2,
  },
  progressStepLabel: {
    ...Typography.small,
  },
  messageList: {
    paddingTop: Spacing.lg,
    // Match the Coach chat's breathing room: without it the last AI bubble
    // sits flush against the input and reads as cut off mid-stream.
    paddingBottom: 80,
    flexGrow: 1,
  },
  loadingContainer: {
    paddingVertical: Spacing.lg,
    paddingHorizontal: Spacing.lg,
    alignItems: "flex-start",
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
  finishContainer: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.lg,
  },
  progressIndicator: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  progressText: {
    ...Typography.small,
    fontWeight: "500",
  },
  finishButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.dark.accent,
    paddingVertical: Spacing.lg,
    borderRadius: BorderRadius.full,
    gap: Spacing.sm,
  },
  finishButtonText: {
    ...Typography.headline,
    color: "#000000",
  },
  extractingContainer: {
    alignItems: "center",
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.xl,
    gap: Spacing.md,
  },
  extractingText: {
    ...Typography.body,
    textAlign: "center",
  },
  introHero: {
    alignItems: "center",
    paddingVertical: Spacing.xl,
  },
  heroLogoContainer: {
    width: 100,
    height: 100,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Spacing.xl,
  },
  heroGlowRing: {
    position: "absolute",
    width: 100,
    height: 100,
    borderRadius: 50,
    borderWidth: 2,
  },
  heroLogoInner: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "rgba(0, 217, 255, 0.15)",
    alignItems: "center",
    justifyContent: "center",
  },
  heroLogoCore: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: "rgba(0, 217, 255, 0.25)",
    alignItems: "center",
    justifyContent: "center",
  },
  introTitle: {
    ...Typography.title,
    textAlign: "center",
    marginBottom: Spacing.sm,
  },
  introSubtitle: {
    ...Typography.body,
    textAlign: "center",
    lineHeight: 24,
  },
  introFooter: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.lg,
  },
  beginButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.dark.accent,
    paddingVertical: Spacing.lg,
    borderRadius: BorderRadius.full,
    gap: Spacing.sm,
  },
  beginButtonText: {
    ...Typography.headline,
    color: "#000000",
  },
  introFooterNote: {
    ...Typography.caption,
    textAlign: "center",
    marginTop: Spacing.sm,
  },
  introScroll: {
    flex: 1,
  },
  introPageContent: {
    flexGrow: 1,
    justifyContent: "center",
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.lg,
  },
  introDetailsContainer: {
    marginTop: Spacing.xl,
    gap: Spacing.sm,
  },
  introDetailRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.md,
    borderRadius: BorderRadius.lg,
  },
  introDetailIcon: {
    width: 36,
    height: 36,
    borderRadius: BorderRadius.md,
    alignItems: "center",
    justifyContent: "center",
    marginRight: Spacing.md,
  },
  introDetailText: {
    ...Typography.body,
    flex: 1,
  },
  paginationDots: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: Spacing.sm,
    marginBottom: Spacing.lg,
  },
  paginationDot: {
    height: 8,
    borderRadius: 4,
  },
  introButtonRow: {
    flexDirection: "row",
    gap: Spacing.md,
  },
  backButton: {
    width: 52,
    height: 52,
    borderRadius: BorderRadius.full,
    alignItems: "center",
    justifyContent: "center",
  },
});
