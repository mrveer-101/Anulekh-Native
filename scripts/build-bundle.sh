#!/usr/bin/env bash
set -e

# ========================================================
# Anulekh Google Play Store Android App Bundle (AAB) Builder
# 100% Local Compiles - Zero EAS Cloud Quota Limits
# ========================================================

export JAVA_HOME="/usr/lib/jvm/java-17-openjdk-amd64"
export ANDROID_HOME="/home/ubuntu/android-sdk"
export ANDROID_SDK_ROOT="/home/ubuntu/android-sdk"
export PATH="$PATH:$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools:$ANDROID_HOME/build-tools/35.0.0"

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUTPUT_DIR="$APP_DIR/builds"
mkdir -p "$OUTPUT_DIR"

echo "=========================================="
echo " Anulekh Google Play Store AAB Bundle Build"
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

# 2. Build AAB Bundle with Gradle
cd "$APP_DIR/android"
echo "Compiling Release AAB (bundleRelease)..."
./gradlew bundleRelease

AAB_SRC="$APP_DIR/android/app/build/outputs/bundle/release/app-release.aab"
AAB_DEST="$OUTPUT_DIR/Anulekh-release.aab"

# 3. Output confirmation
if [ -f "$AAB_SRC" ]; then
  cp "$AAB_SRC" "$AAB_DEST"
  if [ -d "$APP_DIR/dist" ]; then
    cp "$AAB_SRC" "$APP_DIR/dist/$(basename "$AAB_DEST")"
  fi
  echo "=========================================="
  echo " AAB Bundle Build SUCCESSFUL!"
  echo " Output AAB: $AAB_DEST"
  echo " File Size: $(du -h "$AAB_DEST" | cut -f1)"
  echo " Web Download: https://systematic-tri-roots-southampton.trycloudflare.com/$(basename "$AAB_DEST")"
  echo " Ready for Google Play Console upload!"
  echo "=========================================="
else
  echo "Error: Output AAB not found at $AAB_SRC"
  exit 1
fi
