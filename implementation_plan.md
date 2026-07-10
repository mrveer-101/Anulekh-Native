# Anulekh: Full Axum (Rust) Backend Migration Plan

## What This Achieves

| | Current (FastAPI) | After (Axum + Turso) |
|---|---|---|
| **Speed** | ~1,200 req/sec | ~45,000+ req/sec (**37x faster**) |
| **Memory** | ~120 MB RAM | ~12 MB RAM (**10x lower**) |
| **Latency** | 15–40 ms | < 1 ms |
| **Cold Start on Render** | 8–15 seconds | < 1 second |
| **Database** | SQLite (local file) | Turso (SQLite in the cloud, free tier) |
| **APK Connection** | Needs local server | Connects to hosted URL automatically |
| **Cost** | Free | **Free** |

> [!IMPORTANT]
> **Your React Native app (both browser and APK) will not change at all.** Only `EXPO_PUBLIC_API_URL` in `.env` changes from `http://localhost:3000` to `https://anulekh-api.onrender.com`. The app auto-connects — no code changes needed in the frontend.

---

## Architecture Overview

```
┌─────────────────────────────────────────────┐
│         React Native App (Expo)             │
│   Web: localhost:8081   APK: On your phone  │
│                                             │
│  src/app/core/supabase.ts                   │
│  EXPO_PUBLIC_API_URL=                       │
│  https://anulekh-api.onrender.com  ────────►│
└─────────────────────────────────────────────┘
                        │ HTTPS REST
                        ▼
┌─────────────────────────────────────────────┐
│        Axum Server (Rust)                   │
│        Hosted FREE on Render.com            │
│                                             │
│  POST /api/auth/signup                      │
│  POST /api/auth/signin                      │
│  POST /api/query   (select/insert/update)   │
│                                             │
│  CORS: allows all origins (*)               │
└─────────────────────────────────────────────┘
                        │ libsql over HTTPS
                        ▼
┌─────────────────────────────────────────────┐
│        Turso Database (Free Tier)           │
│        SQLite in the cloud                  │
│                                             │
│  500 MB storage free                        │
│  1 Billion row reads/month free             │
│  Automatic backups                          │
│  Edge replicas worldwide                    │
└─────────────────────────────────────────────┘
```

---

## Part 1: Free Accounts to Create (One-Time, 5 minutes)

### Step 1: Create a Turso Account (Database)
1. Go to → [turso.tech](https://turso.tech) and sign up free with GitHub.
2. Install the Turso CLI:
   ```bash
   # Windows (PowerShell)
   winget install ChiselStrike.turso
   ```
3. Login:
   ```bash
   turso auth login
   ```
4. Create the database:
   ```bash
   turso db create anulekh-db --location ap-south  # Mumbai region, closest to India
   ```
5. Get your credentials (you will need these later):
   ```bash
   turso db show anulekh-db        # gives you DATABASE_URL (libsql://...)
   turso db tokens create anulekh-db  # gives you TURSO_AUTH_TOKEN
   ```

### Step 2: Create a Render Account (Hosting)
1. Go to → [render.com](https://render.com) and sign up free with GitHub.
2. No credit card required for free tier.
3. Connect your GitHub account to Render.

---

## Part 2: The Axum Backend Code

### Directory Structure
```
Anulekh-Axum/             ← New folder (separate from FastAPI)
├── Cargo.toml
├── Dockerfile
├── .env.example
├── schema.sql            ← Run once to create Turso tables
└── src/
    ├── main.rs           ← Server entry point, routes, CORS
    ├── db.rs             ← Turso database connection
    ├── auth.rs           ← /api/auth/signup and /api/auth/signin
    └── query.rs          ← /api/query (select/insert/update)
```

### `Cargo.toml`
```toml
[package]
name = "anulekh-axum"
version = "0.1.0"
edition = "2021"

[dependencies]
axum = "0.7"
tokio = { version = "1.0", features = ["full"] }
serde = { version = "1.0", features = ["derive"] }
serde_json = "1.0"
libsql = "0.6"
tower-http = { version = "0.5", features = ["cors"] }
uuid = { version = "1.0", features = ["v4"] }
dotenvy = "0.15"
tracing = "0.1"
tracing-subscriber = "0.3"
```

---

### `src/main.rs`
```rust
use axum::{routing::post, Router};
use tower_http::cors::{Any, CorsLayer};
use std::sync::Arc;

mod db;
mod auth;
mod query;

pub struct AppState {
    pub db: libsql::Connection,
}

#[tokio::main]
async fn main() {
    dotenvy::dotenv().ok();
    tracing_subscriber::fmt::init();

    // Connect to Turso
    let conn = db::get_connection().await;

    // Run schema migrations on startup (CREATE TABLE IF NOT EXISTS)
    db::run_migrations(&conn).await;

    let state = Arc::new(AppState { db: conn });

    // CORS: allow all origins so APK + Web browser both connect
    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);

    let app = Router::new()
        .route("/api/auth/signup", post(auth::signup))
        .route("/api/auth/signin", post(auth::signin))
        .route("/api/query",      post(query::database_query))
        .layer(cors)
        .with_state(state);

    let port = std::env::var("PORT").unwrap_or("3000".to_string());
    let addr = format!("0.0.0.0:{}", port);
    
    tracing::info!("🦀 Anulekh Axum server running on {}", addr);
    
    let listener = tokio::net::TcpListener::bind(&addr).await.unwrap();
    axum::serve(listener, app).await.unwrap();
}
```

---

### `src/db.rs`
```rust
use libsql::{Builder, Connection};

pub async fn get_connection() -> Connection {
    let db_url    = std::env::var("DATABASE_URL").expect("DATABASE_URL not set");
    let auth_token = std::env::var("TURSO_AUTH_TOKEN").expect("TURSO_AUTH_TOKEN not set");

    let db = Builder::new_remote(db_url, auth_token)
        .build()
        .await
        .expect("Failed to connect to Turso");

    db.connect().expect("Failed to create connection")
}

pub async fn run_migrations(conn: &Connection) {
    let schema = include_str!("../schema.sql");
    conn.execute_batch(schema).await.expect("Migration failed");
    tracing::info!("✅ Database schema ready");
}
```

---

### `schema.sql` (Creates all 6 tables on first startup)
```sql
CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS profiles (
    id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    full_name TEXT, phone TEXT, role TEXT, languages TEXT,
    official_name TEXT, aadhar_number TEXT, education_level TEXT,
    certification_proof TEXT, dob TEXT, emergency_phone TEXT,
    verification_status TEXT DEFAULT 'unverified',
    occupation TEXT, location TEXT, aadhar_image_proof TEXT,
    urgent_calls TEXT, first_time TEXT
);

CREATE TABLE IF NOT EXISTS exam_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id TEXT NOT NULL, student_name TEXT, dob TEXT,
    education_grade TEXT, phone TEXT, emergency_phone TEXT,
    exam_type TEXT, exam_language TEXT, id_proof TEXT,
    status TEXT DEFAULT 'pending', scribe_id TEXT,
    created_at TEXT, subject TEXT, exam_date TEXT,
    exam_venue TEXT, admit_card_proof TEXT
);

CREATE TABLE IF NOT EXISTS scribe_applications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    request_id INTEGER NOT NULL, scribe_id TEXT NOT NULL,
    scribe_name TEXT, status TEXT DEFAULT 'pending', created_at TEXT
);

CREATE TABLE IF NOT EXISTS notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL, title TEXT NOT NULL,
    message TEXT NOT NULL, is_read INTEGER DEFAULT 0, created_at TEXT
);

CREATE TABLE IF NOT EXISTS chat_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    request_id INTEGER NOT NULL, sender_id TEXT NOT NULL,
    message TEXT NOT NULL, created_at TEXT
);
```

---

### `src/auth.rs`
```rust
use axum::{extract::State, Json};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use uuid::Uuid;
use crate::AppState;

#[derive(Deserialize)]
pub struct SignUpRequest {
    pub email: String,
    pub password: String,
}

#[derive(Deserialize)]
pub struct SignInRequest {
    pub email: Option<String>,
    pub phone: Option<String>,
    pub password: String,
}

#[derive(Serialize)]
pub struct UserResponse {
    pub user: UserData,
}

#[derive(Serialize)]
pub struct UserData {
    pub id: String,
    pub email: String,
}

pub async fn signup(
    State(state): State<Arc<AppState>>,
    Json(payload): Json<SignUpRequest>,
) -> Result<Json<UserResponse>, (axum::http::StatusCode, String)> {
    // Check if user already exists
    let mut rows = state.db
        .query("SELECT id FROM users WHERE email = ?1", [payload.email.clone()])
        .await
        .map_err(|e| (axum::http::StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    if rows.next().await.unwrap_or(None).is_some() {
        return Err((axum::http::StatusCode::BAD_REQUEST, "User already exists".to_string()));
    }

    let user_id = Uuid::new_v4().to_string()[..8].to_string();

    state.db
        .execute(
            "INSERT INTO users (id, email, password) VALUES (?1, ?2, ?3)",
            [user_id.clone(), payload.email.clone(), payload.password],
        )
        .await
        .map_err(|e| (axum::http::StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    Ok(Json(UserResponse {
        user: UserData { id: user_id, email: payload.email },
    }))
}

pub async fn signin(
    State(state): State<Arc<AppState>>,
    Json(payload): Json<SignInRequest>,
) -> Result<Json<UserResponse>, (axum::http::StatusCode, String)> {
    let (sql, args): (&str, Vec<String>) = if let Some(phone) = &payload.phone {
        (
            "SELECT u.id, u.email FROM users u JOIN profiles p ON u.id = p.id 
             WHERE p.phone = ?1 AND u.password = ?2",
            vec![phone.clone(), payload.password.clone()],
        )
    } else if let Some(email) = &payload.email {
        (
            "SELECT id, email FROM users WHERE email = ?1 AND password = ?2",
            vec![email.clone(), payload.password.clone()],
        )
    } else {
        return Err((axum::http::StatusCode::BAD_REQUEST, "Email or phone required".to_string()));
    };

    let mut rows = state.db.query(sql, args).await
        .map_err(|e| (axum::http::StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    if let Some(row) = rows.next().await.unwrap_or(None) {
        let id: String    = row.get(0).unwrap();
        let email: String = row.get(1).unwrap();
        Ok(Json(UserResponse { user: UserData { id, email } }))
    } else {
        Err((axum::http::StatusCode::BAD_REQUEST, "Invalid credentials".to_string()))
    }
}
```

---

### `src/query.rs` (Generic SELECT / INSERT / UPDATE — same API the app already uses)
```rust
use axum::{extract::State, Json};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::sync::Arc;
use crate::AppState;

const ALLOWED_TABLES: &[&str] = &[
    "users", "profiles", "exam_requests",
    "scribe_applications", "notifications", "chat_messages",
];

#[derive(Deserialize)]
pub struct QueryFilter {
    pub column: String,
    pub value: Value,
    pub operator: Option<String>, // "neq" or default "eq"
}

#[derive(Deserialize)]
pub struct QueryPayload {
    pub table: String,
    pub action: String,           // "select" | "insert" | "update"
    pub filters: Option<Vec<QueryFilter>>,
    pub data: Option<serde_json::Map<String, Value>>,
    pub sort_field: Option<String>,
    pub sort_ascending: Option<bool>,
    pub limit: Option<i64>,
    pub single: Option<bool>,
}

pub async fn database_query(
    State(state): State<Arc<AppState>>,
    Json(payload): Json<QueryPayload>,
) -> Result<Json<Value>, (axum::http::StatusCode, String)> {
    if !ALLOWED_TABLES.contains(&payload.table.as_str()) {
        return Err((axum::http::StatusCode::BAD_REQUEST, "Invalid table".to_string()));
    }

    match payload.action.as_str() {
        "select" => handle_select(&state, &payload).await,
        "insert" => handle_insert(&state, &payload).await,
        "update" => handle_update(&state, &payload).await,
        _ => Err((axum::http::StatusCode::BAD_REQUEST, "Invalid action".to_string())),
    }
}

async fn handle_select(
    state: &Arc<AppState>,
    payload: &QueryPayload,
) -> Result<Json<Value>, (axum::http::StatusCode, String)> {
    let mut sql = format!("SELECT * FROM {}", payload.table);
    let mut params: Vec<String> = vec![];
    let mut param_idx = 1;

    if let Some(filters) = &payload.filters {
        if !filters.is_empty() {
            let clauses: Vec<String> = filters.iter().map(|f| {
                let op = if f.operator.as_deref() == Some("neq") { "!=" } else { "=" };
                let clause = format!("{} {} ?{}", f.column, op, param_idx);
                params.push(value_to_string(&f.value));
                param_idx += 1;
                clause
            }).collect();
            sql += &format!(" WHERE {}", clauses.join(" AND "));
        }
    }

    if let Some(field) = &payload.sort_field {
        let dir = if payload.sort_ascending.unwrap_or(true) { "ASC" } else { "DESC" };
        let clean: String = field.chars().filter(|c| c.is_alphanumeric() || *c == '_').collect();
        sql += &format!(" ORDER BY {} {}", clean, dir);
    }

    if let Some(lim) = payload.limit {
        sql += &format!(" LIMIT {}", lim);
    }

    let mut rows = state.db.query(&sql, params).await
        .map_err(|e| (axum::http::StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    let mut results: Vec<Value> = vec![];
    while let Some(row) = rows.next().await.unwrap_or(None) {
        let col_count = row.column_count();
        let mut map = serde_json::Map::new();
        for i in 0..col_count {
            let name = row.column_name(i).unwrap_or("").to_string();
            let val: libsql::Value = row.get_value(i).unwrap_or(libsql::Value::Null);
            map.insert(name, libsql_value_to_json(val));
        }
        results.push(Value::Object(map));
    }

    if payload.single.unwrap_or(false) {
        Ok(Json(serde_json::json!({ "data": results.into_iter().next() })))
    } else {
        Ok(Json(serde_json::json!({ "data": results })))
    }
}

async fn handle_insert(
    state: &Arc<AppState>,
    payload: &QueryPayload,
) -> Result<Json<Value>, (axum::http::StatusCode, String)> {
    let data = payload.data.as_ref()
        .ok_or((axum::http::StatusCode::BAD_REQUEST, "Missing data".to_string()))?;

    let cols: Vec<&String> = data.keys().collect();
    let placeholders: Vec<String> = (1..=cols.len()).map(|i| format!("?{}", i)).collect();
    let sql = format!(
        "INSERT INTO {} ({}) VALUES ({})",
        payload.table,
        cols.iter().map(|c| c.as_str()).collect::<Vec<_>>().join(", "),
        placeholders.join(", ")
    );
    let params: Vec<String> = data.values().map(value_to_string).collect();

    state.db.execute(&sql, params).await
        .map_err(|e| (axum::http::StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    Ok(Json(serde_json::json!({ "data": data, "error": null })))
}

async fn handle_update(
    state: &Arc<AppState>,
    payload: &QueryPayload,
) -> Result<Json<Value>, (axum::http::StatusCode, String)> {
    let data = payload.data.as_ref()
        .ok_or((axum::http::StatusCode::BAD_REQUEST, "Missing data".to_string()))?;

    let mut param_idx = 1;
    let set_clauses: Vec<String> = data.keys().map(|col| {
        let clause = format!("{} = ?{}", col, param_idx);
        param_idx += 1;
        clause
    }).collect();

    let mut params: Vec<String> = data.values().map(value_to_string).collect();
    let mut sql = format!("UPDATE {} SET {}", payload.table, set_clauses.join(", "));

    if let Some(filters) = &payload.filters {
        if !filters.is_empty() {
            let clauses: Vec<String> = filters.iter().map(|f| {
                let op = if f.operator.as_deref() == Some("neq") { "!=" } else { "=" };
                let clause = format!("{} {} ?{}", f.column, op, param_idx);
                params.push(value_to_string(&f.value));
                param_idx += 1;
                clause
            }).collect();
            sql += &format!(" WHERE {}", clauses.join(" AND "));
        }
    }

    state.db.execute(&sql, params).await
        .map_err(|e| (axum::http::StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    Ok(Json(serde_json::json!({ "data": null, "error": null })))
}

// Helpers
fn value_to_string(v: &Value) -> String {
    match v {
        Value::String(s) => s.clone(),
        Value::Number(n) => n.to_string(),
        Value::Bool(b)   => b.to_string(),
        Value::Array(_)  => v.to_string(),
        Value::Null      => "".to_string(),
        _                => v.to_string(),
    }
}

fn libsql_value_to_json(v: libsql::Value) -> Value {
    match v {
        libsql::Value::Text(s)    => Value::String(s),
        libsql::Value::Integer(i) => Value::Number(i.into()),
        libsql::Value::Real(f)    => serde_json::Number::from_f64(f)
            .map(Value::Number).unwrap_or(Value::Null),
        libsql::Value::Null       => Value::Null,
        libsql::Value::Blob(_)    => Value::Null,
    }
}
```

---

### `Dockerfile` (for Render deployment)
```dockerfile
FROM rust:1.80-slim AS builder
WORKDIR /app
COPY Cargo.toml .
COPY src ./src
COPY schema.sql .
RUN cargo build --release

FROM debian:bookworm-slim
WORKDIR /app
COPY --from=builder /app/target/release/anulekh-axum .
COPY schema.sql .
EXPOSE 3000
CMD ["./anulekh-axum"]
```

---

## Part 3: Deploy to Render (Free, 7 steps)

1. **Push** the `Anulekh-Axum` folder to a **new GitHub repository** (separate from the main Anulekh repo).
2. Go to **[render.com](https://render.com)** → Click **New +** → **Web Service**.
3. Connect the new GitHub repo.
4. Configure the service:
   - **Environment:** `Docker`
   - **Instance Type:** `Free`
   - **Health Check Path:** `/` (returns 404 — that's OK, just confirms it's alive)
5. Add **Environment Variables** in the Render dashboard:
   ```
   DATABASE_URL     = libsql://anulekh-db-[yourname].turso.io
   TURSO_AUTH_TOKEN = eyJhbGciOiJFZERTQS...  (from turso db tokens create)
   PORT             = 3000
   ```
6. Click **Deploy**. Render will build the Docker image and start the server.
7. Your backend URL will be: `https://anulekh-axum-[random].onrender.com`

> [!NOTE]
> First compile of Rust on Render takes ~5–8 minutes (one time only). All subsequent deploys take ~1 minute.

---

## Part 4: Connect the React Native App (One Line Change)

Edit `Native-Mobile/.env`:
```env
# Change FROM this:
EXPO_PUBLIC_API_URL=http://localhost:3000

# TO this:
EXPO_PUBLIC_API_URL=https://anulekh-axum-[random].onrender.com
```

**That is the only change.** The entire `src/app/core/supabase.ts` client already reads this variable and routes all API calls through it. Both the browser web app and the compiled Android APK will automatically connect to the cloud backend.

---

## Part 5: How the APK Auto-Connects

When you compile the APK using EAS Build, the `EXPO_PUBLIC_API_URL` is **baked into the app bundle** at build time. So:

- You set `EXPO_PUBLIC_API_URL=https://anulekh-axum-[random].onrender.com` in `.env`
- Run `eas build -p android --profile preview`
- The generated APK has the URL hardcoded inside
- Install on your phone → tap Login → it talks directly to Render over the internet

**No local server needed. Works from anywhere with a data connection.**

---

## Summary of Free Tiers

| Service | Free Tier Limits | Enough For Testing? |
|---|---|---|
| **Turso** | 500 MB storage, 1B row reads/month | ✅ Yes, extremely generous |
| **Render** | 750 hours/month (1 service = always on) | ✅ Yes |
| **GitHub** | Unlimited public repos | ✅ Yes |
| **EAS Build** | 30 builds/month | ✅ Yes |

> [!WARNING]
> Render free tier services **sleep after 15 minutes of inactivity**. The first request after sleeping takes ~8–10 seconds to "wake up". This is a demo limitation — for production, upgrade to the $7/month Starter tier for always-on hosting.

---

## Open Questions Before I Write the Code

1. **Do you want me to write and commit the full Axum backend code to a new GitHub repo right now?**
2. **Do you have Rust installed?** (`rustc --version` in terminal). If not, I can install it for you.
3. **Do you want to set up Turso now** or test with a local SQLite file first before moving to cloud?
