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
  ScrollView,
  Alert,
  Platform,
  Share,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { useNavigation } from "@react-navigation/native";
import { Feather } from "@expo/vector-icons";
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
  suppressReminderForToday,
  ensureReminderScheduled,
  applySuggestedReminderBucket,
  suggestReminderBucket,
} from "@/lib/notifications";
import { Colors, Spacing, Typography, BorderRadius } from "@/constants/theme";
import { ThemedText } from "@/components/ThemedText";
import { ActionCard, CompletedActionRow } from "@/components/ActionCard";
import { DayCompleteCard } from "@/components/DayCompleteCard";
import { TodaySignalCard } from "@/components/TodaySignalCard";
import { getMainTabHeaderClearance } from "@/navigation/tab-bar-layout";
import {
  WeeklyRecapCard,
  BeatLastWeekCard,
} from "@/components/WeeklyRecapCard";
import { MonthRecapCard } from "@/components/MonthRecapCard";
import { WitnessCelebrationCard } from "@/components/WitnessCelebrationCard";
import { YearRecapCard } from "@/components/YearRecapCard";
import { SecondPersonaInviteCard } from "@/components/SecondPersonaInviteCard";
import { Toast } from "@/components/Toast";
import { logger } from "@/lib/logger";
import {
  buildMonthRecap,
  buildYearRecap,
  getPreviousMonthKey,
} from "@/lib/recap";
import { computeCoachObservation } from "@/lib/insights";
import { track } from "@/lib/telemetry";
import { computeTodaySignal } from "@/lib/ambient-coach";
import {
  buildWitnessCelebration,
  getWitnessSettings,
  type WitnessSettings,
} from "@/lib/witness";
import {
  getMonthKey,
  SECOND_PERSONA_INVITE_SEEN_KEY,
  shouldOfferSecondPersona,
} from "@/lib/persona-invitation";

const FIRST_DAY_COMPLETE_KEY = "today_first_day_complete_seen";
// {count, lastDate} of distinct fully-complete days, for timing the one-time
// App Store review ask at the seventh day-complete celebration
const REVIEW_COMPLETE_DAYS_KEY = "today_review_complete_days";
const REVIEW_REQUESTED_KEY = "today_review_requested";
const REVIEW_ASK_AFTER_DAYS = 7;
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
const WITNESS_CELEBRATION_SEEN_KEY = "today_witness_celebration_seen_week";
const YEAR_RECAP_SEEN_KEY = "today_year_recap_seen_year";
// One-time widget/Siri hint shown at a day-complete moment — the habit loop's
// best trigger surface is invisible unless the app says it exists once
const WIDGET_HINT_SEEN_KEY = "today_widget_hint_seen";

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

function TomorrowLink({
  count,
  centered,
  onPress,
}: {
  count: number;
  centered?: boolean;
  onPress: () => void;
}) {
  const { theme } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`View ${count} ${count === 1 ? "action" : "actions"} scheduled for tomorrow in the calendar`}
      style={({ pressed }) => [
        styles.tomorrowLink,
        centered && styles.tomorrowLinkCentered,
        { opacity: pressed ? 0.7 : 1 },
      ]}
    >
      <Feather name="calendar" size={16} color={theme.accent} />
      <ThemedText style={[styles.tomorrowLinkText, { color: theme.accent }]}>
        {count} action{count !== 1 ? "s" : ""} tomorrow
      </ThemedText>
      <Feather name="chevron-right" size={16} color={theme.accent} />
    </Pressable>
  );
}

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
  const { theme } = useTheme();
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
      accessibilityRole="button"
      accessibilityLabel="Start your journey"
    >
      <Animated.View
        style={[
          styles.startButton,
          { backgroundColor: theme.accent },
          buttonStyle,
        ]}
      >
        <ThemedText
          style={[styles.startButtonText, { color: theme.buttonText }]}
        >
          Start Your Journey
        </ThemedText>
        <Animated.View style={arrowStyle}>
          <Feather name="arrow-right" size={20} color={theme.buttonText} />
        </Animated.View>
      </Animated.View>
    </Pressable>
  );
}

export default function TodayScreen() {
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const headerClearance = getMainTabHeaderClearance(Platform.OS, headerHeight);
  const tabBarHeight = useBottomTabBarHeight();
  const navigation = useNavigation<any>();
  const { theme, isDark } = useTheme();
  const {
    hasOnboarded,
    persona,
    personas,
    benchmarks,
    actions,
    dailyLogs,
    personaAlignment,
    progressSnapshot,
    subscription,
    toggleDailyLog,
    setDailyLogNote,
    canAddPersona,
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
  const [widgetHintSeen, setWidgetHintSeen] = useState(true);
  const [recapSeenWeek, setRecapSeenWeek] = useState<string | null>(null);
  const [nudgeSeenWeek, setNudgeSeenWeek] = useState<string | null>(null);
  const [lapseDismissedFor, setLapseDismissedFor] = useState<string | null>(
    null,
  );

  const [monthRecapSeen, setMonthRecapSeen] = useState<string | null>(null);
  const [observationSeen, setObservationSeen] = useState<string | null>(null);
  const [witnessSettings, setWitnessSettings] =
    useState<WitnessSettings | null>(null);
  const [witnessSeenWeek, setWitnessSeenWeek] = useState<string | null>(null);
  const [yearRecapSeen, setYearRecapSeen] = useState<string | null>(null);
  const [secondPersonaInviteSeen, setSecondPersonaInviteSeen] = useState<
    string | null
  >(null);

  useEffect(() => {
    Promise.all([
      AsyncStorage.getItem(WEEKLY_RECAP_SEEN_KEY),
      AsyncStorage.getItem(WEEKLY_NUDGE_SEEN_KEY),
      AsyncStorage.getItem(LAPSE_DISMISSED_KEY),
      AsyncStorage.getItem(MONTH_RECAP_SEEN_KEY),
      AsyncStorage.getItem(COACH_OBSERVATION_SEEN_KEY),
      getWitnessSettings(),
      AsyncStorage.getItem(WITNESS_CELEBRATION_SEEN_KEY),
      AsyncStorage.getItem(YEAR_RECAP_SEEN_KEY),
      AsyncStorage.getItem(SECOND_PERSONA_INVITE_SEEN_KEY),
      AsyncStorage.getItem(WIDGET_HINT_SEEN_KEY),
    ]).then(
      ([
        recapSeen,
        nudgeSeen,
        lapseSeen,
        monthSeen,
        obsSeen,
        witness,
        witnessSeen,
        yearSeen,
        secondPersonaSeen,
        widgetHint,
      ]) => {
        setRecapSeenWeek(recapSeen);
        setNudgeSeenWeek(nudgeSeen);
        setLapseDismissedFor(lapseSeen);
        setMonthRecapSeen(monthSeen);
        setObservationSeen(obsSeen);
        setWitnessSettings(witness);
        setWitnessSeenWeek(witnessSeen);
        setYearRecapSeen(yearSeen);
        setSecondPersonaInviteSeen(secondPersonaSeen);
        setWidgetHintSeen(widgetHint === "true");
        setRecapPrefsLoaded(true);
      },
    );
  }, []);

  const dismissWidgetHint = () => {
    setWidgetHintSeen(true);
    AsyncStorage.setItem(WIDGET_HINT_SEEN_KEY, "true");
  };

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

  const annualYear =
    today.getMonth() === 0 ? today.getFullYear() - 1 : today.getFullYear();
  const yearRecap = useMemo(
    () =>
      buildYearRecap(
        actions,
        dailyLogs,
        persona,
        annualYear,
        new Date(),
        subscription.isPremium ? 2 : 1,
      ),
    [actions, dailyLogs, persona, annualYear, subscription.isPremium],
  );
  const showYearRecap =
    recapPrefsLoaded &&
    subscription.isPremium &&
    (today.getMonth() === 11 || today.getMonth() === 0) &&
    yearRecap.votesCast > 0 &&
    yearRecapSeen !== String(annualYear);
  const dismissYearRecap = () => {
    setYearRecapSeen(String(annualYear));
    AsyncStorage.setItem(YEAR_RECAP_SEEN_KEY, String(annualYear));
  };

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

  const showWitnessCelebration =
    recapPrefsLoaded &&
    !showMonthRecapCard &&
    !showWeeklyRecap &&
    witnessSettings?.enabled === true &&
    weeklyRecap.lastWeek.completed > 0 &&
    witnessSeenWeek !== weeklyRecap.weekKey;

  const showSecondPersonaInvite =
    recapPrefsLoaded &&
    !showMonthRecapCard &&
    !showWeeklyRecap &&
    !showWitnessCelebration &&
    !showCoachObservation &&
    shouldOfferSecondPersona(
      personas,
      persona,
      actions,
      dailyLogs,
      secondPersonaInviteSeen,
      today,
    );

  const dismissSecondPersonaInvite = () => {
    const month = getMonthKey(today);
    setSecondPersonaInviteSeen(month);
    AsyncStorage.setItem(SECOND_PERSONA_INVITE_SEEN_KEY, month);
  };

  const exploreSecondPersona = () => {
    dismissSecondPersonaInvite();
    if (canAddPersona()) navigation.navigate("Onboarding");
    else navigation.navigate("Subscription");
  };

  const dismissWitnessCelebration = () => {
    setWitnessSeenWeek(weeklyRecap.weekKey);
    AsyncStorage.setItem(WITNESS_CELEBRATION_SEEN_KEY, weeklyRecap.weekKey);
  };

  const shareWitnessCelebration = () => {
    if (!witnessSettings) return;
    const message = buildWitnessCelebration(
      witnessSettings.name,
      persona,
      weeklyRecap.lastWeek.completed,
      weeklyRecap.lastWeek.score,
    );
    Share.share({ message })
      .then(() => {
        track("witness_progress_shared");
        dismissWitnessCelebration();
      })
      .catch((error) => logger.warn("Witness share failed:", error));
  };

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

  const todaySignal = useMemo(
    () =>
      computeTodaySignal({
        personaName: persona?.name ?? "you",
        todayKey: todayDateStr,
        todayActions,
        completedActionIds: new Set(
          completedTodayActions.map((action) => action.id),
        ),
        missedDays: showLapseCard ? lapse.missedDays : 0,
        coachObservation: showCoachObservation ? coachObservation : null,
      }),
    [
      coachObservation,
      completedTodayActions,
      lapse.missedDays,
      persona?.name,
      showCoachObservation,
      showLapseCard,
      todayActions,
      todayDateStr,
    ],
  );

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
    async (actionId: string, completionKind: "full" | "kickstart" = "full") => {
      try {
        const log = await toggleDailyLog(actionId, todayDateStr, {
          completionSource: "manual",
          completionKind,
        });
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
        const variants = [`${personaName} in action ✓`];
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

  const handleSignalPrimary = useCallback(() => {
    track("today_signal_actioned");
    if (todaySignal.primaryKind === "journey") {
      navigation.navigate("JourneyTab" as never);
      return;
    }
    if (todaySignal.actionId) {
      handleToggle(todaySignal.actionId, todaySignal.primaryKind ?? "full");
    }
  }, [handleToggle, navigation, todaySignal]);

  const openSignalCoach = () => {
    track("today_signal_actioned");
    if (todaySignal.kind === "protect-pattern") dismissCoachObservation();
    if (todaySignal.kind === "reduce-friction") dismissLapseCard();
    navigation.navigate("CoachSheet", {
      origin:
        todaySignal.kind === "reduce-friction"
          ? "lapse-recovery"
          : "today-signal",
      actionId: todaySignal.actionId,
      promptId:
        todaySignal.kind === "reduce-friction"
          ? "reduce-friction"
          : todaySignal.kind === "protect-pattern"
            ? "understand-pattern"
            : "start-today",
    });
  };

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
          log={item.log!}
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
  const latestShieldedDay = streak.shieldedDays.at(-1) ?? null;
  const latestShieldEarnedDay = streak.shieldEarnedDays.at(-1) ?? null;
  const streakCurrentForShield = streak.current;
  useEffect(() => {
    if (!hasOnboarded) return;
    (async () => {
      let previous: {
        latestShieldedDay?: string | null;
        latestShieldEarnedDay?: string | null;
      } | null = null;
      try {
        const raw = await AsyncStorage.getItem(SHIELD_STATE_KEY);
        previous = raw ? JSON.parse(raw) : null;
      } catch {
        previous = null;
      }
      const hasVersionedState =
        previous !== null &&
        ("latestShieldedDay" in previous ||
          "latestShieldEarnedDay" in previous);
      if (hasVersionedState) {
        if (
          latestShieldedDay &&
          latestShieldedDay !== previous?.latestShieldedDay
        ) {
          track("shield_used");
          setToastMessage(
            "Your shield covered a missed day — streak intact. That's what it was for. 🛡",
          );
          setToastVisible(true);
        } else if (
          latestShieldEarnedDay &&
          latestShieldEarnedDay !== previous?.latestShieldEarnedDay &&
          streakCurrentForShield > 0
        ) {
          track("shield_earned");
          setToastMessage(
            "Seven clean action-days earned you a shield. Grace, banked. 🛡",
          );
          setToastVisible(true);
        }
      }
      await AsyncStorage.setItem(
        SHIELD_STATE_KEY,
        JSON.stringify({ latestShieldedDay, latestShieldEarnedDay }),
      );
    })().catch((error) => logger.error("Failed to track shield state:", error));
  }, [
    hasOnboarded,
    latestShieldEarnedDay,
    latestShieldedDay,
    streakCurrentForShield,
  ]);

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
      actions,
      dailyLogs,
      milestoneTitles: Object.fromEntries(
        benchmarks.map((item) => [item.id, item.title]),
      ),
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
    dailyLogs,
    benchmarks,
    persona?.name,
    personaAlignment,
  ]);

  // One-time App Store review ask at the seventh day-complete celebration —
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

  const secondaryCard = showMonthRecapCard ? (
    <MonthRecapCard
      recap={monthRecap}
      onOpen={() => {
        dismissMonthRecap();
        navigation.navigate("MonthRecap", { monthKey: prevMonthKey });
      }}
      onDismiss={dismissMonthRecap}
    />
  ) : showYearRecap ? (
    <YearRecapCard
      recap={yearRecap}
      onOpen={() => {
        dismissYearRecap();
        navigation.navigate("YearRecap", { year: annualYear });
      }}
      onDismiss={dismissYearRecap}
    />
  ) : showWeeklyRecap ? (
    <WeeklyRecapCard
      recap={weeklyRecap}
      streak={streak}
      personaName={persona?.name ?? "you"}
      onDismiss={dismissWeeklyRecap}
      onStartReview={() =>
        navigation.navigate("CoachSheet", {
          origin: "recap",
          promptId: "review-week",
        })
      }
    />
  ) : showWitnessCelebration && witnessSettings ? (
    <WitnessCelebrationCard
      witnessName={witnessSettings.name}
      onShare={shareWitnessCelebration}
      onDismiss={dismissWitnessCelebration}
    />
  ) : showSecondPersonaInvite && persona ? (
    <SecondPersonaInviteCard
      personaName={persona.name}
      onExplore={exploreSecondPersona}
      onDismiss={dismissSecondPersonaInvite}
    />
  ) : showBeatLastWeekNudge ? (
    <BeatLastWeekCard
      lastWeekCompleted={weeklyRecap.lastWeek.completed}
      onDismiss={dismissBeatLastWeek}
    />
  ) : null;

  if (!hasOnboarded || !persona) {
    return (
      <ScrollView
        delaysContentTouches={false}
        style={[styles.container, { backgroundColor: theme.backgroundRoot }]}
        contentContainerStyle={[
          styles.emptyContainer,
          {
            paddingTop: headerClearance + Spacing.xl,
            paddingBottom: tabBarHeight + Spacing.xl,
          },
        ]}
        alwaysBounceVertical={false}
        decelerationRate="fast"
      >
        <StylizedAppLogo />
        <ThemedText style={styles.emptyTitle}>Begin Your Evolution</ThemedText>
        <ThemedText style={[styles.emptyText, { color: theme.textSecondary }]}>
          Define who you are becoming and build the habits that will get you
          there.
        </ThemedText>
        <AnimatedStartButton
          onPress={() => navigation.navigate("Onboarding")}
        />
      </ScrollView>
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
          paddingTop: headerClearance + Spacing.xl,
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
                style={[styles.personaLabel, { color: theme.accent }]}
              >
                Becoming
              </ThemedText>
              <ThemedText style={styles.personaName}>{persona.name}</ThemedText>
            </View>

            <TodaySignalCard
              signal={todaySignal}
              completed={completedTodayCount}
              scheduled={scheduledTodayCount}
              streakLabel={
                streak.shieldUsed
                  ? "Protected"
                  : streakCurrent > 0
                    ? `${streakCurrent} day${streakCurrent === 1 ? "" : "s"}`
                    : "Starting"
              }
              consistency={personaAlignment}
              onPrimary={
                // The ordinary-day signal names the next action but leaves
                // completing it to the action row below — one completion
                // affordance per action, not two.
                todaySignal.primaryLabel && todaySignal.kind !== "next-action"
                  ? handleSignalPrimary
                  : undefined
              }
              onCoach={todaySignal.coachPrompt ? openSignalCoach : undefined}
            />

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

            {dayComplete ? (
              <>
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
                {Platform.OS === "ios" &&
                recapPrefsLoaded &&
                !widgetHintSeen ? (
                  <View
                    style={[
                      styles.widgetHintCard,
                      {
                        backgroundColor: isDark
                          ? Colors.dark.backgroundDefault
                          : Colors.light.backgroundDefault,
                        borderColor: `${theme.accent}40`,
                      },
                    ]}
                  >
                    <View style={styles.widgetHintHeader}>
                      <Feather name="grid" size={18} color={theme.accent} />
                      <ThemedText style={styles.widgetHintTitle}>
                        Log without opening the app
                      </ThemedText>
                    </View>
                    <ThemedText
                      style={[
                        styles.widgetHintBody,
                        { color: theme.textSecondary },
                      ]}
                    >
                      Add the &ldquo;Take the Next Step&rdquo; widget to your
                      Home or Lock Screen to cast tomorrow&rsquo;s votes with
                      one tap. Siri works too: &ldquo;Log my kickstart in
                      Resolution Companion.&rdquo;
                    </ThemedText>
                    <Pressable
                      onPress={dismissWidgetHint}
                      hitSlop={8}
                      accessibilityRole="button"
                      accessibilityLabel="Dismiss widget hint"
                      style={({ pressed }) => [
                        styles.widgetHintDismiss,
                        { opacity: pressed ? 0.6 : 1 },
                      ]}
                    >
                      <ThemedText
                        style={[
                          styles.widgetHintDismissText,
                          { color: theme.accent },
                        ]}
                      >
                        Got it
                      </ThemedText>
                    </Pressable>
                  </View>
                ) : null}
              </>
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
                <Feather name="check-circle" size={32} color={theme.success} />
                <ThemedText style={styles.noActionsText}>
                  No actions scheduled for today. Rest and recharge!
                </ThemedText>
                {tomorrowActions.length > 0 ? (
                  <TomorrowLink
                    count={tomorrowActions.length}
                    onPress={() => {
                      navigation.navigate("JourneyTab" as never);
                    }}
                  />
                ) : null}
              </View>
            ) : null}
          </>
        }
        ListFooterComponent={
          <>
            {secondaryCard}
            {!dayComplete &&
            todayActions.length > 0 &&
            tomorrowActions.length > 0 ? (
              <TomorrowLink
                count={tomorrowActions.length}
                centered
                onPress={() => {
                  navigation.navigate("JourneyTab" as never);
                }}
              />
            ) : null}
          </>
        }
      />
      <Toast
        message={toastMessage}
        visible={toastVisible}
        onHide={() => setToastVisible(false)}
        type="success"
        topOffset={headerClearance + Spacing.md}
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
    flexGrow: 1,
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
  widgetHintCard: {
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    padding: Spacing.lg,
    marginTop: Spacing.md,
  },
  widgetHintHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  widgetHintTitle: {
    ...Typography.body,
    fontWeight: "600",
    flex: 1,
  },
  widgetHintBody: {
    ...Typography.small,
    lineHeight: 20,
    marginTop: Spacing.sm,
  },
  widgetHintDismiss: {
    alignSelf: "flex-end",
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    marginTop: Spacing.xs,
  },
  widgetHintDismissText: {
    ...Typography.small,
    fontWeight: "700",
  },
});
