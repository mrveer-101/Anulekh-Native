# 4. Core modules & services

## `src/core`

| Module | Responsibility |
|---|---|
| `supabase.ts` | The app's data client (Supabase-style API over the Axum backend). `supabase.from(table)…` builds a `MockQueryBuilder` (select/insert/update/delete, `eq`/`neq`/`gte`/`lte`, `order`, `limit`, `single`) and awaiting it calls `POST /api/query`. `supabase.auth` wraps sign-in/up, session (AsyncStorage key `local_db_session`) and sign-out (which also clears all cached screens). Also exports `API_URL` and `friendlyAuthError()`. |
| `translation.ts` | `useLanguage()` hook: `lang`, `changeLanguage()`, `t(key, vars)`. Dictionary for English, Hindi, Gujarati. The choice is stored in AsyncStorage (`app_language`) and broadcast to every mounted screen. |
| `portalTheme.ts` | `PortalTheme` palettes (`STUDENT_THEME` blue, `SCRIBE_THEME` green, alternative orange), the cross-platform `gradient()` helper and `portalCardStyle()`. See [Design system](06-design-system.md). |
| `screenCache.ts` | Stale-while-revalidate snapshots per screen and user: `readScreenCache`, `writeScreenCache`, `clearScreenCache`, plus the profile memo used by `profileLookup`. |
| `profileLookup.ts` | `getProfilesByIds(ids)` — de-duplicated, parallel, 2-minute-cached lookups of other users' profiles. |
| `examDate.ts` | Parsing exam date strings (`parseExamDate`, `isExamPast`, `hoursUntilExam`, `canScribeWithdraw` — withdrawals lock within 24 h of the exam). |
| `notifications.ts` | Push/local notification setup (Android channels) and `triggerTestNotification()` used by the demo buttons. |
| `a11y.ts` | Screen-reader helpers: `announceForAccessibility()`, `isScreenReaderActive()`. |

## `src/services`

| Module | Responsibility |
|---|---|
| `versionService.ts` | Calls `GET /api/system/version`; decides `UP_TO_DATE`, `UPDATE_AVAILABLE`, `FORCE_UPDATE` or `WHATS_NEW` (last seen version in AsyncStorage `ANULEKH_LAST_SEEN_VERSION_CODE`); opens the Play Store. |
| `storageService.ts` | Media uploads for chat (images, documents, voice notes) via the backend storage endpoints / Cloudflare R2. |
| `api/*` | A typed API layer (`client.ts`, `authService`, `examService`, `profileService`, `chatService`, `applicationService`). Only `client.ts` is used today (by `versionService`); the rest is kept as the target for a future refactor away from the query shim. |

## `src/types`

TypeScript models (`User`, `UserProfile`, `ExamRequest`, `ScribeApplication`, `ChatMessage`,
`Notification`, …) used by `services/api`. `declarations.d.ts` adds module types for CSS imports and the web
`backdropFilter` style.

## Scripts

| Script | Purpose |
|---|---|
| `scripts/build-fonts.js` (`npm run build:fonts`) | Regenerates `src/vector-fonts-b64.css` — the icon fonts (Feather, Ionicons, FontAwesome5) embedded as base64 under the exact family names `@expo/vector-icons` uses. Re-run after upgrading `@expo/vector-icons`. |
| `scripts/deploy-web.sh` | Builds the web app and deploys it to Cloud Run (`anulekh-web-us`, then the same image to `anulekh-web` in Mumbai). |
