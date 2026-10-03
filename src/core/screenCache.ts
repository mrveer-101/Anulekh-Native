/**
 * core/screenCache — per-user snapshot cache for portal tabs.
 *
 * Used by StudentHomeView, StudentRequestsView, StudentPlanView, ScribeHomeView, ScribeExploreView
 * and ScribeCommitmentsView (read on mount, written after each successful fetch), by
 * core/profileLookup (via `profileMemo`), and by core/supabase, whose sign-out calls
 * `clearScreenCache`. It talks to no backend tables itself; it only stores what screens hand it.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Stale-while-revalidate cache for the portal screens (Home, Requests, Plan, Search, Applied).
 *
 * How screens use it:
 *   1. On load, read the last snapshot and show it immediately (no spinner).
 *   2. Fetch fresh data from the backend in the background.
 *   3. Save the fresh snapshot for next time.
 *
 * Snapshots live in memory for the current session and in device storage (AsyncStorage) so they
 * survive an app restart. Keys are scoped per user, so accounts sharing a device never see each
 * other's data, and everything is wiped on sign-out (see `supabase.auth.signOut`).
 */

/** Namespace for every persisted key; bump the version suffix to orphan old snapshot shapes. */
const PREFIX = 'anulekh_screen_cache_v1:';

// Strings longer than this are almost always base64 images/documents. They are kept in memory but
// left out of the persisted copy so snapshots stay small (web localStorage is limited to ~5 MB).
const MAX_PERSISTED_STRING = 20_000;

/** Session-level copy of every snapshot (full values, including large strings), keyed by `cacheKey`. */
const memory = new Map<string, unknown>();

/** Short-lived memory of other users' profiles, used by `getProfilesByIds` (core/profileLookup). */
export const profileMemo = new Map<string, { profile: any; at: number }>();

/** Builds the storage key `<PREFIX><screen>:<userId>` so snapshots are isolated per screen and per user. */
const cacheKey = (screen: string, userId: string) => `${PREFIX}${screen}:${userId}`;

/** Returns the last saved snapshot for this screen and user, or null if there is none. */
export async function readScreenCache<T>(screen: string, userId: string): Promise<T | null> {
  const key = cacheKey(screen, userId);
  // Fast path: already loaded (or written) during this session.
  if (memory.has(key)) return memory.get(key) as T;
  // Slow path: fall back to device storage and warm the memory map; corrupt JSON counts as a miss.
  try {
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return null;
    const value = JSON.parse(raw) as T;
    memory.set(key, value);
    return value;
  } catch {
    return null;
  }
}

/** Saves a snapshot for this screen and user (memory immediately, device storage in the background). */
export function writeScreenCache<T>(screen: string, userId: string, value: T): void {
  const key = cacheKey(screen, userId);
  memory.set(key, value);
  // Persist without oversized strings (the replacer drops them); the write is fire-and-forget.
  try {
    const raw = JSON.stringify(value, (_k, v) => (typeof v === 'string' && v.length > MAX_PERSISTED_STRING ? undefined : v));
    AsyncStorage.setItem(key, raw).catch(() => {});
  } catch {
    // Unserialisable snapshot — the in-memory copy still works for this session.
  }
}

/** Removes every cached snapshot (called on sign-out and account deletion). */
export async function clearScreenCache(): Promise<void> {
  memory.clear();
  profileMemo.clear();
  // Only remove keys under our PREFIX so other AsyncStorage data (e.g. auth/session) is untouched.
  try {
    const keys = await AsyncStorage.getAllKeys();
    const ours = keys.filter((k) => k.startsWith(PREFIX));
    if (ours.length) await AsyncStorage.multiRemove(ours);
  } catch {
    // Storage unavailable — nothing persisted to clear.
  }
}
