# Widget hotfix 1.3.3

## Reported symptom

The Home Screen widget could remain on WidgetKit's gray placeholder instead of
showing the user's current progress.

## Diagnosis

The installed extension launched and could read the shared App Group, but iOS
logged that `CastVoteIntent` contained required parameters without defaults.
Widget buttons supply those values at runtime, yet WidgetKit still validates the
intent while registering and rendering the extension.

## Fix

- Give both `CastVoteIntent` parameters explicit defaults and keep the
  widget-only intent out of Siri and Shortcuts discovery.
- Give the discoverable `LogNamedActionIntent` entity query a default result.
- Flush the shared `UserDefaults` snapshot before asking WidgetKit to reload.
- Log missing or invalid shared snapshots from the widget timeline provider.
- Add a native-contract regression test for the App Intent and App Group rules.

## Verification

- Widget and native-contract tests: 11 passed.
- Full test suite: 252 passed.
- TypeScript, lint, accessibility, format, and release checks passed.
- The iOS simulator build compiled and signed `ResolutionWidget.appex`.
- The installed app wrote a valid `widgetData` snapshot to
  `group.com.resolutioncompanion.app`.
- The rebuilt extension launched without the prior missing-default App Intent
  warning.

Visual Home Screen verification and a physical-device smoke test remain release
gates until they can be completed on an unlocked device.
