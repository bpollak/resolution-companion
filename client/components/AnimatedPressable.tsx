import React, { ReactNode } from "react";
import { StyleProp, ViewStyle, PressableProps } from "react-native";
import * as Haptics from "expo-haptics";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { scheduleOnRN } from "react-native-worklets";

interface AnimatedPressableProps {
  children: ReactNode;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
  disabled?: boolean;
  scaleValue?: number;
  hapticStyle?: "light" | "medium" | "heavy" | "success" | "selection" | "none";
  glowColor?: string;
  showGlow?: boolean;
}

const springConfig = {
  damping: 15,
  stiffness: 400,
  mass: 0.8,
};

export function AnimatedPressable({
  children,
  onPress,
  style,
  disabled = false,
  scaleValue = 0.97,
  hapticStyle = "light",
  glowColor,
  showGlow = false,
}: AnimatedPressableProps) {
  const scale = useSharedValue(1);
  const pressed = useSharedValue(0);

  const triggerHaptic = () => {
    if (hapticStyle === "none") return;
    
    switch (hapticStyle) {
      case "light":
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        break;
      case "medium":
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        break;
      case "heavy":
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
        break;
      case "success":
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        break;
      case "selection":
        Haptics.selectionAsync();
        break;
    }
  };

  const handlePress = () => {
    if (!disabled && onPress) {
      triggerHaptic();
      onPress();
    }
  };

  const gesture = Gesture.Tap()
    .enabled(!disabled)
    .onBegin(() => {
      scale.value = withSpring(scaleValue, springConfig);
      pressed.value = withTiming(1, { duration: 100 });
    })
    .onFinalize(() => {
      scale.value = withSpring(1, springConfig);
      pressed.value = withTiming(0, { duration: 200 });
    })
    .onEnd(() => {
      scheduleOnRN(handlePress);
    });

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: disabled ? 0.5 : 1,
  }));

  const glowStyle = useAnimatedStyle(() => {
    if (!showGlow || !glowColor) return {};
    
    return {
      shadowColor: glowColor,
      shadowOffset: { width: 0, height: 0 },
      shadowOpacity: pressed.value * 0.6,
      shadowRadius: pressed.value * 12,
    };
  });

  return (
    <GestureDetector gesture={gesture}>
      <Animated.View style={[style, animatedStyle, glowStyle]}>
        {children}
      </Animated.View>
    </GestureDetector>
  );
}
