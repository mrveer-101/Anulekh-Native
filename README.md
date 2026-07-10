# Anulekh 🌟

**Anulekh** (अनुलेख) is a cross-platform mobile platform designed to bridge the accessibility gap by connecting visually impaired and needful students with volunteer scribes based on location, language, and academic subject.

---

## 📖 Mission
To provide on-demand, reliable, and accessible scribe assistance for exams, ensuring that no student is held back due to visual impairment or temporary physical disabilities.

---

## 🛠️ The Tech Stack

Anulekh leverages a modern, decoupled three-tier architecture:

| Layer | Technology | Key Responsibility |
| :--- | :--- | :--- |
| **Frontend** | **React Native (Expo)** | Cross-platform mobile UI, Native Accessibility APIs (VoiceOver/TalkBack), Web previews |
| **Styling** | **NativeWind (Tailwind CSS)** | Utility-first responsive design, consistent branding, high-contrast layouts |
| **Animations**| **React Native Reanimated** | Fluid micro-animations and transition effects for a premium native feel |
| **Backend** | **FastAPI (Python)** | High-performance async logic, PostGIS geospatial matching, JWT verification |
| **Database** | **Supabase (PostgreSQL)** | Persistent storage, Auth service, Row-Level Security (RLS) |
| **GIS Extension**| **PostGIS** | Fast, index-backed geography queries to locate nearby scribes |

---

## 🗺️ System Flow

```
[Visually Impaired Student]
          │
          ▼
   React Native App (Expo)
          │
          │ (HTTP POST + JWT Auth Token)
          ▼
    FastAPI Server ──[Verifies JWT Signature]
          │
          │ (PostGIS Geospatial 10km query)
          ▼
  Supabase Postgres DB ──[Returns Eligible Scribes]
          │
          ▼
  [Expo Push Notifications Sent to Scribes]
```

1. **Authentication**: The user logs in via the React Native app, talking directly to Supabase Auth to retrieve a secure JWT.
2. **Request Placement**: The student submits a "Scribe Request" with exam details, subject, language, and venue coordinates.
3. **Verification**: FastAPI receives the request, verifies the JWT signature locally, and validates the inputs.
4. **Matching**: FastAPI queries the Postgres database utilizing the **PostGIS** extension to find volunteers matching the language, subject, and within a **10km radius** of the venue.
5. **Notification**: The system triggers push notifications to eligible scribes, who can accept the request.

---

## 🗄️ Core Database Schema

The database utilizes three main tables with Row-Level Security (RLS) enabled:

### 1. `users` Table
Stores extended profiles linked to Supabase Auth.
* `id` (UUID, Primary Key - matches Supabase Auth ID)
* `role` (String: `'STUDENT'` or `'SCRIBE'`)
* `full_name` (String)
* `phone_number` (String - hidden/encrypted until match confirmation)
* `languages` (Array of Strings: `['Hindi', 'English']`)
* `location` (Geography Point: Longitude/Latitude)
* `expo_push_token` (String, nullable)

### 2. `scribe_requests` Table
The ticket created by the student.
* `id` (UUID, Primary Key)
* `student_id` (UUID, Foreign Key -> `users.id`)
* `exam_name` (String)
* `subject_or_course` (String)
* `academic_level` (String)
* `exam_date_time` (Timestamp)
* `venue_location` (Geography Point)
* `required_language` (String)
* `status` (String: `'OPEN'`, `'MATCHED'`, `'COMPLETED'`, `'CANCELLED'`)

### 3. `matches` Table
Tracks the connection between student and scribe.
* `id` (UUID, Primary Key)
* `request_id` (UUID, Foreign Key -> `scribe_requests.id`)
* `scribe_id` (UUID, Foreign Key -> `users.id`)
* `status` (String: `'PENDING_SCRIBE_ACCEPTANCE'`, `'CONFIRMED'`, `'COMPLETED'`, `'CANCELLED_BY_SCRIBE'`, `'CANCELLED_BY_STUDENT'`)

---

## 🚀 Getting Started (Mobile Frontend)

To preview the mobile app on a web browser or using Expo Go on your mobile device:

### Prerequisites
Ensure you have **Node.js** (v18+) installed.

### Setup Instructions
1. Navigate to the frontend directory:
   ```bash
   cd Native-Mobile
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Start the dev server:
   ```bash
   npx expo start
   ```
4. Choose preview method:
   - Press **`w`** for Web Preview.
   - Scan the QR code on your phone using **Expo Go** for physical device preview.
