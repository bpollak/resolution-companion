#!/bin/zsh
# Terminate the app, apply seed_demo.py to its AsyncStorage, leave it stopped.
export DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer
xcrun simctl terminate booted com.resolutioncompanion.app 2>/dev/null
sleep 1
D=$(xcrun simctl get_app_container booted com.resolutioncompanion.app data)
M=$(find "$D" -name manifest.json | head -1)
python3 "${0:A:h}/seed_demo.py" "$M"
