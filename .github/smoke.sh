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
adb shell am start -W -n $pkg/.MainActivity
sleep 10
adb logcat -d > logcat.txt
if grep -n -A40 "FATAL EXCEPTION" logcat.txt; then
  exit 1
fi
echo "No crash"
