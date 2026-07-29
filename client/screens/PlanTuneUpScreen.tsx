import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { useNavigation, useRoute } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";

import { AIConsentModal } from "@/components/AIConsentModal";
import { ThemedText } from "@/components/ThemedText";
import { useApp } from "@/context/AppContext";
import { useTheme } from "@/hooks/useTheme";
import {
  buildPlanTuneUpRequest,
  canRequestPlanTuneUp,
  requestPlanTuneUp,
} from "@/lib/plan-tune-up";
import { formatScheduleDays } from "@/lib/progress";
import { track } from "@/lib/telemetry";
import { BorderRadius, Colors, Spacing, Typography } from "@/constants/theme";
import type {
  EditablePlanSettings,
  PlanTuneUpResponse,
} from "@shared/plan-tune-up";

type Phase = "idle" | "loading" | "preview" | "applying" | "complete";

const CHANGE_LABELS: Record<keyof EditablePlanSettings, string> = {
  frequency: "Schedule",
  anchorLink: "Anchor",
  kickstartVersion: "Kickstart",
};

function formatValue(
  field: keyof EditablePlanSettings,
  value: string | string[],
): string {
  return field === "frequency"
    ? formatScheduleDays(value as string[])
    : String(value);
}

export default function PlanTuneUpScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const insets = useSafeAreaInsets();
  const { theme, isDark } = useTheme();
  const {
    actions,
    dailyLogs,
    dailyContexts,
    aiConsent,
    setAiConsent,
    applyPlanTuneUp,
  } = useApp();
  const requestedActionId = route.params?.actionId as string | undefined;
  const [selectedActionId, setSelectedActionId] = useState(
    requestedActionId &&
      actions.some((action) => action.id === requestedActionId)
      ? requestedActionId
      : (actions[0]?.id ?? ""),
  );
  const [phase, setPhase] = useState<Phase>("idle");
  const [proposal, setProposal] = useState<PlanTuneUpResponse | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showConsent, setShowConsent] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);

  useEffect(
    () => () => {
      mountedRef.current = false;
      abortRef.current?.abort();
    },
    [],
  );

  useEffect(() => {
    if (!selectedActionId && actions[0]) {
      setSelectedActionId(actions[0].id);
    } else if (
      selectedActionId &&
      !actions.some((action) => action.id === selectedActionId)
    ) {
      setSelectedActionId(actions[0]?.id ?? "");
      setProposal(null);
      setPhase("idle");
    }
  }, [actions, selectedActionId]);

  const action = actions.find((item) => item.id === selectedActionId);
  const request = useMemo(
    () =>
      action ? buildPlanTuneUpRequest(action, dailyLogs, dailyContexts) : null,
    [action, dailyContexts, dailyLogs],
  );
  const eligible = request ? canRequestPlanTuneUp(request) : false;
  const cardBackground = isDark
    ? Colors.dark.backgroundDefault
    : Colors.light.backgroundDefault;

  const runTuneUp = async () => {
    if (!request || phase === "loading" || phase === "applying") return;
    const controller = new AbortController();
    abortRef.current = controller;
    setProposal(null);
    setErrorMessage(null);
    setPhase("loading");
    track("plan_tune_up_requested");
    try {
      const next = await requestPlanTuneUp(request, controller.signal);
      if (!mountedRef.current || controller.signal.aborted) return;
      setProposal(next);
      setPhase("preview");
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch (error) {
      if (!mountedRef.current || controller.signal.aborted) return;
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Coach could not prepare a Plan Tune-Up. Your plan was not changed.",
      );
      setPhase("idle");
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
    }
  };

  const requestWithConsent = () => {
    if (!eligible) return;
    if (!aiConsent) {
      setShowConsent(true);
      return;
    }
    void runTuneUp();
  };

  const cancelRequest = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    setPhase("idle");
    setErrorMessage(null);
  };

  const discardProposal = () => {
    setProposal(null);
    setPhase("idle");
    setErrorMessage(null);
  };

  const confirmProposal = async () => {
    if (!action || !proposal || phase !== "preview") return;
    setPhase("applying");
    setErrorMessage(null);
    try {
      await applyPlanTuneUp(action.id, proposal);
      setPhase("complete");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "The change could not be saved. Your plan was not changed.",
      );
      setPhase("preview");
    }
  };

  const close = () => {
    abortRef.current?.abort();
    navigation.goBack();
  };

  const changedFields = proposal
    ? (Object.keys(proposal.changes) as (keyof EditablePlanSettings)[])
    : [];

  return (
    <>
      <ScrollView
        style={{ flex: 1, backgroundColor: theme.backgroundRoot }}
        contentContainerStyle={{
          paddingTop: insets.top + Spacing.lg,
          paddingBottom: insets.bottom + Spacing["3xl"],
          paddingHorizontal: Spacing.lg,
        }}
        decelerationRate="fast"
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.header}>
          <View style={styles.headerCopy}>
            <ThemedText style={styles.eyebrow}>Adaptive plan</ThemedText>
            <ThemedText accessibilityRole="header" style={styles.title}>
              Plan Tune-Up
            </ThemedText>
            <ThemedText
              style={[styles.subtitle, { color: theme.textSecondary }]}
            >
              Coach reviews a bounded 28-day summary, then you decide whether to
              apply a small bend.
            </ThemedText>
          </View>
          <Pressable
            onPress={close}
            hitSlop={12}
            pressRetentionOffset={16}
            accessibilityRole="button"
            accessibilityLabel="Close Plan Tune-Up"
            style={({ pressed }) => [
              styles.closeButton,
              {
                backgroundColor: cardBackground,
                opacity: pressed ? 0.6 : 1,
              },
            ]}
          >
            <Feather name="x" size={20} color={theme.text} />
          </Pressable>
        </View>

        {actions.length === 0 ? (
          <View style={[styles.card, { backgroundColor: cardBackground }]}>
            <Feather name="compass" size={28} color={theme.textSecondary} />
            <ThemedText style={styles.cardTitle}>
              No action to tune yet
            </ThemedText>
            <ThemedText style={[styles.body, { color: theme.textSecondary }]}>
              Create an elemental action first. Your current plan stays exactly
              as it is.
            </ThemedText>
          </View>
        ) : (
          <>
            <ThemedText style={styles.sectionTitle}>
              Choose an action
            </ThemedText>
            <View style={styles.actionList}>
              {actions.map((item) => {
                const selected = item.id === selectedActionId;
                return (
                  <Pressable
                    key={item.id}
                    disabled={phase === "loading" || phase === "applying"}
                    onPress={() => {
                      Haptics.selectionAsync();
                      setSelectedActionId(item.id);
                      setProposal(null);
                      setErrorMessage(null);
                      setPhase("idle");
                    }}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: selected }}
                    accessibilityLabel={`${item.title}, ${formatScheduleDays(item.frequency)}`}
                    style={({ pressed }) => [
                      styles.actionChoice,
                      {
                        backgroundColor: cardBackground,
                        borderColor: selected ? theme.accent : theme.border,
                        opacity: pressed ? 0.7 : 1,
                      },
                    ]}
                  >
                    <View style={styles.actionChoiceCopy}>
                      <ThemedText style={styles.actionTitle}>
                        {item.title}
                      </ThemedText>
                      <ThemedText
                        style={[
                          styles.actionMeta,
                          { color: theme.textSecondary },
                        ]}
                      >
                        {formatScheduleDays(item.frequency)}
                      </ThemedText>
                    </View>
                    <Feather
                      name={selected ? "check-circle" : "circle"}
                      size={20}
                      color={selected ? theme.accent : theme.textSecondary}
                    />
                  </Pressable>
                );
              })}
            </View>

            {request && action ? (
              <View style={[styles.card, { backgroundColor: cardBackground }]}>
                <View style={styles.cardHeading}>
                  <View style={styles.cardIcon}>
                    <Feather
                      name="bar-chart-2"
                      size={18}
                      color={theme.accent}
                    />
                  </View>
                  <View style={styles.cardHeadingCopy}>
                    <ThemedText style={styles.cardTitle}>
                      28-day evidence summary
                    </ThemedText>
                    <ThemedText
                      style={[styles.caption, { color: theme.textSecondary }]}
                    >
                      Aggregate counts only
                    </ThemedText>
                  </View>
                </View>
                <View style={styles.metrics}>
                  <View style={styles.metric}>
                    <ThemedText style={styles.metricValue}>
                      {request.evidence.scheduled}
                    </ThemedText>
                    <ThemedText
                      style={[
                        styles.metricLabel,
                        { color: theme.textSecondary },
                      ]}
                    >
                      scheduled
                    </ThemedText>
                  </View>
                  <View style={styles.metric}>
                    <ThemedText style={styles.metricValue}>
                      {request.evidence.completed}
                    </ThemedText>
                    <ThemedText
                      style={[
                        styles.metricLabel,
                        { color: theme.textSecondary },
                      ]}
                    >
                      completed
                    </ThemedText>
                  </View>
                  <View style={styles.metric}>
                    <ThemedText style={styles.metricValue}>
                      {request.evidence.kickstart}
                    </ThemedText>
                    <ThemedText
                      style={[
                        styles.metricLabel,
                        { color: theme.textSecondary },
                      ]}
                    >
                      kickstarts
                    </ThemedText>
                  </View>
                </View>
                <View
                  style={[styles.privacyNote, { borderColor: theme.border }]}
                >
                  <Feather name="lock" size={15} color={theme.success} />
                  <ThemedText
                    style={[styles.privacyText, { color: theme.textSecondary }]}
                  >
                    Daily notes, context note text, IDs, and individual event
                    dates never leave this device for a Tune-Up.
                  </ThemedText>
                </View>
                {!eligible ? (
                  <ThemedText
                    style={[styles.eligibility, { color: theme.warning }]}
                  >
                    Tune-Up unlocks after 7 scheduled action-days. You have{" "}
                    {request.evidence.scheduled}.
                  </ThemedText>
                ) : null}
              </View>
            ) : null}

            {phase === "loading" ? (
              <View
                accessible
                accessibilityRole="progressbar"
                accessibilityLabel="Coach is preparing a Plan Tune-Up"
                style={[
                  styles.card,
                  styles.loadingCard,
                  { backgroundColor: cardBackground },
                ]}
              >
                <ActivityIndicator color={theme.accent} />
                <ThemedText style={styles.loadingTitle}>
                  Looking for one useful bend…
                </ThemedText>
                <ThemedText
                  style={[styles.body, { color: theme.textSecondary }]}
                >
                  Nothing changes unless you confirm the preview.
                </ThemedText>
                <Pressable
                  onPress={cancelRequest}
                  accessibilityRole="button"
                  accessibilityLabel="Cancel Plan Tune-Up request"
                  style={({ pressed }) => [
                    styles.secondaryButton,
                    {
                      borderColor: theme.border,
                      opacity: pressed ? 0.6 : 1,
                    },
                  ]}
                >
                  <ThemedText>Cancel</ThemedText>
                </Pressable>
              </View>
            ) : null}

            {proposal && (phase === "preview" || phase === "applying") ? (
              <View
                style={[
                  styles.previewCard,
                  {
                    backgroundColor: cardBackground,
                    borderColor: theme.accent,
                  },
                ]}
              >
                <View style={styles.previewHeading}>
                  <Feather name="eye" size={20} color={theme.accent} />
                  <ThemedText style={styles.cardTitle}>
                    Preview before applying
                  </ThemedText>
                </View>
                <ThemedText style={styles.summary}>
                  {proposal.summary}
                </ThemedText>
                {changedFields.map((field) => {
                  const before = action?.[field];
                  const after = proposal.changes[field];
                  if (before === undefined || after === undefined) return null;
                  return (
                    <View
                      key={field}
                      style={[styles.changeRow, { borderColor: theme.border }]}
                    >
                      <ThemedText style={styles.changeLabel}>
                        {CHANGE_LABELS[field]}
                      </ThemedText>
                      <View style={styles.changeValues}>
                        <View style={styles.changeValue}>
                          <ThemedText
                            style={[
                              styles.changeEyebrow,
                              { color: theme.textSecondary },
                            ]}
                          >
                            CURRENT
                          </ThemedText>
                          <ThemedText style={styles.changeText}>
                            {formatValue(field, before)}
                          </ThemedText>
                        </View>
                        <Feather
                          name="arrow-right"
                          size={16}
                          color={theme.textSecondary}
                        />
                        <View style={styles.changeValue}>
                          <ThemedText
                            style={[
                              styles.changeEyebrow,
                              { color: theme.accent },
                            ]}
                          >
                            PROPOSED
                          </ThemedText>
                          <ThemedText style={styles.changeText}>
                            {formatValue(field, after)}
                          </ThemedText>
                        </View>
                      </View>
                    </View>
                  );
                })}
                <View style={styles.previewActions}>
                  <Pressable
                    disabled={phase === "applying"}
                    onPress={discardProposal}
                    accessibilityRole="button"
                    accessibilityLabel="Keep current plan"
                    style={({ pressed }) => [
                      styles.secondaryButton,
                      {
                        borderColor: theme.border,
                        opacity: phase === "applying" ? 0.4 : pressed ? 0.6 : 1,
                      },
                    ]}
                  >
                    <ThemedText>Keep current plan</ThemedText>
                  </Pressable>
                  <Pressable
                    disabled={phase === "applying"}
                    onPress={() => void confirmProposal()}
                    accessibilityRole="button"
                    accessibilityLabel="Apply proposed Plan Tune-Up"
                    style={({ pressed }) => [
                      styles.primaryButton,
                      {
                        backgroundColor: theme.accent,
                        opacity: phase === "applying" ? 0.6 : pressed ? 0.8 : 1,
                      },
                    ]}
                  >
                    {phase === "applying" ? (
                      <ActivityIndicator color={theme.buttonText} />
                    ) : (
                      <>
                        <Feather
                          name="check"
                          size={17}
                          color={theme.buttonText}
                        />
                        <ThemedText
                          style={[
                            styles.primaryButtonText,
                            { color: theme.buttonText },
                          ]}
                        >
                          Apply tune-up
                        </ThemedText>
                      </>
                    )}
                  </Pressable>
                </View>
              </View>
            ) : null}

            {phase === "complete" ? (
              <View
                accessible
                accessibilityRole="alert"
                style={[
                  styles.completeCard,
                  {
                    backgroundColor: cardBackground,
                    borderColor: theme.success,
                  },
                ]}
              >
                <Feather name="check-circle" size={28} color={theme.success} />
                <ThemedText style={styles.cardTitle}>Plan updated</ThemedText>
                <ThemedText
                  style={[styles.body, { color: theme.textSecondary }]}
                >
                  The before-and-after adjustment is saved in your Evidence
                  Timeline.
                </ThemedText>
                <Pressable
                  onPress={close}
                  accessibilityRole="button"
                  accessibilityLabel="Done with Plan Tune-Up"
                  style={({ pressed }) => [
                    styles.primaryButton,
                    {
                      backgroundColor: theme.accent,
                      opacity: pressed ? 0.8 : 1,
                    },
                  ]}
                >
                  <ThemedText
                    style={[
                      styles.primaryButtonText,
                      { color: theme.buttonText },
                    ]}
                  >
                    Done
                  </ThemedText>
                </Pressable>
              </View>
            ) : null}

            {errorMessage ? (
              <View
                accessible
                accessibilityRole="alert"
                style={[styles.errorCard, { borderColor: theme.error }]}
              >
                <Feather name="alert-circle" size={18} color={theme.error} />
                <ThemedText style={styles.errorText}>
                  {errorMessage} Your plan was not changed.
                </ThemedText>
              </View>
            ) : null}

            {phase === "idle" ? (
              <Pressable
                disabled={!eligible}
                onPress={requestWithConsent}
                accessibilityRole="button"
                accessibilityState={{ disabled: !eligible }}
                accessibilityLabel="Ask Coach for a Plan Tune-Up"
                style={({ pressed }) => [
                  styles.generateButton,
                  {
                    backgroundColor: eligible
                      ? theme.accent
                      : theme.backgroundTertiary,
                    opacity: pressed ? 0.8 : eligible ? 1 : 0.55,
                  },
                ]}
              >
                <Feather
                  name="refresh-cw"
                  size={18}
                  color={eligible ? theme.buttonText : theme.textSecondary}
                />
                <ThemedText
                  style={[
                    styles.primaryButtonText,
                    {
                      color: eligible ? theme.buttonText : theme.textSecondary,
                    },
                  ]}
                >
                  Ask Coach for a Plan Tune-Up
                </ThemedText>
              </Pressable>
            ) : null}
          </>
        )}
      </ScrollView>

      <AIConsentModal
        visible={showConsent}
        onAgree={() => {
          setShowConsent(false);
          void setAiConsent(true).then(runTuneUp);
        }}
        onDecline={() => setShowConsent(false)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: Spacing.md,
    marginBottom: Spacing.xl,
  },
  headerCopy: {
    flex: 1,
  },
  eyebrow: {
    ...Typography.caption,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  title: {
    ...Typography.title,
    marginTop: Spacing.xs,
  },
  subtitle: {
    ...Typography.small,
    lineHeight: 20,
    marginTop: Spacing.sm,
  },
  closeButton: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: BorderRadius.full,
  },
  sectionTitle: {
    ...Typography.headline,
    marginBottom: Spacing.md,
  },
  actionList: {
    gap: Spacing.sm,
    marginBottom: Spacing.xl,
  },
  actionChoice: {
    minHeight: 66,
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    padding: Spacing.lg,
  },
  actionChoiceCopy: {
    flex: 1,
  },
  actionTitle: {
    ...Typography.callout,
    fontWeight: "600",
  },
  actionMeta: {
    ...Typography.caption,
    marginTop: 4,
  },
  card: {
    borderRadius: BorderRadius.md,
    padding: Spacing.lg,
    marginBottom: Spacing.xl,
    gap: Spacing.md,
  },
  cardHeading: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
  },
  cardIcon: {
    width: 38,
    height: 38,
    borderRadius: BorderRadius.full,
    backgroundColor: "rgba(0, 217, 255, 0.1)",
    alignItems: "center",
    justifyContent: "center",
  },
  cardHeadingCopy: {
    flex: 1,
  },
  cardTitle: {
    ...Typography.headline,
  },
  caption: {
    ...Typography.caption,
    marginTop: 2,
  },
  body: {
    ...Typography.small,
    lineHeight: 20,
  },
  metrics: {
    flexDirection: "row",
    gap: Spacing.sm,
  },
  metric: {
    flex: 1,
    alignItems: "center",
    paddingVertical: Spacing.md,
  },
  metricValue: {
    ...Typography.h3,
  },
  metricLabel: {
    ...Typography.caption,
    marginTop: 2,
  },
  privacyNote: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: Spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: Spacing.md,
  },
  privacyText: {
    ...Typography.caption,
    lineHeight: 17,
    flex: 1,
  },
  eligibility: {
    ...Typography.small,
    fontWeight: "600",
  },
  loadingCard: {
    alignItems: "center",
  },
  loadingTitle: {
    ...Typography.headline,
    textAlign: "center",
  },
  previewCard: {
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    padding: Spacing.lg,
    marginBottom: Spacing.xl,
  },
  previewHeading: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  summary: {
    ...Typography.callout,
    lineHeight: 22,
    marginTop: Spacing.md,
    marginBottom: Spacing.sm,
  },
  changeRow: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: Spacing.md,
    marginTop: Spacing.md,
  },
  changeLabel: {
    ...Typography.small,
    fontWeight: "700",
    marginBottom: Spacing.sm,
  },
  changeValues: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  changeValue: {
    flex: 1,
  },
  changeEyebrow: {
    ...Typography.caption,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
  changeText: {
    ...Typography.small,
    lineHeight: 19,
    marginTop: 3,
  },
  previewActions: {
    marginTop: Spacing.lg,
    gap: Spacing.sm,
  },
  primaryButton: {
    minHeight: Spacing.buttonHeight,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.lg,
  },
  primaryButtonText: {
    ...Typography.callout,
    fontWeight: "700",
  },
  secondaryButton: {
    minHeight: 46,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.lg,
  },
  generateButton: {
    minHeight: Spacing.buttonHeight,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.lg,
  },
  completeCard: {
    alignItems: "center",
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    padding: Spacing.xl,
    marginBottom: Spacing.xl,
    gap: Spacing.md,
  },
  errorCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: Spacing.sm,
    borderWidth: 1,
    borderRadius: BorderRadius.sm,
    padding: Spacing.md,
    marginBottom: Spacing.lg,
  },
  errorText: {
    ...Typography.small,
    lineHeight: 19,
    flex: 1,
  },
});
