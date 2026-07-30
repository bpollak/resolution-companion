import React, {
  useState,
  useRef,
  useMemo,
  useEffect,
  useCallback,
} from "react";
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
  NativeSyntheticEvent,
  NativeScrollEvent,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { useNavigation, useRoute } from "@react-navigation/native";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";

import { useTheme } from "@/hooks/useTheme";
import { useApp } from "@/context/AppContext";
import { Colors, Spacing, Typography, BorderRadius } from "@/constants/theme";
import { ThemedText } from "@/components/ThemedText";
import { ChatBubble } from "@/components/ChatBubble";
import { AIConsentModal } from "@/components/AIConsentModal";
import {
  getReflectionResponse,
  AIMessage,
  getMonthlyContext,
  ReflectionExtras,
} from "@/lib/ai";
import { logger } from "@/lib/logger";
import { createTextStreamBuffer, TextStreamBuffer } from "@/lib/stream-buffer";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { track } from "@/lib/telemetry";
import { getCoachTone, type CoachTone } from "@/lib/rewards";
import { buildCoachActionContext, buildCoachOpening } from "@/lib/coach";
import { getMainTabHeaderClearance } from "@/navigation/tab-bar-layout";
import {
  startTextTypewriter,
  type TypewriterController,
} from "@/lib/typewriter";

// One-time free taste of coach memory: memory sells itself by demonstration,
// not description. Set once the taste session has actually started.
const MEMORY_TASTE_USED_KEY = "coach_memory_taste_used";

type PeriodType = "monthly" | "weekly";

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
}

export default function ReflectScreen() {
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const headerClearance = getMainTabHeaderClearance(Platform.OS, headerHeight);
  const tabBarHeight = useBottomTabBarHeight();
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { theme, isDark } = useTheme();
  const {
    hasOnboarded,
    momentumScore,
    personaAlignment,
    persona,
    addReflection,
    canUseReflection,
    incrementReflectionCount,
    subscription,
    monthlyReflectionCount,
    reflections,
    aiConsent,
    setAiConsent,
    progressSnapshot,
    actions,
    dailyLogs,
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

  const chatScrollRef = useRef<ScrollView>(null);
  const streamBufferRef = useRef<TextStreamBuffer | null>(null);
  const coachOpeningStreamRef = useRef<TypewriterController | null>(null);
  const isNearBottomRef = useRef(true);
  const isDraggingChatRef = useRef(false);
  const isMomentumScrollingChatRef = useRef(false);
  const autoScrollFrameRef = useRef<number | null>(null);
  // Each session owns a generation. A late response from a closed/replaced
  // session is ignored instead of leaking into the next Coach screen.
  const coachRequestGenerationRef = useRef(0);
  const coachAbortControllerRef = useRef<AbortController | null>(null);

  const createStreamBuffer = useCallback(() => {
    streamBufferRef.current?.cancel();
    const buffer = createTextStreamBuffer((chunk) => {
      setStreamingText((previous) => previous + chunk);
    });
    streamBufferRef.current = buffer;
    return buffer;
  }, []);

  const finishStreamBuffer = useCallback((buffer: TextStreamBuffer) => {
    buffer.flush();
    if (streamBufferRef.current === buffer) streamBufferRef.current = null;
  }, []);

  const resetStreamingPreview = useCallback(() => {
    setStreamingText("");
  }, []);

  useEffect(
    () => () => {
      streamBufferRef.current?.cancel();
      coachOpeningStreamRef.current?.cancel();
      if (autoScrollFrameRef.current !== null) {
        cancelAnimationFrame(autoScrollFrameRef.current);
      }
    },
    [],
  );

  const sortedReflections = useMemo(
    () =>
      [...reflections].sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      ),
    [reflections],
  );

  // Free users get to experience memory exactly once before the gate —
  // null until the persisted flag loads (memory stays off that first render)
  const [memoryTasteUsed, setMemoryTasteUsed] = useState<boolean | null>(null);
  const [coachTone, setCoachToneState] = useState<CoachTone>("supportive");
  useEffect(() => {
    Promise.all([AsyncStorage.getItem(MEMORY_TASTE_USED_KEY), getCoachTone()])
      .then(([value, storedTone]) => {
        setMemoryTasteUsed(value === "true");
        setCoachToneState(storedTone);
      })
      .catch(() => setMemoryTasteUsed(true));
  }, []);

  // Premium coach memory: a compact digest of the two most recent saved
  // sessions, injected into the system prompt as the coach's own notes.
  // Free sessions stay single-session — this is what "unlimited coaching"
  // buys beyond quantity: a coach that remembers. Exception: one free
  // taste, so the upgrade pitch is an experience instead of a bullet point.
  const memoryTasteAvailable =
    !subscription.isPremium && memoryTasteUsed === false;
  const previousSessionNotes = useMemo(() => {
    if (!subscription.isPremium && !memoryTasteAvailable) return undefined;
    const trim = (s: string, n: number) =>
      s.length > n ? `${s.slice(0, n).trimEnd()}…` : s;
    const notes = sortedReflections.slice(0, 2).map((r) => {
      let firstUser = "";
      let lastCoach = "";
      try {
        const convo = r.conversation
          ? (JSON.parse(r.conversation) as { role: string; content: string }[])
          : [];
        firstUser = convo.find((m) => m.role === "user")?.content ?? "";
        lastCoach =
          [...convo].reverse().find((m) => m.role === "assistant")?.content ??
          "";
      } catch {
        // Legacy sessions stored split fields only
      }
      if (!firstUser) firstUser = r.userInput?.split("\n")[0] ?? "";
      if (!lastCoach) lastCoach = r.aiFeedback?.split("\n").slice(-1)[0] ?? "";
      const when = new Date(r.createdAt).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      });
      const kind = r.periodType === "weekly" ? "weekly review" : "check-in";
      return `- ${when} (${kind}, momentum ${r.momentumScore}%): they opened with "${trim(firstUser, 200)}" and you closed with "${trim(lastCoach, 280)}"`;
    });
    return notes.length > 0 ? notes.join("\n") : undefined;
  }, [subscription.isPremium, memoryTasteAvailable, sortedReflections]);

  // Week numbers for the free Sunday-style weekly review ritual
  const weeklyContext = useMemo(() => {
    const { weeklyRecap, streak } = progressSnapshot;
    const [year, month, day] = weeklyRecap.weekKey.split("-").map(Number);
    const weekEnd = new Date(year, month - 1, day + 6);
    const weekEndKey = [
      weekEnd.getFullYear(),
      String(weekEnd.getMonth() + 1).padStart(2, "0"),
      String(weekEnd.getDate()).padStart(2, "0"),
    ].join("-");
    const inReviewedWeek = (date: string) =>
      date >= weeklyRecap.weekKey && date <= weekEndKey;
    return {
      weekStart: weeklyRecap.weekKey,
      weekEnd: weekEndKey,
      completed: weeklyRecap.lastWeek.completed,
      scheduled: weeklyRecap.lastWeek.scheduled,
      prevCompleted: weeklyRecap.prevWeek.completed,
      bestDay: weeklyRecap.lastWeek.bestDay,
      streak: streak.current,
      shieldsEarned: streak.shieldEarnedDays.filter(inReviewedWeek).length,
      shieldsUsed: streak.shieldedDays.filter(inReviewedWeek).length,
    };
  }, [progressSnapshot]);

  const actionContext = useMemo(
    () => buildCoachActionContext(actions, dailyLogs),
    [actions, dailyLogs],
  );

  // The user's own completion notes from the last 7 days — the coach quoting
  // their words back is the "it knows me" moment. Newest first, capped at 8.
  const recentNotes = useMemo(() => {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 7);
    cutoff.setHours(0, 0, 0, 0);
    const titleById = new Map(actions.map((a) => [a.id, a.title]));
    const lines = dailyLogs
      .filter((l) => l.status && l.note)
      .filter((l) => {
        const [y, m, d] = l.logDate.split("T")[0].split("-").map(Number);
        return new Date(y, m - 1, d) >= cutoff;
      })
      .sort((a, b) => (a.logDate < b.logDate ? 1 : -1))
      .slice(0, 8)
      .map((l) => {
        const [y, m, d] = l.logDate.split("T")[0].split("-").map(Number);
        const when = new Date(y, m - 1, d).toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
        });
        const title = titleById.get(l.actionId) ?? "an action";
        return `- ${when} · ${title}: "${l.note}"`;
      });
    return lines.length > 0 ? lines.join("\n") : undefined;
  }, [dailyLogs, actions]);

  const buildExtras = useCallback(
    (period: PeriodType): ReflectionExtras => ({
      weeklyContext: period === "weekly" ? weeklyContext : undefined,
      previousSessionNotes,
      recentNotes,
      actionContext,
      memoryTaste: memoryTasteAvailable && previousSessionNotes !== undefined,
      coachTone,
    }),
    [
      weeklyContext,
      previousSessionNotes,
      recentNotes,
      actionContext,
      memoryTasteAvailable,
      coachTone,
    ],
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

    // Weekly reviews are a free ritual — they never count against the 10
    // monthly check-ins, so the habit-forming loop is never the gated one.
    if (period === "monthly" && !canUseReflection()) {
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

    track(
      period === "weekly" ? "weekly_review_started" : "coach_session_started",
    );
    // The memory taste is spent the moment a session starts with it in play
    if (memoryTasteAvailable && previousSessionNotes !== undefined) {
      setMemoryTasteUsed(true);
      AsyncStorage.setItem(MEMORY_TASTE_USED_KEY, "true").catch(() => {});
    }

    coachRequestGenerationRef.current += 1;
    coachAbortControllerRef.current?.abort();
    coachAbortControllerRef.current = null;
    streamBufferRef.current?.cancel();
    coachOpeningStreamRef.current?.cancel();
    coachOpeningStreamRef.current = null;
    setSelectedPeriod(period);
    setIsInSession(true);
    setIsLoading(true);
    setIsStreaming(true);
    resetStreamingPreview();
    isNearBottomRef.current = true;
    isDraggingChatRef.current = false;
    isMomentumScrollingChatRef.current = false;
    setMessages([]);

    // Keep the first question deterministic and immediate, but reveal it with
    // the same typewriter pacing as the AI-led onboarding conversation.
    const openingMessage: ChatMessage = {
      id: Date.now().toString(),
      role: "assistant",
      content: buildCoachOpening({
        period,
        personaName: persona.name,
        monthlyConsistency: personaAlignment,
        daysSincePlanStarted: getMonthlyContext(
          personaAlignment,
          persona.createdAt,
        ).daysSincePersonaCreated,
        weekly: period === "weekly" ? weeklyContext : undefined,
      }),
    };
    const requestGeneration = coachRequestGenerationRef.current;
    coachOpeningStreamRef.current = startTextTypewriter(
      openingMessage.content,
      setStreamingText,
      () => {
        if (requestGeneration !== coachRequestGenerationRef.current) return;
        coachOpeningStreamRef.current = null;
        setMessages([openingMessage]);
        resetStreamingPreview();
        setIsStreaming(false);
        setIsLoading(false);
      },
    );
  };

  const requestCoachReply = async (conversation: ChatMessage[]) => {
    setIsLoading(true);
    setIsStreaming(true);
    resetStreamingPreview();
    isNearBottomRef.current = true;
    isDraggingChatRef.current = false;
    isMomentumScrollingChatRef.current = false;
    const streamBuffer = createStreamBuffer();
    const requestGeneration = coachRequestGenerationRef.current;
    coachAbortControllerRef.current?.abort();
    const abortController = new AbortController();
    coachAbortControllerRef.current = abortController;

    try {
      const aiMessages: AIMessage[] = conversation.map((m) => ({
        role: m.role,
        content: m.content,
      }));

      const monthlyContext = getMonthlyContext(
        personaAlignment,
        persona?.createdAt,
      );

      const response = await getReflectionResponse(
        aiMessages,
        momentumScore,
        selectedPeriod || "monthly",
        streamBuffer.append,
        monthlyContext,
        persona
          ? { name: persona.name, description: persona.description }
          : undefined,
        buildExtras(selectedPeriod || "monthly"),
        abortController.signal,
      );

      if (requestGeneration !== coachRequestGenerationRef.current) {
        streamBuffer.cancel();
        return;
      }
      if (coachAbortControllerRef.current === abortController) {
        coachAbortControllerRef.current = null;
      }

      finishStreamBuffer(streamBuffer);
      setIsStreaming(false);
      const aiMessage: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: response,
      };
      setMessages((prev) => [...prev, aiMessage]);
      resetStreamingPreview();
    } catch (error) {
      if (requestGeneration !== coachRequestGenerationRef.current) {
        streamBuffer.cancel();
        return;
      }
      if (error instanceof Error && error.name === "AbortError") {
        streamBuffer.cancel();
        return;
      }
      logger.error("Failed to send message:", error);
      streamBuffer.cancel();
      setIsStreaming(false);
      resetStreamingPreview();
    } finally {
      if (requestGeneration === coachRequestGenerationRef.current) {
        if (coachAbortControllerRef.current === abortController) {
          coachAbortControllerRef.current = null;
        }
        setIsLoading(false);
      }
    }
  };

  const sendMessage = async () => {
    if (!inputText.trim() || isLoading) return;

    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      role: "user",
      content: inputText.trim(),
    };
    const conversation = [...messages, userMessage];

    setMessages(conversation);
    setInputText("");

    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }

    await requestCoachReply(conversation);
  };

  const finishReflection = async () => {
    coachRequestGenerationRef.current += 1;
    coachAbortControllerRef.current?.abort();
    coachAbortControllerRef.current = null;
    streamBufferRef.current?.cancel();
    coachOpeningStreamRef.current?.cancel();
    coachOpeningStreamRef.current = null;
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

      // Weekly reviews are free and uncounted; only monthly check-ins spend
      // one of the 10 free slots.
      if (selectedPeriod === "monthly") {
        await incrementReflectionCount();
      }

      if (Platform.OS !== "web") {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    }

    setIsInSession(false);
    setSelectedPeriod(null);
    setMessages([]);
    setIsLoading(false);
    setIsStreaming(false);
    resetStreamingPreview();
  };

  const handleCloseSession = () => {
    if (messages.length === 0) {
      coachRequestGenerationRef.current += 1;
      coachAbortControllerRef.current?.abort();
      coachAbortControllerRef.current = null;
      streamBufferRef.current?.cancel();
      coachOpeningStreamRef.current?.cancel();
      coachOpeningStreamRef.current = null;
      setIsLoading(false);
      setIsStreaming(false);
      setIsInSession(false);
      setSelectedPeriod(null);
      resetStreamingPreview();
      return;
    }

    if (Platform.OS === "web") {
      if (window.confirm("Save this coaching session before closing?")) {
        finishReflection();
      } else {
        coachRequestGenerationRef.current += 1;
        coachAbortControllerRef.current?.abort();
        coachAbortControllerRef.current = null;
        streamBufferRef.current?.cancel();
        coachOpeningStreamRef.current?.cancel();
        coachOpeningStreamRef.current = null;
        setIsLoading(false);
        setIsStreaming(false);
        setIsInSession(false);
        setSelectedPeriod(null);
        setMessages([]);
        resetStreamingPreview();
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
              coachRequestGenerationRef.current += 1;
              coachAbortControllerRef.current?.abort();
              coachAbortControllerRef.current = null;
              streamBufferRef.current?.cancel();
              coachOpeningStreamRef.current?.cancel();
              coachOpeningStreamRef.current = null;
              setIsLoading(false);
              setIsStreaming(false);
              setIsInSession(false);
              setSelectedPeriod(null);
              setMessages([]);
              resetStreamingPreview();
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

  const renderMessage = useCallback(
    ({ item }: { item: ChatMessage }) => (
      <ChatBubble
        message={item.content}
        isUser={item.role === "user"}
        reportSurface="coach"
      />
    ),
    [],
  );

  const updateChatFollowState = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const { contentOffset, contentSize, layoutMeasurement } =
        event.nativeEvent;
      const distanceFromBottom =
        contentSize.height - layoutMeasurement.height - contentOffset.y;
      isNearBottomRef.current = distanceFromBottom <= 80;
    },
    [],
  );

  const handleChatScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      // Content growth and scrollToEnd both emit scroll events. Only a real
      // user gesture should be allowed to turn off automatic following.
      if (!isDraggingChatRef.current && !isMomentumScrollingChatRef.current) {
        return;
      }
      updateChatFollowState(event);
    },
    [updateChatFollowState],
  );

  const handleChatScrollBeginDrag = useCallback(() => {
    isDraggingChatRef.current = true;
  }, []);

  const handleChatScrollEndDrag = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      updateChatFollowState(event);
      isDraggingChatRef.current = false;
    },
    [updateChatFollowState],
  );

  const handleChatMomentumScrollBegin = useCallback(() => {
    isMomentumScrollingChatRef.current = true;
  }, []);

  const handleChatMomentumScrollEnd = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      updateChatFollowState(event);
      isMomentumScrollingChatRef.current = false;
    },
    [updateChatFollowState],
  );

  const scrollToEndIfNeeded = useCallback(() => {
    if (!isNearBottomRef.current) return;
    if (autoScrollFrameRef.current !== null) {
      cancelAnimationFrame(autoScrollFrameRef.current);
    }
    autoScrollFrameRef.current = requestAnimationFrame(() => {
      autoScrollFrameRef.current = null;
      chatScrollRef.current?.scrollToEnd({ animated: false });
    });
  }, []);

  useEffect(() => {
    if (!isInSession) return;
    // Fabric can commit a growing text bubble after the content-size event, so
    // every buffered update also follows after React has committed its height.
    scrollToEndIfNeeded();
  }, [isInSession, isStreaming, messages, scrollToEndIfNeeded, streamingText]);

  // Deep link from Today's weekly-recap card: auto-start the weekly review.
  // The timestamp param is single-use (tracked in a ref) so re-focusing the
  // tab later never relaunches a session.
  const handledWeeklyTriggerRef = useRef<number | null>(null);
  const startWeeklyTrigger = route.params?.startWeekly as number | undefined;
  useEffect(() => {
    if (!startWeeklyTrigger) return;
    if (handledWeeklyTriggerRef.current === startWeeklyTrigger) return;
    handledWeeklyTriggerRef.current = startWeeklyTrigger;
    if (!isInSession) {
      startReflection("weekly");
    }
    // startReflection is a stable plain function within this render scope;
    // the trigger timestamp is the only real dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startWeeklyTrigger]);

  if (!hasOnboarded) {
    return (
      <View
        style={[
          styles.container,
          {
            backgroundColor: theme.backgroundRoot,
            paddingTop: headerClearance + Spacing.xl,
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
      const pastSessionMessages: ChatMessage[] = hasFullConversation
        ? conversationMessages
        : [
            {
              id: `${session.id}-assistant`,
              role: "assistant",
              content: session.aiFeedback,
            },
            ...(session.userInput
              ? [
                  {
                    id: `${session.id}-user`,
                    role: "user" as const,
                    content: session.userInput,
                  },
                ]
              : []),
          ];

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
              { paddingTop: headerClearance + Spacing.sm },
            ]}
          >
            <Pressable
              onPress={() => setViewingPastSession(null)}
              hitSlop={12}
              pressRetentionOffset={16}
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
                  { color: theme.accent },
                ]}
              >
                {session.momentumScore}%
              </ThemedText>
            </View>
          </View>

          <FlatList
            data={pastSessionMessages}
            renderItem={renderMessage}
            keyExtractor={(message, index) =>
              message.id || `${session.id}-${index}`
            }
            delaysContentTouches={false}
            style={{ flex: 1 }}
            contentContainerStyle={[
              styles.messageList,
              { paddingBottom: tabBarHeight + Spacing.xl },
            ]}
            scrollIndicatorInsets={{ bottom: insets.bottom }}
            decelerationRate="fast"
            initialNumToRender={12}
            maxToRenderPerBatch={8}
            windowSize={7}
          />
        </View>
      );
    }
  }

  if (!isInSession) {
    return (
      <ScrollView
        delaysContentTouches={false}
        decelerationRate="fast"
        style={{ flex: 1, backgroundColor: theme.backgroundRoot }}
        contentContainerStyle={{
          paddingTop: headerClearance + Spacing.xl,
          paddingBottom: tabBarHeight + Spacing.xl,
          paddingHorizontal: Spacing.lg,
        }}
        scrollIndicatorInsets={{ bottom: insets.bottom }}
      >
        <View style={styles.header}>
          <ThemedText style={styles.title}>
            What do you need help with?
          </ThemedText>
          <ThemedText style={[styles.subtitle, { color: theme.textSecondary }]}>
            Talk through what is working, what feels hard, or what you want to
            change.
          </ThemedText>
        </View>

        <Pressable
          onPress={() => startReflection("monthly")}
          accessibilityRole="button"
          accessibilityLabel={
            canUseReflection()
              ? "Start a conversation with Coach"
              : "Free conversation limit reached. See Premium options."
          }
          style={({ pressed }) => [
            styles.conversationCard,
            {
              backgroundColor: isDark
                ? Colors.dark.backgroundDefault
                : Colors.light.backgroundDefault,
              borderColor: canUseReflection() ? theme.accent : theme.border,
            },
            { opacity: pressed ? 0.78 : 1 },
          ]}
        >
          <View
            style={[
              styles.conversationIcon,
              {
                backgroundColor: canUseReflection()
                  ? "rgba(0, 217, 255, 0.12)"
                  : isDark
                    ? Colors.dark.backgroundTertiary
                    : Colors.light.backgroundTertiary,
              },
            ]}
          >
            <Feather
              name={canUseReflection() ? "message-circle" : "lock"}
              size={24}
              color={canUseReflection() ? theme.accent : theme.textSecondary}
            />
          </View>
          <View style={styles.conversationCopy}>
            <ThemedText style={styles.conversationTitle}>
              {canUseReflection() ? "Start a conversation" : "Limit reached"}
            </ThemedText>
            <ThemedText
              style={[
                styles.conversationSubtitle,
                { color: theme.textSecondary },
              ]}
            >
              {canUseReflection()
                ? "Your coach starts with the evidence you have already recorded."
                : "Premium keeps the conversation open without a monthly cap."}
            </ThemedText>
            <ThemedText
              style={[
                styles.conversationAllowance,
                {
                  color:
                    !subscription.isPremium && monthlyReflectionCount >= 10
                      ? theme.error
                      : theme.accent,
                },
              ]}
            >
              {subscription.isPremium
                ? "Unlimited conversations"
                : `${Math.max(0, 10 - monthlyReflectionCount)} free this month`}
            </ThemedText>
          </View>
          <Feather name="chevron-right" size={20} color={theme.textSecondary} />
        </Pressable>

        <View style={styles.suggestionRow}>
          <Pressable
            onPress={() => startReflection("weekly")}
            accessibilityRole="button"
            accessibilityLabel="Review my week with Coach"
            style={({ pressed }) => [
              styles.suggestionCard,
              {
                backgroundColor: isDark
                  ? Colors.dark.backgroundDefault
                  : Colors.light.backgroundDefault,
                opacity: pressed ? 0.75 : 1,
              },
            ]}
          >
            <Feather name="rotate-ccw" size={20} color={theme.accent} />
            <ThemedText style={styles.suggestionTitle}>
              Review my week
            </ThemedText>
            <ThemedText
              style={[styles.suggestionHint, { color: theme.textSecondary }]}
            >
              Free
            </ThemedText>
          </Pressable>

          {actions.length > 0 ? (
            <Pressable
              onPress={() => navigation.navigate("PlanTuneUp")}
              accessibilityRole="button"
              accessibilityLabel="Adjust my plan with Coach"
              style={({ pressed }) => [
                styles.suggestionCard,
                {
                  backgroundColor: isDark
                    ? Colors.dark.backgroundDefault
                    : Colors.light.backgroundDefault,
                  opacity: pressed ? 0.75 : 1,
                },
              ]}
            >
              <Feather name="refresh-cw" size={20} color={theme.accent} />
              <ThemedText style={styles.suggestionTitle}>
                Adjust my plan
              </ThemedText>
              <ThemedText
                style={[styles.suggestionHint, { color: theme.textSecondary }]}
              >
                Preview first
              </ThemedText>
            </Pressable>
          ) : null}
        </View>

        {sortedReflections.length > 0 ? (
          <>
            <ThemedText
              style={[styles.sectionTitle, { marginTop: Spacing.xl }]}
            >
              Past conversations
            </ThemedText>
            {sortedReflections.slice(0, 3).map((reflection) => (
              <Pressable
                key={reflection.id}
                onPress={() => setViewingPastSession(reflection.id)}
                accessibilityRole="button"
                accessibilityLabel={`Open conversation from ${formatDate(reflection.createdAt)}`}
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
                    color={theme.accent}
                  />
                </View>
                <View style={styles.pastSessionContent}>
                  <ThemedText style={styles.pastSessionDate}>
                    {formatDate(reflection.createdAt)}
                    {reflection.periodType === "weekly" ? " · Week review" : ""}
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
        style={[
          styles.chatHeader,
          { paddingTop: headerClearance + Spacing.sm },
        ]}
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
          {selectedPeriod === "weekly" ? "Weekly Review" : "Monthly Check-in"}
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
          <ThemedText style={[styles.doneButtonText, { color: theme.accent }]}>
            Save
          </ThemedText>
        </Pressable>
      </View>

      <ScrollView
        ref={chatScrollRef}
        style={styles.chatMessageList}
        contentContainerStyle={[styles.messageList, { paddingBottom: 80 }]}
        onContentSizeChange={scrollToEndIfNeeded}
        onLayout={scrollToEndIfNeeded}
        onScroll={handleChatScroll}
        onScrollBeginDrag={handleChatScrollBeginDrag}
        onScrollEndDrag={handleChatScrollEndDrag}
        onMomentumScrollBegin={handleChatMomentumScrollBegin}
        onMomentumScrollEnd={handleChatMomentumScrollEnd}
        scrollEventThrottle={16}
        decelerationRate="fast"
        keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
        keyboardShouldPersistTaps="handled"
      >
        {messages.map((message) => (
          <ChatBubble
            key={message.id}
            message={message.content}
            isUser={message.role === "user"}
            reportSurface="coach"
          />
        ))}
        {isStreaming && streamingText ? (
          <ChatBubble message={streamingText} isUser={false} isTyping />
        ) : isLoading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="small" color={theme.accent} />
          </View>
        ) : null}
      </ScrollView>

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
          accessibilityLabel={
            isLoading ? "Coach is typing" : "Message to your AI coach"
          }
          accessibilityState={{ disabled: isLoading, busy: isLoading }}
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
                  ? theme.accent
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
  conversationCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    padding: Spacing.xl,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    marginBottom: Spacing.md,
  },
  conversationIcon: {
    width: 48,
    height: 48,
    borderRadius: BorderRadius.full,
    alignItems: "center",
    justifyContent: "center",
  },
  conversationCopy: {
    flex: 1,
  },
  conversationTitle: {
    ...Typography.headline,
    marginBottom: Spacing.xs,
  },
  conversationSubtitle: {
    ...Typography.small,
    lineHeight: 20,
  },
  conversationAllowance: {
    ...Typography.caption,
    fontWeight: "600",
    marginTop: Spacing.sm,
  },
  suggestionRow: {
    flexDirection: "row",
    gap: Spacing.sm,
    marginBottom: Spacing.xl,
  },
  suggestionCard: {
    flex: 1,
    minHeight: 112,
    justifyContent: "space-between",
    padding: Spacing.lg,
    borderRadius: BorderRadius.md,
  },
  suggestionTitle: {
    ...Typography.body,
    fontWeight: "600",
    marginTop: Spacing.md,
  },
  suggestionHint: {
    ...Typography.caption,
    marginTop: Spacing.xs,
  },
  sectionTitle: {
    ...Typography.headline,
    marginBottom: Spacing.md,
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
  chatMessageList: {
    flex: 1,
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
