import React, { useState, useMemo, useEffect, useCallback } from "react";
import { View, FlatList, StyleSheet, Pressable, Platform } from "react-native";
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
  formatScheduleDays,
  formatTargetCountdown,
  getLocalDateString,
  MilestoneProgressResult,
} from "@/lib/progress";
import type { Benchmark, DailyLog, ElementalAction } from "@/lib/storage";
import { Colors, Spacing, Typography, BorderRadius } from "@/constants/theme";
import { ThemedText } from "@/components/ThemedText";
import { CircularProgress } from "@/components/CircularProgress";
import { ProgressBar } from "@/components/ProgressBar";
import { StatChip } from "@/components/StatChip";
import { Toast } from "@/components/Toast";
import { InsightsPanel } from "@/components/InsightsPanel";
import { getMainTabHeaderClearance } from "@/navigation/tab-bar-layout";

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

function JourneyTool({
  icon,
  title,
  subtitle,
  onPress,
}: {
  icon: keyof typeof Feather.glyphMap;
  title: string;
  subtitle: string;
  onPress: () => void;
}) {
  const { theme, isDark } = useTheme();

  return (
    <Pressable
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onPress();
      }}
      hitSlop={8}
      pressRetentionOffset={16}
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${subtitle}`}
      style={({ pressed }) => [
        styles.journeyTool,
        {
          backgroundColor: isDark
            ? Colors.dark.backgroundDefault
            : Colors.light.backgroundDefault,
          opacity: pressed ? 0.75 : 1,
          transform: [{ scale: pressed ? 0.98 : 1 }],
        },
      ]}
    >
      <View style={styles.journeyToolIcon}>
        <Feather name={icon} size={20} color={theme.accent} />
      </View>
      <View style={styles.journeyToolContent}>
        <ThemedText style={styles.journeyToolTitle}>{title}</ThemedText>
        <ThemedText
          style={[styles.journeyToolSubtitle, { color: theme.textSecondary }]}
        >
          {subtitle}
        </ThemedText>
      </View>
      <Feather name="chevron-right" size={20} color={theme.textSecondary} />
    </Pressable>
  );
}

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
  actions: ElementalAction[];
  logIndex: Map<string, DailyLog>;
  benchmarkById: Map<string, Benchmark>;
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
  logIndex,
  benchmarkById,
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
    const log = logIndex.get(`${action.id}|${dateStr}`);
    const benchmark = benchmarkById.get(action.benchmarkId);
    return {
      action,
      benchmark,
      completed: log?.status === true,
      note: log?.status === true ? log?.note : undefined,
      completionSource: log?.status === true ? log.completionSource : undefined,
      completionKind: log?.status === true ? log.completionKind : undefined,
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
        <Feather name="calendar" size={18} color={theme.accent} />
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
          {actionStatuses.map(
            ({
              action,
              benchmark,
              completed,
              note,
              completionSource,
              completionKind,
            }) => (
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
                  color={completed ? theme.success : theme.textSecondary}
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
                  {completed &&
                  (completionSource === "health" ||
                    completionKind === "kickstart") ? (
                    <View style={styles.selectedDateSource}>
                      <Feather
                        name={completionSource === "health" ? "heart" : "zap"}
                        size={11}
                        color={theme.accent}
                      />
                      <ThemedText
                        style={[
                          styles.selectedDateSourceText,
                          { color: theme.accent },
                        ]}
                      >
                        {completionSource === "health"
                          ? "Health auto-vote"
                          : "2-minute vote"}
                      </ThemedText>
                    </View>
                  ) : null}
                  {note ? (
                    <ThemedText
                      style={[
                        styles.selectedDateNote,
                        { color: theme.textSecondary },
                      ]}
                      numberOfLines={2}
                    >
                      &ldquo;{note}&rdquo;
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
            ),
          )}
        </View>
      )}
    </View>
  );
}

interface MilestoneRowProps {
  item: MilestoneProgressResult;
  expanded: boolean;
  isDark: boolean;
  theme: any;
  onToggle: (benchmarkId: string) => void;
  onEdit: (benchmarkId: string) => void;
}

const MilestoneRow = React.memo(function MilestoneRow({
  item,
  expanded,
  isDark,
  theme,
  onToggle,
  onEdit,
}: MilestoneRowProps) {
  const {
    benchmark,
    actions: actionProgress,
    daysDone,
    target,
    progress,
    completed,
  } = item;

  return (
    <View>
      <Pressable
        onPress={() => onToggle(benchmark.id)}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
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
                color={completed ? theme.success : theme.accent}
                style={styles.milestoneStatusIcon}
              />
              <ThemedText style={styles.benchmarkTitle}>
                {benchmark.title}
              </ThemedText>
            </View>
            {actionProgress[0]?.action.frequency ? (
              <ThemedText
                style={[styles.frequencyBadge, { color: theme.textSecondary }]}
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
                  color: completed ? theme.success : theme.accent,
                },
              ]}
            >
              {daysDone}/{target}
            </ThemedText>
            <Feather
              name={expanded ? "chevron-up" : "chevron-down"}
              size={20}
              color={theme.textSecondary}
            />
          </View>
        </View>
        <ProgressBar
          progress={progress}
          color={completed ? theme.success : theme.accent}
        />
        <View style={styles.benchmarkFooter}>
          <ThemedText
            style={[
              styles.milestoneCaption,
              {
                color: completed ? theme.success : theme.textSecondary,
              },
            ]}
          >
            {completed
              ? "Complete — habit locked in"
              : `${daysDone} of ${target} days done${(() => {
                  const countdown = formatTargetCountdown(benchmark.targetDate);
                  return countdown ? ` · ${countdown}` : "";
                })()}`}
          </ThemedText>
          <Pressable
            onPress={() => onEdit(benchmark.id)}
            hitSlop={12}
            pressRetentionOffset={16}
            accessibilityRole="button"
            accessibilityLabel={`Edit ${benchmark.title} milestone`}
            style={({ pressed }) => [
              styles.editButton,
              { borderColor: theme.accent },
              { opacity: pressed ? 0.7 : 1 },
              pressed && styles.editButtonPressed,
            ]}
          >
            <Feather name="edit-2" size={14} color={theme.accent} />
            <ThemedText
              style={[styles.editButtonText, { color: theme.accent }]}
            >
              Edit
            </ThemedText>
          </Pressable>
        </View>
      </Pressable>

      {expanded && actionProgress.length > 0 ? (
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
                  style={[styles.actionDays, { color: theme.textSecondary }]}
                >
                  {actionDays} {actionDays === 1 ? "day" : "days"} done
                </ThemedText>
              </View>
              <View style={styles.actionDetails}>
                <View style={styles.actionDetail}>
                  <Feather
                    name="calendar"
                    size={14}
                    color={theme.accent}
                    style={styles.actionDetailIcon}
                  />
                  <View style={styles.actionDetailContent}>
                    <ThemedText
                      style={[
                        styles.actionDetailLabel,
                        { color: theme.accent },
                      ]}
                    >
                      On:
                    </ThemedText>
                    <ThemedText
                      style={[
                        styles.actionDetailText,
                        { color: theme.textSecondary },
                      ]}
                    >
                      {formatScheduleDays(action.frequency)} — each completed
                      day fills this milestone
                    </ThemedText>
                  </View>
                </View>
                <View style={styles.actionDetail}>
                  <Feather
                    name="link"
                    size={14}
                    color={theme.accent}
                    style={styles.actionDetailIcon}
                  />
                  <View style={styles.actionDetailContent}>
                    <ThemedText
                      style={[
                        styles.actionDetailLabel,
                        { color: theme.accent },
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
                <View style={styles.actionDetail}>
                  <Feather
                    name="zap"
                    size={14}
                    color={theme.warning}
                    style={styles.actionDetailIcon}
                  />
                  <View style={styles.actionDetailContent}>
                    <ThemedText
                      style={[
                        styles.actionDetailLabel,
                        { color: theme.warning },
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
              </View>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
});

export default function JourneyScreen() {
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
    canAddBenchmark,
    subscription,
    aiConsent,
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

  const benchmarkById = useMemo(
    () =>
      new Map(personaBenchmarks.map((benchmark) => [benchmark.id, benchmark])),
    [personaBenchmarks],
  );

  const streak = progressSnapshot.streak;
  const shieldedDaySet = useMemo(
    () => new Set(streak.shieldedDays),
    [streak.shieldedDays],
  );

  // Fill-only milestone consistency targets (N of 21 scheduled days done)
  const milestoneProgress = progressSnapshot.milestoneProgress;

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

  const toggleExpand = useCallback((benchmarkId: string) => {
    setExpandedBenchmarks((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(benchmarkId)) {
        newSet.delete(benchmarkId);
      } else {
        newSet.add(benchmarkId);
      }
      return newSet;
    });
  }, []);

  const calendarDays = useMemo(() => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();

    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const startPadding = firstDay.getDay();

    const days: DayInfo[] = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const statsByDate = new Map<string, { total: number; completed: number }>();
    const statsCursor = new Date(year, month, 0);
    while (statsCursor <= lastDay) {
      const date = new Date(statsCursor);
      const dateStr = getLocalDateString(date);
      const dayOfWeek = date.toLocaleDateString("en-US", { weekday: "long" });
      let total = 0;
      let completed = 0;
      for (const action of personaActions) {
        if (!action.frequency.includes(dayOfWeek)) continue;
        total++;
        if (progressSnapshot.logIndex.get(`${action.id}|${dateStr}`)?.status) {
          completed++;
        }
      }
      statsByDate.set(dateStr, { total, completed });
      statsCursor.setDate(statsCursor.getDate() + 1);
    }

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
      const { total, completed } = statsByDate.get(
        getLocalDateString(date),
      ) ?? {
        total: 0,
        completed: 0,
      };
      const prev = statsByDate.get(
        getLocalDateString(new Date(year, month, day - 1)),
      ) ?? { total: 0, completed: 0 };

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
  }, [currentDate, personaActions, progressSnapshot.logIndex]);

  const prevMonth = useCallback(() => {
    setCurrentDate(
      (date) => new Date(date.getFullYear(), date.getMonth() - 1, 1),
    );
  }, []);

  const nextMonth = useCallback(() => {
    setCurrentDate(
      (date) => new Date(date.getFullYear(), date.getMonth() + 1, 1),
    );
  }, []);

  const editBenchmark = useCallback(
    (benchmarkId: string) => {
      navigation.navigate("BenchmarkEditor", { benchmarkId });
    },
    [navigation],
  );

  const renderMilestoneRow = useCallback(
    ({ item }: { item: MilestoneProgressResult }) => (
      <MilestoneRow
        item={item}
        expanded={expandedBenchmarks.has(item.benchmark.id)}
        isDark={isDark}
        theme={theme}
        onToggle={toggleExpand}
        onEdit={editBenchmark}
      />
    ),
    [editBenchmark, expandedBenchmarks, isDark, theme, toggleExpand],
  );

  if (!hasOnboarded || !persona) {
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
      <FlatList
        data={milestoneProgress}
        renderItem={renderMilestoneRow}
        keyExtractor={(item) => item.benchmark.id}
        delaysContentTouches={false}
        style={{ flex: 1, backgroundColor: theme.backgroundRoot }}
        decelerationRate="fast"
        contentContainerStyle={{
          paddingTop: headerClearance + Spacing.xl,
          paddingBottom: tabBarHeight + Spacing.xl,
          paddingHorizontal: Spacing.lg,
        }}
        scrollIndicatorInsets={{ bottom: insets.bottom }}
        initialNumToRender={4}
        maxToRenderPerBatch={4}
        windowSize={7}
        ListHeaderComponent={
          <>
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
                  <Feather name="target" size={24} color={theme.accent} />
                </View>
                <View style={styles.personaInfo}>
                  <ThemedText
                    style={[styles.personaLabel, { color: theme.accent }]}
                  >
                    Becoming
                  </ThemedText>
                  <ThemedText style={styles.personaName}>
                    {persona.name}
                  </ThemedText>
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

            <View style={styles.journeyToolsSection}>
              <ThemedText style={styles.journeyToolsHeading}>
                Stories &amp; Support
              </ThemedText>
              <JourneyTool
                icon="award"
                title="The Year You Became"
                subtitle={
                  subscription.isPremium
                    ? `${new Date().getFullYear()} year-to-date story`
                    : "Premium annual story"
                }
                onPress={() =>
                  subscription.isPremium
                    ? navigation.navigate("YearRecap", {
                        year: new Date().getFullYear(),
                      })
                    : navigation.navigate("Subscription")
                }
              />
              <JourneyTool
                icon="users"
                title="Someone in Your Corner"
                subtitle="One trusted witness · you choose every share"
                onPress={() => navigation.navigate("Witness")}
              />
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
                  <Feather name="compass" size={18} color={theme.accent} />
                  <ThemedText style={styles.guideTitle}>Next Steps</ThemedText>
                  <Pressable
                    onPress={dismissGuide}
                    hitSlop={12}
                    pressRetentionOffset={16}
                    accessibilityRole="button"
                    accessibilityLabel="Dismiss next steps"
                    style={({ pressed }) => [
                      styles.guideClose,
                      { opacity: pressed ? 0.5 : 1 },
                    ]}
                  >
                    <Feather name="x" size={18} color={theme.textSecondary} />
                  </Pressable>
                </View>
                <ThemedText
                  style={[styles.guideText, { color: theme.textSecondary }]}
                >
                  1. {aiConsent ? "Your AI coach" : "Your starter plan"} created
                  the milestones below — steps on the way to becoming who you
                  chose. Tap Edit to adjust one or change which days it repeats.
                  {"\n"}
                  2. Each milestone comes with one small daily action on its
                  scheduled days.{"\n"}
                  3. Check off your actions in the Today tab — each completed
                  day fills a milestone. Milestones only fill up, they never go
                  backwards.
                </ThemedText>
                <Pressable
                  onPress={() => navigation.navigate("TodayTab")}
                  accessibilityRole="button"
                  accessibilityLabel="Go to Today tab"
                  style={({ pressed }) => [
                    styles.guideCta,
                    { backgroundColor: theme.accent },
                    { opacity: pressed ? 0.8 : 1 },
                  ]}
                >
                  <ThemedText
                    style={[styles.guideCtaText, { color: theme.buttonText }]}
                  >
                    Log today&rsquo;s actions
                  </ThemedText>
                  <Feather
                    name="arrow-right"
                    size={16}
                    color={theme.buttonText}
                  />
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
                  <Feather name="trending-up" size={18} color={theme.accent} />
                  <ThemedText style={styles.guideTitle}>
                    Milestones now fill up
                  </ThemedText>
                  <Pressable
                    onPress={dismissMilestoneInfo}
                    hitSlop={12}
                    pressRetentionOffset={16}
                    accessibilityRole="button"
                    accessibilityLabel="Dismiss milestone update note"
                    style={({ pressed }) => [
                      styles.guideClose,
                      { opacity: pressed ? 0.5 : 1 },
                    ]}
                  >
                    <Feather name="x" size={18} color={theme.textSecondary} />
                  </Pressable>
                </View>
                <ThemedText
                  style={[styles.guideText, { color: theme.textSecondary }]}
                >
                  Each milestone now completes after 21 days of doing its action
                  on schedule. Progress only fills up — it never goes backwards.
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
                % of scheduled actions completed so far this month — fresh start
                on the 1st
              </ThemedText>
            </View>

            <View style={styles.monthHeader}>
              <Pressable
                onPress={prevMonth}
                hitSlop={12}
                pressRetentionOffset={16}
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
                hitSlop={12}
                pressRetentionOffset={16}
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
                    style={[
                      styles.dayHeaderText,
                      { color: theme.textSecondary },
                    ]}
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
                  shieldedDaySet.has(dayInfo.dateStr) &&
                  !isComplete &&
                  !isPartial;
                const isMissed =
                  !isShielded &&
                  // Today is pending until it's over — never painted missed
                  // (mirrors the streak rule "today never breaks a run")
                  !dayInfo.isToday &&
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
                    onPress={() => {
                      setSelectedDate(dayInfo.date);
                      if (Platform.OS !== "web") {
                        Haptics.selectionAsync();
                      }
                    }}
                    hitSlop={4}
                    pressRetentionOffset={12}
                    style={({ pressed }) => [
                      styles.dayCell,
                      // Selection reads as a cell highlight, separate from the
                      // status rings on the day marker (today/missed/shielded)
                      isSelected && styles.dayCellSelected,
                      { opacity: pressed ? 0.5 : 1 },
                    ]}
                    accessibilityRole="button"
                    accessibilityState={{ selected: isSelected }}
                    accessibilityLabel={`${dayInfo.isToday ? "Today, " : ""}${dateLabel}, ${statusLabel}`}
                    accessibilityHint="Shows this day's actions below the calendar"
                  >
                    {dayInfo.hasStreak ? (
                      <View
                        style={[
                          styles.streakLine,
                          { backgroundColor: theme.accent },
                        ]}
                      />
                    ) : null}
                    <View
                      style={[
                        styles.dayMarker,
                        dayInfo.isToday && styles.todayMarker,
                        dayInfo.isToday && { borderColor: theme.accent },
                        isComplete && { backgroundColor: theme.success },
                        isPartial && { backgroundColor: theme.warning },
                        isShielded && {
                          backgroundColor: "transparent",
                          borderWidth: 2,
                          borderColor: theme.accent,
                        },
                        isMissed && {
                          backgroundColor: "transparent",
                          borderWidth: 2,
                          borderColor: theme.error,
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
                            color={theme.accent}
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
                  style={[styles.legendDot, { backgroundColor: theme.success }]}
                />
                <ThemedText
                  style={[styles.legendText, { color: theme.textSecondary }]}
                >
                  Complete
                </ThemedText>
              </View>
              <View style={styles.legendItem}>
                <View
                  style={[styles.legendDot, { backgroundColor: theme.warning }]}
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
                      borderColor: theme.error,
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
                <Feather name="shield" size={12} color={theme.accent} />
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
                logIndex={progressSnapshot.logIndex}
                benchmarkById={benchmarkById}
                isDark={isDark}
                theme={theme}
                onToggleAction={handleToggleAction}
              />
            ) : null}

            <View style={styles.streakStatsRow}>
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
                        streak.current > 0 ? theme.warning : theme.textSecondary
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
                icon={<Feather name="award" size={14} color={theme.accent} />}
                text={`Best: ${streak.longest} ${streak.longest === 1 ? "day" : "days"}`}
              />
              <StatChip
                icon={<Feather name="shield" size={14} color={theme.accent} />}
                text={`${streak.shieldsAvailable}/${subscription.isPremium ? 2 : 1} shield${subscription.isPremium ? "s" : ""} ready`}
              />
            </View>

            <View style={styles.sectionHeader}>
              <ThemedText style={styles.sectionTitle}>Milestones</ThemedText>
              <Pressable
                onPress={() => navigation.navigate("BenchmarkEditor", {})}
                hitSlop={12}
                pressRetentionOffset={16}
                accessibilityRole="button"
                accessibilityLabel={
                  canAddBenchmark()
                    ? "Add a new milestone"
                    : "Add milestone, Premium feature"
                }
                style={({ pressed }) => [
                  styles.addButton,
                  { backgroundColor: theme.accent },
                  pressed && styles.addButtonPressed,
                ]}
              >
                <Feather
                  name={canAddBenchmark() ? "plus" : "lock"}
                  size={16}
                  color={theme.buttonText}
                />
                <ThemedText
                  style={[styles.addButtonText, { color: theme.buttonText }]}
                >
                  Add milestone
                </ThemedText>
              </Pressable>
            </View>
          </>
        }
        ListFooterComponent={
          <>
            <InsightsPanel
              actions={personaActions}
              dailyLogs={dailyLogs}
              personaName={persona?.name ?? "Future You"}
              isPremium={subscription.isPremium}
              onUpgrade={() => navigation.navigate("Subscription")}
            />
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
                    borderColor: theme.accent,
                    opacity: pressed ? 0.9 : 1,
                    transform: [{ scale: pressed ? 0.98 : 1 }],
                  },
                ]}
              >
                <View style={styles.premiumIconRing}>
                  <View style={styles.premiumIconCore}>
                    <Feather name="zap" size={20} color={theme.accent} />
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
                    style={[
                      styles.premiumSubtitle,
                      { color: theme.textSecondary },
                    ]}
                  >
                    Unlimited milestones, plans &amp; coaching
                  </ThemedText>
                </View>
                <View style={styles.premiumCta}>
                  <ThemedText
                    style={[styles.premiumCtaText, { color: theme.accent }]}
                  >
                    See plans
                  </ThemedText>
                  <Feather
                    name="chevron-right"
                    size={16}
                    color={theme.accent}
                  />
                </View>
              </Pressable>
            ) : null}
          </>
        }
      />
      <Toast
        message={toastMessage}
        visible={toastVisible}
        onHide={() => setToastVisible(false)}
        type={toastType}
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
  journeyToolsSection: {
    marginBottom: Spacing.xl,
  },
  journeyToolsHeading: {
    ...Typography.headline,
    marginBottom: Spacing.md,
  },
  journeyTool: {
    minHeight: 72,
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.lg,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.sm,
  },
  journeyToolIcon: {
    width: 40,
    height: 40,
    borderRadius: BorderRadius.full,
    backgroundColor: "rgba(0, 217, 255, 0.1)",
    alignItems: "center",
    justifyContent: "center",
    marginRight: Spacing.md,
  },
  journeyToolContent: {
    flex: 1,
  },
  journeyToolTitle: {
    ...Typography.body,
    fontWeight: "600",
  },
  journeyToolSubtitle: {
    ...Typography.caption,
    marginTop: 2,
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
  dayCellSelected: {
    backgroundColor: "rgba(0, 217, 255, 0.14)",
    borderRadius: BorderRadius.md,
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
  selectedDateNote: {
    ...Typography.caption,
    fontStyle: "italic",
    marginTop: 2,
  },
  selectedDateSource: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 2,
  },
  selectedDateSourceText: {
    ...Typography.caption,
    fontWeight: "600",
  },
  streakStatsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
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
    // theme.success (#00FF88) at 35% opacity
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
    // Fabric can measure a Text unconstrained on first layout, rendering it
    // as one clipped line; an explicit width forces wrap on the first pass
    width: "100%",
    flexShrink: 1,
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
