import React, { useMemo } from "react";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { Feather } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import { Platform, StyleSheet, View } from "react-native";
import { useTheme } from "@/hooks/useTheme";
import { Colors, Spacing, BorderRadius } from "@/constants/theme";
import { useApp } from "@/context/AppContext";

import TodayScreen from "@/screens/TodayScreen";
import CalendarScreen from "@/screens/CalendarScreen";
import ReflectScreen from "@/screens/ReflectScreen";
import ProgressScreen from "@/screens/ProgressScreen";
import ProfileScreen from "@/screens/ProfileScreen";

export type MainTabParamList = {
  TodayTab: undefined;
  CalendarTab: undefined;
  ReflectTab: undefined;
  ProgressTab: undefined;
  ProfileTab: undefined;
};

const Tab = createBottomTabNavigator<MainTabParamList>();

const DAYS_OF_WEEK = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export default function MainTabNavigator() {
  const { theme, isDark } = useTheme();
  const { actions, dailyLogs } = useApp();

  const remainingTasksCount = useMemo(() => {
    const today = new Date();
    const dayOfWeek = DAYS_OF_WEEK[today.getDay()];
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
    
    const todayActions = actions.filter((action) => action.frequency.includes(dayOfWeek));
    const completedToday = dailyLogs.filter(
      (log) => log.logDate.split("T")[0] === todayStr && log.status
    );
    const completedActionIds = new Set(completedToday.map((log) => log.actionId));
    
    return todayActions.filter((action) => !completedActionIds.has(action.id)).length;
  }, [actions, dailyLogs]);

  return (
    <Tab.Navigator
      initialRouteName="TodayTab"
      screenOptions={{
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
          paddingBottom: Platform.select({ ios: Spacing.lg, android: Spacing.sm }),
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
            <View style={[StyleSheet.absoluteFill, { backgroundColor: theme.backgroundRoot }]} />
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
        options={{
          title: "Today",
          tabBarIcon: ({ color, size }) => (
            <Feather name="sun" size={size} color={color} />
          ),
          tabBarBadge: remainingTasksCount > 0 ? remainingTasksCount : undefined,
          tabBarBadgeStyle: {
            backgroundColor: "#FF6B9D",
            color: "#FFFFFF",
            fontSize: 11,
            fontWeight: "600",
            minWidth: 18,
            height: 18,
          },
        }}
      />
      <Tab.Screen
        name="CalendarTab"
        component={CalendarScreen}
        options={{
          title: "Calendar",
          tabBarIcon: ({ color, size }) => (
            <Feather name="calendar" size={size} color={color} />
          ),
        }}
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
      <Tab.Screen
        name="ProgressTab"
        component={ProgressScreen}
        options={{
          title: "Progress",
          tabBarIcon: ({ color, size }) => (
            <Feather name="trending-up" size={size} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="ProfileTab"
        component={ProfileScreen}
        options={{
          title: "Profile",
          tabBarIcon: ({ color, size }) => (
            <Feather name="user" size={size} color={color} />
          ),
        }}
      />
    </Tab.Navigator>
  );
}
