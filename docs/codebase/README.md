# Anulekh — Codebase Guide

Anulekh (अनुलेख) matches visually-impaired and differently-abled **students** with verified volunteer
**scribes** for exams and assignments. Every source file also starts with a header comment.

| Doc | Covers |
|---|---|
| [ARCHITECTURE.md](ARCHITECTURE.md) | How the app is built: data client, routes, screens, desktop layout, caching, design system |
| [DATA.md](DATA.md) | Database tables and status lifecycles |
| [OPERATIONS.md](OPERATIONS.md) | Run locally, checks, deploy, known issues |
| [Backend API](../../../Anulekh-Axum/docs/codebase/API.md) | Rust/Axum modules, endpoints, configuration |

## System at a glance

```
Expo app (Android · iOS · Web)  ──HTTPS JSON──▶  Rust/Axum backend (Render)  ──libsql──▶  Turso (local.db in dev)
                                                 └─ admin panel (admin.html at /)          media → Cloudflare R2
```

## Folder map (`src/`)

| Folder | Contents |
|---|---|
| `app/` | Routes (Expo Router). `_layout.tsx` = root shell, `index.tsx` = entry gate |
| `components/student`, `scribe`, `shared` | Portal tab screens (same screens on phone and desktop) |
| `components/pc_view` | Desktop consoles (sidebar + header) and landing page |
| `components/ui` | Splash, `TabPane`, `DesktopShell`, update popup |
| `core/` | Data client, translation, theme, cache, haptics, notifications, a11y |
| `services/` | Update checker, uploads (`services/api/*` is unused, kept for a refactor) |

## Core flow

1. Register → complete verification profile → admin approves.
2. Student posts an **exam** or **assignment** request (or invites a scribe directly).
3. Scribes apply → student accepts one → request `matched`.
4. Chat, voice notes, call (exam day), declaration. Unmatched ≤ 24 h before the exam → **SOS**.
5. After the exam: `completed`, both sides rate each other, scribes earn badges/certificates.
