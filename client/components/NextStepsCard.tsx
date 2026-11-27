import React, { useEffect, useRef } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { ThemedText } from "@/components/ThemedText";
import { useTheme } from "@/hooks/useTheme";
import { BorderRadius, Spacing } from "@/constants/theme";
import { withAlpha } from "@/lib/color";
import { scheduleLabel } from "@/lib/copy";
import type { NextStep } from "@/lib/next-steps";

export const NEXT_STEPS_TITLE = "Next steps";
export const NEXT_STEPS_INTRO =
  "More steps toward your resolution. Add one when you are ready.";
export const NEXT_STEP_ADD = "Add to my plan";
export const NEXT_STEP_DISMISS = "Not for me";

/**
 * The steps the person did not start with. Rendered only when there are
 * some, so a plan without next steps looks exactly as it did before.
 */
export function NextStepsCard({
  steps,
  onAdd,
  onDismiss,
  busyStepId,
  notice,
}: {
  steps: NextStep[];
  onAdd: (stepId: string) => void;
  onDismiss: (stepId: string) => void;
  /** The step being saved; its buttons wait. */
  busyStepId?: string | null;
  /** Why a step could not be added, shown under that step. */
  notice?: { stepId: string; message: string } | null;
}) {
  const { theme, isDark } = useTheme();
  // The busy prop arrives a render late; this stops a second tap before it.
  // Released when the parent's add settles (busyStepId clears).
  const addLock = useRef<string | null>(null);
  useEffect(() => {
    if (!busyStepId) addLock.current = null;
  }, [busyStepId, steps]);
  if (steps.length === 0) return null;
  const busy = Boolean(busyStepId);
  const addOnce = (stepId: string) => {
    if (addLock.current) return;
    addLock.current = stepId;
    onAdd(stepId);
  };
  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: isDark
            ? theme.backgroundDefault
            : theme.backgroundSecondary,
          borderColor: withAlpha(theme.accent, 0.25),
        },
      ]}
    >
      <View style={styles.titleRow}>
        <Feather name="map" size={18} color={theme.accent} />
        <ThemedText style={styles.title} accessibilityRole="header">
          {NEXT_STEPS_TITLE}
        </ThemedText>
      </View>
      <ThemedText style={{ color: theme.textSecondary }}>
        {NEXT_STEPS_INTRO}
      </ThemedText>
      {steps.map((step, index) => (
        <View
          key={step.id}
          style={[
            styles.step,
            index > 0 && {
              borderTopWidth: StyleSheet.hairlineWidth,
              borderTopColor: theme.border,
            },
          ]}
        >
          <ThemedText style={styles.stepTitle}>{step.title}</ThemedText>
          {step.why ? <ThemedText>{step.why}</ThemedText> : null}
          <ThemedText style={{ color: theme.textSecondary }}>
            {scheduleLabel(step.frequency, "suggested")}
          </ThemedText>
          {notice?.stepId === step.id ? (
            <ThemedText
              accessibilityRole="alert"
              accessibilityLiveRegion="polite"
              style={{ color: theme.warning }}
            >
              {notice.message}
            </ThemedText>
          ) : null}
          <View style={styles.buttons}>
            <Pressable
              onPress={() => addOnce(step.id)}
              disabled={busy}
              accessibilityRole="button"
              accessibilityLabel={`${NEXT_STEP_ADD}: ${step.title}`}
              accessibilityState={{
                disabled: busy,
                busy: busyStepId === step.id,
              }}
              hitSlop={8}
              pressRetentionOffset={12}
              style={({ pressed }) => [
                styles.primary,
                {
                  borderColor: theme.accent,
                  opacity: busy ? 0.45 : pressed ? 0.7 : 1,
                },
              ]}
            >
              <ThemedText style={{ color: theme.accent, fontWeight: "700" }}>
                {NEXT_STEP_ADD}
              </ThemedText>
            </Pressable>
            <Pressable
              onPress={() => onDismiss(step.id)}
              disabled={busy}
              accessibilityRole="button"
              accessibilityLabel={`${NEXT_STEP_DISMISS}: ${step.title}`}
              accessibilityState={{ disabled: busy }}
              hitSlop={8}
              pressRetentionOffset={12}
              style={({ pressed }) => [
                styles.secondary,
                { opacity: busy ? 0.45 : pressed ? 0.6 : 1 },
              ]}
            >
              <ThemedText
                style={{ color: theme.textSecondary, fontWeight: "600" }}
              >
                {NEXT_STEP_DISMISS}
              </ThemedText>
            </Pressable>
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    gap: Spacing.sm,
    marginTop: Spacing.lg,
    marginBottom: Spacing.lg,
  },
  titleRow: { flexDirection: "row", alignItems: "center", gap: Spacing.sm },
  title: { fontSize: 18, fontWeight: "700" },
  step: { gap: Spacing.xs, paddingTop: Spacing.md },
  stepTitle: { fontSize: 16, fontWeight: "600" },
  buttons: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: Spacing.lg,
    marginTop: Spacing.xs,
  },
  primary: {
    minHeight: 44,
    borderWidth: 1,
    paddingHorizontal: Spacing.xl,
    borderRadius: BorderRadius.full,
    justifyContent: "center",
  },
  secondary: { minHeight: 44, justifyContent: "center" },
});
