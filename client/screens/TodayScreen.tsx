import React, {
  useMemo,
  useEffect,
  useCallback,
  useState,
  useRef,
} from "react";
import {
  View,
  FlatList,
  StyleSheet,
  Pressable,
  Alert,
  Platform,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { useNavigation } from "@react-navigation/native";
import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as StoreReview from "expo-store-review";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withRepeat,
  withSequence,
  Easing,
  withTiming,
} from "react-native-reanimated";

import { useTheme } from "@/hooks/useTheme";
import { useApp } from "@/context/AppContext";
import { computeMomentumScore } from "@/lib/progress";
import {
  areNotificationsEnabled,
  requestNotificationPermissions,
  scheduleDailyReminder,
  suppressReminderForToday,
  ensureReminderScheduled,
  applySuggestedReminderBucket,
  suggestReminderBucket,
} from "@/lib/notifications";
import { Colors, Spacing, Typography, BorderRadius } from "@/constants/theme";
import { ThemedText } from "@/components/ThemedText";
import { CircularProgress } from "@/components/CircularProgress";
import { ActionCard, CompletedActionRow } from "@/components/ActionCard";
import { StatChip } from "@/components/StatChip";
import { DayCompleteCard } from "@/components/DayCompleteCard";
import {
  WeeklyRecapCard,
  BeatLastWeekCard,
} from "@/components/WeeklyRecapCard";
import { LapseRecoveryCard } from "@/components/LapseRecoveryCard";
import { MonthRecapCard } from "@/components/MonthRecapCard";
import { CoachObservationCard } from "@/components/CoachObservationCard";
import { Toast } from "@/components/Toast";
import { logger } from "@/lib/logger";
import { buildMonthRecap, getPreviousMonthKey } from "@/lib/recap";
import { computeCoachObservation } from "@/lib/insights";
import { track } from "@/lib/telemetry";

const CONTEXTUAL_NOTIF_ASK_KEY = "today_contextual_notif_ask_done";
const FIRST_DAY_COMPLETE_KEY = "today_first_day_complete_seen";
// {count, lastDate} of distinct fully-complete days, for timing the one-time
// App Store review ask at the third day-complete celebration
const REVIEW_COMPLETE_DAYS_KEY = "today_review_complete_days";
const REVIEW_REQUESTED_KEY = "today_review_requested";
const REVIEW_ASK_AFTER_DAYS = 3;
// Monday of the last-recapped week — the recap card shows once per week
const WEEKLY_RECAP_SEEN_KEY = "today_weekly_recap_seen_week";
const WEEKLY_NUDGE_SEEN_KEY = "today_weekly_nudge_seen_week";
// Date of the most recent fully-missed day the lapse card was dismissed
// for — the card only returns when a new missed day occurs
const LAPSE_DISMISSED_KEY = "today_lapse_card_dismissed_for";
// "YYYY-MM" of the last month whose Month-in-Votes entry card was seen —
// the card shows during the first week of each new month, once
const MONTH_RECAP_SEEN_KEY = "today_month_recap_seen_month";
const MONTH_RECAP_WINDOW_DAYS = 7;
// Last observed shield state, for surfacing spend/recharge moments exactly
// once per transition (earned forgiveness should be seen, not silent)
const SHIELD_STATE_KEY = "today_shield_state";
// Id of the last coach observation shown — one proactive observation per
// pattern per week, dismissed forever once seen
const COACH_OBSERVATION_SEEN_KEY = "today_coach_observation_seen";

function getLocalDateString(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

const springConfig = {
  damping: 15,
  stiffness: 400,
  mass: 0.8,
};

function StylizedAppLogo() {
  const rotation = useSharedValue(0);
  const pulse = useSharedValue(1);
  const glow = useSharedValue(0.3);

  useEffect(() => {
    rotation.value = withRepeat(
      withTiming(360, { duration: 20000, easing: Easing.linear }),
      -1,
      false,
    );
    pulse.value = withRepeat(
      withSequence(
        withTiming(1.05, { duration: 2000, easing: Easing.inOut(Easing.ease) }),
        withTiming(1, { duration: 2000, easing: Easing.inOut(Easing.ease) }),
      ),
      -1,
      true,
    );
    glow.value = withRepeat(
      withSequence(
        withTiming(0.6, { duration: 2000, easing: Easing.inOut(Easing.ease) }),
        withTiming(0.3, { duration: 2000, easing: Easing.inOut(Easing.ease) }),
      ),
      -1,
      true,
    );
  }, [glow, pulse, rotation]);

  const outerRingStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.value}deg` }, { scale: pulse.value }],
  }));

  const glowStyle = useAnimatedStyle(() => ({
    opacity: glow.value,
  }));

  return (
    <View style={logoStyles.container}>
      <Animated.View style={[logoStyles.glowOuter, glowStyle]} />
      <Animated.View style={[logoStyles.outerRing, outerRingStyle]}>
        <View style={logoStyles.gradientDot1} />
        <View style={logoStyles.gradientDot2} />
        <View style={logoStyles.gradientDot3} />
        <View style={logoStyles.gradientDot4} />
      </Animated.View>
      <View style={logoStyles.innerCircle}>
        <View style={logoStyles.compassCore}>
          <Feather name="compass" size={40} color="#FFFFFF" />
        </View>
      </View>
    </View>
  );
}

const logoStyles = StyleSheet.create({
  container: {
    width: 120,
    height: 120,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Spacing["2xl"],
  },
  glowOuter: {
    position: "absolute",
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: Colors.dark.accent,
  },
  outerRing: {
    position: "absolute",
    width: 110,
    height: 110,
    borderRadius: 55,
    borderWidth: 2,
    borderColor: "rgba(0, 217, 255, 0.4)",
    alignItems: "center",
    justifyContent: "center",
  },
  gradientDot1: {
    position: "absolute",
    top: -4,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.dark.accent,
  },
  gradientDot2: {
    position: "absolute",
    right: -4,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#FF6B9D",
  },
  gradientDot3: {
    position: "absolute",
    bottom: -4,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#9B6BFF",
  },
  gradientDot4: {
    position: "absolute",
    left: -4,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#6BFFB8",
  },
  innerCircle: {
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: "rgba(0, 217, 255, 0.2)",
    alignItems: "center",
    justifyContent: "center",
  },
  compassCore: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: "rgba(0, 217, 255, 0.3)",
    alignItems: "center",
    justifyContent: "center",
  },
});

function AnimatedStartButton({ onPress }: { onPress: () => void }) {
  const scale = useSharedValue(1);
  const arrowX = useSharedValue(0);

  const handlePressIn = () => {
    scale.value = withSpring(0.96, springConfig);
    arrowX.value = withSpring(4, springConfig);
  };

  const handlePressOut = () => {
    scale.value = withSpring(1, springConfig);
    arrowX.value = withSpring(0, springConfig);
  };

  const handlePress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onPress();
  };

  const buttonStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const arrowStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: arrowX.value }],
  }));

  return (
    <Pressable
      onPress={handlePress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
    >
      <Animated.View style={[styles.startButton, buttonStyle]}>
        <ThemedText style={styles.startButtonText}>
          Start Your Journey
        </ThemedText>
        <Animated.View style={arrowStyle}>
          <Feather name="arrow-right" size={20} color="#000000" />
        </Animated.View>
      </Animated.View>
    </Pressable>
  );
}

export default function TodayScreen() {
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const tabBarHeight = useBottomTabBarHeight();
  const navigation = useNavigation<any>();
  const { theme, isDark } = useTheme();
  const {
    hasOnboarded,
    persona,
    benchmarks,
    actions,
    dailyLogs,
    personaAlignment,
    progressSnapshot,
    subscription,
    toggleDailyLog,
    setDailyLogNote,
  } = useApp();

  const today = new Date();
  const dayOfWeek = today.toLocaleDateString("en-US", { weekday: "long" });
  const dateString = today.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  const personaBenchmarkIds = useMemo(() => {
    return benchmarks
      .filter((b) => b.personaId === persona?.id)
      .map((b) => b.id);
  }, [benchmarks, persona?.id]);

  const todayActions = useMemo(() => {
    return actions
      .filter((action) => personaBenchmarkIds.includes(action.benchmarkId))
      .filter((action) => action.frequency.includes(dayOfWeek));
  }, [actions, personaBenchmarkIds, dayOfWeek]);

  const todayDateStr = getLocalDateString(today);

  const benchmarkById = useMemo(
    () => new Map(benchmarks.map((benchmark) => [benchmark.id, benchmark])),
    [benchmarks],
  );

  const todayLogByActionId = useMemo(() => {
    const index = new Map<string, (typeof dailyLogs)[number]>();
    for (const action of todayActions) {
      const log = progressSnapshot.logIndex.get(`${action.id}|${todayDateStr}`);
      if (log) index.set(action.id, log);
    }
    return index;
  }, [progressSnapshot.logIndex, todayActions, todayDateStr]);

  const { pendingTodayActions, completedTodayActions } = useMemo(() => {
    const pending: typeof todayActions = [];
    const completed: typeof todayActions = [];
    for (const action of todayActions) {
      if (todayLogByActionId.get(action.id)?.status) completed.push(action);
      else pending.push(action);
    }
    return { pendingTodayActions: pending, completedTodayActions: completed };
  }, [todayActions, todayLogByActionId]);

  const completedTodayCount = completedTodayActions.length;

  const scheduledTodayCount = todayActions.length;
  const dayComplete =
    scheduledTodayCount > 0 && completedTodayCount === scheduledTodayCount;

  const streak = progressSnapshot.streak;
  const streakCurrent = streak.current;

  const lapse = progressSnapshot.lapse;
  const weeklyRecap = progressSnapshot.weeklyRecap;

  // Monthly Consistency as of last night (today's logs removed): the
  // difference is what today's check-offs have earned. Month-to-date window
  // matches personaAlignment in AppContext — ONE long-arc metric everywhere.
  const consistencyBeforeToday = useMemo(() => {
    const logsExcludingToday = dailyLogs.filter(
      (log) => log.logDate.split("T")[0] !== todayDateStr,
    );
    return computeMomentumScore(
      actions,
      logsExcludingToday,
      new Date().getDate(),
    );
  }, [actions, dailyLogs, todayDateStr]);
  const momentumDelta = personaAlignment - consistencyBeforeToday;

  const [toastVisible, setToastVisible] = useState(false);
  const [toastMessage, setToastMessage] = useState("");
  // True only when the final action was checked in this session, so
  // reopening the app shows the completed state without re-animating
  const [celebrateDayComplete, setCelebrateDayComplete] = useState(false);
  const [isFirstDayComplete, setIsFirstDayComplete] = useState(false);

  // Weekly recap / nudge / lapse-card dismissal state loads from AsyncStorage
  // once; nothing renders until it has, so cards never flash-then-vanish
  const [recapPrefsLoaded, setRecapPrefsLoaded] = useState(false);
  const [recapSeenWeek, setRecapSeenWeek] = useState<string | null>(null);
  const [nudgeSeenWeek, setNudgeSeenWeek] = useState<string | null>(null);
  const [lapseDismissedFor, setLapseDismissedFor] = useState<string | null>(
    null,
  );

  const [monthRecapSeen, setMonthRecapSeen] = useState<string | null>(null);
  const [observationSeen, setObservationSeen] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      AsyncStorage.getItem(WEEKLY_RECAP_SEEN_KEY),
      AsyncStorage.getItem(WEEKLY_NUDGE_SEEN_KEY),
      AsyncStorage.getItem(LAPSE_DISMISSED_KEY),
      AsyncStorage.getItem(MONTH_RECAP_SEEN_KEY),
      AsyncStorage.getItem(COACH_OBSERVATION_SEEN_KEY),
    ]).then(([recapSeen, nudgeSeen, lapseSeen, monthSeen, obsSeen]) => {
      setRecapSeenWeek(recapSeen);
      setNudgeSeenWeek(nudgeSeen);
      setLapseDismissedFor(lapseSeen);
      setMonthRecapSeen(monthSeen);
      setObservationSeen(obsSeen);
      setRecapPrefsLoaded(true);
    });
  }, []);

  const dismissWeeklyRecap = () => {
    setRecapSeenWeek(weeklyRecap.weekKey);
    AsyncStorage.setItem(WEEKLY_RECAP_SEEN_KEY, weeklyRecap.weekKey);
  };

  const dismissBeatLastWeek = () => {
    setNudgeSeenWeek(weeklyRecap.weekKey);
    AsyncStorage.setItem(WEEKLY_NUDGE_SEEN_KEY, weeklyRecap.weekKey);
  };

  const dismissLapseCard = () => {
    if (!lapse.lastMissedDate) return;
    setLapseDismissedFor(lapse.lastMissedDate);
    AsyncStorage.setItem(LAPSE_DISMISSED_KEY, lapse.lastMissedDate);
  };

  // "Month in Votes" closing ceremony for the month that just ended: shown
  // during the first week of a new month, once, and only when last month had
  // any votes to tell a story about. Takes precedence over the weekly card
  // (the 1st is often a Monday — the weekly card returns after this one).
  const prevMonthKey = getPreviousMonthKey(today);
  const monthRecap = useMemo(
    () =>
      buildMonthRecap(
        actions,
        dailyLogs,
        persona,
        prevMonthKey,
        new Date(),
        subscription.isPremium ? 2 : 1,
      ),
    [actions, dailyLogs, persona, prevMonthKey, subscription.isPremium],
  );
  const showMonthRecapCard =
    recapPrefsLoaded &&
    today.getDate() <= MONTH_RECAP_WINDOW_DAYS &&
    monthRecap.votesCast > 0 &&
    monthRecapSeen !== prevMonthKey;

  const dismissMonthRecap = () => {
    setMonthRecapSeen(prevMonthKey);
    AsyncStorage.setItem(MONTH_RECAP_SEEN_KEY, prevMonthKey);
  };

  const showWeeklyRecap =
    recapPrefsLoaded &&
    !showMonthRecapCard &&
    weeklyRecap.lastWeek.scheduled > 0 &&
    recapSeenWeek !== weeklyRecap.weekKey;

  // The coach's one proactive weekly observation — locally computed, shown
  // once per pattern per week, and never stacked on top of a recap card
  const coachObservation = useMemo(
    () => computeCoachObservation(actions, dailyLogs, persona?.name ?? "you"),
    [actions, dailyLogs, persona?.name],
  );
  const showCoachObservation =
    recapPrefsLoaded &&
    !showMonthRecapCard &&
    !showWeeklyRecap &&
    coachObservation !== null &&
    observationSeen !== coachObservation.id;

  const dismissCoachObservation = () => {
    if (!coachObservation) return;
    setObservationSeen(coachObservation.id);
    AsyncStorage.setItem(COACH_OBSERVATION_SEEN_KEY, coachObservation.id);
  };

  // Sunday goal-gradient nudge: this week is exactly one log away from
  // beating last week, and there is still something loggable today
  const showBeatLastWeekNudge =
    recapPrefsLoaded &&
    !showWeeklyRecap &&
    today.getDay() === 0 &&
    !dayComplete &&
    scheduledTodayCount > completedTodayCount &&
    weeklyRecap.lastWeek.completed > 0 &&
    weeklyRecap.currentWeekCompleted === weeklyRecap.lastWeek.completed &&
    nudgeSeenWeek !== weeklyRecap.weekKey;

  const showLapseCard =
    recapPrefsLoaded &&
    lapse.missedDays >= 2 &&
    !dayComplete &&
    lapse.lastMissedDate !== null &&
    lapse.lastMissedDate !== lapseDismissedFor;

  // Latest per-render data for the stable handleToggle callback — widening
  // its deps would re-render every memoized ActionCard on each toggle
  const latestRef = useRef({
    todayActions,
    dailyLogs,
    actions,
    personaName: persona?.name ?? "",
    personaAlignment,
  });
  useEffect(() => {
    latestRef.current = {
      todayActions,
      dailyLogs,
      actions,
      personaName: persona?.name ?? "",
      personaAlignment,
    };
  });
  const toastVariantRef = useRef(0);

  // Stable reference so memoized ActionCards skip re-rendering on each toggle
  const handleToggle = useCallback(
    async (actionId: string) => {
      try {
        const log = await toggleDailyLog(actionId, todayDateStr);
        if (!log.status) return;

        const {
          todayActions: currentActions,
          dailyLogs: currentLogs,
          actions: allActions,
          personaName,
          personaAlignment: currentAlignment,
        } = latestRef.current;
        // The ref may not hold the post-toggle state yet — upsert the log
        const newLogs = currentLogs.some((l) => l.id === log.id)
          ? currentLogs.map((l) => (l.id === log.id ? log : l))
          : [...currentLogs, log];
        const isDone = (id: string) =>
          newLogs.some((l) => {
            const logDateStr = l.logDate.includes("T")
              ? l.logDate.split("T")[0]
              : l.logDate;
            return l.actionId === id && logDateStr === todayDateStr && l.status;
          });
        const remaining = currentActions.filter((a) => !isDone(a.id)).length;

        if (remaining === 0 && currentActions.length > 0) {
          // Final action of the day: the celebration card takes over, with a
          // double haptic so it reads as an event, not an acknowledgment
          setCelebrateDayComplete(true);
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          setTimeout(() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
          }, 300);
          return;
        }

        // Identity-framed toast variants (variable reward, rotating).
        // Delta uses the month-to-date window so the number matches the
        // Monthly Consistency chip and Progress ring.
        const monthWindow = new Date().getDate();
        const delta =
          computeMomentumScore(allActions, newLogs, monthWindow) -
          currentAlignment;
        const variants = [`A vote for ${personaName} ✓`];
        if (delta > 0) variants.push(`Consistency +${delta}%`);
        variants.push(`${remaining} to go — ring's filling up`);
        setToastMessage(variants[toastVariantRef.current % variants.length]);
        toastVariantRef.current += 1;
        setToastVisible(true);
      } catch (error) {
        logger.error("Failed to toggle action:", error);
      }
    },
    [toggleDailyLog, todayDateStr],
  );

  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowDayOfWeek = tomorrow.toLocaleDateString("en-US", {
    weekday: "long",
  });

  const tomorrowActions = useMemo(() => {
    return actions
      .filter((action) => personaBenchmarkIds.includes(action.benchmarkId))
      .filter((action) => action.frequency.includes(tomorrowDayOfWeek));
  }, [actions, personaBenchmarkIds, tomorrowDayOfWeek]);

  const todayRows = useMemo(
    () => [
      ...pendingTodayActions.map((action) => ({
        kind: "pending" as const,
        action,
        log: todayLogByActionId.get(action.id) ?? null,
        benchmarkTitle: benchmarkById.get(action.benchmarkId)?.title,
      })),
      ...completedTodayActions.map((action) => ({
        kind: "completed" as const,
        action,
        log: todayLogByActionId.get(action.id) ?? null,
        benchmarkTitle: undefined,
      })),
    ],
    [
      benchmarkById,
      completedTodayActions,
      pendingTodayActions,
      todayLogByActionId,
    ],
  );

  // Optional "how it went" note on a completed action. One native prompt,
  // fully skippable — the completion tap itself stays friction-free.
  const todayLogByActionIdRef = useRef(todayLogByActionId);
  todayLogByActionIdRef.current = todayLogByActionId;
  const handleNotePress = useCallback(
    (actionId: string) => {
      const currentNote = todayLogByActionIdRef.current.get(actionId)?.note;
      const save = (text: string | undefined) => {
        if (text === undefined) return;
        setDailyLogNote(actionId, todayDateStr, text).catch((error) =>
          logger.error("Failed to save completion note:", error),
        );
      };
      if (Platform.OS === "web") {
        const text = window.prompt("How did it go?", currentNote ?? "");
        save(text === null ? undefined : text);
        return;
      }
      Alert.prompt(
        currentNote ? "Edit your note" : "How did it go?",
        "One line for future you — your coach reads these too.",
        [
          { text: "Cancel", style: "cancel" },
          { text: "Save", onPress: (text?: string) => save(text ?? "") },
        ],
        "plain-text",
        currentNote ?? "",
      );
    },
    [setDailyLogNote, todayDateStr],
  );

  const renderTodayRow = useCallback(
    ({ item }: { item: (typeof todayRows)[number] }) =>
      item.kind === "pending" ? (
        <ActionCard
          action={item.action}
          log={item.log}
          onToggle={handleToggle}
          benchmarkTitle={item.benchmarkTitle}
        />
      ) : (
        <CompletedActionRow
          action={item.action}
          onToggle={handleToggle}
          note={item.log?.note}
          onNotePress={handleNotePress}
        />
      ),
    [handleToggle, handleNotePress],
  );

  // Shield spend/recharge moments: the shield mechanic already worked
  // silently — make the earned-forgiveness loop visible. A spend gets a
  // dignified toast ("that's what it was for"); the recharge after the
  // rolling window passes is the earn moment.
  const shieldUsed = streak.shieldUsed;
  const streakCurrentForShield = streak.current;
  useEffect(() => {
    if (!hasOnboarded) return;
    (async () => {
      let previous: { shieldUsed: boolean } | null = null;
      try {
        const raw = await AsyncStorage.getItem(SHIELD_STATE_KEY);
        previous = raw ? JSON.parse(raw) : null;
      } catch {
        previous = null;
      }
      if (previous !== null && previous.shieldUsed !== shieldUsed) {
        if (shieldUsed) {
          track("shield_used");
          setToastMessage(
            "Your shield covered a missed day — streak intact. That's what it was for. 🛡",
          );
          setToastVisible(true);
        } else if (streakCurrentForShield > 0) {
          track("shield_earned");
          setToastMessage(
            "Shield recharged — your consistency earned it back. 🛡",
          );
          setToastVisible(true);
        }
      }
      await AsyncStorage.setItem(
        SHIELD_STATE_KEY,
        JSON.stringify({ shieldUsed }),
      );
    })().catch((error) => logger.error("Failed to track shield state:", error));
  }, [hasOnboarded, shieldUsed, streakCurrentForShield]);

  // First-ever completion gets a one-time extra line on the celebration card
  useEffect(() => {
    if (!celebrateDayComplete) return;
    track("day_complete");
    AsyncStorage.getItem(FIRST_DAY_COMPLETE_KEY).then((seen) => {
      if (!seen) {
        setIsFirstDayComplete(true);
        AsyncStorage.setItem(FIRST_DAY_COMPLETE_KEY, "true");
      }
    });
  }, [celebrateDayComplete]);

  // Daily reminder maintenance: record the anchor-derived time suggestion,
  // go quiet once the day is done, restore the chain otherwise
  const lapseMissedDays = lapse.missedDays;
  useEffect(() => {
    if (Platform.OS === "web" || !hasOnboarded) return;
    const copy = {
      streakCount: streakCurrent,
      missedRun: lapseMissedDays,
      personaName: persona?.name,
      monthlyConsistency: personaAlignment,
    };
    (async () => {
      await applySuggestedReminderBucket(
        suggestReminderBucket(actions.map((a) => a.anchorLink)),
        copy,
      );
      if (dayComplete) {
        await suppressReminderForToday(copy);
      } else {
        await ensureReminderScheduled(copy);
      }
    })().catch((error) => {
      logger.error("Failed to maintain reminder schedule:", error);
    });
  }, [
    dayComplete,
    hasOnboarded,
    streakCurrent,
    lapseMissedDays,
    actions,
    persona?.name,
    personaAlignment,
  ]);

  // Contextual permission ask, once, right after the first day-complete —
  // the moment the user has something worth protecting
  useEffect(() => {
    if (!celebrateDayComplete || Platform.OS === "web") return;
    let cancelled = false;
    (async () => {
      const [asked, enabled] = await Promise.all([
        AsyncStorage.getItem(CONTEXTUAL_NOTIF_ASK_KEY),
        areNotificationsEnabled(),
      ]);
      if (asked || enabled || cancelled) return;
      await AsyncStorage.setItem(CONTEXTUAL_NOTIF_ASK_KEY, "true");
      // Let the celebration fully land before asking — the day-complete
      // card is the best moment in the app; don't step on it (verified on
      // simulator: 1.5s still interrupted the burst animation)
      setTimeout(() => {
        Alert.alert(
          "Keep the streak alive?",
          "Want a nudge tomorrow so the streak holds? One daily reminder, timed to your routine — and only on days you haven't finished.",
          [
            { text: "Not now", style: "cancel" },
            {
              text: "Remind me",
              onPress: async () => {
                const granted = await requestNotificationPermissions();
                if (granted) {
                  await scheduleDailyReminder({ streakCount: streakCurrent });
                  // Today is already complete — stay quiet tonight
                  await suppressReminderForToday({
                    streakCount: streakCurrent,
                  });
                }
              },
            },
          ],
        );
      }, 4000);
    })();
    return () => {
      cancelled = true;
    };
  }, [celebrateDayComplete, streakCurrent]);

  // One-time App Store review ask at the third day-complete celebration —
  // peak-moment timing, and disjoint from the first-day notification ask.
  // StoreReview.requestReview is a no-op when Apple declines to show it.
  useEffect(() => {
    if (!celebrateDayComplete || Platform.OS === "web") return;
    let cancelled = false;
    (async () => {
      const [rawDays, requested] = await Promise.all([
        AsyncStorage.getItem(REVIEW_COMPLETE_DAYS_KEY),
        AsyncStorage.getItem(REVIEW_REQUESTED_KEY),
      ]);
      let days: { count: number; lastDate: string } = {
        count: 0,
        lastDate: "",
      };
      try {
        if (rawDays) days = JSON.parse(rawDays);
      } catch {
        // Corrupt marker — restart the count; worst case the ask comes later
      }
      if (days.lastDate !== todayDateStr) {
        days = { count: days.count + 1, lastDate: todayDateStr };
        await AsyncStorage.setItem(
          REVIEW_COMPLETE_DAYS_KEY,
          JSON.stringify(days),
        );
      }
      if (requested || days.count < REVIEW_ASK_AFTER_DAYS || cancelled) return;
      await AsyncStorage.setItem(REVIEW_REQUESTED_KEY, "true");
      setTimeout(async () => {
        try {
          if (await StoreReview.hasAction()) {
            await StoreReview.requestReview();
          }
        } catch (error) {
          logger.error("Failed to request store review:", error);
        }
      }, 4000);
    })().catch((error) => {
      logger.error("Failed to track review timing:", error);
    });
    return () => {
      cancelled = true;
    };
  }, [celebrateDayComplete, todayDateStr]);

  if (!hasOnboarded || !persona) {
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
          <StylizedAppLogo />
          <ThemedText style={styles.emptyTitle}>
            Begin Your Evolution
          </ThemedText>
          <ThemedText
            style={[styles.emptyText, { color: theme.textSecondary }]}
          >
            Define who you are becoming and build the habits that will get you
            there.
          </ThemedText>
          <AnimatedStartButton
            onPress={() => navigation.navigate("Onboarding")}
          />
        </View>
      </View>
    );
  }

  return (
    <>
      <FlatList
        // Completed rows stay visible under the DayCompleteCard: the moment
        // the last action lands is exactly when a "how it went" note gets
        // written (and a mistaken final tap can be undone without a detour)
        data={todayActions.length === 0 ? [] : todayRows}
        renderItem={renderTodayRow}
        keyExtractor={(item) => item.action.id}
        delaysContentTouches={false}
        style={{ flex: 1, backgroundColor: theme.backgroundRoot }}
        decelerationRate="fast"
        contentContainerStyle={{
          paddingTop: headerHeight + Spacing.xl,
          paddingBottom: tabBarHeight + Spacing.xl,
          paddingHorizontal: Spacing.lg,
        }}
        scrollIndicatorInsets={{ bottom: insets.bottom }}
        initialNumToRender={5}
        maxToRenderPerBatch={5}
        windowSize={7}
        ListHeaderComponent={
          <>
            <View style={styles.header}>
              <ThemedText
                style={[styles.personaLabel, { color: Colors.dark.accent }]}
              >
                Becoming
              </ThemedText>
              <ThemedText style={styles.personaName}>{persona.name}</ThemedText>
            </View>

            {showMonthRecapCard ? (
              <MonthRecapCard
                recap={monthRecap}
                onOpen={() => {
                  dismissMonthRecap();
                  navigation.navigate("MonthRecap", {
                    monthKey: prevMonthKey,
                  });
                }}
                onDismiss={dismissMonthRecap}
              />
            ) : showWeeklyRecap ? (
              <WeeklyRecapCard
                recap={weeklyRecap}
                streak={streak}
                personaName={persona.name}
                onDismiss={dismissWeeklyRecap}
                onStartReview={() => {
                  navigation.navigate(
                    "ReflectTab" as never,
                    { startWeekly: Date.now() } as never,
                  );
                }}
              />
            ) : showCoachObservation && coachObservation ? (
              <CoachObservationCard
                observation={coachObservation}
                onOpenCoach={() => {
                  track("coach_observation_opened");
                  dismissCoachObservation();
                  navigation.navigate("ReflectTab" as never);
                }}
                onDismiss={dismissCoachObservation}
              />
            ) : showBeatLastWeekNudge ? (
              <BeatLastWeekCard
                lastWeekCompleted={weeklyRecap.lastWeek.completed}
                onDismiss={dismissBeatLastWeek}
              />
            ) : null}

            <View style={styles.alignmentContainer}>
              <CircularProgress
                progress={
                  scheduledTodayCount === 0
                    ? 100
                    : (completedTodayCount / scheduledTodayCount) * 100
                }
                size={160}
                label="Today"
                valueText={
                  scheduledTodayCount === 0
                    ? "Rest"
                    : `${completedTodayCount}/${scheduledTodayCount}`
                }
              />
              <View style={styles.chipRow}>
                <StatChip
                  icon={
                    streak.shieldUsed ? (
                      <Feather
                        name="shield"
                        size={14}
                        color={theme.textSecondary}
                      />
                    ) : (
                      <MaterialCommunityIcons
                        name="fire"
                        size={16}
                        color={
                          streak.current > 0
                            ? Colors.dark.warning
                            : theme.textSecondary
                        }
                      />
                    )
                  }
                  text={
                    streak.shieldUsed
                      ? "Streak protected"
                      : `${streak.current}-day streak`
                  }
                  detailIcon={
                    // Make the grace shield legible BEFORE it's needed: a
                    // quiet "armed" marker once there's a streak worth keeping.
                    !streak.shieldUsed && streak.current >= 2 ? (
                      <Feather
                        name="shield"
                        size={12}
                        color={theme.textSecondary}
                      />
                    ) : undefined
                  }
                  detail={
                    !streak.shieldUsed && streak.current >= 2
                      ? "ready"
                      : undefined
                  }
                  accessibilityLabel={
                    streak.shieldUsed
                      ? "Streak protected by your shield"
                      : streak.current >= 2
                        ? `${streak.current}-day streak, shield ready — one missed day per week is covered`
                        : `${streak.current}-day streak`
                  }
                />
                <StatChip
                  icon={
                    <Feather name="zap" size={14} color={Colors.dark.accent} />
                  }
                  text={`${today.toLocaleDateString("en-US", { month: "long" })} · ${personaAlignment}%`}
                  detail={
                    momentumDelta > 0
                      ? `▲${momentumDelta}`
                      : momentumDelta < 0
                        ? `▼${Math.abs(momentumDelta)}`
                        : undefined
                  }
                  detailColor={
                    momentumDelta > 0 ? Colors.dark.success : Colors.dark.error
                  }
                />
              </View>
            </View>

            <View style={styles.dateContainer}>
              <ThemedText
                style={[styles.dateText, { color: theme.textSecondary }]}
              >
                {dateString}
              </ThemedText>
              <View style={styles.actionCount}>
                <ThemedText
                  style={[
                    styles.actionCountText,
                    { color: theme.textSecondary },
                  ]}
                >
                  {todayActions.length} action
                  {todayActions.length !== 1 ? "s" : ""} today
                </ThemedText>
              </View>
            </View>

            {showLapseCard ? (
              <LapseRecoveryCard
                onCoachPress={() => {
                  navigation.navigate("ReflectTab" as never);
                }}
                onDismiss={dismissLapseCard}
              />
            ) : null}

            {dayComplete ? (
              <DayCompleteCard
                streak={streak.current}
                personaName={persona.name}
                momentum={personaAlignment}
                momentumDelta={momentumDelta}
                tomorrowCount={tomorrowActions.length}
                tomorrowFirstTitle={tomorrowActions[0]?.title}
                isFirstEver={isFirstDayComplete}
                celebrate={celebrateDayComplete}
                onTomorrowPress={() => {
                  navigation.navigate("JourneyTab" as never);
                }}
              />
            ) : todayActions.length === 0 ? (
              <View
                style={[
                  styles.noActionsCard,
                  {
                    backgroundColor: isDark
                      ? Colors.dark.backgroundDefault
                      : Colors.light.backgroundDefault,
                  },
                ]}
              >
                <Feather
                  name="check-circle"
                  size={32}
                  color={Colors.dark.success}
                />
                <ThemedText style={styles.noActionsText}>
                  No actions scheduled for today. Rest and recharge!
                </ThemedText>
                {tomorrowActions.length > 0 ? (
                  <Pressable
                    onPress={() => {
                      navigation.navigate("JourneyTab" as never);
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={`View ${tomorrowActions.length} ${tomorrowActions.length === 1 ? "action" : "actions"} scheduled for tomorrow in the calendar`}
                    style={({ pressed }) => [
                      styles.tomorrowLink,
                      { opacity: pressed ? 0.7 : 1 },
                    ]}
                  >
                    <Feather
                      name="calendar"
                      size={16}
                      color={Colors.dark.accent}
                    />
                    <ThemedText
                      style={[
                        styles.tomorrowLinkText,
                        { color: Colors.dark.accent },
                      ]}
                    >
                      {tomorrowActions.length} action
                      {tomorrowActions.length !== 1 ? "s" : ""} tomorrow
                    </ThemedText>
                    <Feather
                      name="chevron-right"
                      size={16}
                      color={Colors.dark.accent}
                    />
                  </Pressable>
                ) : null}
              </View>
            ) : null}
          </>
        }
        ListFooterComponent={
          !dayComplete &&
          todayActions.length > 0 &&
          tomorrowActions.length > 0 ? (
            <Pressable
              onPress={() => {
                navigation.navigate("JourneyTab" as never);
              }}
              accessibilityRole="button"
              accessibilityLabel={`View ${tomorrowActions.length} ${tomorrowActions.length === 1 ? "action" : "actions"} scheduled for tomorrow in the calendar`}
              style={({ pressed }) => [
                styles.tomorrowLink,
                styles.tomorrowLinkCentered,
                { opacity: pressed ? 0.7 : 1 },
              ]}
            >
              <Feather name="calendar" size={16} color={Colors.dark.accent} />
              <ThemedText
                style={[styles.tomorrowLinkText, { color: Colors.dark.accent }]}
              >
                {tomorrowActions.length} action
                {tomorrowActions.length !== 1 ? "s" : ""} tomorrow
              </ThemedText>
              <Feather
                name="chevron-right"
                size={16}
                color={Colors.dark.accent}
              />
            </Pressable>
          ) : null
        }
      />
      <Toast
        message={toastMessage}
        visible={toastVisible}
        onHide={() => setToastVisible(false)}
        type="success"
        topOffset={headerHeight + Spacing.md}
      />
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: Spacing.lg,
  },
  emptyContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: Spacing.xl,
  },
  emptyIcon: {
    marginBottom: Spacing["2xl"],
  },
  phoenixIconContainer: {
    width: 80,
    height: 80,
    borderRadius: BorderRadius.full,
    backgroundColor: "rgba(0, 217, 255, 0.15)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Spacing["2xl"],
  },
  emptyTitle: {
    ...Typography.title,
    textAlign: "center",
    marginBottom: Spacing.md,
  },
  emptyText: {
    ...Typography.body,
    textAlign: "center",
    marginBottom: Spacing["3xl"],
  },
  startButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.dark.accent,
    paddingVertical: Spacing.lg,
    paddingHorizontal: Spacing["2xl"],
    borderRadius: BorderRadius.full,
    gap: Spacing.sm,
  },
  startButtonText: {
    ...Typography.headline,
    color: "#000000",
  },
  header: {
    marginBottom: Spacing.xl,
  },
  personaLabel: {
    ...Typography.caption,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: Spacing.xs,
  },
  personaName: {
    ...Typography.title,
  },
  alignmentContainer: {
    alignItems: "center",
    marginBottom: Spacing["3xl"],
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: Spacing.sm,
    marginTop: Spacing.lg,
    paddingHorizontal: Spacing.lg,
  },
  dateContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.lg,
  },
  dateText: {
    ...Typography.headline,
  },
  actionCount: {},
  actionCountText: {
    ...Typography.small,
  },
  noActionsCard: {
    alignItems: "center",
    padding: Spacing["2xl"],
    borderRadius: BorderRadius.md,
    gap: Spacing.md,
  },
  noActionsText: {
    ...Typography.body,
    textAlign: "center",
  },
  tomorrowLink: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    marginTop: Spacing.md,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
  },
  tomorrowLinkCentered: {
    alignSelf: "center",
    marginTop: Spacing.sm,
  },
  tomorrowLinkText: {
    ...Typography.small,
    fontWeight: "600",
  },
});
