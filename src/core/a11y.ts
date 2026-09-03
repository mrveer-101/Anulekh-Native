import { AccessibilityInfo, Platform } from 'react-native';

/**
 * Announces a message to Android TalkBack / iOS VoiceOver / Web screen readers.
 * Essential for alerting blind students when forms submit, errors occur, or status changes.
 */
export function announceForAccessibility(message: string): void {
  if (!message) return;

  if (Platform.OS === 'android' || Platform.OS === 'ios') {
    try {
      AccessibilityInfo.announceForAccessibility(message);
    } catch (e) {
      console.warn('Accessibility announcement failed:', e);
    }
  } else if (Platform.OS === 'web') {
    // Web aria-live region fallback
    try {
      let liveRegion = document.getElementById('a11y-live-announcer');
      if (!liveRegion) {
        liveRegion = document.createElement('div');
        liveRegion.id = 'a11y-live-announcer';
        liveRegion.setAttribute('aria-live', 'polite');
        liveRegion.setAttribute('aria-atomic', 'true');
        liveRegion.style.position = 'absolute';
        liveRegion.style.width = '1px';
        liveRegion.style.height = '1px';
        liveRegion.style.padding = '0';
        liveRegion.style.overflow = 'hidden';
        liveRegion.style.clip = 'rect(0, 0, 0, 0)';
        liveRegion.style.whiteSpace = 'nowrap';
        liveRegion.style.border = '0';
        document.body.appendChild(liveRegion);
      }
      liveRegion.textContent = '';
      setTimeout(() => {
        if (liveRegion) liveRegion.textContent = message;
      }, 50);
    } catch (_) {}
  }
}

/**
 * Checks if Android TalkBack or iOS VoiceOver is currently running.
 */
export async function isScreenReaderActive(): Promise<boolean> {
  try {
    return await AccessibilityInfo.isScreenReaderEnabled();
  } catch {
    return false;
  }
}
