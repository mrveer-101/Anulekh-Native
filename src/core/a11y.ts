/**
 * Cross-platform screen-reader helpers.
 *
 * Anulekh's students are visually impaired, so status changes that are only shown
 * visually (form submitted, login failed, request created, settings saved...) must
 * also be spoken. Screens such as auth/login, auth/register, the student and scribe
 * consoles, request_form, complete_profile and SharedSettingsView import these
 * helpers. On native they use React Native's AccessibilityInfo; on web they fall
 * back to a hidden ARIA live region appended to <body>.
 */
import { AccessibilityInfo, Platform } from 'react-native';

/**
 * Announces a message to Android TalkBack / iOS VoiceOver / Web screen readers.
 * Essential for alerting blind students when forms submit, errors occur, or status changes.
 */
export function announceForAccessibility(message: string): void {
  if (!message) return;

  // Native: hand the text straight to TalkBack / VoiceOver (no-op if no screen reader is running).
  if (Platform.OS === 'android' || Platform.OS === 'ios') {
    try {
      AccessibilityInfo.announceForAccessibility(message);
    } catch (e) {
      console.warn('Accessibility announcement failed:', e);
    }
  } else if (Platform.OS === 'web') {
    // Web aria-live region fallback
    try {
      // Reuse a single shared live region; create it lazily on the first announcement.
      let liveRegion = document.getElementById('a11y-live-announcer');
      if (!liveRegion) {
        // Visually hidden ("sr-only") but still read by screen readers; polite = waits for current speech.
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
      // Clear first, then set after a short delay, so repeating the same message is still re-announced.
      liveRegion.textContent = '';
      setTimeout(() => {
        if (liveRegion) liveRegion.textContent = message;
      }, 50);
    } catch {}
  }
}

/**
 * Checks if Android TalkBack or iOS VoiceOver is currently running.
 */
export async function isScreenReaderActive(): Promise<boolean> {
  // Resolves to false (instead of throwing) if the platform cannot report screen-reader state.
  try {
    return await AccessibilityInfo.isScreenReaderEnabled();
  } catch {
    return false;
  }
}
