import React, { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";

import { ThemedText } from "@/components/ThemedText";
import { useTheme } from "@/hooks/useTheme";
import { BorderRadius, Colors, Spacing, Typography } from "@/constants/theme";
import {
  DAILY_CONTEXT_FACTORS,
  DAILY_CONTEXT_FACTOR_LABELS,
  formatDailyContextSummary,
  type DailyContextEntry,
  type DailyContextFactor,
  type DailyContextInput,
} from "@/lib/daily-context";

interface DailyContextCardProps {
  logDate: string;
  entry?: DailyContextEntry;
  editable?: boolean;
  title?: string;
  onSave: (input: DailyContextInput) => Promise<unknown>;
  onDelete?: () => Promise<void>;
}

export function DailyContextCard({
  logDate,
  entry,
  editable = true,
  title = "What shaped today?",
  onSave,
  onDelete,
}: DailyContextCardProps) {
  const { theme, isDark } = useTheme();
  const [expanded, setExpanded] = useState(false);
  const [helped, setHelped] = useState<DailyContextFactor[]>(
    entry?.helped ?? [],
  );
  const [hindered, setHindered] = useState<DailyContextFactor[]>(
    entry?.hindered ?? [],
  );
  const [note, setNote] = useState(entry?.note ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setExpanded(false);
    setHelped(entry?.helped ?? []);
    setHindered(entry?.hindered ?? []);
    setNote(entry?.note ?? "");
    setError(null);
  }, [entry, logDate]);

  const hasContent =
    helped.length > 0 || hindered.length > 0 || note.trim().length > 0;
  const summary = useMemo(
    () => (entry ? formatDailyContextSummary(entry) : null),
    [entry],
  );
  const backgroundColor = isDark
    ? Colors.dark.backgroundDefault
    : Colors.light.backgroundDefault;

  const toggleFactor = (
    factor: DailyContextFactor,
    side: "helped" | "hindered",
  ) => {
    Haptics.selectionAsync();
    setError(null);
    if (side === "helped") {
      setHelped((current) =>
        current.includes(factor)
          ? current.filter((item) => item !== factor)
          : [...current, factor],
      );
      setHindered((current) => current.filter((item) => item !== factor));
    } else {
      setHindered((current) =>
        current.includes(factor)
          ? current.filter((item) => item !== factor)
          : [...current, factor],
      );
      setHelped((current) => current.filter((item) => item !== factor));
    }
  };

  const handleSave = async () => {
    if (!hasContent || saving) return;
    setSaving(true);
    setError(null);
    try {
      await onSave({ logDate, helped, hindered, note });
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setExpanded(false);
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Context could not be saved.",
      );
    } finally {
      setSaving(false);
    }
  };

  const clearEntry = async () => {
    if (!onDelete || saving) return;
    setSaving(true);
    setError(null);
    try {
      await onDelete();
      setHelped([]);
      setHindered([]);
      setNote("");
      setExpanded(false);
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {
      setError("Context could not be cleared.");
    } finally {
      setSaving(false);
    }
  };

  const confirmClear = () => {
    if (Platform.OS === "web") {
      if (window.confirm("Clear this day’s context?")) void clearEntry();
      return;
    }
    Alert.alert(
      "Clear this day’s context?",
      "The saved factors and note will be removed.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Clear",
          style: "destructive",
          onPress: () => void clearEntry(),
        },
      ],
    );
  };

  if (!expanded) {
    if (!editable && !entry) return null;
    return (
      <Pressable
        onPress={() => editable && setExpanded(true)}
        disabled={!editable}
        hitSlop={8}
        pressRetentionOffset={12}
        accessibilityRole={editable ? "button" : undefined}
        accessibilityLabel={
          entry
            ? `${title}. ${summary}. ${editable ? "Edit daily context" : ""}`
            : `${title}. Add daily context`
        }
        style={({ pressed }) => [
          styles.card,
          {
            backgroundColor,
            borderColor: entry ? "rgba(0, 217, 255, 0.35)" : theme.border,
            opacity: pressed && editable ? 0.75 : 1,
            transform: [{ scale: pressed && editable ? 0.99 : 1 }],
          },
        ]}
      >
        <View style={styles.collapsedIcon}>
          <Feather
            name={entry ? "bookmark" : "sliders"}
            size={18}
            color={theme.accent}
          />
        </View>
        <View style={styles.collapsedContent}>
          <ThemedText style={styles.title}>{title}</ThemedText>
          <ThemedText style={[styles.subtitle, { color: theme.textSecondary }]}>
            {summary ??
              "Optional factors and a private note for your future patterns"}
          </ThemedText>
        </View>
        {editable ? (
          <Feather name="chevron-right" size={18} color={theme.textSecondary} />
        ) : null}
      </Pressable>
    );
  }

  return (
    <View
      style={[
        styles.cardExpanded,
        { backgroundColor, borderColor: "rgba(0, 217, 255, 0.35)" },
      ]}
    >
      <View style={styles.header}>
        <View style={styles.collapsedIcon}>
          <Feather name="sliders" size={18} color={theme.accent} />
        </View>
        <View style={styles.headerContent}>
          <ThemedText style={styles.title}>{title}</ThemedText>
          <ThemedText style={[styles.subtitle, { color: theme.textSecondary }]}>
            Saved locally · only aggregate factors can be shared in a Tune-Up
          </ThemedText>
        </View>
        <Pressable
          onPress={() => setExpanded(false)}
          hitSlop={12}
          pressRetentionOffset={16}
          accessibilityRole="button"
          accessibilityLabel="Close daily context"
          style={({ pressed }) => [
            styles.closeButton,
            { opacity: pressed ? 0.5 : 1 },
          ]}
        >
          <Feather name="x" size={18} color={theme.textSecondary} />
        </Pressable>
      </View>

      <FactorGroup
        label="Helped"
        selected={helped}
        onToggle={(factor) => toggleFactor(factor, "helped")}
        selectedColor={theme.success}
      />
      <FactorGroup
        label="Got in the way"
        selected={hindered}
        onToggle={(factor) => toggleFactor(factor, "hindered")}
        selectedColor={theme.warning}
      />

      <TextInput
        value={note}
        onChangeText={(value) => {
          setNote(value.slice(0, 200));
          setError(null);
        }}
        maxLength={200}
        multiline
        accessibilityLabel="Optional private note about what shaped this day"
        placeholder="Optional note for future you"
        placeholderTextColor={theme.textSecondary}
        style={[
          styles.noteInput,
          {
            color: theme.text,
            borderColor: theme.border,
            backgroundColor: theme.backgroundRoot,
          },
        ]}
      />
      <ThemedText style={[styles.counter, { color: theme.textSecondary }]}>
        {note.length}/200
      </ThemedText>
      {error ? (
        <ThemedText
          style={[styles.error, { color: theme.error }]}
          accessibilityRole="alert"
        >
          {error}
        </ThemedText>
      ) : null}

      <View style={styles.actions}>
        {entry && onDelete ? (
          <Pressable
            onPress={confirmClear}
            disabled={saving}
            accessibilityRole="button"
            accessibilityLabel="Clear saved daily context"
            style={({ pressed }) => [
              styles.clearButton,
              { opacity: pressed || saving ? 0.55 : 1 },
            ]}
          >
            <ThemedText style={[styles.clearText, { color: theme.error }]}>
              Clear
            </ThemedText>
          </Pressable>
        ) : (
          <View style={styles.actionSpacer} />
        )}
        <Pressable
          onPress={handleSave}
          disabled={!hasContent || saving}
          accessibilityRole="button"
          accessibilityLabel={
            entry ? "Save daily context changes" : "Save daily context"
          }
          accessibilityState={{ disabled: !hasContent || saving }}
          style={({ pressed }) => [
            styles.saveButton,
            {
              backgroundColor: theme.accent,
              opacity: pressed || !hasContent || saving ? 0.55 : 1,
              transform: [{ scale: pressed ? 0.98 : 1 }],
            },
          ]}
        >
          <ThemedText style={[styles.saveText, { color: theme.buttonText }]}>
            {saving ? "Saving…" : "Save context"}
          </ThemedText>
        </Pressable>
      </View>
    </View>
  );
}

function FactorGroup({
  label,
  selected,
  onToggle,
  selectedColor,
}: {
  label: string;
  selected: DailyContextFactor[];
  onToggle: (factor: DailyContextFactor) => void;
  selectedColor: string;
}) {
  const { theme } = useTheme();
  return (
    <View style={styles.factorGroup}>
      <ThemedText
        style={[styles.factorHeading, { color: theme.textSecondary }]}
      >
        {label}
      </ThemedText>
      <View style={styles.factorRow}>
        {DAILY_CONTEXT_FACTORS.map((factor) => {
          const isSelected = selected.includes(factor);
          const factorLabel = DAILY_CONTEXT_FACTOR_LABELS[factor];
          return (
            <Pressable
              key={factor}
              onPress={() => onToggle(factor)}
              hitSlop={4}
              pressRetentionOffset={10}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: isSelected }}
              accessibilityLabel={`${factorLabel} ${label.toLowerCase()}`}
              style={({ pressed }) => [
                styles.factorChip,
                {
                  borderColor: isSelected ? selectedColor : theme.border,
                  backgroundColor: isSelected
                    ? `${selectedColor}22`
                    : "transparent",
                  opacity: pressed ? 0.65 : 1,
                  transform: [{ scale: pressed ? 0.97 : 1 }],
                },
              ]}
            >
              <ThemedText
                style={[
                  styles.factorText,
                  { color: isSelected ? selectedColor : theme.textSecondary },
                ]}
              >
                {factorLabel}
              </ThemedText>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    padding: Spacing.lg,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    marginTop: Spacing.lg,
  },
  cardExpanded: {
    padding: Spacing.lg,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    marginTop: Spacing.lg,
  },
  collapsedIcon: {
    width: 36,
    height: 36,
    borderRadius: BorderRadius.full,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0, 217, 255, 0.1)",
  },
  collapsedContent: {
    flex: 1,
  },
  title: {
    ...Typography.body,
    fontWeight: "600",
  },
  subtitle: {
    ...Typography.caption,
    marginTop: 3,
    lineHeight: 17,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    marginBottom: Spacing.lg,
  },
  headerContent: {
    flex: 1,
  },
  closeButton: {
    padding: Spacing.xs,
  },
  factorGroup: {
    marginBottom: Spacing.md,
  },
  factorHeading: {
    ...Typography.caption,
    fontWeight: "600",
    marginBottom: Spacing.sm,
  },
  factorRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.sm,
  },
  factorChip: {
    minHeight: 38,
    justifyContent: "center",
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
  },
  factorText: {
    ...Typography.small,
    fontWeight: "600",
  },
  noteInput: {
    minHeight: 76,
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    ...Typography.body,
    textAlignVertical: "top",
  },
  counter: {
    ...Typography.caption,
    textAlign: "right",
    marginTop: Spacing.xs,
  },
  error: {
    ...Typography.small,
    marginTop: Spacing.sm,
  },
  actions: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    marginTop: Spacing.md,
  },
  actionSpacer: {
    flex: 1,
  },
  clearButton: {
    flex: 1,
    paddingVertical: Spacing.md,
    alignItems: "center",
  },
  clearText: {
    ...Typography.small,
    fontWeight: "600",
  },
  saveButton: {
    flex: 2,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.lg,
  },
  saveText: {
    ...Typography.small,
    fontWeight: "700",
  },
});
