const { withInfoPlist, withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

/**
 * Expo Config Plugin to add Apple App Intents & Siri Shortcuts for iOS
 * Registers native Siri phrases like:
 * - "Hey Siri, create exam request on Anulekh"
 * - "Hey Siri, who applied for my exam on Anulekh"
 * - "Hey Siri, message my scribe on Anulekh"
 */
const withIOSSiriShortcuts = (config) => {
  // 1. Add iOS Info.plist permissions & UserActivity types
  config = withInfoPlist(config, (modConfig) => {
    const infoPlist = modConfig.modResults;

    if (!infoPlist.NSUserActivityTypes) {
      infoPlist.NSUserActivityTypes = [];
    }

    const activities = [
      'com.celestialsteam.anulekh.createRequest',
      'com.celestialsteam.anulekh.checkScribes',
      'com.celestialsteam.anulekh.chatScribe',
    ];

    activities.forEach((act) => {
      if (!infoPlist.NSUserActivityTypes.includes(act)) {
        infoPlist.NSUserActivityTypes.push(act);
      }
    });

    infoPlist.NSSpeechRecognitionUsageDescription =
      infoPlist.NSSpeechRecognitionUsageDescription ||
      'Anulekh needs speech recognition access to transcribe exam booking voice commands and conversational inputs.';

    infoPlist.NSMicrophoneUsageDescription =
      infoPlist.NSMicrophoneUsageDescription ||
      'Anulekh needs microphone access to listen to your exam booking details and voice messages.';

    return modConfig;
  });

  // 2. Generate Swift App Intents & AppShortcutsProvider
  config = withDangerousMod(config, [
    'ios',
    async (modConfig) => {
      const projectRoot = modConfig.modRequest.projectRoot;
      const iosDir = path.join(projectRoot, 'ios');

      if (!fs.existsSync(iosDir)) {
        return modConfig;
      }

      // Find the main app folder inside ios/
      const subdirs = fs.readdirSync(iosDir).filter((f) => {
        const full = path.join(iosDir, f);
        return fs.statSync(full).isDirectory() && !f.endsWith('.xcodeproj') && !f.endsWith('.xcworkspace') && f !== 'Pods';
      });

      const targetDir = subdirs.length > 0 ? path.join(iosDir, subdirs[0]) : path.join(iosDir, 'Anulekh');
      if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true });
      }

      const swiftCode = `//
//  AnulekhAppIntents.swift
//  Anulekh
//
//  Apple App Intents & Siri Shortcuts for Anulekh (iOS 16+)
//

import Foundation
import AppIntents
import UIKit

@available(iOS 16.0, *)
struct CreateExamRequestIntent: AppIntent {
    static var title: LocalizedStringResource = "Create Exam Request"
    static var description = IntentDescription("Start conversational voice exam booking in Anulekh")
    static var openAppWhenRun: Bool = true

    @MainActor
    func perform() async throws -> some IntentResult & ProvidesDialog {
        if let url = URL(string: "anulekh://create-request?voice=true") {
            UIApplication.shared.open(url)
        }
        return .result(dialog: "Opening Anulekh to create your exam request.")
    }
}

@available(iOS 16.0, *)
struct CheckScribeApplicationsIntent: AppIntent {
    static var title: LocalizedStringResource = "Check Scribe Applications"
    static var description = IntentDescription("Check which scribes have applied for your exam")
    static var openAppWhenRun: Bool = true

    @MainActor
    func perform() async throws -> some IntentResult & ProvidesDialog {
        if let url = URL(string: "anulekh://voice-assistant?cmd=check_scribes") {
            UIApplication.shared.open(url)
        }
        return .result(dialog: "Checking scribe applications on Anulekh.")
    }
}

@available(iOS 16.0, *)
struct MessageScribeIntent: AppIntent {
    static var title: LocalizedStringResource = "Message Scribe"
    static var description = IntentDescription("Send a message to your confirmed scribe on Anulekh")
    static var openAppWhenRun: Bool = true

    @MainActor
    func perform() async throws -> some IntentResult & ProvidesDialog {
        if let url = URL(string: "anulekh://chat") {
            UIApplication.shared.open(url)
        }
        return .result(dialog: "Opening chat with your scribe on Anulekh.")
    }
}

@available(iOS 16.0, *)
struct AnulekhShortcutsProvider: AppShortcutsProvider {
    static var appShortcuts: [AppShortcut] {
        AppShortcut(
            intent: CreateExamRequestIntent(),
            phrases: [
                "Create exam request on \\(.applicationName)",
                "Book a scribe with \\(.applicationName)",
                "Ask \\(.applicationName) to find a scribe"
            ],
            shortTitle: "Create Request",
            systemImageName: "mic.fill"
        )
        AppShortcut(
            intent: CheckScribeApplicationsIntent(),
            phrases: [
                "Who applied for my exam on \\(.applicationName)",
                "Check scribes on \\(.applicationName)",
                "Show scribe applications on \\(.applicationName)"
            ],
            shortTitle: "Check Scribes",
            systemImageName: "person.2.fill"
        )
        AppShortcut(
            intent: MessageScribeIntent(),
            phrases: [
                "Message my scribe on \\(.applicationName)",
                "Chat with scribe on \\(.applicationName)"
            ],
            shortTitle: "Message Scribe",
            systemImageName: "message.fill"
        )
    }
}
`;

      const swiftFilePath = path.join(targetDir, 'AnulekhAppIntents.swift');
      fs.writeFileSync(swiftFilePath, swiftCode, 'utf8');
      console.log('✅ Generated AnulekhAppIntents.swift at:', swiftFilePath);

      return modConfig;
    },
  ]);

  return config;
};

module.exports = withIOSSiriShortcuts;
