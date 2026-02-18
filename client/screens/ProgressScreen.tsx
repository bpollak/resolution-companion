import React, { useMemo } from "react";
import { View, ScrollView, StyleSheet, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { Feather } from "@expo/vector-icons";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";

import { useNavigation } from "@react-navigation/native";
import { useTheme } from "@/hooks/useTheme";
import { useApp } from "@/context/AppContext";
import { Colors, Spacing, Typography, BorderRadius } from "@/constants/theme";
import { ThemedText } from "@/components/ThemedText";
import { CircularProgress } from "@/components/CircularProgress";
import { ProgressBar } from "@/components/ProgressBar";

export default function ProgressScreen() {
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const tabBarHeight = useBottomTabBarHeight();
  const navigation = useNavigation<any>();
  const { theme, isDark } = useTheme();
  const { hasOnboarded, persona, benchmarks, actions, dailyLogs, personaAlignment } = useApp();

  const personaBenchmarks = useMemo(() => {
    return benchmarks.filter((b) => b.personaId === persona?.id);
  }, [benchmarks, persona?.id]);

  const personaCreatedDate = useMemo(() => {
    if (!persona?.createdAt) return null;
    const date = new Date(persona.createdAt);
    date.setHours(0, 0, 0, 0);
    return date;
  }, [persona?.createdAt]);

  const [expandedBenchmarks, setExpandedBenchmarks] = React.useState<Set<string>>(
    () => new Set(personaBenchmarks.map((b) => b.id))
  );

  React.useEffect(() => {
    setExpandedBenchmarks(new Set(personaBenchmarks.map((b) => b.id)));
  }, [personaBenchmarks]);

  const benchmarkProgress = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const trackableDays: string[] = [];
    for (let i = 0; i < 30; i++) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      date.setHours(0, 0, 0, 0);
      
      if (personaCreatedDate && date < personaCreatedDate) {
        continue;
      }
      
      if (date > today) {
        continue;
      }
      
      trackableDays.push(date.toISOString().split("T")[0]);
    }

    return personaBenchmarks.map((benchmark) => {
      const benchmarkActions = actions.filter((a) => a.benchmarkId === benchmark.id);
      if (benchmarkActions.length === 0) return { benchmark, actions: [], progress: 0 };

      let totalExpected = 0;
      let totalCompleted = 0;

      const actionProgress = benchmarkActions.map((action) => {
        let actionExpected = 0;
        let actionCompleted = 0;

        for (const dateStr of trackableDays) {
          const date = new Date(dateStr);
          const dayOfWeek = date.toLocaleDateString("en-US", { weekday: "long" });

          if (action.frequency.includes(dayOfWeek)) {
            actionExpected++;
            totalExpected++;
            const log = dailyLogs.find(
              (l) => l.actionId === action.id && l.logDate.split("T")[0] === dateStr
            );
            if (log?.status) {
              actionCompleted++;
              totalCompleted++;
            }
          }
        }

        return {
          action,
          progress: actionExpected > 0 ? Math.round((actionCompleted / actionExpected) * 100) : 0,
        };
      });

      return {
        benchmark,
        actions: actionProgress,
        progress: totalExpected > 0 ? Math.round((totalCompleted / totalExpected) * 100) : 0,
      };
    });
  }, [personaBenchmarks, actions, dailyLogs, personaCreatedDate]);

  const toggleExpand = (benchmarkId: string) => {
    setExpandedBenchmarks((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(benchmarkId)) {
        newSet.delete(benchmarkId);
      } else {
        newSet.add(benchmarkId);
      }
      return newSet;
    });
  };

  if (!hasOnboarded || !persona) {
    return (
      <View
        style={[
          styles.container,
          {
            backgroundColor: theme.backgroundRoot,
            paddingTop: headerHeight + Spacing.xl,
            paddingBottom: tabBarHeight + Spacing.xl,
          },
        ]}
      >
        <View style={styles.emptyContainer}>
          <Feather name="trending-up" size={64} color={theme.textSecondary} />
          <ThemedText style={[styles.emptyText, { color: theme.textSecondary }]}>
            Complete onboarding to track your progress
          </ThemedText>
        </View>
      </View>
    );
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.backgroundRoot }}
      contentContainerStyle={{
        paddingTop: headerHeight + Spacing.xl,
        paddingBottom: tabBarHeight + Spacing.xl,
        paddingHorizontal: Spacing.lg,
      }}
      scrollIndicatorInsets={{ bottom: insets.bottom }}
    >
      <View
        style={[
          styles.personaCard,
          { backgroundColor: isDark ? Colors.dark.backgroundDefault : Colors.light.backgroundDefault },
        ]}
      >
        <View style={styles.personaHeader}>
          <View style={styles.personaIcon}>
            <Feather name="target" size={24} color={Colors.dark.accent} />
          </View>
          <View style={styles.personaInfo}>
            <ThemedText style={[styles.personaLabel, { color: Colors.dark.accent }]}>
              Your Target Persona
            </ThemedText>
            <ThemedText style={styles.personaName}>{persona.name}</ThemedText>
          </View>
        </View>
        {persona.description ? (
          <ThemedText style={[styles.personaDescription, { color: theme.textSecondary }]}>
            {persona.description}
          </ThemedText>
        ) : null}
      </View>

      <View style={styles.alignmentSection}>
        <CircularProgress
          progress={personaAlignment}
          size={140}
          label="30-Day Alignment"
        />
      </View>

      <View style={styles.sectionHeader}>
        <ThemedText style={styles.sectionTitle}>Core Benchmarks</ThemedText>
        <Pressable
          onPress={() => navigation.navigate("BenchmarkEditor", {})}
          style={({ pressed }) => [
            styles.addButton,
            { opacity: pressed ? 0.8 : 1 },
          ]}
        >
          <Feather name="plus" size={20} color={Colors.dark.accent} />
          <ThemedText style={[styles.addButtonText, { color: Colors.dark.accent }]}>
            Add
          </ThemedText>
        </Pressable>
      </View>

      {benchmarkProgress.map(({ benchmark, actions: actionProgress, progress }) => (
        <View key={benchmark.id}>
          <Pressable
            onPress={() => toggleExpand(benchmark.id)}
            style={({ pressed }) => [
              styles.benchmarkCard,
              {
                backgroundColor: isDark
                  ? Colors.dark.backgroundDefault
                  : Colors.light.backgroundDefault,
                opacity: pressed ? 0.9 : 1,
              },
            ]}
          >
            <View style={styles.benchmarkHeader}>
              <View style={styles.benchmarkTitleRow}>
                <View
                  style={[
                    styles.statusDot,
                    {
                      backgroundColor:
                        progress >= 80
                          ? Colors.dark.success
                          : progress >= 50
                            ? Colors.dark.warning
                            : Colors.dark.error,
                    },
                  ]}
                />
                <ThemedText style={styles.benchmarkTitle}>{benchmark.title}</ThemedText>
              </View>
              <View style={styles.benchmarkMeta}>
                <Pressable
                  onPress={() => navigation.navigate("BenchmarkEditor", { benchmarkId: benchmark.id })}
                  hitSlop={8}
                  style={({ pressed }) => [
                    styles.editButton,
                    { 
                      opacity: pressed ? 0.7 : 1,
                      backgroundColor: "rgba(0, 217, 255, 0.15)",
                    },
                  ]}
                >
                  <Feather name="edit-2" size={14} color={Colors.dark.accent} />
                  <ThemedText style={styles.editButtonText}>Edit</ThemedText>
                </Pressable>
                <ThemedText style={[styles.benchmarkPercent, { color: progress >= 80 ? Colors.dark.success : progress >= 50 ? Colors.dark.accent : Colors.dark.warning }]}>
                  {progress}%
                </ThemedText>
                <Feather
                  name={expandedBenchmarks.has(benchmark.id) ? "chevron-up" : "chevron-down"}
                  size={20}
                  color={theme.textSecondary}
                />
              </View>
            </View>
            <ProgressBar progress={progress} />
          </Pressable>

          {expandedBenchmarks.has(benchmark.id) && actionProgress.length > 0 ? (
            <View style={styles.actionsContainer}>
              {actionProgress.map(({ action, progress: actionProg }) => (
                <View
                  key={action.id}
                  style={[
                    styles.actionCard,
                    {
                      backgroundColor: isDark
                        ? Colors.dark.backgroundSecondary
                        : Colors.light.backgroundSecondary,
                    },
                  ]}
                >
                  <View style={styles.actionHeader}>
                    <ThemedText style={styles.actionTitle}>{action.title}</ThemedText>
                    <ThemedText style={[styles.actionPercent, { color: theme.textSecondary }]}>
                      {actionProg}%
                    </ThemedText>
                  </View>
                  <View style={styles.actionDetails}>
                    <View style={styles.actionDetail}>
                      <Feather name="zap" size={14} color={Colors.dark.warning} />
                      <ThemedText style={[styles.actionDetailText, { color: theme.textSecondary }]}>
                        {action.kickstartVersion}
                      </ThemedText>
                    </View>
                    <View style={styles.actionDetail}>
                      <Feather name="link" size={14} color={theme.textSecondary} />
                      <ThemedText style={[styles.actionDetailText, { color: theme.textSecondary }]}>
                        {action.anchorLink}
                      </ThemedText>
                    </View>
                    <View style={styles.frequencyTags}>
                      {action.frequency.map((day) => (
                        <View
                          key={day}
                          style={[
                            styles.frequencyTag,
                            { backgroundColor: isDark ? Colors.dark.backgroundTertiary : Colors.light.backgroundTertiary },
                          ]}
                        >
                          <ThemedText style={[styles.frequencyTagText, { color: Colors.dark.accent }]}>
                            {day.slice(0, 3)}
                          </ThemedText>
                        </View>
                      ))}
                    </View>
                  </View>
                  <ProgressBar progress={actionProg} height={4} />
                </View>
              ))}
            </View>
          ) : null}
        </View>
      ))}
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
  personaCard: {
    padding: Spacing.lg,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.xl,
  },
  personaHeader: {
    flexDirection: "row",
    alignItems: "center",
  },
  personaIcon: {
    width: 48,
    height: 48,
    borderRadius: BorderRadius.full,
    backgroundColor: "rgba(0, 217, 255, 0.1)",
    alignItems: "center",
    justifyContent: "center",
    marginRight: Spacing.lg,
  },
  personaInfo: {
    flex: 1,
  },
  personaLabel: {
    ...Typography.caption,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: Spacing.xs,
  },
  personaName: {
    ...Typography.headline,
  },
  personaDescription: {
    ...Typography.body,
    marginTop: Spacing.md,
  },
  alignmentSection: {
    alignItems: "center",
    marginBottom: Spacing["2xl"],
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.lg,
  },
  sectionTitle: {
    ...Typography.headline,
  },
  addButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
  },
  addButtonText: {
    ...Typography.body,
    fontWeight: "500",
  },
  benchmarkCard: {
    padding: Spacing.lg,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.sm,
  },
  benchmarkHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.sm,
  },
  benchmarkTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: BorderRadius.full,
    marginRight: Spacing.sm,
  },
  benchmarkTitle: {
    ...Typography.body,
    fontWeight: "500",
    flex: 1,
  },
  benchmarkMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  editButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.sm,
  },
  editButtonText: {
    ...Typography.caption,
    color: Colors.dark.accent,
    fontWeight: "500",
  },
  benchmarkPercent: {
    ...Typography.headline,
  },
  actionsContainer: {
    marginLeft: Spacing.lg,
    marginBottom: Spacing.md,
  },
  actionCard: {
    padding: Spacing.md,
    borderRadius: BorderRadius.sm,
    marginBottom: Spacing.sm,
  },
  actionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.sm,
  },
  actionTitle: {
    ...Typography.small,
    fontWeight: "500",
    flex: 1,
  },
  actionPercent: {
    ...Typography.small,
    fontWeight: "600",
  },
  actionDetails: {
    gap: Spacing.xs,
    marginBottom: Spacing.sm,
  },
  actionDetail: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
  },
  actionDetailText: {
    ...Typography.caption,
    flex: 1,
  },
  frequencyTags: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.xs,
    marginTop: Spacing.xs,
  },
  frequencyTag: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.xs,
  },
  frequencyTagText: {
    ...Typography.caption,
    fontWeight: "500",
  },
});
