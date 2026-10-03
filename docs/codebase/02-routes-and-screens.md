# 2. Routes & screens

Expo Router maps files in `src/app` to URLs. Folders become path segments; `index.tsx` is the folder's
default route; `_layout.tsx` wraps everything below it.

## Start-up and onboarding

| Route | File | Purpose |
|---|---|---|
| (root shell) | `app/_layout.tsx` | Loads fonts, error boundary, notifications setup, the start-up splash overlay (`AnimatedSplashOverlay`) and the in-app update checker (`AppUpdateModal`). Always uses the light navigation theme. |
| `/` | `app/index.tsx` | Entry gate. Shows the branded loading screen (paper + clouds) while it checks the session: no session → `/landing`; not yet verified → the role's `complete_profile`; otherwise → the role's console. |
| `/landing` | `app/landing/index.tsx` | Welcome page (mobile). Desktop widths render `LandingPC`. Animated entrance, "Get Started" and "Log In". |
| `/landing/induction` | `app/landing/induction.tsx` | 4-step intro carousel: language picker (opens automatically), 3 explanatory slides, then role choice ("I need a Scribe" / "I want to Volunteer") → register. |
| `/auth/login` | `app/auth/login.tsx` | Sign in with email or phone + password; forgot-password (OTP) and Google sign-in modals. Routes to the right console or profile-completion step. |
| `/auth/register` | `app/auth/register.tsx` | Create a student or scribe account (name, phone, optional email, password, terms). OTP modal is present but paused. |
| `/dev/splash-preview` | `app/dev/splash-preview.tsx` | **Development only** — replays the start-up sequence for Android/iOS. Redirects to `/` in production builds. |

## Student portal (`/console/student`)

| Route | File | Purpose |
|---|---|---|
| `/console` | `app/console/index.tsx` | Redirects to the signed-in user's portal. |
| `/console/student` | `app/console/student/index.tsx` | Tabbed console: header (logo, notifications, avatar) + bottom tab bar. Tabs are kept alive with `TabPane`. Tabs: **Home** (`StudentHomeView`), **Requests** (`StudentRequestsView`), **Plan** (`StudentPlanView`), **Account** (`SharedSettingsView`); also Profile and Notifications. |
| `/console/student/complete_profile` | `complete_profile.tsx` | Multi-step verification form (identity, disability certificate, location). Required before using the portal. |
| `/console/student/request_form` | `request_form.tsx` | Create an exam scribe request (subject, date/time, venue, language, admit card; AI hall-ticket parsing). |
| `/console/student/assignment_form` | `assignment_form.tsx` | Create an assignment-writing request. |
| `/console/student/view_applications` | `view_applications.tsx` | Review scribes who applied to a request; accept one. |
| `/console/student/my_requests` | `my_requests.tsx` | Standalone list of the student's requests. |
| `/console/student/profile` | `profile.tsx` | Student profile page. |

## Scribe portal (`/console/scribe`)

| Route | File | Purpose |
|---|---|---|
| `/console/scribe` | `app/console/scribe/index.tsx` | Tabbed console (green theme). Tabs: **Home** (`ScribeHomeView`), **Search** (`ScribeExploreView`), **Applied/Requests** (`ScribeCommitmentsView`), **Account** (`SharedSettingsView`), Notifications. |
| `/console/scribe/complete_profile` | `complete_profile.tsx` | 3-step scribe verification (personal details, ID proof, qualifications/availability). |
| `/console/scribe/apply` | `apply.tsx` | Full details of an exam/assignment request and the Apply / Accept-invitation action. |
| `/console/scribe/commitments` | `commitments.tsx` | Standalone commitments list. |
| `/console/scribe/achievements` | `achievements.tsx` | Badges and certificates earned. |
| `/console/scribe/profile` | `profile.tsx` | Scribe profile page. |

## Shared (`/console/common`)

| Route | File | Purpose |
|---|---|---|
| `/console/common/chat` | `chat.tsx` | Request-scoped chat between student and matched scribe: text, voice notes (`VoiceMessageBubble`), images/documents (via `storageService`). |
| `/console/common/notifications` | `notifications.tsx` | Notifications screen. |
| `/console/common/settings` | `settings.tsx` | Settings screen (route form of the Account tab). |
| `/console/common/support` | `support.tsx` | Create a support ticket (`support_tickets`). |

## Navigation flow

```
/ ──no session──▶ /landing ──Get Started──▶ /landing/induction ──role──▶ /auth/register ──▶ /auth/login
│                         └──Log In──────────────────────────────────────────────────────▶ /auth/login
└──session──▶ unverified? ──▶ /console/{role}/complete_profile ──(admin approves)──▶ /console/{role}
```
