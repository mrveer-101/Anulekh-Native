# 9. Known issues & roadmap

Found while reviewing and documenting the code. None were changed as part of the documentation work.

## Security (fix first)

| Issue | Where | Recommendation |
|---|---|---|
| Passwords stored and compared in **plain text** | `Anulekh-Axum/src/auth.rs` (sign-in compares `db_pass == payload.password`) | Hash with argon2/bcrypt; migrate existing rows on next sign-in. |
| **Password shortcut**: any account whose password is `pass` or `Aditya@3205` accepts either | `auth.rs` sign-in (commit `291bf72`, branch `NEXT`) | Remove before deploying the backend; treat `Aditya@3205` as exposed and rotate it. |
| Test-account **seed script writes to the live database** | `Anulekh-Axum/src/bin/seed_test_accounts.rs` | Run only against `local.db`; delete test accounts from production. |
| **Approval bypass**: an account counts as approved if it has any of Aadhaar number/photo, disability certificate *or location*; the Home screens then silently set `verification_status = 'approved'` | `app/index.tsx`, `app/auth/login.tsx`, `StudentHomeView`, `ScribeHomeView` (`fetchSession`) | Make admin approval (`verification_status === 'approved'`) the only gate. |
| **`POST /api/query` is unauthenticated** and has no table allow-list; filter column names and `data` keys are interpolated into SQL unchecked — any client can read or modify any table (including `users.password`) | `Anulekh-Axum/src/query.rs` | Require a session token, restrict tables/columns per role, whitelist column names. |
| Query builder's `gte`/`lte` filters are silently treated as `=` by the backend | `core/supabase.ts` ↔ `query.rs` | Implement `gte`/`lte` in `query.rs` (or stop using them). |
| Production test accounts `uistd`, `uiscribe` (unverified, password `pass`) were created by mistake on 2026-09-30 | live Turso DB | Delete them. |

## Functional

| Issue | Where |
|---|---|
| Voice notes play through the browser `Audio` API, which doesn't exist on phones | `components/voice_msg/VoiceMessageBubble.tsx` (use `expo-audio`) |
| iOS app icon is still Expo's default (`assets/expo.icon`) | `app.json` → `ios.icon` |
| Several screens use `accessibilityState`, which react-native-web ignores (states not announced on web) | various — prefer `aria-*` props |
| Forgot-password / Google sign-in use `EXPO_PUBLIC_API_URL` directly instead of the local URL on web | `app/auth/login.tsx` |
| `services/api/*` and `types/*` are unused (except `client.ts`); `ExamStatusBadge`, `RequestFilterBar` unused | kept for a future refactor |
| Plan calendar "today" highlight compares UTC dates (`toISOString()`), so it can be a day off in India near midnight | `components/student/StudentPlanView.tsx` |
| Account tab: gender is never loaded/saved; profile photo is stored only on the device; Delete Account always calls the Render URL (`apiHost` doesn't exist) and clears local data even if the delete failed | `components/shared/SharedSettingsView.tsx` |
| Some Plan / chat texts are hard-coded Gujarati regardless of the chosen language | `StudentPlanView.tsx`, `app/console/common/chat.tsx` |
| Apply page shows "(null)" after the student's name when the date of birth is missing | `app/console/scribe/apply.tsx` |
| ~~SOS "applications" buttons on Home / Plan opened View Applications without a request id~~ — fixed (now pass `?id=`) | `StudentHomeView.tsx`, `StudentPlanView.tsx` |

## Performance / infrastructure

* Backend on Render free plan sleeps after ~15 min idle (30–60 s first request) — move to a paid instance
  or Cloud Run with `min-instances 1`.
* Add an `IN (...)` filter to `/api/query` so profile lookups become one request.
* A shared session/profile cache across the whole app would remove most remaining duplicate calls.
* Import icon families individually (`@expo/vector-icons/Feather`) to shrink the web bundle.
