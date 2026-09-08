import "react-native";

// `delaysContentTouches` is a valid native iOS ScrollView prop that still
// works at runtime, but RN 0.81's hand-written type defs dropped it (they
// kept `canCancelContentTouches`). Merge it back so we can set it type-safely.
// Setting it false delivers touch-down to children immediately instead of the
// default ~150ms scroll-sniff delay — the fix for first-tap-eaten in lists.
declare module "react-native" {
  interface ScrollViewPropsIOS {
    delaysContentTouches?: boolean | undefined;
  }
}
