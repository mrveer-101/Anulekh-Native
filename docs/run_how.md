# Anulekh - Sharing & Testing Guide (FastAPI + Supabase PostgreSQL)

This guide explains how to package, host, and test the **Anulekh** application. The project is split into two directories:
1. **`Anulekh Backend`**: FastAPI backend server supporting SQLite (locally) and Supabase PostgreSQL (remotely).
2. **`Native-Mobile`**: Expo (React Native) mobile/web frontend.

---

## 🛠️ Step 1: Set Up your Supabase Database
1. Go to [Supabase.com](https://supabase.com) and sign up for a free account.
2. Create a new project named **Anulekh**.
3. Under **Project Settings** -> **Database**, copy your **URI Connection String** (select the Transaction or Session pooler, typically starts with `postgresql://...`). Make sure to replace `[YOUR-PASSWORD]` with your actual project database password.

---

## 🚀 Step 2: Deploy the FastAPI Backend to Render (Free)
1. Push the `Anulekh Backend` folder to your GitHub repository.
2. Sign up/log in to [Render.com](https://render.com) (free).
3. Click **New +** -> **Web Service**.
4. Connect your GitHub repository.
5. Configure the service settings:
   * **Language**: `Python`
   * **Build Command**: `pip install -r requirements.txt`
   * **Start Command**: `uvicorn main:app --host 0.0.0.0 --port 10000`
6. Add the Database Environment Variable:
   * Under **Environment**, click **Add Environment Variable**.
   * **Key**: `DATABASE_URL`
   * **Value**: Your Supabase PostgreSQL Connection String (copied in Step 1).
7. Deploy the service. Once built, Render will give you a public URL (e.g. `https://anulekh-backend.onrender.com`).
   * *Note: Render automatically runs `Base.metadata.create_all` on startup, creating all tables directly on Supabase.*

---

## 📱 Step 3: Configure the Frontend for your Tester
When sending the project to your friend:
1. **Create the Environment File**:
   In the `Native-Mobile` directory, create a file named `.env` and insert your public backend API URL:
   ```env
   EXPO_PUBLIC_API_URL=https://anulekh-backend.onrender.com
   ```
2. **Package the Project**:
   Zip the entire parent directory containing `Native-Mobile` and `Anulekh Backend`.
   * *Important: To keep the zip file tiny (under 5MB), make sure to **exclude** the `node_modules`, `.expo`, `dist`, and python `venv` / `__pycache__` folders.*

---

## 🧑‍💻 How your Friend Runs the Application
When your friend receives the zip file and extracts it:

### 1. Run the Frontend (Locally)
They only need to run the frontend since the backend and database are hosted online:
1. Open a terminal in the `Native-Mobile` directory.
2. Run the following commands:
   ```bash
   # Install dependencies
   npm install

   # Start the Expo web/mobile client
   npm run web
   ```
3. The app will open in their browser at `http://localhost:8081` and automatically connect to your hosted Supabase/Render server over the internet.

### 2. Run the Backend & DB (For Local Override)
If they want to run the FastAPI backend locally using SQLite:
1. Open a terminal in the `Anulekh Backend` directory.
2. Run the following commands:
   ```bash
   # Create and activate a python virtual environment
   python -m venv venv
   # On Windows:
   venv\Scripts\activate
   # On macOS/Linux:
   source venv/bin/activate

   # Install requirements
   pip install -r requirements.txt

   # Start local FastAPI server
   uvicorn main:app --reload --port 3000
   ```
3. In `Native-Mobile/.env`, change the variable to point to localhost:
   ```env
   EXPO_PUBLIC_API_URL=http://localhost:3000
   ```

---

## 📋 End-to-End Testing Checklist
Once running, you and your friend can test the entire coordination flow in real-time:
1. **Register**: Go to sign up and create a student account (e.g. `Cloud`) and a scribe account (e.g. `Aditya`).
2. **Onboard**: Complete the student profile onboarding (Aadhar, DOB, phone numbers).
3. **Approve**: Click **Auto-Approve** on the dashboard.
4. **Request Scribe**: Create a new scribe request (e.g. "Physics-I") with exam dates and venue.
5. **Apply**: Log in as a Scribe on another tab or browser, find the request under "Local Exam Invites", and apply.
6. **Accept**: Log back in as a Student, click the blue pending applications count bubble next to your request, and click **Accept**.
7. **Coordinate**:
   * Switch to the **Plan** tab on both portals.
   * Tap **Call** to see the phone number.
   * Tap **Chat** to chat in real-time (using SQLite/PostgreSQL messaging).
   * Tap **View Declaration** to see the digital signature and form.
