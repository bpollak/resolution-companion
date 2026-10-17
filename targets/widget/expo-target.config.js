/**
 * "Take the Next Step" widget target. Interactive (iOS 17 App Intents) home-screen
 * widget plus lock-screen accessories. The app-group entitlement is mirrored
 * automatically from ios.entitlements in app.json.
 *
 * @type {import('@bacons/apple-targets/app.plugin').Config}
 */
module.exports = {
  type: "widget",
  name: "ResolutionWidget",
  displayName: "Resolution Companion",
  bundleIdentifier: ".widget",
  // Interactive widget buttons (Button(intent:)) require iOS 17
  deploymentTarget: "17.0",
  // Light and dark match the app's theme (client/constants/theme.ts): the
  // light accent is the darker teal so it keeps contrast on white.
  colors: {
    $accent: { light: "#00677A", dark: "#00D9FF" },
    $widgetBackground: { light: "#FFFFFF", dark: "#000000" },
  },
  frameworks: ["SwiftUI", "WidgetKit", "AppIntents"],
  entitlements: {
    "com.apple.security.application-groups": [
      "group.com.resolutioncompanion.app",
    ],
  },
};
