# 1. Architecture

## The three parts

```
┌──────────────────────────────┐        HTTPS (JSON)        ┌───────────────────────────────┐
│ Anulekh-Native (this repo)   │ ─────────────────────────▶ │ Anulekh-Axum (Rust backend)   │
│ Expo / React Native app      │                             │ Axum HTTP server              │
│  • Android & iOS (EAS)       │ ◀───────────────────────── │  • /api/auth/*  sign-in/up    │
│  • Web (Cloud Run + nginx)   │                             │  • /api/query   generic DB    │
└──────────────────────────────┘                             │  • /api/admin/* admin panel   │
                                                             │  • /api/storage/* uploads     │
        Admin panel (admin.html, served by the backend at /)  └──────────────┬────────────────┘
                                                                            │ libsql
                                                             ┌──────────────▼────────────────┐
                                                             │ Turso (cloud SQLite)           │
                                                             │  or local.db for development   │
                                                             └───────────────────────────────┘
        Media (ID proofs, certificates, voice notes) → Cloudflare R2 via presigned URLs
```

* **App** — one codebase for Android, iOS and web, built with Expo Router (file-based routes in `src/app`).
* **Backend** — Rust/Axum (`Anulekh-Axum`). Owns authentication, the database, uploads, matching, SOS
  dispatch, WhatsApp/AI integrations and the admin API. Hosted on Render (`render.yaml`).
* **Admin panel** — a single HTML page (`Anulekh-Axum/src/admin.html`) served by the backend; used to
  verify scribes/students, manage requests, tickets and applications.

## How the app talks to the backend

The app does **not** use real Supabase. `src/core/supabase.ts` exports a small **Supabase-style client**
so screens can write familiar code:

```ts
const { data, error } = await supabase
  .from('exam_requests').select('*').eq('student_id', userId).order('created_at', { ascending: false });
```

Each chain is a `MockQueryBuilder` that collects the table, action (select/insert/update/delete), filters
(`eq`, `neq`, `gte`, `lte`), ordering, limit and `.single()`, and when awaited sends one `POST /api/query`
request to the backend. The backend (`query.rs`) turns it into parameterised SQL. `supabase.auth.*` wraps
`/api/auth/*` and stores the session in AsyncStorage (`local_db_session`).

Backend URL: on web at `localhost` the app uses `http://localhost:3000`; everywhere else it uses
`EXPO_PUBLIC_API_URL` from `.env` (production: `https://anulekh-axum.onrender.com`). This value is baked in
at build time.

## Folder layout (`src/`)

| Folder | Contents |
|---|---|
| `app/` | Routes (Expo Router). `_layout.tsx` is the root shell; `index.tsx` decides where to send the user. |
| `app/console/student/*`, `app/console/scribe/*` | The two portals. Each `index.tsx` is a tabbed console. |
| `components/student`, `components/scribe` | Tab screens for each portal (Home, Requests, Plan, Search, Applied…). |
| `components/shared` | Screens used by both roles (Account/Settings, Notifications). |
| `components/pc_view` | Desktop (≥ 768 px) layouts of the consoles and landing page. |
| `components/ui` | Shared UI: splash, keep-alive `TabPane`, update modal. |
| `components/modals` | Policy viewer, mini calendar. |
| `core/` | Data client, translation, theme, cache, notifications, accessibility helpers. |
| `services/` | `versionService` (update checker), `storageService` (uploads). `services/api/*` is an unused typed API layer kept for a future refactor. |
| `types/` | Shared TypeScript types (used by the `services/api` layer). |

## Request lifecycle (the core business flow)

1. **Student** registers → completes the verification profile → admin approves.
2. Student creates an **exam request** (`exam_requests`) or **assignment request** (`assignment_requests`).
3. **Scribes** see open requests in Home/Search (ranked: SOS → private invite → past student → student rating)
   and **apply** (`scribe_applications`, status `pending`). A student can also **invite** a scribe directly
   (`private_scribe_id` / application status `invited`).
4. Student reviews applicants (`view_applications`) and accepts one → request `matched`, `scribe_id` set.
5. Both sides can chat (`chat_messages`, incl. voice notes), call (unlocked on exam day), and view the formal
   scribe declaration.
6. Within 24 h of an exam a still-pending request is auto-escalated to **SOS** (`is_emergency = 'yes'`) and
   reserve scribes are notified.
7. After the exam: request `completed`; students rate scribes (`scribe_reviews`), scribes rate students
   (`student_reviews`); scribes earn achievements/certificates.

## Responsive layout

Consoles and the landing page check `useWindowDimensions()`: width ≥ 768 px renders the `pc_view`
components, otherwise the mobile layout. The desktop consoles show the **same tab screens** as the phone
(so features never diverge); inside them `useInDesktopShell()` switches those screens to a wide layout
(no own background, cards in two columns via `DesktopGrid`, calendar beside the list on Plan / Applied).

Pages that open on top of the portals (chat, support, view applications, apply, achievements, complete
profile, sign-in / sign-up, intro slides) are wrapped by the root Stack's `screenLayout` in
`DesktopPageFrame` on wide web windows — a centred rounded window on a soft background; sign-in and
sign-up get a brand panel beside the form. The route list and widths live in `DESKTOP_FRAMED_ROUTES`
(`app/_layout.tsx`). Inside the frame, `useInDesktopFrame()` hides phone-only chrome (bottom tab bars).
