import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';

// ── CONFIGURE FOREGROUND NOTIFICATION HANDLER ────────────────────────────
// Ensures notification banner slides down from top even while app is active (heads-up banner)
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    priority: Notifications.AndroidNotificationPriority.MAX,
  }),
});

/**
 * Initialize Android notification channels (High Priority & Emergency SOS channels)
 */
export async function initializeNotificationChannels(): Promise<void> {
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
export async function requestNotificationPermissions(): Promise<boolean> {
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

  try {
    await initializeNotificationChannels();

    await Notifications.scheduleNotificationAsync({
      content: {
        title,
        body,
        sound: 'default',
        priority: Notifications.AndroidNotificationPriority.MAX,
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
export async function triggerTestNotification(
  type: 'match' | 'sos' | 'reminder' | 'general' = 'match'
): Promise<string> {
  const granted = await requestNotificationPermissions();

  let title = '';
  let body = '';
  let channelId: 'anulekh-default' | 'anulekh-sos' = 'anulekh-default';

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
