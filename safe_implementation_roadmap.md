# 🛡️ Safe Implementation Roadmap: FastAPI to Axum + Turso Migration

To guarantee we **never break your current working app**, we will use a **Parallel Run Strategy**. This means we build, deploy, and verify the new Rust + Cloud database backend *separately* without touching or stopping your working Python + SQLite backend. 

If anything goes wrong, you can revert back to the original backend instantly with a single line change.

---

## 🗺️ Phase-by-Phase Roadmap

### 📦 Phase 1: Local Rust Server Setup (Zero External Dependencies)
**Goal:** Build the Rust backend locally and get it running on port `3001` (leaving FastAPI on `3000` untouched).
- [ ] Create the `Anulekh-Axum` folder structure.
- [ ] Initialize Cargo project and add dependencies.
- [ ] Write `schema.sql` and the database connection manager.
- [ ] Implement local SQLite support first for quick offline testing.
- [ ] Implement `/api/auth/signup`, `/api/auth/signin`, and `/api/query` routes.
- [ ] Run the Rust server locally on `http://localhost:3001`.

### 🧪 Phase 2: Dual-Backend Verification (Differential Testing)
**Goal:** Ensure the Rust server returns the *exact* same JSON structures and status codes as FastAPI.
- [ ] Keep FastAPI running on `http://localhost:3000`.
- [ ] Run Axum running on `http://localhost:3001`.
- [ ] Send identical login/signup requests to both and compare responses.
- [ ] Test the dynamic `/api/query` endpoint with various SELECT, INSERT, and UPDATE payloads to confirm the database response is identical.
- [ ] Temporarily point the React Native Web App (`.env`) to `http://localhost:3001` and verify the frontend functions perfectly.

### ☁️ Phase 3: Setup Cloud Database (Turso)
**Goal:** Create a secure, distributed database in the cloud.
- [ ] Sign up at [turso.tech](https://turso.tech) (Free).
- [ ] Create a database instance (`anulekh-db`) using Mumbai location (`ap-south`) for India.
- [ ] Run `schema.sql` against Turso using the Turso CLI to create all tables.
- [ ] Generate your access token (`TURSO_AUTH_TOKEN`).
- [ ] Switch the local Rust server config to connect to Turso and verify it reads/writes successfully.

### 🚀 Phase 4: Deploy Rust Server to Render.com
**Goal:** Run the Rust backend in the cloud on Render's free tier.
- [ ] Push the `Anulekh-Axum` code directory to a new public/private GitHub repository.
- [ ] Log in to [render.com](https://render.com) and create a new **Web Service** linked to that repo.
- [ ] Select **Docker** environment (Render automatically reads our `Dockerfile`).
- [ ] Configure Environment Variables on Render:
  - `DATABASE_URL` (Your Turso link)
  - `TURSO_AUTH_TOKEN` (Your Turso token)
  - `PORT` = `3000`
- [ ] Trigger deployment and wait for the successful build log.
- [ ] Verify the hosted URL is active by visiting `https://your-app.onrender.com/` (it should load).

### 📱 Phase 5: Point App to Cloud & Generate APK
**Goal:** Link your React Native App (web and mobile) to the cloud and test.
- [ ] Edit `Native-Mobile/.env` and update `EXPO_PUBLIC_API_URL` to your Render URL.
- [ ] Run the app locally in the browser and test registration, logins, and creating requests.
- [ ] Once confirmed working, run the Expo build command:
  ```bash
  eas build -p android --profile preview
  ```
- [ ] Install the compiled `.apk` on your phone.
- [ ] Test the mobile application completely offline from local computers—it will connect automatically to the cloud backend.

---

## 🚨 Risk Mitigation & Rollback Plan

| Risk | Mitigation | Rollback Action |
| :--- | :--- | :--- |
| **Rust compile fails on Render** | We use a multi-stage Docker build to test compiles locally before pushing. | None needed; your live app isn't affected since Render won't deploy failed builds. |
| **Render cloud latency is high** | We deployed Turso to Mumbai (`ap-south`) to keep DB connection times under 15ms. | If Render is slow, we can deploy to Fly.io or switch back to local. |
| **Bugs found during APK testing** | The FastAPI local backend remains completely untouched. | Revert `EXPO_PUBLIC_API_URL` in `.env` back to `http://localhost:3000` and build a new APK. |
| **Render server goes to sleep** | The free tier sleeps after 15m of inactivity. | Simply wait ~10 seconds on the first load of the day to wake it up. |
