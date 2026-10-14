import React, { useEffect, useState } from "react";
import { AccessibilityInfo, StyleSheet } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  withSpring,
  withSequence,
  runOnJS,
  interpolate,
  Extrapolation,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { ThemedText } from "@/components/ThemedText";
import { Colors, Spacing, BorderRadius, Typography } from "@/constants/theme";
import { useTheme } from "@/hooks/useTheme";
import { toastDurationFor } from "@/lib/today-layout";

interface ToastProps {
  message: string;
  visible: boolean;
  onHide: () => void;
  /** Defaults to a reading-time estimate for the message. */
  duration?: number;
  type?: "success" | "info" | "warning";
  topOffset?: number;
}

const springConfig = {
  damping: 15,
  stiffness: 200,
  mass: 0.8,
};

export function Toast({
  message,
  visible,
  onHide,
  duration,
  type = "info",
  topOffset,
}: ToastProps) {
  const shownFor = duration ?? toastDurationFor(message);
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const finalTop =
    topOffset !== undefined ? topOffset : insets.top + Spacing.md;
  const opacity = useSharedValue(0);
  const translateY = useSharedValue(-30);
  const scale = useSharedValue(0.9);
  const [shouldRender, setShouldRender] = useState(false);

  useEffect(() => {
    if (visible) {
      AccessibilityInfo.announceForAccessibility(message);
      setShouldRender(true);
      opacity.value = withTiming(1, { duration: 200 });
      translateY.value = withSpring(0, springConfig);
      scale.value = withSequence(
        withSpring(1.02, { damping: 10, stiffness: 300 }),
        withSpring(1, springConfig),
      );

      const timer = setTimeout(() => {
        opacity.value = withTiming(0, { duration: 250 }, () => {
          runOnJS(setShouldRender)(false);
          runOnJS(onHide)();
        });
        translateY.value = withTiming(-30, { duration: 250 });
        scale.value = withTiming(0.9, { duration: 250 });
      }, shownFor);

      return () => clearTimeout(timer);
    } else {
      opacity.value = 0;
      translateY.value = -30;
      scale.value = 0.9;
    }
  }, [message, onHide, opacity, scale, shownFor, translateY, visible]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }, { scale: scale.value }],
  }));

  const glowStyle = useAnimatedStyle(() => {
    const glowColor =
      type === "success"
        ? theme.success
        : type === "warning"
          ? theme.warning
          : theme.accent;

    return {
      shadowColor: glowColor,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: interpolate(
        opacity.value,
        [0, 1],
        [0, 0.4],
        Extrapolation.CLAMP,
      ),
      shadowRadius: 12,
    };
  });

  const backgroundColor =
    type === "success"
      ? theme.success
      : type === "warning"
        ? theme.warning
        : Colors.dark.backgroundTertiary;

  const textColor =
    type === "success" || type === "warning"
      ? theme.buttonText
      : Colors.dark.text;

  const iconName: keyof typeof Feather.glyphMap =
    type === "success"
      ? "check-circle"
      : type === "warning"
        ? "alert-circle"
        : "info";

  if (!shouldRender) return null;

  return (
    <Animated.View
      pointerEvents="none"
      accessible
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      accessibilityLabel={message}
      style={[
        styles.container,
        animatedStyle,
        glowStyle,
        {
          top: finalTop,
          backgroundColor,
        },
      ]}
    >
      <Feather
        name={iconName}
        size={18}
        color={textColor}
        style={styles.icon}
      />
      <ThemedText style={[styles.text, { color: textColor }]}>
        {message}
      </ThemedText>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    left: Spacing.lg,
    right: Spacing.lg,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    borderRadius: BorderRadius.md,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1000,
  },
  icon: {
    marginRight: Spacing.sm,
  },
  // Long messages wrap inside the pill instead of running off its edge
  text: {
    ...Typography.body,
    fontWeight: "500",
    textAlign: "center",
    flexShrink: 1,
  },
});
