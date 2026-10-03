# 7. Performance & caching

Three mechanisms make the portals fast. Every data screen (student Home/Requests/Plan, scribe
Home/Search/Applied) uses all three in the same way.

## 1. Tab keep-alive — `components/ui/TabPane.tsx`

The consoles wrap each tab: `<TabPane active={activeTab === 'home'}><StudentHomeView /></TabPane>`.

* A tab is **mounted the first time it is opened**, then kept; switching away only sets `display: 'none'`.
  Returning is instant and keeps scroll position, expanded cards and data.
* `useTabActive()` tells a screen whether it is visible. Screens use it to
  * refresh only while visible: `useFocusEffect(useCallback(() => { if (!isActive) return; fetch(); }, [isActive]))`
    — this also fires when a hidden tab becomes visible again (quiet background refresh);
  * pause looping animations (e.g. the scribe Home's floating avatar and SOS pulse).

## 2. Cached snapshots (stale-while-revalidate) — `core/screenCache.ts`

```
fetch() ─▶ readScreenCache(screen, userId) ──hit──▶ applySnapshot(cached); setLoading(false)   (instant)
        └▶ network queries (parallel) ─▶ build snapshot ─▶ applySnapshot(fresh) ─▶ writeScreenCache()
```

* Snapshots are kept **in memory** for the session and in **AsyncStorage** (prefix
  `anulekh_screen_cache_v1:`) so they survive an app restart → the spinner appears only on a true first load.
* Keys include the user id; **sign-out clears everything** (`supabase.auth.signOut` → `clearScreenCache()`),
  so a shared device never shows another user's data.
* Strings over 20 000 characters (base64 images/documents) are dropped from the persisted copy to stay
  within web storage limits; the in-memory copy keeps them.
* Each screen defines a `…Snapshot` interface and an `applySnapshot()` that sets its state.

## 3. Parallel queries — `Promise.all`

Queries that depend only on the user id run together instead of one after another:

| Screen | Before | After |
|---|---|---|
| Scribe Home | 10 sequential calls | profile check, then 9 in parallel |
| Search | 6 sequential | 1 parallel round |
| Student Home | 4 sequential (one duplicated) | profile, then 2 in parallel (duplicate removed) |
| Requests | 4 sequential + one-by-one auto-SOS updates | parallel queries and parallel updates |
| Applied, Plan | 3–4 sequential | 1 parallel round |

The profile query runs first where it gates access (Home screens redirect unverified users).

## Shared profile lookups — `core/profileLookup.ts`

`getProfilesByIds(ids)` de-duplicates ids, fetches missing profiles in parallel and remembers them for
2 minutes, so Home, Plan and Requests don't re-fetch the same matched scribes. (The backend has no
`IN (...)` filter yet; adding one would turn this into a single request.)

## Remaining bottleneck

The backend runs on Render's **free plan**, which sleeps after ~15 minutes idle; the first request then takes
30–60 s. Only a hosting change (paid instance, or Cloud Run with `min-instances 1`) fixes that.
