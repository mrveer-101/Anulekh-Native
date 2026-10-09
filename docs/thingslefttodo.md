# Things left to do — final deployment

Checked 2026-10-07. Tick each box as you go. Do the sections **in order**.
Details: `Anulekh-Native/docs/plans/APL.md` (§5 = R2 setup) · `Anulekh-Native/docs/codebase/OPERATIONS.md`.

---

## 1. Security — before anything goes live

- [ ] **Remove the test password shortcut** in `Anulekh-Axum/src/auth.rs` (~line 212): any account with password
      `pass` or `Aditya@3205` accepts either one. Delete that `||` branch.
- [ ] **Stop tracking the backend `.env` in git** — it is pushed to `github.com/ArionGD/Anulekh-Axum` with real secrets:
      ```bash
      cd Anulekh-Axum
      git rm --cached .env
      echo ".env" >> .gitignore
      git commit -m "chore: stop tracking .env"
      ```
      (Render does not use this file, so the deploy is not affected.)
- [ ] **Change every secret that was in `.env`** (they stay in git history): Turso auth token, admin password,
      SMTP password, Twilio token, UltraMsg token, Gemini API key. Put the new values only in the Render dashboard.
- [ ] **Delete the test accounts** `uistd` and `uiscribe` from the live Turso database.

## 2. Cloudflare R2 — create storage

- [ ] Bucket **`anulekh-media`** (public files: chat photos, PDFs, voice notes, avatars, assignment files).
- [ ] Connect a **custom domain** to it, e.g. `media.anulekh.green-era.org` (do not use `r2.dev` in production).
- [ ] Bucket **`anulekh-private`** with **public access OFF** (ID proofs, support screenshots).
- [ ] **CORS policy on both buckets:**
      ```json
      [{ "AllowedOrigins": ["https://anulekh.green-era.org",
                            "https://anulekh-web-127496140633.asia-south1.run.app",
                            "https://anulekh-web-us-127496140633.us-central1.run.app",
                            "http://localhost:8081"],
         "AllowedMethods": ["PUT", "GET", "HEAD"],
         "AllowedHeaders": ["*"],
         "ExposeHeaders": ["ETag"],
         "MaxAgeSeconds": 3600 }]
      ```
- [ ] **R2 API token** with *Object Read & Write* on both buckets → note the Access Key ID, Secret and Account ID.

## 3. Render — backend settings (Dashboard → anulekh-axum → Environment)

- [ ] `R2_ACCOUNT_ID`
- [ ] `R2_ACCESS_KEY_ID`
- [ ] `R2_SECRET_ACCESS_KEY`
- [ ] `R2_BUCKET_NAME` = `anulekh-media`
- [ ] `R2_PRIVATE_BUCKET_NAME` = `anulekh-private`
- [ ] `R2_PUBLIC_DOMAIN` = `https://media.anulekh.green-era.org`
- [ ] `CORS_ORIGINS` = `https://anulekh.green-era.org,https://anulekh-web-127496140633.asia-south1.run.app,https://anulekh-web-us-127496140633.us-central1.run.app`
      (every address users open the website from; leave unset = any website allowed)
- [ ] `ADMIN_USERNAME` / `ADMIN_PASSWORD` (new password from step 1)
- [ ] Optional, for the "update available" popup: `LATEST_VERSION`, `LATEST_VERSION_CODE` (match step 5)
- [ ] Do **not** set `ALLOW_BASE64_UPLOAD` in production.

## 4. Push & deploy (pause Antigravity while doing this)

- [ ] **Backend** (`Anulekh-Axum`, 9 changed files) → commit, push, let Render deploy.
      New database columns are added automatically on start.
- [ ] Check: `https://anulekh-axum.onrender.com/api/system/version` responds; admin panel opens and logs in.
- [ ] **Web app** (`Anulekh-Native`, 24 changed files + `docs/plans/APL.md`) → commit, push, then
      `bash scripts/deploy-web.sh`.

## 5. Phone apps — new build (needed: voice recording, haptics, upload fixes)

- [ ] Bump `Anulekh-Native/app.json`: `version` 1.0.2 → **1.0.3**, `android.versionCode` 3 → **4**.
- [ ] Optional: replace the default Expo iOS icon (`app.json` → `ios.icon`).
- [ ] `eas build --profile production --platform android` (and `--platform ios`).
- [ ] Upload to Play Store / App Store.

## 6. Live test after deploying (Android phone + iPhone + website)

- [ ] Chat: send a **photo**, a **PDF** and a **voice note** → each appears, opens and plays on the other side.
- [ ] Turn on airplane mode, send a photo → error banner with **Retry** appears; Retry works when back online.
- [ ] Verification form: upload an **ID proof** → admin panel → user → **Open document** works.
- [ ] Support: attach a **screenshot** → visible from the admin panel's ticket.
- [ ] Account: change **profile photo** → shows on another device after signing in.
- [ ] Assignment request with an **attachment** → scribe can open it on the Apply page.
- [ ] A file over the limit (e.g. 30 MB PDF) is **refused** with a message.

---

## Later (not needed for this deployment)

- [ ] Approval bypass: the Home screens and both verification forms set `approved` themselves — make admin approval the only way.
- [ ] `/api/query` has no login check — add proper session tokens (next big project).
- [ ] Passwords are stored in plain text — hash them.
- [ ] Delete unused code: `pc_view/StudentHomePCView.tsx`, `pc_view/StudentRequestsPCView.tsx`.
- [ ] Small fixes: Plan "today" uses UTC; some hard-coded Gujarati text; Apply page shows "(null)"; gender not saved.
- [ ] `react-native-svg` is 15.15.5, Expo expects 15.15.4 (`npx expo install --fix`).
- [ ] Render free plan sleeps (30–60 s first request) — consider a paid instance.
