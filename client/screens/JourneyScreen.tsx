import React, {
  useState,
  useMemo,
  useEffect,
  useCallback,
  useDeferredValue,
  useRef,
} from "react";
import { View, FlatList, StyleSheet, Pressable, Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { useNavigation, useRoute, RouteProp } from "@react-navigation/native";
import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";

import { useTheme } from "@/hooks/useTheme";
import { useApp } from "@/context/AppContext";
import {
  formatScheduleDays,
  getLocalDateString,
  MilestoneProgressResult,
  weekdayName,
} from "@/lib/progress";
import type { Benchmark, DailyLog, ElementalAction } from "@/lib/storage";
import { Colors, Spacing, Typography, BorderRadius } from "@/constants/theme";
import { ThemedText } from "@/components/ThemedText";
import { CircularProgress } from "@/components/CircularProgress";
import { ProgressBar } from "@/components/ProgressBar";
import { CompletionCheck } from "@/components/CompletionCheck";
import { Toast } from "@/components/Toast";
import { InsightsPanel } from "@/components/InsightsPanel";
import {
  JourneyFramingCard,
  RhythmStatusLine,
} from "@/components/JourneyFramingCard";
import { getMainTabHeaderClearance } from "@/navigation/tab-bar-layout";
import {
  categorizeActionRhythms,
  type ActionRhythm,
} from "@/lib/ambient-coach";
import { withAlpha } from "@/lib/color";
import {
  calendarWeekCount,
  chunkIntoWeeks,
  dayListMilestoneLabel,
  formatEarlyProgress,
  formatMilestoneCaption,
  getMonthProgressDisplay,
  hasRhythmToSimplify,
  nextDaySelection,
} from "@/lib/journey-layout";

import type { MainTabParamList } from "@/navigation/MainTabNavigator";
import { parseJourneyDate, actionIsScheduledOnDate } from "@/lib/journey-date";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
// Fits the 32pt day marker plus its corner badge and keeps a 44pt+ target
const CALENDAR_CELL_HEIGHT = 46;
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
      <View
        style={[
          styles.journeyToolIcon,
          { backgroundColor: withAlpha(theme.accent, 0.1) },
        ]}
      >
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

/** A calendar day with its display state settled once per calendar build. */
interface CalendarDay extends DayInfo {
  isComplete: boolean;
  isPartial: boolean;
  isShielded: boolean;
  isMissed: boolean;
  isRestDay: boolean;
  accessibilityLabel: string;
}

// "Wednesday, October 14", spelled out rather than toLocaleDateString: the
// calendar labels ~35 cells per build, and Hermes on iOS can return "" for
// Intl formatting when its data is absent, which would blank VoiceOver.
function calendarDateLabel(date: Date): string {
  return `${weekdayName(date)}, ${MONTHS[date.getMonth()]} ${date.getDate()}`;
}

function describeCalendarDay(
  dayInfo: DayInfo,
  personaCreatedDate: Date | null,
  shieldedDaySet: Set<string>,
  now: Date,
): CalendarDay {
  const isComplete =
    dayInfo.totalCount > 0 && dayInfo.completedCount === dayInfo.totalCount;
  const isPartial =
    dayInfo.completedCount > 0 && dayInfo.completedCount < dayInfo.totalCount;
  const isAfterPersonaCreated = personaCreatedDate
    ? dayInfo.date >= personaCreatedDate
    : true;
  // Shield-bridged misses show a shield outline, not the red ring
  const isShielded =
    shieldedDaySet.has(dayInfo.dateStr) && !isComplete && !isPartial;
  const isMissed =
    !isShielded &&
    // Today is pending until it's over, never painted missed
    // (mirrors the streak rule "today never breaks a run")
    !dayInfo.isToday &&
    dayInfo.totalCount > 0 &&
    dayInfo.completedCount === 0 &&
    dayInfo.date < now &&
    isAfterPersonaCreated;
  // Days before the plan existed (and padding days from other months) are
  // blank, not rest days: nothing was planned yet.
  const isRestDay =
    dayInfo.totalCount === 0 && dayInfo.isCurrentMonth && isAfterPersonaCreated;
  const statusLabel = !isAfterPersonaCreated
    ? dayInfo.date > now
      ? "before your plan starts"
      : "before your plan started"
    : dayInfo.totalCount === 0
      ? "nothing planned"
      : `${dayInfo.completedCount} of ${dayInfo.totalCount} habit${dayInfo.totalCount === 1 ? "" : "s"} done${isShielded ? ", covered by an earned rest day" : ""}`;
  return {
    ...dayInfo,
    isComplete,
    isPartial,
    isShielded,
    isMissed,
    isRestDay,
    accessibilityLabel: `${dayInfo.isToday ? "Today, " : ""}${calendarDateLabel(dayInfo.date)}, ${statusLabel}`,
  };
}

// Memoized so a selection change re-renders only the old and new selected
// cells; every other prop is stable for the life of a calendar build.
const DayCell = React.memo(function DayCell({
  day,
  isSelected,
  onSelect,
  theme,
}: {
  day: CalendarDay;
  isSelected: boolean;
  onSelect: (date: Date) => void;
  theme: any;
}) {
  const { isComplete, isPartial, isShielded, isMissed, isRestDay } = day;
  return (
    <Pressable
      onPress={() => onSelect(day.date)}
      hitSlop={4}
      pressRetentionOffset={12}
      style={({ pressed }) => [
        styles.dayCell,
        // Selection reads as a cell highlight, separate from the status
        // rings on the day marker (today/missed/shielded)
        isSelected && {
          backgroundColor: withAlpha(theme.accent, 0.14),
          borderRadius: BorderRadius.md,
        },
        { opacity: pressed ? 0.5 : 1 },
      ]}
      accessibilityRole="button"
      accessibilityState={{ selected: isSelected }}
      accessibilityLabel={day.accessibilityLabel}
      accessibilityHint={
        day.isToday && !isSelected
          ? "Today's habits are on the Today tab"
          : isSelected
            ? "Hides this day's actions"
            : "Shows this day's actions below the calendar"
      }
    >
      {day.hasStreak ? (
        <View style={[styles.streakLine, { backgroundColor: theme.accent }]} />
      ) : null}
      <View
        style={[
          styles.dayMarker,
          day.isToday && styles.todayMarker,
          day.isToday && { borderColor: theme.accent },
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
            !day.isCurrentMonth && { opacity: 0.3 },
            (isComplete || isPartial) && {
              color: theme.onStatus,
            },
          ]}
        >
          {day.date.getDate()}
        </ThemedText>
        {isComplete || isPartial || isMissed || isShielded || isRestDay ? (
          <View
            style={[
              styles.shieldBadge,
              {
                backgroundColor: theme.backgroundRoot,
                borderRadius: 8,
                padding: 2,
              },
            ]}
          >
            <Feather
              name={
                isShielded
                  ? "shield"
                  : isComplete
                    ? "check"
                    : isPartial
                      ? "minus"
                      : isMissed
                        ? "x"
                        : "moon"
              }
              size={12}
              color={theme.text}
              accessible={false}
            />
          </View>
        ) : null}
      </View>
    </Pressable>
  );
});

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

  const dayActions = actions.filter((action) =>
    actionIsScheduledOnDate(action, date),
  );

  const actionStatuses = dayActions.map((action) => {
    const log = logIndex.get(`${action.id}|${dateStr}`);
    return {
      action,
      milestoneLabel: dayListMilestoneLabel({
        milestoneTitle: benchmarkById.get(action.benchmarkId)?.title,
        habitTitle: action.title,
        milestoneCount: benchmarkById.size,
      }),
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
            {isFutureDate
              ? `${dayActions.length} scheduled`
              : `${completedCount}/${dayActions.length} done`}
          </ThemedText>
        ) : null}
      </View>

      {dayActions.length === 0 ? (
        <ThemedText
          style={[styles.noActionsForDay, { color: theme.textSecondary }]}
        >
          Nothing planned
        </ThemedText>
      ) : isFutureDate ? (
        <View style={styles.selectedDateActions}>
          {dayActions.map((action) => (
            <View key={action.id} style={styles.selectedDateAction}>
              {/* Not checkable until the day comes, so no check control */}
              <Feather name="calendar" size={18} color={theme.textSecondary} />
              <View style={styles.selectedDateActionInfo}>
                <ThemedText style={styles.selectedDateActionTitle}>
                  {action.title}
                </ThemedText>
                {action.kickstartVersion ? (
                  <ThemedText
                    style={[
                      styles.selectedDateBenchmark,
                      { color: theme.textSecondary },
                    ]}
                  >
                    Small version: {action.kickstartVersion}
                  </ThemedText>
                ) : null}
                {action.anchorLink ? (
                  <ThemedText
                    style={[
                      styles.selectedDateBenchmark,
                      { color: theme.textSecondary },
                    ]}
                  >
                    {action.anchorLink}
                  </ThemedText>
                ) : null}
              </View>
            </View>
          ))}
          <ThemedText
            style={[
              styles.selectedDateBenchmark,
              { color: theme.textSecondary },
            ]}
          >
            A look ahead. Check these off on the day.
          </ThemedText>
        </View>
      ) : (
        <View style={styles.selectedDateActions}>
          {actionStatuses.map(
            ({
              action,
              milestoneLabel,
              completed,
              note,
              completionSource,
              completionKind,
            }) => (
              <Pressable
                key={action.id}
                hitSlop={4}
                pressRetentionOffset={12}
                style={({ pressed }) => [
                  styles.selectedDateAction,
                  { opacity: pressed ? 0.6 : 1 },
                ]}
                onPress={() => handleToggle(action.id, completed)}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: completed }}
                accessibilityLabel={`${action.title}${milestoneLabel ? `, ${milestoneLabel}` : ""}`}
                accessibilityHint={
                  completed
                    ? "Marks this habit as not done"
                    : "Marks this habit as done"
                }
              >
                {/* The row toggles completion, so its only glyph is the
                    check control; done reads as check plus secondary text. */}
                <View style={styles.selectedDateCheck}>
                  <CompletionCheck checked={completed} />
                </View>
                <View style={styles.selectedDateActionInfo}>
                  <ThemedText
                    style={[
                      styles.selectedDateActionTitle,
                      completed && { color: theme.textSecondary },
                    ]}
                  >
                    {action.title}
                  </ThemedText>
                  {milestoneLabel ? (
                    <ThemedText
                      style={[
                        styles.selectedDateBenchmark,
                        { color: theme.textSecondary },
                      ]}
                    >
                      {milestoneLabel}
                    </ThemedText>
                  ) : null}
                  {completed &&
                  (completionSource === "health" ||
                    completionKind === "kickstart") ? (
                    <View style={styles.selectedDateSource}>
                      <Feather
                        name={completionSource === "health" ? "heart" : "zap"}
                        size={11}
                        color={theme.textSecondary}
                      />
                      <ThemedText
                        style={[
                          styles.selectedDateSourceText,
                          { color: theme.textSecondary },
                        ]}
                      >
                        {completionSource === "health"
                          ? "Completed by Health"
                          : "2-minute version"}
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
              </Pressable>
            ),
          )}
        </View>
      )}
    </View>
  );
}

interface HabitPlanRowProps {
  action: ElementalAction;
  /** Shown only when the milestone has several habits to tell apart. */
  daysDone: number | null;
  /** Present only while the full rhythm card is hidden. */
  rhythm?: ActionRhythm;
  onAdjust: (actionId: string) => void;
  theme: any;
}

// A plain row inside the milestone card, not a card of its own. Cadence stays
// visible; cue and fallback are reference detail behind "Plan details".
function HabitPlanRow({
  action,
  daysDone,
  rhythm,
  onAdjust,
  theme,
}: HabitPlanRowProps) {
  const [showPlanDetails, setShowPlanDetails] = useState(false);
  const hasPlanDetails = !!action.anchorLink || !!action.kickstartVersion;

  return (
    <View style={styles.habitRow}>
      <View style={styles.habitHeader}>
        <View style={styles.habitText}>
          <ThemedText style={styles.habitTitle}>{action.title}</ThemedText>
          <ThemedText
            style={[styles.habitCadence, { color: theme.textSecondary }]}
          >
            {formatScheduleDays(action.frequency)}
          </ThemedText>
        </View>
        {daysDone !== null ? (
          <ThemedText
            style={[styles.habitDays, { color: theme.textSecondary }]}
          >
            {daysDone} {daysDone === 1 ? "day" : "days"} done
          </ThemedText>
        ) : null}
      </View>
      {rhythm ? (
        <RhythmStatusLine
          rhythm={rhythm}
          actionTitle={action.title}
          showTitle={false}
          onAdjust={onAdjust}
          style={styles.habitRhythm}
        />
      ) : null}
      {hasPlanDetails ? (
        <Pressable
          onPress={() => {
            Haptics.selectionAsync();
            setShowPlanDetails((value) => !value);
          }}
          hitSlop={8}
          pressRetentionOffset={12}
          accessibilityRole="button"
          accessibilityState={{ expanded: showPlanDetails }}
          accessibilityLabel={`Plan details for ${action.title}`}
          accessibilityHint={
            showPlanDetails
              ? "Hides when this habit happens and its small version"
              : "Shows when this habit happens and its small version"
          }
          style={({ pressed }) => [
            styles.planDetailsToggle,
            { opacity: pressed ? 0.6 : 1 },
          ]}
        >
          <ThemedText
            style={[styles.planDetailsText, { color: theme.textSecondary }]}
          >
            Plan details
          </ThemedText>
          <Feather
            name={showPlanDetails ? "chevron-up" : "chevron-down"}
            size={14}
            color={theme.textSecondary}
          />
        </Pressable>
      ) : null}
      {showPlanDetails && action.anchorLink ? (
        <ThemedText
          style={[styles.planDetailText, { color: theme.textSecondary }]}
        >
          <ThemedText style={[styles.planDetailLabel, { color: theme.text }]}>
            When:{" "}
          </ThemedText>
          {action.anchorLink}
        </ThemedText>
      ) : null}
      {showPlanDetails && action.kickstartVersion ? (
        <ThemedText
          style={[styles.planDetailText, { color: theme.textSecondary }]}
        >
          <ThemedText style={[styles.planDetailLabel, { color: theme.text }]}>
            Too busy? Just:{" "}
          </ThemedText>
          {action.kickstartVersion}
        </ThemedText>
      ) : null}
    </View>
  );
}

interface MilestoneRowProps {
  item: MilestoneProgressResult;
  expanded: boolean;
  isDark: boolean;
  theme: any;
  /** Present only while the full rhythm card is hidden. */
  rhythms?: ActionRhythm[];
  onToggle: (benchmarkId: string) => void;
  onEdit: (benchmarkId: string) => void;
  onAskMilestone: (benchmarkId: string) => void;
  onAdjust: (actionId: string) => void;
}

// One surface per milestone. The header is the only expand control and its
// one glyph is the chevron: a leading circle here read as a checkbox. The
// collapsed card is title, count, bar, and one caption; per-habit detail
// (cadence, rhythm, plan details) lives in the expanded rows.
const MilestoneRow = React.memo(function MilestoneRow({
  item,
  expanded,
  isDark,
  theme,
  rhythms,
  onToggle,
  onEdit,
  onAskMilestone,
  onAdjust,
}: MilestoneRowProps) {
  const {
    benchmark,
    actions: actionProgress,
    daysDone,
    target,
    progress,
    completed,
  } = item;
  const caption = formatMilestoneCaption({
    daysDone,
    target,
    completed,
    targetDate: benchmark.targetDate,
  });
  const showHabitCounts = actionProgress.length > 1;

  return (
    <View
      style={[
        styles.benchmarkCard,
        {
          backgroundColor: isDark
            ? Colors.dark.backgroundDefault
            : Colors.light.backgroundDefault,
        },
      ]}
    >
      <Pressable
        onPress={() => onToggle(benchmark.id)}
        hitSlop={4}
        pressRetentionOffset={12}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        accessibilityLabel={`${benchmark.title} milestone, ${daysDone} of ${target} days done. ${caption}`}
        accessibilityHint={
          expanded
            ? "Hides the habits in this milestone"
            : "Shows the habits in this milestone"
        }
        style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
      >
        <View style={styles.benchmarkHeader}>
          <ThemedText style={styles.benchmarkTitle}>
            {benchmark.title}
          </ThemedText>
          <ThemedText
            style={[styles.benchmarkDays, { color: theme.textSecondary }]}
          >
            {daysDone}/{target}
          </ThemedText>
          <Feather
            name={expanded ? "chevron-up" : "chevron-down"}
            size={20}
            color={theme.textSecondary}
          />
        </View>
        <ProgressBar
          progress={progress}
          color={completed ? theme.success : theme.accent}
        />
        {completed ? (
          // A tinted chip, not a solid pill: a solid fill read as a button
          // next to the filled "Add" control
          <View
            style={[
              styles.completeBadge,
              { backgroundColor: withAlpha(theme.success, 0.16) },
            ]}
          >
            <ThemedText
              style={[styles.completeBadgeText, { color: theme.success }]}
            >
              Complete
            </ThemedText>
          </View>
        ) : (
          <ThemedText
            style={[styles.milestoneCaption, { color: theme.textSecondary }]}
          >
            {caption}
          </ThemedText>
        )}
      </Pressable>
      {expanded ? (
        <View style={[styles.milestoneBody, { borderTopColor: theme.border }]}>
          {actionProgress.map(({ action, daysDone: actionDays }) => (
            <HabitPlanRow
              key={action.id}
              action={action}
              daysDone={showHabitCounts ? actionDays : null}
              rhythm={rhythms?.find((item) => item.actionId === action.id)}
              onAdjust={onAdjust}
              theme={theme}
            />
          ))}
          <View style={styles.milestoneFooter}>
            <Pressable
              onPress={() => onEdit(benchmark.id)}
              hitSlop={8}
              pressRetentionOffset={16}
              accessibilityRole="button"
              accessibilityLabel={`Edit ${benchmark.title} milestone`}
              style={({ pressed }) => [
                styles.footerAction,
                { opacity: pressed ? 0.6 : 1 },
              ]}
            >
              <Feather name="edit-2" size={14} color={theme.accent} />
              <ThemedText
                style={[styles.footerActionText, { color: theme.accent }]}
              >
                Edit
              </ThemedText>
            </Pressable>
            <Pressable
              onPress={() => onAskMilestone(benchmark.id)}
              hitSlop={8}
              pressRetentionOffset={16}
              accessibilityRole="button"
              accessibilityLabel={`Ask Coach about ${benchmark.title} milestone`}
              style={({ pressed }) => [
                styles.footerAction,
                { opacity: pressed ? 0.6 : 1 },
              ]}
            >
              <Feather name="message-circle" size={14} color={theme.accent} />
              <ThemedText
                style={[styles.footerActionText, { color: theme.accent }]}
              >
                Ask Coach
              </ThemedText>
            </Pressable>
          </View>
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
  const route = useRoute<RouteProp<MainTabParamList, "JourneyTab">>();
  // Focus is read from the navigator on demand (not useIsFocused), so a tab
  // switch doesn't re-render this whole screen.
  const listRef = useRef<FlatList>(null);
  const detailsOffset = useRef<number | null>(null);
  const pendingDateScroll = useRef(false);
  const scrollToRequestedDate = useCallback(() => {
    if (
      !pendingDateScroll.current ||
      !navigation.isFocused() ||
      detailsOffset.current === null
    )
      return;
    pendingDateScroll.current = false;
    listRef.current?.scrollToOffset({
      offset: detailsOffset.current,
      animated: false,
    });
  }, [navigation]);
  const { theme, isDark } = useTheme();
  const {
    hasOnboarded,
    persona,
    benchmarks,
    actions,
    dailyLogs: latestDailyLogs,
    personaAlignment,
    progressSnapshot: latestProgressSnapshot,
    toggleDailyLog,
    canAddBenchmark,
    subscription,
  } = useApp();
  // Journey stays mounted behind Today. Deferring the log-derived inputs
  // lets a Today check-off commit first (this screen re-renders with the
  // previous values, hitting its memos), then catch up at low priority.
  const dailyLogs = useDeferredValue(latestDailyLogs);
  const progressSnapshot = useDeferredValue(latestProgressSnapshot);

  const [currentDate, setCurrentDate] = useState(new Date());
  // Nothing is selected by default: today's list already lives on Today.
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  // A date handed over by Today (or a widget link) applies once Journey is
  // focused: immediately if it already is, otherwise on the focus event.
  const requestedDate = route.params?.date;
  const requestedIntentId = route.params?.intentId;
  useEffect(() => {
    const applyRequestedDate = () => {
      const requested = parseJourneyDate(requestedDate);
      if (!requested) return;
      setCurrentDate(requested);
      setSelectedDate(requested);
      pendingDateScroll.current = true;
      navigation.setParams({ date: undefined, intentId: undefined });
      requestAnimationFrame(scrollToRequestedDate);
    };
    if (navigation.isFocused()) applyRequestedDate();
    return navigation.addListener("focus", applyRequestedDate);
  }, [navigation, requestedDate, requestedIntentId, scrollToRequestedDate]);

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

  // A promise chain rather than try/catch keeps this screen
  // compiler-optimizable.
  const handleToggleAction = (
    actionId: string,
    dateStr: string,
    wasCompleted: boolean,
  ) => {
    if (wasCompleted) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } else {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
    return toggleDailyLog(actionId, dateStr)
      .then(() => {
        const action = actions.find((a) => a.id === actionId);
        if (action) {
          showToast(
            wasCompleted
              ? `Unmarked "${action.title}"`
              : `Completed "${action.title}"`,
            wasCompleted ? "info" : "success",
          );
        }
      })
      .catch(() => {
        showToast("Couldn’t update that habit. Try again.", "warning");
      });
  };

  const personaBenchmarks = useMemo(() => {
    return benchmarks.filter((b) => b.personaId === persona?.id);
  }, [benchmarks, persona?.id]);

  const personaActions = useMemo(() => {
    const personaBenchmarkIds = personaBenchmarks.map((b) => b.id);
    return actions.filter((a) => personaBenchmarkIds.includes(a.benchmarkId));
  }, [actions, personaBenchmarks]);

  const actionRhythms = useMemo(
    () => categorizeActionRhythms(personaActions, dailyLogs),
    [dailyLogs, personaActions],
  );
  const showRhythmCard = hasRhythmToSimplify(actionRhythms);

  // Stable per-milestone arrays so memoized milestone rows don't re-render
  const rhythmsByBenchmarkId = useMemo(() => {
    const benchmarkByAction = new Map(
      personaActions.map((action) => [action.id, action.benchmarkId]),
    );
    const grouped = new Map<string, ActionRhythm[]>();
    for (const rhythm of actionRhythms) {
      const benchmarkId = benchmarkByAction.get(rhythm.actionId);
      if (!benchmarkId) continue;
      grouped.set(benchmarkId, [...(grouped.get(benchmarkId) ?? []), rhythm]);
    }
    return grouped;
  }, [actionRhythms, personaActions]);

  // In January the story worth sharing is the year just finished — unless
  // there isn't one yet (a plan that started January 1), which would open an
  // empty recap.
  const recapYear = useMemo(() => {
    const now = new Date();
    const year = now.getFullYear();
    if (now.getMonth() !== 0) return year;
    const actionIds = new Set(personaActions.map((a) => a.id));
    const hadLastYear = dailyLogs.some(
      (log) =>
        log.status &&
        actionIds.has(log.actionId) &&
        log.logDate.startsWith(`${year - 1}-`),
    );
    return hadLastYear ? year - 1 : year;
  }, [dailyLogs, personaActions]);

  const personaCreatedAt = persona?.createdAt;
  const personaCreatedDate = useMemo(() => {
    if (!personaCreatedAt) return null;
    const date = new Date(personaCreatedAt);
    date.setHours(0, 0, 0, 0);
    return date;
  }, [personaCreatedAt]);

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

  // Collapsed by default: an expanded milestone runs several screens long,
  // and the row itself already carries the progress that matters.
  const [expandedBenchmarks, setExpandedBenchmarks] = useState<Set<string>>(
    () => new Set(),
  );

  const monthDisplay = useMemo(
    () =>
      getMonthProgressDisplay({
        actions: personaActions,
        logIndex: progressSnapshot.logIndex,
        planStartedAt: personaCreatedAt,
      }),
    [personaActions, progressSnapshot.logIndex, personaCreatedAt],
  );

  const [showMilestoneInfo, setShowMilestoneInfo] = useState(false);

  useEffect(() => {
    Promise.all([
      AsyncStorage.getItem(GUIDE_DISMISSED_KEY),
      AsyncStorage.getItem(MILESTONE_INFO_DISMISSED_KEY),
    ]).then(([guideDismissed, infoDismissed]) => {
      if (!guideDismissed) {
        // New plans never saw the old milestone rules, so the one-time
        // change note isn't for them (the Next Steps guide was retired).
        AsyncStorage.setItem(GUIDE_DISMISSED_KEY, "true");
        AsyncStorage.setItem(MILESTONE_INFO_DISMISSED_KEY, "true");
      } else if (!infoDismissed) {
        // Existing users get the one-time semantics-change note
        setShowMilestoneInfo(true);
      }
    });
  }, []);

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
      let total = 0;
      let completed = 0;
      for (const action of personaActions) {
        if (!actionIsScheduledOnDate(action, date)) continue;
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

    // Only the rows this month needs; a fixed 6-row grid adds a dead week.
    const remaining = calendarWeekCount(year, month) * 7 - days.length;
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

    const now = new Date();
    return days.map((day) =>
      describeCalendarDay(day, personaCreatedDate, shieldedDaySet, now),
    );
  }, [
    currentDate,
    personaActions,
    progressSnapshot.logIndex,
    personaCreatedDate,
    shieldedDaySet,
  ]);
  const calendarWeeks = useMemo(
    () => chunkIntoWeeks(calendarDays),
    [calendarDays],
  );
  const selectedDateStr = selectedDate
    ? getLocalDateString(selectedDate)
    : null;
  const selectDay = useCallback((date: Date) => {
    setSelectedDate((current) => nextDaySelection(current, date));
    if (Platform.OS !== "web") {
      Haptics.selectionAsync();
    }
  }, []);

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

  const adjustAction = useCallback(
    (actionId: string) => {
      const action = personaActions.find((item) => item.id === actionId);
      if (!action) return;
      Haptics.selectionAsync();
      navigation.navigate("ActionEditor", {
        actionId,
        benchmarkId: action.benchmarkId,
      });
    },
    [navigation, personaActions],
  );

  const askCoachAboutMilestone = useCallback(
    (benchmarkId: string) => {
      navigation.navigate("CoachSheet", {
        origin: "milestone",
        benchmarkId,
        promptId: "reflect-success",
      });
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
        rhythms={
          showRhythmCard
            ? undefined
            : rhythmsByBenchmarkId.get(item.benchmark.id)
        }
        onToggle={toggleExpand}
        onEdit={editBenchmark}
        onAskMilestone={askCoachAboutMilestone}
        onAdjust={adjustAction}
      />
    ),
    [
      adjustAction,
      askCoachAboutMilestone,
      editBenchmark,
      expandedBenchmarks,
      isDark,
      rhythmsByBenchmarkId,
      showRhythmCard,
      theme,
      toggleExpand,
    ],
  );

  const thisMonthName = MONTHS[new Date().getMonth()];
  const earlyProgress =
    monthDisplay.kind === "early" ? formatEarlyProgress(monthDisplay) : null;
  const maxRestDays = subscription.isPremium ? 2 : 1;
  const streakText = streak.shieldUsed
    ? "Streak protected"
    : `${streak.current}-day streak`;
  // The ring's explainer lives here so the visible row stays one glance
  const progressSummaryLabel = [
    earlyProgress
      ? `${earlyProgress.title}, ${earlyProgress.detail}`
      : `${thisMonthName} consistency ${personaAlignment}%. Share of this month's planned days you showed up. Fresh start on the 1st`,
    streakText,
    `Best: ${streak.longest} ${streak.longest === 1 ? "day" : "days"}`,
    `${streak.shieldsAvailable} of ${maxRestDays} rest day${maxRestDays === 1 ? "" : "s"} ready`,
  ].join(". ");

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
        ref={listRef}
        onContentSizeChange={scrollToRequestedDate}
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
            {/* The header names the plan; only the description adds meaning */}
            {persona.description ? (
              <View style={styles.personaIntro}>
                <ThemedText
                  style={[
                    styles.personaDescription,
                    { color: theme.textSecondary },
                  ]}
                  numberOfLines={2}
                >
                  {persona.description}
                </ThemedText>
              </View>
            ) : null}

            {showMilestoneInfo ? (
              <View
                style={[
                  styles.guideCard,
                  {
                    borderColor: withAlpha(theme.accent, 0.3),
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
                  Each milestone now completes after 21 days of doing its habit
                  on schedule. Progress only fills up. It never goes backwards.
                </ThemedText>
              </View>
            ) : null}

            <View
              accessible
              accessibilityLabel={progressSummaryLabel}
              style={styles.progressRow}
            >
              {monthDisplay.kind === "ring" ? (
                <CircularProgress
                  progress={personaAlignment}
                  size={64}
                  strokeWidth={6}
                  valueFontSize={16}
                />
              ) : null}
              <View style={styles.progressTextCol}>
                {earlyProgress ? (
                  <ThemedText style={styles.progressTitle}>
                    {earlyProgress.title}
                    <ThemedText
                      style={[
                        styles.progressDetail,
                        { color: theme.textSecondary },
                      ]}
                    >
                      {` · ${earlyProgress.detail}`}
                    </ThemedText>
                  </ThemedText>
                ) : (
                  <ThemedText style={styles.progressTitle}>
                    {thisMonthName} consistency
                  </ThemedText>
                )}
                <View style={styles.progressStats}>
                  <View style={styles.progressStat}>
                    {streak.shieldUsed ? (
                      <Feather
                        name="shield"
                        size={13}
                        color={theme.textSecondary}
                      />
                    ) : (
                      <MaterialCommunityIcons
                        name="fire"
                        size={15}
                        color={
                          streak.current > 0
                            ? theme.warning
                            : theme.textSecondary
                        }
                      />
                    )}
                    <ThemedText
                      style={[
                        styles.progressStatText,
                        { color: theme.textSecondary },
                      ]}
                    >
                      {streakText}
                    </ThemedText>
                  </View>
                  <View style={styles.progressStat}>
                    <Feather
                      name="award"
                      size={13}
                      color={theme.textSecondary}
                    />
                    <ThemedText
                      style={[
                        styles.progressStatText,
                        { color: theme.textSecondary },
                      ]}
                    >
                      Best {streak.longest}
                    </ThemedText>
                  </View>
                  <View style={styles.progressStat}>
                    <Feather
                      name="shield"
                      size={13}
                      color={theme.textSecondary}
                    />
                    <ThemedText
                      style={[
                        styles.progressStatText,
                        { color: theme.textSecondary },
                      ]}
                    >
                      {streak.shieldsAvailable}/{maxRestDays} rest
                    </ThemedText>
                  </View>
                </View>
              </View>
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
              {calendarWeeks.map((week) => (
                <View key={week[0].dateStr} style={styles.calendarWeek}>
                  {week.map((dayInfo) => (
                    <DayCell
                      key={dayInfo.dateStr}
                      day={dayInfo}
                      isSelected={dayInfo.dateStr === selectedDateStr}
                      onSelect={selectDay}
                      theme={theme}
                    />
                  ))}
                </View>
              ))}
            </View>

            <View style={styles.legendContainer}>
              <View style={styles.legendItem}>
                <Feather name="moon" size={12} color={theme.textSecondary} />
                <ThemedText
                  style={[styles.legendText, { color: theme.textSecondary }]}
                >
                  Rest
                </ThemedText>
              </View>
              <View style={styles.legendItem}>
                <Feather name="check" size={14} color={theme.success} />
                <ThemedText
                  style={[styles.legendText, { color: theme.textSecondary }]}
                >
                  Complete
                </ThemedText>
              </View>
              <View style={styles.legendItem}>
                <Feather name="minus" size={14} color={theme.warning} />
                <ThemedText
                  style={[styles.legendText, { color: theme.textSecondary }]}
                >
                  Partial
                </ThemedText>
              </View>
              <View style={styles.legendItem}>
                <Feather name="x" size={14} color={theme.error} />
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
                  Covered
                </ThemedText>
              </View>
            </View>

            <View
              onLayout={(event) => {
                detailsOffset.current = event.nativeEvent.layout.y;
                scrollToRequestedDate();
              }}
            >
              {selectedDate ? (
                <SelectedDateDetails
                  date={selectedDate}
                  actions={personaActions}
                  // The day the user is tapping must reflect each tap at
                  // once; only the calendar and Insights read deferred data.
                  logIndex={latestProgressSnapshot.logIndex}
                  benchmarkById={benchmarkById}
                  isDark={isDark}
                  theme={theme}
                  onToggleAction={handleToggleAction}
                />
              ) : null}
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
                  {canAddBenchmark() ? "Add milestone" : "Add · Premium"}
                </ThemedText>
              </Pressable>
            </View>
          </>
        }
        ListFooterComponent={
          <>
            {/* The rhythm card is a tune-up prompt, shown only when a habit is
                worth simplifying; otherwise each milestone row carries its
                rhythm status inline. */}
            {showRhythmCard ? (
              <JourneyFramingCard
                actions={personaActions}
                rhythms={actionRhythms}
                onAdjust={adjustAction}
              />
            ) : null}
            <InsightsPanel
              actions={personaActions}
              dailyLogs={dailyLogs}
              logIndex={progressSnapshot.logIndex}
              personaName={persona?.name ?? "Future You"}
              isPremium={subscription.isPremium}
              onUpgrade={() =>
                navigation.navigate("Subscription", { source: "insights" })
              }
            />
            <View style={styles.journeyToolsSection}>
              <ThemedText style={styles.journeyToolsHeading}>
                Stories &amp; Support
              </ThemedText>
              <JourneyTool
                icon="award"
                title="The Year You Became"
                subtitle={
                  subscription.isPremium
                    ? recapYear === new Date().getFullYear()
                      ? `${recapYear} year-to-date story`
                      : `Your ${recapYear} story`
                    : "Your year so far, ready to share"
                }
                onPress={() =>
                  navigation.navigate("YearRecap", { year: recapYear })
                }
              />
              <JourneyTool
                icon="users"
                title="Someone in Your Corner"
                subtitle="One trusted witness · you choose every share"
                onPress={() => navigation.navigate("Witness")}
              />
            </View>
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
  personaIntro: {
    marginBottom: Spacing.xl,
    gap: Spacing.xs,
  },
  personaDescription: {
    ...Typography.small,
    lineHeight: 20,
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
  progressRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.lg,
    marginBottom: Spacing.xl,
  },
  progressTextCol: {
    flex: 1,
    gap: Spacing.xs,
  },
  progressTitle: {
    ...Typography.headline,
  },
  progressDetail: {
    ...Typography.body,
  },
  progressStats: {
    flexDirection: "row",
    flexWrap: "wrap",
    columnGap: Spacing.md,
    rowGap: Spacing.xs,
  },
  progressStat: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  progressStatText: {
    ...Typography.small,
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
  // Explicit week rows with a fixed cell height: a wrapping grid of
  // percentage-width, aspectRatio cells let Yoga reserve height for rows that
  // never render, leaving a dead band above the legend on 5-row months.
  calendarGrid: {
    marginBottom: Spacing.xl,
  },
  calendarWeek: {
    flexDirection: "row",
  },
  dayCell: {
    flex: 1,
    height: CALENDAR_CELL_HEIGHT,
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
    gap: Spacing.md,
    minHeight: 44,
    paddingVertical: Spacing.xs,
  },
  selectedDateActionInfo: {
    flex: 1,
  },
  // Centers the 22pt check on the title's first 24pt line
  selectedDateCheck: {
    paddingTop: 1,
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
  },
  benchmarkCard: {
    padding: Spacing.lg,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.sm,
  },
  benchmarkHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  benchmarkTitle: {
    ...Typography.headline,
    lineHeight: 22,
    flex: 1,
  },
  benchmarkDays: {
    ...Typography.small,
    fontWeight: "600",
    lineHeight: 22,
  },
  milestoneCaption: {
    ...Typography.caption,
    lineHeight: 17,
    marginTop: Spacing.sm,
  },
  completeBadge: {
    alignSelf: "flex-start",
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.full,
    marginTop: Spacing.sm,
  },
  completeBadgeText: {
    ...Typography.caption,
    fontWeight: "700",
  },
  milestoneBody: {
    marginTop: Spacing.md,
    paddingTop: Spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: Spacing.lg,
  },
  habitRow: {
    gap: 2,
  },
  habitRhythm: {
    marginTop: 0,
  },
  habitHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: Spacing.md,
  },
  habitText: {
    flex: 1,
  },
  habitTitle: {
    ...Typography.body,
    fontWeight: "600",
  },
  habitCadence: {
    ...Typography.caption,
    marginTop: 2,
  },
  habitDays: {
    ...Typography.caption,
    fontWeight: "600",
    marginTop: 3,
  },
  planDetailsToggle: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: Spacing.xs,
    minHeight: 32,
  },
  planDetailsText: {
    ...Typography.caption,
    fontWeight: "600",
  },
  planDetailText: {
    ...Typography.small,
    lineHeight: 20,
    // Fabric can measure a Text unconstrained on first layout, rendering it
    // as one clipped line; an explicit width forces wrap on the first pass
    width: "100%",
    flexShrink: 1,
  },
  planDetailLabel: {
    ...Typography.small,
    fontWeight: "600",
  },
  milestoneFooter: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xl,
  },
  footerAction: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    minHeight: 44,
  },
  footerActionText: {
    ...Typography.small,
    fontWeight: "600",
  },
});
