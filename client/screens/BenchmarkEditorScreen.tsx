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

const MIN_ACTIONS_PER_PERSONA = 3;
const MAX_ACTIONS_PER_PERSONA = 5;

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
  const { persona, benchmarks, actions, addBenchmark, updateBenchmark, deleteBenchmark, deleteAction, canAddBenchmark, subscription } = useApp();

  const benchmarkId = route.params?.benchmarkId;
  const isEditing = !!benchmarkId;

  const existingBenchmark = benchmarks.find((b) => b.id === benchmarkId);
  const benchmarkActions = actions.filter((a) => a.benchmarkId === benchmarkId);

  const personaBenchmarkIds = benchmarks
    .filter((b) => b.personaId === persona?.id)
    .map((b) => b.id);
  const personaActionsCount = actions.filter((a) =>
    personaBenchmarkIds.includes(a.benchmarkId)
  ).length;
  const canAddAction = personaActionsCount < MAX_ACTIONS_PER_PERSONA;

  React.useEffect(() => {
    if (isEditing && existingBenchmark && persona && existingBenchmark.personaId !== persona.id) {
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
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async () => {
    if (!title.trim()) {
      if (Platform.OS === "web") {
        window.alert("Please enter a benchmark title.");
      } else {
        Alert.alert("Missing Title", "Please enter a benchmark title.");
      }
      return;
    }

    setIsSaving(true);

    try {
      if (isEditing && existingBenchmark) {
        await updateBenchmark(existingBenchmark.id, { title });
      } else {
        const newBenchmark = await addBenchmark({
          personaId: persona?.id || "",
          title,
          targetDate: null,
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
      console.error("Failed to save benchmark:", error);
      if (Platform.OS === "web") {
        window.alert("Failed to save benchmark. Please try again.");
      } else {
        Alert.alert("Error", "Failed to save benchmark. Please try again.");
      }
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = () => {
    if (!isEditing || !existingBenchmark) return;

    const doDelete = async () => {
      await deleteBenchmark(existingBenchmark.id);
      if (Platform.OS !== "web") {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      }
      navigation.goBack();
    };

    if (Platform.OS === "web") {
      if (window.confirm(`Delete "${existingBenchmark.title}"? This will also remove all associated actions and logs.`)) {
        doDelete();
      }
    } else {
      Alert.alert(
        "Delete Benchmark",
        `Are you sure you want to delete "${existingBenchmark.title}"? This will also remove all associated actions and logs.`,
        [
          { text: "Cancel", style: "cancel" },
          { text: "Delete", style: "destructive", onPress: doDelete },
        ]
      );
    }
  };

  const handleAddAction = () => {
    if (!benchmarkId) {
      if (Platform.OS === "web") {
        window.alert("Please save the benchmark first before adding actions.");
      } else {
        Alert.alert("Save First", "Please save the benchmark first before adding actions.");
      }
      return;
    }
    if (!canAddAction) {
      if (Platform.OS === "web") {
        window.alert(`You can have a maximum of ${MAX_ACTIONS_PER_PERSONA} actions per persona.`);
      } else {
        Alert.alert("Action Limit Reached", `You can have a maximum of ${MAX_ACTIONS_PER_PERSONA} actions per persona.`);
      }
      return;
    }
    navigation.navigate("ActionEditor", { benchmarkId });
  };

  const handleEditAction = (actionId: string) => {
    navigation.navigate("ActionEditor", { benchmarkId, actionId });
  };

  const handleDeleteAction = (action: typeof actions[0]) => {
    if (!canDeleteAction) {
      if (Platform.OS === "web") {
        window.alert(`You must have at least ${MIN_ACTIONS_PER_PERSONA} actions per persona.`);
      } else {
        Alert.alert("Cannot Delete", `You must have at least ${MIN_ACTIONS_PER_PERSONA} actions per persona.`);
      }
      return;
    }

    const doDelete = async () => {
      await deleteAction(action.id);
      if (Platform.OS !== "web") {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      }
    };

    if (Platform.OS === "web") {
      if (window.confirm(`Delete "${action.title}"? This will also remove all logs for this action.`)) {
        doDelete();
      }
    } else {
      Alert.alert(
        "Delete Action",
        `Are you sure you want to delete "${action.title}"? This will also remove all logs for this action.`,
        [
          { text: "Cancel", style: "cancel" },
          { text: "Delete", style: "destructive", onPress: doDelete },
        ]
      );
    }
  };

  const canDeleteAction = personaActionsCount > MIN_ACTIONS_PER_PERSONA;

  return (
    <View style={[styles.container, { backgroundColor: theme.backgroundRoot }]}>
      <View style={[styles.header, { paddingTop: insets.top + Spacing.md }]}>
        <Pressable onPress={() => navigation.goBack()} style={styles.headerButton}>
          <Feather name="x" size={24} color={theme.text} />
        </Pressable>
        <ThemedText style={styles.headerTitle}>
          {isEditing ? "Edit Benchmark" : "New Benchmark"}
        </ThemedText>
        <Pressable
          onPress={handleSave}
          disabled={isSaving}
          style={({ pressed }) => [styles.headerButton, { opacity: pressed || isSaving ? 0.5 : 1 }]}
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
          <ThemedText style={[styles.sectionLabel, { color: Colors.dark.accent }]}>
            Benchmark Goal
          </ThemedText>
          <TextInput
            style={[
              styles.input,
              {
                backgroundColor: isDark ? Colors.dark.backgroundDefault : Colors.light.backgroundDefault,
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

        {isEditing ? (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <ThemedText style={[styles.sectionLabel, { color: Colors.dark.accent }]}>
                Actions ({personaActionsCount}/{MAX_ACTIONS_PER_PERSONA})
              </ThemedText>
              <Pressable
                onPress={handleAddAction}
                disabled={!canAddAction}
                style={({ pressed }) => [styles.addButton, { opacity: pressed || !canAddAction ? 0.5 : 1 }]}
              >
                <Feather name="plus" size={18} color={canAddAction ? Colors.dark.accent : theme.textSecondary} />
                <ThemedText style={[styles.addButtonText, { color: canAddAction ? Colors.dark.accent : theme.textSecondary }]}>
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
                        backgroundColor: isDark ? Colors.dark.backgroundDefault : Colors.light.backgroundDefault,
                      },
                    ]}
                  >
                    <View style={styles.actionContent}>
                      <ThemedText style={styles.actionTitle}>{action.title}</ThemedText>
                      <ThemedText style={[styles.actionFrequency, { color: theme.textSecondary }]}>
                        {action.frequency.map((d) => d.slice(0, 3)).join(", ")}
                      </ThemedText>
                    </View>
                    <View style={styles.actionButtons}>
                      <Pressable
                        onPress={() => handleEditAction(action.id)}
                        style={({ pressed }) => [
                          styles.editActionButton,
                          { 
                            opacity: pressed ? 0.7 : 1,
                            backgroundColor: "rgba(0, 217, 255, 0.15)",
                          },
                        ]}
                      >
                        <Feather name="edit-2" size={14} color={Colors.dark.accent} />
                        <ThemedText style={styles.editActionButtonText}>Edit</ThemedText>
                      </Pressable>
                      <Pressable
                        onPress={() => handleDeleteAction(action)}
                        disabled={!canDeleteAction}
                        style={({ pressed }) => [
                          styles.actionButton,
                          { opacity: pressed || !canDeleteAction ? 0.4 : 1 },
                        ]}
                      >
                        <Feather
                          name="trash-2"
                          size={18}
                          color={canDeleteAction ? Colors.dark.error : theme.textSecondary}
                        />
                      </Pressable>
                    </View>
                  </View>
                ))}
                {!canDeleteAction ? (
                  <ThemedText style={[styles.minActionsHint, { color: theme.textSecondary }]}>
                    Minimum {MIN_ACTIONS_PER_PERSONA} actions required
                  </ThemedText>
                ) : null}
              </View>
            ) : (
              <View style={[styles.emptyActions, { backgroundColor: isDark ? Colors.dark.backgroundDefault : Colors.light.backgroundDefault }]}>
                <Feather name="zap" size={24} color={theme.textSecondary} />
                <ThemedText style={[styles.emptyText, { color: theme.textSecondary }]}>
                  No actions yet. Add your first action to start tracking.
                </ThemedText>
              </View>
            )}
          </View>
        ) : (
          <View style={[styles.infoBox, { backgroundColor: isDark ? Colors.dark.backgroundDefault : Colors.light.backgroundDefault }]}>
            <Feather name="info" size={20} color={Colors.dark.accent} />
            <ThemedText style={[styles.infoText, { color: theme.textSecondary }]}>
              Save this benchmark first, then you can add multiple actions to track.
            </ThemedText>
          </View>
        )}

        {isEditing ? (
          <Pressable
            onPress={handleDelete}
            style={({ pressed }) => [
              styles.deleteButton,
              {
                backgroundColor: isDark ? Colors.dark.backgroundDefault : Colors.light.backgroundDefault,
                opacity: pressed ? 0.8 : 1,
              },
            ]}
          >
            <Feather name="trash-2" size={20} color={Colors.dark.error} />
            <ThemedText style={[styles.deleteButtonText, { color: Colors.dark.error }]}>
              Delete Benchmark
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
    gap: 4,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.sm,
  },
  editActionButtonText: {
    ...Typography.caption,
    color: Colors.dark.accent,
    fontWeight: "500",
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
