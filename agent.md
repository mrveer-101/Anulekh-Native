# Anulekh Application (`Application/`) — Agent & Architecture Guide

Welcome to the **Anulekh Native Application** codebase. This document is written for AI agents and human engineers to quickly understand the client architecture, tech stack, directory structure, navigation, build pipeline, and deployment to Google Play Console and Apple App Store Connect.

---

## 🌿 Active Git Branch: `NEXT` (Sole Consolidated Branch)

> [!IMPORTANT]
> **This repository operates on a single branch: `NEXT`.**
> * All active development, UI enhancements, features, and EAS builds are consolidated directly on **`NEXT`**.
> * There is no separate development or baseline branch to avoid confusion; `NEXT` represents 100% of the latest codebase, functionality, and build configurations (`versionCode: 4`, `buildNumber: "2"`).
> * All pulls, commits, and builds are performed on `NEXT`.

---

## 1. Executive Summary & Purpose

* **What is Anulekh?** Anulekh is an accessibility platform in India connecting visually-impaired or disabled students with vetted volunteer scribes to write exams and assist with academic assignments.
* **Application Role:** An accessible, cross-platform mobile (Android & iOS) and progressive web application (PWA) built with **React Native** and **Expo SDK 56**.
* **Key Features:**
  1. Accessible student console: Post exam requests, upload admit cards (with automated AI OCR extraction), browse matching scribes, and manage applications.
  2. Volunteer scribe console: Browse nearby exam requests, apply to assist students, track volunteer hours, and download verified certificates.
  3. Integrated audio communication: In-app voice notes and chat using `expo-audio` for students unable to type.
  4. Full accessibility (A11y) support: Designed for TalkBack (Android) and VoiceOver (iOS), high-contrast modes, dynamic text scaling, and bilingual support.
  5. Cross-platform: Single codebase targeting Android (Google Play), iOS (App Store / TestFlight), and Web (Netlify/Vercel).

---

## 2. Technology Stack & Dependencies

| Layer | Technology | Version | Purpose |
|---|---|---|---|
| **Framework** | Expo SDK | `~56.0.17` | Universal React Native development runtime and tooling |
| **Core Libraries** | React / React Native | `19.2.3` / `0.85.3` | UI foundation |
| **Routing** | Expo Router | `~56.2.16` | File-based typed routing (`src/app/`) |
| **Styling** | NativeWind / Tailwind CSS | `^4.2.6` / `^3.4.19`| Utility-first responsive and accessible styling |
| **Animation** | React Native Reanimated | `4.3.1` | Native thread UI animations and transitions |
| **Audio & Voice** | `expo-audio` | `~56.0.13` | Audio recording and playback for voice messages |
| **Media & Files** | `expo-image-picker` / `expo-document-picker` | `~56.0` | Hall ticket and disability certificate uploads |
| **Push Notifications** | `expo-notifications` | `~56.0.24` | Local and remote push alerts for applications and chat |
| **Storage** | `@react-native-async-storage/async-storage`| `2.2.0` | Offline session tokens and cached profile storage |
| **Build & Deploy** | EAS CLI / EAS Build | `>= 9.0.0` | Cloud compilation for APK, AAB, IPA, and console submissions |

---

## 3. Build & Console Deployment Pipeline

The application uses **Expo Application Services (EAS)** for builds and direct console distribution:

### 3.1 Project Identity & Identifiers
* **EAS Project ID:** `d9f3efd7-1ab3-4b4d-b3b3-cafdac5dfbe6`
* **EAS Owner:** `orion-celestial`
* **Android Package Name:** `com.celestialsteam.anulekh`
* **iOS Bundle Identifier:** `com.celestialsteam.anulekh`
* **Apple App Store Connect App ID:** `6821392459`

---

### 3.2 Build Profiles (`eas.json`)

```json
{
  "build": {
    "development": {
      "developmentClient": true,
      "distribution": "internal"
    },
    "preview": {
      "android": { "buildType": "apk" },
      "ios": { "simulator": true }
    },
    "production": {
      "ios": { "resourceClass": "m-medium" },
      "env": { "EXPO_PUBLIC_API_URL": "https://anulekh-axum.onrender.com" }
    }
  }
}
```

* **`development`**: Builds with `expo-dev-client` for live debugging and testing native modules.
* **`preview`**: Generates a standalone **Android `.apk`** for rapid testing by sideloading directly on testers' phones without Google Play, plus an iOS Simulator build.
* **`production`**: Generates an **Android App Bundle (`.aab`)** optimized for the Play Store and an **iOS `.ipa`** signed for App Store Connect.

---

### 3.3 Google Play Console Workflow

1. **Build Android Production Bundle:**
   ```bash
   eas build --platform android --profile production
   ```
2. **Submit to Google Play Console:**
   ```bash
   eas submit -p android
   ```
3. **Tester Management & Release Tracks in Google Play Console:**
   * **Internal Testing Track:**
     * Instant deployment without Google review delays.
     * Add tester Gmail addresses directly in the console tester list.
     * Testers access the build via the private Play Store opt-in link.
   * **Closed Testing (Alpha/Beta Track):**
     * Testing with broader student/scribe groups.
     * Gathers automated pre-launch crash reports, vitals, and ANRs.
   * **Production Track:**
     * Public release to the Play Store once testing passes.

---

### 3.4 Apple App Store Connect & TestFlight Workflow

1. **Credentials & Keys in `eas.json`:**
   * App Store Connect API Key ID: `X8RHQ89Y9K`
   * Issuer ID: `67066931-afee-4261-a66c-bc8606529668`
   * Key file: `./AuthKey_X8RHQ89Y9K.p8`
2. **Build iOS Production IPA:**
   ```bash
   eas build --platform ios --profile production
   ```
3. **Submit to TestFlight / App Store:**
   ```bash
   eas submit -p ios
   ```
4. **Tester Management in App Store Connect (TestFlight):**
   * **Internal Testing Group:** Up to 100 internal developers/team members receive builds immediately upon upload.
   * **External Testing Group:** Up to 10,000 public testers via public link or email invitation (requires brief initial Apple Beta Review).

---

### 3.5 Web Deployment (Netlify & Vercel)
* **Build Command:** `npm run build` (runs `expo export -p web`, outputs to `dist/`).
* **Netlify Config (`netlify.toml`):** Configured with SPA rewrite rule (`/*` → `/index.html`, status 200).
* **Vercel Config (`vercel.json`):** `cleanUrls: true` for clean path routing.

---

## 4. Directory & File Map (`Application/`)

```
Application/
├── app.json                    # Expo config (version: 1.0.2, versionCode: 4, buildNumber: "2")
├── eas.json                    # EAS build profiles (appVersionSource: local) & submit configs
├── package.json                # NPM dependencies (Expo SDK ~56.0.17, React 19.2.3, RN 0.85.3)
├── tsconfig.json               # TypeScript path aliases (@/* -> ./src/*)
├── tailwind.config.js          # NativeWind Tailwind CSS design system & tokens
├── metro.config.js             # Metro bundler config with NativeWind wrapper
├── netlify.toml / vercel.json  # Web hosting SPA routing configs
├── serve_spa.py                # Python local SPA HTTP server with client-side route fallback
│
├── assets/                     # App icons, splash screens, Android adaptive icons
│
├── src/
│   ├── app/                    # File-based navigation routes (Expo Router)
│   │   ├── _layout.tsx         # Root layout: ThemeProvider, font loaders, notification listeners
│   │   ├── index.tsx           # Entry splash & auth redirect dispatcher
│   │   ├── dev/
│   │   │   └── splash-preview.tsx # Internal splash screen previewer
│   │   ├── landing/            # Public landing screen & induction flows
│   │   │   ├── index.tsx
│   │   │   └── induction.tsx
│   │   ├── auth/               # User authentication screens
│   │   │   ├── login.tsx       # Login with Email/Phone/Username or Google OAuth
│   │   │   └── register.tsx    # Multi-step Student / Scribe registration
│   │   └── console/            # Authenticated user dashboards
│   │       ├── index.tsx       # Role dispatcher (routes to student or scribe)
│   │       ├── student/        # Student portal screens
│   │       │   ├── index.tsx   # Student dashboard hosting virtual tab panes
│   │       │   ├── request_form.tsx      # Exam scribe request creation & AI OCR
│   │       │   ├── assignment_form.tsx   # Assignment assistance request form
│   │       │   ├── my_requests.tsx       # Student active/past request manager
│   │       │   ├── view_applications.tsx # Review and accept/reject scribe applicants
│   │       │   ├── profile.tsx           # Student public profile view
│   │       │   └── complete_profile.tsx  # ID & disability certificate upload wizard
│   │       ├── scribe/         # Volunteer scribe portal screens
│   │       │   ├── index.tsx   # Scribe dashboard hosting virtual tab panes
│   │       │   ├── apply.tsx   # Scribe application submission flow
│   │       │   ├── commitments.tsx   # Confirmed exam assignments and schedule
│   │       │   ├── achievements.tsx  # Badges, volunteer hours & certificates
│   │       │   ├── profile.tsx       # Scribe public profile view
│   │       │   └── complete_profile.tsx # Scribe ID & qualification verification
│   │       └── common/         # Shared communication & utility screens
│   │           ├── chat.tsx          # Real-time messaging, voice notes & media
│   │           ├── notifications.tsx # In-app notification center
│   │           ├── settings.tsx      # Theme, language, audio, accessibility options
│   │           └── support.tsx       # Helpdesk & ticket creation
│   │
│   ├── components/             # Reusable UI component library
│   │   ├── ui/                 # Core accessible UI components
│   │   │   ├── AppUpdateModal.tsx    # Mandatory app update enforcement dialog
│   │   │   ├── BrandSplash.tsx       # Animated brand intro screen
│   │   │   ├── DesktopShell.tsx      # Responsive desktop / PC view wrapper
│   │   │   ├── TabPane.tsx           # Virtual tab switcher with state retention
│   │   │   ├── animated-icon.tsx     # Reanimated icon component (mobile)
│   │   │   └── animated-icon.web.tsx # CSS-based icon component (web fallback)
│   │   ├── voice_msg/
│   │   │   └── VoiceMessageBubble.tsx # Real native audio player bubble with expo-audio
│   │   ├── student/            # Student portal tab components
│   │   │   ├── StudentHomeView.tsx     # Student home feed & stats
│   │   │   ├── StudentRequestsView.tsx # Student active requests tab
│   │   │   ├── StudentPlanView.tsx     # Upcoming exam calendar & timeline
│   │   │   ├── StudentProfileView.tsx  # Account & settings tab view
│   │   │   ├── RequestKit.tsx          # Request cards, badges & filter chips
│   │   │   ├── PastScribesList.tsx     # Quick re-invite for previous scribes
│   │   │   └── ScribesDirectoryModal.tsx # Filtered modal to search available scribes
│   │   ├── scribe/             # Scribe portal tab components
│   │   │   ├── ScribeHomeView.tsx        # Scribe home feed & available requests
│   │   │   ├── ScribeExploreView.tsx     # Exam request discovery & filter sheet
│   │   │   ├── ScribePlanView.tsx        # Commitment calendar & schedules
│   │   │   ├── ScribeProfileView.tsx     # Account, badges & hours
│   │   │   └── ScribeCommitmentsView.tsx # Accepted duties details
│   │   ├── shared/             # Cross-role components
│   │   │   ├── SharedNotificationsView.tsx # Embedded notification pane
│   │   │   └── SharedSettingsView.tsx      # Embedded settings pane
│   │   ├── pc_view/            # Dedicated desktop/PC responsive wrappers
│   │   │   ├── LandingPC.tsx
│   │   │   ├── ConsoleStudentPC.tsx
│   │   │   ├── ConsoleScribePC.tsx
│   │   │   ├── HeaderPC.tsx & FooterPC.tsx
│   │   │   └── StudentHomePCView.tsx / RequestsPCView.tsx / ProfilePCView.tsx
│   │   └── modals/
│   │       ├── MiniCalendar.tsx # Accessible compact calendar picker
│   │       └── PolicyModal.tsx  # Terms of service and privacy policy viewer
│   │
│   ├── core/                   # Core infrastructure & system utilities
│   │   ├── supabase.ts         # Query engine client serializing to POST /api/query
│   │   ├── haptics.ts          # Tactile feedback wrapper (expo-haptics / web navigator.vibrate)
│   │   ├── screenCache.ts      # Fast in-memory & AsyncStorage cache for instant tab renders
│   │   ├── portalTheme.ts      # Semantic color palette, dark mode & high-contrast tokens
│   │   ├── profileLookup.ts    # Cached user profile resolver for names, roles, and avatars
│   │   ├── a11y.ts             # Screen reader announcements, accessibility props, contrast
│   │   ├── examDate.ts         # Indian exam calendar dates, human durations & parsing
│   │   ├── notifications.ts    # Expo push notification tokens and registration
│   │   └── translation.ts      # Multi-language string catalogs (English, Hindi, Gujarati)
│   │
│   ├── services/
│   │   ├── storageService.ts   # Direct R2 streaming upload pipeline (expo-file-system & XHR)
│   │   ├── versionService.ts   # Version checking & update prompts (/api/system/version)
│   │   └── api/                # Domain-driven API modules
│   │       ├── client.ts             # Centralized fetch wrapper with error handling
│   │       ├── authService.ts        # Register, login, OTP recovery, Google auth
│   │       ├── examService.ts        # Exam requests, assignments, SOS dispatch
│   │       ├── applicationService.ts # Scribe applications, acceptance, withdrawals
│   │       ├── chatService.ts        # Chat messages, voice notes, read receipts
│   │       ├── profileService.ts     # User profile retrieval, updates, verifications
│   │       └── index.ts              # Unified domain API export
│   │
│   └── types/                  # Typed domain models
│       ├── user.ts             # User, Profile, Role, VerificationStatus
│       ├── exam.ts             # ExamRequest, AssignmentRequest, FilterOptions
│       ├── application.ts      # ScribeApplication, ApplicationStatus
│       ├── chat.ts             # ChatMessage, MediaType, VoiceNoteMeta
│       └── notification.ts     # InAppNotification, NotificationPayload
```

---

## 5. Architectural Patterns in `NEXT`

### 5.1 Virtual Tab Panes with State Retention (`TabPane.tsx`)
In `console/student/index.tsx` and `console/scribe/index.tsx`, views do not unmount on navigation between `Home`, `Requests`, `Plan`, and `Account`. The custom `TabPane` component hides inactive views (`display: 'none'`) while keeping their state, scroll positions, and form inputs preserved in memory. This eliminates tab reload lag and ensures smooth TalkBack / VoiceOver transitions.

### 5.2 Screen Cache Layer (`screenCache.ts`)
To achieve near-zero latency, `screenCache.ts` stores dashboard snapshots both in RAM and in `@react-native-async-storage/async-storage`. When users open the app or switch tabs, cached data renders immediately while a background query refreshes the state silently.

### 5.3 Direct Cloudflare R2 Streaming Uploads (`storageService.ts`)
* **No Base64 Payloads:** Files are never base64-encoded through JSON requests.
* **Presigned Uploads:** The client calls `POST /api/storage/presigned-url` with `{ kind, content_type, size_bytes, user_id }`.
* **Streaming Upload:**
  * **Native (Android / iOS):** Uses `expo-file-system/legacy` upload tasks to stream directly from storage without copying into JS memory.
  * **Web:** Uses `XMLHttpRequest` with progress tracking.
* **Private vs Public:**
  * Public files (avatars, chat attachments) return a CDN URL.
  * Private documents (Aadhaar cards, disability certificates) return an opaque `r2p:<key>` token. Only authorized admins can request temporary 5-minute signed view URLs from `/api/admin/private-file`.

### 5.4 Tactile Accessibility Feedback (`haptics.ts`)
Calls `expo-haptics` (`impactAsync`, `notificationAsync`, `selectionAsync`) on native devices, gracefully falling back to `navigator.vibrate` on supported web browsers, enhancing usability for visually impaired users.

---

## 6. How the App Communicates with the Backend

The app communicates with the Rust / Axum backend via [`src/core/supabase.ts`](file:///home/ubuntu/Desktop/Anulekh/Application/src/core/supabase.ts) and the domain services in [`src/services/api/`](file:///home/ubuntu/Desktop/Anulekh/Application/src/services/api/):

* **API Base URL Resolution:**
  * Uses `process.env.EXPO_PUBLIC_API_URL`.
  * Fallback: Web localhost defaults to `http://localhost:3000`, mobile production to `https://anulekh-axum.onrender.com`.
* **Query Builder Interface:** Implements standard Supabase-style query operations (`select`, `insert`, `update`, `delete`, `eq`, `order`, `limit`, `single`), which serializes to `POST /api/query`.
* **Direct Endpoints:**
  * Authentication: `POST /api/auth/*`
  * Presigned File Uploads: `POST /api/storage/presigned-url`
  * AI Hall Ticket OCR: `POST /api/ai/parse-hall-ticket`
  * Scribe Recommendations: `POST /api/recommendations`
  * SOS Emergency Scribes: `GET /api/sos/available`, `POST /api/sos/claim`
  * Version Enforcement: `GET /api/system/version`

---

## 7. Local Development Quickstart

```bash
# 1. Navigate to Application directory
cd /home/ubuntu/Desktop/Anulekh/Application

# 2. Verify git branch is NEXT
git status

# 3. Install dependencies
npm install

# 4. Configure environment variable (.env)
echo "EXPO_PUBLIC_API_URL=http://localhost:3000" > .env

# 5. Start Expo development server
npx expo start
```

* Press **`a`** to launch on an Android emulator or connected device.
* Press **`i`** to launch on an iOS simulator.
* Press **`w`** to preview in the web browser.
* Scan the terminal QR code with **Expo Go** on a physical mobile device.

