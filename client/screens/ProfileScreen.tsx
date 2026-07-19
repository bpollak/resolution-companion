import React, {
  useCallback,
  useState,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
} from "react";
import {
  View,
  ScrollView,
  StyleSheet,
  Pressable,
  Alert,
  Platform,
  Switch,
  Linking,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";

import { useTheme } from "@/hooks/useTheme";
import { useThemeMode } from "@/context/ThemeContext";
import {
  getCelebrationStyle,
  getCoachTone,
  isRewardUnlocked,
  setCelebrationStyle,
  setCoachTone,
  type CelebrationStyle,
  type CoachTone,
} from "@/lib/rewards";
import { useApp } from "@/context/AppContext";
import { Colors, Spacing, Typography, BorderRadius } from "@/constants/theme";
import { ThemedText } from "@/components/ThemedText";
import { AIConsentModal } from "@/components/AIConsentModal";
import Constants from "expo-constants";

import { getApiUrl, getAuthHeaders } from "@/lib/query-client";
import { storage } from "@/lib/storage";
import {
  requestNotificationPermissions,
  scheduleDailyReminder,
  cancelDailyReminder,
  areNotificationsEnabled,
  getNotificationPermissionStatus,
  getResolvedReminderTime,
  setUserReminderBucket,
  REMINDER_BUCKETS,
  ReminderBucket,
  ResolvedReminderTime,
} from "@/lib/notifications";
import { computeStreak } from "@/lib/progress";
import { logger } from "@/lib/logger";
import { getProfileSubscriptionCopy } from "@/lib/subscription";
import { deletePrivateBackup } from "@/lib/icloud-backup";
import {
  getAppIconStyle,
  setAppIconStyle,
  supportsAlternateAppIcons,
  type AppIconStyle,
} from "@/lib/app-icon";

const springConfig = {
  damping: 15,
  stiffness: 400,
  mass: 0.8,
};

interface SettingsRowProps {
  icon: keyof typeof Feather.glyphMap;
  title: string;
  subtitle?: string;
  onPress: () => void;
  destructive?: boolean;
}

type ProfilePanel = "main" | "reminders" | "privacy" | "about";

function SettingsRow({
  icon,
  title,
  subtitle,
  onPress,
  destructive,
}: SettingsRowProps) {
  const { theme, isDark } = useTheme();
  const scale = useSharedValue(1);
  const chevronX = useSharedValue(0);

  const handlePressIn = () => {
    scale.value = withSpring(0.98, springConfig);
    chevronX.value = withSpring(3, springConfig);
  };

  const handlePressOut = () => {
    scale.value = withSpring(1, springConfig);
    chevronX.value = withSpring(0, springConfig);
  };

  const handlePress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onPress();
  };

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const chevronStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: chevronX.value }],
  }));

  return (
    <Pressable
      onPress={handlePress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      hitSlop={8}
      pressRetentionOffset={16}
      accessibilityRole="button"
      accessibilityLabel={subtitle ? `${title}. ${subtitle}` : title}
    >
      <Animated.View
        style={[
          styles.settingsRow,
          {
            backgroundColor: isDark
              ? Colors.dark.backgroundDefault
              : Colors.light.backgroundDefault,
          },
          animatedStyle,
        ]}
      >
        <View
          style={[
            styles.settingsIcon,
            {
              backgroundColor: destructive
                ? "rgba(255, 107, 107, 0.1)"
                : "rgba(0, 217, 255, 0.1)",
            },
          ]}
        >
          <Feather
            name={icon}
            size={20}
            color={destructive ? theme.error : theme.accent}
          />
        </View>
        <View style={styles.settingsContent}>
          <ThemedText
            style={[
              styles.settingsTitle,
              destructive && { color: theme.error },
            ]}
          >
            {title}
          </ThemedText>
          {subtitle ? (
            <ThemedText
              style={[styles.settingsSubtitle, { color: theme.textSecondary }]}
            >
              {subtitle}
            </ThemedText>
          ) : null}
        </View>
        <Animated.View style={chevronStyle}>
          <Feather name="chevron-right" size={20} color={theme.textSecondary} />
        </Animated.View>
      </Animated.View>
    </Pressable>
  );
}

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const navigation = useNavigation<any>();
  const scrollViewRef = useRef<ScrollView>(null);
  const { theme, isDark } = useTheme();
  const {
    hasOnboarded,
    persona,
    personas,
    benchmarks,
    actions,
    dailyLogs,
    personaAlignment,
    reflections,
    clearAllData,
    switchPersona,
    deletePersona,
    subscription,
    subscriptionVerificationStatus,
    verifySubscription,
    canAddPersona,
    monthlyReflectionCount,
    aiConsent,
    setAiConsent,
  } = useApp();

  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const [hasPermission, setHasPermission] = useState(false);
  const [showConsentModal, setShowConsentModal] = useState(false);
  const [reminderTime, setReminderTime] = useState<ResolvedReminderTime | null>(
    null,
  );
  const [activePanel, setActivePanel] = useState<ProfilePanel>("main");

  // A subscriber should never have to visit the paywall or press Restore just
  // to make Profile recognize an existing StoreKit entitlement.
  useFocusEffect(
    useCallback(() => {
      if (activePanel === "main") verifySubscription().catch(() => {});
    }, [activePanel, verifySubscription]),
  );

  useLayoutEffect(() => {
    const title =
      activePanel === "reminders"
        ? "Daily Reminder"
        : activePanel === "privacy"
          ? "Privacy & Data"
          : activePanel === "about"
            ? "About"
            : "Profile";
    const isMain = activePanel === "main";

    navigation.setOptions({
      title,
      headerLeft: () => (
        <Pressable
          onPress={() =>
            isMain ? navigation.goBack() : setActivePanel("main")
          }
          hitSlop={12}
          pressRetentionOffset={16}
          accessibilityRole="button"
          accessibilityLabel={isMain ? "Close profile" : "Back to profile"}
          style={({ pressed }) => [
            styles.headerButton,
            { opacity: pressed ? 0.6 : 1 },
          ]}
        >
          <Feather
            name={isMain ? "x" : "arrow-left"}
            size={22}
            color={theme.text}
          />
        </Pressable>
      ),
    });
  }, [activePanel, navigation, theme.text]);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      scrollViewRef.current?.scrollTo({ y: 0, animated: false });
    });
    return () => cancelAnimationFrame(frame);
  }, [activePanel]);

  // Dawn theme: a milestone reward — the Appearance row only exists once
  // it has been earned
  const {
    mode: themeMode,
    setMode: setThemeMode,
    accentStyle,
    setAccentStyle,
  } = useThemeMode();
  const [dawnUnlocked, setDawnUnlocked] = useState(false);
  const [directCoachUnlocked, setDirectCoachUnlocked] = useState(false);
  const [auroraUnlocked, setAuroraUnlocked] = useState(false);
  const [auroraIconUnlocked, setAuroraIconUnlocked] = useState(false);
  const [violetAccentUnlocked, setVioletAccentUnlocked] = useState(false);
  const [alternateIconsSupported, setAlternateIconsSupported] = useState(false);
  const [coachTone, setCoachToneState] = useState<CoachTone>("supportive");
  const [celebrationStyle, setCelebrationStyleState] =
    useState<CelebrationStyle>("classic");
  const [appIconStyle, setAppIconStyleState] =
    useState<AppIconStyle>("default");
  useEffect(() => {
    Promise.all([
      isRewardUnlocked("dawn-theme"),
      isRewardUnlocked("direct-coach-tone"),
      isRewardUnlocked("aurora-celebration"),
      isRewardUnlocked("aurora-app-icon"),
      isRewardUnlocked("violet-accent"),
      getCoachTone(),
      getCelebrationStyle(),
    ])
      .then(
        ([
          dawn,
          direct,
          aurora,
          auroraIcon,
          violetAccent,
          storedTone,
          storedCelebration,
        ]) => {
          setDawnUnlocked(dawn);
          setDirectCoachUnlocked(direct);
          setAuroraUnlocked(aurora);
          setAuroraIconUnlocked(auroraIcon);
          setVioletAccentUnlocked(violetAccent);
          setCoachToneState(direct ? storedTone : "supportive");
          setCelebrationStyleState(aurora ? storedCelebration : "classic");
          const supportsIcons = supportsAlternateAppIcons();
          setAlternateIconsSupported(supportsIcons);
          setAppIconStyleState(
            supportsIcons && auroraIcon ? getAppIconStyle() : "default",
          );
        },
      )
      .catch(() => {});
  }, []);

  // Streak feeds the reminder copy when the schedule is (re)created here
  const streakCount = useMemo(
    () => computeStreak(actions, dailyLogs).current,
    [actions, dailyLogs],
  );

  const reminderOptions = useMemo(
    () => ({
      streakCount,
      personaName: persona?.name,
      monthlyConsistency: personaAlignment,
      actions,
      dailyLogs,
    }),
    [actions, dailyLogs, persona?.name, personaAlignment, streakCount],
  );
  const subscriptionCopy = useMemo(
    () =>
      getProfileSubscriptionCopy(
        subscription,
        subscriptionVerificationStatus,
        Math.max(0, 10 - monthlyReflectionCount),
        Platform.OS === "ios" ? "App Store" : "store",
      ),
    [monthlyReflectionCount, subscription, subscriptionVerificationStatus],
  );

  const handleToggleAiConsent = (value: boolean) => {
    if (value) {
      // Re-enabling must go through the full disclosure, same as first use
      setShowConsentModal(true);
      return;
    }
    const message =
      "Your messages will no longer be sent to OpenAI, and AI onboarding and coaching check-ins will be unavailable until you turn this back on.";
    if (Platform.OS === "web") {
      if (window.confirm(message)) {
        setAiConsent(false);
      }
      return;
    }
    Alert.alert("Turn Off AI Data Sharing?", message, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Turn Off",
        style: "destructive",
        onPress: () => setAiConsent(false),
      },
    ]);
  };

  useEffect(() => {
    const checkNotificationStatus = async () => {
      const [enabled, permission, resolvedTime] = await Promise.all([
        areNotificationsEnabled(),
        getNotificationPermissionStatus(),
        getResolvedReminderTime(),
      ]);
      setNotificationsEnabled(enabled);
      setHasPermission(permission);
      setReminderTime(resolvedTime);
    };
    checkNotificationStatus();
  }, []);

  const handleSelectReminderBucket = async (bucket: ReminderBucket) => {
    if (Platform.OS === "web") return;
    Haptics.selectionAsync();
    await setUserReminderBucket(bucket, reminderOptions);
    setReminderTime(await getResolvedReminderTime());
  };

  const handleToggleNotifications = async (value: boolean) => {
    const isWeb = (Platform.OS as string) === "web";
    if (isWeb) {
      window.alert(
        "Notifications are only available in Expo Go on your mobile device.",
      );
      return;
    }

    if (value) {
      const resolved = await getResolvedReminderTime();
      // Give the user context before the OS permission prompt appears
      if (!hasPermission) {
        const proceed = await new Promise<boolean>((resolve) => {
          Alert.alert(
            "Daily Reminders",
            `Resolution Companion will send one reminder at ${resolved.label} on days you haven't finished your actions — it stays quiet once your day is complete. You can turn this off anytime.`,
            [
              {
                text: "Not Now",
                style: "cancel",
                onPress: () => resolve(false),
              },
              { text: "Enable", onPress: () => resolve(true) },
            ],
          );
        });
        if (!proceed) {
          setNotificationsEnabled(false);
          return;
        }
      }

      const granted = await requestNotificationPermissions();
      if (granted) {
        await scheduleDailyReminder(reminderOptions);
        setNotificationsEnabled(true);
        setHasPermission(true);
        setReminderTime(await getResolvedReminderTime());
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } else {
        setHasPermission(false);
        Alert.alert(
          "Permission Required",
          "Please enable notifications in your device settings to receive daily reminders.",
          [
            { text: "Cancel", style: "cancel" },
            {
              text: "Open Settings",
              onPress: async () => {
                try {
                  await Linking.openSettings();
                } catch {}
              },
            },
          ],
        );
      }
    } else {
      await cancelDailyReminder();
      setNotificationsEnabled(false);
      Haptics.selectionAsync();
    }
  };

  const showAlert = (
    title: string,
    message: string,
    buttons: { text: string; onPress?: () => void; style?: string }[],
  ) => {
    if (Platform.OS === "web") {
      const confirmButton = buttons.find(
        (b) => b.style === "destructive" || b.text !== "Cancel",
      );
      if (confirmButton && window.confirm(`${title}\n\n${message}`)) {
        confirmButton.onPress?.();
      }
    } else {
      Alert.alert(title, message, buttons as any);
    }
  };

  const handleAddNewPersona = () => {
    if (!canAddPersona()) {
      navigation.navigate("Subscription");
      return;
    }
    navigation.navigate("Onboarding");
  };

  const handleSwitchPersona = async (id: string) => {
    await switchPersona(id);
    if (Platform.OS !== "web") {
      Haptics.selectionAsync();
    }
  };

  const handleDeletePersona = (id: string, name: string) => {
    if (personas.length <= 1) {
      if (Platform.OS === "web") {
        window.alert(
          "You must have at least one persona. Create a new one first before deleting this one.",
        );
      } else {
        Alert.alert(
          "Cannot Delete",
          "You must have at least one persona. Create a new one first before deleting this one.",
        );
      }
      return;
    }

    showAlert(
      "Delete Persona",
      `Delete "${name}"? This will also remove all benchmarks, actions, and logs for this persona.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            await deletePersona(id);
            if (Platform.OS !== "web") {
              Haptics.notificationAsync(
                Haptics.NotificationFeedbackType.Warning,
              );
            }
          },
        },
      ],
    );
  };

  const handleClearData = () => {
    showAlert(
      "Clear All Data",
      "This will permanently delete all your data including all personas, benchmarks, actions, and logs. This cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete Everything",
          style: "destructive",
          onPress: async () => {
            await clearAllData();
            if (Platform.OS === "web") {
              window.alert("All your data has been deleted.");
            } else {
              Alert.alert("Data Cleared", "All your data has been deleted.");
            }
          },
        },
      ],
    );
  };

  const handleDeleteAccount = () => {
    showAlert(
      "Delete All My Data",
      "This will permanently delete ALL your data on this device, in your private iCloud backup, and on our servers (including subscription records). This cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete Everything",
          style: "destructive",
          onPress: async () => {
            try {
              const deviceId = await storage.getDeviceId();
              const response = await fetch(
                new URL(`/api/user-data/${deviceId}`, getApiUrl()).toString(),
                {
                  method: "DELETE",
                  headers: getAuthHeaders(),
                },
              );
              if (!response.ok) {
                throw new Error(`Server deletion failed (${response.status})`);
              }
              await deletePrivateBackup();
              await clearAllData();
              // Server record is gone — drop the device identity too so a
              // fresh one is minted on next launch. (Kept on failure below so
              // a retry can still target the server-side record.)
              await storage.removeDeviceId();
              if (Platform.OS === "web") {
                window.alert(
                  "All your data has been deleted from this device and our servers.",
                );
              } else {
                Alert.alert(
                  "Account Deleted",
                  "All your data has been deleted from this device and our servers.",
                );
              }
            } catch (error) {
              logger.error("Failed to delete server data:", error);
              await deletePrivateBackup();
              await clearAllData();
              if (Platform.OS === "web") {
                window.alert(
                  "Local data deleted. Server data deletion may have failed — please contact support if needed.",
                );
              } else {
                Alert.alert(
                  "Partial Deletion",
                  "Local data deleted. Server data deletion may have failed — please contact support if needed.",
                );
              }
            }
          },
        },
      ],
    );
  };

  const currentPersonaBenchmarks = benchmarks.filter(
    (b) => b.personaId === persona?.id,
  );
  const currentPersonaActions = actions.filter((a) =>
    currentPersonaBenchmarks.some((b) => b.id === a.benchmarkId),
  );

  const stats = [
    { label: "Milestones", value: currentPersonaBenchmarks.length },
    { label: "Actions", value: currentPersonaActions.length },
    { label: "Coaching", value: reflections.length },
  ];

  return (
    <ScrollView
      ref={scrollViewRef}
      delaysContentTouches={false}
      style={{ flex: 1, backgroundColor: theme.backgroundRoot }}
      contentContainerStyle={{
        paddingTop: headerHeight + Spacing.xl,
        // Stack screen now (no tab bar underneath) — pad by the home indicator
        paddingBottom: insets.bottom + Spacing.xl,
        paddingHorizontal: Spacing.lg,
      }}
      scrollIndicatorInsets={{ bottom: insets.bottom }}
    >
      {activePanel === "main" ? (
        <>
          {hasOnboarded && persona ? (
            <View
              style={[
                styles.profileCard,
                {
                  backgroundColor: isDark
                    ? Colors.dark.backgroundDefault
                    : Colors.light.backgroundDefault,
                },
              ]}
            >
              <View style={styles.avatarContainer}>
                <View
                  style={[styles.avatar, { backgroundColor: theme.accent }]}
                >
                  <Feather name="user" size={32} color={theme.buttonText} />
                </View>
              </View>
              <ThemedText style={styles.personaName}>{persona.name}</ThemedText>
              {persona.description ? (
                <ThemedText
                  style={[
                    styles.personaDescription,
                    { color: theme.textSecondary },
                  ]}
                >
                  {persona.description}
                </ThemedText>
              ) : null}

              <View style={styles.statsRow}>
                {stats.map((stat) => (
                  <View key={stat.label} style={styles.statItem}>
                    <ThemedText
                      style={[styles.statValue, { color: theme.accent }]}
                    >
                      {stat.value}
                    </ThemedText>
                    <ThemedText
                      style={[styles.statLabel, { color: theme.textSecondary }]}
                    >
                      {stat.label}
                    </ThemedText>
                  </View>
                ))}
              </View>
            </View>
          ) : (
            <View
              style={[
                styles.profileCard,
                {
                  backgroundColor: isDark
                    ? Colors.dark.backgroundDefault
                    : Colors.light.backgroundDefault,
                },
              ]}
            >
              <View style={styles.avatarContainer}>
                <View
                  style={[
                    styles.avatar,
                    { backgroundColor: theme.backgroundSecondary },
                  ]}
                >
                  <Feather name="user" size={32} color={theme.textSecondary} />
                </View>
              </View>
              <ThemedText
                style={[styles.notOnboarded, { color: theme.textSecondary }]}
              >
                Complete onboarding to define your persona
              </ThemedText>
              <Pressable
                onPress={() => navigation.navigate("Onboarding")}
                accessibilityRole="button"
                accessibilityLabel="Start journey"
                style={({ pressed }) => [
                  styles.onboardButton,
                  { backgroundColor: theme.accent },
                  { opacity: pressed ? 0.8 : 1 },
                ]}
              >
                <ThemedText
                  style={[
                    styles.onboardButtonText,
                    { color: theme.buttonText },
                  ]}
                >
                  Start Journey
                </ThemedText>
              </Pressable>
            </View>
          )}

          {personas.length > 0 ? (
            <>
              <View style={styles.sectionHeader}>
                <ThemedText style={styles.sectionTitle}>My Personas</ThemedText>
                <Pressable
                  onPress={handleAddNewPersona}
                  hitSlop={10}
                  accessibilityRole="button"
                  accessibilityLabel={
                    canAddPersona()
                      ? "Add a new persona"
                      : "Upgrade to Premium to add more personas"
                  }
                  style={({ pressed }) => [
                    styles.addPersonaButton,
                    { opacity: pressed ? 0.7 : 1 },
                  ]}
                >
                  {!canAddPersona() ? (
                    <Feather name="lock" size={14} color={theme.accent} />
                  ) : (
                    <Feather name="plus" size={18} color={theme.accent} />
                  )}
                  <ThemedText
                    style={[styles.addPersonaText, { color: theme.accent }]}
                  >
                    {canAddPersona() ? "Add" : "PRO"}
                  </ThemedText>
                </Pressable>
              </View>

              <View style={styles.personasList}>
                {personas.map((p) => (
                  <Pressable
                    key={p.id}
                    onPress={() => handleSwitchPersona(p.id)}
                    onLongPress={() => handleDeletePersona(p.id, p.name)}
                    accessibilityRole="button"
                    accessibilityLabel={`${p.name}${
                      p.id === persona?.id ? ", active persona" : ""
                    }`}
                    accessibilityHint="Switches to this persona. Long press to delete."
                    accessibilityState={{ selected: p.id === persona?.id }}
                    style={({ pressed }) => [
                      styles.personaItem,
                      {
                        backgroundColor: isDark
                          ? Colors.dark.backgroundDefault
                          : Colors.light.backgroundDefault,
                        borderColor:
                          p.id === persona?.id ? theme.accent : "transparent",
                        borderWidth: 2,
                        opacity: pressed ? 0.8 : 1,
                      },
                    ]}
                  >
                    <View
                      style={[
                        styles.personaItemAvatar,
                        {
                          backgroundColor:
                            p.id === persona?.id
                              ? theme.accent
                              : theme.backgroundSecondary,
                        },
                      ]}
                    >
                      <Feather
                        name="user"
                        size={16}
                        color={
                          p.id === persona?.id ? "#000000" : theme.textSecondary
                        }
                      />
                    </View>
                    <View style={styles.personaItemContent}>
                      <ThemedText style={styles.personaItemName}>
                        {p.name}
                      </ThemedText>
                      {p.id === persona?.id ? (
                        <ThemedText
                          style={[
                            styles.personaItemBadge,
                            { color: theme.accent },
                          ]}
                        >
                          Active
                        </ThemedText>
                      ) : null}
                    </View>
                    {p.id !== persona?.id ? (
                      <Pressable
                        onPress={() => handleDeletePersona(p.id, p.name)}
                        hitSlop={14}
                        accessibilityRole="button"
                        accessibilityLabel={`Delete persona ${p.name}`}
                        style={({ pressed }) => [
                          { opacity: pressed ? 0.5 : 1 },
                        ]}
                      >
                        <Feather name="trash-2" size={18} color={theme.error} />
                      </Pressable>
                    ) : null}
                  </Pressable>
                ))}
              </View>

              <View style={styles.personaHintContainer}>
                <View style={styles.personaHintRow}>
                  <Feather
                    name="repeat"
                    size={14}
                    color={theme.textSecondary}
                  />
                  <ThemedText
                    style={[styles.personaHint, { color: theme.textSecondary }]}
                  >
                    Tap to switch
                  </ThemedText>
                </View>
                <View style={styles.personaHintRow}>
                  <Feather
                    name="trash-2"
                    size={14}
                    color={theme.textSecondary}
                  />
                  <ThemedText
                    style={[styles.personaHint, { color: theme.textSecondary }]}
                  >
                    Tap trash icon to delete
                  </ThemedText>
                </View>
              </View>
            </>
          ) : null}

          <ThemedText style={[styles.sectionTitle, { marginTop: Spacing.xl }]}>
            Settings
          </ThemedText>

          <SettingsRow
            icon={
              subscriptionVerificationStatus === "checking"
                ? "refresh-cw"
                : subscription.isPremium
                  ? "check-circle"
                  : "zap"
            }
            title={subscriptionCopy.title}
            subtitle={subscriptionCopy.subtitle}
            onPress={() => {
              verifySubscription().catch(() => {});
              navigation.navigate("Subscription");
            }}
          />

          <SettingsRow
            icon="bell"
            title="Daily Reminder"
            subtitle={
              Platform.OS === "web"
                ? "Available on mobile"
                : notificationsEnabled
                  ? `On${reminderTime ? ` · ${reminderTime.label}` : ""}`
                  : "Off"
            }
            onPress={() => setActivePanel("reminders")}
          />

          <SettingsRow
            icon="shield"
            title="Privacy & Data"
            subtitle="AI sharing, iCloud backup, and data controls"
            onPress={() => setActivePanel("privacy")}
          />

          <SettingsRow
            icon="info"
            title="About"
            subtitle={`Version ${Constants.expoConfig?.version || "1.0.0"}`}
            onPress={() => setActivePanel("about")}
          />
        </>
      ) : null}

      {activePanel === "privacy" ? (
        <>
          <View style={styles.detailIntro}>
            <Feather name="shield" size={28} color={theme.accent} />
            <ThemedText style={styles.detailTitle}>
              Your data, your choice
            </ThemedText>
            <ThemedText
              style={[styles.detailBody, { color: theme.textSecondary }]}
            >
              Control what leaves this device, protect a private backup, or
              remove your data.
            </ThemedText>
          </View>

          <SettingsRow
            icon="cloud"
            title="Private iCloud Backup"
            subtitle="Protect local data in your own iCloud"
            onPress={() => navigation.navigate("DataBackup")}
          />
        </>
      ) : null}

      {activePanel === "reminders" ? (
        <>
          <View style={styles.detailIntro}>
            <Feather name="bell" size={28} color={theme.accent} />
            <ThemedText style={styles.detailTitle}>One useful nudge</ThemedText>
            <ThemedText
              style={[styles.detailBody, { color: theme.textSecondary }]}
            >
              Choose the part of your day that works best. We’ll name what is
              still open, skip rest days, and stay quiet after you finish.
            </ThemedText>
          </View>

          <View
            style={[
              styles.settingsRow,
              {
                backgroundColor: isDark
                  ? Colors.dark.backgroundDefault
                  : Colors.light.backgroundDefault,
              },
            ]}
          >
            <View
              style={[
                styles.settingsIcon,
                { backgroundColor: "rgba(0, 217, 255, 0.1)" },
              ]}
            >
              <Feather name="bell" size={20} color={theme.accent} />
            </View>
            <View style={styles.settingsContent}>
              <ThemedText style={styles.settingsTitle}>
                Daily Reminders
              </ThemedText>
              <ThemedText
                style={[
                  styles.settingsSubtitle,
                  { color: theme.textSecondary },
                ]}
              >
                {Platform.OS === "web"
                  ? "Available on mobile"
                  : notificationsEnabled && reminderTime
                    ? `Personalized reminder at ${reminderTime.label}${
                        reminderTime.source === "routine"
                          ? " — based on your routine"
                          : ""
                      } · quiet once your day is done`
                    : notificationsEnabled
                      ? "On"
                      : "Off"}
              </ThemedText>
            </View>
            <Switch
              value={notificationsEnabled}
              onValueChange={handleToggleNotifications}
              accessibilityRole="switch"
              accessibilityLabel="Daily reminders"
              accessibilityState={{
                checked: notificationsEnabled,
                disabled: Platform.OS === "web",
              }}
              trackColor={{
                false: theme.backgroundSecondary,
                true: theme.accent,
              }}
              thumbColor={notificationsEnabled ? "#FFFFFF" : "#FFFFFF"}
              disabled={Platform.OS === "web"}
            />
          </View>

          {notificationsEnabled && Platform.OS !== "web" ? (
            <View
              style={[
                styles.bucketRow,
                {
                  backgroundColor: isDark
                    ? Colors.dark.backgroundDefault
                    : Colors.light.backgroundDefault,
                },
              ]}
            >
              {(Object.keys(REMINDER_BUCKETS) as ReminderBucket[]).map(
                (bucket) => {
                  const selected = reminderTime?.bucket === bucket;
                  return (
                    <Pressable
                      key={bucket}
                      onPress={() => handleSelectReminderBucket(bucket)}
                      accessibilityRole="radio"
                      accessibilityState={{ selected }}
                      accessibilityLabel={`Remind me in the ${bucket}, at ${REMINDER_BUCKETS[bucket].label}`}
                      style={({ pressed }) => [
                        styles.bucketOption,
                        selected && {
                          backgroundColor: "rgba(0, 217, 255, 0.15)",
                          borderColor: theme.accent,
                        },
                        { opacity: pressed ? 0.7 : 1 },
                      ]}
                    >
                      <ThemedText
                        style={[
                          styles.bucketName,
                          selected && { color: theme.accent },
                        ]}
                      >
                        {REMINDER_BUCKETS[bucket].name}
                      </ThemedText>
                      <ThemedText
                        style={[
                          styles.bucketTime,
                          {
                            color: selected
                              ? theme.accent
                              : theme.textSecondary,
                          },
                        ]}
                      >
                        {REMINDER_BUCKETS[bucket].label}
                      </ThemedText>
                    </Pressable>
                  );
                },
              )}
            </View>
          ) : null}
        </>
      ) : null}

      {activePanel === "privacy" ? (
        <>
          <ThemedText style={[styles.sectionTitle, { marginTop: Spacing.xl }]}>
            AI & Coaching
          </ThemedText>
          <View
            style={[
              styles.settingsRow,
              {
                backgroundColor: isDark
                  ? Colors.dark.backgroundDefault
                  : Colors.light.backgroundDefault,
              },
            ]}
          >
            <View
              style={[
                styles.settingsIcon,
                { backgroundColor: "rgba(0, 217, 255, 0.1)" },
              ]}
            >
              <Feather name="message-circle" size={20} color={theme.accent} />
            </View>
            <View style={styles.settingsContent}>
              <ThemedText style={styles.settingsTitle}>
                AI Data Sharing
              </ThemedText>
              <ThemedText
                style={[
                  styles.settingsSubtitle,
                  { color: theme.textSecondary },
                ]}
              >
                {aiConsent
                  ? "On — chat messages are sent to OpenAI"
                  : "Off — AI coaching disabled"}
              </ThemedText>
            </View>
            <Switch
              value={aiConsent}
              onValueChange={handleToggleAiConsent}
              accessibilityRole="switch"
              accessibilityLabel="AI data sharing"
              accessibilityState={{ checked: aiConsent }}
              trackColor={{
                false: theme.backgroundSecondary,
                true: theme.accent,
              }}
              thumbColor="#FFFFFF"
            />
          </View>

          <ThemedText style={[styles.sectionTitle, { marginTop: Spacing.xl }]}>
            Your Data
          </ThemedText>

          {hasOnboarded ? (
            <SettingsRow
              icon="trash-2"
              title="Clear Local Data"
              subtitle="Delete local data and start fresh"
              onPress={handleClearData}
              destructive
            />
          ) : null}

          <SettingsRow
            icon="user-minus"
            title="Delete My Account & Data"
            subtitle="Remove all data from device and servers"
            onPress={handleDeleteAccount}
            destructive
          />
        </>
      ) : null}

      {activePanel === "about" ? (
        <>
          <View style={styles.detailIntro}>
            <Feather name="compass" size={30} color={theme.accent} />
            <ThemedText style={styles.detailTitle}>
              Resolution Companion
            </ThemedText>
            <ThemedText style={[styles.detailVersion, { color: theme.accent }]}>
              Version {Constants.expoConfig?.version || "1.0.0"}
            </ThemedText>
            <ThemedText
              style={[styles.detailBody, { color: theme.textSecondary }]}
            >
              An identity-based companion for becoming who you want to be, one
              small action at a time.
            </ThemedText>
          </View>

          {dawnUnlocked ||
          violetAccentUnlocked ||
          directCoachUnlocked ||
          auroraUnlocked ||
          (auroraIconUnlocked && alternateIconsSupported) ? (
            <ThemedText
              style={[styles.sectionTitle, { marginTop: Spacing.xl }]}
            >
              Earned Personalization
            </ThemedText>
          ) : null}

          {dawnUnlocked ? (
            <View
              style={[
                styles.settingsRow,
                {
                  backgroundColor: isDark
                    ? Colors.dark.backgroundDefault
                    : Colors.light.backgroundDefault,
                },
              ]}
            >
              <View
                style={[
                  styles.settingsIcon,
                  { backgroundColor: "rgba(255, 184, 0, 0.1)" },
                ]}
              >
                <Feather name="sunrise" size={20} color={theme.warning} />
              </View>
              <View style={styles.settingsContent}>
                <ThemedText style={styles.settingsTitle}>Dawn Theme</ThemedText>
                <ThemedText
                  style={[
                    styles.settingsSubtitle,
                    { color: theme.textSecondary },
                  ]}
                >
                  Unlocked by your first milestone
                </ThemedText>
              </View>
              <Switch
                value={themeMode === "dawn"}
                accessibilityRole="switch"
                accessibilityLabel="Toggle Dawn Theme"
                accessibilityHint="Switches between the Dawn light theme and Midnight dark theme"
                accessibilityState={{ checked: themeMode === "dawn" }}
                onValueChange={(value) => {
                  Haptics.selectionAsync();
                  setThemeMode(value ? "dawn" : "midnight");
                }}
                trackColor={{
                  false: theme.backgroundSecondary,
                  true: theme.warning,
                }}
                thumbColor="#FFFFFF"
              />
            </View>
          ) : null}

          {violetAccentUnlocked ? (
            <View
              style={[
                styles.settingsRow,
                {
                  backgroundColor: isDark
                    ? Colors.dark.backgroundDefault
                    : Colors.light.backgroundDefault,
                },
              ]}
            >
              <View
                style={[
                  styles.settingsIcon,
                  { backgroundColor: "rgba(191, 161, 255, 0.12)" },
                ]}
              >
                <Feather name="droplet" size={20} color="#BFA1FF" />
              </View>
              <View style={styles.settingsContent}>
                <ThemedText style={styles.settingsTitle}>
                  Violet Accent
                </ThemedText>
                <ThemedText
                  style={[
                    styles.settingsSubtitle,
                    { color: theme.textSecondary },
                  ]}
                >
                  A softer highlight across the app
                </ThemedText>
              </View>
              <Switch
                value={accentStyle === "violet"}
                accessibilityRole="switch"
                accessibilityLabel="Toggle Violet Accent"
                accessibilityHint="Changes interactive highlights between cyan and violet"
                accessibilityState={{ checked: accentStyle === "violet" }}
                onValueChange={(value) => {
                  Haptics.selectionAsync();
                  setAccentStyle(value ? "violet" : "cyan");
                }}
                trackColor={{
                  false: theme.backgroundSecondary,
                  true: "#BFA1FF",
                }}
                thumbColor="#FFFFFF"
              />
            </View>
          ) : null}

          {directCoachUnlocked ? (
            <View
              style={[
                styles.settingsRow,
                {
                  backgroundColor: isDark
                    ? Colors.dark.backgroundDefault
                    : Colors.light.backgroundDefault,
                },
              ]}
            >
              <View
                style={[
                  styles.settingsIcon,
                  { backgroundColor: "rgba(0, 217, 255, 0.1)" },
                ]}
              >
                <Feather name="message-circle" size={20} color={theme.accent} />
              </View>
              <View style={styles.settingsContent}>
                <ThemedText style={styles.settingsTitle}>
                  Direct Coach
                </ThemedText>
                <ThemedText
                  style={[
                    styles.settingsSubtitle,
                    { color: theme.textSecondary },
                  ]}
                >
                  Concise and candid, still kind
                </ThemedText>
              </View>
              <Switch
                value={coachTone === "direct"}
                accessibilityRole="switch"
                accessibilityLabel="Toggle Direct Coach"
                accessibilityState={{ checked: coachTone === "direct" }}
                onValueChange={(value) => {
                  const next: CoachTone = value ? "direct" : "supportive";
                  Haptics.selectionAsync();
                  setCoachToneState(next);
                  setCoachTone(next).catch(() => {});
                }}
                trackColor={{
                  false: theme.backgroundSecondary,
                  true: theme.accent,
                }}
                thumbColor="#FFFFFF"
              />
            </View>
          ) : null}

          {auroraUnlocked ? (
            <View
              style={[
                styles.settingsRow,
                {
                  backgroundColor: isDark
                    ? Colors.dark.backgroundDefault
                    : Colors.light.backgroundDefault,
                },
              ]}
            >
              <View
                style={[
                  styles.settingsIcon,
                  { backgroundColor: "rgba(155, 107, 255, 0.12)" },
                ]}
              >
                <Feather name="star" size={20} color="#9B6BFF" />
              </View>
              <View style={styles.settingsContent}>
                <ThemedText style={styles.settingsTitle}>
                  Aurora Celebrations
                </ThemedText>
                <ThemedText
                  style={[
                    styles.settingsSubtitle,
                    { color: theme.textSecondary },
                  ]}
                >
                  Violet-and-gold milestone moments
                </ThemedText>
              </View>
              <Switch
                value={celebrationStyle === "aurora"}
                accessibilityRole="switch"
                accessibilityLabel="Toggle Aurora Celebrations"
                accessibilityState={{ checked: celebrationStyle === "aurora" }}
                onValueChange={(value) => {
                  const next: CelebrationStyle = value ? "aurora" : "classic";
                  Haptics.selectionAsync();
                  setCelebrationStyleState(next);
                  setCelebrationStyle(next).catch(() => {});
                }}
                trackColor={{
                  false: theme.backgroundSecondary,
                  true: "#9B6BFF",
                }}
                thumbColor="#FFFFFF"
              />
            </View>
          ) : null}

          {auroraIconUnlocked && alternateIconsSupported ? (
            <View
              style={[
                styles.settingsRow,
                {
                  backgroundColor: isDark
                    ? Colors.dark.backgroundDefault
                    : Colors.light.backgroundDefault,
                },
              ]}
            >
              <View
                style={[
                  styles.settingsIcon,
                  { backgroundColor: "rgba(0, 217, 255, 0.1)" },
                ]}
              >
                <Feather name="compass" size={20} color={theme.accent} />
              </View>
              <View style={styles.settingsContent}>
                <ThemedText style={styles.settingsTitle}>
                  Aurora App Icon
                </ThemedText>
                <ThemedText
                  style={[
                    styles.settingsSubtitle,
                    { color: theme.textSecondary },
                  ]}
                >
                  Violet-and-cyan Home Screen compass
                </ThemedText>
              </View>
              <Switch
                value={appIconStyle === "aurora"}
                accessibilityRole="switch"
                accessibilityLabel="Toggle Aurora App Icon"
                accessibilityHint="Changes the Resolution Companion icon on your Home Screen"
                accessibilityState={{ checked: appIconStyle === "aurora" }}
                onValueChange={(value) => {
                  const next: AppIconStyle = value ? "aurora" : "default";
                  const previous = appIconStyle;
                  Haptics.selectionAsync();
                  setAppIconStyleState(next);
                  void setAppIconStyle(next).then((success) => {
                    if (!success) {
                      setAppIconStyleState(previous);
                      Alert.alert(
                        "Icon Not Changed",
                        "Resolution Companion couldn't change its Home Screen icon. Please try again.",
                      );
                    }
                  });
                }}
                trackColor={{
                  false: theme.backgroundSecondary,
                  true: theme.accent,
                }}
                thumbColor="#FFFFFF"
              />
            </View>
          ) : null}

          <ThemedText style={[styles.sectionTitle, { marginTop: Spacing.xl }]}>
            Legal
          </ThemedText>

          <SettingsRow
            icon="file-text"
            title="Privacy Policy"
            subtitle="How we handle your data"
            onPress={() =>
              Linking.openURL(new URL("/privacy", getApiUrl()).toString())
            }
          />

          <SettingsRow
            icon="book-open"
            title="Terms of Use"
            subtitle="App usage terms and conditions"
            onPress={() =>
              Linking.openURL(new URL("/terms", getApiUrl()).toString())
            }
          />
        </>
      ) : null}

      <AIConsentModal
        visible={showConsentModal}
        onAgree={async () => {
          setShowConsentModal(false);
          await setAiConsent(true);
        }}
        onDecline={() => setShowConsentModal(false)}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  headerButton: {
    paddingHorizontal: Spacing.sm,
  },
  detailIntro: {
    alignItems: "center",
    paddingVertical: Spacing.xl,
    paddingHorizontal: Spacing.lg,
    marginBottom: Spacing.md,
    gap: Spacing.sm,
  },
  detailTitle: {
    ...Typography.title,
    textAlign: "center",
  },
  detailVersion: {
    ...Typography.small,
    fontWeight: "600",
  },
  detailBody: {
    ...Typography.body,
    lineHeight: 23,
    textAlign: "center",
    maxWidth: 340,
  },
  profileCard: {
    padding: Spacing.xl,
    borderRadius: BorderRadius.md,
    alignItems: "center",
    marginBottom: Spacing.xl,
  },
  avatarContainer: {
    marginBottom: Spacing.lg,
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: BorderRadius.full,
    alignItems: "center",
    justifyContent: "center",
  },
  personaName: {
    ...Typography.title,
    textAlign: "center",
    marginBottom: Spacing.xs,
  },
  personaDescription: {
    ...Typography.body,
    textAlign: "center",
    marginBottom: Spacing.lg,
  },
  notOnboarded: {
    ...Typography.body,
    textAlign: "center",
    marginBottom: Spacing.lg,
  },
  statsRow: {
    flexDirection: "row",
    width: "100%",
    justifyContent: "space-around",
    paddingTop: Spacing.lg,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.1)",
  },
  statItem: {
    alignItems: "center",
  },
  statValue: {
    ...Typography.title,
  },
  statLabel: {
    ...Typography.caption,
  },
  onboardButton: {
    backgroundColor: Colors.dark.accent,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing["2xl"],
    borderRadius: BorderRadius.full,
  },
  onboardButtonText: {
    ...Typography.headline,
    color: "#000000",
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: Spacing.md,
  },
  sectionTitle: {
    ...Typography.headline,
  },
  addPersonaButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
  },
  addPersonaText: {
    ...Typography.small,
    fontWeight: "600",
  },
  personasList: {
    gap: Spacing.sm,
  },
  personaItem: {
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
  },
  personaItemAvatar: {
    width: 36,
    height: 36,
    borderRadius: BorderRadius.full,
    alignItems: "center",
    justifyContent: "center",
    marginRight: Spacing.md,
  },
  personaItemContent: {
    flex: 1,
  },
  personaItemName: {
    ...Typography.body,
    fontWeight: "500",
  },
  personaItemBadge: {
    ...Typography.caption,
    fontWeight: "600",
  },
  personaHintContainer: {
    flexDirection: "row",
    justifyContent: "center",
    gap: Spacing.xl,
    marginTop: Spacing.md,
    marginBottom: Spacing.lg,
  },
  personaHintRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
  },
  personaHint: {
    ...Typography.caption,
  },
  settingsRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.lg,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.sm,
  },
  settingsIcon: {
    width: 40,
    height: 40,
    borderRadius: BorderRadius.full,
    alignItems: "center",
    justifyContent: "center",
    marginRight: Spacing.md,
  },
  settingsContent: {
    flex: 1,
  },
  settingsTitle: {
    ...Typography.body,
    fontWeight: "500",
  },
  settingsSubtitle: {
    ...Typography.caption,
    marginTop: 2,
  },
  bucketRow: {
    flexDirection: "row",
    gap: Spacing.sm,
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.sm,
  },
  bucketOption: {
    flex: 1,
    alignItems: "center",
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    borderColor: "transparent",
  },
  bucketName: {
    ...Typography.small,
    fontWeight: "600",
  },
  bucketTime: {
    ...Typography.caption,
    marginTop: 2,
  },
});
