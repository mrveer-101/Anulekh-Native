/**
 * versionService
 *
 * In-app update checking. Compares the installed build (from the Expo app
 * config: `version` and `android.versionCode`) with the release info served
 * by the Rust/Axum backend at `GET /api/system/version`, and decides whether
 * to show a forced update, an optional update, a one-time "What's New" sheet,
 * or nothing.
 *
 * Used by components/ui/AppUpdateModal.tsx, which runs `checkVersion()`
 * shortly after app start, opens the store via `openStore()` and records the
 * "What's New" sheet as seen via `markVersionSeen()`.
 *
 * Persists the last version code whose "What's New" was acknowledged in
 * AsyncStorage. Every failure (network, storage, store links) is swallowed so
 * that update checks can never block or crash the app.
 */
import Constants from 'expo-constants';
import * as Linking from 'expo-linking';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { apiClient } from '@/services/api/client';

/**
 * Release metadata returned by `/api/system/version`.
 * - `latest_version` / `latest_version_code`: newest published build.
 * - `min_supported_version` / `min_supported_version_code`: builds below this
 *   code are forced to update.
 * - `force_update`: server-side switch that forces every client to update.
 * - `title`, `message`, `features`: copy shown in the update / What's New modal.
 * - `market_url` (Play Store app deep link) and `play_store_url` (web
 *   fallback) used by {@link versionService.openStore}.
 */
export interface AppVersionInfo {
  latest_version: string;
  latest_version_code: number;
  min_supported_version: string;
  min_supported_version_code: number;
  force_update: boolean;
  title: string;
  message: string;
  features: string[];
  play_store_url: string;
  market_url: string;
}

/**
 * Outcome of a version check:
 * - `UP_TO_DATE`: nothing to show (also returned on any error).
 * - `UPDATE_AVAILABLE`: a newer build exists; the user may dismiss the prompt.
 * - `FORCE_UPDATE`: this build is no longer supported; the prompt cannot be dismissed.
 * - `WHATS_NEW`: the user is on the latest build and has not yet seen its notes.
 */
export type UpdateStatus ='UP_TO_DATE' | 'UPDATE_AVAILABLE' | 'FORCE_UPDATE' | 'WHATS_NEW';

/**
 * Result of {@link versionService.checkVersion}: the decided status, the
 * server's release info (null when the request failed or returned nothing)
 * and the installed build's version name and code.
 */
export interface VersionCheckResult {
  status: UpdateStatus;
  info: AppVersionInfo | null;
  currentVersion: string;
  currentVersionCode: number;
}

/** AsyncStorage key holding the version code whose "What's New" was last acknowledged. */
const LAST_SEEN_VERSION_CODE_KEY = 'ANULEKH_LAST_SEEN_VERSION_CODE';

/** Version check / store-redirect helpers (see file header). */
export const versionService = {
  /**
   * Reads the installed build's version from the Expo app config.
   * Falls back to hard-coded defaults ('1.0.2' / code 3) when the config is
   * unavailable, so keep those in step with app.json when releasing.
   * @returns `{ version, versionCode }` of the running build.
   */
  getCurrentVersion(): { version: string; versionCode: number } {
    const version = Constants.expoConfig?.version || '1.1.0';
    const versionCode = Constants.expoConfig?.android?.versionCode || 7;
    return { version, versionCode };
  },

  /**
   * Fetches release info from the backend and decides which update UI, if
   * any, to show. Checks run in priority order: forced update, optional
   * update, then "What's New". Never throws: any error yields `UP_TO_DATE`.
   * Reads (but does not write) the last-seen version code in AsyncStorage.
   * @returns the {@link VersionCheckResult} for AppUpdateModal to act on.
   */
  async checkVersion(): Promise<VersionCheckResult> {
    const { version: currentVersion, versionCode: currentVersionCode } = this.getCurrentVersion();

    try {
      // Ask the backend for the current release info; no data means nothing to show.
      const res = await apiClient<AppVersionInfo>('/api/system/version');
      if (!res.data) {
        return {
          status: 'UP_TO_DATE',
          info: null,
          currentVersion,
          currentVersionCode,
        };
      }

      const info = res.data;

      // 1. Force update takes highest priority (user's build is older than min supported or force_update flag is on)
      if (info.force_update || currentVersionCode < info.min_supported_version_code) {
        return {
          status: 'FORCE_UPDATE',
          info,
          currentVersion,
          currentVersionCode,
        };
      }

      // 2. Soft update: Play Store has a newer version than the user's installed build
      if (currentVersionCode < info.latest_version_code) {
        return {
          status: 'UPDATE_AVAILABLE',
          info,
          currentVersion,
          currentVersionCode,
        };
      }

      // 3. Installed version is up-to-date with Play Store (no blocking intro card needed)
      return {
        status: 'UP_TO_DATE',
        info,
        currentVersion,
        currentVersionCode,
      };
    } catch {
      // Network / storage failure: fail silent so startup is never blocked.
      return {
        status: 'UP_TO_DATE',
        info: null,
        currentVersion,
        currentVersionCode,
      };
    }
  },

  /**
   * Records that the user has seen the "What's New" notes for `versionCode`,
   * so `checkVersion()` stops returning `WHATS_NEW` for it.
   * Side effect: writes LAST_SEEN_VERSION_CODE_KEY to AsyncStorage.
   * @param versionCode build code to store as acknowledged.
   */
  async markVersionSeen(versionCode: number): Promise<void> {
    try {
      await AsyncStorage.setItem(LAST_SEEN_VERSION_CODE_KEY, versionCode.toString());
    } catch {
      // Ignore storage errors
    }
  },

  /**
   * Opens the app's Google Play listing so the user can update. Tries the
   * `market://` deep link (Play Store app) first, then falls back to the web
   * URL in the browser. Uses the URLs from `info` when provided, otherwise the
   * hard-coded com.celestialsteam.anulekh listing. Errors are ignored.
   * @param info release info from checkVersion(), optional.
   */
  async openStore(info?: AppVersionInfo | null): Promise<void> {
    const marketUrl = info?.market_url || 'market://details?id=com.celestialsteam.anulekh';
    const webUrl =
      info?.play_store_url || 'https://play.google.com/store/apps/details?id=com.celestialsteam.anulekh';

    try {
      const canOpen = await Linking.canOpenURL(marketUrl);
      if (canOpen) {
        await Linking.openURL(marketUrl);
        return;
      }
    } catch {
      // Fallback to browser URL
    }

    try {
      await Linking.openURL(webUrl);
    } catch {
      // Ignore
    }
  },
};
