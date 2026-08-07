import { Platform, KeyboardAvoidingView as RNKeyboardAvoidingView } from "react-native";
import { KeyboardAvoidingView as ControllerKeyboardAvoidingView } from "react-native-keyboard-controller";

/**
 * KeyboardAvoidingView with correct keyboard metrics inside native form
 * sheets (the RN built-in mismeasures there and leaves inputs hidden behind
 * the keyboard). Falls back to the RN implementation on web.
 */
export const KeyboardAvoidingViewCompat =
  Platform.OS === "web" ? RNKeyboardAvoidingView : ControllerKeyboardAvoidingView;
