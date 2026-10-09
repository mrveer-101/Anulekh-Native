# Operations

## Run locally

```bash
# Backend (Anulekh-Axum) — always point at local.db, or you will change live data
DATABASE_URL=local.db TURSO_AUTH_TOKEN= cargo run --bin anulekh-axum   # :3000, admin panel at /

# App (Anulekh-Native)
npm install && npx expo start --web                                    # :8081
```

## Checks before a release

```bash
npx tsc --noEmit -p .                                     # 0 errors
npx eslint src                                            # no new problems (React Compiler rules list old ones)
npx expo export -p web -p android -p ios --output-dir /tmp/check
(cd ../Anulekh-Axum && cargo check)
```

## Deploy

| Part | Where | How |
|---|---|---|
| Web | Cloud Run `anulekh-web` (Mumbai), `anulekh-web-us`; `anulekh.green-era.org` | `bash scripts/deploy-web.sh` (`--dry-run` = build only) |
| Android / iOS | EAS | `eas build --profile preview --platform android` — native changes (splash, icons, new native packages such as `expo-haptics`) need a new build |
| Backend | Render (`render.yaml`) | Deploys from the backend repo; free plan sleeps when idle. R2 + CORS settings: see [APL §5](../plans/APL.md) |

Bump `app.json` `version` / `versionCode` (and backend `LATEST_VERSION*`) for store releases.

## Known issues

**Security — fix first**

* Passwords stored in plain text; the `pass` / `Aditya@3205` shortcut in `auth.rs` (commit `291bf72`).
* `POST /api/query` has no auth or table allow-list, and interpolates column names into SQL.
* Approval bypass: any ID/location field counts as approved; the Home screens and both
  `complete_profile` forms set `verification_status = 'approved'` themselves.
* `seed_test_accounts` writes to the live DB; delete test accounts `uistd` / `uiscribe` from production.
* `Anulekh-Axum/.env` (admin password, Turso token, API keys) is **tracked in git** — untrack it and rotate the secrets.

**Functional**

* iOS icon is the Expo default.
* Plan "today" uses UTC dates; some Plan / chat text is hard-coded Gujarati.
* Account: gender not saved, Delete Account ignores the server reply.
* Apply page shows "(null)" when the student's date of birth is missing.
* Unused code: `pc_view/StudentHomePCView`, `StudentRequestsPCView`, `services/api/*` (except `client.ts`).

**Infrastructure**

* Render free plan cold starts (30–60 s); add an `IN (...)` filter to `/api/query`.
