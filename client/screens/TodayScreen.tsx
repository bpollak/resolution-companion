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
import {
  suppressReminderForToday,
  ensureReminderScheduled,
  applySuggestedReminderBucket,
  suggestReminderBucket,
} from "@/lib/notifications";
import { Colors, Spacing, Typography, BorderRadius } from "@/constants/theme";
import { ThemedText } from "@/components/ThemedText";
import { CircularProgress } from "@/components/CircularProgress";
import { ActionCard, CompletedActionRow } from "@/components/ActionCard";
import { DayCompleteCard } from "@/components/DayCompleteCard";
import { getMainTabHeaderClearance } from "@/navigation/tab-bar-layout";
import { Toast } from "@/components/Toast";
import { logger } from "@/lib/logger";
import { track } from "@/lib/telemetry";

const FIRST_DAY_COMPLETE_KEY = "today_first_day_complete_seen";
// {count, lastDate} of distinct fully-complete days, for timing the one-time
// App Store review ask at the third day-complete celebration
const REVIEW_COMPLETE_DAYS_KEY = "today_review_complete_days";
const REVIEW_REQUESTED_KEY = "today_review_requested";
const REVIEW_ASK_AFTER_DAYS = 3;

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
    benchmarks,
    actions,
    dailyLogs,
    personaAlignment,
    progressSnapshot,
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

  const [toastVisible, setToastVisible] = useState(false);
  const [toastMessage, setToastMessage] = useState("");
  // True only when the final action was checked in this session, so
  // reopening the app shows the completed state without re-animating
  const [celebrateDayComplete, setCelebrateDayComplete] = useState(false);
  const [isFirstDayComplete, setIsFirstDayComplete] = useState(false);

  // Latest per-render data for the stable handleToggle callback — widening
  // its deps would re-render every memoized ActionCard on each toggle
  const latestRef = useRef({
    todayActions,
    dailyLogs,
    personaName: persona?.name ?? "",
  });
  useEffect(() => {
    latestRef.current = {
      todayActions,
      dailyLogs,
      personaName: persona?.name ?? "",
    };
  });

  // Stable reference so memoized ActionCards skip re-rendering on each toggle
  const handleToggle = useCallback(
    async (actionId: string) => {
      try {
        const log = await toggleDailyLog(actionId, todayDateStr);
        if (!log.status) return;

        const {
          todayActions: currentActions,
          dailyLogs: currentLogs,
          personaName,
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

        setToastMessage(
          remaining === 1
            ? `A vote for ${personaName} ✓ · one left today`
            : `A vote for ${personaName} ✓`,
        );
        setToastVisible(true);
      } catch (error) {
        logger.error("Failed to toggle action:", error);
      }
    },
    [toggleDailyLog, todayDateStr],
  );

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
      <ScrollView
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
            </View>

            <View style={styles.dateContainer}>
              <View style={styles.votesHeading}>
                <ThemedText style={styles.votesTitle}>
                  Today&apos;s Votes
                </ThemedText>
                <ThemedText
                  style={[styles.dateText, { color: theme.textSecondary }]}
                >
                  {dateString}
                </ThemedText>
              </View>
              <View style={styles.actionCount}>
                <ThemedText
                  style={[
                    styles.actionCountText,
                    { color: theme.textSecondary },
                  ]}
                >
                  {completedTodayCount}/{todayActions.length} cast
                </ThemedText>
              </View>
            </View>

            {dayComplete ? (
              <DayCompleteCard
                personaName={persona.name}
                isFirstEver={isFirstDayComplete}
                celebrate={celebrateDayComplete}
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
                <Feather name="check-circle" size={32} color={theme.success} />
                <ThemedText style={styles.noActionsText}>
                  No actions scheduled for today. Rest and recharge!
                </ThemedText>
              </View>
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
  dateContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    marginBottom: Spacing.lg,
  },
  votesHeading: {
    flex: 1,
  },
  votesTitle: {
    ...Typography.headline,
  },
  dateText: {
    ...Typography.caption,
    marginTop: 3,
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
});
