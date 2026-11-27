import React, { useEffect, useRef, useState } from "react";
import {
  View,
  ScrollView,
  TextInput,
  Pressable,
  StyleSheet,
  AccessibilityInfo,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { ThemedText } from "@/components/ThemedText";
import { useTheme } from "@/hooks/useTheme";
import { Spacing, BorderRadius, Typography } from "@/constants/theme";
import { WEEKDAY_ORDER, getLocalDateString } from "@/lib/progress";
import { nextScheduledDay } from "@/lib/journey-date";
import {
  getPlanIssue,
  newYearStartOption,
  planStartInstant,
  type OnboardingPlanDraft,
  type PlanIssue,
} from "@/lib/onboarding-plan";
import {
  ASK_COACH_TO_CHANGE,
  CHANGE_DAYS,
  HIDE_MORE_STEPS,
  STEP_INCLUDED,
  STEP_SAVED_FOR_LATER,
  moreStepsLabel,
  planReviewIntro,
  scheduleLabel,
  startWithHabitsLabel,
  SELF_SETUP_STARTERS_LABEL,
} from "@/lib/copy";
import {
  isSelfSetupDraft,
  SELF_SETUP_STARTERS,
  withStarterResolution,
} from "@/lib/starter-plan";

export function OnboardingPlanReview({
  draft,
  onChange: changeDraft,
  onApprove,
  onAskCoach,
  saving,
  error,
}: {
  draft: OnboardingPlanDraft;
  onChange: (draft: OnboardingPlanDraft) => void;
  onApprove: () => void;
  /** Returns to the Coach chat; absent for plans made without Coach. */
  onAskCoach?: () => void;
  saving: boolean;
  error: string | null;
}) {
  const { theme } = useTheme();
  const [editing, setEditing] = useState<number | null>(null);
  const [editingName, setEditingName] = useState(false);
  const [editingResolution, setEditingResolution] = useState(false);
  const newYearStart = newYearStartOption();
  const [showIdeas, setShowIdeas] = useState(false);
  const [issue, setIssue] = useState<PlanIssue | null>(null);
  const scrollRef = useRef<ScrollView>(null);
  const fieldRefs = useRef<Record<string, TextInput | null>>({});
  const cardOffsets = useRef<Record<number, number>>({});
  const onChange = (next: OnboardingPlanDraft) => {
    setIssue(null);
    changeDraft(next);
  };
  useEffect(() => {
    if (!issue) return;
    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({
        y:
          issue.suggestionIndex === undefined
            ? 0
            : cardOffsets.current[issue.suggestionIndex] || 0,
        animated: true,
      });
      fieldRefs.current[
        `${issue.suggestionIndex ?? "identity"}-${issue.field}`
      ]?.focus();
      AccessibilityInfo.announceForAccessibility(issue.message);
    });
  }, [issue]);
  const approve = () => {
    const invalid = getPlanIssue(draft);
    if (invalid) {
      setIssue(invalid);
      if (invalid.field === "name") setEditingName(true);
      if (invalid.field === "selection") setShowIdeas(true);
      if (invalid.suggestionIndex !== undefined)
        setEditing(invalid.suggestionIndex);
      return;
    }
    onApprove();
  };
  const editButton = (
    label: string,
    onPress: () => void,
    expanded?: boolean,
  ) => (
    <Pressable
      onPress={onPress}
      disabled={saving}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: saving, expanded }}
      hitSlop={8}
      pressRetentionOffset={12}
      style={({ pressed }) => [
        styles.editButton,
        { opacity: pressed ? 0.6 : 1 },
      ]}
    >
      <ThemedText style={{ color: theme.accent, fontWeight: "600" }}>
        {label}
      </ThemedText>
    </Pressable>
  );
  // One quiet icon per row: stacked accent "Edit ..." links competed with the
  // Start button. The label keeps the old wording for VoiceOver and QA.
  const editIcon = (label: string, onPress: () => void, expanded: boolean) => (
    <Pressable
      onPress={onPress}
      disabled={saving}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: saving, expanded }}
      hitSlop={8}
      pressRetentionOffset={12}
      style={({ pressed }) => [styles.editIcon, { opacity: pressed ? 0.5 : 1 }]}
    >
      {/* "Done" in words: a bare check glyph read as a completion mark */}
      {expanded ? (
        <ThemedText style={{ color: theme.accent, fontWeight: "600" }}>
          Done
        </ThemedText>
      ) : (
        <Feather name="edit-2" size={18} color={theme.textSecondary} />
      )}
    </Pressable>
  );
  const selfSetup = isSelfSetupDraft(draft);
  // On a self-made plan the resolution picks which starter steps are shown,
  // until the person edits them. Coach-made plans only take the text.
  const fitStepsTo = (resolution: string) => {
    const next = withStarterResolution(draft, resolution);
    if (next.suggestions !== draft.suggestions) setEditing(null);
    if (
      next.suggestions !== draft.suggestions ||
      next.resolution !== draft.resolution
    )
      onChange(next);
  };
  const count = draft.suggestions.filter((item) => item.selected).length;
  const update = (
    index: number,
    patch: Partial<OnboardingPlanDraft["suggestions"][number]>,
  ) =>
    onChange({
      ...draft,
      suggestions: draft.suggestions.map((item, i) =>
        i === index ? { ...item, ...patch } : item,
      ),
    });
  const inputStyle = [
    styles.input,
    {
      color: theme.text,
      backgroundColor: theme.backgroundSecondary,
      borderColor: theme.border,
    },
  ];
  const plannedStart = planStartInstant(draft);
  const firstDay = nextScheduledDay(
    draft.suggestions
      .filter((item) => item.selected)
      .map((item) => ({
        ...item.elementalAction,
        createdAt: plannedStart?.toISOString(),
      })),
    plannedStart ?? undefined,
  );
  const startsToday = firstDay?.dateKey === getLocalDateString(new Date());
  const approveLabel = plannedStart
    ? `Plan it for ${plannedStart.toLocaleDateString("en-US", { month: "long", day: "numeric" })}`
    : startWithHabitsLabel(count);
  const optionalCount = draft.suggestions.filter(
    (item) => !item.selected,
  ).length;
  return (
    <View style={{ flex: 1 }}>
      <ScrollView
        ref={scrollRef}
        style={styles.scrollViewport}
        contentContainerStyle={styles.content}
        contentInsetAdjustmentBehavior="never"
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        <ThemedText style={{ color: theme.textSecondary }}>
          {planReviewIntro(optionalCount)}
        </ThemedText>
        {draft.resolution !== undefined ? (
          <View style={styles.identity}>
            <ThemedText style={styles.label}>Your resolution</ThemedText>
            <View style={styles.editRow}>
              {editingResolution ? (
                <TextInput
                  value={draft.resolution}
                  onChangeText={(resolution) =>
                    onChange({ ...draft, resolution })
                  }
                  accessibilityLabel="Your resolution"
                  placeholder="e.g., Lose 15 pounds"
                  placeholderTextColor={theme.textSecondary}
                  style={[inputStyle, styles.editField]}
                  editable={!saving}
                  maxLength={90}
                  // Applied when typing ends, not per keystroke, so the
                  // steps below do not change under the person's fingers.
                  onEndEditing={(event) => fitStepsTo(event.nativeEvent.text)}
                />
              ) : draft.resolution.trim() ? (
                <ThemedText style={[styles.identityName, styles.editField]}>
                  {draft.resolution.trim()}
                </ThemedText>
              ) : (
                <ThemedText
                  style={[
                    styles.placeholder,
                    styles.editField,
                    { color: theme.textSecondary },
                  ]}
                >
                  Add your resolution
                </ThemedText>
              )}
              {editIcon(
                editingResolution
                  ? "Done editing resolution"
                  : "Edit resolution",
                () => {
                  if (editingResolution) fitStepsTo(draft.resolution ?? "");
                  setEditingResolution(!editingResolution);
                },
                editingResolution,
              )}
            </View>
            {selfSetup && !draft.resolution.trim() && !editingResolution ? (
              <>
                <ThemedText style={{ color: theme.textSecondary }}>
                  {SELF_SETUP_STARTERS_LABEL}
                </ThemedText>
                <View
                  style={styles.starters}
                  accessibilityLabel="Resolution ideas"
                >
                  {SELF_SETUP_STARTERS.map((starter) => (
                    <Pressable
                      key={starter}
                      onPress={() => fitStepsTo(starter)}
                      disabled={saving}
                      accessibilityRole="button"
                      accessibilityLabel={`Use resolution: ${starter}`}
                      accessibilityState={{ disabled: saving }}
                      hitSlop={6}
                      pressRetentionOffset={12}
                      style={({ pressed }) => [
                        styles.starter,
                        {
                          borderColor: theme.accent,
                          backgroundColor: theme.backgroundSecondary,
                          opacity: pressed ? 0.6 : 1,
                        },
                      ]}
                    >
                      <ThemedText
                        style={{ color: theme.text, fontWeight: "600" }}
                      >
                        {starter}
                      </ThemedText>
                    </Pressable>
                  ))}
                </View>
              </>
            ) : null}
          </View>
        ) : null}
        <View style={styles.identity}>
          <ThemedText style={styles.label}>Who you are becoming</ThemedText>
          <View style={styles.editRow}>
            {editingName ? (
              <TextInput
                ref={(node) => {
                  fieldRefs.current["identity-name"] = node;
                }}
                value={draft.name}
                onChangeText={(name) => onChange({ ...draft, name })}
                accessibilityLabel="Identity name"
                placeholder="e.g., Consistent Writer"
                placeholderTextColor={theme.textSecondary}
                style={[inputStyle, styles.editField]}
                editable={!saving}
              />
            ) : (
              <ThemedText style={[styles.identityName, styles.editField]}>
                {draft.name}
              </ThemedText>
            )}
            {editIcon(
              editingName ? "Done editing identity" : "Edit identity",
              () => setEditingName(!editingName),
              editingName,
            )}
          </View>
        </View>
        {draft.suggestions.map((item, index) =>
          item.selected || showIdeas ? (
            <View
              onLayout={(event) => {
                cardOffsets.current[index] = event.nativeEvent.layout.y;
              }}
              key={index}
              style={[styles.card, { borderColor: theme.border }]}
            >
              <Pressable
                onPress={() => {
                  if (item.selected && count === 1) setShowIdeas(true);
                  update(index, { selected: !item.selected });
                }}
                disabled={saving}
                accessibilityRole="checkbox"
                accessibilityState={{
                  checked: item.selected,
                  disabled: saving,
                }}
                accessibilityLabel={`Include ${item.elementalAction.title || `habit ${index + 1}`}`}
                hitSlop={8}
                pressRetentionOffset={12}
                style={({ pressed }) => [
                  styles.selection,
                  { opacity: pressed ? 0.6 : 1 },
                ]}
              >
                <Feather
                  name={item.selected ? "check-square" : "square"}
                  size={22}
                  color={theme.accent}
                />
                <ThemedText style={{ flex: 1 }}>
                  {item.selected ? STEP_INCLUDED : STEP_SAVED_FOR_LATER}
                </ThemedText>
              </Pressable>
              {!item.selected ? (
                <>
                  <ThemedText>
                    {item.elementalAction.title || "Your own habit"}
                  </ThemedText>
                  {item.why ? (
                    <ThemedText style={{ color: theme.textSecondary }}>
                      {item.why}
                    </ThemedText>
                  ) : null}
                </>
              ) : editing !== index ? (
                <View style={styles.summary}>
                  <View style={styles.editRow}>
                    <ThemedText style={[styles.actionTitle, styles.editField]}>
                      {item.elementalAction.title || "Choose an action"}
                    </ThemedText>
                    {editIcon(
                      `Edit habit ${index + 1}`,
                      () => setEditing(index),
                      false,
                    )}
                  </View>
                  {item.why ? <ThemedText>{item.why}</ThemedText> : null}
                  {item.scheduleSource === "suggested" &&
                  item.elementalAction.frequency.length > 0 ? (
                    // Days the person never gave are labelled, with the
                    // way to change them beside the label.
                    <View style={styles.editRow}>
                      <ThemedText
                        style={[
                          styles.editField,
                          { color: theme.textSecondary },
                        ]}
                      >
                        {scheduleLabel(
                          item.elementalAction.frequency,
                          "suggested",
                        )}
                      </ThemedText>
                      <Pressable
                        onPress={() => setEditing(index)}
                        disabled={saving}
                        accessibilityRole="button"
                        accessibilityLabel={`Change days for habit ${index + 1}`}
                        accessibilityState={{ disabled: saving }}
                        hitSlop={8}
                        pressRetentionOffset={12}
                        style={({ pressed }) => [
                          styles.editIcon,
                          { opacity: pressed ? 0.5 : 1 },
                        ]}
                      >
                        <ThemedText
                          style={{ color: theme.accent, fontWeight: "600" }}
                        >
                          {CHANGE_DAYS}
                        </ThemedText>
                      </Pressable>
                    </View>
                  ) : (
                    <ThemedText style={{ color: theme.textSecondary }}>
                      {scheduleLabel(item.elementalAction.frequency, "stated")}
                    </ThemedText>
                  )}
                  <ThemedText style={styles.label}>
                    The 2-minute version
                  </ThemedText>
                  <ThemedText>
                    {item.elementalAction.kickstartVersion ||
                      "Choose a small version"}
                  </ThemedText>
                  {item.elementalAction.anchorLink ? (
                    <ThemedText style={{ color: theme.textSecondary }}>
                      {item.elementalAction.anchorLink}
                    </ThemedText>
                  ) : null}
                </View>
              ) : (
                <>
                  <ThemedText style={styles.label}>
                    Habit {index + 1}
                  </ThemedText>
                  <TextInput
                    value={item.elementalAction.title}
                    onChangeText={(title) =>
                      update(index, {
                        elementalAction: { ...item.elementalAction, title },
                      })
                    }
                    ref={(node) => {
                      fieldRefs.current[`${index}-action`] = node;
                    }}
                    accessibilityLabel={`Habit ${index + 1} action`}
                    placeholder="e.g., Write one paragraph"
                    placeholderTextColor={theme.textSecondary}
                    style={inputStyle}
                    editable={!saving}
                    multiline
                  />
                  <ThemedText style={styles.label}>Milestone</ThemedText>
                  <TextInput
                    value={item.title}
                    onChangeText={(title) => update(index, { title })}
                    ref={(node) => {
                      fieldRefs.current[`${index}-milestone`] = node;
                    }}
                    accessibilityLabel={`Habit ${index + 1} milestone`}
                    style={inputStyle}
                    editable={!saving}
                  />
                  <ThemedText style={styles.label}>Days that fit</ThemedText>
                  <View style={styles.days}>
                    {WEEKDAY_ORDER.map((day) => {
                      const checked =
                        item.elementalAction.frequency.includes(day);
                      return (
                        <Pressable
                          key={day}
                          onPress={() =>
                            update(index, {
                              // Days the person picks here are their own.
                              scheduleSource: "stated",
                              elementalAction: {
                                ...item.elementalAction,
                                frequency: checked
                                  ? item.elementalAction.frequency.filter(
                                      (d) => d !== day,
                                    )
                                  : [...item.elementalAction.frequency, day],
                              },
                            })
                          }
                          disabled={saving}
                          accessibilityRole="checkbox"
                          accessibilityLabel={`Habit ${index + 1}, ${day}`}
                          accessibilityState={{ checked, disabled: saving }}
                          pressRetentionOffset={12}
                          style={({ pressed }) => [
                            styles.day,
                            {
                              backgroundColor: checked
                                ? theme.accent
                                : theme.backgroundSecondary,
                              opacity: pressed ? 0.6 : 1,
                            },
                          ]}
                        >
                          <ThemedText
                            style={{
                              color: checked ? theme.buttonText : theme.text,
                            }}
                          >
                            {day.slice(0, 3)}
                          </ThemedText>
                        </Pressable>
                      );
                    })}
                  </View>
                  {item.elementalAction.frequency.length === 0 ? (
                    <ThemedText style={{ color: theme.warning }}>
                      Choose at least one day. No days have been added for you.
                    </ThemedText>
                  ) : null}
                  <ThemedText style={styles.label}>
                    The 2-minute version
                  </ThemedText>
                  <TextInput
                    value={item.elementalAction.kickstartVersion}
                    onChangeText={(kickstartVersion) =>
                      update(index, {
                        elementalAction: {
                          ...item.elementalAction,
                          kickstartVersion,
                        },
                      })
                    }
                    ref={(node) => {
                      fieldRefs.current[`${index}-small`] = node;
                    }}
                    accessibilityLabel={`Habit ${index + 1} small version`}
                    style={inputStyle}
                    editable={!saving}
                    multiline
                  />
                  <ThemedText style={styles.label}>
                    When it fits (optional)
                  </ThemedText>
                  <TextInput
                    value={item.elementalAction.anchorLink}
                    onChangeText={(anchorLink) =>
                      update(index, {
                        elementalAction: {
                          ...item.elementalAction,
                          anchorLink,
                        },
                      })
                    }
                    accessibilityLabel={`Habit ${index + 1} reminder anchor`}
                    style={inputStyle}
                    editable={!saving}
                  />
                  {editButton(
                    `Done editing habit ${index + 1}`,
                    () => setEditing(null),
                    true,
                  )}
                </>
              )}
            </View>
          ) : null,
        )}
        {optionalCount > 0
          ? editButton(
              showIdeas ? HIDE_MORE_STEPS : moreStepsLabel(optionalCount),
              () => {
                const opening = !showIdeas;
                setShowIdeas(opening);
                // The revealed ideas land below the fold; bring them into view.
                if (opening)
                  setTimeout(
                    () => scrollRef.current?.scrollToEnd({ animated: true }),
                    80,
                  );
              },
              showIdeas,
            )
          : null}
        {draft.suggestions.length < 5 ? (
          <Pressable
            onPress={() => {
              setEditing(draft.suggestions.length);
              onChange({
                ...draft,
                suggestions: [
                  ...draft.suggestions,
                  {
                    selected: true,
                    title: "Build a steady habit",
                    // The person picks these days themselves.
                    scheduleSource: "stated",
                    elementalAction: {
                      title: "",
                      frequency: [],
                      kickstartVersion: "",
                      anchorLink: "",
                    },
                  },
                ],
              });
            }}
            disabled={saving}
            accessibilityRole="button"
            accessibilityLabel="Add a habit of your own"
            hitSlop={8}
            pressRetentionOffset={12}
            style={({ pressed }) => [
              styles.selection,
              { opacity: pressed ? 0.6 : 1 },
            ]}
          >
            <ThemedText style={{ color: theme.accent }}>
              Add a habit of your own
            </ThemedText>
          </Pressable>
        ) : null}
        {onAskCoach ? editButton(ASK_COACH_TO_CHANGE, onAskCoach) : null}
        <ThemedText style={{ color: theme.textSecondary }}>
          Your plan starts only when you tap Start. Your draft is saved as you
          go.
        </ThemedText>
      </ScrollView>
      <View
        style={[
          styles.footer,
          {
            borderTopColor: theme.border,
            backgroundColor: theme.backgroundRoot,
          },
        ]}
      >
        {issue || error ? (
          <ThemedText
            accessibilityRole="alert"
            accessibilityLiveRegion="polite"
            style={{ color: theme.error }}
          >
            {issue?.message || error}
          </ThemedText>
        ) : count === 0 ? (
          <ThemedText
            accessibilityLiveRegion="polite"
            style={{ color: theme.warning }}
          >
            Choose at least one habit to start.
          </ThemedText>
        ) : null}
        {!(issue || error) && count > 0 && newYearStart ? (
          <View
            style={styles.startChoice}
            accessibilityRole="radiogroup"
            accessibilityLabel="When your plan starts"
          >
            {[
              { key: undefined, label: "Start today" },
              { key: newYearStart, label: "Start January 1" },
            ].map((option) => {
              const selected = draft.startDate === option.key;
              return (
                <Pressable
                  key={option.label}
                  onPress={() => onChange({ ...draft, startDate: option.key })}
                  disabled={saving}
                  accessibilityRole="radio"
                  accessibilityState={{ selected, disabled: saving }}
                  accessibilityLabel={option.label}
                  hitSlop={6}
                  pressRetentionOffset={12}
                  style={({ pressed }) => [
                    styles.startOption,
                    {
                      borderColor: selected ? theme.accent : theme.border,
                      backgroundColor: selected
                        ? theme.backgroundSecondary
                        : "transparent",
                      opacity: pressed ? 0.6 : 1,
                    },
                  ]}
                >
                  <ThemedText
                    style={{
                      color: selected ? theme.accent : theme.text,
                      fontWeight: "600",
                    }}
                  >
                    {option.label}
                  </ThemedText>
                </Pressable>
              );
            })}
          </View>
        ) : null}
        {issue || error || count === 0 ? null : firstDay ? (
          <ThemedText
            style={{ color: theme.textSecondary, textAlign: "center" }}
          >
            {startsToday
              ? "Starts today"
              : `Starts ${firstDay.date.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })}`}
          </ThemedText>
        ) : null}
        <Pressable
          onPress={approve}
          disabled={saving || count === 0}
          accessibilityRole="button"
          accessibilityState={{ disabled: saving || count === 0, busy: saving }}
          accessibilityLabel={approveLabel}
          hitSlop={8}
          pressRetentionOffset={12}
          style={({ pressed }) => [
            styles.approve,
            {
              backgroundColor: theme.accent,
              opacity: saving || count === 0 ? 0.45 : pressed ? 0.7 : 1,
            },
          ]}
        >
          <ThemedText style={{ color: theme.buttonText, fontWeight: "700" }}>
            {saving ? "Saving your plan…" : approveLabel}
          </ThemedText>
        </Pressable>
      </View>
    </View>
  );
}
const styles = StyleSheet.create({
  identity: { gap: Spacing.xs },
  starters: { flexDirection: "row", flexWrap: "wrap", gap: Spacing.sm },
  starter: {
    minHeight: 40,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    justifyContent: "center",
  },
  startChoice: { flexDirection: "row", gap: Spacing.sm },
  startOption: {
    flex: 1,
    minHeight: 44,
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  identityName: { fontSize: 22, lineHeight: 28, fontWeight: "600" },
  placeholder: { ...Typography.body, lineHeight: 28 },
  editRow: { flexDirection: "row", alignItems: "center", gap: Spacing.sm },
  editField: { flex: 1 },
  editIcon: {
    minWidth: 44,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  actionTitle: { fontSize: 22, lineHeight: 28, fontWeight: "600" },
  summary: { gap: Spacing.sm },
  editButton: {
    minHeight: 44,
    justifyContent: "center",
    alignSelf: "flex-start",
  },
  footer: {
    flexShrink: 0,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: Spacing.sm,
  },
  content: {
    padding: Spacing.lg,
    paddingBottom: Spacing["3xl"],
    gap: Spacing.md,
  },
  scrollViewport: { flex: 1, minHeight: 0 },
  label: { ...Typography.small, fontWeight: "600", marginTop: Spacing.sm },
  input: {
    minHeight: 48,
    borderWidth: 1,
    borderRadius: BorderRadius.sm,
    padding: Spacing.md,
    ...Typography.body,
  },
  card: {
    borderWidth: 1,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  selection: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  days: { flexDirection: "row", flexWrap: "wrap", gap: Spacing.sm },
  day: {
    minWidth: 48,
    minHeight: 44,
    borderRadius: BorderRadius.sm,
    padding: Spacing.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  approve: {
    minHeight: 52,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    alignItems: "center",
    justifyContent: "center",
  },
});
