# Anulekh NEXT — System & Storage Architecture

This document defines the production architecture, technology choices, and roadmap for the **`NEXT`** evolution of Anulekh.

---

## 1. Executive Summary

Anulekh is powered by a high-efficiency **Hybrid Architecture**:
- **Structured Relational Data** $\to$ **Turso (Serverless SQLite / `libsql`)**
- **Binary Media & Object Storage** $\to$ **Cloudflare R2 (S3-Compatible Object Store)**
- **High-Performance API Backend** $\to$ **Rust (Axum)**
- **Cross-Platform Client** $\to$ **React Native (Expo)**

```
┌─────────────────────────────────────────────────────────────────────────┐
│                      Anulekh Mobile & Web Client                        │
│                         (React Native / Expo)                           │
└──────────────────┬─────────────────────────────────┬────────────────────┘
                   │                                 │
                   │ 1. Request Presigned PUT URL    │ 2. Direct PUT Upload
                   │    or structured data queries   │    (Photos, Audio)
                   ▼                                 ▼
┌──────────────────────────────────────┐  ┌───────────────────────────────┐
│         Rust Backend (Axum)          │  │     Cloudflare R2 Bucket      │
│     (Auth, Matching, S3 Presign)     │  │  (Images, Certificates, Voice)│
└──────────────────┬───────────────────┘  └──────────────┬────────────────┘
                   │                                     │
                   │ 3. Save URL / query metadata        │ 4. Fast CDN Stream
                   ▼                                     ▼
┌──────────────────────────────────────┐  ┌───────────────────────────────┐
│       Turso Database (libSQL)        │  │     Mobile / Web Playback     │
│   (Users, Requests, Chats, Sos)      │  │  (Audio Player / Image View)  │
└──────────────────────────────────────┘  └───────────────────────────────┘
```

---

## 2. Why PostgreSQL was Retired

During early prototyping, PostgreSQL (via Supabase) was evaluated. It has been **completely retired** in favor of Turso + Cloudflare R2 for the following reasons:

| Evaluation Metric | Legacy PostgreSQL / Supabase | Active Choice: Turso + Cloudflare R2 |
| :--- | :--- | :--- |
| **Media Handling** | Storing BLOBs/Base64 in Postgres creates database bloat, slow backups, and high query latency. | **Cloudflare R2** handles images, documents, and voice audio clips natively on a global CDN. |
| **Relational Database** | Heavy container / server required; cold starts; costly compute instances. | **Turso (libSQL)** is serverless SQLite with sub-millisecond edge latency, zero maintenance, and 1 billion row reads/month free. |
| **Bandwidth (Egress) Costs**| Bandwidth charges apply when mobile clients stream voice notes or download high-res ID photos. | **Cloudflare R2 has $0 egress fees**, allowing completely free audio note streaming and image downloads. |
| **Vendor Lock-in** | Tightly coupled vendor extensions (e.g. Supabase proprietary features). | **100% portable open standards**: standard SQLite (`.db` / SQL dump) and standard AWS S3 API. |

---

## 3. The Active Technology Stack

### A. Frontend: `Anulekh-Native`
- **Framework**: React Native with Expo SDK 56 + React 19.
- **Styling**: NativeWind (Tailwind CSS v3) + Lucide Icons / Feather.
- **Audio & Media**: Direct streaming audio playback in chat, native document & image pickers (`expo-image-picker`, `expo-document-picker`).
- **Communication**: Lightweight REST client connecting directly to the Axum backend.

### B. Backend: `Anulekh-Axum`
- **Language & Framework**: Rust 2021 + Axum 0.7 + Tokio async runtime.
- **Database Driver**: `libsql` 0.6 connecting to remote Turso database over secure WebSockets/Hrana with automated keepalive pinging.
- **Object Storage Engine**: `aws-sdk-s3` generating AWS SigV4 signed presigned PUT URLs for Cloudflare R2.
- **Dev Fallback Engine**: If Cloudflare R2 credentials are not set in `.env`, the backend automatically saves uploads locally in `./uploads/` and serves them at `/uploads/*` so developers can test offline with zero third-party accounts.

### C. Database Layer: Turso (`libsql`)
- **Tables**: `users`, `profiles`, `exam_requests`, `scribe_applications`, `chat_messages`, `support_tickets`, `scribe_reviews`, `student_reviews`, `assignment_requests`, `scribe_achievements`, `certificates`.
- **Media Representation**:
  - `chat_messages.message_type` (`text` | `voice` | `image` | `pdf`)
  - `chat_messages.media_url` (Cloudflare R2 URL)
  - `chat_messages.media_duration` (Audio duration in seconds)
  - `profiles.aadhar_image_proof`, `profiles.disability_certificate` (Cloudflare R2 URLs)
  - `exam_requests.id_proof`, `exam_requests.admit_card_proof` (Cloudflare R2 URLs)

### D. Object Storage: Cloudflare R2
- **Capacity**: 10 GB free storage/month.
- **Bandwidth**: **$0 egress fees** (no charge for voice note audio playback or image viewing).
- **Structure**:
  - `chat/`: Voice notes (`.m4a`, `.ogg`) and chat attachments.
  - `proofs/`: Aadhar cards, disability certificates, and student ID proofs.
  - `tickets/`: Exam admit cards and hall tickets.
  - `avatars/`: User profile pictures.

---

## 4. Media Upload & Streaming Workflow

1. **Client requests a Presigned URL**:
   The client calls `POST /api/storage/presigned-url` with `{ folder: "chat", file_ext: "m4a", content_type: "audio/m4a" }`.
2. **Backend signs the request**:
   Axum generates a temporary AWS SigV4 presigned `PUT` URL valid for 15 minutes.
3. **Direct Upload (Bypassing Server)**:
   The mobile client executes a direct HTTP `PUT` to Cloudflare R2 with the binary file. The backend server's CPU and memory remain unaffected.
4. **Persist URL in Database**:
   The client saves the resulting `public_url` in Turso (e.g. inserting into `chat_messages` or updating `profiles`).
5. **Playback / Display**:
   Mobile and web clients stream the audio or display the image directly from Cloudflare's global edge CDN.

---

## 5. Future Migration & Portability Guarantee

Because we strictly adhere to open standards, migrating away from this stack in the future requires zero architectural redesign:

### Moving Data Out of Turso
To migrate to PostgreSQL (Neon, Supabase, AWS RDS, etc.):
```bash
# 1. Export database to a standard SQL file
turso db dump anulekh-db > anulekh_backup.sql

# 2. Convert and import to PostgreSQL using pgloader in one command:
pgloader sqlite:///path/to/anulekh_backup.db postgresql://user:pass@host/dbname
```
*Because media files are not stored in the database, the dump is featherweight (under 50 MB), and migration completes in seconds.*

### Moving Files Out of Cloudflare R2
To migrate to AWS S3, Google Cloud Storage, or self-hosted MinIO:
```bash
# Sync entire R2 bucket to any other S3 provider:
rclone sync r2:anulekh-media s3:new-provider-bucket
```
Because Cloudflare R2 has **$0 egress fees**, migrating gigabytes of voice notes and documents to another provider costs **$0.00**.

---

## 6. Environment Configuration Reference

### Backend (`Anulekh-Axum/.env`):
```env
PORT=3000
DATABASE_URL=libsql://anulekh-db-[your-name].turso.io
TURSO_AUTH_TOKEN=[your-turso-token]

# Cloudflare R2 (leave blank for local ./uploads/ dev fallback)
R2_ACCOUNT_ID=[your-cloudflare-account-id]
R2_ACCESS_KEY_ID=[your-r2-access-key-id]
R2_SECRET_ACCESS_KEY=[your-r2-secret-access-key]
R2_BUCKET_NAME=anulekh-media
R2_PUBLIC_DOMAIN=https://media.anulekh.in

# Optional AI / SMS / Email integrations
GEMINI_API_KEY=
SMTP_PASSWORD=
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_PHONE_NUMBER=
```

### Frontend (`Anulekh-Native/.env`):
```env
EXPO_PUBLIC_API_URL=http://localhost:3000
```
