# Anulekh — Architecture Guide

A beginner-friendly map of how the **Native-Mobile** app is put together: every screen,
what it does, and how the pieces connect. Read this top-to-bottom once and the folder
structure will "click."

> **What is Anulekh?** A platform that connects visually-impaired / disabled **students**
> with volunteer **scribes** who help them write exams and assignments. There are two kinds
> of users (student and scribe), plus an admin dashboard that lives in the separate Rust
> backend (`Anulekh - Axum`), not in this app.

---

## 1. The 10,000-foot view

```
 Phone / Web browser
        │
        ▼
 React Native app  (this folder, "Native-Mobile")
        │   every screen calls  supabase.from('table')… or supabase.auth…
        ▼
 core/supabase.ts  (a thin API client — see §6)
        │   HTTP fetch → JSON
        ▼
 Rust / Axum backend  ("Anulekh - Axum")  ──►  SQLite / Turso database
```

The app **never talks to a database directly**. Every screen goes through one file,
[core/supabase.ts](../src/app/core/supabase.ts), which forwards requests to the Rust backend
over HTTP. (It's named `supabase` for historical reasons — the project used to use Supabase.
It's now just a custom API client wearing a Supabase-shaped costume so old code didn't have
to be rewritten.)

---

## 2. How navigation works (Expo Router)

This app uses **Expo Router**, which is "file-based routing": the folder path of a file under
`src/app/` **is** its URL.

| File | Route (URL) |
| --- | --- |
| `src/app/index.tsx` | `/` |
| `src/app/landing/index.tsx` | `/landing` |
| `src/app/auth/login.tsx` | `/auth/login` |
| `src/app/console/student/index.tsx` | `/console/student` |
| `src/app/console/scribe/apply.tsx` | `/console/scribe/apply` |

You move between screens with `router.push('/some/route')` or `router.replace(...)`.

### ⚠️ The one big idea that confuses newcomers

The app has **two levels** of navigation, and they work differently:

1. **Real routes** (separate pages you navigate *to*): things like the login screen,
   the "create request" form, the chat screen. These are files under `src/app/…`.

2. **Fake "tabs" inside the dashboard** (Home / Requests / Plan / Account): these are
   **NOT** separate routes. The dashboard shell
   ([console/student/index.tsx](../src/app/console/student/index.tsx) and
   [console/scribe/index.tsx](../src/app/console/scribe/index.tsx)) keeps a single piece
   of state called `activeTab`, and just swaps which **component** it renders:

   ```tsx
   {activeTab === 'home'     && <StudentHomeView />}
   {activeTab === 'requests' && <StudentRequestsView />}
   {activeTab === 'plan'     && <StudentPlanView />}
   {activeTab === 'settings' && <SharedSettingsView />}
   ```

   That's why those big screens live in **`src/components/…View.tsx`**, not in `src/app/`.
   They are "pages" to the user, but "components" to the router. **This is the single most
   important thing to understand about this codebase.**

---

## 3. The startup flow (who sees what, when)

```
App opens
   │
   ▼
 src/app/index.tsx  ──►  "Is there a saved session?"
   │                         │
   │  no session             │  yes → look up the user's role
   ▼                         ▼
 /landing            role = 'scribe' → /console/scribe
   │                 role = 'student' → /console/student
   ▼
 First-time users: /landing/induction  (language pick + intro slides)
   │
   ▼
 /auth/login  (or register)
   │
   ▼
 If profile incomplete → complete_profile screen
   │
   ▼
 Dashboard (/console/student  or  /console/scribe)
```

- [index.tsx](../src/app/index.tsx) — **entry gate.** Checks for a saved session and
  redirects to the right place. Shows the "अ Anulekh" splash while deciding.
- [console/index.tsx](../src/app/console/index.tsx) — a small redirector: if someone lands
  on `/console` directly, it figures out their role and forwards to the correct dashboard.

---

## 4. Folder structure at a glance

```
src/
├── app/                    ← ROUTES (file path = URL)
│   ├── _layout.tsx         ← wraps every screen (theme, splash overlay, web Alert polyfill)
│   ├── index.tsx           ← "/"  entry gate & session check
│   ├── explore.tsx         ← leftover template demo route (not core)
│   │
│   ├── landing/            ← pre-login marketing / onboarding
│   │   ├── index.tsx       ← landing page ("Get Started")
│   │   └── induction.tsx   ← first-run: choose language + intro slides
│   │
│   ├── auth/               ← login / signup
│   │   ├── login.tsx       ← email or phone + password, Google login, forgot-password
│   │   └── register.tsx    ← new account signup
│   │
│   ├── console/            ← everything AFTER login
│   │   ├── index.tsx       ← role-based redirect to student/scribe dashboard
│   │   │
│   │   ├── common/         ← screens shared by both roles
│   │   │   ├── chat.tsx           ← 1-to-1 messaging between matched student & scribe
│   │   │   ├── settings.tsx       ← (older standalone settings route)
│   │   │   ├── support.tsx        ← raise a support ticket to admins
│   │   │   └── notifications.tsx  ← just redirects into the dashboard tab
│   │   │
│   │   ├── student/        ← student-only routed screens
│   │   │   ├── index.tsx             ← STUDENT DASHBOARD SHELL (tabs live here)
│   │   │   ├── complete_profile.tsx  ← fill required profile after signup
│   │   │   ├── request_form.tsx      ← create an EXAM scribe request (+ AI hall-ticket scan)
│   │   │   ├── assignment_form.tsx   ← create an ASSIGNMENT-writing request
│   │   │   ├── my_requests.tsx       ← list of the student's requests
│   │   │   ├── view_applications.tsx ← scribes who applied → accept one
│   │   │   └── profile.tsx           ← (older standalone profile route)
│   │   │
│   │   └── scribe/         ← scribe-only routed screens
│   │       ├── index.tsx             ← SCRIBE DASHBOARD SHELL (tabs live here)
│   │       ├── complete_profile.tsx  ← scribe onboarding (ID proof, education, slots)
│   │       ├── apply.tsx             ← review a request & apply / accept an invite
│   │       ├── commitments.tsx       ← (older standalone route for accepted jobs)
│   │       ├── achievements.tsx      ← badges / stats / volunteer certificate
│   │       └── profile.tsx           ← (older standalone profile route)
│   │
│   └── core/               ← app-wide logic (NOT screens, despite living under app/)
│       ├── supabase.ts     ← the API client — ALL data goes through here
│       ├── translation.ts  ← English / Hindi / Gujarati text + useLanguage() hook
│       └── examDate.ts     ← parse messy exam-date strings into real Date objects
│
├── components/             ← reusable UI + the dashboard "tab pages"
│   ├── Student*View.tsx    ← the student dashboard tab bodies (see §5)
│   ├── Scribe*View.tsx     ← the scribe dashboard tab bodies (see §5)
│   ├── Shared*View.tsx     ← tab bodies used by BOTH roles
│   ├── MiniCalendar.tsx    ← pop-up date picker (used in filters)
│   ├── ScribesDirectoryModal.tsx ← browse/invite a specific scribe
│   ├── PolicyModal.tsx     ← terms / guidelines popup
│   ├── voice_msg/          ← voice-note recording bubble for chat
│   └── (themed-text, hint-row, external-link, …)  ← small template helpers
│
├── constants/theme.ts      ← light/dark color palette (template default)
├── hooks/                  ← small reusable functions (useTheme, useColorScheme)
└── global.css              ← Tailwind / NativeWind base styles
```

---

## 5. The dashboard "tab pages" (in `src/components/`)

Remember from §2: these are full screens to the user, but technically components swapped by
the dashboard shell. Here's what each one does.

### Student side
| Component | Tab | What it shows |
| --- | --- | --- |
| [StudentHomeView](../src/components/StudentHomeView.tsx) | Home | Greeting, quick stats, shortcuts to create a request |
| [StudentRequestsView](../src/components/StudentRequestsView.tsx) | Requests | All the student's exam/assignment requests, their status, and applicants |
| [StudentPlanView](../src/components/StudentPlanView.tsx) | Plan | Calendar / upcoming confirmed exams |
| [StudentProfileView](../src/components/StudentProfileView.tsx) | (Account) | Edit personal details, photo |

### Scribe side
| Component | Tab | What it shows |
| --- | --- | --- |
| [ScribeHomeView](../src/components/ScribeHomeView.tsx) | Home | Greeting, stats, invitations, verification status |
| [ScribeExploreView](../src/components/ScribeExploreView.tsx) | Search | Browse open exam/assignment requests, **filter** them, apply |
| [ScribeCommitmentsView](../src/components/ScribeCommitmentsView.tsx) | Requests | Jobs the scribe has accepted / applied to |
| [ScribePlanView](../src/components/ScribePlanView.tsx) | Plan | Scribe's upcoming confirmed commitments calendar |
| [ScribeProfileView](../src/components/ScribeProfileView.tsx) | (Account) | Edit scribe profile |

### Shared by both
| Component | Used as | What it shows |
| --- | --- | --- |
| [SharedSettingsView](../src/components/SharedSettingsView.tsx) | Account tab | Language, sign out, support, account actions |
| [SharedNotificationsView](../src/components/SharedNotificationsView.tsx) | Bell icon | In-app notifications list |

> **Note on "older standalone routes":** several files under `app/console/student` and
> `app/console/scribe` (`profile.tsx`, `commitments.tsx`, `settings.tsx`) do the same job as
> a `…View.tsx` component. They're earlier versions from before the dashboard-shell pattern
> was adopted. The live app mostly uses the `…View` components inside the shell; the
> standalone routes remain for direct navigation / backward links.

---

## 6. The `core/` layer — the "brain" shared everywhere

### [core/supabase.ts](../src/app/core/supabase.ts) — the data gateway
Exposes an object called `supabase` with two parts:
- `supabase.auth.*` → `signUp`, `signInWithPassword`, `getSession`, `signOut`
  (session is stored on the device with AsyncStorage).
- `supabase.from('table')` → a chainable query builder:
  ```ts
  await supabase.from('exam_requests')
    .select('*')
    .eq('status', 'pending')
    .order('created_at', { ascending: false });
  ```
  Under the hood each chain becomes one `POST /api/query` call to the Rust backend.

**Tables you'll see referenced:** `users`, `profiles`, `exam_requests`,
`assignment_requests`, `scribe_applications`, `notifications`, `chat_messages`,
`support_tickets`, `scribe_reviews`, `student_reviews`.

### [core/translation.ts](../src/app/core/translation.ts) — 3-language support
Provides the `useLanguage()` hook. Any screen does:
```ts
const { t, lang, changeLanguage } = useLanguage();
…
<Text>{t('nav_home')}</Text>   // shows the word in English / Hindi / Gujarati
```
Default language is **Gujarati**. The choice is saved on the device.

### [core/examDate.ts](../src/app/core/examDate.ts) — date parsing helper
Exam dates are stored as free text (e.g. `"24/07/2026 | 12:00 PM"` or `"2026-07-10 10:00 AM"`).
This file turns those strings into real `Date` objects and answers questions like
`isExamToday()`, `isExamPast()`, `hoursUntilExam()`. Used to lock the "Call" button until
exam day, sort requests, etc.

---

## 7. Key user journeys (follow the arrows)

**Student requests a scribe for an exam:**
```
StudentHomeView / Requests tab
   → /console/student/request_form   (fill exam details; optional AI hall-ticket scan)
   → saved to exam_requests (status 'pending')
   → scribes see it in ScribeExploreView and apply
   → /console/student/view_applications  → student accepts one scribe
   → both can now open /console/common/chat
```

**Scribe finds and applies to work:**
```
ScribeExploreView (Search tab)   ← filters: language, type, date range, etc.
   → /console/scribe/apply?id=…&type=exam   (review + accept the terms via PolicyModal)
   → creates a row in scribe_applications
   → appears in ScribeCommitmentsView once accepted
```

**Chat & calling:** [chat.tsx](../src/app/console/common/chat.tsx) — text + voice notes
(see `components/voice_msg/`). The phone-call button stays hidden until exam day (enforced
via `examDate.ts`) for privacy.

---

## 8. Supporting cast (small helpers)

- [MiniCalendar.tsx](../src/components/MiniCalendar.tsx) — dependency-free pop-up month
  calendar; used by the date-range filters in `ScribeExploreView`.
- [ScribesDirectoryModal.tsx](../src/components/ScribesDirectoryModal.tsx) — lets a student
  browse scribes and send a **direct invite** to a preferred one.
- [PolicyModal.tsx](../src/components/PolicyModal.tsx) — reusable terms/guidelines popup.
- [app/_layout.tsx](../src/app/_layout.tsx) — the root wrapper around every screen: sets the
  theme, shows the animated splash, and patches `Alert.alert` to work on web.
- `hooks/`, `constants/theme.ts`, `components/themed-text.tsx`, `web-badge.tsx`,
  `hint-row.tsx`, `external-link.tsx`, `ui/collapsible.tsx`, `app-tabs.tsx`, `explore.tsx` —
  mostly **leftover Expo starter-template files**. Harmless, and largely unused by the real
  app. Don't spend time here when learning the product.

---

## 9. Cheat-sheet: "Where do I edit… ?"

| I want to change… | Go to |
| --- | --- |
| The login screen | `app/auth/login.tsx` |
| What a student sees on Home | `components/StudentHomeView.tsx` |
| The scribe's search/filter screen | `components/ScribeExploreView.tsx` |
| The exam request form | `app/console/student/request_form.tsx` |
| Tab names / order in a dashboard | the `TABS` array in `console/{student,scribe}/index.tsx` |
| Any text label / add a translation | `app/core/translation.ts` |
| How data is fetched/saved | screen file (uses `supabase.from(...)`) + `app/core/supabase.ts` |
| Colors of a role (blue=student, green=scribe) | the `ACCENT` constants at the top of each dashboard shell |
| Notifications list | `components/SharedNotificationsView.tsx` |
| Settings / sign-out / language | `components/SharedSettingsView.tsx` |

---

### TL;DR
- `src/app/**` = **routes** (URLs). `src/components/**` = **reusable UI + the dashboard tab pages**.
- The two dashboards (`console/student/index.tsx`, `console/scribe/index.tsx`) are **shells**
  that swap `…View` components based on an `activeTab` state — those tabs are *not* separate routes.
- **All data** flows through `core/supabase.ts` → Rust backend → SQLite.
- `core/translation.ts` handles English/Hindi/Gujarati; `core/examDate.ts` handles messy dates.
- Anything in `hooks/`, `constants/`, and the small `themed-*` components is mostly Expo
  starter-template leftovers — ignore while learning.
