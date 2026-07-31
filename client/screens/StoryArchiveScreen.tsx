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
import { buildStoryArchiveMonths } from "@/lib/evidence";
import { buildMonthRecap } from "@/lib/recap";
import { track } from "@/lib/telemetry";

export default function StoryArchiveScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const { theme, isDark } = useTheme();
  const { persona, actions, dailyLogs, subscription } = useApp();

  useEffect(() => {
    track("story_archive_opened");
  }, []);

  const stories = useMemo(() => {
    if (!persona) return [];
    return buildStoryArchiveMonths(persona.createdAt).map((month) => ({
      ...month,
      recap: buildMonthRecap(
        actions,
        dailyLogs,
        persona,
        month.monthKey,
        new Date(),
        subscription.isPremium ? 2 : 1,
      ),
    }));
  }, [actions, dailyLogs, persona, subscription.isPremium]);

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
          <ThemedText style={styles.eyebrow}>Your personal story</ThemedText>
          <ThemedText style={styles.title}>Story Archive</ThemedText>
          <ThemedText style={[styles.subtitle, { color: theme.textSecondary }]}>
            Every Monthly Progress story stays here, including the month still
            being written.
          </ThemedText>
        </View>
        <Pressable
          onPress={() => navigation.goBack()}
          hitSlop={12}
          pressRetentionOffset={16}
          accessibilityRole="button"
          accessibilityLabel="Close Story Archive"
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
        data={stories}
        keyExtractor={(item) => item.monthKey}
        delaysContentTouches={false}
        decelerationRate="fast"
        contentContainerStyle={{
          paddingHorizontal: Spacing.lg,
          paddingBottom: insets.bottom + Spacing["2xl"],
        }}
        renderItem={({ item }) => (
          <Pressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              navigation.navigate("MonthRecap", {
                monthKey: item.monthKey,
              });
            }}
            accessibilityRole="button"
            accessibilityLabel={`${item.monthLabel}${item.isCurrent ? ", in progress" : ""}. ${item.recap.actionsCompleted} completed actions, ${item.recap.consistency}% consistency. Open Monthly Progress.`}
            style={({ pressed }) => [
              styles.storyCard,
              {
                backgroundColor: isDark
                  ? Colors.dark.backgroundDefault
                  : Colors.light.backgroundDefault,
                borderColor: item.isCurrent ? theme.accent : theme.border,
                opacity: pressed ? 0.75 : 1,
                transform: [{ scale: pressed ? 0.985 : 1 }],
              },
            ]}
          >
            <View style={styles.monthIcon}>
              <Feather
                name={item.isCurrent ? "edit-3" : "book-open"}
                size={20}
                color={theme.accent}
              />
            </View>
            <View style={styles.storyCopy}>
              <View style={styles.storyTitleRow}>
                <ThemedText style={styles.storyTitle}>
                  {item.monthLabel}
                </ThemedText>
                {item.isCurrent ? (
                  <View
                    style={[
                      styles.inProgressBadge,
                      { borderColor: theme.accent },
                    ]}
                  >
                    <ThemedText
                      style={[styles.inProgressText, { color: theme.accent }]}
                    >
                      In progress
                    </ThemedText>
                  </View>
                ) : null}
              </View>
              <ThemedText
                style={[styles.storyMeta, { color: theme.textSecondary }]}
              >
                {item.recap.actionsCompleted} completed{" "}
                {item.recap.actionsCompleted === 1 ? "action" : "actions"} ·{" "}
                {item.recap.consistency}% consistency
              </ThemedText>
            </View>
            <Feather
              name="chevron-right"
              size={20}
              color={theme.textSecondary}
            />
          </Pressable>
        )}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Feather name="book-open" size={36} color={theme.textSecondary} />
            <ThemedText
              style={[styles.emptyText, { color: theme.textSecondary }]}
            >
              Your first monthly story will appear here.
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
  storyCard: {
    minHeight: 82,
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    padding: Spacing.lg,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    marginBottom: Spacing.md,
  },
  monthIcon: {
    width: 42,
    height: 42,
    borderRadius: BorderRadius.full,
    backgroundColor: "rgba(0, 217, 255, 0.1)",
    alignItems: "center",
    justifyContent: "center",
  },
  storyCopy: {
    flex: 1,
  },
  storyTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: Spacing.sm,
  },
  storyTitle: {
    ...Typography.body,
    fontWeight: "600",
  },
  storyMeta: {
    ...Typography.caption,
    marginTop: 4,
  },
  inProgressBadge: {
    borderWidth: 1,
    borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
  },
  inProgressText: {
    ...Typography.caption,
    fontWeight: "600",
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
