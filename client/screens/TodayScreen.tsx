import React, { useMemo, useEffect } from "react";
import { View, ScrollView, StyleSheet, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { useNavigation } from "@react-navigation/native";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withRepeat,
  withSequence,
  interpolate,
  Easing,
  withTiming,
} from "react-native-reanimated";

import { useTheme } from "@/hooks/useTheme";
import { useApp } from "@/context/AppContext";
import { Colors, Spacing, Typography, BorderRadius } from "@/constants/theme";
import { ThemedText } from "@/components/ThemedText";
import { CircularProgress } from "@/components/CircularProgress";
import { ActionCard } from "@/components/ActionCard";

function getLocalDateString(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

const springConfig = {
  damping: 15,
  stiffness: 400,
  mass: 0.8,
};

function StylizedAppLogo() {
  const rotation = useSharedValue(0);
  const pulse = useSharedValue(1);
  const glow = useSharedValue(0.3);

  useEffect(() => {
    rotation.value = withRepeat(
      withTiming(360, { duration: 20000, easing: Easing.linear }),
      -1,
      false
    );
    pulse.value = withRepeat(
      withSequence(
        withTiming(1.05, { duration: 2000, easing: Easing.inOut(Easing.ease) }),
        withTiming(1, { duration: 2000, easing: Easing.inOut(Easing.ease) })
      ),
      -1,
      true
    );
    glow.value = withRepeat(
      withSequence(
        withTiming(0.6, { duration: 2000, easing: Easing.inOut(Easing.ease) }),
        withTiming(0.3, { duration: 2000, easing: Easing.inOut(Easing.ease) })
      ),
      -1,
      true
    );
  }, []);

  const outerRingStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.value}deg` }, { scale: pulse.value }],
  }));

  const glowStyle = useAnimatedStyle(() => ({
    opacity: glow.value,
  }));

  return (
    <View style={logoStyles.container}>
      <Animated.View style={[logoStyles.glowOuter, glowStyle]} />
      <Animated.View style={[logoStyles.outerRing, outerRingStyle]}>
        <View style={logoStyles.gradientDot1} />
        <View style={logoStyles.gradientDot2} />
        <View style={logoStyles.gradientDot3} />
        <View style={logoStyles.gradientDot4} />
      </Animated.View>
      <View style={logoStyles.innerCircle}>
        <View style={logoStyles.compassCore}>
          <Feather name="compass" size={40} color="#FFFFFF" />
        </View>
      </View>
    </View>
  );
}

const logoStyles = StyleSheet.create({
  container: {
    width: 120,
    height: 120,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Spacing["2xl"],
  },
  glowOuter: {
    position: "absolute",
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: Colors.dark.accent,
  },
  outerRing: {
    position: "absolute",
    width: 110,
    height: 110,
    borderRadius: 55,
    borderWidth: 2,
    borderColor: "rgba(0, 217, 255, 0.4)",
    alignItems: "center",
    justifyContent: "center",
  },
  gradientDot1: {
    position: "absolute",
    top: -4,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.dark.accent,
  },
  gradientDot2: {
    position: "absolute",
    right: -4,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#FF6B9D",
  },
  gradientDot3: {
    position: "absolute",
    bottom: -4,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#9B6BFF",
  },
  gradientDot4: {
    position: "absolute",
    left: -4,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#6BFFB8",
  },
  innerCircle: {
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: "rgba(0, 217, 255, 0.2)",
    alignItems: "center",
    justifyContent: "center",
  },
  compassCore: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: "rgba(0, 217, 255, 0.3)",
    alignItems: "center",
    justifyContent: "center",
  },
});

function AnimatedStartButton({ onPress }: { onPress: () => void }) {
  const scale = useSharedValue(1);
  const arrowX = useSharedValue(0);

  const handlePressIn = () => {
    scale.value = withSpring(0.96, springConfig);
    arrowX.value = withSpring(4, springConfig);
  };

  const handlePressOut = () => {
    scale.value = withSpring(1, springConfig);
    arrowX.value = withSpring(0, springConfig);
  };

  const handlePress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onPress();
  };

  const buttonStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const arrowStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: arrowX.value }],
  }));

  return (
    <Pressable
      onPress={handlePress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
    >
      <Animated.View style={[styles.startButton, buttonStyle]}>
        <ThemedText style={styles.startButtonText}>
          Start Your Journey
        </ThemedText>
        <Animated.View style={arrowStyle}>
          <Feather name="arrow-right" size={20} color="#000000" />
        </Animated.View>
      </Animated.View>
    </Pressable>
  );
}

export default function TodayScreen() {
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const tabBarHeight = useBottomTabBarHeight();
  const navigation = useNavigation<any>();
  const { theme, isDark } = useTheme();
  const {
    hasOnboarded,
    persona,
    benchmarks,
    actions,
    dailyLogs,
    personaAlignment,
    toggleDailyLog,
  } = useApp();
  

  const today = new Date();
  const dayOfWeek = today.toLocaleDateString("en-US", { weekday: "long" });
  const dateString = today.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  const personaBenchmarkIds = useMemo(() => {
    return benchmarks.filter((b) => b.personaId === persona?.id).map((b) => b.id);
  }, [benchmarks, persona?.id]);

  const todayActions = useMemo(() => {
    return actions
      .filter((action) => personaBenchmarkIds.includes(action.benchmarkId))
      .filter((action) => action.frequency.includes(dayOfWeek));
  }, [actions, personaBenchmarkIds, dayOfWeek]);

  const todayDateStr = getLocalDateString(today);

  const getLogForAction = (actionId: string) => {
    return dailyLogs.find(
      (log) => {
        const logDateStr = log.logDate.includes("T") ? log.logDate.split("T")[0] : log.logDate;
        return log.actionId === actionId && logDateStr === todayDateStr;
      }
    ) || null;
  };

  const getBenchmarkForAction = (action: typeof actions[0]) => {
    return benchmarks.find((b) => b.id === action.benchmarkId);
  };

  const handleToggle = async (actionId: string) => {
    try {
      await toggleDailyLog(actionId, todayDateStr);
    } catch (error) {
      console.error("Failed to toggle action:", error);
    }
  };

  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowDayOfWeek = tomorrow.toLocaleDateString("en-US", { weekday: "long" });
  
  const tomorrowActions = useMemo(() => {
    return actions
      .filter((action) => personaBenchmarkIds.includes(action.benchmarkId))
      .filter((action) => action.frequency.includes(tomorrowDayOfWeek));
  }, [actions, personaBenchmarkIds, tomorrowDayOfWeek]);

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
          <StylizedAppLogo />
          <ThemedText style={styles.emptyTitle}>
            Begin Your Evolution
          </ThemedText>
          <ThemedText style={[styles.emptyText, { color: theme.textSecondary }]}>
            Define who you are becoming and build the habits that will get you there.
          </ThemedText>
          <AnimatedStartButton onPress={() => navigation.navigate("Onboarding")} />
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
      <View style={styles.header}>
        <ThemedText style={[styles.personaLabel, { color: Colors.dark.accent }]}>
          Becoming
        </ThemedText>
        <ThemedText style={styles.personaName}>{persona.name}</ThemedText>
      </View>

      <View style={styles.alignmentContainer}>
        <CircularProgress
          progress={personaAlignment}
          size={160}
          label="Persona Alignment"
        />
        <ThemedText style={[styles.alignmentHint, { color: theme.textSecondary }]}>
          Based on your daily action completion
        </ThemedText>
      </View>

      <View style={styles.dateContainer}>
        <ThemedText style={[styles.dateText, { color: theme.textSecondary }]}>
          {dateString}
        </ThemedText>
        <View style={styles.actionCount}>
          <ThemedText style={[styles.actionCountText, { color: theme.textSecondary }]}>
            {todayActions.length} action{todayActions.length !== 1 ? "s" : ""} today
          </ThemedText>
        </View>
      </View>

      {todayActions.length === 0 ? (
        <View style={[styles.noActionsCard, { backgroundColor: isDark ? Colors.dark.backgroundDefault : Colors.light.backgroundDefault }]}>
          <Feather name="check-circle" size={32} color={Colors.dark.success} />
          <ThemedText style={styles.noActionsText}>
            No actions scheduled for today. Rest and recharge!
          </ThemedText>
          {tomorrowActions.length > 0 ? (
            <Pressable
              onPress={() => {
                navigation.navigate("CalendarTab" as never);
              }}
              style={({ pressed }) => [styles.tomorrowLink, { opacity: pressed ? 0.7 : 1 }]}
            >
              <Feather name="calendar" size={16} color={Colors.dark.accent} />
              <ThemedText style={[styles.tomorrowLinkText, { color: Colors.dark.accent }]}>
                {tomorrowActions.length} action{tomorrowActions.length !== 1 ? "s" : ""} tomorrow
              </ThemedText>
              <Feather name="chevron-right" size={16} color={Colors.dark.accent} />
            </Pressable>
          ) : null}
        </View>
      ) : (
        todayActions.map((action) => {
          const benchmark = getBenchmarkForAction(action);
          return (
            <ActionCard
              key={action.id}
              action={action}
              log={getLogForAction(action.id)}
              onToggle={() => handleToggle(action.id)}
              benchmarkTitle={benchmark?.title}
            />
          );
        })
      )}
      
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
    paddingHorizontal: Spacing.xl,
  },
  emptyIcon: {
    marginBottom: Spacing["2xl"],
  },
  phoenixIconContainer: {
    width: 80,
    height: 80,
    borderRadius: BorderRadius.full,
    backgroundColor: "rgba(0, 217, 255, 0.15)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Spacing["2xl"],
  },
  emptyTitle: {
    ...Typography.title,
    textAlign: "center",
    marginBottom: Spacing.md,
  },
  emptyText: {
    ...Typography.body,
    textAlign: "center",
    marginBottom: Spacing["3xl"],
  },
  startButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.dark.accent,
    paddingVertical: Spacing.lg,
    paddingHorizontal: Spacing["2xl"],
    borderRadius: BorderRadius.full,
    gap: Spacing.sm,
  },
  startButtonText: {
    ...Typography.headline,
    color: "#000000",
  },
  header: {
    marginBottom: Spacing.xl,
  },
  personaLabel: {
    ...Typography.caption,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: Spacing.xs,
  },
  personaName: {
    ...Typography.title,
  },
  alignmentContainer: {
    alignItems: "center",
    marginBottom: Spacing["3xl"],
  },
  alignmentHint: {
    ...Typography.small,
    marginTop: Spacing.sm,
    textAlign: "center",
  },
  dateContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.lg,
  },
  dateText: {
    ...Typography.headline,
  },
  actionCount: {},
  actionCountText: {
    ...Typography.small,
  },
  noActionsCard: {
    alignItems: "center",
    padding: Spacing["2xl"],
    borderRadius: BorderRadius.md,
    gap: Spacing.md,
  },
  noActionsText: {
    ...Typography.body,
    textAlign: "center",
  },
  tomorrowLink: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    marginTop: Spacing.md,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
  },
  tomorrowLinkText: {
    ...Typography.small,
    fontWeight: "600",
  },
});
