import React, { useState, useMemo } from "react";
import { View, ScrollView, StyleSheet, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";

import { useTheme } from "@/hooks/useTheme";
import { useApp } from "@/context/AppContext";
import { Colors, Spacing, Typography, BorderRadius } from "@/constants/theme";
import { ThemedText } from "@/components/ThemedText";
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

function getLocalDateString(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

interface DayInfo {
  date: Date;
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
              style={styles.selectedDateAction}
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

export default function CalendarScreen() {
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const tabBarHeight = useBottomTabBarHeight();
  const { theme, isDark } = useTheme();
  const {
    actions,
    dailyLogs,
    benchmarks,
    hasOnboarded,
    persona,
    toggleDailyLog,
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

  const personaActions = useMemo(() => {
    const personaBenchmarkIds = benchmarks
      .filter((b) => b.personaId === persona?.id)
      .map((b) => b.id);
    return actions.filter((a) => personaBenchmarkIds.includes(a.benchmarkId));
  }, [actions, benchmarks, persona?.id]);

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

  if (!hasOnboarded) {
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
          <Feather name="calendar" size={64} color={theme.textSecondary} />
          <ThemedText
            style={[styles.emptyText, { color: theme.textSecondary }]}
          >
            Complete onboarding to track your consistency
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
        <View style={styles.monthHeader}>
          <Pressable
            onPress={prevMonth}
            style={styles.navButton}
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
            style={styles.navButton}
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
            const isMissed =
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
                : `${dayInfo.completedCount} of ${dayInfo.totalCount} action${dayInfo.totalCount === 1 ? "" : "s"} completed`;

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
        </View>

        {selectedDate && persona ? (
          <SelectedDateDetails
            date={selectedDate}
            actions={personaActions}
            dailyLogs={dailyLogs}
            benchmarks={benchmarks.filter((b) => b.personaId === persona?.id)}
            isDark={isDark}
            theme={theme}
            onToggleAction={handleToggleAction}
          />
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
  legendContainer: {
    flexDirection: "row",
    justifyContent: "center",
    gap: Spacing.xl,
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
    gap: Spacing.sm,
  },
  selectedDateAction: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: Spacing.sm,
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
});
