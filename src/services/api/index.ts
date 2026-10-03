/**
 * API Services Barrel Export
 */

/**
 * Re-exports every typed REST service in `services/api/` so callers can write
 * `import { examService, apiClient } from '@/services/api'`.
 *
 * - `client`: `apiClient` fetch wrapper, `API_BASE_URL`, `ApiResponse`, `formatApiError`.
 * - the `*Service` modules: thin wrappers that build JSON query objects and POST
 *   them to the Rust/Axum backend's `/api/query` endpoint (the same backend the
 *   `supabase` shim in core/supabase.ts talks to).
 *
 * Note: at the time of writing, screens mostly use the `supabase` shim directly;
 * this barrel is not imported anywhere in the app.
 */

export * from './client';
export * from './authService';
export * from './examService';
export * from './applicationService';
export * from './profileService';
export * from './chatService';
