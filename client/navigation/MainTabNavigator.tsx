import React, { useEffect, useMemo } from "react";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { PlatformPressable } from "@react-navigation/elements";
import { Feather, Ionicons } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import * as Haptics from "expo-haptics";
import { Platform, Pressable, StyleSheet, View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import { useTheme } from "@/hooks/useTheme";
import { Colors, Spacing, BorderRadius } from "@/constants/theme";
import { useApp } from "@/context/AppContext";
import { ThemedText } from "@/components/ThemedText";

import TodayScreen from "@/screens/TodayScreen";
import JourneyScreen from "@/screens/JourneyScreen";
import ReflectScreen from "@/screens/ReflectScreen";

// The focused tab's icon springs up a touch — a moment of life on selection
// that reads as "you landed here" beyond the color/fill change alone
function AnimatedTabIcon({
  focused,
  children,
}: {
  focused: boolean;
  children: React.ReactNode;
}) {
  const scale = useSharedValue(focused ? 1.12 : 1);
  useEffect(() => {
    scale.value = withSpring(focused ? 1.12 : 1, {
      damping: 12,
      stiffness: 220,
    });
  }, [focused, scale]);
  const style = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));
  return <Animated.View style={style}>{children}</Animated.View>;
}

export type MainTabParamList = {
  TodayTab: undefined;
  JourneyTab: undefined;
  ReflectTab: undefined;
};

const Tab = createBottomTabNavigator<MainTabParamList>();

// Tab button with a haptic tick on touch-down. `topSlop` extends the hit
// area upward — only the raised Coach circle needs it; giving it to the side
// tabs would steal taps from the bottom edge of screen content.
function makeTabBarButton(topSlop: number) {
  return function TabBarButton(
    props: React.ComponentProps<typeof PlatformPressable>,
  ) {
    return (
      <PlatformPressable
        {...props}
        hitSlop={topSlop ? { top: topSlop } : undefined}
        onPressIn={(ev) => {
          Haptics.selectionAsync();
          props.onPressIn?.(ev);
        }}
      />
    );
  };
}

// Profile is settings, not a daily destination: it lives behind this header
// gear on Today/Journey and opens as a modal stack screen
function ProfileHeaderButton({ navigation }: { navigation: any }) {
  const { theme } = useTheme();
  return (
    <Pressable
      onPress={() => navigation.navigate("Profile")}
      hitSlop={12}
      pressRetentionOffset={16}
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

// A two-line header keeps the current tab's context (date / persona) pinned
// even after the screen's in-body header scrolls away
function HeaderTitle({
  title,
  subtitle,
}: {
  title: string;
  subtitle?: string;
}) {
  const { theme } = useTheme();
  return (
    <View style={headerTitleStyles.container}>
      <ThemedText style={[headerTitleStyles.title, { color: theme.text }]}>
        {title}
      </ThemedText>
      {subtitle ? (
        <ThemedText
          numberOfLines={1}
          style={[headerTitleStyles.subtitle, { color: theme.textSecondary }]}
        >
          {subtitle}
        </ThemedText>
      ) : null}
    </View>
  );
}

const headerTitleStyles = StyleSheet.create({
  container: {
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontSize: 17,
    fontWeight: "600",
  },
  subtitle: {
    fontSize: 11,
    fontWeight: "500",
    marginTop: 1,
    maxWidth: 220,
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

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

export default function MainTabNavigator() {
  const { theme, isDark } = useTheme();
  const { actions, dailyLogs, persona } = useApp();

  // "Wednesday, July 8" — pinned under the Today title so the day stays
  // visible after the screen's own date header scrolls away. Formatted
  // manually rather than via toLocaleDateString(options), which Hermes on
  // iOS can return empty for when Intl data is absent.
  const todayLabel = useMemo(() => {
    const now = new Date();
    return `${DAYS_OF_WEEK[now.getDay()]}, ${MONTHS[now.getMonth()]} ${now.getDate()}`;
  }, []);

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
      detachInactiveScreens={false}
      screenOptions={{
        // All three tabs mount once at startup and stay attached: switching
        // must never stall the JS thread mid-mount (swallows the next tap) or
        // leave a scene detached (renders black). freezeOnBlur OFF — its
        // thaw-on-focus frame dropped the first tap, and the context value is
        // already memoized so blurred tabs don't thrash. detachInactiveScreens
        // OFF — with the scene `animation` below, react-native-screens has a
        // detach race that leaves the incoming tab a BLACK screen
        // (react-navigation #12755). We also drop the scene animation itself:
        // it caused that black screen, and the icon spring + haptic already
        // acknowledge the switch without any cross-fade.
        lazy: false,
        freezeOnBlur: false,
        // Default tab button: haptic ack on touch-down, no upward hitSlop
        // (that would steal the bottom edge of screen content). The Coach
        // tab overrides this with an upward slop for its raised circle.
        tabBarButton: makeTabBarButton(0),
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
              pointerEvents="none"
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
              pointerEvents="none"
            />
          ) : (
            <View
              pointerEvents="none"
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
          headerTitle: () => (
            <HeaderTitle title="Today" subtitle={todayLabel} />
          ),
          tabBarIcon: ({ color, size, focused }) => (
            <AnimatedTabIcon focused={focused}>
              <Ionicons
                name={focused ? "sunny" : "sunny-outline"}
                size={size}
                color={color}
              />
            </AnimatedTabIcon>
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
          headerTitle: () => (
            <HeaderTitle title="Journey" subtitle={persona?.name} />
          ),
          tabBarIcon: ({ color, size, focused }) => (
            <AnimatedTabIcon focused={focused}>
              <Ionicons
                name={focused ? "map" : "map-outline"}
                size={size}
                color={color}
              />
            </AnimatedTabIcon>
          ),
          headerRight: () => <ProfileHeaderButton navigation={navigation} />,
        })}
      />
      <Tab.Screen
        name="ReflectTab"
        component={ReflectScreen}
        options={{
          title: "Coach",
          // Only this tab's raised circle overhangs the bar, so only it gets
          // the upward hit-area extension
          tabBarButton: makeTabBarButton(12),
          // The circle stays a bright call-to-action on every tab; a ring in
          // the text color marks it as the current location when focused
          tabBarIcon: ({ focused }) => (
            <View
              style={{
                backgroundColor: Colors.dark.accent,
                width: 44,
                height: 44,
                borderRadius: BorderRadius.full,
                alignItems: "center",
                justifyContent: "center",
                marginTop: -8,
                borderWidth: focused ? 2 : 0,
                borderColor: theme.text,
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
