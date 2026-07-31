# Widget hotfix 1.3.3

## Reported symptom

The Home Screen widget could remain on WidgetKit's gray placeholder instead of
showing the user's current progress.

## Diagnosis

The installed extension launched and could read the shared App Group, but iOS
logged that the former widget completion intent contained required parameters without defaults.
Widget buttons supply those values at runtime, yet WidgetKit still validates the
intent while registering and rendering the extension.

## Fix

- Give both `CompleteActionIntent` parameters explicit defaults and keep the
  widget-only intent out of Siri and Shortcuts discovery.
- Give the discoverable `LogNamedActionIntent` entity query a default result.
- Flush the shared `UserDefaults` snapshot before asking WidgetKit to reload.
- Log missing or invalid shared snapshots from the widget timeline provider.
- Add a native-contract regression test for the App Intent and App Group rules.
- Use direct action and completion language across the app, widget, Siri phrases,
  notifications, recaps, accessibility labels, AI prompts, website, and release
  copy with direct action and completion language.
- Write new widget taps to `pendingCompletions` while consuming the legacy
  `pendingVotes` queue during upgrades so no completion is lost.

## Verification

- Widget and native-contract tests: 11 passed.
- Full test suite: 253 passed.
- TypeScript, lint, accessibility, format, and release checks passed.
- The iOS simulator build compiled and signed `ResolutionWidget.appex`.
- The installed app wrote a valid `widgetData` snapshot to
  `group.com.resolutioncompanion.app`.
- The rebuilt extension launched without the prior missing-default App Intent
  warning.
- The signed production archive contains host and widget version 1.3.3, build
  78, with the same App Group entitlement, and was uploaded successfully to
  App Store Connect on July 31, 2026.
- Six conversion-focused 6.9-inch App Store screenshots were generated from
  the final Version 1.3.3 simulator build and checked at 1320 by 2868 pixels.
- The App Store subtitle, keywords, and promotional text retain the approved
  habit-tracker and goal-planner search positioning.

Visual Home Screen verification and a physical-device smoke test remain release
gates until they can be completed on an unlocked device.
