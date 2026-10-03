/**
 * profileLookup — shared helper for resolving user ids to `profiles` rows.
 *
 * Used by the student tab views (StudentHomeView, StudentPlanView, StudentRequestsView) to show the
 * scribe attached to each exam request. Reads the `profiles` table through the `supabase` shim
 * (a custom client that calls the Rust/Axum backend, not real Supabase). The in-memory cache lives in
 * core/screenCache.ts (`profileMemo`) so that the sign-out cache wipe there also clears these entries.
 */
import { supabase } from '@/core/supabase';
import { profileMemo as cache } from '@/core/screenCache';

/**
 * Batched, short-lived lookup of other users' profiles (e.g. the scribe matched to each exam).
 *
 * Several screens need the same handful of profiles. Instead of one request per card, this helper
 * de-duplicates the ids, fetches the missing ones in parallel, and remembers results for a couple of
 * minutes so switching between Home, Plan and Requests doesn't fetch them again. Cleared on sign-out.
 * (The backend has no `in (...)` filter yet, so one request per *unique* id is the floor for now.)
 */

/** How long a cached profile (or a cached "not found") is reused before being refetched: 2 minutes. */
const TTL_MS = 2 * 60 * 1000;

/** Returns a map of id → profile (or null if not found) for the given ids. */
export async function getProfilesByIds(ids: (string | null | undefined)[]): Promise<Map<string, any>> {
  // Drop empty ids, de-duplicate, and keep only those with no fresh cache entry.
  const now = Date.now();
  const unique = Array.from(new Set(ids.filter((id): id is string => !!id)));
  const missing = unique.filter((id) => {
    const hit = cache.get(id);
    return !hit || now - hit.at > TTL_MS;
  });

  // Fetch each missing profile in parallel (GET profiles?id=eq.<id>, single row). Failures are cached
  // as null too, so a broken id is not retried on every render within the TTL.
  await Promise.all(
    missing.map(async (id) => {
      try {
        const { data } = await supabase.from('profiles').select('*').eq('id', id).single();
        cache.set(id, { profile: data ?? null, at: now });
      } catch {
        cache.set(id, { profile: null, at: now });
      }
    }),
  );

  // Build the answer from the (now up-to-date) cache.
  const result = new Map<string, any>();
  unique.forEach((id) => result.set(id, cache.get(id)?.profile ?? null));
  return result;
}
