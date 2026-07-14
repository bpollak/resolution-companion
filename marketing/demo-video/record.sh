#!/usr/bin/env bash
# One command -> one clean take.
#
#   ./record.sh onboarding      # Pass A: wiped app, live AI interview
#   ./record.sh tour            # Pass B: seeded account, feature tour
#   ./record.sh both
#
# simctl's recordVideo captures the DEVICE SCREEN only — no mouse cursor, no
# simulator chrome — which is why this beats screen-recording the window.
set -euo pipefail

export DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer
export PATH="$HOME/.maestro/bin:/opt/homebrew/opt/openjdk@17/bin:$PATH"
export JAVA_HOME="${JAVA_HOME:-/opt/homebrew/opt/openjdk@17}"

BUNDLE_ID=com.resolutioncompanion.app
SCENARIO="${SCENARIO:-side-hustle}"
cd "$(dirname "$0")"
mkdir -p takes

UDID="$(xcrun simctl list devices booted | grep -oE '\(([0-9A-F-]{36})\) \(Booted\)' | grep -oE '[0-9A-F-]{36}' | head -1)"
[ -n "$UDID" ] || { echo "No booted simulator."; exit 1; }
echo "device: $UDID"

take() {
  local name="$1" seed_mode="$2" flow="$3"
  echo ""
  echo "════ take: $name ════"

  xcrun simctl terminate "$UDID" "$BUNDLE_ID" 2>/dev/null || true
  node seed.mjs "$SCENARIO" "$seed_mode"

  # The Apple-standard clean status bar — 9:41, full signal, charged.
  xcrun simctl status_bar "$UDID" override \
    --time "9:41" --batteryState charged --batteryLevel 100 \
    --cellularBars 4 --wifiBars 3

  xcrun simctl io "$UDID" recordVideo --codec=h264 --force "takes/$name.mov" &
  local rec=$!
  sleep 2

  set +e
  maestro test --device "$UDID" "$flow"
  local rc=$?
  set -e

  sleep 1
  kill -INT "$rec" 2>/dev/null || true
  wait "$rec" 2>/dev/null || true

  if [ $rc -ne 0 ]; then
    echo "⚠️  flow exited $rc — take saved anyway, review it before trusting it"
  fi
  echo "→ takes/$name.mov"
}

case "${1:-both}" in
  onboarding) take onboarding fresh  flows/01-onboarding.yaml ;;
  tour)       take tour       mature flows/02-tour.yaml ;;
  both)
    take onboarding fresh  flows/01-onboarding.yaml
    take tour       mature flows/02-tour.yaml
    ;;
  *) echo "usage: $0 [onboarding|tour|both]"; exit 1 ;;
esac

echo ""
ls -lh takes/*.mov
