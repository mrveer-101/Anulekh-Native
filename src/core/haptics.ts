/**
 * haptics — tactile feedback (vibration "feel") with a user on/off setting.
 *
 * Wraps expo-haptics: real Taptic/vibration motor feedback on iOS and Android, `navigator.vibrate`
 * on Android browsers and a native-switch trick on iOS Safari (both handled by expo-haptics).
 * The setting lives on the device (AsyncStorage) and defaults to on; the Account tab
 * (SharedSettingsView) shows the switch. Calls never throw — unsupported devices are ignored.
 */
import * as Haptics from 'expo-haptics';
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'anulekh_haptics_enabled';
let enabled = true;

/** Reads the saved setting (default on) and returns it. */
export async function loadHapticsEnabled(): Promise<boolean> {
  try {
    enabled = (await AsyncStorage.getItem(STORAGE_KEY)) !== '0';
  } catch {}
  return enabled;
}

/** Turns haptics on/off and saves the choice on the device. */
export async function setHapticsEnabled(on: boolean): Promise<void> {
  enabled = on;
  try {
    await AsyncStorage.setItem(STORAGE_KEY, on ? '1' : '0');
  } catch {}
}

/** 'tap' = light touch; 'success' / 'warning' / 'error' = the system notification patterns. */
export type HapticKind = 'tap' | 'success' | 'warning' | 'error';

const NOTIFICATION_TYPE = {
  success: Haptics.NotificationFeedbackType.Success,
  warning: Haptics.NotificationFeedbackType.Warning,
  error: Haptics.NotificationFeedbackType.Error,
};

/** Plays one haptic if the setting is on. */
export function haptic(kind: HapticKind = 'tap'): void {
  if (!enabled) return;
  const run = kind === 'tap'
    ? Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    : Haptics.notificationAsync(NOTIFICATION_TYPE[kind]);
  run.catch(() => {});
}
