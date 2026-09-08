/**
 * "Cast Your Vote" widget target. Interactive (iOS 17 App Intents) home-screen
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
  colors: {
    $accent: "#00D9FF",
    $widgetBackground: "#0f0f1a",
  },
  frameworks: ["SwiftUI", "WidgetKit", "AppIntents"],
  entitlements: {
    "com.apple.security.application-groups": [
      "group.com.resolutioncompanion.app",
    ],
  },
};
