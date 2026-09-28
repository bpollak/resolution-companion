import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Alert,
  KeyboardAvoidingView,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import { useNavigation, useRoute } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useApp } from "@/context/AppContext";
import { useTheme } from "@/hooks/useTheme";
import { BorderRadius, Colors, Spacing, Typography } from "@/constants/theme";
import { ThemedText } from "@/components/ThemedText";
import { ChatBubble } from "@/components/ChatBubble";
import { CoachEvidenceCard } from "@/components/CoachEvidenceCard";
import { AIConsentModal } from "@/components/AIConsentModal";
import {
  getMonthlyContext,
  getReflectionResponse,
  type AIMessage,
} from "@/lib/ai";
import {
  buildCoachActionContext,
  buildPreviousSessionNotes,
  buildRecentNotes,
  getMemoryTasteUsed,
  markMemoryTasteUsed,
} from "@/lib/coach";
import { createReplyLifecycle } from "@/lib/coach-reply";
import {
  createTextStreamBuffer,
  type TextStreamBuffer,
} from "@/lib/stream-buffer";
import { getCoachTone } from "@/lib/rewards";
import {
  buildPlanTuneUpRequest,
  requestPlanTuneUp,
  type PlanTuneUpSuggestion,
} from "@/lib/plan-tune-up";
import { track } from "@/lib/telemetry";
import { logger } from "@/lib/logger";
import {
  coachRequestAllowed,
  shouldConsumeCoachSession,
} from "@/lib/coach-quota";
import type { CoachEvidenceSnapshot, CoachEntryOrigin } from "@/lib/storage";
import type { CoachSheetParams } from "@/navigation/RootStackNavigator";
import { getLocalDateString } from "@/lib/progress";

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
}

const PROMPTS = {
  "start-today": "Help me get started with today’s next action.",
  "understand-pattern": "Help me understand what is making this pattern work.",
  "reduce-friction": "Help me make this plan easier without giving it up.",
  "review-week":
    "Help me review one win and one point of friction from last week.",
  "reflect-success": "Help me name what made today work.",
} as const;

function originLabel(origin: CoachEntryOrigin): string {
  if (origin === "journey-discovery") return "Journey discovery";
  if (origin === "lapse-recovery") return "A gentler restart";
  if (origin === "milestone") return "Milestone evidence";
  if (origin === "recap") return "Progress recap";
  if (origin === "action") return "Action evidence";
  if (origin === "today-signal") return "Today’s signal";
  return "Your recent evidence";
}

function planFieldValue(
  action: { frequency: string[]; anchorLink: string; kickstartVersion: string },
  field: string,
): string {
  const value =
    field === "frequency"
      ? action.frequency
      : field === "anchorLink"
        ? action.anchorLink
        : action.kickstartVersion;
  return Array.isArray(value) ? value.join(", ") : value;
}

export default function CoachSheetScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const params = route.params as CoachSheetParams;
  const { theme, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const {
    persona,
    benchmarks,
    actions,
    dailyLogs,
    personaAlignment,
    momentumScore,
    progressSnapshot,
    subscription,
    aiConsent,
    setAiConsent,
    canUseReflection,
    incrementReflectionCount,
    addReflection,
    applyPlanAdjustment,
    dismissPlanAdjustment,
    reflections,
  } = useApp();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState("");
  const [streamingText, setStreamingText] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [replyError, setReplyError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const savingRef = useRef(false);
  const retryRef = useRef<ChatMessage[] | null>(null);
  const replyLifecycle = useRef(createReplyLifecycle()).current;
  const bufferRef = useRef<TextStreamBuffer | null>(null);
  const messagesRef = useRef<ChatMessage[]>([]);
  messagesRef.current = messages;
  const [showConsent, setShowConsent] = useState(false);
  const [pendingText, setPendingText] = useState<string | null>(null);
  const [planSuggestion, setPlanSuggestion] =
    useState<PlanTuneUpSuggestion | null>(null);
  const [planError, setPlanError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [detentIndex, setDetentIndex] = useState(0);
  const savedRef = useRef(false);
  const countedRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<ScrollView>(null);
  const nearBottomRef = useRef(true);

  useEffect(
    () =>
      navigation.addListener("sheetDetentChange", (event: any) => {
        if (typeof event.data?.index === "number")
          setDetentIndex(event.data.index);
      }),
    [navigation],
  );

  // Free users get to experience coach memory exactly once before the gate —
  // null until the persisted flag loads (memory stays off that first render)
  const [memoryTasteUsed, setMemoryTasteUsed] = useState<boolean | null>(null);
  useEffect(() => {
    track("coach_sheet_opened");
    getMemoryTasteUsed()
      .then(setMemoryTasteUsed)
      .catch(() => setMemoryTasteUsed(true));
    return () => {
      bufferRef.current?.cancel();
      replyLifecycle.stop();
      abortRef.current?.abort();
      abortRef.current = null;
    };
  }, [replyLifecycle]);

  // Premium coach memory: the coach's own notes from the two most recent
  // saved sessions, plus the user's completion notes from the last 7 days.
  // Free sessions stay single-session apart from one demonstrative taste.
  const memoryTasteAvailable =
    !subscription.isPremium && memoryTasteUsed === false;
  const previousSessionNotes = useMemo(
    () =>
      subscription.isPremium || memoryTasteAvailable
        ? buildPreviousSessionNotes(reflections)
        : undefined,
    [subscription.isPremium, memoryTasteAvailable, reflections],
  );
  const recentNotes = useMemo(
    () => buildRecentNotes(actions, dailyLogs),
    [actions, dailyLogs],
  );

  const selectedAction = useMemo(
    () => actions.find((action) => action.id === params.actionId) ?? actions[0],
    [actions, params.actionId],
  );
  const selectedBenchmark = useMemo(
    () =>
      benchmarks.find((benchmark) => benchmark.id === params.benchmarkId) ??
      null,
    [benchmarks, params.benchmarkId],
  );
  const evidence = useMemo<CoachEvidenceSnapshot>(() => {
    if (params.origin === "milestone" && selectedBenchmark) {
      const milestone = progressSnapshot.milestoneProgressByBenchmarkId.get(
        selectedBenchmark.id,
      );
      return {
        eyebrow: originLabel(params.origin),
        headline: selectedBenchmark.title,
        detail: `${milestone?.daysDone ?? 0} of ${milestone?.target ?? 0} completion days recorded. Milestone progress only fills; a harder day never takes evidence away.`,
        value: `${milestone?.daysDone ?? 0}/${milestone?.target ?? 0}`,
        trend: "steady",
      };
    }
    if (params.origin === "today-signal") {
      const today = new Date();
      const todayKey = getLocalDateString(today);
      const weekday = today.toLocaleDateString("en-US", { weekday: "long" });
      const scheduled = actions.filter((action) =>
        action.frequency.includes(weekday),
      );
      const completed = scheduled.filter((action) =>
        dailyLogs.some(
          (log) =>
            log.actionId === action.id &&
            log.logDate.split("T")[0] === todayKey &&
            log.status,
        ),
      ).length;
      return {
        eyebrow: originLabel(params.origin),
        headline:
          scheduled.length === 0
            ? "Recovery is part of the plan"
            : completed === scheduled.length
              ? "Today’s plan is complete"
              : `${scheduled.length - completed} action${scheduled.length - completed === 1 ? "" : "s"} still available`,
        detail: `${completed} of ${scheduled.length} scheduled actions completed today. This is evidence, not a grade.`,
        value: `${completed}/${scheduled.length}`,
        trend: "steady",
      };
    }
    if (selectedAction && params.actionId) {
      const recent = dailyLogs.filter(
        (log) => log.actionId === selectedAction.id && log.status,
      );
      const kickstarts = recent.filter(
        (log) => log.completionKind === "kickstart",
      ).length;
      return {
        eyebrow: originLabel(params.origin),
        headline: selectedAction.title,
        detail: `${recent.length} completed days recorded. Its two-minute version is “${selectedAction.kickstartVersion}.”`,
        value:
          kickstarts > 0
            ? `${kickstarts} kickstarts`
            : `${momentumScore}% momentum`,
      };
    }
    return {
      eyebrow: originLabel(params.origin),
      headline:
        params.origin === "lapse-recovery"
          ? "The plan can bend"
          : "Start with the evidence you already have",
      detail: `${persona?.name ?? "Who you’re becoming"} is at ${personaAlignment}% consistency this month. That number is a signal, not a grade.`,
      value: `${personaAlignment}%`,
      trend: "steady",
    };
  }, [
    actions,
    selectedBenchmark,
    selectedAction,
    params,
    dailyLogs,
    momentumScore,
    persona,
    personaAlignment,
    progressSnapshot.milestoneProgressByBenchmarkId,
  ]);

  const suggestionChips = useMemo(() => {
    const first = params.promptId ? PROMPTS[params.promptId] : null;
    const originPrompts =
      params.origin === "action" || params.origin === "lapse-recovery"
        ? [PROMPTS["reduce-friction"], PROMPTS["start-today"]]
        : params.origin === "milestone"
          ? [PROMPTS["reflect-success"], PROMPTS["understand-pattern"]]
          : params.origin === "recap"
            ? [PROMPTS["review-week"], PROMPTS["reflect-success"]]
            : params.origin === "today-signal"
              ? [PROMPTS["start-today"], PROMPTS["reduce-friction"]]
              : params.origin === "journey-discovery"
                ? [PROMPTS["understand-pattern"], PROMPTS["reduce-friction"]]
                : params.promptId === "reduce-friction"
                  ? [PROMPTS["reduce-friction"], PROMPTS["start-today"]]
                  : [PROMPTS["reflect-success"], PROMPTS["review-week"]];
    return Array.from(new Set([first, ...originPrompts].filter(Boolean))).slice(
      0,
      2,
    ) as string[];
  }, [params.origin, params.promptId]);
  // The lobby is a single entry point now, so plan tune-ups must also be
  // reachable from a plain "direct" conversation
  const showPlanAdjustment =
    params.origin === "lapse-recovery" ||
    params.origin === "action" ||
    params.origin === "direct" ||
    params.promptId === "reduce-friction";

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

  const markCounted = useCallback(
    async (force = false) => {
      if (
        !shouldConsumeCoachSession({
          successfulResponse: true,
          isWeeklyReview: params.promptId === "review-week",
          alreadyCounted: countedRef.current,
          isPremium: subscription.isPremium,
          isPlanTuneUp: force,
        })
      )
        return;
      countedRef.current = true;
      await incrementReflectionCount();
    },
    [incrementReflectionCount, params.promptId, subscription.isPremium],
  );

  const requestReply = useCallback(
    async (text: string, retryConversation?: ChatMessage[]) => {
      if (!persona || abortRef.current || savingRef.current) return;
      if (
        !coachRequestAllowed({
          isWeeklyReview: params.promptId === "review-week",
          alreadyCounted: countedRef.current,
          isPremium: subscription.isPremium,
          hasFreeSession: canUseReflection(),
        })
      ) {
        navigation.navigate("Subscription", { source: "coach-limit" });
        return;
      }
      const userMessage: ChatMessage = {
        id: `${Date.now()}-user`,
        role: "user",
        content: text.trim(),
      };
      if (!userMessage.content) return;
      const conversation = retryConversation ?? [
        ...messagesRef.current,
        userMessage,
      ];
      messagesRef.current = conversation;
      setMessages(conversation);
      retryRef.current = conversation;
      setReplyError(null);
      setInputText("");
      setIsLoading(true);
      setStreamingText("");
      track("coach_context_prompt_sent");
      // The memory taste is spent the moment a request goes out with it in play
      if (memoryTasteAvailable && previousSessionNotes !== undefined) {
        setMemoryTasteUsed(true);
        markMemoryTasteUsed();
      }
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      const controller = replyLifecycle.begin(conversation);
      abortRef.current = controller;
      const buffer = createTextStreamBuffer((chunk) => {
        const visible = replyLifecycle.append(controller, chunk);
        if (visible !== null) setStreamingText(visible);
      });
      bufferRef.current = buffer;
      try {
        const aiMessages: AIMessage[] = conversation.map((message) => ({
          role: message.role,
          content: message.content,
        }));
        const response = await getReflectionResponse(
          aiMessages,
          momentumScore,
          params.promptId === "review-week" ? "weekly" : "contextual",
          buffer.append,
          getMonthlyContext(personaAlignment, persona.createdAt),
          {
            name: persona.name,
            description: persona.description,
            resolution: persona.resolution,
          },
          {
            actionContext: buildCoachActionContext(actions, dailyLogs),
            coachTone: await getCoachTone(),
            weeklyContext:
              params.promptId === "review-week" ? weeklyContext : undefined,
            previousSessionNotes,
            recentNotes,
            memoryTaste:
              memoryTasteAvailable && previousSessionNotes !== undefined,
          },
          controller.signal,
        );
        if (abortRef.current !== controller) return;
        buffer.flush();
        const completed = replyLifecycle.complete(controller, response);
        if (!completed) return;
        messagesRef.current = completed;
        setMessages(completed);
        setStreamingText("");
        retryRef.current = null;
        await markCounted();
      } catch (error) {
        if (abortRef.current !== controller) return;
        buffer.flush();
        const interrupted = replyLifecycle.stop();
        if (interrupted) {
          messagesRef.current = interrupted.messages;
          setMessages(interrupted.messages);
          retryRef.current = interrupted.retry;
        }
        setStreamingText("");
        logger.warn("Contextual coach interrupted:", error);
        setReplyError(
          "Coach could not finish the reply. Your message and any partial response are kept. Retry will replace the partial reply.",
        );
      } finally {
        buffer.cancel();
        if (bufferRef.current === buffer) bufferRef.current = null;
        if (abortRef.current === controller) {
          abortRef.current = null;
          setIsLoading(false);
        }
      }
    },
    [
      actions,
      canUseReflection,
      dailyLogs,
      markCounted,
      replyLifecycle,
      memoryTasteAvailable,
      momentumScore,
      navigation,
      params.promptId,
      persona,
      personaAlignment,
      previousSessionNotes,
      recentNotes,
      subscription.isPremium,
      weeklyContext,
    ],
  );

  const sendOrAskConsent = (text: string) => {
    if (!aiConsent) {
      setPendingText(text);
      setShowConsent(true);
      return;
    }
    requestReply(text);
  };

  const requestTuneUp = async (consentOverride = false) => {
    if (!persona || abortRef.current || savingRef.current) return;
    if (!aiConsent && !consentOverride) {
      setPendingText("__plan_tune_up__");
      setShowConsent(true);
      return;
    }
    if (
      !coachRequestAllowed({
        isWeeklyReview: params.promptId === "review-week",
        alreadyCounted: countedRef.current,
        isPremium: subscription.isPremium,
        hasFreeSession: canUseReflection(),
        isPlanTuneUp: true,
      })
    ) {
      navigation.navigate("Subscription", { source: "coach-limit" });
      return;
    }
    setIsLoading(true);
    setPlanError(null);
    const controller = new AbortController();
    abortRef.current = controller;
    const timeout = setTimeout(() => controller.abort(), 20_000);
    try {
      const request = buildPlanTuneUpRequest({
        actions,
        logs: dailyLogs,
        personaCreatedAt: persona.createdAt,
        monthlyConsistency: personaAlignment,
      });
      const suggestion = await requestPlanTuneUp(request, controller.signal);
      if (abortRef.current !== controller) return;
      setPlanSuggestion(suggestion);
      track("plan_tuneup_previewed");
      await markCounted(true);
    } catch (error) {
      if (abortRef.current !== controller) return;
      setPlanError(
        error instanceof Error && error.name === "AbortError"
          ? "Plan guidance timed out. Your plan was not changed."
          : error instanceof Error
            ? error.message
            : "Plan guidance is unavailable.",
      );
    } finally {
      clearTimeout(timeout);
      if (abortRef.current === controller) {
        abortRef.current = null;
        setIsLoading(false);
      }
    }
  };

  const applySuggestion = async () => {
    if (!planSuggestion) return;
    const action = actions[planSuggestion.slot];
    if (!action) return;
    const applied = await applyPlanAdjustment(
      action.id,
      planSuggestion.changes,
      planSuggestion.rationale,
    );
    if (!applied) return;
    setMessages((previous) => [
      ...previous,
      {
        id: `${Date.now()}-assistant`,
        role: "assistant",
        content: `Your plan was updated after you reviewed the changes. ${planSuggestion.rationale}`,
      },
    ]);
    setPlanSuggestion(null);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(
      () => {},
    );
  };

  const dismissSuggestion = async () => {
    if (planSuggestion && suggestionAction) {
      await dismissPlanAdjustment(
        suggestionAction.id,
        planSuggestion.changes,
        planSuggestion.rationale,
      );
    }
    setPlanSuggestion(null);
  };

  const stopReply = useCallback(
    (saving = false) => {
      bufferRef.current?.flush();
      bufferRef.current?.cancel();
      bufferRef.current = null;
      const interrupted = replyLifecycle.stop();
      abortRef.current?.abort();
      abortRef.current = null;
      setIsLoading(false);
      setStreamingText("");
      if (interrupted) {
        messagesRef.current = interrupted.messages;
        setMessages(interrupted.messages);
        retryRef.current = interrupted.retry;
        if (!saving)
          setReplyError(
            "Response stopped. Your message and any partial reply are kept. Retry will replace the partial reply.",
          );
      } else if (!saving) setPlanError("Stopped. Your plan has not changed.");
      return interrupted?.messages ?? messagesRef.current;
    },
    [replyLifecycle],
  );

  const saveSession = useCallback(async () => {
    if (savingRef.current || savedRef.current) return;
    savingRef.current = true;
    setIsSaving(true);
    const transcript = stopReply(true);
    try {
      if (persona && transcript.length > 0) {
        await addReflection({
          personaId: persona.id,
          periodType:
            params.promptId === "review-week" ? "weekly" : "contextual",
          origin: params.origin,
          evidenceSnapshot: evidence,
          userInput: transcript
            .filter((message) => message.role === "user")
            .map((message) => message.content)
            .join("\n"),
          aiFeedback: transcript
            .filter((message) => message.role === "assistant")
            .map((message) => message.content)
            .join("\n"),
          momentumScore,
          conversation: JSON.stringify(transcript),
        });
        track("coach_context_session_saved");
      }
      savedRef.current = true;
      setSaved(true);
      navigation.goBack();
    } catch (error) {
      logger.warn("Coaching session could not be saved:", error);
      setReplyError(
        "Your conversation is still here. Saving failed; please tap Save to retry.",
      );
    } finally {
      savingRef.current = false;
      setIsSaving(false);
    }
  }, [
    addReflection,
    evidence,
    momentumScore,
    navigation,
    params.origin,
    params.promptId,
    persona,
    stopReply,
  ]);

  useEffect(() => {
    const unsubscribe = navigation.addListener("beforeRemove", (event: any) => {
      if (savingRef.current && !savedRef.current) {
        event.preventDefault();
        return;
      }
      if (savedRef.current || saved || messages.length === 0) return;
      event.preventDefault();
      Alert.alert(
        "Save this conversation?",
        "Keep this coaching session in your history.",
        [
          { text: "Keep talking", style: "cancel" },
          {
            text: "Discard",
            style: "destructive",
            onPress: () => {
              stopReply(true);
              savedRef.current = true;
              setSaved(true);
              navigation.dispatch(event.data.action);
            },
          },
          { text: "Save", onPress: saveSession },
        ],
      );
    });
    return unsubscribe;
  }, [messages.length, navigation, saveSession, saved, stopReply]);

  const updateScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
    nearBottomRef.current =
      contentSize.height - layoutMeasurement.height - contentOffset.y <= 80;
  };
  useEffect(() => {
    if ((messages.length > 0 || streamingText) && nearBottomRef.current)
      scrollRef.current?.scrollToEnd({ animated: false });
  }, [messages, streamingText]);
  useEffect(() => {
    if (!planSuggestion) return;
    requestAnimationFrame(() =>
      scrollRef.current?.scrollToEnd({ animated: true }),
    );
  }, [planSuggestion]);

  const suggestionAction = planSuggestion ? actions[planSuggestion.slot] : null;
  const sheetHeight = Math.round(
    (windowHeight - (Platform.OS === "ios" ? insets.top : 0)) *
      (detentIndex === 0 ? 0.55 : 0.94),
  );
  const composerClearance =
    44 + Spacing.sm + Math.max(insets.bottom, Spacing.md) + Spacing.lg;

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: theme.backgroundRoot }]}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <View
        style={[
          styles.sheetContent,
          { height: sheetHeight, backgroundColor: theme.backgroundRoot },
        ]}
      >
        <ScrollView
          ref={scrollRef}
          stickyHeaderIndices={[0]}
          delaysContentTouches={false}
          style={styles.scroll}
          contentContainerStyle={{ paddingBottom: composerClearance }}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode={
            Platform.OS === "ios" ? "interactive" : "on-drag"
          }
          contentInsetAdjustmentBehavior="never"
          onScroll={updateScroll}
          scrollEventThrottle={16}
          decelerationRate="fast"
        >
          <View style={{ backgroundColor: theme.backgroundRoot }}>
            <View
              style={[
                styles.header,
                {
                  backgroundColor: theme.backgroundRoot,
                  borderBottomColor: theme.border,
                },
              ]}
            >
              <Pressable
                onPress={() => navigation.goBack()}
                disabled={isSaving}
                accessibilityState={{ disabled: isSaving }}
                hitSlop={12}
                accessibilityRole="button"
                accessibilityLabel="Close Coach"
                style={({ pressed }) => [
                  styles.headerButton,
                  { opacity: pressed ? 0.55 : 1 },
                ]}
              >
                <Feather name="x" size={23} color={theme.text} />
              </Pressable>
              <ThemedText style={styles.headerTitle}>Coach</ThemedText>
              <Pressable
                onPress={saveSession}
                disabled={isSaving}
                hitSlop={12}
                pressRetentionOffset={12}
                accessibilityState={{ disabled: isSaving, busy: isSaving }}
                accessibilityRole="button"
                accessibilityLabel={
                  isLoading
                    ? "Stop response and save coaching session, including partial text"
                    : "Save coaching session"
                }
                style={({ pressed }) => [
                  styles.headerButton,
                  { opacity: pressed ? 0.55 : 1 },
                ]}
              >
                <ThemedText style={[styles.saveText, { color: theme.accent }]}>
                  {isSaving ? "Saving…" : isLoading ? "Stop & save" : "Save"}
                </ThemedText>
              </Pressable>
            </View>
          </View>
          <CoachEvidenceCard evidence={evidence} />
          {messages.length === 0 ? (
            <View style={styles.chips}>
              {suggestionChips.map((prompt, index) => (
                <Pressable
                  key={prompt}
                  onPress={() => sendOrAskConsent(prompt)}
                  accessibilityRole="button"
                  accessibilityLabel={prompt}
                  style={({ pressed }) => [
                    styles.chip,
                    {
                      borderColor: index === 0 ? theme.accent : theme.border,
                      backgroundColor:
                        index === 0
                          ? `${theme.accent}1A`
                          : isDark
                            ? Colors.dark.backgroundSecondary
                            : Colors.light.backgroundSecondary,
                      opacity: pressed ? 0.65 : 1,
                    },
                  ]}
                >
                  <ThemedText style={styles.chipText}>{prompt}</ThemedText>
                </Pressable>
              ))}
              {showPlanAdjustment ? (
                <Pressable
                  onPress={() => requestTuneUp()}
                  accessibilityRole="button"
                  accessibilityLabel="Request a previewed plan adjustment"
                  style={({ pressed }) => [
                    styles.chip,
                    { borderColor: theme.accent, opacity: pressed ? 0.65 : 1 },
                  ]}
                >
                  <Feather name="repeat" size={15} color={theme.accent} />
                  <ThemedText
                    style={[styles.chipText, { color: theme.accent }]}
                  >
                    Adjust my plan · Preview first
                  </ThemedText>
                </Pressable>
              ) : null}
            </View>
          ) : null}
          {messages.map((message) => (
            <ChatBubble
              key={message.id}
              message={message.content}
              isUser={message.role === "user"}
              reportSurface="coach"
            />
          ))}
          {streamingText ? (
            <ChatBubble message={streamingText} isUser={false} isTyping />
          ) : null}
          {isLoading ? (
            <View style={styles.planCard}>
              <ThemedText accessibilityLiveRegion="polite">
                {streamingText ? "Coach is responding…" : "Coach is thinking…"}
              </ThemedText>
              <Pressable
                onPress={() => stopReply()}
                accessibilityRole="button"
                accessibilityLabel="Stop Coach response"
                hitSlop={8}
                pressRetentionOffset={12}
                style={({ pressed }) => ({
                  minHeight: 44,
                  justifyContent: "center",
                  opacity: pressed ? 0.6 : 1,
                })}
              >
                <ThemedText style={{ color: theme.accent }}>
                  Stop response
                </ThemedText>
              </Pressable>
            </View>
          ) : null}
          {replyError ? (
            <View style={styles.planCard}>
              <ThemedText
                accessibilityRole="alert"
                accessibilityLiveRegion="polite"
                style={{ color: theme.textSecondary }}
              >
                {replyError}
              </ThemedText>
              {retryRef.current ? (
                <Pressable
                  onPress={() => {
                    const conversation = retryRef.current;
                    if (!conversation) return;
                    if (!aiConsent) {
                      setPendingText("__retry_reply__");
                      setShowConsent(true);
                    } else
                      void requestReply(
                        conversation.at(-1)?.content ?? "",
                        conversation,
                      );
                  }}
                  disabled={isLoading || isSaving}
                  accessibilityRole="button"
                  accessibilityLabel="Retry Coach response"
                  hitSlop={8}
                  pressRetentionOffset={12}
                  style={({ pressed }) => ({
                    minHeight: 44,
                    justifyContent: "center",
                    opacity: pressed ? 0.6 : 1,
                  })}
                >
                  <ThemedText style={{ color: theme.accent }}>
                    Retry reply
                  </ThemedText>
                </Pressable>
              ) : null}
            </View>
          ) : null}
          {planSuggestion && suggestionAction ? (
            <View
              onLayout={() =>
                scrollRef.current?.scrollToEnd({ animated: true })
              }
              style={[
                styles.planCard,
                {
                  borderColor: theme.accent,
                  backgroundColor: isDark
                    ? Colors.dark.backgroundDefault
                    : Colors.light.backgroundDefault,
                },
              ]}
            >
              <ThemedText style={[styles.planEyebrow, { color: theme.accent }]}>
                Preview changes
              </ThemedText>
              <ThemedText style={styles.planTitle}>
                {suggestionAction.title}
              </ThemedText>
              {Object.entries(planSuggestion.changes).map(([field, value]) => (
                <View key={field} style={styles.diffRow}>
                  <ThemedText
                    style={[styles.diffLabel, { color: theme.textSecondary }]}
                  >
                    {field === "frequency"
                      ? "Days"
                      : field === "anchorLink"
                        ? "When"
                        : "2-minute version"}
                  </ThemedText>
                  <View style={styles.diffValues}>
                    <ThemedText
                      style={[
                        styles.beforeValue,
                        { color: theme.textSecondary },
                      ]}
                    >
                      Before: {planFieldValue(suggestionAction, field)}
                    </ThemedText>
                    <ThemedText style={styles.diffValue}>
                      After: {Array.isArray(value) ? value.join(", ") : value}
                    </ThemedText>
                  </View>
                </View>
              ))}
              <ThemedText
                style={[styles.rationale, { color: theme.textSecondary }]}
              >
                {planSuggestion.rationale}
              </ThemedText>
              <View style={styles.planActions}>
                <Pressable
                  onPress={dismissSuggestion}
                  accessibilityRole="button"
                  accessibilityLabel="Keep current plan"
                  style={({ pressed }) => [
                    styles.secondaryButton,
                    { borderColor: theme.border, opacity: pressed ? 0.6 : 1 },
                  ]}
                >
                  <ThemedText style={styles.secondaryText}>
                    Keep current
                  </ThemedText>
                </Pressable>
                <Pressable
                  onPress={applySuggestion}
                  accessibilityRole="button"
                  accessibilityLabel="Apply previewed plan changes"
                  style={({ pressed }) => [
                    styles.applyButton,
                    {
                      backgroundColor: theme.accent,
                      opacity: pressed ? 0.75 : 1,
                    },
                  ]}
                >
                  <ThemedText
                    style={[styles.applyText, { color: theme.buttonText }]}
                  >
                    Apply changes
                  </ThemedText>
                </Pressable>
              </View>
            </View>
          ) : null}
          {planError ? (
            <ThemedText style={[styles.error, { color: theme.error }]}>
              {planError}
            </ThemedText>
          ) : null}
        </ScrollView>
        <View
          style={[
            styles.composer,
            {
              paddingBottom: Math.max(insets.bottom, Spacing.md),
              borderTopColor: theme.border,
              // Opaque bar — chat text must never show through the composer
              backgroundColor: theme.backgroundRoot,
            },
          ]}
        >
          <TextInput
            value={inputText}
            onChangeText={setInputText}
            placeholder="Write to Coach"
            placeholderTextColor={theme.textSecondary}
            multiline
            editable={!isLoading && !isSaving}
            accessibilityLabel="Message Coach"
            style={[
              styles.input,
              { color: theme.text, backgroundColor: theme.backgroundSecondary },
            ]}
          />
          <Pressable
            onPress={() => sendOrAskConsent(inputText)}
            disabled={!inputText.trim() || isLoading || isSaving}
            accessibilityRole="button"
            accessibilityLabel="Send message to Coach"
            style={({ pressed }) => [
              styles.send,
              {
                backgroundColor: inputText.trim() ? theme.accent : theme.border,
                opacity: pressed ? 0.7 : 1,
              },
            ]}
          >
            <Feather name="arrow-up" size={20} color={theme.buttonText} />
          </Pressable>
        </View>
      </View>
      <AIConsentModal
        visible={showConsent}
        onDecline={() => {
          setShowConsent(false);
          setPendingText(null);
        }}
        onAgree={async () => {
          await setAiConsent(true);
          setShowConsent(false);
          const pending = pendingText;
          setPendingText(null);
          if (pending === "__retry_reply__" && retryRef.current)
            requestReply(
              retryRef.current.at(-1)?.content ?? "",
              retryRef.current,
            );
          else if (pending === "__plan_tune_up__") requestTuneUp(true);
          else if (pending) requestReply(pending);
        }}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, width: "100%", justifyContent: "flex-end" },
  sheetContent: { width: "100%" },
  header: {
    minHeight: 56,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerButton: {
    minWidth: 48,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: { ...Typography.headline, flex: 1, textAlign: "center" },
  saveText: { ...Typography.body, fontWeight: "700" },
  scroll: { flex: 1 },
  chips: {
    paddingHorizontal: Spacing.lg,
    gap: Spacing.sm,
    marginBottom: Spacing.lg,
  },
  chip: {
    minHeight: 44,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  chipText: { ...Typography.small, fontWeight: "600", flexShrink: 1 },
  planCard: {
    margin: Spacing.lg,
    padding: Spacing.lg,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
  },
  planEyebrow: {
    ...Typography.caption,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  planTitle: { ...Typography.headline, marginTop: Spacing.sm },
  diffRow: { marginTop: Spacing.md },
  diffLabel: { ...Typography.caption, textTransform: "uppercase" },
  diffValues: { marginTop: Spacing.xs, gap: 2 },
  beforeValue: { ...Typography.small, textDecorationLine: "line-through" },
  diffValue: { ...Typography.body, fontWeight: "600", marginTop: 2 },
  rationale: { ...Typography.small, lineHeight: 20, marginTop: Spacing.lg },
  planActions: { flexDirection: "row", gap: Spacing.sm, marginTop: Spacing.lg },
  secondaryButton: {
    minHeight: 44,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    paddingHorizontal: Spacing.md,
    justifyContent: "center",
  },
  secondaryText: { ...Typography.small, fontWeight: "700" },
  applyButton: {
    flex: 1,
    minHeight: 44,
    borderRadius: BorderRadius.full,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: Spacing.md,
  },
  applyText: { ...Typography.small, fontWeight: "800" },
  error: {
    ...Typography.small,
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.lg,
  },
  composer: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: Spacing.sm,
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 120,
    borderRadius: BorderRadius.lg,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    ...Typography.body,
  },
  send: {
    width: 44,
    height: 44,
    borderRadius: BorderRadius.full,
    alignItems: "center",
    justifyContent: "center",
  },
});
