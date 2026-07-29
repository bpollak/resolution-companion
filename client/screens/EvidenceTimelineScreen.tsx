import React, { useEffect, useMemo } from "react";
import { FlatList, Pressable, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";

import { useApp } from "@/context/AppContext";
import { useTheme } from "@/hooks/useTheme";
import { ThemedText } from "@/components/ThemedText";
import { BorderRadius, Colors, Spacing, Typography } from "@/constants/theme";
import {
  buildEvidenceTimeline,
  type EvidenceTimelineItem,
  type EvidenceTimelineItemType,
} from "@/lib/evidence";
import { track } from "@/lib/telemetry";

const ICONS: Record<EvidenceTimelineItemType, keyof typeof Feather.glyphMap> = {
  "daily-context": "sliders",
  "action-note": "message-square",
  milestone: "award",
  comeback: "corner-up-left",
  "plan-adjustment": "refresh-cw",
  "monthly-story": "book-open",
};

function formatTimelineDate(dateKey: string): string {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default function EvidenceTimelineScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const { theme, isDark } = useTheme();
  const {
    persona,
    benchmarks,
    actions,
    dailyLogs,
    dailyContexts,
    planAdjustments,
  } = useApp();

  useEffect(() => {
    track("evidence_timeline_opened");
  }, []);

  const items = useMemo(
    () =>
      persona
        ? buildEvidenceTimeline({
            persona,
            benchmarks,
            actions,
            logs: dailyLogs,
            contexts: dailyContexts,
            planAdjustments,
          })
        : [],
    [actions, benchmarks, dailyContexts, dailyLogs, persona, planAdjustments],
  );

  const openItem = (item: EvidenceTimelineItem) => {
    if (!item.monthKey) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    navigation.navigate("MonthRecap", { monthKey: item.monthKey });
  };

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: theme.backgroundRoot,
          paddingTop: insets.top + Spacing.md,
        },
      ]}
    >
      <View style={styles.header}>
        <View style={styles.headerCopy}>
          <ThemedText style={styles.eyebrow}>Proof of becoming</ThemedText>
          <ThemedText style={styles.title}>Evidence Timeline</ThemedText>
          <ThemedText style={[styles.subtitle, { color: theme.textSecondary }]}>
            Notes, context, milestones, comebacks, and stories. Routine votes
            stay in the calendar instead of becoming a feed.
          </ThemedText>
        </View>
        <Pressable
          onPress={() => navigation.goBack()}
          hitSlop={12}
          pressRetentionOffset={16}
          accessibilityRole="button"
          accessibilityLabel="Close Evidence Timeline"
          style={({ pressed }) => [
            styles.closeButton,
            {
              backgroundColor: isDark
                ? Colors.dark.backgroundDefault
                : Colors.light.backgroundDefault,
              opacity: pressed ? 0.6 : 1,
            },
          ]}
        >
          <Feather name="x" size={20} color={theme.text} />
        </Pressable>
      </View>

      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        delaysContentTouches={false}
        decelerationRate="fast"
        contentContainerStyle={{
          paddingHorizontal: Spacing.lg,
          paddingBottom: insets.bottom + Spacing["2xl"],
        }}
        renderItem={({ item, index }) => {
          const showDate = index === 0 || items[index - 1].date !== item.date;
          const body = (
            <>
              <View style={styles.itemIcon}>
                <Feather
                  name={ICONS[item.type]}
                  size={18}
                  color={theme.accent}
                />
              </View>
              <View style={styles.itemCopy}>
                <ThemedText style={styles.itemTitle}>{item.title}</ThemedText>
                <ThemedText
                  style={[styles.itemDetail, { color: theme.textSecondary }]}
                >
                  {item.detail}
                </ThemedText>
              </View>
              {item.monthKey ? (
                <Feather
                  name="chevron-right"
                  size={18}
                  color={theme.textSecondary}
                />
              ) : null}
            </>
          );
          return (
            <View>
              {showDate ? (
                <ThemedText
                  style={[styles.date, { color: theme.textSecondary }]}
                >
                  {formatTimelineDate(item.date)}
                </ThemedText>
              ) : null}
              {item.monthKey ? (
                <Pressable
                  onPress={() => openItem(item)}
                  accessibilityRole="button"
                  accessibilityLabel={`${item.title}. ${item.detail}`}
                  style={({ pressed }) => [
                    styles.item,
                    {
                      backgroundColor: isDark
                        ? Colors.dark.backgroundDefault
                        : Colors.light.backgroundDefault,
                      opacity: pressed ? 0.7 : 1,
                      transform: [{ scale: pressed ? 0.99 : 1 }],
                    },
                  ]}
                >
                  {body}
                </Pressable>
              ) : (
                <View
                  accessible
                  accessibilityLabel={`${item.title}. ${item.detail}`}
                  style={[
                    styles.item,
                    {
                      backgroundColor: isDark
                        ? Colors.dark.backgroundDefault
                        : Colors.light.backgroundDefault,
                    },
                  ]}
                >
                  {body}
                </View>
              )}
            </View>
          );
        }}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Feather name="clock" size={36} color={theme.textSecondary} />
            <ThemedText
              style={[styles.emptyText, { color: theme.textSecondary }]}
            >
              Your notes, milestones, and returns will build this timeline.
            </ThemedText>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: Spacing.md,
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.xl,
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
    borderRadius: BorderRadius.full,
    alignItems: "center",
    justifyContent: "center",
  },
  date: {
    ...Typography.caption,
    fontWeight: "600",
    marginTop: Spacing.md,
    marginBottom: Spacing.sm,
  },
  item: {
    minHeight: 74,
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    padding: Spacing.lg,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.sm,
  },
  itemIcon: {
    width: 36,
    height: 36,
    borderRadius: BorderRadius.full,
    backgroundColor: "rgba(0, 217, 255, 0.1)",
    alignItems: "center",
    justifyContent: "center",
  },
  itemCopy: {
    flex: 1,
  },
  itemTitle: {
    ...Typography.body,
    fontWeight: "600",
  },
  itemDetail: {
    ...Typography.caption,
    lineHeight: 18,
    marginTop: 3,
  },
  empty: {
    alignItems: "center",
    gap: Spacing.md,
    paddingVertical: Spacing["3xl"],
  },
  emptyText: {
    ...Typography.body,
    textAlign: "center",
  },
});
