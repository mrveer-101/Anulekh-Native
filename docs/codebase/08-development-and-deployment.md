# 8. Development & deployment

## Run locally

```bash
# Backend (from Anulekh-Axum). Use the local SQLite file so development never touches production data.
DATABASE_URL=local.db TURSO_AUTH_TOKEN= cargo run          # → http://localhost:3000 (admin panel at /)

# App (from Anulekh-Native)
npm install
npx expo start --web                                       # → http://localhost:8081
```

* On web at `localhost`, the app always calls `http://localhost:3000`.
* ⚠️ Without `DATABASE_URL=local.db`, the backend reads `Anulekh-Axum/.env`, which points at the **live Turso
  database** — local testing would then change production data.
* `/dev/splash-preview` replays the start-up sequence (development builds only).
* Test accounts are created through the normal sign-up endpoint; the admin panel (backend `/`, credentials
  in `Anulekh-Axum/.env`) approves them.

## Quality checks

```bash
npx tsc --noEmit -p .          # type-check (must be 0 errors)
npx eslint src                 # lint (React Compiler rules report some long-standing issues)
npx expo export -p web -p android -p ios --output-dir /tmp/check   # build all platforms
(cd ../Anulekh-Axum && cargo check)
```

## Deploy

| Part | Where | How |
|---|---|---|
| **Web app** | Google Cloud Run (`anulekh-web` Mumbai, `anulekh-web-us` US; custom domain `anulekh.green-era.org`) | `bash scripts/deploy-web.sh` — refuses to run if the branch is behind `origin`, type-checks, builds `dist/` (`expo export -p web`), deploys via `gcloud run deploy --source .` using the `Dockerfile` (nginx serving `dist/`, `nginx.conf` SPA fallback + caching). `--dry-run` builds only. |
| **Android / iOS** | EAS Build (`eas.json` profiles `development`, `preview`, `production`) | `eas build --profile preview --platform android` (APK) / `--platform ios`. Native config (splash, icons, `userInterfaceStyle`) only changes with a new build. App id `com.celestialsteam.anulekh`, version in `app.json`. |
| **Backend** | Render (`Anulekh-Axum/render.yaml`, Docker) | Deploys from the backend repository. Free plan → sleeps when idle. |

`EXPO_PUBLIC_API_URL` (in `.env` and each EAS profile) decides which backend a build talks to; it is fixed
at build time.

## Release checklist

1. `npx tsc --noEmit`, lint, and an all-platform `expo export`.
2. Bump `app.json` `version` / `android.versionCode` for store builds, and `LATEST_VERSION(_CODE)` on the
   backend if users should see the update popup.
3. Web: `scripts/deploy-web.sh`. Mobile: `eas build` + store submission.
4. Never deploy the backend from a branch containing debug/test shortcuts (see known issues).
