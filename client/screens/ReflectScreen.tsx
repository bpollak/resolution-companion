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

import { useTheme } from "@/hooks/useTheme";
import { useApp } from "@/context/AppContext";
import { Colors, Spacing, Typography, BorderRadius } from "@/constants/theme";
import { ThemedText } from "@/components/ThemedText";
import { ChatBubble } from "@/components/ChatBubble";
import { logger } from "@/lib/logger";
import { track } from "@/lib/telemetry";
import { getTodaysMicroNote } from "@/lib/micro-notes";
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
  const recentPlanChanges = useMemo(() => {
    const titleById = new Map(actions.map((a) => [a.id, a.title]));
    return [...planAdjustments]
      .sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      )
      .slice(0, 3)
      .map((adjustment) => ({
        id: adjustment.id,
        actionTitle: titleById.get(adjustment.actionId) ?? "An action",
        applied: adjustment.status === "applied",
        fields: Object.keys(adjustment.after)
          .map((field) => PLAN_FIELD_LABELS[field] ?? field)
          .join(" · "),
        rationale: adjustment.rationale,
        createdAt: adjustment.createdAt,
      }));
  }, [planAdjustments, actions]);

  const remainingCheckIns = Math.max(0, 10 - monthlyReflectionCount);
  const conversationAvailable = subscription.isPremium || canUseReflection();

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
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
      <View style={styles.header}>
        <ThemedText style={styles.title}>
          What do you need help with?
        </ThemedText>
        <ThemedText style={[styles.subtitle, { color: theme.textSecondary }]}>
          Talk through what is working, what feels hard, or what you want to
          change.
        </ThemedText>
      </View>

      {conversationAvailable ? (
        <Pressable
          onPress={() =>
            navigation.navigate("CoachSheet", {
              origin: "direct",
              promptId: "reflect-success",
            })
          }
          accessibilityRole="button"
          accessibilityLabel="Start a conversation with Coach"
          style={({ pressed }) => [
            styles.scoreCard,
            { borderColor: theme.accent, opacity: pressed ? 0.78 : 1 },
          ]}
        >
          <View style={styles.microNoteHeader}>
            <Feather name="message-circle" size={22} color={theme.accent} />
            <ThemedText style={styles.scoreLabel}>
              Start a conversation
            </ThemedText>
            <Feather
              name="chevron-right"
              size={20}
              color={theme.textSecondary}
            />
          </View>
          <ThemedText
            style={[styles.scoreHint, { color: theme.textSecondary }]}
          >
            Your coach starts with the evidence you have already recorded.
          </ThemedText>
          <ThemedText style={[styles.sessionsCount, { color: theme.accent }]}>
            {subscription.isPremium
              ? "Unlimited with Premium"
              : `${remainingCheckIns} free check-in${remainingCheckIns === 1 ? "" : "s"} left this month`}
          </ThemedText>
        </Pressable>
      ) : (
        <Pressable
          onPress={() =>
            navigation.navigate("Subscription", { source: "coach-limit" })
          }
          accessibilityRole="button"
          accessibilityLabel="Monthly check-in limit reached. Upgrade to Premium for unlimited coaching"
          style={({ pressed }) => [
            styles.heroCtaLocked,
            {
              backgroundColor: isDark
                ? Colors.dark.backgroundDefault
                : Colors.light.backgroundDefault,
              borderColor: theme.border,
            },
            pressed && styles.heroCtaPressed,
          ]}
        >
          <View
            style={[
              styles.heroCtaLockedIcon,
              {
                backgroundColor: isDark
                  ? Colors.dark.backgroundTertiary
                  : Colors.light.backgroundTertiary,
              },
            ]}
          >
            <Feather name="lock" size={24} color={theme.textSecondary} />
          </View>
          <View style={styles.heroCtaContent}>
            <ThemedText style={styles.heroCtaLockedTitle}>
              Free check-ins used for now
            </ThemedText>
            <ThemedText
              style={[
                styles.heroCtaLockedSubtitle,
                { color: theme.textSecondary },
              ]}
            >
              They reset next month &mdash; Premium removes the cap
            </ThemedText>
          </View>
          <Feather name="chevron-right" size={20} color={theme.textSecondary} />
        </Pressable>
      )}

      {!subscription.isPremium &&
      conversationAvailable &&
      monthlyReflectionCount >= 7 ? (
        <Pressable
          onPress={() =>
            navigation.navigate("Subscription", { source: "coach-limit" })
          }
          accessibilityRole="button"
          accessibilityLabel="Upgrade to Premium for unlimited check-ins"
          style={({ pressed }) => [
            styles.upgradeLink,
            { borderColor: theme.accent, opacity: pressed ? 0.7 : 1 },
          ]}
        >
          <Feather name="zap" size={16} color={theme.accent} />
          <ThemedText style={[styles.upgradeLinkText, { color: theme.accent }]}>
            Upgrade to Premium
          </ThemedText>
        </Pressable>
      ) : null}

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
          styles.microNoteCard,
          {
            backgroundColor: isDark
              ? Colors.dark.backgroundDefault
              : Colors.light.backgroundDefault,
            borderColor: `${theme.warning}33`,
            opacity: pressed ? 0.85 : 1,
          },
        ]}
      >
        <View style={styles.microNoteHeader}>
          <Feather name="book-open" size={16} color={theme.warning} />
          <ThemedText style={styles.microNoteTitle}>
            {microNote.title}
          </ThemedText>
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
                A new read every week — daily with Premium.
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
              accessibilityLabel={`Plan change for ${change.actionTitle} on ${formatDate(change.createdAt)}: ${change.applied ? "applied" : "kept current"}. ${change.rationale}`}
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
                  {change.applied ? "Applied" : "Kept current"}
                </ThemedText>
              </View>
              <ThemedText
                style={[styles.planChangeMeta, { color: theme.textSecondary }]}
              >
                {formatDate(change.createdAt)}
                {change.fields ? ` · ${change.fields}` : ""}
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
                  opacity: pressed ? 0.8 : 1,
                },
                pressed && styles.cardPressed,
              ]}
            >
              <View style={styles.pastSessionIcon}>
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
  header: {
    marginBottom: Spacing["2xl"],
  },
  title: {
    ...Typography.title,
    marginBottom: Spacing.sm,
  },
  subtitle: {
    ...Typography.body,
  },
  scoreCard: {
    alignItems: "center",
    padding: Spacing["2xl"],
    marginBottom: Spacing.md,
    borderWidth: 1,
    borderRadius: BorderRadius.md,
  },
  scoreLabel: {
    ...Typography.caption,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: Spacing.xs,
  },
  scoreHint: {
    ...Typography.body,
    textAlign: "center",
  },
  sessionsCount: {
    ...Typography.body,
    fontWeight: "700",
    marginTop: Spacing.md,
  },
  microNoteCard: {
    borderRadius: BorderRadius.md,
    padding: Spacing.lg,
    borderWidth: 1,
    borderColor: "rgba(0, 217, 255, 0.2)",
  },
  microNoteHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  microNoteTitle: {
    ...Typography.body,
    fontWeight: "600",
    flex: 1,
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
  upgradeLink: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "center",
    gap: Spacing.xs,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    marginBottom: Spacing.md,
  },
  upgradeLinkText: {
    ...Typography.body,
    fontWeight: "600",
  },
  sectionTitle: {
    ...Typography.headline,
    marginBottom: Spacing.md,
  },
  heroCtaPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.98 }],
  },
  weeklyReviewCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.lg,
    borderRadius: BorderRadius.lg,
    marginBottom: Spacing.md,
  },
  weeklyReviewIcon: {
    width: 40,
    height: 40,
    borderRadius: BorderRadius.full,
    backgroundColor: "rgba(0, 217, 255, 0.12)",
    alignItems: "center",
    justifyContent: "center",
    marginRight: Spacing.md,
  },
  weeklyReviewTitle: {
    ...Typography.body,
    fontWeight: "600",
    marginBottom: 2,
  },
  weeklyReviewSubtitle: {
    ...Typography.caption,
  },
  heroCtaContent: {
    flex: 1,
    marginRight: Spacing.md,
  },
  heroCtaLocked: {
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.xl,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    marginBottom: Spacing.md,
  },
  heroCtaLockedIcon: {
    width: 48,
    height: 48,
    borderRadius: BorderRadius.full,
    alignItems: "center",
    justifyContent: "center",
    marginRight: Spacing.lg,
  },
  heroCtaLockedTitle: {
    ...Typography.headline,
    marginBottom: Spacing.xs,
  },
  heroCtaLockedSubtitle: {
    ...Typography.small,
    lineHeight: 20,
  },
  cardPressed: {
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
    backgroundColor: "rgba(0, 217, 255, 0.1)",
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
