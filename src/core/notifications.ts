/**
 * Local (on-device) notification helpers built on `expo-notifications`, with a browser
 * `Notification` API fallback on web.
 *
 * - Importing this module installs a foreground handler so banners show even while the app is open.
 * - `initializeNotificationChannels` creates the two Android channels (`anulekh-default` and the
 *   louder `anulekh-sos` for emergency SOS broadcasts); it is called on startup from app/_layout.tsx.
 * - `requestNotificationPermissions` / `triggerLocalNotification` ask for permission and show an
 *   immediate notification.
 * - `triggerTestNotification` fires canned demo notifications; used by the "test notification"
 *   control in components/shared/SharedSettingsView.tsx.
 *
 * These are purely local notifications: nothing here talks to the backend or registers push tokens.
 * All functions swallow errors (logging a warning) so a notification failure never breaks a screen.
 */
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';

// ── CONFIGURE FOREGROUND NOTIFICATION HANDLER ────────────────────────────
// Ensures notification banner slides down from top even while app is active (heads-up banner)
try {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
    } as any),
  });
} catch (e) {
  console.warn('Could not set notification handler:', e);
}

/**
 * Initialize Android notification channels (High Priority & Emergency SOS channels)
 */
export async function initializeNotificationChannels(): Promise<void> {
  // Channels only exist on Android (8+); iOS and web have nothing to configure.
  // Re-creating an existing channel is harmless, so this is safe to call repeatedly.
  if (Platform.OS === 'android') {
    try {
      await Notifications.setNotificationChannelAsync('anulekh-default', {
        name: 'Anulekh Alerts & Matches',
        description: 'Notifications for scribe matching, requests, and updates',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#2563eb',
        enableLights: true,
        enableVibrate: true,
        showBadge: true,
      });

      // Separate SOS channel: longer vibration pulses and red LED so emergencies stand out.
      await Notifications.setNotificationChannelAsync('anulekh-sos', {
        name: 'Anulekh Emergency SOS',
        description: 'Urgent emergency SOS broadcasts and last-minute requests',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 500, 250, 500],
        lightColor: '#dc2626',
        enableLights: true,
        enableVibrate: true,
        showBadge: true,
      });

      console.log('✅ Android notification channels configured');
    } catch (e) {
      console.warn('Could not set Android notification channel:', e);
    }
  }
}

/**
 * Request permission for notifications (required on Android 13+ and iOS)
 */
/**
 * @returns `true` if notifications are (now) allowed. On native, a successful grant also
 * (re)creates the Android channels. On web it uses the browser permission prompt and returns
 * `false` if the API is missing or the user has previously denied it.
 */
export async function requestNotificationPermissions(): Promise<boolean> {
  // Web: browser Notification API. A 'denied' permission can't be re-prompted, so just report false.
  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      if (Notification.permission === 'granted') return true;
      if (Notification.permission !== 'denied') {
        const perm = await Notification.requestPermission();
        return perm === 'granted';
      }
    }
    return false;
  }

  // Native: only show the OS prompt if permission isn't already granted.
  try {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== 'granted') {
      console.warn('Failed to get push notification permission');
      return false;
    }

    await initializeNotificationChannels();
    return true;
  } catch (err) {
    console.warn('Error requesting notification permissions:', err);
    return false;
  }
}

/**
 * Trigger an instant native notification on Android / Web
 */
/**
 * @param title     Notification heading.
 * @param body      Notification text.
 * @param channelId Which Android channel the caller intends (`'anulekh-sos'` for emergencies).
 *                  Currently it only selects the vibration pattern; see the note in the body.
 * @param data      Arbitrary payload attached to the native notification (not used on web).
 *
 * On web, shows a browser notification (asking permission first if needed) and returns. If the
 * browser can't or won't show it, execution falls through to the expo-notifications path below.
 */
export async function triggerLocalNotification({
  title,
  body,
  channelId = 'anulekh-default',
  data = {},
}: {
  title: string;
  body: string;
  channelId?: 'anulekh-default' | 'anulekh-sos';
  data?: Record<string, any>;
}): Promise<void> {
  // Web fallback: Browser Notification API
  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      if (Notification.permission === 'granted') {
        new Notification(title, {
          body,
          icon: '/logo.png',
        });
        return;
      } else if (Notification.permission !== 'denied') {
        const perm = await Notification.requestPermission();
        if (perm === 'granted') {
          new Notification(title, {
            body,
            icon: '/logo.png',
          });
          return;
        }
      }
    }
  }

  // Native path: make sure channels exist, then schedule with a null trigger (= show immediately).
  // Note: `channelId` is not passed to expo-notifications here (it normally goes on the trigger),
  // so Android delivers to the default channel rather than 'anulekh-sos'.
  try {
    await initializeNotificationChannels();

    await Notifications.scheduleNotificationAsync({
      content: {
        title,
        body,
        sound: 'default',
        priority: Notifications.AndroidNotificationPriority?.MAX || 'max',
        data,
        vibrate: channelId === 'anulekh-sos' ? [0, 500, 250, 500] : [0, 250, 250, 250],
      },
      trigger: null, // Instant trigger
    });
  } catch (err) {
    console.warn('Error displaying native notification:', err);
  }
}

/**
 * Triggers pre-configured realistic test notifications for demos
 */
/**
 * @param type Which canned scenario to show: scribe match, SOS alert, exam reminder or a generic test.
 * @returns The shown text as `"<title>: <body>"`, so the caller can echo it (e.g. in a toast).
 * Side effects: may show the OS permission prompt; displays one local notification. The names and
 * places in the messages are sample data, not real records.
 */
export async function triggerTestNotification(
  type: 'match' | 'sos' | 'reminder' | 'general' = 'match'
): Promise<string> {
  await requestNotificationPermissions();

  let title = '';
  let body = '';
  let channelId: 'anulekh-default' | 'anulekh-sos' = 'anulekh-default';

  // Pick the demo copy (and the SOS channel for the emergency case).
  switch (type) {
    case 'match':
      title = '🎉 Scribe Matched!';
      body = 'Volunteer Rahul Sharma accepted your request for CBSE Mathematics Exam.';
      channelId = 'anulekh-default';
      break;
    case 'sos':
      title = '🚨 Emergency SOS Scribe Alert!';
      body = 'Immediate scribe needed at St. Xavier College, Exam Hall 4. Tap to claim.';
      channelId = 'anulekh-sos';
      break;
    case 'reminder':
      title = '⏰ Exam Tomorrow Reminder';
      body = 'Your Physics 12th Board Exam is scheduled tomorrow at 10:00 AM.';
      channelId = 'anulekh-default';
      break;
    case 'general':
    default:
      title = '🔔 Anulekh Notification Test';
      body = 'System notifications are active and working on your device!';
      channelId = 'anulekh-default';
      break;
  }

  await triggerLocalNotification({
    title,
    body,
    channelId,
    data: { type, timestamp: Date.now() },
  });

  return `${title}: ${body}`;
}
