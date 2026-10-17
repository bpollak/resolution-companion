import React from "react";
import { StyleSheet, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useTheme } from "@/hooks/useTheme";
import { BorderRadius } from "@/constants/theme";

/**
 * The app's one completion control glyph: an open circle when pending, a
 * filled check when done. It is drawn only inside a row whose tap toggles
 * completion; status elsewhere uses a badge, progress bar, or text, so a
 * circle never means anything but "tap to check off".
 */
export function CompletionCheck({
  checked,
  size = 22,
}: {
  checked: boolean;
  size?: number;
}) {
  const { theme } = useTheme();
  return (
    <View
      accessible={false}
      style={[
        styles.base,
        { width: size, height: size },
        checked
          ? { backgroundColor: theme.success }
          : { borderWidth: 2, borderColor: theme.textSecondary },
      ]}
    >
      {checked ? (
        <Feather
          name="check"
          size={Math.round(size * 0.64)}
          color={theme.onStatus}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: BorderRadius.full,
    alignItems: "center",
    justifyContent: "center",
  },
});
