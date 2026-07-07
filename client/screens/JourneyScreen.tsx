import React, { useState, useMemo, useEffect } from "react";
import { View, ScrollView, StyleSheet, Pressable } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { useNavigation } from "@react-navigation/native";
import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";

import { useTheme } from "@/hooks/useTheme";
import { useApp } from "@/context/AppContext";
import {
  buildLogIndex,
  computeMilestoneProgress,
  computeStreak,
  getLocalDateString,
} from "@/lib/progress";
import { Colors, Spacing, Typography, BorderRadius } from "@/constants/theme";
import { ThemedText } from "@/components/ThemedText";
import { CircularProgress } from "@/components/CircularProgress";
import { ProgressBar } from "@/components/ProgressBar";
import { StatChip } from "@/components/StatChip";
import { Toast } from "@/components/Toast";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const GUIDE_DISMISSED_KEY = "progress_next_steps_dismissed";
const MILESTONE_INFO_DISMISSED_KEY = "journey_milestone_info_dismissed";

interface DayInfo {
  date: Date;
  dateStr: string;
  isCurrentMonth: boolean;
  isToday: boolean;
  completedCount: number;
  totalCount: number;
  hasStreak: boolean;
}

interface SelectedDateDetailsProps {
  date: Date;
  actions: any[];
  dailyLogs: any[];
  benchmarks: any[];
  isDark: boolean;
  theme: any;
  onToggleAction: (
    actionId: string,
    dateStr: string,
    completed: boolean,
  ) => void;
}

function SelectedDateDetails({
  date,
  actions,
  dailyLogs,
  benchmarks,
  isDark,
  theme,
  onToggleAction,
}: SelectedDateDetailsProps) {
  const dateStr = getLocalDateString(date);
  const dayOfWeek = date.toLocaleDateString("en-US", { weekday: "long" });
  const formattedDate = date.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const selectedDateNormalized = new Date(date);
  selectedDateNormalized.setHours(0, 0, 0, 0);
  const isFutureDate = selectedDateNormalized > today;

  const dayActions = actions.filter(
    (a) => a.frequency && a.frequency.includes(dayOfWeek),
  );

  const actionStatuses = dayActions.map((action) => {
    const log = dailyLogs.find((l) => {
      const logDateStr = l.logDate.includes("T")
        ? l.logDate.split("T")[0]
        : l.logDate;
      return l.actionId === action.id && logDateStr === dateStr;
    });
    const benchmark = benchmarks.find((b) => b.id === action.benchmarkId);
    return {
      action,
      benchmark,
      completed: log?.status === true,
    };
  });

  const completedCount = actionStatuses.filter((a) => a.completed).length;

  const handleToggle = (actionId: string, completed: boolean) => {
    if (isFutureDate) return;
    onToggleAction(actionId, dateStr, completed);
  };

  return (
    <View
      style={[
        styles.selectedDateContainer,
        {
          backgroundColor: isDark
            ? Colors.dark.backgroundDefault
            : Colors.light.backgroundDefault,
        },
      ]}
    >
      <View style={styles.selectedDateHeader}>
        <Feather name="calendar" size={18} color={Colors.dark.accent} />
        <ThemedText style={styles.selectedDateTitle}>
          {formattedDate}
        </ThemedText>
        {dayActions.length > 0 ? (
          <ThemedText
            style={[styles.selectedDateSummary, { color: theme.textSecondary }]}
          >
            {completedCount}/{dayActions.length} done
          </ThemedText>
        ) : null}
      </View>

      {isFutureDate ? (
        <ThemedText
          style={[styles.noActionsForDay, { color: theme.textSecondary }]}
        >
          Future dates cannot be logged
        </ThemedText>
      ) : dayActions.length === 0 ? (
        <ThemedText
          style={[styles.noActionsForDay, { color: theme.textSecondary }]}
        >
          No actions scheduled
        </ThemedText>
      ) : (
        <View style={styles.selectedDateActions}>
          {actionStatuses.map(({ action, benchmark, completed }) => (
            <Pressable
              key={action.id}
              style={({ pressed }) => [
                styles.selectedDateAction,
                { opacity: pressed && !isFutureDate ? 0.6 : 1 },
              ]}
              onPress={() => handleToggle(action.id, completed)}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: completed }}
              accessibilityLabel={`${action.title}${benchmark ? `, ${benchmark.title}` : ""}`}
              accessibilityHint={
                completed
                  ? "Marks this action as not done"
                  : "Marks this action as done"
              }
            >
              <Feather
                name={completed ? "check-circle" : "circle"}
                size={18}
                color={completed ? Colors.dark.success : theme.textSecondary}
              />
              <View style={styles.selectedDateActionInfo}>
                <ThemedText
                  style={[
                    styles.selectedDateActionTitle,
                    completed && {
                      textDecorationLine: "line-through",
                      opacity: 0.7,
                    },
                  ]}
                >
                  {action.title}
                </ThemedText>
                {benchmark ? (
                  <ThemedText
                    style={[
                      styles.selectedDateBenchmark,
                      { color: theme.textSecondary },
                    ]}
                  >
                    {benchmark.title}
                  </ThemedText>
                ) : null}
              </View>
              <Feather
                name="chevron-right"
                size={16}
                color={theme.textSecondary}
                style={{ opacity: 0.5 }}
              />
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}

export default function JourneyScreen() {
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
    toggleDailyLog,
    canAddBenchmark,
    subscription,
  } = useApp();

  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(new Date());
  const [toastVisible, setToastVisible] = useState(false);
  const [toastMessage, setToastMessage] = useState("");
  const [toastType, setToastType] = useState<"success" | "info" | "warning">(
    "info",
  );

  const showToast = (
    message: string,
    type: "success" | "info" | "warning" = "info",
  ) => {
    setToastMessage(message);
    setToastType(type);
    setToastVisible(true);
  };

  const handleToggleAction = async (
    actionId: string,
    dateStr: string,
    wasCompleted: boolean,
  ) => {
    try {
      if (wasCompleted) {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      } else {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
      await toggleDailyLog(actionId, dateStr);
      const action = actions.find((a) => a.id === actionId);
      if (action) {
        showToast(
          wasCompleted
            ? `Unmarked "${action.title}"`
            : `Completed "${action.title}"`,
          wasCompleted ? "info" : "success",
        );
      }
    } catch {
      showToast("Failed to update action", "warning");
    }
  };

  const personaBenchmarks = useMemo(() => {
    return benchmarks.filter((b) => b.personaId === persona?.id);
  }, [benchmarks, persona?.id]);

  const personaActions = useMemo(() => {
    const personaBenchmarkIds = personaBenchmarks.map((b) => b.id);
    return actions.filter((a) => personaBenchmarkIds.includes(a.benchmarkId));
  }, [actions, personaBenchmarks]);

  const personaCreatedDate = useMemo(() => {
    if (!persona?.createdAt) return null;
    const date = new Date(persona.createdAt);
    date.setHours(0, 0, 0, 0);
    return date;
  }, [persona?.createdAt]);

  // Completed-log lookup keyed by actionId|date. Only completions of
  // actions actually scheduled on a given day count toward that day — a
  // flat by-date filter over-counted when unscheduled actions were logged.
  const completedLogIndex = useMemo(() => {
    const index = new Set<string>();
    for (const log of dailyLogs) {
      if (!log.status) continue;
      const dateStr = log.logDate.includes("T")
        ? log.logDate.split("T")[0]
        : log.logDate;
      index.add(`${log.actionId}|${dateStr}`);
    }
    return index;
  }, [dailyLogs]);

  const streak = useMemo(
    () => computeStreak(personaActions, dailyLogs),
    [personaActions, dailyLogs],
  );
  const shieldedDaySet = useMemo(
    () => new Set(streak.shieldedDays),
    [streak.shieldedDays],
  );

  // Fill-only milestone consistency targets (N of 21 scheduled days done)
  const milestoneProgress = useMemo(() => {
    const logIndex = buildLogIndex(dailyLogs);
    return personaBenchmarks.map((benchmark) =>
      computeMilestoneProgress(benchmark, personaActions, logIndex),
    );
  }, [personaBenchmarks, personaActions, dailyLogs]);

  const [expandedBenchmarks, setExpandedBenchmarks] = useState<Set<string>>(
    () => new Set(personaBenchmarks.map((b) => b.id)),
  );

  // Key on the id set, not array identity: personaBenchmarks is re-derived
  // on unrelated state changes and would otherwise clobber the user's
  // expand/collapse choices on every render
  const benchmarkIdsKey = personaBenchmarks
    .map((b) => b.id)
    .sort()
    .join(",");
  useEffect(() => {
    setExpandedBenchmarks(new Set(benchmarkIdsKey.split(",").filter(Boolean)));
  }, [benchmarkIdsKey]);

  const [showGuide, setShowGuide] = useState(false);
  const [showMilestoneInfo, setShowMilestoneInfo] = useState(false);

  useEffect(() => {
    Promise.all([
      AsyncStorage.getItem(GUIDE_DISMISSED_KEY),
      AsyncStorage.getItem(MILESTONE_INFO_DISMISSED_KEY),
    ]).then(([guideDismissed, infoDismissed]) => {
      if (!guideDismissed) {
        // New users learn the fill-only model inside the guide itself
        setShowGuide(true);
      } else if (!infoDismissed) {
        // Existing users get the one-time semantics-change note instead
        setShowMilestoneInfo(true);
      }
    });
  }, []);

  const dismissGuide = () => {
    setShowGuide(false);
    // The guide already explains fill-only milestones — don't show the
    // change note right after
    AsyncStorage.setItem(GUIDE_DISMISSED_KEY, "true");
    AsyncStorage.setItem(MILESTONE_INFO_DISMISSED_KEY, "true");
  };

  const dismissMilestoneInfo = () => {
    setShowMilestoneInfo(false);
    AsyncStorage.setItem(MILESTONE_INFO_DISMISSED_KEY, "true");
  };

  const toggleExpand = (benchmarkId: string) => {
    setExpandedBenchmarks((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(benchmarkId)) {
        newSet.delete(benchmarkId);
      } else {
        newSet.add(benchmarkId);
      }
      return newSet;
    });
  };

  const calendarDays = useMemo(() => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();

    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const startPadding = firstDay.getDay();

    const days: DayInfo[] = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const dayStats = (date: Date) => {
      const dateStr = getLocalDateString(date);
      const dayOfWeek = date.toLocaleDateString("en-US", { weekday: "long" });
      let total = 0;
      let completed = 0;
      for (const action of personaActions) {
        if (!action.frequency.includes(dayOfWeek)) continue;
        total++;
        if (completedLogIndex.has(`${action.id}|${dateStr}`)) completed++;
      }
      return { total, completed };
    };

    for (let i = startPadding - 1; i >= 0; i--) {
      const date = new Date(year, month, -i);
      days.push({
        date,
        dateStr: getLocalDateString(date),
        isCurrentMonth: false,
        isToday: false,
        completedCount: 0,
        totalCount: 0,
        hasStreak: false,
      });
    }

    for (let day = 1; day <= lastDay.getDate(); day++) {
      const date = new Date(year, month, day);
      const { total, completed } = dayStats(date);
      const prev = dayStats(new Date(year, month, day - 1));

      const hasStreak =
        prev.total > 0 &&
        prev.completed === prev.total &&
        total > 0 &&
        completed === total;

      days.push({
        date,
        dateStr: getLocalDateString(date),
        isCurrentMonth: true,
        isToday: date.getTime() === today.getTime(),
        completedCount: completed,
        totalCount: total,
        hasStreak,
      });
    }

    const remaining = 42 - days.length;
    for (let i = 1; i <= remaining; i++) {
      const date = new Date(year, month + 1, i);
      days.push({
        date,
        dateStr: getLocalDateString(date),
        isCurrentMonth: false,
        isToday: false,
        completedCount: 0,
        totalCount: 0,
        hasStreak: false,
      });
    }

    return days;
  }, [currentDate, personaActions, completedLogIndex]);

  const prevMonth = () => {
    setCurrentDate(
      new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1),
    );
  };

  const nextMonth = () => {
    setCurrentDate(
      new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1),
    );
  };

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
          <Feather name="map" size={64} color={theme.textSecondary} />
          <ThemedText
            style={[styles.emptyText, { color: theme.textSecondary }]}
          >
            Complete onboarding to see your journey
          </ThemedText>
        </View>
      </View>
    );
  }

  return (
    <>
      <ScrollView
        style={{ flex: 1, backgroundColor: theme.backgroundRoot }}
        contentContainerStyle={{
          paddingTop: headerHeight + Spacing.xl,
          paddingBottom: tabBarHeight + Spacing.xl,
          paddingHorizontal: Spacing.lg,
        }}
        scrollIndicatorInsets={{ bottom: insets.bottom }}
      >
        <View
          style={[
            styles.personaCard,
            {
              backgroundColor: isDark
                ? Colors.dark.backgroundDefault
                : Colors.light.backgroundDefault,
            },
          ]}
        >
          <View style={styles.personaHeader}>
            <View style={styles.personaIcon}>
              <Feather name="target" size={24} color={Colors.dark.accent} />
            </View>
            <View style={styles.personaInfo}>
              <ThemedText
                style={[styles.personaLabel, { color: Colors.dark.accent }]}
              >
                Becoming
              </ThemedText>
              <ThemedText style={styles.personaName}>{persona.name}</ThemedText>
            </View>
          </View>
          {persona.description ? (
            <ThemedText
              style={[
                styles.personaDescription,
                { color: theme.textSecondary },
              ]}
            >
              {persona.description}
            </ThemedText>
          ) : null}
        </View>

        {showGuide ? (
          <View
            style={[
              styles.guideCard,
              {
                backgroundColor: isDark
                  ? Colors.dark.backgroundDefault
                  : Colors.light.backgroundDefault,
              },
            ]}
          >
            <View style={styles.guideHeader}>
              <Feather name="compass" size={18} color={Colors.dark.accent} />
              <ThemedText style={styles.guideTitle}>Next Steps</ThemedText>
              <Pressable
                onPress={dismissGuide}
                hitSlop={12}
                accessibilityRole="button"
                accessibilityLabel="Dismiss next steps"
                style={styles.guideClose}
              >
                <Feather name="x" size={18} color={theme.textSecondary} />
              </Pressable>
            </View>
            <ThemedText
              style={[styles.guideText, { color: theme.textSecondary }]}
            >
              1. Your AI coach created the milestones below — steps on the way
              to becoming your persona. Tap Edit to adjust one or change which
              days it repeats.{"\n"}
              2. Each milestone comes with one small daily action on its
              scheduled days.{"\n"}
              3. Check off your actions in the Today tab — each completed day
              fills a milestone. Milestones only fill up, they never go
              backwards.
            </ThemedText>
            <Pressable
              onPress={() => navigation.navigate("TodayTab")}
              accessibilityRole="button"
              accessibilityLabel="Go to Today tab"
              style={({ pressed }) => [
                styles.guideCta,
                { opacity: pressed ? 0.8 : 1 },
              ]}
            >
              <ThemedText style={styles.guideCtaText}>
                Log today&rsquo;s actions
              </ThemedText>
              <Feather name="arrow-right" size={16} color="#000000" />
            </Pressable>
          </View>
        ) : null}

        {showMilestoneInfo ? (
          <View
            style={[
              styles.guideCard,
              {
                backgroundColor: isDark
                  ? Colors.dark.backgroundDefault
                  : Colors.light.backgroundDefault,
              },
            ]}
          >
            <View style={styles.guideHeader}>
              <Feather
                name="trending-up"
                size={18}
                color={Colors.dark.accent}
              />
              <ThemedText style={styles.guideTitle}>
                Milestones now fill up
              </ThemedText>
              <Pressable
                onPress={dismissMilestoneInfo}
                hitSlop={12}
                accessibilityRole="button"
                accessibilityLabel="Dismiss milestone update note"
                style={styles.guideClose}
              >
                <Feather name="x" size={18} color={theme.textSecondary} />
              </Pressable>
            </View>
            <ThemedText
              style={[styles.guideText, { color: theme.textSecondary }]}
            >
              Each milestone now completes after 21 days of doing its action on
              schedule. Progress only fills up — it never goes backwards.
            </ThemedText>
          </View>
        ) : null}

        <View style={styles.alignmentSection}>
          <CircularProgress
            progress={personaAlignment}
            size={140}
            label={`${new Date().toLocaleDateString("en-US", { month: "long" })} Consistency`}
          />
          <ThemedText
            style={[styles.alignmentHint, { color: theme.textSecondary }]}
          >
            % of scheduled actions completed so far this month — fresh start on
            the 1st
          </ThemedText>
        </View>

        <View style={styles.monthHeader}>
          <Pressable
            onPress={prevMonth}
            hitSlop={4}
            style={({ pressed }) => [
              styles.navButton,
              { opacity: pressed ? 0.6 : 1 },
            ]}
            accessibilityRole="button"
            accessibilityLabel="Previous month"
          >
            <Feather name="chevron-left" size={24} color={theme.text} />
          </Pressable>
          <ThemedText style={styles.monthTitle}>
            {MONTHS[currentDate.getMonth()]} {currentDate.getFullYear()}
          </ThemedText>
          <Pressable
            onPress={nextMonth}
            hitSlop={4}
            style={({ pressed }) => [
              styles.navButton,
              { opacity: pressed ? 0.6 : 1 },
            ]}
            accessibilityRole="button"
            accessibilityLabel="Next month"
          >
            <Feather name="chevron-right" size={24} color={theme.text} />
          </Pressable>
        </View>

        <View style={styles.daysHeader}>
          {DAYS.map((day) => (
            <View key={day} style={styles.dayHeaderCell}>
              <ThemedText
                style={[styles.dayHeaderText, { color: theme.textSecondary }]}
              >
                {day}
              </ThemedText>
            </View>
          ))}
        </View>

        <View style={styles.calendarGrid}>
          {calendarDays.map((dayInfo, index) => {
            const isComplete =
              dayInfo.totalCount > 0 &&
              dayInfo.completedCount === dayInfo.totalCount;
            const isPartial =
              dayInfo.completedCount > 0 &&
              dayInfo.completedCount < dayInfo.totalCount;
            const isAfterPersonaCreated = personaCreatedDate
              ? dayInfo.date >= personaCreatedDate
              : true;
            // Shield-bridged misses show a shield outline, not the red ring
            const isShielded =
              shieldedDaySet.has(dayInfo.dateStr) && !isComplete && !isPartial;
            const isMissed =
              !isShielded &&
              dayInfo.totalCount > 0 &&
              dayInfo.completedCount === 0 &&
              dayInfo.date < new Date() &&
              isAfterPersonaCreated;

            const isSelected =
              selectedDate !== null &&
              dayInfo.date.toDateString() === selectedDate.toDateString();
            const dateLabel = dayInfo.date.toLocaleDateString("en-US", {
              weekday: "long",
              month: "long",
              day: "numeric",
            });
            const statusLabel =
              dayInfo.totalCount === 0
                ? "no actions scheduled"
                : `${dayInfo.completedCount} of ${dayInfo.totalCount} action${dayInfo.totalCount === 1 ? "" : "s"} completed${isShielded ? ", streak protected by shield" : ""}`;

            return (
              <Pressable
                key={index}
                onPress={() => setSelectedDate(dayInfo.date)}
                style={styles.dayCell}
                accessibilityRole="button"
                accessibilityState={{ selected: isSelected }}
                accessibilityLabel={`${dayInfo.isToday ? "Today, " : ""}${dateLabel}, ${statusLabel}`}
                accessibilityHint="Shows this day's actions below the calendar"
              >
                {dayInfo.hasStreak ? (
                  <View
                    style={[
                      styles.streakLine,
                      { backgroundColor: Colors.dark.accent },
                    ]}
                  />
                ) : null}
                <View
                  style={[
                    styles.dayMarker,
                    dayInfo.isToday && styles.todayMarker,
                    dayInfo.isToday && { borderColor: Colors.dark.accent },
                    isComplete && { backgroundColor: Colors.dark.success },
                    isPartial && { backgroundColor: Colors.dark.warning },
                    isShielded && {
                      backgroundColor: "transparent",
                      borderWidth: 2,
                      borderColor: Colors.dark.accent,
                    },
                    isMissed && {
                      backgroundColor: "transparent",
                      borderWidth: 2,
                      borderColor: Colors.dark.error,
                    },
                  ]}
                >
                  <ThemedText
                    style={[
                      styles.dayText,
                      !dayInfo.isCurrentMonth && { opacity: 0.3 },
                      (isComplete || isPartial) && { color: "#000000" },
                    ]}
                  >
                    {dayInfo.date.getDate()}
                  </ThemedText>
                  {isShielded ? (
                    <View style={styles.shieldBadge}>
                      <Feather
                        name="shield"
                        size={12}
                        color={Colors.dark.accent}
                      />
                    </View>
                  ) : null}
                </View>
              </Pressable>
            );
          })}
        </View>

        <View style={styles.legendContainer}>
          <View style={styles.legendItem}>
            <View
              style={[
                styles.legendDot,
                { backgroundColor: Colors.dark.success },
              ]}
            />
            <ThemedText
              style={[styles.legendText, { color: theme.textSecondary }]}
            >
              Complete
            </ThemedText>
          </View>
          <View style={styles.legendItem}>
            <View
              style={[
                styles.legendDot,
                { backgroundColor: Colors.dark.warning },
              ]}
            />
            <ThemedText
              style={[styles.legendText, { color: theme.textSecondary }]}
            >
              Partial
            </ThemedText>
          </View>
          <View style={styles.legendItem}>
            <View
              style={[
                styles.legendDot,
                {
                  backgroundColor: "transparent",
                  borderWidth: 2,
                  borderColor: Colors.dark.error,
                },
              ]}
            />
            <ThemedText
              style={[styles.legendText, { color: theme.textSecondary }]}
            >
              Missed
            </ThemedText>
          </View>
          <View style={styles.legendItem}>
            <Feather name="shield" size={12} color={Colors.dark.accent} />
            <ThemedText
              style={[styles.legendText, { color: theme.textSecondary }]}
            >
              Shielded
            </ThemedText>
          </View>
        </View>

        {selectedDate ? (
          <SelectedDateDetails
            date={selectedDate}
            actions={personaActions}
            dailyLogs={dailyLogs}
            benchmarks={personaBenchmarks}
            isDark={isDark}
            theme={theme}
            onToggleAction={handleToggleAction}
          />
        ) : null}

        <View style={styles.streakStatsRow}>
          <StatChip
            icon={
              streak.shieldUsed ? (
                <Feather name="shield" size={14} color={theme.textSecondary} />
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
          />
          <StatChip
            icon={<Feather name="award" size={14} color={Colors.dark.accent} />}
            text={`Best: ${streak.longest} ${streak.longest === 1 ? "day" : "days"}`}
          />
        </View>

        <View style={styles.sectionHeader}>
          <ThemedText style={styles.sectionTitle}>Milestones</ThemedText>
          <Pressable
            onPress={() => navigation.navigate("BenchmarkEditor", {})}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={
              canAddBenchmark()
                ? "Add a new milestone"
                : "Add milestone, Premium feature"
            }
            style={({ pressed }) => [
              styles.addButton,
              pressed && styles.addButtonPressed,
            ]}
          >
            <Feather
              name={canAddBenchmark() ? "plus" : "lock"}
              size={16}
              color="#000000"
            />
            <ThemedText style={styles.addButtonText}>Add milestone</ThemedText>
          </Pressable>
        </View>

        {milestoneProgress.map(
          ({
            benchmark,
            actions: actionProgress,
            daysDone,
            target,
            progress,
            completed,
          }) => (
            <View key={benchmark.id}>
              <Pressable
                onPress={() => toggleExpand(benchmark.id)}
                accessibilityRole="button"
                accessibilityState={{
                  expanded: expandedBenchmarks.has(benchmark.id),
                }}
                accessibilityLabel={`${benchmark.title} milestone, ${daysDone} of ${target} days done`}
                accessibilityHint="Shows the daily actions for this milestone"
                style={({ pressed }) => [
                  styles.benchmarkCard,
                  {
                    backgroundColor: isDark
                      ? Colors.dark.backgroundDefault
                      : Colors.light.backgroundDefault,
                    opacity: pressed ? 0.9 : 1,
                  },
                  completed && styles.benchmarkCardCompleted,
                ]}
              >
                <View style={styles.benchmarkHeader}>
                  <View style={styles.benchmarkTitleCol}>
                    <View style={styles.benchmarkTitleRow}>
                      <Feather
                        name={completed ? "check-circle" : "circle"}
                        size={16}
                        color={
                          completed ? Colors.dark.success : Colors.dark.accent
                        }
                        style={styles.milestoneStatusIcon}
                      />
                      <ThemedText style={styles.benchmarkTitle}>
                        {benchmark.title}
                      </ThemedText>
                    </View>
                    {actionProgress[0]?.action.frequency ? (
                      <ThemedText
                        style={[
                          styles.frequencyBadge,
                          { color: theme.textSecondary },
                        ]}
                      >
                        {actionProgress[0].action.frequency.length >= 7
                          ? "Daily"
                          : `${actionProgress[0].action.frequency.length}×/week`}
                      </ThemedText>
                    ) : null}
                  </View>
                  <View style={styles.benchmarkMeta}>
                    <ThemedText
                      style={[
                        styles.benchmarkDays,
                        {
                          color: completed
                            ? Colors.dark.success
                            : Colors.dark.accent,
                        },
                      ]}
                    >
                      {daysDone}/{target}
                    </ThemedText>
                    <Feather
                      name={
                        expandedBenchmarks.has(benchmark.id)
                          ? "chevron-up"
                          : "chevron-down"
                      }
                      size={20}
                      color={theme.textSecondary}
                    />
                  </View>
                </View>
                <ProgressBar
                  progress={progress}
                  color={completed ? Colors.dark.success : Colors.dark.accent}
                />
                <View style={styles.benchmarkFooter}>
                  <ThemedText
                    style={[
                      styles.milestoneCaption,
                      {
                        color: completed
                          ? Colors.dark.success
                          : theme.textSecondary,
                      },
                    ]}
                  >
                    {completed
                      ? "Complete — habit locked in"
                      : `${daysDone} of ${target} days done`}
                  </ThemedText>
                  <Pressable
                    onPress={() =>
                      navigation.navigate("BenchmarkEditor", {
                        benchmarkId: benchmark.id,
                      })
                    }
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel={`Edit ${benchmark.title} milestone`}
                    style={({ pressed }) => [
                      styles.editButton,
                      { opacity: pressed ? 0.7 : 1 },
                      pressed && styles.editButtonPressed,
                    ]}
                  >
                    <Feather
                      name="edit-2"
                      size={14}
                      color={Colors.dark.accent}
                    />
                    <ThemedText style={styles.editButtonText}>Edit</ThemedText>
                  </Pressable>
                </View>
              </Pressable>

              {expandedBenchmarks.has(benchmark.id) &&
              actionProgress.length > 0 ? (
                <View style={styles.actionsContainer}>
                  {actionProgress.map(({ action, daysDone: actionDays }) => (
                    <View
                      key={action.id}
                      style={[
                        styles.actionCard,
                        {
                          backgroundColor: isDark
                            ? Colors.dark.backgroundSecondary
                            : Colors.light.backgroundSecondary,
                        },
                      ]}
                    >
                      <View style={styles.actionHeader}>
                        <ThemedText style={styles.actionTitle}>
                          {action.title}
                        </ThemedText>
                        <ThemedText
                          style={[
                            styles.actionDays,
                            { color: theme.textSecondary },
                          ]}
                        >
                          {actionDays} {actionDays === 1 ? "day" : "days"} done
                        </ThemedText>
                      </View>
                      <View style={styles.actionDetails}>
                        <View style={styles.actionDetail}>
                          <Feather
                            name="zap"
                            size={14}
                            color={Colors.dark.warning}
                            style={styles.actionDetailIcon}
                          />
                          <View style={styles.actionDetailContent}>
                            <ThemedText
                              style={[
                                styles.actionDetailLabel,
                                { color: Colors.dark.warning },
                              ]}
                            >
                              Too busy? Just:
                            </ThemedText>
                            <ThemedText
                              style={[
                                styles.actionDetailText,
                                { color: theme.textSecondary },
                              ]}
                            >
                              {action.kickstartVersion}
                            </ThemedText>
                          </View>
                        </View>
                        <View style={styles.actionDetail}>
                          <Feather
                            name="link"
                            size={14}
                            color={Colors.dark.accent}
                            style={styles.actionDetailIcon}
                          />
                          <View style={styles.actionDetailContent}>
                            <ThemedText
                              style={[
                                styles.actionDetailLabel,
                                { color: Colors.dark.accent },
                              ]}
                            >
                              When:
                            </ThemedText>
                            <ThemedText
                              style={[
                                styles.actionDetailText,
                                { color: theme.textSecondary },
                              ]}
                            >
                              {action.anchorLink}
                            </ThemedText>
                          </View>
                        </View>
                        <View style={styles.frequencyTags}>
                          {action.frequency.map((day: string) => (
                            <View
                              key={day}
                              style={[
                                styles.frequencyTag,
                                {
                                  backgroundColor: isDark
                                    ? Colors.dark.backgroundTertiary
                                    : Colors.light.backgroundTertiary,
                                },
                              ]}
                            >
                              <ThemedText
                                style={[
                                  styles.frequencyTagText,
                                  { color: Colors.dark.accent },
                                ]}
                              >
                                {day.slice(0, 3)}
                              </ThemedText>
                            </View>
                          ))}
                        </View>
                      </View>
                    </View>
                  ))}
                </View>
              ) : null}
            </View>
          ),
        )}

        {!subscription.isPremium ? (
          <Pressable
            onPress={() => navigation.navigate("Subscription")}
            accessibilityRole="button"
            accessibilityLabel="Go further with Premium. Unlimited milestones, plans and coaching. See plans."
            style={({ pressed }) => [
              styles.premiumCard,
              {
                backgroundColor: isDark
                  ? Colors.dark.backgroundDefault
                  : Colors.light.backgroundDefault,
                opacity: pressed ? 0.9 : 1,
                transform: [{ scale: pressed ? 0.98 : 1 }],
              },
            ]}
          >
            <View style={styles.premiumIconRing}>
              <View style={styles.premiumIconCore}>
                <Feather name="zap" size={20} color={Colors.dark.accent} />
              </View>
              <View style={[styles.premiumDot, styles.premiumDotTop]} />
              <View style={[styles.premiumDot, styles.premiumDotRight]} />
              <View style={[styles.premiumDot, styles.premiumDotBottom]} />
            </View>
            <View style={styles.premiumContent}>
              <ThemedText style={styles.premiumTitle}>
                Go further with Premium
              </ThemedText>
              <ThemedText
                style={[styles.premiumSubtitle, { color: theme.textSecondary }]}
              >
                Unlimited milestones, plans &amp; coaching
              </ThemedText>
            </View>
            <View style={styles.premiumCta}>
              <ThemedText
                style={[styles.premiumCtaText, { color: Colors.dark.accent }]}
              >
                See plans
              </ThemedText>
              <Feather
                name="chevron-right"
                size={16}
                color={Colors.dark.accent}
              />
            </View>
          </Pressable>
        ) : null}
      </ScrollView>
      <Toast
        message={toastMessage}
        visible={toastVisible}
        onHide={() => setToastVisible(false)}
        type={toastType}
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
    gap: Spacing.lg,
  },
  emptyText: {
    ...Typography.body,
    textAlign: "center",
  },
  personaCard: {
    padding: Spacing.lg,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.xl,
  },
  personaHeader: {
    flexDirection: "row",
    alignItems: "center",
  },
  personaIcon: {
    width: 48,
    height: 48,
    borderRadius: BorderRadius.full,
    backgroundColor: "rgba(0, 217, 255, 0.1)",
    alignItems: "center",
    justifyContent: "center",
    marginRight: Spacing.lg,
  },
  personaInfo: {
    flex: 1,
  },
  personaLabel: {
    ...Typography.caption,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: Spacing.xs,
  },
  personaName: {
    ...Typography.headline,
  },
  personaDescription: {
    ...Typography.body,
    marginTop: Spacing.md,
  },
  guideCard: {
    padding: Spacing.lg,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.xl,
    borderWidth: 1,
    borderColor: "rgba(0, 217, 255, 0.3)",
  },
  guideHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  guideTitle: {
    ...Typography.body,
    fontWeight: "600",
    flex: 1,
  },
  guideClose: {
    padding: Spacing.xs,
  },
  guideText: {
    ...Typography.small,
    lineHeight: 20,
    marginBottom: Spacing.md,
  },
  guideCta: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.xs,
    backgroundColor: Colors.dark.accent,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.full,
  },
  guideCtaText: {
    ...Typography.body,
    fontWeight: "600",
    color: "#000000",
  },
  alignmentSection: {
    alignItems: "center",
    marginBottom: Spacing["2xl"],
  },
  alignmentHint: {
    ...Typography.caption,
    textAlign: "center",
    marginTop: Spacing.sm,
  },
  monthHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: Spacing.xl,
  },
  navButton: {
    padding: Spacing.sm,
  },
  monthTitle: {
    ...Typography.title,
  },
  daysHeader: {
    flexDirection: "row",
    marginBottom: Spacing.sm,
  },
  dayHeaderCell: {
    flex: 1,
    alignItems: "center",
  },
  dayHeaderText: {
    ...Typography.caption,
    fontWeight: "600",
  },
  calendarGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginBottom: Spacing.xl,
  },
  dayCell: {
    width: `${100 / 7}%`,
    aspectRatio: 1,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  todayMarker: {
    borderWidth: 2,
  },
  streakLine: {
    position: "absolute",
    left: 0,
    right: "50%",
    height: 2,
    top: "50%",
  },
  dayMarker: {
    width: 32,
    height: 32,
    borderRadius: BorderRadius.full,
    alignItems: "center",
    justifyContent: "center",
  },
  dayText: {
    ...Typography.small,
    fontWeight: "500",
  },
  shieldBadge: {
    position: "absolute",
    top: -6,
    right: -6,
  },
  legendContainer: {
    flexDirection: "row",
    justifyContent: "center",
    flexWrap: "wrap",
    gap: Spacing.lg,
    marginBottom: Spacing["2xl"],
  },
  legendItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
  },
  legendDot: {
    width: 12,
    height: 12,
    borderRadius: BorderRadius.full,
  },
  legendText: {
    ...Typography.caption,
  },
  selectedDateContainer: {
    padding: Spacing.lg,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing["2xl"],
  },
  selectedDateHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  selectedDateTitle: {
    ...Typography.headline,
    flex: 1,
  },
  selectedDateSummary: {
    ...Typography.small,
    fontWeight: "600",
  },
  noActionsForDay: {
    ...Typography.body,
    fontStyle: "italic",
  },
  selectedDateActions: {
    gap: Spacing.md,
  },
  selectedDateAction: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: Spacing.sm,
    paddingVertical: Spacing.xs,
  },
  selectedDateActionInfo: {
    flex: 1,
  },
  selectedDateActionTitle: {
    ...Typography.body,
  },
  selectedDateBenchmark: {
    ...Typography.caption,
    marginTop: 2,
  },
  streakStatsRow: {
    flexDirection: "row",
    justifyContent: "center",
    gap: Spacing.sm,
    marginBottom: Spacing["2xl"],
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.lg,
  },
  sectionTitle: {
    ...Typography.headline,
  },
  addButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    backgroundColor: Colors.dark.accent,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full,
  },
  addButtonPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.97 }],
  },
  addButtonText: {
    ...Typography.small,
    fontWeight: "600",
    color: "#000000",
  },
  benchmarkCard: {
    padding: Spacing.lg,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.sm,
  },
  benchmarkCardCompleted: {
    borderWidth: 1,
    // Colors.dark.success (#00FF88) at 35% opacity
    borderColor: "rgba(0, 255, 136, 0.35)",
  },
  benchmarkHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: Spacing.md,
  },
  benchmarkTitleCol: {
    flex: 1,
    marginRight: Spacing.md,
  },
  benchmarkTitleRow: {
    flexDirection: "row",
    alignItems: "flex-start",
  },
  milestoneStatusIcon: {
    marginRight: Spacing.sm,
    marginTop: 3,
  },
  benchmarkTitle: {
    ...Typography.headline,
    lineHeight: 22,
    flex: 1,
  },
  benchmarkMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
  },
  benchmarkFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: Spacing.md,
    marginTop: Spacing.md,
  },
  editButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    borderColor: "rgba(0, 217, 255, 0.5)",
    backgroundColor: "rgba(0, 217, 255, 0.12)",
  },
  editButtonPressed: {
    transform: [{ scale: 0.96 }],
  },
  editButtonText: {
    ...Typography.small,
    color: Colors.dark.accent,
    fontWeight: "600",
  },
  benchmarkDays: {
    ...Typography.headline,
  },
  milestoneCaption: {
    ...Typography.caption,
    lineHeight: 17,
    flex: 1,
  },
  frequencyBadge: {
    ...Typography.caption,
    marginTop: Spacing.xs,
    marginLeft: Spacing.sm + 16,
  },
  actionsContainer: {
    marginLeft: Spacing.lg,
    marginBottom: Spacing.md,
  },
  actionCard: {
    padding: Spacing.md,
    borderRadius: BorderRadius.sm,
    marginBottom: Spacing.sm,
  },
  actionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.sm,
  },
  actionTitle: {
    ...Typography.small,
    fontWeight: "600",
    flex: 1,
    marginRight: Spacing.sm,
  },
  actionDays: {
    ...Typography.small,
    fontWeight: "600",
  },
  actionDetails: {
    gap: Spacing.sm,
  },
  actionDetail: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: Spacing.sm,
  },
  actionDetailIcon: {
    marginTop: 2,
  },
  actionDetailContent: {
    flex: 1,
  },
  actionDetailLabel: {
    ...Typography.caption,
    fontWeight: "600",
    marginBottom: 2,
  },
  actionDetailText: {
    ...Typography.small,
    lineHeight: 20,
  },
  frequencyTags: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.xs,
    marginTop: Spacing.xs,
  },
  frequencyTag: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.xs,
  },
  frequencyTagText: {
    ...Typography.caption,
    fontWeight: "500",
  },
  premiumCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    padding: Spacing.lg,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: "rgba(0, 217, 255, 0.35)",
    marginTop: Spacing.xl,
  },
  premiumIconRing: {
    width: 44,
    height: 44,
    borderRadius: BorderRadius.full,
    borderWidth: 1.5,
    borderColor: "rgba(0, 217, 255, 0.4)",
    alignItems: "center",
    justifyContent: "center",
  },
  premiumIconCore: {
    width: 34,
    height: 34,
    borderRadius: BorderRadius.full,
    backgroundColor: "rgba(0, 217, 255, 0.15)",
    alignItems: "center",
    justifyContent: "center",
  },
  premiumDot: {
    position: "absolute",
    width: 5,
    height: 5,
    borderRadius: 3,
  },
  premiumDotTop: {
    top: -3,
    backgroundColor: Colors.dark.accent,
  },
  premiumDotRight: {
    right: -3,
    backgroundColor: "#9B6BFF",
  },
  premiumDotBottom: {
    bottom: -3,
    backgroundColor: "#FF6B9D",
  },
  premiumContent: {
    flex: 1,
    gap: 2,
  },
  premiumTitle: {
    ...Typography.body,
    fontWeight: "600",
  },
  premiumSubtitle: {
    ...Typography.small,
    lineHeight: 20,
  },
  premiumCta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },
  premiumCtaText: {
    ...Typography.small,
    fontWeight: "600",
  },
});
