import React, { useState, useMemo, useCallback } from "react";
import {
  View,
  ScrollView,
  StyleSheet,
  Pressable,
  FlatList,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { useNavigation } from "@react-navigation/native";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";

import { useTheme } from "@/hooks/useTheme";
import { useApp } from "@/context/AppContext";
import { Colors, Spacing, Typography, BorderRadius } from "@/constants/theme";
import { ThemedText } from "@/components/ThemedText";
import { ChatBubble } from "@/components/ChatBubble";
import { logger } from "@/lib/logger";
import { track } from "@/lib/telemetry";
import { getTodaysMicroNote } from "@/lib/micro-notes";
import { withAlpha } from "@/lib/color";
import {
  FREE_REFLECTION_LIMIT,
  shouldShowCoachUpgradeLink,
} from "@/lib/coach-quota";
import { getMainTabHeaderClearance } from "@/navigation/tab-bar-layout";

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
}

const PLAN_FIELD_LABELS: Record<string, string> = {
  frequency: "Days",
  anchorLink: "When",
  kickstartVersion: "2-minute version",
};

export default function ReflectScreen() {
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const headerClearance = getMainTabHeaderClearance(Platform.OS, headerHeight);
  const tabBarHeight = useBottomTabBarHeight();
  const navigation = useNavigation<any>();
  const { theme, isDark } = useTheme();
  const {
    hasOnboarded,
    canUseReflection,
    subscription,
    monthlyReflectionCount,
    reflections,
    planAdjustments,
    actions,
  } = useApp();

  const [viewingPastSession, setViewingPastSession] = useState<string | null>(
    null,
  );

  const sortedReflections = useMemo(
    () =>
      [...reflections].sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      ),
    [reflections],
  );

  // Identity-science micro-note drip: daily for premium, weekly for free
  const [noteExpanded, setNoteExpanded] = useState(false);
  const microNote = useMemo(
    () => getTodaysMicroNote(subscription.isPremium),
    [subscription.isPremium],
  );

  // The coach's plan changes stay reviewable: newest first, capped at 3.
  // Records written by the 1.3.x line use appliedAt/summary and carry no
  // status (they only exist once applied) — read both shapes.
  const recentPlanChanges = useMemo(() => {
    const titleById = new Map(actions.map((a) => [a.id, a.title]));
    return [...planAdjustments]
      .map((adjustment) => {
        const legacy = adjustment as typeof adjustment & {
          appliedAt?: string;
          summary?: string;
        };
        return {
          id: adjustment.id,
          actionTitle: titleById.get(adjustment.actionId) ?? "An action",
          applied: adjustment.status ? adjustment.status === "applied" : true,
          fields: Object.keys(adjustment.after ?? {})
            .map((field) => PLAN_FIELD_LABELS[field] ?? field)
            .join(" · "),
          rationale: adjustment.rationale ?? legacy.summary ?? "",
          createdAt: adjustment.createdAt ?? legacy.appliedAt ?? "",
        };
      })
      .sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      )
      .slice(0, 3);
  }, [planAdjustments, actions]);

  const remainingCheckIns = Math.max(
    0,
    FREE_REFLECTION_LIMIT - monthlyReflectionCount,
  );
  const showUpgradeLink = shouldShowCoachUpgradeLink({
    isPremium: subscription.isPremium,
    remaining: remainingCheckIns,
  });
  const openUpgrade = () =>
    navigation.navigate("Subscription", { source: "coach-limit" });
  const conversationAvailable = subscription.isPremium || canUseReflection();

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    if (Number.isNaN(date.getTime())) return "";
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  const renderMessage = useCallback(
    ({ item }: { item: ChatMessage }) => (
      <ChatBubble
        message={item.content}
        isUser={item.role === "user"}
        reportSurface="coach"
      />
    ),
    [],
  );

  if (!hasOnboarded) {
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
          <Feather name="edit-3" size={64} color={theme.textSecondary} />
          <ThemedText
            style={[styles.emptyText, { color: theme.textSecondary }]}
          >
            Complete onboarding to access coaching
          </ThemedText>
        </View>
      </View>
    );
  }

  if (viewingPastSession) {
    const session = reflections.find((r) => r.id === viewingPastSession);
    if (session) {
      let conversationMessages: ChatMessage[] = [];
      if (session.conversation) {
        try {
          conversationMessages = JSON.parse(session.conversation);
        } catch (error) {
          logger.error(
            "Failed to parse stored reflection conversation:",
            error,
          );
          conversationMessages = [];
        }
      }

      const hasFullConversation = conversationMessages.length > 0;
      const pastSessionMessages: ChatMessage[] = hasFullConversation
        ? conversationMessages
        : [
            {
              id: `${session.id}-assistant`,
              role: "assistant",
              content: session.aiFeedback,
            },
            ...(session.userInput
              ? [
                  {
                    id: `${session.id}-user`,
                    role: "user" as const,
                    content: session.userInput,
                  },
                ]
              : []),
          ];

      return (
        <View
          style={[
            styles.chatContainer,
            { backgroundColor: theme.backgroundRoot },
          ]}
        >
          <View
            style={[
              styles.chatHeader,
              { paddingTop: headerClearance + Spacing.sm },
            ]}
          >
            <Pressable
              onPress={() => setViewingPastSession(null)}
              hitSlop={12}
              pressRetentionOffset={16}
              accessibilityRole="button"
              accessibilityLabel="Back to check-in list"
              style={({ pressed }) => [
                styles.closeButton,
                { opacity: pressed ? 0.6 : 1 },
              ]}
            >
              <Feather name="arrow-left" size={24} color={theme.text} />
            </Pressable>
            <ThemedText style={styles.chatHeaderTitle}>
              {formatDate(session.createdAt)}
            </ThemedText>
            <View style={styles.doneButton}>
              <ThemedText
                style={[
                  styles.pastSessionMomentumValue,
                  { color: theme.accent },
                ]}
              >
                {session.momentumScore}%
              </ThemedText>
            </View>
          </View>

          <FlatList
            data={pastSessionMessages}
            renderItem={renderMessage}
            keyExtractor={(message, index) =>
              message.id || `${session.id}-${index}`
            }
            delaysContentTouches={false}
            style={{ flex: 1 }}
            contentContainerStyle={[
              styles.messageList,
              { paddingBottom: tabBarHeight + Spacing.xl },
            ]}
            scrollIndicatorInsets={{ bottom: insets.bottom }}
            decelerationRate="fast"
            initialNumToRender={12}
            maxToRenderPerBatch={8}
            windowSize={7}
          />
        </View>
      );
    }
  }

  return (
    <ScrollView
      delaysContentTouches={false}
      decelerationRate="fast"
      style={{ flex: 1, backgroundColor: theme.backgroundRoot }}
      contentContainerStyle={{
        paddingTop: headerClearance + Spacing.xl,
        paddingBottom: tabBarHeight + Spacing.xl,
        paddingHorizontal: Spacing.lg,
      }}
      scrollIndicatorInsets={{ bottom: insets.bottom }}
    >
      <ThemedText style={styles.title}>What do you need help with?</ThemedText>

      {conversationAvailable ? (
        <View style={styles.startBlock}>
          <Pressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(
                () => {},
              );
              navigation.navigate("CoachSheet", {
                origin: "direct",
                promptId: "reflect-success",
              });
            }}
            hitSlop={8}
            pressRetentionOffset={16}
            accessibilityRole="button"
            // QA flows select this label; the visible text is shorter.
            accessibilityLabel="Start a conversation with Coach"
            style={({ pressed }) => [
              styles.primaryButton,
              { backgroundColor: theme.accent },
              pressed && styles.primaryButtonPressed,
            ]}
          >
            <Feather name="message-circle" size={20} color={theme.buttonText} />
            <ThemedText
              style={[styles.primaryButtonText, { color: theme.buttonText }]}
            >
              Talk to Coach
            </ThemedText>
          </Pressable>
          <ThemedText
            style={[styles.startHint, { color: theme.textSecondary }]}
          >
            Coach starts from what you’ve already done.
            {subscription.isPremium
              ? ""
              : ` ${remainingCheckIns} free check-in${remainingCheckIns === 1 ? "" : "s"} left this month.`}
          </ThemedText>
          {showUpgradeLink ? (
            <Pressable
              onPress={openUpgrade}
              hitSlop={12}
              pressRetentionOffset={16}
              accessibilityRole="button"
              accessibilityLabel="Upgrade to Premium for unlimited check-ins"
              style={({ pressed }) => [
                styles.upgradeLink,
                { opacity: pressed ? 0.6 : 1 },
              ]}
            >
              <ThemedText
                style={[styles.upgradeLinkText, { color: theme.accent }]}
              >
                Upgrade
              </ThemedText>
            </Pressable>
          ) : null}
        </View>
      ) : (
        <Pressable
          onPress={openUpgrade}
          hitSlop={8}
          pressRetentionOffset={16}
          accessibilityRole="button"
          accessibilityLabel="Monthly check-in limit reached. Upgrade to Premium for unlimited coaching"
          style={({ pressed }) => [
            styles.card,
            styles.lockedCard,
            { backgroundColor: theme.backgroundDefault },
            pressed && styles.cardPressed,
          ]}
        >
          <Feather name="lock" size={18} color={theme.textSecondary} />
          <View style={styles.lockedContent}>
            <ThemedText style={styles.cardTitle}>
              Free check-ins used for now
            </ThemedText>
            <ThemedText
              style={[styles.lockedSubtitle, { color: theme.textSecondary }]}
            >
              They reset next month. Premium removes the cap.
            </ThemedText>
          </View>
          <ThemedText style={[styles.upgradeLinkText, { color: theme.accent }]}>
            Upgrade
          </ThemedText>
        </Pressable>
      )}

      <ThemedText style={[styles.sectionTitle, { marginTop: Spacing.xl }]}>
        {subscription.isPremium ? "Today's read" : "This week's read"}
      </ThemedText>

      <Pressable
        onPress={() => {
          if (!noteExpanded) track("micro_note_read");
          setNoteExpanded((v) => !v);
        }}
        accessibilityRole="button"
        accessibilityLabel={`60-second read: ${microNote.title}. ${noteExpanded ? "Collapse" : "Expand"}.`}
        style={({ pressed }) => [
          styles.card,
          { backgroundColor: theme.backgroundDefault },
          pressed && styles.cardPressed,
        ]}
      >
        <View style={styles.microNoteHeader}>
          <Feather name="book-open" size={16} color={theme.textSecondary} />
          <ThemedText style={styles.cardTitle}>{microNote.title}</ThemedText>
          <Feather
            name={noteExpanded ? "chevron-up" : "chevron-down"}
            size={18}
            color={theme.textSecondary}
          />
        </View>
        {noteExpanded ? (
          <>
            <ThemedText
              style={[styles.microNoteBody, { color: theme.textSecondary }]}
            >
              {microNote.body}
            </ThemedText>
            {!subscription.isPremium ? (
              <ThemedText
                style={[styles.microNoteHint, { color: theme.textSecondary }]}
              >
                A new read every week, or daily with Premium.
              </ThemedText>
            ) : null}
          </>
        ) : null}
      </Pressable>

      {recentPlanChanges.length > 0 ? (
        <>
          <ThemedText style={[styles.sectionTitle, { marginTop: Spacing.xl }]}>
            Plan Changes
          </ThemedText>
          {recentPlanChanges.map((change) => (
            <View
              key={change.id}
              accessible
              accessibilityLabel={`Plan change for ${change.actionTitle}${formatDate(change.createdAt) ? ` on ${formatDate(change.createdAt)}` : ""}: ${change.applied ? "applied" : "not applied"}. ${change.rationale}`}
              style={[
                styles.planChangeCard,
                {
                  backgroundColor: isDark
                    ? Colors.dark.backgroundDefault
                    : Colors.light.backgroundDefault,
                },
              ]}
            >
              <View style={styles.planChangeHeader}>
                <ThemedText style={styles.planChangeTitle} numberOfLines={1}>
                  {change.actionTitle}
                </ThemedText>
                <ThemedText
                  style={[
                    styles.planChangeStatus,
                    {
                      color: change.applied
                        ? theme.accent
                        : theme.textSecondary,
                    },
                  ]}
                >
                  {change.applied ? "Applied" : "Not applied"}
                </ThemedText>
              </View>
              <ThemedText
                style={[styles.planChangeMeta, { color: theme.textSecondary }]}
              >
                {[formatDate(change.createdAt), change.fields]
                  .filter(Boolean)
                  .join(" · ")}
              </ThemedText>
              <ThemedText
                style={[
                  styles.planChangeRationale,
                  { color: theme.textSecondary },
                ]}
                numberOfLines={2}
              >
                {change.rationale}
              </ThemedText>
            </View>
          ))}
        </>
      ) : null}

      {sortedReflections.length > 0 ? (
        <>
          <ThemedText style={[styles.sectionTitle, { marginTop: Spacing.xl }]}>
            Past Sessions
          </ThemedText>
          {sortedReflections.slice(0, 5).map((reflection) => (
            <Pressable
              key={reflection.id}
              onPress={() => setViewingPastSession(reflection.id)}
              accessibilityRole="button"
              accessibilityLabel={`Open check-in from ${formatDate(reflection.createdAt)}, momentum ${reflection.momentumScore} percent`}
              style={({ pressed }) => [
                styles.pastSessionCard,
                {
                  backgroundColor: isDark
                    ? Colors.dark.backgroundDefault
                    : Colors.light.backgroundDefault,
                },
                pressed && styles.cardPressed,
              ]}
            >
              <View
                style={[
                  styles.pastSessionIcon,
                  { backgroundColor: withAlpha(theme.accent, 0.1) },
                ]}
              >
                <Feather name="message-circle" size={20} color={theme.accent} />
              </View>
              <View style={styles.pastSessionContent}>
                <ThemedText style={styles.pastSessionDate}>
                  {formatDate(reflection.createdAt)}
                  {reflection.periodType === "weekly" ? " · Weekly" : ""}
                </ThemedText>
                <ThemedText
                  style={[
                    styles.pastSessionPreview,
                    { color: theme.textSecondary },
                  ]}
                  numberOfLines={1}
                >
                  {reflection.aiFeedback.slice(0, 60)}...
                </ThemedText>
              </View>
              <View style={styles.pastSessionMomentum}>
                <ThemedText
                  style={[
                    styles.pastSessionMomentumValue,
                    { color: theme.accent },
                  ]}
                >
                  {reflection.momentumScore}%
                </ThemedText>
              </View>
              <Feather
                name="chevron-right"
                size={18}
                color={theme.textSecondary}
              />
            </Pressable>
          ))}
        </>
      ) : null}
    </ScrollView>
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
  title: {
    ...Typography.title,
    marginBottom: Spacing.xl,
  },
  startBlock: {
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  primaryButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    height: Spacing.buttonHeight,
    borderRadius: BorderRadius.full,
  },
  primaryButtonPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.98 }],
  },
  primaryButtonText: {
    ...Typography.headline,
  },
  upgradeLink: {
    alignSelf: "center",
    paddingVertical: Spacing.xs,
  },
  upgradeLinkText: {
    ...Typography.small,
    fontWeight: "600",
  },
  startHint: {
    ...Typography.small,
    lineHeight: 20,
    textAlign: "center",
  },
  card: {
    borderRadius: BorderRadius.md,
    padding: Spacing.lg,
  },
  cardTitle: {
    ...Typography.body,
    fontWeight: "600",
    flex: 1,
  },
  lockedCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    marginBottom: Spacing.md,
  },
  lockedContent: {
    flex: 1,
    gap: Spacing.xs,
  },
  lockedSubtitle: {
    ...Typography.small,
    lineHeight: 20,
  },
  microNoteHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  microNoteBody: {
    ...Typography.small,
    lineHeight: 20,
    marginTop: Spacing.md,
  },
  microNoteHint: {
    ...Typography.caption,
    fontStyle: "italic",
    marginTop: Spacing.md,
  },
  sectionTitle: {
    ...Typography.headline,
    marginBottom: Spacing.md,
  },
  cardPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.98 }],
  },
  planChangeCard: {
    borderRadius: BorderRadius.md,
    padding: Spacing.lg,
    marginBottom: Spacing.sm,
  },
  planChangeHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: Spacing.sm,
  },
  planChangeTitle: {
    ...Typography.body,
    fontWeight: "600",
    flexShrink: 1,
  },
  planChangeStatus: {
    ...Typography.caption,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  planChangeMeta: {
    ...Typography.caption,
    marginTop: 2,
  },
  planChangeRationale: {
    ...Typography.small,
    lineHeight: 20,
    marginTop: Spacing.sm,
  },
  pastSessionCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.lg,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.sm,
  },
  pastSessionIcon: {
    width: 40,
    height: 40,
    borderRadius: BorderRadius.full,
    alignItems: "center",
    justifyContent: "center",
    marginRight: Spacing.md,
  },
  pastSessionContent: {
    flex: 1,
  },
  pastSessionDate: {
    ...Typography.body,
    fontWeight: "600",
    marginBottom: 2,
  },
  pastSessionPreview: {
    ...Typography.small,
  },
  pastSessionMomentum: {
    marginRight: Spacing.sm,
  },
  pastSessionMomentumValue: {
    ...Typography.body,
    fontWeight: "700",
  },
  chatContainer: {
    flex: 1,
  },
  chatHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.md,
  },
  closeButton: {
    padding: Spacing.sm,
  },
  chatHeaderTitle: {
    ...Typography.headline,
    flex: 1,
    textAlign: "center",
  },
  doneButton: {
    padding: Spacing.sm,
  },
  messageList: {
    paddingVertical: Spacing.lg,
    flexGrow: 1,
  },
});
