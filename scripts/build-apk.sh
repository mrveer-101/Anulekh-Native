#!/usr/bin/env bash
set -e

# ========================================================
# Anulekh Unlimited Local Android APK Builder
# Zero EAS Cloud Quota Limits - 100% Free Local Compiles
# ========================================================

export JAVA_HOME="/usr/lib/jvm/java-17-openjdk-amd64"
export ANDROID_HOME="/home/ubuntu/android-sdk"
export ANDROID_SDK_ROOT="/home/ubuntu/android-sdk"
export PATH="$PATH:$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools:$ANDROID_HOME/build-tools/35.0.0"

MODE="${1:-release}"
APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUTPUT_DIR="$APP_DIR/builds"
mkdir -p "$OUTPUT_DIR"

echo "=========================================="
echo " Anulekh Local Android Build ($MODE)"
echo " Java: $($JAVA_HOME/bin/java -version 2>&1 | head -n 1)"
echo " Android SDK: $ANDROID_HOME"
echo " Working Dir: $APP_DIR"
echo "=========================================="

cd "$APP_DIR"

# 1. Ensure native android folder exists
if [ ! -d "$APP_DIR/android" ]; then
  echo "Generating native android project with Expo prebuild..."
  npx expo prebuild --platform android --no-install
fi

# 2. Build APK with Gradle
cd "$APP_DIR/android"
if [ "$MODE" == "debug" ]; then
  echo "Compiling Debug APK..."
  ./gradlew assembleDebug
  APK_SRC="$APP_DIR/android/app/build/outputs/apk/debug/app-debug.apk"
  APK_DEST="$OUTPUT_DIR/Anulekh-debug.apk"
else
  echo "Compiling Release APK..."
  ./gradlew assembleRelease
  APK_SRC="$APP_DIR/android/app/build/outputs/apk/release/app-release.apk"
  APK_DEST="$OUTPUT_DIR/Anulekh-release.apk"
fi

# 3. Output confirmation
if [ -f "$APK_SRC" ]; then
  cp "$APK_SRC" "$APK_DEST"
  if [ -d "$APP_DIR/dist" ]; then
    cp "$APK_SRC" "$APP_DIR/dist/$(basename "$APK_DEST")"
  fi
  echo "=========================================="
  echo " Build SUCCESSFUL!"
  echo " Output APK: $APK_DEST"
  echo " File Size: $(du -h "$APK_DEST" | cut -f1)"
  echo " Web Download: https://systematic-tri-roots-southampton.trycloudflare.com/$(basename "$APK_DEST")"
  echo "=========================================="
else
  echo "Error: Output APK not found at $APK_SRC"
  exit 1
fi
