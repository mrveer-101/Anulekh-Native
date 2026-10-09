# Architecture

## Data client — `core/supabase.ts`

Not real Supabase: a Supabase-style shim over the Axum backend.

```ts
const { data } = await supabase.from('exam_requests').select('*').eq('student_id', id);
```

* Awaiting a chain sends one `POST /api/query` (filters `eq`/`neq`; ⚠️ `gte`/`lte` act as `=`).
* `supabase.auth.*` wraps `/api/auth/*`; session in AsyncStorage `local_db_session`; sign-out clears all caches.
* Backend URL: `http://localhost:3000` on web at localhost, otherwise `EXPO_PUBLIC_API_URL` (fixed at build time).

## Routes — `src/app`

| Route | Purpose |
|---|---|
| `/` | Entry gate → `/landing`, the role's `complete_profile`, or its console |
| `/landing`, `/landing/induction` | Welcome (desktop: `LandingPC`); language picker + 3 intro slides + role choice |
| `/auth/login`, `/auth/register` | Sign in (email/phone, forgot password, Google); create student/scribe account |
| `/console/student` | Tabs: Home · Requests · Plan · Account (+ Notifications) |
| `/console/student/*` | `complete_profile`, `request_form`, `assignment_form`, `view_applications?id=`, `my_requests`, `profile` |
| `/console/scribe` | Tabs: Home · Search · Applied · Account (+ Notifications) |
| `/console/scribe/*` | `complete_profile`, `apply?id=`, `achievements`, `commitments`, `profile` |
| `/console/common/*` | `chat?requestId=`, `support`, `notifications`, `settings` |
| `/dev/splash-preview` | Development only — replays the start-up splash |

## Tab screens — `components/`

| Screen | Shows |
|---|---|
| `StudentHomeView` | Welcome, stats, My Schedule (call / chat / declaration / SOS), request button |
| `StudentRequestsView` | Exams · Assignments · Past Scribes; applicants, edit, delete, un-match, rating, Find Scribes |
| `StudentPlanView` | Calendar + plan cards |
| `ScribeHomeView` | Invitations, stats, SOS standby, My Plans, achievements, ranked open exams |
| `ScribeExploreView` | Search + filters, "near you", exam and assignment cards |
| `ScribeCommitmentsView` | Calendar + applications (withdraw, call, chat, rate student) |
| `SharedSettingsView` | Account: profile, language, Notifications (haptics switch), Test Alerts, sign out, delete |
| `PastScribesList` | Requests → Past Scribes: search, rating, View Profile, Invite Privately |
| `RequestKit` | Shared UI for `request_form` / `assignment_form`: page, header, section cards, submit button, tab bar, request-type chooser |

## Desktop (web ≥ 768 px) — `components/ui/DesktopShell.tsx`

* **Consoles** (`pc_view/ConsoleStudentPC`, `ConsoleScribePC`): sidebar + header around the **same tab
  screens** as the phone, so features never diverge. `useInDesktopShell()` → no own background,
  `DesktopGrid` cards in 2 columns, calendar beside the list.
* **Other pages** (chat, support, forms, sign-in, intro): wrapped by the root Stack's `screenLayout` in
  `DesktopPageFrame` — a centred window; sign-in gets a brand panel. List: `DESKTOP_FRAMED_ROUTES` in
  `app/_layout.tsx`. `useInDesktopFrame()` hides phone-only bars.

## File uploads — `services/storageService.ts` (plan: [APL](../plans/APL.md))

Files go **straight from the device to Cloudflare R2**; the API never carries file bytes.

1. `POST /api/storage/presigned-url {kind, content_type, size_bytes, user_id}` → the backend checks the
   rules for that kind (`chat_image`, `chat_pdf`, `voice`, `assignment`, `avatar` = public;
   `proof`, `ticket` = private) and returns a 15-min link with type + size signed in.
2. PUT the file: phones stream it from disk (`expo-file-system/legacy` upload task), web uses
   `XMLHttpRequest` (progress). 3. Save the result — only after the upload succeeded.

| Saved as | Where |
|---|---|
| Public URL (+ `file_key`, `mime_type`, `size_bytes`) | `chat_messages` (photos, PDFs, voice notes), `profiles.avatar_url`, assignment `attachments` |
| `r2p:<key>` — private, admin-only (`/api/admin/private-file`) | `profiles` ID proofs, `support_tickets.reference_image` |

Voice notes: recorded and played with `expo-audio` (`VoiceMessageBubble`). Without R2 settings the backend
stores files locally (`uploads/`, `uploads-private/`) through the same flow.

## Performance

| Mechanism | Where | Effect |
|---|---|---|
| Tab keep-alive | `ui/TabPane` + `useTabActive()` | Tabs mount once, then hide; refresh only while visible |
| Cached snapshots | `core/screenCache` | Last data shown instantly, refreshed in background; per user, wiped on sign-out |
| Parallel queries | `Promise.all` in each screen | One round trip instead of 3–10 sequential calls |
| Profile memo | `core/profileLookup` | De-duplicated, 2-minute cache of other users' profiles |

## Core modules — `core/`

| Module | Role |
|---|---|
| `translation.ts` | `useLanguage()` → `t()`; English / Hindi / Gujarati |
| `portalTheme.ts` | `STUDENT_THEME` (blue), `SCRIBE_THEME` (green), `gradient()`, `portalCardStyle()` |
| `haptics.ts` | `haptic('tap' \| 'success' \| 'warning' \| 'error')` via expo-haptics; on/off saved on device |
| `notifications.ts` | Android channels, `triggerTestNotification()` |
| `examDate.ts` | Parse exam dates; 24 h withdraw lock |
| `a11y.ts` | `announceForAccessibility()` |
| `services/versionService.ts` | `GET /api/system/version` → update / force-update / what's-new popup |

## Design system

* **Light mode only.** One palette per portal (`core/portalTheme.ts`); gradients via `gradient()` with a
  solid fallback colour.
* **Cards** have a 4 px status strip: red = SOS, green = confirmed, amber = pending, pink = invited.
* **Icons, not emoji** (Feather / Ionicons / FontAwesome5). Web fonts are embedded as base64 by
  `npm run build:fonts` → `src/vector-fonts-b64.css`.
* **Splash:** paper `#FBF8F3` + logo tile (native) → `BrandSplash` overlay with colour clouds.
* **Motion:** Reanimated, always behind `useReducedMotion()`. Calm by design: one gentle fade/rise on entry, no springs, bounces or endless loops (only the admit-card scanning indicator loops).
* **Accessibility:** labels/roles on every control, `aria-*` on web, ≥ 44 px touch targets.
