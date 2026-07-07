import React, { useMemo } from "react";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { Feather } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import { Platform, Pressable, StyleSheet, View } from "react-native";
import { useTheme } from "@/hooks/useTheme";
import { Colors, Spacing, BorderRadius } from "@/constants/theme";
import { useApp } from "@/context/AppContext";

import TodayScreen from "@/screens/TodayScreen";
import JourneyScreen from "@/screens/JourneyScreen";
import ReflectScreen from "@/screens/ReflectScreen";

export type MainTabParamList = {
  TodayTab: undefined;
  JourneyTab: undefined;
  ReflectTab: undefined;
};

const Tab = createBottomTabNavigator<MainTabParamList>();

// Profile is settings, not a daily destination: it lives behind this header
// gear on Today/Journey and opens as a modal stack screen
function ProfileHeaderButton({ navigation }: { navigation: any }) {
  const { theme } = useTheme();
  return (
    <Pressable
      onPress={() => navigation.navigate("Profile")}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel="Open profile and settings"
      style={({ pressed }) => [
        headerButtonStyles.button,
        { opacity: pressed ? 0.6 : 1 },
      ]}
    >
      <Feather name="settings" size={20} color={theme.text} />
    </Pressable>
  );
}

const headerButtonStyles = StyleSheet.create({
  button: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
  },
});

const DAYS_OF_WEEK = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

export default function MainTabNavigator() {
  const { theme, isDark } = useTheme();
  const { actions, dailyLogs } = useApp();

  // The badge is an invite, not a nag: it shows only before the first log of
  // the day, then hands off to the Today ring
  const { remainingTasksCount, hasLoggedToday } = useMemo(() => {
    const today = new Date();
    const dayOfWeek = DAYS_OF_WEEK[today.getDay()];
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

    const todayActions = actions.filter((action) =>
      action.frequency.includes(dayOfWeek),
    );
    const completedToday = dailyLogs.filter(
      (log) => log.logDate.split("T")[0] === todayStr && log.status,
    );
    const completedActionIds = new Set(
      completedToday.map((log) => log.actionId),
    );

    return {
      remainingTasksCount: todayActions.filter(
        (action) => !completedActionIds.has(action.id),
      ).length,
      hasLoggedToday: todayActions.some((action) =>
        completedActionIds.has(action.id),
      ),
    };
  }, [actions, dailyLogs]);

  return (
    <Tab.Navigator
      initialRouteName="TodayTab"
      screenOptions={{
        // Don't re-render blurred tabs on every context change; they thaw
        // with fresh state when focused again
        freezeOnBlur: true,
        tabBarActiveTintColor: Colors.dark.accent,
        tabBarInactiveTintColor: theme.tabIconDefault,
        tabBarStyle: {
          position: "absolute",
          backgroundColor: Platform.select({
            ios: "transparent",
            android: theme.backgroundRoot,
          }),
          borderTopWidth: 0,
          elevation: 0,
          height: Platform.select({ ios: 88, android: 70 }),
          paddingTop: Spacing.sm,
        },
        tabBarItemStyle: {
          paddingTop: Spacing.xs,
          paddingBottom: Platform.select({
            ios: Spacing.lg,
            android: Spacing.sm,
          }),
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: "500",
          marginTop: Spacing.xs,
        },
        tabBarIconStyle: {
          marginBottom: 2,
        },
        tabBarBackground: () =>
          Platform.OS === "ios" ? (
            <BlurView
              intensity={100}
              tint={isDark ? "dark" : "light"}
              style={StyleSheet.absoluteFill}
            />
          ) : null,
        headerShown: true,
        headerTransparent: Platform.OS === "ios",
        headerStyle: {
          backgroundColor: Platform.select({
            ios: "transparent",
            android: theme.backgroundRoot,
            default: theme.backgroundRoot,
          }),
        },
        headerBackground: () =>
          Platform.OS === "ios" ? (
            <BlurView
              intensity={100}
              tint={isDark ? "dark" : "light"}
              style={StyleSheet.absoluteFill}
            />
          ) : (
            <View
              style={[
                StyleSheet.absoluteFill,
                { backgroundColor: theme.backgroundRoot },
              ]}
            />
          ),
        headerTitleStyle: {
          color: theme.text,
          fontWeight: "600",
        },
      }}
    >
      <Tab.Screen
        name="TodayTab"
        component={TodayScreen}
        options={({ navigation }) => ({
          title: "Today",
          tabBarIcon: ({ color, size }) => (
            <Feather name="sun" size={size} color={color} />
          ),
          headerRight: () => <ProfileHeaderButton navigation={navigation} />,
          tabBarBadge:
            !hasLoggedToday && remainingTasksCount > 0
              ? remainingTasksCount
              : undefined,
          tabBarBadgeStyle: {
            backgroundColor: "#FF6B9D",
            color: "#FFFFFF",
            fontSize: 11,
            fontWeight: "600",
            minWidth: 18,
            height: 18,
          },
        })}
      />
      <Tab.Screen
        name="JourneyTab"
        component={JourneyScreen}
        options={({ navigation }) => ({
          title: "Journey",
          tabBarIcon: ({ color, size }) => (
            <Feather name="map" size={size} color={color} />
          ),
          headerRight: () => <ProfileHeaderButton navigation={navigation} />,
        })}
      />
      <Tab.Screen
        name="ReflectTab"
        component={ReflectScreen}
        options={{
          title: "Coach",
          tabBarIcon: ({ color, size }) => (
            <View
              style={{
                backgroundColor: Colors.dark.accent,
                width: 44,
                height: 44,
                borderRadius: BorderRadius.full,
                alignItems: "center",
                justifyContent: "center",
                marginTop: -8,
              }}
            >
              <Feather name="edit-3" size={20} color="#000000" />
            </View>
          ),
        }}
      />
    </Tab.Navigator>
  );
}
