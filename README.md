# Anulekh 🌟

**Anulekh** (अनुलेख) is a cross-platform mobile platform designed to bridge the accessibility gap by connecting visually impaired and needful students with volunteer scribes based on location, language, and academic subject.

---

## 📖 Mission
To provide on-demand, reliable, and accessible scribe assistance for exams, ensuring that no student is held back due to visual impairment or temporary physical disabilities.

---

## 🛠️ The Tech Stack

Anulekh leverages a decoupled, high-performance architecture:

| Layer | Technology | Key Responsibility |
| :--- | :--- | :--- |
| **Frontend** | **React Native (Expo)** | Cross-platform mobile UI, Native Accessibility APIs, Web previews |
| **Styling** | **NativeWind (Tailwind CSS)** | High-contrast layouts, consistent branding, accessible typography |
| **Animations** | **React Native Reanimated** | Fluid micro-animations and transition effects |
| **Backend** | **Rust (Axum)** | High-performance asynchronous API, matching engine, and storage presigning |
| **Database** | **Turso (Serverless SQLite)** | Low-latency cloud relational database powered by `libsql` |
| **Media Storage** | **Cloudflare R2** | Zero-egress object storage for photos, certificates, and voice notes |

---

## 🗺️ System Flow

```
[Visually Impaired Student]
          │
          ▼
   React Native App (Expo)
          │
          ├─► 1. Request Upload URL ──► [Rust Axum Backend]
          │                                  │ (Signs S3 Presigned URL)
          │◄─────────────────────────────────┘
          │
          ├─► 2. Direct Media Upload ─► [Cloudflare R2 Bucket]
          │                                  │ (Stores images & voice notes)
          │
          └─► 3. API & Data Queries ──► [Rust Axum Backend] ──► [Turso Database]
```

1. **Authentication**: The user signs up and logs in via the app through the Axum backend, with OTP verification.
2. **Media & Document Uploads**: ID cards, disability certificates, and voice chat audio notes are uploaded directly to Cloudflare R2 using secure presigned URLs, keeping the database fast and lightweight.
3. **Scribe Requests & Matching**: Students place exam scribe requests with subject, date, venue, and language requirements. Eligible volunteers are matched and notified.
4. **Communication**: Real-time messaging and voice notes connect student and scribe once matched.

---

## 🚀 Getting Started (Mobile Frontend)

To preview the mobile app on a web browser or using Expo Go on your mobile device:

### Prerequisites
Ensure you have **Node.js** (v18+) installed.

### Setup Instructions
1. Navigate to the frontend directory:
   ```bash
   cd Anulekh-Native
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Ensure `.env` is configured to point to your backend:
   ```env
   EXPO_PUBLIC_API_URL=http://localhost:3000
   ```
4. Start the dev server:
   ```bash
   npx expo start
   ```
5. Choose preview method:
   - Press **`w`** for Web Preview.
   - Scan the QR code on your phone using **Expo Go** for physical device preview.
