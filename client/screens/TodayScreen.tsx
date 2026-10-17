import React, {
  useMemo,
  useEffect,
  useCallback,
  useLayoutEffect,
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
  AppState,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { useIsFocused, useNavigation } from "@react-navigation/native";
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
import { useLocalDateKey } from "@/hooks/useLocalDateKey";
import { useApp } from "@/context/AppContext";
import type { DailyLog, ElementalAction } from "@/lib/storage";
import {
  actionIsScheduledOnDate,
  tomorrowDateKey,
  nextScheduledDay,
} from "@/lib/journey-date";
import { computeMomentumScore, withLogInIndex } from "@/lib/progress";
import {
  suppressReminderForToday,
  ensureReminderScheduled,
  applySuggestedReminderBucket,
  suggestReminderBucket,
  getReminderPrimerShownDays,
  saveReminderPrimerShownDays,
  type ReminderOptions,
} from "@/lib/notifications";
import { createTrailingDebounce } from "@/lib/debounce";
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
import { PlanCountdownCard } from "@/components/PlanCountdownCard";
import { ReminderPrimerCard } from "@/components/ReminderPrimerCard";
import { withAlpha } from "@/lib/color";
import {
  buildTodayProgressLine,
  canShowReminderPrimer,
  countCompletedDays,
  isWeeklyRecapFresh,
  parseReminderPrimerDays,
  planDayNumber,
  recordReminderPrimerDay,
  selectTodayOptionalCard,
  WIDGET_HINT_MIN_COMPLETED_DAYS,
} from "@/lib/today-layout";
import {
  getMonthProgressDisplay,
  showsMonthConsistency,
} from "@/lib/journey-layout";

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

// Reminder rescheduling cancels and re-adds every pending notification, so
// it runs after taps settle instead of once per check-off. Only the final
// state matters; a burst of taps collapses into one run.
const REMINDER_RESCHEDULE_DEBOUNCE_MS = 1500;

interface ReminderMaintenance {
  copy: ReminderOptions & { actions: { anchorLink?: string }[] };
  dayComplete: boolean;
}

// Records the anchor-derived time suggestion, then goes quiet once the day
// is done or restores the chain otherwise.
function maintainReminders({ copy, dayComplete }: ReminderMaintenance) {
  (async () => {
    await applySuggestedReminderBucket(
      suggestReminderBucket(copy.actions.map((a) => a.anchorLink)),
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
}

// try/catch lives in these module helpers, outside the component: the
// React Compiler skips a whole component over try/catch with conditional
// expressions inside it.
interface ShieldState {
  latestShieldedDay?: string | null;
  latestShieldEarnedDay?: string | null;
}

async function readShieldState(): Promise<ShieldState | null> {
  try {
    const raw = await AsyncStorage.getItem(SHIELD_STATE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function parseReviewDays(raw: string | null): {
  count: number;
  lastDate: string;
} {
  try {
    if (raw) return JSON.parse(raw);
  } catch {
    // Corrupt marker: restart the count; worst case the ask comes later
  }
  return { count: 0, lastDate: "" };
}

async function requestStoreReviewOnce(): Promise<void> {
  try {
    if (await StoreReview.hasAction()) {
      await StoreReview.requestReview();
      await AsyncStorage.setItem(REVIEW_REQUESTED_KEY, "true");
    }
  } catch (error) {
    logger.error("Failed to request store review:", error);
  }
}

// Focus is read here rather than in TodayScreen so a tab switch re-renders
// only the toast, not the whole Today tree.
function FocusedToast(props: React.ComponentProps<typeof Toast>) {
  const isFocused = useIsFocused();
  return <Toast {...props} visible={props.visible && isFocused} />;
}

interface ToggleContext {
  todayActions: ElementalAction[];
  dailyLogs: DailyLog[];
  actions: ElementalAction[];
  personaName: string;
  personaAlignment: number;
  logIndex: Map<string, DailyLog>;
}

/**
 * Toast copy after a completion, or null when it finished the day (the
 * celebration card takes over). `ctx` may predate the toggle, so the log is
 * upserted before counting.
 */
function toggleToastMessage(
  log: DailyLog,
  ctx: ToggleContext,
  todayDateStr: string,
  variantIndex: number,
): string | null {
  const newLogs = ctx.dailyLogs.some((l) => l.id === log.id)
    ? ctx.dailyLogs.map((l) => (l.id === log.id ? log : l))
    : [...ctx.dailyLogs, log];
  const isDone = (id: string) =>
    newLogs.some(
      (l) =>
        l.actionId === id &&
        l.logDate.split("T")[0] === todayDateStr &&
        l.status,
    );
  const remaining = ctx.todayActions.filter((a) => !isDone(a.id)).length;
  if (remaining === 0 && ctx.todayActions.length > 0) return null;

  // Identity-framed toast variants (variable reward, rotating). Delta uses
  // the month-to-date window so the number matches the Monthly Consistency
  // chip and Progress ring.
  const delta =
    computeMomentumScore(
      ctx.actions,
      newLogs,
      new Date().getDate(),
      withLogInIndex(ctx.logIndex, log),
    ) - ctx.personaAlignment;
  const variants = [`${ctx.personaName} in action ✓`];
  if (delta > 0) variants.push(`Consistency +${delta}%`);
  variants.push(`${remaining} to go. The ring is filling up`);
  return variants[variantIndex % variants.length];
}

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
      accessibilityLabel={`View ${count} ${count === 1 ? "habit" : "habits"} planned for tomorrow in the calendar`}
      style={({ pressed }) => [
        styles.tomorrowLink,
        centered && styles.tomorrowLinkCentered,
        { opacity: pressed ? 0.7 : 1 },
      ]}
    >
      <Feather name="calendar" size={16} color={theme.accent} />
      <ThemedText style={[styles.tomorrowLinkText, { color: theme.accent }]}>
        {count} habit{count !== 1 ? "s" : ""} tomorrow
      </ThemedText>
      <Feather name="chevron-right" size={16} color={theme.accent} />
    </Pressable>
  );
}

function StylizedAppLogo() {
  const { theme } = useTheme();
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
      <Animated.View
        style={[
          logoStyles.glowOuter,
          { backgroundColor: theme.accent },
          glowStyle,
        ]}
      />
      <Animated.View
        style={[
          logoStyles.outerRing,
          { borderColor: withAlpha(theme.accent, 0.4) },
          outerRingStyle,
        ]}
      >
        <View
          style={[logoStyles.gradientDot1, { backgroundColor: theme.accent }]}
        />
        <View style={logoStyles.gradientDot2} />
        <View style={logoStyles.gradientDot3} />
        <View style={logoStyles.gradientDot4} />
      </Animated.View>
      <View
        style={[
          logoStyles.innerCircle,
          { backgroundColor: withAlpha(theme.accent, 0.2) },
        ]}
      >
        <View
          style={[
            logoStyles.compassCore,
            { backgroundColor: withAlpha(theme.accent, 0.3) },
          ]}
        >
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
  },
  outerRing: {
    position: "absolute",
    width: 110,
    height: 110,
    borderRadius: 55,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  gradientDot1: {
    position: "absolute",
    top: -4,
    width: 8,
    height: 8,
    borderRadius: 4,
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
    alignItems: "center",
    justifyContent: "center",
  },
  compassCore: {
    width: 70,
    height: 70,
    borderRadius: 35,
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
      accessibilityLabel="Make my plan"
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
          Make my plan
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
    reminderPrimerPending,
    answerReminderPrimer,
    milestoneCelebration,
  } = useApp();

  // Re-renders on a date change, so everything below that reads `today`
  // follows it (including a January 1 plan flipping on at midnight).
  const todayDateStr = useLocalDateKey();
  const today = new Date();
  // A plan set up ahead of time (for January 1) starts at its createdAt.
  const personaCreatedAt = persona?.createdAt;
  const planStart = useMemo(() => {
    if (!personaCreatedAt) return null;
    const start = new Date(personaCreatedAt);
    return getLocalDateString(start) > todayDateStr ? start : null;
  }, [personaCreatedAt, todayDateStr]);

  const personaBenchmarkIds = useMemo(() => {
    return benchmarks
      .filter((b) => b.personaId === persona?.id)
      .map((b) => b.id);
  }, [benchmarks, persona?.id]);

  // Scheduled means the weekday matches AND the habit has started, so a plan
  // set up for January 1 shows nothing to check off (or miss) before then.
  const todayActions = useMemo(() => {
    const day = new Date(`${todayDateStr}T12:00:00`);
    return actions
      .filter((action) => personaBenchmarkIds.includes(action.benchmarkId))
      .filter((action) => actionIsScheduledOnDate(action, day));
  }, [actions, personaBenchmarkIds, todayDateStr]);
  const nextDay = useMemo(
    () =>
      nextScheduledDay(
        actions.filter((action) =>
          personaBenchmarkIds.includes(action.benchmarkId),
        ),
        new Date(`${todayDateStr}T12:00:00`),
      ),
    [actions, personaBenchmarkIds, todayDateStr],
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

  const completedDayCount = useMemo(
    () => countCompletedDays(dailyLogs),
    [dailyLogs],
  );
  const planDay = persona?.createdAt
    ? planDayNumber(
        getLocalDateString(new Date(persona.createdAt)),
        todayDateStr,
      )
    : 1;
  // Journey's rule decides whether a month percentage is meaningful yet, so
  // Today never shows "100% this month" while Journey still says "Day 1".
  const showMonthConsistency = useMemo(
    () =>
      showsMonthConsistency(
        getMonthProgressDisplay({
          actions: actions.filter((action) =>
            personaBenchmarkIds.includes(action.benchmarkId),
          ),
          logIndex: progressSnapshot.logIndex,
          planStartedAt: persona?.createdAt,
          now: new Date(`${todayDateStr}T12:00:00`),
        }),
      ),
    [
      actions,
      personaBenchmarkIds,
      progressSnapshot.logIndex,
      persona?.createdAt,
      todayDateStr,
    ],
  );
  const progressLine = buildTodayProgressLine({
    completed: completedTodayCount,
    scheduled: scheduledTodayCount,
    streak: streakCurrent,
    shieldUsed: streak.shieldUsed,
    planDay,
    consistency: personaAlignment,
    showConsistency: showMonthConsistency,
  });

  const [toastVisible, setToastVisible] = useState(false);
  const [toastMessage, setToastMessage] = useState("");
  // Stable so the Toast's timer isn't restarted by every Today re-render
  const hideToast = useCallback(() => setToastVisible(false), []);
  // True only when the final action was checked in this session, so
  // reopening the app shows the completed state without re-animating
  const [celebrateDayComplete, setCelebrateDayComplete] = useState(false);
  const [isFirstDayComplete, setIsFirstDayComplete] = useState(false);

  // Weekly recap / nudge / lapse-card dismissal state loads from AsyncStorage
  // once; nothing renders until it has, so cards never flash-then-vanish
  const [recapPrefsLoaded, setRecapPrefsLoaded] = useState(false);
  const [widgetHintSeen, setWidgetHintSeen] = useState(true);
  // null until loaded, so the primer never flashes on a day past its cap
  const [primerShownDays, setPrimerShownDays] = useState<string[] | null>(null);
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

  useEffect(() => {
    getReminderPrimerShownDays().then((raw) =>
      setPrimerShownDays(parseReminderPrimerDays(raw)),
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
  // Recaps are built only while their card can show: every check-off
  // changes dailyLogs, and a hidden recap would otherwise rewalk history on
  // each tap. The snapshot's index and streak share the recap's maxShields.
  // Derived from the date key, not the shared `today` Date: the compiler
  // treats Date method calls as possible mutation, so values taken from it
  // could not feed memo dependencies.
  const prevMonthKey = getPreviousMonthKey(
    new Date(`${todayDateStr}T12:00:00`),
  );
  const monthRecapEligible =
    recapPrefsLoaded &&
    today.getDate() <= MONTH_RECAP_WINDOW_DAYS &&
    monthRecapSeen !== prevMonthKey;
  const monthRecap = useMemo(
    () =>
      monthRecapEligible
        ? buildMonthRecap(
            actions,
            dailyLogs,
            persona,
            prevMonthKey,
            new Date(),
            subscription.isPremium ? 2 : 1,
            {
              logIndex: progressSnapshot.logIndex,
              streak: progressSnapshot.streak,
            },
          )
        : null,
    [
      monthRecapEligible,
      actions,
      dailyLogs,
      persona,
      prevMonthKey,
      subscription.isPremium,
      progressSnapshot.logIndex,
      progressSnapshot.streak,
    ],
  );
  const showMonthRecapCard = monthRecap !== null && monthRecap.votesCast > 0;

  const dismissMonthRecap = () => {
    setMonthRecapSeen(prevMonthKey);
    AsyncStorage.setItem(MONTH_RECAP_SEEN_KEY, prevMonthKey);
  };

  const showWeeklyRecap =
    recapPrefsLoaded &&
    !showMonthRecapCard &&
    isWeeklyRecapFresh(today) &&
    weeklyRecap.lastWeek.scheduled > 0 &&
    recapSeenWeek !== weeklyRecap.weekKey;

  const todayYear = Number(todayDateStr.slice(0, 4));
  const annualYear =
    todayDateStr.slice(5, 7) === "01" ? todayYear - 1 : todayYear;
  const yearRecapEligible =
    recapPrefsLoaded &&
    subscription.isPremium &&
    (today.getMonth() === 11 || today.getMonth() === 0) &&
    yearRecapSeen !== String(annualYear);
  const yearRecap = useMemo(
    () =>
      yearRecapEligible
        ? buildYearRecap(
            actions,
            dailyLogs,
            persona,
            annualYear,
            new Date(),
            subscription.isPremium ? 2 : 1,
            {
              logIndex: progressSnapshot.logIndex,
              streak: progressSnapshot.streak,
            },
          )
        : null,
    [
      yearRecapEligible,
      actions,
      dailyLogs,
      persona,
      annualYear,
      subscription.isPremium,
      progressSnapshot.logIndex,
      progressSnapshot.streak,
    ],
  );
  const showYearRecap = yearRecap !== null && yearRecap.votesCast > 0;
  const dismissYearRecap = () => {
    setYearRecapSeen(String(annualYear));
    AsyncStorage.setItem(YEAR_RECAP_SEEN_KEY, String(annualYear));
  };

  // The coach's one proactive weekly observation — locally computed, shown
  // once per pattern per week, and never stacked on top of a recap card
  const coachObservation = useMemo(
    () =>
      computeCoachObservation(
        actions,
        dailyLogs,
        persona?.name ?? "you",
        new Date(),
        progressSnapshot.logIndex,
      ),
    [actions, dailyLogs, persona?.name, progressSnapshot.logIndex],
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

  // Memoized because the eligibility check rescans 30 days of logs; it
  // only needs to rerun when its inputs or the local date change.
  const secondPersonaGate =
    recapPrefsLoaded &&
    !showMonthRecapCard &&
    !showWeeklyRecap &&
    !showWitnessCelebration &&
    !showCoachObservation;
  const showSecondPersonaInvite = useMemo(
    () =>
      secondPersonaGate &&
      shouldOfferSecondPersona(
        personas,
        persona,
        actions,
        dailyLogs,
        secondPersonaInviteSeen,
        new Date(`${todayDateStr}T12:00:00`),
      ),
    [
      secondPersonaGate,
      personas,
      persona,
      actions,
      dailyLogs,
      secondPersonaInviteSeen,
      todayDateStr,
    ],
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
  const latestRef = useRef<ToggleContext>({
    todayActions,
    dailyLogs,
    actions,
    personaName: persona?.name ?? "",
    personaAlignment,
    logIndex: progressSnapshot.logIndex,
  });
  useEffect(() => {
    latestRef.current = {
      todayActions,
      dailyLogs,
      actions,
      personaName: persona?.name ?? "",
      personaAlignment,
      logIndex: progressSnapshot.logIndex,
    };
  });
  const toastVariantRef = useRef(0);

  // Stable reference so memoized ActionCards skip re-rendering on each toggle.
  // A promise chain rather than try/catch keeps this compiler-optimizable.
  const handleToggle = useCallback(
    (actionId: string, completionKind: "full" | "kickstart" = "full") =>
      toggleDailyLog(actionId, todayDateStr, {
        completionSource: "manual",
        completionKind,
      })
        .then((log) => {
          if (!log.status) return;
          const message = toggleToastMessage(
            log,
            latestRef.current,
            todayDateStr,
            toastVariantRef.current,
          );
          if (message === null) {
            // Final action of the day: the celebration card takes over, with
            // a double haptic so it reads as an event, not an acknowledgment
            setCelebrateDayComplete(true);
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            setTimeout(() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
            }, 300);
            return;
          }
          setToastMessage(message);
          toastVariantRef.current += 1;
          setToastVisible(true);
        })
        .catch((error) => {
          logger.error("Failed to toggle action:", error);
        }),
    [toggleDailyLog, todayDateStr],
  );

  const openTomorrow = useCallback(() => {
    navigation.navigate(
      "JourneyTab" as never,
      {
        date: tomorrowDateKey(),
        intentId: String(Date.now()),
      } as never,
    );
  }, [navigation]);

  const handleSignalPrimary = useCallback(() => {
    track("today_signal_actioned");
    if (todaySignal.primaryKind === "journey") {
      if (todaySignal.kind === "rest") openTomorrow();
      else navigation.navigate("JourneyTab" as never);
      return;
    }
    if (todaySignal.actionId) {
      handleToggle(todaySignal.actionId, todaySignal.primaryKind ?? "full");
    }
  }, [handleToggle, navigation, openTomorrow, todaySignal]);

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

  // The ordinary "Up next" signal only repeated the habit card, so its
  // coach entry moved into that card's footer with the same origin/prompt
  const openHabitCoach = useCallback(
    (actionId: string) => {
      track("today_signal_actioned");
      navigation.navigate("CoachSheet", {
        origin: "today-signal",
        actionId,
        promptId: "start-today",
      });
    },
    [navigation],
  );
  const habitCoachLink = todaySignal.kind === "next-action";
  const showSignalCard =
    todaySignal.kind === "reduce-friction" ||
    todaySignal.kind === "protect-pattern";

  const tomorrowActions = useMemo(() => {
    const day = new Date(
      `${tomorrowDateKey(new Date(`${todayDateStr}T12:00:00`))}T12:00:00`,
    );
    return actions
      .filter((action) => personaBenchmarkIds.includes(action.benchmarkId))
      .filter((action) => actionIsScheduledOnDate(action, day));
  }, [actions, personaBenchmarkIds, todayDateStr]);

  const todayRows = useMemo(
    () => [
      ...pendingTodayActions.map((action, index) => ({
        kind: "pending" as const,
        action,
        log: todayLogByActionId.get(action.id) ?? null,
        askCoach: index === 0 && habitCoachLink,
      })),
      ...completedTodayActions.map((action) => ({
        kind: "completed" as const,
        action,
        log: todayLogByActionId.get(action.id) ?? null,
        askCoach: false,
      })),
    ],
    [
      completedTodayActions,
      habitCoachLink,
      pendingTodayActions,
      todayLogByActionId,
    ],
  );

  // Optional "how it went" note on a completed action. One native prompt,
  // fully skippable — the completion tap itself stays friction-free.
  const todayLogByActionIdRef = useRef(todayLogByActionId);
  useLayoutEffect(() => {
    todayLogByActionIdRef.current = todayLogByActionId;
  }, [todayLogByActionId]);
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
        "One line for future you. Your coach reads these too.",
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
          onAskCoach={item.askCoach ? openHabitCoach : undefined}
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
    [handleToggle, handleNotePress, openHabitCoach],
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
      const previous = await readShieldState();
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
            "An earned rest day covered a missed day. Your streak is safe.",
          );
          setToastVisible(true);
        } else if (
          latestShieldEarnedDay &&
          latestShieldEarnedDay !== previous?.latestShieldEarnedDay &&
          streakCurrentForShield > 0
        ) {
          track("shield_earned");
          setToastMessage(
            "Seven days in a row earned you a rest day. Use it when life happens.",
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

  // Daily reminder maintenance, debounced off the tap path (see
  // maintainReminders). Leaving the screen or the app flushes the latest
  // state so the schedule never stays behind the last check-off.
  const [reminderDebounce] = useState(() =>
    createTrailingDebounce(maintainReminders, REMINDER_RESCHEDULE_DEBOUNCE_MS),
  );
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      if (state !== "active") reminderDebounce.flush();
    });
    return () => {
      subscription.remove();
      reminderDebounce.flush();
    };
  }, [reminderDebounce]);
  const lapseMissedDays = lapse.missedDays;
  useEffect(() => {
    if (Platform.OS === "web" || !hasOnboarded) {
      reminderDebounce.cancel();
      return;
    }
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
    reminderDebounce.schedule({ copy, dayComplete });
    // A background launch (notification "Mark all done") never changes
    // AppState, so a pending timer could be suspended before it runs.
    if (AppState.currentState !== "active") reminderDebounce.flush();
  }, [
    reminderDebounce,
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
  // Never stacked on the milestone modal or a toast; a skipped ask retries
  // at the next day-complete because the key is written only once it runs.
  const reviewBlocked = toastVisible || milestoneCelebration !== null;
  const reviewBlockedRef = useRef(reviewBlocked);
  useLayoutEffect(() => {
    reviewBlockedRef.current = reviewBlocked;
  }, [reviewBlocked]);
  useEffect(() => {
    if (!celebrateDayComplete || Platform.OS === "web") return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    (async () => {
      const [rawDays, requested] = await Promise.all([
        AsyncStorage.getItem(REVIEW_COMPLETE_DAYS_KEY),
        AsyncStorage.getItem(REVIEW_REQUESTED_KEY),
      ]);
      let days = parseReviewDays(rawDays);
      if (days.lastDate !== todayDateStr) {
        days = { count: days.count + 1, lastDate: todayDateStr };
        await AsyncStorage.setItem(
          REVIEW_COMPLETE_DAYS_KEY,
          JSON.stringify(days),
        );
      }
      if (requested || days.count < REVIEW_ASK_AFTER_DAYS || cancelled) return;
      timer = setTimeout(async () => {
        if (cancelled || reviewBlockedRef.current) return;
        await requestStoreReviewOnce();
      }, 4000);
    })().catch((error) => {
      logger.error("Failed to track review timing:", error);
    });
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [celebrateDayComplete, todayDateStr]);

  // Recaps and the witness celebration expire within days, so they get the
  // slot ahead of the teach-once tips (see selectTodayOptionalCard).
  const timeLimitedCard = showMonthRecapCard ? (
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
  ) : null;

  const secondaryCard =
    showSecondPersonaInvite && persona ? (
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

  const showReminderPrimer =
    reminderPrimerPending &&
    actions.length > 0 &&
    primerShownDays !== null &&
    canShowReminderPrimer(primerShownDays, todayDateStr);
  const showWidgetHint =
    Platform.OS === "ios" &&
    recapPrefsLoaded &&
    !widgetHintSeen &&
    dayComplete &&
    completedDayCount >= WIDGET_HINT_MIN_COMPLETED_DAYS;
  const optionalCard = selectTodayOptionalCard({
    timeLimited: timeLimitedCard !== null,
    primer: showReminderPrimer,
    widgetHint: showWidgetHint,
    secondary: secondaryCard !== null,
  });

  // A day counts toward the primer's cap only when it actually held the slot
  useEffect(() => {
    if (optionalCard !== "primer" || primerShownDays === null) return;
    const next = recordReminderPrimerDay(primerShownDays, todayDateStr);
    if (next === primerShownDays) return;
    setPrimerShownDays(next);
    saveReminderPrimerShownDays(next).catch((error) =>
      logger.warn("Failed to record reminder primer day:", error),
    );
  }, [optionalCard, primerShownDays, todayDateStr]);

  const showWidgetHowTo = () => {
    Alert.alert(
      "Check off without opening the app",
      "Add the “Take the Next Step” widget to your Home or Lock Screen to check off your habit with one tap. Siri works too: “Log my kickstart in Resolution Companion.” Walks and workouts can even check themselves off with Apple Health: turn it on when you edit a habit.",
      [{ text: "Got it", onPress: dismissWidgetHint }],
    );
  };

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
        <ThemedText style={styles.emptyTitle}>
          What&rsquo;s your resolution?
        </ThemedText>
        <ThemedText style={[styles.emptyText, { color: theme.textSecondary }]}>
          Turn it into one small habit, with a coach that keeps you going past
          January.
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
              <ThemedText style={styles.personaLine}>
                <ThemedText
                  style={[
                    styles.personaLine,
                    styles.personaLabel,
                    { color: theme.textSecondary },
                  ]}
                >
                  Becoming{" "}
                </ThemedText>
                {persona.name}
              </ThemedText>
              {persona.resolution ? (
                <ThemedText
                  style={[styles.resolution, { color: theme.textSecondary }]}
                  numberOfLines={1}
                >
                  Resolution: {persona.resolution}
                </ThemedText>
              ) : null}
            </View>

            {/* Always visible: the streak was hidden behind a tap, so an
                engaged user's Today looked the same as day one. The finished
                day's card states these facts itself. */}
            {todayActions.length > 0 && !dayComplete && !planStart ? (
              <ThemedText
                style={[styles.progressLine, { color: theme.textSecondary }]}
                accessibilityLabel={progressLine.accessibilityLabel}
              >
                {progressLine.parts.join(" · ")}
              </ThemedText>
            ) : null}

            {todayActions.length > 0 &&
            !dayComplete &&
            !planStart &&
            showSignalCard ? (
              <TodaySignalCard
                signal={todaySignal}
                onPrimary={
                  // Logging belongs to the action row, including small versions.
                  todaySignal.primaryKind === "journey"
                    ? handleSignalPrimary
                    : undefined
                }
                onCoach={todaySignal.coachPrompt ? openSignalCoach : undefined}
              />
            ) : null}

            {dayComplete ? (
              <DayCompleteCard
                streak={streak.current}
                personaName={persona.name}
                momentum={personaAlignment}
                momentumDelta={momentumDelta}
                showMonthConsistency={showMonthConsistency}
                planDay={planDay}
                tomorrowCount={tomorrowActions.length}
                tomorrowFirstTitle={tomorrowActions[0]?.title}
                isFirstEver={isFirstDayComplete}
                celebrate={celebrateDayComplete}
                onTomorrowPress={openTomorrow}
              />
            ) : planStart ? (
              <PlanCountdownCard start={planStart} firstAction={actions[0]} />
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
                  name={dailyLogs.length === 0 ? "calendar" : "moon"}
                  size={32}
                  color={theme.accent}
                />
                <ThemedText style={styles.noActionsText}>
                  {dailyLogs.length === 0
                    ? "Your plan is ready."
                    : "Nothing planned for today. Rest counts too."}
                </ThemedText>
                {nextDay ? (
                  <Pressable
                    onPress={() =>
                      navigation.navigate(
                        "JourneyTab" as never,
                        {
                          date: nextDay.dateKey,
                          intentId: String(Date.now()),
                        } as never,
                      )
                    }
                    accessibilityRole="button"
                    accessibilityLabel={`View next scheduled day, ${nextDay.date.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}, in Journey`}
                    hitSlop={8}
                    pressRetentionOffset={12}
                    style={({ pressed }) => [
                      styles.nextDayLink,
                      { opacity: pressed ? 0.6 : 1 },
                    ]}
                  >
                    <ThemedText
                      style={{
                        color: theme.accent,
                        fontWeight: "600",
                        textAlign: "center",
                      }}
                    >
                      Next up:{" "}
                      {nextDay.date.toLocaleDateString("en-US", {
                        weekday: "long",
                        month: "short",
                        day: "numeric",
                      })}
                    </ThemedText>
                    <ThemedText style={{ textAlign: "center" }}>
                      {nextDay.actions[0].title}
                    </ThemedText>
                    <ThemedText
                      style={{ color: theme.accent, textAlign: "center" }}
                    >
                      View scheduled day
                    </ThemedText>
                  </Pressable>
                ) : null}
              </View>
            ) : null}
          </>
        }
        ListFooterComponent={
          <>
            {/* One optional card at a time, always below the habit (and below
                a finished day's card), never between the user and the tap. */}
            {optionalCard === "primer" ? (
              <ReminderPrimerCard
                actions={actions}
                startLabel={planStart?.toLocaleDateString("en-US", {
                  month: "long",
                  day: "numeric",
                })}
                filled={pendingTodayActions.length === 0}
                onAnswer={(accept) => {
                  void answerReminderPrimer(accept);
                }}
              />
            ) : optionalCard === "widget-hint" ? (
              <View
                style={[
                  styles.widgetHintCard,
                  {
                    backgroundColor: isDark
                      ? Colors.dark.backgroundDefault
                      : Colors.light.backgroundDefault,
                    borderColor: withAlpha(theme.accent, 0.25),
                  },
                ]}
              >
                <View style={styles.widgetHintHeader}>
                  <Feather
                    name="grid"
                    size={18}
                    color={theme.accent}
                    style={{ marginTop: 1 }}
                  />
                  <ThemedText
                    style={[
                      styles.widgetHintBody,
                      { color: theme.textSecondary },
                    ]}
                  >
                    Check off your habit from the Home Screen with the widget.
                  </ThemedText>
                  <Pressable
                    onPress={dismissWidgetHint}
                    hitSlop={12}
                    pressRetentionOffset={16}
                    accessibilityRole="button"
                    accessibilityLabel="Dismiss widget hint"
                    style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
                  >
                    <Feather name="x" size={18} color={theme.textSecondary} />
                  </Pressable>
                </View>
                <Pressable
                  onPress={showWidgetHowTo}
                  hitSlop={8}
                  pressRetentionOffset={12}
                  accessibilityRole="button"
                  accessibilityLabel="Show me how to add the widget"
                  style={({ pressed }) => [
                    styles.widgetHintLink,
                    { opacity: pressed ? 0.6 : 1 },
                  ]}
                >
                  <ThemedText
                    style={[styles.widgetHintLinkText, { color: theme.accent }]}
                  >
                    Show me how
                  </ThemedText>
                </Pressable>
              </View>
            ) : optionalCard === "time-limited" ? (
              timeLimitedCard
            ) : optionalCard === "secondary" ? (
              secondaryCard
            ) : null}
            {!dayComplete &&
            todayActions.length > 0 &&
            tomorrowActions.length > 0 ? (
              <TomorrowLink
                count={tomorrowActions.length}
                centered
                onPress={openTomorrow}
              />
            ) : null}
          </>
        }
      />
      <FocusedToast
        message={toastMessage}
        // Held, not dropped, while the milestone modal or a sheet it opened
        // (Add next milestone) covers Today; it plays once Today is back.
        visible={toastVisible && milestoneCelebration === null}
        onHide={hideToast}
        type="success"
        topOffset={headerClearance + Spacing.md}
      />
    </>
  );
}

const styles = StyleSheet.create({
  nextDayLink: { minHeight: 48, gap: Spacing.sm, padding: Spacing.sm },
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
  resolution: { ...Typography.small, marginTop: Spacing.xs },
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
    marginBottom: Spacing.md,
  },
  personaLine: {
    fontSize: 24,
    lineHeight: 30,
    fontWeight: "700",
  },
  personaLabel: {
    fontWeight: "400",
  },
  progressLine: {
    ...Typography.small,
    marginBottom: Spacing.md,
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
    marginTop: Spacing.sm,
    marginBottom: Spacing.lg,
    gap: Spacing.xs,
  },
  widgetHintHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: Spacing.sm,
  },
  widgetHintBody: {
    ...Typography.small,
    lineHeight: 20,
    flex: 1,
  },
  widgetHintLink: {
    alignSelf: "flex-start",
    minHeight: 44,
    justifyContent: "center",
    paddingLeft: 18 + Spacing.sm,
  },
  widgetHintLinkText: {
    ...Typography.small,
    fontWeight: "600",
  },
});
