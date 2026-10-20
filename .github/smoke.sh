#!/usr/bin/env bash
# Opens the app twice (first start with setup, then the main screen) and fails on a crash.
set -u
pkg=com.yuxizhang.doomscroll
adb install -r app/build/outputs/apk/debug/app-debug.apk
adb shell pm grant $pkg android.permission.POST_NOTIFICATIONS || true
adb logcat -c
adb shell am start -W -n $pkg/.MainActivity
sleep 8
# Skip the setup so the main screen is drawn too.
adb shell run-as $pkg sh -c "mkdir -p shared_prefs && echo '<?xml version=\"1.0\" encoding=\"utf-8\"?><map><boolean name=\"setup_done\" value=\"true\" /></map>' > shared_prefs/doomscroll.xml"
adb shell am force-stop $pkg
# Turn the blocker on like on a real phone; it runs in the same process as the screen.
adb shell settings put secure enabled_accessibility_services $pkg/$pkg.BlockerService
adb shell settings put secure accessibility_enabled 1
sleep 5
adb shell am start -W -n $pkg/.MainActivity
sleep 10
# Open the settings app once, so the blocker's guard runs as well.
adb shell am start -a android.settings.SETTINGS
sleep 5
adb shell am start -W -n $pkg/.MainActivity
sleep 5
adb logcat -d > logcat.txt
if grep -q "FATAL EXCEPTION" logcat.txt; then
  # Annotations show up on the check run, where they are easy to read.
  crash=$(grep -A30 "FATAL EXCEPTION" logcat.txt | head -40 | sed 's/%/%25/g' | awk '{printf "%s%%0A", $0}')
  echo "::error title=App crashed::$crash"
  exit 1
fi
echo "No crash"
