# APL — Anulekh media upload plan (direct to Cloudflare R2)

**Goal:** every file (chat photos, PDFs, voice notes, ID proofs, attachments, avatars) goes **straight from
the device to R2**. The backend only checks the request, signs a short-lived upload link and the app stores
the file's **key** in Turso. No file bytes pass through the Render server.

---

## 0. Status — implemented 2026-10-06 (not yet deployed)

| Phase | State | Verified locally (web, local backend without R2) |
|---|---|---|
| 1 Phone uploads | ✅ `expo-file-system/legacy`; chat photos by file, not base64 | photo + PDF sent |
| 2 Upload rules | ✅ kinds / types / sizes, signed type + size, user check, 30/min rate limit, `CORS_ORIGINS`, base64 route off | wrong type, oversize, unknown kind, unknown user, link reuse, path tricks, rate limit all rejected; signed headers = `content-length;content-type;host` |
| 3 Chat media + UX | ✅ `file_key` / `mime_type` / `size_bytes`; progress banner + Retry; saved only after upload | rows carry key, type, exact size |
| 4 Voice notes | ✅ `expo-audio` record + play | 3 s note recorded, uploaded, played back |
| 5 Private proofs | ✅ both `complete_profile` forms + support screenshot → private; admin-only view link | proof opens for admin (200), 401 without login, 404 via public path |
| 6 Remaining base64 | ✅ assignment attachments upload with progress; profile photo → `profiles.avatar_url` | photo shows after clearing the device cache |
| 7 Ops | ✅ `render.yaml` keys, `.gitignore` for upload folders, docs | — |

Not yet tested: real R2 (needs §5), real Android / iPhone builds (needs a new EAS build).

**Changes from the original plan (simpler in practice):**
* Public files store the **public URL** (plus `file_key` where a column exists) — screens need the URL to show
  them; private files store `r2p:<key>`.
* Profile photo column is `profiles.avatar_url` (not `avatar_key`).
* Assignment `attachments` keep the existing string list format, now `"<name>::<url>"`; readers take the part
  after the last `::`, so old rows still open. No data migration needed.

**Also fixed on the way:** `GET /api/admin/users` now requires the admin login (it exposed Aadhaar numbers);
the admin page had a duplicate `let currentProfileFilter` that stopped its script from running.

---

## 1. Decisions

| Topic | Decision | Why |
|---|---|---|
| Database | **Turso (libsql) only** — no PostgreSQL. Schema changes are additive `ALTER TABLE`s in `Anulekh-Axum/src/db.rs`. | It is the live database; a migration is a separate project. |
| Auth | **No JWT in this project.** Abuse is limited by server rules (§3 Phase 2). | Keeps scope small. See risk R1. |
| Chat | Media is stored on the existing **`chat_messages`** rows (linked by `request_id`) + 3 new columns. | Reuses the current chat schema and queries. |
| Links between tables | **By id, no foreign keys.** | Turso/SQLite does not enforce FKs by default and no table uses them today. |
| Message types | Keep **`text · image · pdf · voice`** (not `audio`/`document`). | Old messages keep rendering. |
| Buckets | **Two buckets:** `anulekh-media` (public) and `anulekh-private` (no public access). | R2 public access is all-or-nothing per bucket; ID proofs must never be public (Aadhaar Act, DPDP Act 2023). |
| Public URL | Custom domain, e.g. `https://media.anulekh.green-era.org`. | `r2.dev` is rate-limited and not for production. |
| Database value | Public files: the **URL** (+ key in `chat_messages.file_key`). Private files: `r2p:<key>`. | Screens need the URL; private files must never have one. |
| Style | KISS — extend `storage.rs` and `storageService.ts`; no new services or libraries. | |

## 2. Current state (verified 2026-10-06)

| Piece | State |
|---|---|
| `POST /api/storage/presigned-url` (`storage.rs`) | ✅ 15-min R2 PUT links (`aws-sdk-s3`), local `./uploads` fallback. ❌ free-text `folder`, no type/size rules |
| `storageService.uploadFile` (app) | ✅ handshake → PUT → fallback. ❌ **fails on phones**: `uploadAsync` / `readAsStringAsync` from `expo-file-system` throw in SDK 56 |
| Chat photos / PDFs (`chat.tsx`) | ✅ use `uploadFile`. ❌ photos are sent as **base64 through the server** (`asset.base64 \|\| asset.uri`) |
| Voice notes | ❌ **fake**: sends a fixed Google sample URL; `VoiceMessageBubble` plays only on web |
| ID proofs (`complete_profile` ×2) | ❌ only the **file name** is saved; nothing is uploaded, admin can't verify |
| Profile photo | ❌ device only (AsyncStorage) |
| Assignment attachments | ❌ base64 inside `assignment_requests.attachments` |
| Admit card (`request_form`) | ❌ file name only; native read also uses the throwing `readAsStringAsync` |
| Support screenshot | ❌ fixed placeholder image |
| Server | ❌ CORS `allow_origin(Any)`; `/api/storage/upload` (base64) has no size cap |

## 3. Phases (smallest and most urgent first)

### Phase 1 — Fix phone uploads · *small · bug fix*
| File | Change |
|---|---|
| `src/services/storageService.ts` | `import * as FileSystem from 'expo-file-system/legacy'` |
| `src/app/console/student/request_form.tsx` | same import change (admit-card read for AI auto-fill) |
| `src/app/console/common/chat.tsx` | photo picker: drop `base64: true`, upload `asset.uri` |

✅ Done when: photo + PDF in chat and admit-card auto-fill work on a real Android phone; nothing reaches `/api/storage/upload`.

### Phase 2 — Upload rules on the server · *small*
`Anulekh-Axum/src/storage.rs`: the request body becomes `{ kind, content_type, size_bytes, user_id }`.

| kind | Bucket | Allowed types | Max |
|---|---|---|---|
| `chat_image` | public | jpeg · png · webp | 10 MB |
| `chat_pdf` | public | pdf | 20 MB |
| `voice` | public | m4a/aac · webm · ogg | 10 MB |
| `assignment` | public | pdf · doc · docx · jpeg · png | 20 MB |
| `avatar` | public | jpeg · png · webp | 5 MB |
| `proof` | **private** | jpeg · png · pdf | 10 MB |
| `ticket` | **private** | jpeg · png | 5 MB |

* Unknown kind/type or too large → `400`. Extension comes from the type. Key = `<kind>/<user_id>/<uuid>.<ext>`.
* **Content-Type and Content-Length are signed** into the link → R2 rejects other types/sizes.
* `user_id` must exist in `profiles` (stops random callers; not real auth).
* In-memory rate limit: 30 links / minute / IP (`X-Forwarded-For` on Render). No new crate.
* CORS (Axum + both buckets): `https://anulekh.green-era.org`, the two Cloud Run URLs, `http://localhost:8081`.
* `/api/storage/upload` (base64) only when `ALLOW_BASE64_UPLOAD=1` (local dev), 5 MB body limit.
* Response: `{ upload_url, file_key, public_url | null, storage_type: "r2" | "local" }` (`public_url` null for private kinds).
* App: `storageService.uploadFile(uri, { kind, contentType, size })`; existing `folder` callers mapped to kinds.

✅ Done when: wrong type and oversize are rejected (checked with curl); valid uploads still work on web + phone.

### Phase 3 — Chat media on `chat_messages` + upload UX · *medium*
* Migration: `chat_messages` + `file_key TEXT`, `mime_type TEXT`, `size_bytes INTEGER`. `media_url` stays for old rows.
* Insert the message **only after the PUT returns 2xx**, with `file_key`, `mime_type`, `size_bytes`, `media_url`.
* Progress: phone = `createUploadTask` progress callback; web = `XMLHttpRequest` `upload.onprogress` (fetch can't report it).
* Failure → inline **Retry** (always requests a fresh link — they expire after 15 min). No crash, no half-saved message.

✅ Done when: progress shows, airplane-mode failure offers Retry, no empty message rows.

### Phase 4 — Real voice notes · *medium · needs new EAS build*
* Record with **`expo-audio`** (installed, 56.0.13): AAC `.m4a` on phones, `webm` on web; keep the duration.
* Upload as `kind: voice`; save `message_type: 'voice'`, `media_duration`.
* `VoiceMessageBubble`: play with `expo-audio` (`useAudioPlayer`) on every platform, replacing the browser `Audio`.

✅ Done when: a note recorded on Android plays on iPhone and web, and the other way round.

### Phase 5 — Private ID proofs · *medium*
* `complete_profile` (student + scribe): upload the real file as `kind: proof`; store `r2p:<key>` in
  `profiles.aadhar_image_proof` / `disability_certificate` / `certification_proof`. The app shows only "Uploaded ✓".
* New `GET /api/admin/proof-url?key=…`, protected by the **existing admin cookie session** → 5-minute signed view link.
  `admin.html` opens proofs through it. Proofs never get a public URL.
* Support screenshot: real image picker in `support.tsx`, `kind: ticket`, viewed the same way in the admin panel.

✅ Done when: the admin panel opens a new proof; the raw key URL without a signature returns 403.

### Phase 6 — Move remaining base64 · *small–medium*
* Assignment attachments → `kind: assignment`; `attachments` entries become `"<name>::<url>"`.
* Profile photo → `kind: avatar`, new `profiles.avatar_url`, shown on every device.
* Old base64 values keep displaying (read both formats). Optional one-time backfill later.

### Phase 7 — Ops
* Orphans (uploaded but never saved): log for now; later a weekly sweep of keys not referenced in Turso.
* Docs: update `docs/codebase/ARCHITECTURE.md`, `DATA.md` and `Anulekh-Axum/docs/codebase/API.md`.

## 4. Risks and corrections to the original prompt

| # | Point | Handling |
|---|---|---|
| R1 | **No auth:** anyone who knows a user id can request upload links, and `/api/query` stays fully open. | Phase 2 limits the damage. **Proper session tokens are the next project after APL.** |
| R2 | Original prompt said PostgreSQL + SQLx and `conversations` table. | Wrong for this codebase → Turso + `chat_messages`. |
| R3 | Original prompt put `proofs/` in a public bucket. | Private bucket + admin-only signed view links (Phase 5). |
| R4 | Original prompt allowed CORS `*`. | Own domains only. |
| R5 | Original prompt: "verify audio plays". | Impossible today — recording is fake and phones can't play. Phase 4 fixes both. |
| R6 | **Branch `NEXT`** still has the `pass` / `Aditya@3205` sign-in shortcut (`auth.rs` ~line 212). | Remove before any backend deploy. |
| R7 | Native changes (Phases 4–6, plus `expo-haptics` from earlier). | New EAS build for Android / iOS. |
| R8 | Antigravity (ORION) also commits to `NEXT` in both repos. | Pause it while a phase is in progress, or work on a feature branch. |

## 5. Readiness (checked 2026-10-06)

**Ready in the code**
* ✅ `expo-file-system/legacy` available (SDK 56.0.8) · `expo-audio` 56.0.13 installed · `aws-sdk-s3` already used by `storage.rs`.
* ✅ Baseline green: `tsc` 0 errors · lint 106 (all pre-existing) · `cargo check` OK.
* ✅ Local backend + `local.db` work for testing (uploads fall back to `./uploads` when R2 is not configured).

**Needed from you before Phase 2 / 5 can be tested against R2** (none needed for Phase 1)
1. Cloudflare → R2: bucket **`anulekh-media`** with public access via a custom domain (e.g. `media.anulekh.green-era.org`).
2. Bucket **`anulekh-private`** with public access **off**.
3. CORS on both buckets: methods `PUT, GET, HEAD`; origins = your domains + `http://localhost:8081`; expose `ETag`.
4. R2 API token (Object Read & Write, both buckets) → Access Key ID + Secret.
5. Values for local testing in `Anulekh-Axum/.env` and later on Render:
   `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME=anulekh-media`,
   `R2_PRIVATE_BUCKET_NAME=anulekh-private`, `R2_PUBLIC_DOMAIN=https://media.anulekh.green-era.org`,
   `CORS_ORIGINS=https://anulekh.green-era.org,<Cloud Run URLs>` (comma-separated; unset = any origin).
   *(Today none of these are in the local `.env`.)*

## 6. Test checklist (every phase)
`cargo check` · `npx tsc --noEmit` · lint (no new problems) · `npx expo export -p web -p android -p ios` ·
upload photo / PDF / voice on **Android, iPhone and web** · wrong type and oversize rejected ·
proofs open only from the admin panel · local backend always runs with `DATABASE_URL=local.db`.
