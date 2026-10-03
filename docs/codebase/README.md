# Anulekh — Codebase Guide

Anulekh (अनुलेख) connects visually-impaired and differently-abled **students** with verified volunteer
**scribes** for exams and written assignments. This guide explains how the code is organised and how the
pieces work together. Every source file also starts with a header comment describing its role.

| # | Document | What it covers |
|---|---|---|
| 1 | [Architecture](01-architecture.md) | The three parts (app, backend, admin panel), how data flows, folder layout |
| 2 | [Routes & screens](02-routes-and-screens.md) | Every route in `src/app`, what each screen does, navigation flow |
| 3 | [Components](03-components.md) | Every reusable component in `src/components` |
| 4 | [Core modules & services](04-core-and-services.md) | `src/core`, `src/services`, `src/types` |
| 5 | [Data model](05-data-model.md) | Database tables, fields, status values, who reads/writes what |
| 6 | [Design system](06-design-system.md) | Portal themes, splash, icons/fonts, motion, accessibility |
| 7 | [Performance & caching](07-performance-and-caching.md) | Tab keep-alive, cached snapshots, parallel queries |
| 8 | [Development & deployment](08-development-and-deployment.md) | Running locally, builds, deploying web/mobile/backend |
| 9 | [Known issues & roadmap](09-known-issues.md) | Security and functional issues found during review, next steps |

The backend has its own reference: [`Anulekh-Axum/docs/codebase/API.md`](../../../Anulekh-Axum/docs/codebase/API.md).

Older documents in `docs/` (`architecture.md`, `implementation_plan.md`, roadmaps, …) are earlier planning
notes; where they disagree with this guide, this guide reflects the current code.
