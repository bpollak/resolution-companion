#!/bin/zsh
# Usage: record-take.sh <flow.yaml> <out-dir>
# Records the booted simulator while Maestro drives a flow; keeps the
# recording start time so tap overlays can be synced from maestro.log.
set -u
flow=$1; out=$2; mkdir -p $out
export DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer
export JAVA_HOME=/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home
export PATH=$JAVA_HOME/bin:$PATH
# A stale override can stick at an old time; clear before re-applying
xcrun simctl status_bar booted clear >/dev/null 2>&1
xcrun simctl status_bar booted override --time "9:41" --batteryState charged --batteryLevel 100 --cellularBars 4 --wifiBars 3 >/dev/null 2>&1
xcrun simctl io booted recordVideo --codec=h264 --force $out/screen.mp4 > $out/record.log 2>&1 &
rec=$!
# recordVideo prints "Recording started" once frames flow
for i in {1..50}; do grep -q "Recording started" $out/record.log && break; sleep 0.1; done
python3 -c 'import time;print(int(time.time()*1000))' > $out/start_ms
~/.maestro/bin/maestro test $flow --debug-output $out/debug > $out/console.log 2>&1
rc=$?
sleep 1
kill -INT $rec; wait $rec
echo "maestro exit $rc"; tail -3 $out/console.log
