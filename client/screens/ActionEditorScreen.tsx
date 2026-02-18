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

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const MIN_ACTIONS_PER_PERSONA = 3;
const MAX_ACTIONS_PER_PERSONA = 5;

type RouteParams = {
  ActionEditor: {
    benchmarkId: string;
    actionId?: string;
  };
};

export default function ActionEditorScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const route = useRoute<RouteProp<RouteParams, "ActionEditor">>();
  const { theme, isDark } = useTheme();
  const { persona, benchmarks, actions, addAction, updateAction, deleteAction } = useApp();

  const { benchmarkId, actionId } = route.params;
  const isEditing = !!actionId;
  const existingAction = actions.find((a) => a.id === actionId);
  const benchmark = benchmarks.find((b) => b.id === benchmarkId);

  const personaBenchmarkIds = benchmarks
    .filter((b) => b.personaId === persona?.id)
    .map((b) => b.id);
  const personaActionsCount = actions.filter((a) =>
    personaBenchmarkIds.includes(a.benchmarkId)
  ).length;
  const canAddAction = personaActionsCount < MAX_ACTIONS_PER_PERSONA;
  const canDeleteAction = personaActionsCount > MIN_ACTIONS_PER_PERSONA;

  React.useEffect(() => {
    if (!persona) {
      navigation.goBack();
      return;
    }
    if (benchmark && benchmark.personaId !== persona.id) {
      navigation.goBack();
      return;
    }
    if (!benchmark) {
      navigation.goBack();
      return;
    }
    if (isEditing && !existingAction) {
      navigation.goBack();
      return;
    }
    if (!isEditing && !canAddAction) {
      if (Platform.OS === "web") {
        window.alert(`You can have a maximum of ${MAX_ACTIONS_PER_PERSONA} actions per persona.`);
      } else {
        Alert.alert("Action Limit Reached", `You can have a maximum of ${MAX_ACTIONS_PER_PERSONA} actions per persona.`);
      }
      navigation.goBack();
      return;
    }
  }, [persona, benchmark, isEditing, existingAction, navigation, canAddAction]);

  const [actionTitle, setActionTitle] = useState(existingAction?.title || "");
  const [kickstartVersion, setKickstartVersion] = useState(existingAction?.kickstartVersion || "");
  const [anchorLink, setAnchorLink] = useState(existingAction?.anchorLink || "");
  const [frequency, setFrequency] = useState<string[]>(existingAction?.frequency || ["Monday", "Wednesday", "Friday"]);
  const [isSaving, setIsSaving] = useState(false);

  const toggleDay = (day: string) => {
    if (frequency.includes(day)) {
      setFrequency(frequency.filter((d) => d !== day));
    } else {
      setFrequency([...frequency, day]);
    }
  };

  const handleSave = async () => {
    if (!actionTitle.trim()) {
      if (Platform.OS === "web") {
        window.alert("Please enter an action title.");
      } else {
        Alert.alert("Missing Title", "Please enter an action title.");
      }
      return;
    }
    if (frequency.length === 0) {
      if (Platform.OS === "web") {
        window.alert("Please select at least one day.");
      } else {
        Alert.alert("Missing Frequency", "Please select at least one day.");
      }
      return;
    }

    setIsSaving(true);

    try {
      if (isEditing && existingAction) {
        await updateAction(existingAction.id, {
          title: actionTitle,
          frequency,
          kickstartVersion: kickstartVersion || `Do ${actionTitle.toLowerCase()} for 2 minutes`,
          anchorLink: anchorLink || "After I wake up",
        });
      } else {
        await addAction({
          benchmarkId,
          title: actionTitle,
          frequency,
          kickstartVersion: kickstartVersion || `Do ${actionTitle.toLowerCase()} for 2 minutes`,
          anchorLink: anchorLink || "After I wake up",
        });
      }

      if (Platform.OS !== "web") {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }

      navigation.goBack();
    } catch (error) {
      console.error("Failed to save action:", error);
      if (Platform.OS === "web") {
        window.alert("Failed to save action. Please try again.");
      } else {
        Alert.alert("Error", "Failed to save action. Please try again.");
      }
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = () => {
    if (!isEditing || !existingAction) return;

    if (!canDeleteAction) {
      if (Platform.OS === "web") {
        window.alert(`You must have at least ${MIN_ACTIONS_PER_PERSONA} actions per persona.`);
      } else {
        Alert.alert("Cannot Delete", `You must have at least ${MIN_ACTIONS_PER_PERSONA} actions per persona.`);
      }
      return;
    }

    const doDelete = async () => {
      await deleteAction(existingAction.id);
      if (Platform.OS !== "web") {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      }
      navigation.goBack();
    };

    if (Platform.OS === "web") {
      if (window.confirm(`Delete "${existingAction.title}"? This will also remove all logs for this action.`)) {
        doDelete();
      }
    } else {
      Alert.alert(
        "Delete Action",
        `Are you sure you want to delete "${existingAction.title}"? This will also remove all logs for this action.`,
        [
          { text: "Cancel", style: "cancel" },
          { text: "Delete", style: "destructive", onPress: doDelete },
        ]
      );
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.backgroundRoot }]}>
      <View style={[styles.header, { paddingTop: insets.top + Spacing.md }]}>
        <Pressable onPress={() => navigation.goBack()} style={styles.headerButton}>
          <Feather name="x" size={24} color={theme.text} />
        </Pressable>
        <ThemedText style={styles.headerTitle}>
          {isEditing ? "Edit Action" : "New Action"}
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
            Action Title
          </ThemedText>
          <TextInput
            style={[
              styles.input,
              {
                backgroundColor: isDark ? Colors.dark.backgroundDefault : Colors.light.backgroundDefault,
                color: theme.text,
              },
            ]}
            value={actionTitle}
            onChangeText={setActionTitle}
            placeholder="e.g., Run for 30 minutes, Write 500 words"
            placeholderTextColor={theme.textSecondary}
            maxLength={100}
          />
          <ThemedText style={[styles.hint, { color: theme.textSecondary }]}>
            A repeatable behavior that builds toward your goal
          </ThemedText>
        </View>

        <View style={styles.section}>
          <ThemedText style={[styles.sectionLabel, { color: Colors.dark.accent }]}>
            Frequency
          </ThemedText>
          <View style={styles.daysContainer}>
            {DAYS.map((day) => (
              <Pressable
                key={day}
                onPress={() => toggleDay(day)}
                style={[
                  styles.dayButton,
                  {
                    backgroundColor: frequency.includes(day)
                      ? Colors.dark.accent
                      : isDark
                        ? Colors.dark.backgroundDefault
                        : Colors.light.backgroundDefault,
                  },
                ]}
              >
                <ThemedText
                  style={[
                    styles.dayText,
                    { color: frequency.includes(day) ? "#000000" : theme.text },
                  ]}
                >
                  {day.slice(0, 3)}
                </ThemedText>
              </Pressable>
            ))}
          </View>
        </View>

        <View style={styles.section}>
          <ThemedText style={[styles.sectionLabel, { color: Colors.dark.accent }]}>
            120-Second Kickstart
          </ThemedText>
          <TextInput
            style={[
              styles.input,
              {
                backgroundColor: isDark ? Colors.dark.backgroundDefault : Colors.light.backgroundDefault,
                color: theme.text,
              },
            ]}
            value={kickstartVersion}
            onChangeText={setKickstartVersion}
            placeholder="e.g., Put on running shoes and jog for 2 min"
            placeholderTextColor={theme.textSecondary}
            maxLength={150}
          />
          <ThemedText style={[styles.hint, { color: theme.textSecondary }]}>
            A tiny version to reduce friction on hard days
          </ThemedText>
        </View>

        <View style={styles.section}>
          <ThemedText style={[styles.sectionLabel, { color: Colors.dark.accent }]}>
            Anchor Link
          </ThemedText>
          <TextInput
            style={[
              styles.input,
              {
                backgroundColor: isDark ? Colors.dark.backgroundDefault : Colors.light.backgroundDefault,
                color: theme.text,
              },
            ]}
            value={anchorLink}
            onChangeText={setAnchorLink}
            placeholder="e.g., After I pour my morning coffee"
            placeholderTextColor={theme.textSecondary}
            maxLength={100}
          />
          <ThemedText style={[styles.hint, { color: theme.textSecondary }]}>
            An existing habit to attach this action to
          </ThemedText>
        </View>

        {isEditing ? (
          <View>
            <Pressable
              onPress={handleDelete}
              disabled={!canDeleteAction}
              style={({ pressed }) => [
                styles.deleteButton,
                {
                  backgroundColor: isDark ? Colors.dark.backgroundDefault : Colors.light.backgroundDefault,
                  opacity: pressed || !canDeleteAction ? 0.5 : 1,
                },
              ]}
            >
              <Feather name="trash-2" size={20} color={canDeleteAction ? Colors.dark.error : theme.textSecondary} />
              <ThemedText style={[styles.deleteButtonText, { color: canDeleteAction ? Colors.dark.error : theme.textSecondary }]}>
                Delete Action
              </ThemedText>
            </Pressable>
            {!canDeleteAction ? (
              <ThemedText style={[styles.hint, { color: theme.textSecondary, textAlign: 'center', marginTop: Spacing.sm }]}>
                Minimum {MIN_ACTIONS_PER_PERSONA} actions required per persona
              </ThemedText>
            ) : null}
          </View>
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
  sectionLabel: {
    ...Typography.caption,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: Spacing.sm,
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
  daysContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.sm,
  },
  dayButton: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.sm,
    minWidth: 48,
    alignItems: "center",
  },
  dayText: {
    ...Typography.small,
    fontWeight: "600",
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
