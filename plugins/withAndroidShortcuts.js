const { withAndroidManifest, withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

/**
 * Expo Config Plugin to add Android App Actions shortcuts (`shortcuts.xml`)
 * Enables Google Assistant voice queries like:
 * "Hey Google, create exam request in Anulekh"
 * and homescreen dynamic/static app shortcuts.
 */
const withAndroidShortcuts = (config) => {
  // 1. Add shortcuts meta-data to AndroidManifest.xml's main Activity
  config = withAndroidManifest(config, (modConfig) => {
    const mainApplication = modConfig.modResults.manifest.application?.[0];
    if (!mainApplication) return modConfig;

    const mainActivity = mainApplication.activity?.[0];
    if (!mainActivity) return modConfig;

    if (!mainActivity['meta-data']) {
      mainActivity['meta-data'] = [];
    }

    const hasShortcuts = mainActivity['meta-data'].some(
      (m) => m.$?.['android:name'] === 'android.app.shortcuts'
    );

    if (!hasShortcuts) {
      mainActivity['meta-data'].push({
        $: {
          'android:name': 'android.app.shortcuts',
          'android:resource': '@xml/shortcuts',
        },
      });
    }

    return modConfig;
  });

  // 2. Inject res/xml/shortcuts.xml for Android App Actions
  config = withDangerousMod(config, [
    'android',
    async (modConfig) => {
      const xmlDir = path.join(
        modConfig.modRequest.platformProjectRoot,
        'app/src/main/res/xml'
      );

      if (!fs.existsSync(xmlDir)) {
        fs.mkdirSync(xmlDir, { recursive: true });
      }

      const shortcutsXml = `<?xml version="1.0" encoding="utf-8"?>
<shortcuts xmlns:android="http://schemas.android.com/apk/res/android">
    <!-- Google Assistant App Action Capability -->
    <capability android:name="actions.intent.OPEN_APP_FEATURE">
        <intent
            android:action="android.intent.action.VIEW"
            android:targetPackage="com.celestialsteam.anulekh"
            android:data="anulekh://console/student/request_form?mode=voice">
            <parameter
                android:name="feature"
                android:key="feature"/>
        </intent>
    </capability>

    <!-- Static App Launcher Shortcut -->
    <shortcut
        android:shortcutId="voice_exam_request"
        android:enabled="true"
        android:icon="@mipmap/ic_launcher"
        android:shortLabel="@string/voice_exam_shortcut_short"
        android:longLabel="@string/voice_exam_shortcut_long">
        <intent
            android:action="android.intent.action.VIEW"
            android:targetPackage="com.celestialsteam.anulekh"
            android:data="anulekh://console/student/request_form?mode=voice" />
        <capability-binding android:key="actions.intent.OPEN_APP_FEATURE">
            <parameter-binding
                android:key="feature"
                android:value="voice_exam_request"/>
        </capability-binding>
    </shortcut>
</shortcuts>
`;

      fs.writeFileSync(path.join(xmlDir, 'shortcuts.xml'), shortcutsXml, 'utf-8');

      // Also ensure string resources exist in res/values/strings.xml
      const valuesDir = path.join(
        modConfig.modRequest.platformProjectRoot,
        'app/src/main/res/values'
      );
      if (fs.existsSync(valuesDir)) {
        const stringsPath = path.join(valuesDir, 'strings.xml');
        if (fs.existsSync(stringsPath)) {
          let stringsXml = fs.readFileSync(stringsPath, 'utf-8');
          if (!stringsXml.includes('voice_exam_shortcut_short')) {
            const insertion = `    <string name="voice_exam_shortcut_short">Voice Exam</string>\n    <string name="voice_exam_shortcut_long">Create Exam Request with Voice</string>\n</resources>`;
            stringsXml = stringsXml.replace('</resources>', insertion);
            fs.writeFileSync(stringsPath, stringsXml, 'utf-8');
          }
        }
      }

      return modConfig;
    },
  ]);

  return config;
};

module.exports = withAndroidShortcuts;
