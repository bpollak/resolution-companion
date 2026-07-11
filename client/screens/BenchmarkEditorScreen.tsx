import React, { useState } from "react";
import {
  View,
  StyleSheet,
  TextInput,
  Pressable,
  Alert,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation, useRoute, RouteProp } from "@react-navigation/native";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";

import { useTheme } from "@/hooks/useTheme";
import { useApp } from "@/context/AppContext";
import { Colors, Spacing, Typography, BorderRadius } from "@/constants/theme";
import { ThemedText } from "@/components/ThemedText";
import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollViewCompat";
import {
  formatScheduleDays,
  formatTargetCountdown,
  getLocalDateString,
} from "@/lib/progress";
import { logger } from "@/lib/logger";

const MIN_ACTIONS_PER_PERSONA = 3;
const MAX_ACTIONS_PER_PERSONA = 5;

/** Relative presets keep the picker dependency-free and the tone gentle. */
const TARGET_PRESETS: { key: string; label: string; addDays: number }[] = [
  { key: "3w", label: "3 weeks", addDays: 21 },
  { key: "1m", label: "1 month", addDays: 30 },
  { key: "2m", label: "2 months", addDays: 61 },
  { key: "3m", label: "3 months", addDays: 91 },
];

function presetToDate(addDays: number): string {
  const d = new Date();
  d.setDate(d.getDate() + addDays);
  return getLocalDateString(d);
}

function formatTargetDateLabel(dateStr: string): string {
  const [year, month, day] = dateStr.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

type RouteParams = {
  BenchmarkEditor: {
    benchmarkId?: string;
  };
};

export default function BenchmarkEditorScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const route = useRoute<RouteProp<RouteParams, "BenchmarkEditor">>();
  const { theme, isDark } = useTheme();
  const {
    persona,
    benchmarks,
    actions,
    addBenchmark,
    updateBenchmark,
    deleteBenchmark,
    deleteAction,
    canAddBenchmark,
  } = useApp();

  const benchmarkId = route.params?.benchmarkId;
  const isEditing = !!benchmarkId;

  const existingBenchmark = benchmarks.find((b) => b.id === benchmarkId);
  const benchmarkActions = actions.filter((a) => a.benchmarkId === benchmarkId);

  const personaBenchmarkIds = benchmarks
    .filter((b) => b.personaId === persona?.id)
    .map((b) => b.id);
  const personaActionsCount = actions.filter((a) =>
    personaBenchmarkIds.includes(a.benchmarkId),
  ).length;
  const canAddAction = personaActionsCount < MAX_ACTIONS_PER_PERSONA;

  React.useEffect(() => {
    if (
      isEditing &&
      existingBenchmark &&
      persona &&
      existingBenchmark.personaId !== persona.id
    ) {
      navigation.goBack();
    }
    if (isEditing && !existingBenchmark) {
      navigation.goBack();
    }
    if (!persona) {
      navigation.goBack();
    }
    if (!isEditing && !canAddBenchmark()) {
      navigation.navigate("Subscription");
    }
  }, [isEditing, existingBenchmark, persona, navigation, canAddBenchmark]);

  const [title, setTitle] = useState(existingBenchmark?.title || "");
  const [targetDate, setTargetDate] = useState<string | null>(
    existingBenchmark?.targetDate?.split("T")[0] || null,
  );
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async () => {
    if (!title.trim()) {
      if (Platform.OS === "web") {
        window.alert("Please enter a milestone title.");
      } else {
        Alert.alert("Missing Title", "Please enter a milestone title.");
      }
      return;
    }

    setIsSaving(true);

    try {
      if (isEditing && existingBenchmark) {
        await updateBenchmark(existingBenchmark.id, { title, targetDate });
      } else {
        const newBenchmark = await addBenchmark({
          personaId: persona?.id || "",
          title,
          targetDate,
          status: "active",
        });
        navigation.replace("BenchmarkEditor", { benchmarkId: newBenchmark.id });
        return;
      }

      if (Platform.OS !== "web") {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }

      navigation.goBack();
    } catch (error) {
      logger.error("Failed to save benchmark:", error);
      if (Platform.OS === "web") {
        window.alert("Failed to save the milestone. Please try again.");
      } else {
        Alert.alert("Error", "Failed to save the milestone. Please try again.");
      }
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = () => {
    if (!isEditing || !existingBenchmark) return;

    const doDelete = async () => {
      try {
        await deleteBenchmark(existingBenchmark.id);
        if (Platform.OS !== "web") {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        }
        navigation.goBack();
      } catch (error) {
        logger.error("Failed to delete benchmark:", error);
        if (Platform.OS === "web") {
          window.alert("Failed to delete the milestone. Please try again.");
        } else {
          Alert.alert(
            "Error",
            "Failed to delete the milestone. Please try again.",
          );
        }
      }
    };

    if (Platform.OS === "web") {
      if (
        window.confirm(
          `Delete "${existingBenchmark.title}"? This will also remove all associated actions and logs.`,
        )
      ) {
        doDelete();
      }
    } else {
      Alert.alert(
        "Delete Milestone",
        `Are you sure you want to delete "${existingBenchmark.title}"? This will also remove all associated actions and logs.`,
        [
          { text: "Cancel", style: "cancel" },
          { text: "Delete", style: "destructive", onPress: doDelete },
        ],
      );
    }
  };

  const handleAddAction = () => {
    if (!benchmarkId) {
      if (Platform.OS === "web") {
        window.alert("Please save the milestone first before adding actions.");
      } else {
        Alert.alert(
          "Save First",
          "Please save the milestone first before adding actions.",
        );
      }
      return;
    }
    if (!canAddAction) {
      if (Platform.OS === "web") {
        window.alert(
          `You can have a maximum of ${MAX_ACTIONS_PER_PERSONA} actions per persona.`,
        );
      } else {
        Alert.alert(
          "Action Limit Reached",
          `You can have a maximum of ${MAX_ACTIONS_PER_PERSONA} actions per persona.`,
        );
      }
      return;
    }
    navigation.navigate("ActionEditor", { benchmarkId });
  };

  const handleEditAction = (actionId: string) => {
    navigation.navigate("ActionEditor", { benchmarkId, actionId });
  };

  const handleDeleteAction = (action: (typeof actions)[0]) => {
    if (!canDeleteAction) {
      if (Platform.OS === "web") {
        window.alert(
          `You must have at least ${MIN_ACTIONS_PER_PERSONA} actions per persona.`,
        );
      } else {
        Alert.alert(
          "Cannot Delete",
          `You must have at least ${MIN_ACTIONS_PER_PERSONA} actions per persona.`,
        );
      }
      return;
    }

    const doDelete = async () => {
      try {
        await deleteAction(action.id);
        if (Platform.OS !== "web") {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        }
      } catch (error) {
        logger.error("Failed to delete action:", error);
        if (Platform.OS === "web") {
          window.alert("Failed to delete the action. Please try again.");
        } else {
          Alert.alert(
            "Error",
            "Failed to delete the action. Please try again.",
          );
        }
      }
    };

    if (Platform.OS === "web") {
      if (
        window.confirm(
          `Delete "${action.title}"? This will also remove all logs for this action.`,
        )
      ) {
        doDelete();
      }
    } else {
      Alert.alert(
        "Delete Action",
        `Are you sure you want to delete "${action.title}"? This will also remove all logs for this action.`,
        [
          { text: "Cancel", style: "cancel" },
          { text: "Delete", style: "destructive", onPress: doDelete },
        ],
      );
    }
  };

  const canDeleteAction = personaActionsCount > MIN_ACTIONS_PER_PERSONA;

  return (
    <View style={[styles.container, { backgroundColor: theme.backgroundRoot }]}>
      <View style={[styles.header, { paddingTop: insets.top + Spacing.md }]}>
        <Pressable
          onPress={() => navigation.goBack()}
          hitSlop={4}
          accessibilityRole="button"
          accessibilityLabel="Close"
          style={({ pressed }) => [
            styles.headerButton,
            { opacity: pressed ? 0.6 : 1 },
          ]}
        >
          <Feather name="x" size={24} color={theme.text} />
        </Pressable>
        <ThemedText style={styles.headerTitle}>
          {isEditing ? "Edit Milestone" : "New Milestone"}
        </ThemedText>
        <Pressable
          onPress={handleSave}
          disabled={isSaving}
          hitSlop={4}
          accessibilityRole="button"
          accessibilityLabel="Save milestone"
          accessibilityState={{ disabled: isSaving }}
          style={({ pressed }) => [
            styles.headerButton,
            { opacity: pressed || isSaving ? 0.5 : 1 },
          ]}
        >
          <Feather name="check" size={24} color={Colors.dark.accent} />
        </Pressable>
      </View>

      <KeyboardAwareScrollViewCompat
        contentContainerStyle={[
          styles.content,
          { paddingBottom: insets.bottom + Spacing.xl },
        ]}
      >
        <View style={styles.section}>
          <ThemedText
            style={[styles.sectionLabel, { color: Colors.dark.accent }]}
          >
            Milestone Goal
          </ThemedText>
          <TextInput
            style={[
              styles.input,
              {
                backgroundColor: isDark
                  ? Colors.dark.backgroundDefault
                  : Colors.light.backgroundDefault,
                color: theme.text,
              },
            ]}
            value={title}
            onChangeText={setTitle}
            placeholder="e.g., Run a marathon, Write a book"
            placeholderTextColor={theme.textSecondary}
            maxLength={100}
          />
          <ThemedText style={[styles.hint, { color: theme.textSecondary }]}>
            A major milestone that defines your persona
          </ThemedText>
        </View>

        <View style={styles.section}>
          <ThemedText
            style={[styles.sectionLabel, { color: Colors.dark.accent }]}
          >
            Target Date (Optional)
          </ThemedText>
          <View style={styles.presetRow}>
            {TARGET_PRESETS.map((preset) => {
              const presetDate = presetToDate(preset.addDays);
              const selected = targetDate === presetDate;
              return (
                <Pressable
                  key={preset.key}
                  onPress={() => {
                    setTargetDate(selected ? null : presetDate);
                    if (Platform.OS !== "web") {
                      Haptics.selectionAsync();
                    }
                  }}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel={`Set target date ${preset.label} from now`}
                  accessibilityState={{ selected }}
                  style={({ pressed }) => [
                    styles.presetChip,
                    {
                      backgroundColor: selected
                        ? "rgba(0, 217, 255, 0.12)"
                        : isDark
                          ? Colors.dark.backgroundDefault
                          : Colors.light.backgroundDefault,
                      borderColor: selected
                        ? "rgba(0, 217, 255, 0.5)"
                        : "transparent",
                      opacity: pressed ? 0.7 : 1,
                    },
                  ]}
                >
                  <ThemedText
                    style={[
                      styles.presetChipText,
                      {
                        color: selected ? Colors.dark.accent : theme.text,
                      },
                    ]}
                  >
                    {preset.label}
                  </ThemedText>
                </Pressable>
              );
            })}
          </View>
          {targetDate ? (
            <View style={styles.targetSummaryRow}>
              <ThemedText style={[styles.hint, { color: theme.textSecondary }]}>
                Target: {formatTargetDateLabel(targetDate)}
                {(() => {
                  const countdown = formatTargetCountdown(targetDate);
                  return countdown ? ` · ${countdown}` : "";
                })()}
              </ThemedText>
              <Pressable
                onPress={() => setTargetDate(null)}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel="Clear target date"
              >
                <ThemedText
                  style={[
                    styles.clearTargetText,
                    { color: theme.textSecondary },
                  ]}
                >
                  Clear
                </ThemedText>
              </Pressable>
            </View>
          ) : (
            <ThemedText style={[styles.hint, { color: theme.textSecondary }]}>
              A gentle aim, not a deadline — progress never resets
            </ThemedText>
          )}
        </View>

        {isEditing ? (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <ThemedText
                style={[styles.sectionLabel, { color: Colors.dark.accent }]}
              >
                Actions ({personaActionsCount}/{MAX_ACTIONS_PER_PERSONA})
              </ThemedText>
              <Pressable
                onPress={handleAddAction}
                disabled={!canAddAction}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel={
                  canAddAction
                    ? "Add a new action"
                    : "Action limit reached for this persona"
                }
                accessibilityState={{ disabled: !canAddAction }}
                style={({ pressed }) => [
                  styles.addButton,
                  { opacity: pressed || !canAddAction ? 0.5 : 1 },
                ]}
              >
                <Feather
                  name="plus"
                  size={18}
                  color={
                    canAddAction ? Colors.dark.accent : theme.textSecondary
                  }
                />
                <ThemedText
                  style={[
                    styles.addButtonText,
                    {
                      color: canAddAction
                        ? Colors.dark.accent
                        : theme.textSecondary,
                    },
                  ]}
                >
                  {canAddAction ? "Add" : "Max"}
                </ThemedText>
              </Pressable>
            </View>

            {benchmarkActions.length > 0 ? (
              <View style={styles.actionsList}>
                {benchmarkActions.map((action) => (
                  <View
                    key={action.id}
                    style={[
                      styles.actionItem,
                      {
                        backgroundColor: isDark
                          ? Colors.dark.backgroundDefault
                          : Colors.light.backgroundDefault,
                      },
                    ]}
                  >
                    <View style={styles.actionContent}>
                      <ThemedText style={styles.actionTitle}>
                        {action.title}
                      </ThemedText>
                      <ThemedText
                        style={[
                          styles.actionFrequency,
                          { color: theme.textSecondary },
                        ]}
                      >
                        {formatScheduleDays(action.frequency)}
                      </ThemedText>
                    </View>
                    <View style={styles.actionButtons}>
                      <Pressable
                        onPress={() => handleEditAction(action.id)}
                        hitSlop={8}
                        accessibilityRole="button"
                        accessibilityLabel={`Edit action ${action.title}`}
                        style={({ pressed }) => [
                          styles.editActionButton,
                          { opacity: pressed ? 0.7 : 1 },
                        ]}
                      >
                        <Feather
                          name="edit-2"
                          size={14}
                          color={Colors.dark.accent}
                        />
                        <ThemedText style={styles.editActionButtonText}>
                          Edit
                        </ThemedText>
                      </Pressable>
                      <Pressable
                        onPress={() => handleDeleteAction(action)}
                        disabled={!canDeleteAction}
                        hitSlop={4}
                        accessibilityRole="button"
                        accessibilityLabel={`Delete action ${action.title}`}
                        accessibilityState={{ disabled: !canDeleteAction }}
                        style={({ pressed }) => [
                          styles.actionButton,
                          { opacity: pressed || !canDeleteAction ? 0.4 : 1 },
                        ]}
                      >
                        <Feather
                          name="trash-2"
                          size={18}
                          color={
                            canDeleteAction
                              ? Colors.dark.error
                              : theme.textSecondary
                          }
                        />
                      </Pressable>
                    </View>
                  </View>
                ))}
                {!canDeleteAction ? (
                  <ThemedText
                    style={[
                      styles.minActionsHint,
                      { color: theme.textSecondary },
                    ]}
                  >
                    Minimum {MIN_ACTIONS_PER_PERSONA} actions required
                  </ThemedText>
                ) : null}
              </View>
            ) : (
              <View
                style={[
                  styles.emptyActions,
                  {
                    backgroundColor: isDark
                      ? Colors.dark.backgroundDefault
                      : Colors.light.backgroundDefault,
                  },
                ]}
              >
                <Feather name="zap" size={24} color={theme.textSecondary} />
                <ThemedText
                  style={[styles.emptyText, { color: theme.textSecondary }]}
                >
                  No actions yet. Add your first action to start tracking.
                </ThemedText>
              </View>
            )}
          </View>
        ) : (
          <View
            style={[
              styles.infoBox,
              {
                backgroundColor: isDark
                  ? Colors.dark.backgroundDefault
                  : Colors.light.backgroundDefault,
              },
            ]}
          >
            <Feather name="info" size={20} color={Colors.dark.accent} />
            <ThemedText
              style={[styles.infoText, { color: theme.textSecondary }]}
            >
              Save this milestone first, then you can add multiple actions to
              track.
            </ThemedText>
          </View>
        )}

        {isEditing ? (
          <Pressable
            onPress={handleDelete}
            style={({ pressed }) => [
              styles.deleteButton,
              {
                backgroundColor: isDark
                  ? Colors.dark.backgroundDefault
                  : Colors.light.backgroundDefault,
                opacity: pressed ? 0.8 : 1,
              },
            ]}
          >
            <Feather name="trash-2" size={20} color={Colors.dark.error} />
            <ThemedText
              style={[styles.deleteButtonText, { color: Colors.dark.error }]}
            >
              Delete Milestone
            </ThemedText>
          </Pressable>
        ) : null}
      </KeyboardAwareScrollViewCompat>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.md,
  },
  headerButton: {
    padding: Spacing.sm,
  },
  headerTitle: {
    ...Typography.headline,
    flex: 1,
    textAlign: "center",
  },
  content: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.lg,
  },
  section: {
    marginBottom: Spacing.xl,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: Spacing.sm,
  },
  sectionLabel: {
    ...Typography.caption,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  input: {
    ...Typography.body,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    minHeight: 48,
  },
  hint: {
    ...Typography.caption,
    marginTop: Spacing.xs,
  },
  presetRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.sm,
  },
  presetChip: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
  },
  presetChipText: {
    ...Typography.small,
    fontWeight: "600",
  },
  targetSummaryRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: Spacing.xs,
  },
  clearTargetText: {
    ...Typography.caption,
    fontWeight: "600",
    textDecorationLine: "underline",
  },
  addButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
  },
  addButtonText: {
    ...Typography.small,
    fontWeight: "600",
  },
  actionsList: {
    gap: Spacing.sm,
  },
  actionItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
  },
  actionContent: {
    flex: 1,
  },
  actionTitle: {
    ...Typography.body,
    fontWeight: "500",
  },
  actionFrequency: {
    ...Typography.caption,
    marginTop: Spacing.xs,
  },
  actionButtons: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  actionButton: {
    padding: Spacing.sm,
  },
  editActionButton: {
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
  editActionButtonText: {
    ...Typography.small,
    color: Colors.dark.accent,
    fontWeight: "600",
  },
  minActionsHint: {
    ...Typography.caption,
    textAlign: "center",
    marginTop: Spacing.xs,
  },
  emptyActions: {
    alignItems: "center",
    padding: Spacing.xl,
    borderRadius: BorderRadius.md,
    gap: Spacing.sm,
  },
  emptyText: {
    ...Typography.small,
    textAlign: "center",
  },
  infoBox: {
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.lg,
    borderRadius: BorderRadius.md,
    gap: Spacing.md,
    marginBottom: Spacing.xl,
  },
  infoText: {
    ...Typography.small,
    flex: 1,
  },
  deleteButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    padding: Spacing.lg,
    borderRadius: BorderRadius.md,
    gap: Spacing.sm,
    marginTop: Spacing.xl,
  },
  deleteButtonText: {
    ...Typography.body,
    fontWeight: "500",
  },
});
