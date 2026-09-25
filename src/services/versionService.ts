import Constants from 'expo-constants';
import * as Linking from 'expo-linking';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { apiClient } from '@/services/api/client';

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

export type UpdateStatus = 'UP_TO_DATE' | 'UPDATE_AVAILABLE' | 'FORCE_UPDATE' | 'WHATS_NEW';

export interface VersionCheckResult {
  status: UpdateStatus;
  info: AppVersionInfo | null;
  currentVersion: string;
  currentVersionCode: number;
}

const LAST_SEEN_VERSION_CODE_KEY = 'ANULEKH_LAST_SEEN_VERSION_CODE';

export const versionService = {
  getCurrentVersion(): { version: string; versionCode: number } {
    const version = Constants.expoConfig?.version || '1.1.0';
    const versionCode = Constants.expoConfig?.android?.versionCode || 3;
    return { version, versionCode };
  },

  async checkVersion(): Promise<VersionCheckResult> {
    const { version: currentVersion, versionCode: currentVersionCode } = this.getCurrentVersion();

    try {
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
      const lastSeenStr = await AsyncStorage.getItem(LAST_SEEN_VERSION_CODE_KEY);
      const lastSeenCode = lastSeenStr ? parseInt(lastSeenStr, 10) : 0;

      // 1. Force update takes highest priority
      if (info.force_update || currentVersionCode < info.min_supported_version_code) {
        return {
          status: 'FORCE_UPDATE',
          info,
          currentVersion,
          currentVersionCode,
        };
      }

      // 2. Soft update available
      if (currentVersionCode < info.latest_version_code) {
        return {
          status: 'UPDATE_AVAILABLE',
          info,
          currentVersion,
          currentVersionCode,
        };
      }

      // 3. User just upgraded: show "What's New" if they haven't seen it for this version
      if (currentVersionCode >= info.latest_version_code && lastSeenCode < currentVersionCode) {
        return {
          status: 'WHATS_NEW',
          info,
          currentVersion,
          currentVersionCode,
        };
      }

      return {
        status: 'UP_TO_DATE',
        info,
        currentVersion,
        currentVersionCode,
      };
    } catch {
      return {
        status: 'UP_TO_DATE',
        info: null,
        currentVersion,
        currentVersionCode,
      };
    }
  },

  async markVersionSeen(versionCode: number): Promise<void> {
    try {
      await AsyncStorage.setItem(LAST_SEEN_VERSION_CODE_KEY, versionCode.toString());
    } catch {
      // Ignore storage errors
    }
  },

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
