# Anulekh - Sharing & Testing Guide (Rust Axum + Turso + Cloudflare R2)

This guide explains how to run, host, and test the **Anulekh** application.

---

## 🛠️ System Overview

The project consists of two core components:
1. **`Anulekh-Axum`**: High-performance Rust / Axum backend connected to a Turso database and Cloudflare R2 object storage.
2. **`Anulekh-Native`**: Expo (React Native) mobile and web frontend.

---

## 🚀 Step 1: Run the Backend (Anulekh-Axum)

1. Open a terminal in `Anulekh-Axum`:
   ```bash
   cd Anulekh-Axum
   ```
2. Configure `.env` with your Turso credentials:
   ```env
   PORT=3000
   DATABASE_URL=libsql://anulekh-db-[your-name].turso.io
   TURSO_AUTH_TOKEN=[your-token]
   
   # Cloudflare R2 (Optional for local testing — falls back to local ./uploads/)
   R2_ACCOUNT_ID=
   R2_ACCESS_KEY_ID=
   R2_SECRET_ACCESS_KEY=
   R2_BUCKET_NAME=anulekh-media
   R2_PUBLIC_DOMAIN=
   ```
3. Run the backend:
   ```bash
   cargo run
   ```
   The backend will connect to Turso, verify database tables, and start listening on `http://localhost:3000`.

---

## 📱 Step 2: Run the Frontend (Anulekh-Native)

1. Open a terminal in `Anulekh-Native`:
   ```bash
   cd Anulekh-Native
   ```
2. Ensure `.env` is configured:
   ```env
   EXPO_PUBLIC_API_URL=http://localhost:3000
   ```
3. Install dependencies:
   ```bash
   npm install
   ```
4. Start the Expo development server:
   ```bash
   npx expo start
   ```
   - Press **`w`** for web browser preview.
   - Scan the QR code with **Expo Go** on Android/iOS.

---

## ☁️ Production Deployment (Render)

1. Deploy `Anulekh-Axum` on Render using Docker or Native Rust.
2. Add environment variables (`DATABASE_URL`, `TURSO_AUTH_TOKEN`, `R2_*`).
3. Set `EXPO_PUBLIC_API_URL` in the frontend to your Render URL (e.g. `https://anulekh-axum.onrender.com`).
