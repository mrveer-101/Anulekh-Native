# 3. Components

## Portal tab screens

All tab screens follow the same pattern (see [Performance & caching](07-performance-and-caching.md)):
`useTabActive()` → refresh on focus only while visible → show cached snapshot → parallel queries →
`applySnapshot()` + `writeScreenCache()`.

| Component | Portal / tab | What it shows | Main tables |
|---|---|---|---|
| `student/StudentHomeView` | Student · Home | Gradient welcome header, verification banners, stats (exams, assignments, matched), "My Schedule" (confirmed plans + SOS) with call/chat/declaration, request button, support card | profiles, exam_requests, assignment_requests |
| `student/StudentRequestsView` | Student · Requests | Exams / Assignments / Past Scribes tabs; request cards with status strip, applicants, matched-scribe actions (call, chat, complete, un-match, cancel, delete), SOS trigger, rating and private-invite modals | exam_requests, assignment_requests, scribe_applications, notifications, scribe_reviews |
| `student/StudentPlanView` | Student · Plan | Calendar with plan dots, All/Upcoming/Completed filter, plan cards with declaration and call/chat | exam_requests, assignment_requests |
| `student/StudentProfileView` | Student · Profile | Student profile details | profiles |
| `student/ScribesDirectoryModal` | Student | Browse/recommend scribes and invite one privately | profiles, scribe_applications, `/api/recommendations` |
| `scribe/ScribeHomeView` | Scribe · Home | Gradient header, verified badge, invitations, stats, contributions, SOS standby switch, My Plans, achievements, ranked available exams with Apply | profiles, exam_requests, scribe_applications, scribe_reviews, student_reviews |
| `scribe/ScribeExploreView` | Scribe · Search | Exams/Assignments switch, search, filters (language, type, slot, day, date range, level, deadline), "near you" grouping, ranked cards | profiles, scribe_applications, exam_requests, assignment_requests, student_reviews |
| `scribe/ScribeCommitmentsView` | Scribe · Applied | Calendar, All/Pending/Completed/Rejected filter, application cards (withdraw, call, chat, declaration, rate student) | scribe_applications, exam_requests, assignment_requests, scribe_reviews, student_reviews |
| `scribe/ScribePlanView` | Scribe (desktop) | Availability & schedule | exam_requests |
| `scribe/ScribeProfileView` | Scribe | Scribe profile details | profiles |
| `shared/SharedSettingsView` | Both · Account | Role-themed profile header, editable basic info and details, documents, scribe configuration, language, demo notifications, save / sign out / delete account | profiles |
| `shared/SharedNotificationsView` | Both · Notifications | Notification list, mark as read | notifications |

## Desktop layouts (`components/pc_view`)

Rendered when the window is ≥ 768 px wide.

| Component | Purpose |
|---|---|
| `ConsoleStudentPC`, `ConsoleScribePC` | Desktop consoles: glass header (bell dot = real unread count), sidebar navigation, tab content kept alive with `TabPane` and wrapped in `DesktopShellProvider`. Home / Requests / Plan / Search / Applied / Account are the **same screens as the phone app**, so every feature is available on desktop. |
| `LandingPC`, `HeaderPC`, `FooterPC` | Desktop landing page and its header/footer. |
| `StudentProfilePCView`, `SharedNotificationsPCView` | Desktop "My Account" and notifications tabs. |
| `StudentHomePCView`, `StudentRequestsPCView` | Older desktop-only Home / Requests screens — **no longer used** (replaced by the phone screens); safe to delete. |

## UI building blocks (`components/ui`)

| Component | Purpose |
|---|---|
| `DesktopShell` | Desktop helpers. `DesktopShellProvider` / `useInDesktopShell()` (tab screens drop their own page background inside the desktop console), `DesktopGrid` / `DesktopCell` / `useDesktopColumns()` (card lists in 2 columns on wide screens, unchanged on phones), `DesktopPageFrame` (centred desktop window for pages listed in `app/_layout.tsx`, with a brand panel for sign-in), `useIsDesktopWeb()`. |
| `BrandSplash` | Start-up visuals shared by the native overlay, the loading screen and the dev preview: `SplashBackground`, `SplashFullImage`, `SplashLogo`, `SplashTitle`, `SplashOverlay`. |
| `animated-icon.tsx` / `.web.tsx` | `AnimatedSplashOverlay` — continues the OS splash on phones (no-op on web). |
| `TabPane` | Keep-alive tab container + `useTabActive()` hook. |
| `AppUpdateModal` | "What's new", "Update available" and "Update required" popups (driven by `versionService`). |

## Other components

| Component | Purpose |
|---|---|
| `modals/PolicyModal` | Shows terms & conditions / guidelines (student, scribe) with an "I agree" action. |
| `modals/MiniCalendar` | Small date-picker modal used by filters. |
| `voice_msg/VoiceMessageBubble` | Plays a voice note in chat (web Audio API — see known issues for phones). |
| `student/badges/ExamStatusBadge`, `student/filters/RequestFilterBar` | Extracted components not yet used by any screen (kept for refactoring). |
