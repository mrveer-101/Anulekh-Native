/**
 * Unified HTTP API Client for Anulekh Backend
 */
/**
 * Small typed `fetch` wrapper used by the REST service modules in services/api/
 * (authService, examService, ...) and by services/versionService.ts.
 *
 * It talks to the project's Rust/Axum backend — the same server the `supabase`
 * shim in core/supabase.ts calls — and never throws: every call resolves to an
 * `{ data, error }` pair so callers can branch on `error` without try/catch.
 * No auth token or cookie is attached; the backend identifies users by the ids
 * sent in the request body.
 */

import { Platform } from 'react-native';

/**
 * Base URL of the Axum backend.
 *
 * - Web build opened on localhost / 127.0.0.1 → the local dev server on port 3000.
 * - Everything else (native apps, deployed web) → `EXPO_PUBLIC_API_URL` if set,
 *   otherwise the hosted Render instance.
 *
 * Mirrors `API_URL` in core/supabase.ts; keep the two in sync.
 */
export const API_BASE_URL = (
  Platform.OS === 'web' &&
  typeof window !== 'undefined' &&
  (window?.location?.hostname === 'localhost' || window?.location?.hostname === '127.0.0.1')
)
  ? 'http://localhost:3000'
  : (process.env.EXPO_PUBLIC_API_URL || 'https://anulekh-axum.onrender.com');

/**
 * Result envelope returned by `apiClient`.
 * Exactly one of the fields is meaningful: on success `error` is null and `data`
 * holds the parsed body; on failure `data` is null and `error` is a
 * user-presentable message.
 *
 * @typeParam T Expected shape of the successful response body.
 */
export interface ApiResponse<T = any> {
  data: T | null;
  error: string | null;
}

/**
 * Turns an Error, string or unknown value into a message that is safe to show
 * to the user.
 *
 * `fetch` rejects with a vague "Network request failed" (native), "Failed to
 * fetch" (Chrome) or "Load failed" (Safari) when the backend is unreachable;
 * those are replaced with a clear "not connected" message.
 *
 * @param err      The caught error, or an error string from the server.
 * @param fallback Message used when `err` carries no text.
 * @returns A human-readable error string.
 */
export function formatApiError(err: any, fallback = 'An unexpected error occurred'): string {
  // Pull text out of Error objects or plain strings; anything else counts as empty.
  const msg = err?.message ? String(err.message) : (typeof err === 'string' ? err : '');
  if (/network request failed/i.test(msg) || /failed to fetch/i.test(msg) || /load failed/i.test(msg)) {
    return 'Not connected to server. Please check your internet connection or try again later.';
  }
  return msg || fallback;
}

/**
 * Sends a request to the backend and parses the response.
 *
 * @param endpoint Absolute URL (starting with "http") or a path such as
 *                 "/api/auth/signin"; paths are joined onto `API_BASE_URL`.
 * @param options  Standard `fetch` options (method, body, headers...). A JSON
 *                 `Content-Type` header is added; caller headers override it.
 * @returns `{ data, error }` — never rejects. Non-2xx responses use the body's
 *          `error` field, the raw text body, or a generic status message.
 */
export async function apiClient<T = any>(
  endpoint: string,
  options: RequestInit = {}
): Promise<ApiResponse<T>> {
  // Build the full URL, inserting a "/" between base and path when the caller omitted it.
  const url = endpoint.startsWith('http') ? endpoint : `${API_BASE_URL}${endpoint.startsWith('/') ? '' : '/'}${endpoint}`;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> || {}),
  };

  try {
    const res = await fetch(url, {
      ...options,
      headers,
    });

    // Read as text first so empty bodies and non-JSON error pages don't throw;
    // fall back to the raw text when it isn't valid JSON.
    const text = await res.text();
    let body: any = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = text;
    }

    // HTTP error: prefer the backend's `{ error: "..." }` message, then a plain-text body.
    if (!res.ok) {
      const errorMsg = typeof body === 'object' && body?.error
        ? body.error
        : (typeof body === 'string' && body ? body : `Request failed with status ${res.status}`);
      return { data: null, error: formatApiError(errorMsg) };
    }

    return { data: body as T, error: null };
  } catch (err: any) {
    // Network failure (server down, offline, CORS) — fetch itself rejected.
    return { data: null, error: formatApiError(err) };
  }
}
