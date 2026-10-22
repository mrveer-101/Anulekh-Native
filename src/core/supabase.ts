/**
 * supabase.ts — the app's single data client.
 *
 * WHAT IT IS
 * Despite the name, this is NOT the Supabase SDK. It is a small shim that imitates the subset of the
 * supabase-js API the app was originally written against, and translates every call into an HTTP
 * request to the project's own Rust/Axum backend (Anulekh-Axum, backed by libSQL/SQLite). Keeping the
 * supabase-js shape means screens can keep writing `supabase.from('exam_requests').select('*').eq(...)`
 * and `supabase.auth.signInWithPassword(...)` unchanged.
 *
 * HOW A QUERY TRAVELS
 *   supabase.from(table)           -> new MockQueryBuilder(table)
 *     .select()/.insert()/.update()/.delete()   chooses the action
 *     .eq()/.neq()/.gte()/.lte()                 appends filters (all ANDed)
 *     .order()/.limit()/.single()               shapes the result
 *   await builder                  -> builder.then() -> execute()
 *     -> POST {API_URL}/api/query  with JSON
 *        { table, action, filters, data, sortField, sortAscending, limit, single }
 *     <- { data, error }  (the backend's JSON is returned to the caller as-is)
 * The backend (Anulekh-Axum/src/query.rs) only accepts a fixed allow-list of tables (users, profiles,
 * exam_requests, scribe_applications, notifications, chat_messages, support_tickets, scribe_reviews,
 * student_reviews, assignment_requests) and builds the SQL itself.
 *
 * AUTH
 * `supabase.auth.*` calls the backend's /api/auth/* routes. There are no tokens: a "session" is just
 * `{ user }` saved under the AsyncStorage key 'local_db_session', and `getSession()` reads it back.
 * Other auth flows (OTP signup, password reset, Google login, account deletion) are not wrapped here;
 * screens such as app/auth/register.tsx and app/auth/login.tsx call /api/auth/... with fetch directly
 * (or via services/api/*).
 *
 * DIFFERENCES FROM REAL supabase-js (worth knowing before relying on behaviour)
 *   - Nothing ever throws: network/HTTP failures resolve to `{ data: null, error: <string> }`.
 *     `error` is a plain string, not an object with `.message`.
 *   - `.select(columns)` ignores its argument; the backend always returns full rows (SELECT *).
 *   - `.single()` with no matching row gives `{ data: null }` with no error.
 *   - Calling `.select()` after `.insert()`/`.update()` switches the action back to 'select'.
 *   - insert/update `data` must be a single object (the backend expects a JSON map, not an array).
 *
 * Also exports `API_URL` and `friendlyAuthError()` for screens that call the backend directly.
 */
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { clearScreenCache } from '@/core/screenCache';

/**
 * Base URL of the Rust/Axum backend.
 * - Web build served from localhost/127.0.0.1 -> a local backend on http://localhost:3000.
 * - Everywhere else -> EXPO_PUBLIC_API_URL if set at build time, otherwise the hosted Render instance.
 */
export const API_URL = (() => {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    if (window?.location?.hostname === 'localhost' || window?.location?.hostname === '127.0.0.1') {
      return 'http://localhost:3000';
    }
    if (window?.location?.origin) {
      return window.location.origin;
    }
  }
  return process.env.EXPO_PUBLIC_API_URL || 'https://anulekh-axum.onrender.com';
})();

// fetch() rejects with a generic "Network request failed" (or "Failed to fetch" on web)
// when the backend host is unreachable — surface that as a clear connectivity message
// instead of a confusing raw error.
/**
 * Converts any thrown value into a user-facing error string.
 *
 * @param err      The caught error (Error, string, or anything else).
 * @param fallback Message to use when `err` carries no text.
 * @returns A connectivity message for network failures, otherwise the error's own message or `fallback`.
 */
export function friendlyAuthError(err: any, fallback: string): string {
  const msg = err?.message ? String(err.message) : (typeof err === 'string' ? err : '');
  if (/network request failed/i.test(msg) || /failed to fetch/i.test(msg) || /load failed/i.test(msg)) {
    return 'Not connected to server. Please check your internet connection or try again later.';
  }
  return msg || fallback;
}

/**
 * Chainable query builder returned by `supabase.from(table)`.
 *
 * Each chained method only records state and returns `this`; nothing is sent until the builder is
 * awaited (via `then`), at which point `execute()` POSTs the recorded query to /api/query.
 * A builder is meant to be used once — build, await, discard.
 */
class MockQueryBuilder {
  // Recorded query state, serialised into the /api/query request body by execute().
  private table: string;
  private action: 'select' | 'insert' | 'update' | 'delete' = 'select';
  private filters: { column: string; operator: string; value: any }[] = [];
  private insertData: any = null;
  private updateData: any = null;
  private sortField: string | null = null;
  private sortAscending: boolean = true;
  private limitVal: number | null = null;
  private isSingle: boolean = false;

  /** @param table Database table to query; must be on the backend's allow-list or the request fails. */
  constructor(table: string) {
    this.table = table;
  }

  /**
   * Makes this a read (SELECT) query. This is also the default action.
   * @param columns Accepted for supabase-js compatibility but ignored — full rows are always returned.
   */
  select(columns?: string) {
    this.action = 'select';
    return this;
  }

  /**
   * Makes this an INSERT of one row.
   * @param data Column -> value object for the new row (a single object; arrays are not supported).
   *             On success the backend echoes this object back as `data`.
   */
  insert(data: any) {
    this.action = 'insert';
    this.insertData = data;
    return this;
  }

  /**
   * Makes this an UPDATE of the rows matched by the filters (add `.eq(...)` or every row is affected).
   * @param data Column -> new value object. The backend responds with `data: null`.
   */
  update(data: any) {
    this.action = 'update';
    this.updateData = data;
    return this;
  }

  /** Makes this a DELETE of the rows matched by the filters (always add a filter). */
  delete() {
    this.action = 'delete';
    return this;
  }

  /** Adds a `field = value` filter. Multiple filters are combined with AND. */
  eq(field: string, value: any) {
    this.filters.push({ column: field, operator: 'eq', value });
    return this;
  }

  /** Adds a `field != value` filter. */
  neq(field: string, value: any) {
    this.filters.push({ column: field, operator: 'neq', value });
    return this;
  }

  /**
   * Intended as a `field >= value` filter.
   * Caveat: the backend currently only distinguishes 'neq'; any other operator (including 'gte')
   * is applied as equality, so this behaves like `.eq()` today. Unused in the app at present.
   */
  gte(field: string, value: any) {
    this.filters.push({ column: field, operator: 'gte', value });
    return this;
  }

  /** Intended as a `field <= value` filter. Same caveat as `gte`: the backend treats it as equality. */
  lte(field: string, value: any) {
    this.filters.push({ column: field, operator: 'lte', value });
    return this;
  }

  /**
   * Sorts SELECT results by one column (a later call replaces an earlier one).
   * @param field     Column name (the backend strips anything that isn't alphanumeric or `_`).
   * @param ascending Defaults to true.
   */
  order(field: string, { ascending = true } = {}) {
    this.sortField = field;
    this.sortAscending = ascending;
    return this;
  }

  /** Caps the number of rows a SELECT returns. */
  limit(val: number) {
    this.limitVal = val;
    return this;
  }

  /**
   * Asks for one row instead of an array: `data` becomes the first matching row, or null when none
   * match (no error is raised, unlike supabase-js).
   */
  single() {
    this.isSingle = true;
    return this;
  }

  /**
   * Sends the recorded query to the backend.
   *
   * POSTs to `${API_URL}/api/query` and resolves with the backend's JSON body, normally
   * `{ data, error: null }`. Never rejects: network errors, non-2xx responses and non-JSON bodies all
   * resolve to `{ data: null, error: <string> }` (via friendlyAuthError).
   */
  async execute() {
    try {
      // Only insert/update carry a row payload; select/delete send `data: undefined` (omitted).
      const data = this.action === 'insert' ? this.insertData : (this.action === 'update' ? this.updateData : undefined);
      const res = await fetch(`${API_URL}/api/query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          table: this.table,
          action: this.action,
          filters: this.filters,
          data,
          sortField: this.sortField,
          sortAscending: this.sortAscending,
          limit: this.limitVal,
          single: this.isSingle
        })
      });
      
      // The backend replies with JSON on success but a plain-text message on errors, so parse defensively.
      const resText = await res.text();
      let result: any = {};
      try {
        result = JSON.parse(resText);
      } catch {
        result = { error: resText };
      }
      // Non-2xx: turn into a thrown error so the single catch below shapes the response.
      if (!res.ok) {
        throw new Error(result.error || 'Query failed');
      }
      return result;
    } catch (err: any) {
      return { data: null, error: friendlyAuthError(err, 'Query failed') };
    }
  }

  // Support thenable for direct await calls
  then(onfulfilled?: (value: any) => any, onrejected?: (reason: any) => any) {
    return this.execute().then(onfulfilled, onrejected);
  }
}

/**
 * supabase-js-style `auth` namespace, backed by the Axum /api/auth/* routes and AsyncStorage.
 * The stored "session" ('local_db_session') is simply `{ user }` — there is no token or expiry, and
 * other requests are not authenticated with it.
 */
const mockAuth = {
  /**
   * Creates an account via POST /api/auth/signup and, on success, stores `{ user }` as the session
   * (so the new user is signed in immediately).
   * @returns `{ data: { user }, error: null }` or `{ data: { user: null }, error: <string> }`.
   */
  signUp: async ({ email, password }: { email: string; password?: string }) => {
    try {
      const res = await fetch(`${API_URL}/api/auth/signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      const resText = await res.text();
      let data: any = {};
      try {
        data = JSON.parse(resText);
      } catch {
        data = { error: resText };
      }
      if (data.user?.email) {
        const lower = String(data.user.email).toLowerCase();
        if (lower.endsWith('@anulekh.app') || lower.endsWith('@anulekh.internal') || lower.startsWith('phone_') || lower.startsWith('user_')) {
          data.user.email = '';
        }
      }

      const session = { user: data.user };
      await AsyncStorage.setItem('local_db_session', JSON.stringify(session));
      return { data: { user: data.user }, error: null };
    } catch (err: any) {
      return { data: { user: null }, error: friendlyAuthError(err, 'Signup failed') };
    }
  },

  /**
   * Signs in via POST /api/auth/signin. The caller may pass `email`, `phone` or a generic
   * `identifier` (email or phone) together with `password`; the backend decides how to match it.
   * On success stores `{ user }` under 'local_db_session'.
   * @returns `{ data: { user }, error: null }` or `{ data: { user: null }, error: <string> }`.
   */
  signInWithPassword: async ({
    email,
    phone,
    identifier,
    password
  }: {
    email?: string;
    phone?: string;
    identifier?: string;
    password?: string;
  }) => {
    try {
      const res = await fetch(`${API_URL}/api/auth/signin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, phone, identifier, password })
      });
      const resText = await res.text();
      let data: any = {};
      try {
        data = JSON.parse(resText);
      } catch {
        data = { error: resText };
      }
      if (!res.ok) throw new Error(data.error || data.message || 'Signin failed');

      if (data.user?.email) {
        const lower = String(data.user.email).toLowerCase();
        if (lower.endsWith('@anulekh.app') || lower.endsWith('@anulekh.internal') || lower.startsWith('phone_') || lower.startsWith('user_')) {
          data.user.email = '';
        }
      }

      const session = { user: data.user };
      await AsyncStorage.setItem('local_db_session', JSON.stringify(session));
      return { data: session, error: null };
    } catch (err: any) {
      return { data: { user: null }, error: friendlyAuthError(err, 'Signin failed') };
    }
  },

  /**
   * Reads the locally stored session (no network call).
   * @returns `{ data: { session } }` where session is `{ user }` or null when signed out.
   */
  getSession: async () => {
    try {
      const val = await AsyncStorage.getItem('local_db_session');
      const session = val ? JSON.parse(val) : null;
      if (session?.user?.email) {
        const lower = String(session.user.email).toLowerCase();
        if (lower.endsWith('@anulekh.app') || lower.endsWith('@anulekh.internal') || lower.startsWith('phone_') || lower.startsWith('user_')) {
          session.user.email = '';
        }
      }
      return { data: { session }, error: null };
    } catch (err: any) {
      return { data: { session: null }, error: err.message || err };
    }
  },

  /**
   * Signs out locally: removes the stored session and wipes per-user screen/profile caches.
   * Makes no backend call.
   */
  signOut: async () => {
    try {
      await AsyncStorage.removeItem('local_db_session');
      // Cached screens/profiles belong to this user — never show them to the next one.
      await clearScreenCache();
      return { error: null };
    } catch (err: any) {
      return { error: err.message || err };
    }
  }
};

/**
 * The client object imported throughout the app (`import { supabase } from '@/core/supabase'`).
 * `from(table)` returns a fresh query builder per call; `auth` is the shared auth namespace above.
 */
export const supabase = {
  auth: mockAuth,
  from: (table: string) => new MockQueryBuilder(table)
};

/**
 * Placeholder default export that renders nothing; this module is not a screen. It exists only so
 * tooling that expects a default export (e.g. Expo Router route scanning) stays quiet.
 */
export default function SupabaseNonRoute() {
  return null;
}

