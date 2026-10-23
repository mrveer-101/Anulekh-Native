/**
 * notificationWatcher.ts
 *
 * Central Auto-Notification Engine for Anulekh:
 * 1. Automatically requests notification permissions on app launch.
 * 2. Monitors real-time notifications for the active user and triggers native
 *    phone status bar notifications with vibration and sound.
 * 3. Handles per-user chat notifications and important system updates (SOS, matches, etc.).
 * 4. Schedules 24-hour pre-exam reminder alerts on the phone OS.
 */

import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '@/core/supabase';
import {
  triggerLocalNotification,
  requestNotificationPermissions,
  initializeNotificationChannels,
} from '@/core/notifications';
import * as Notifications from 'expo-notifications';
import { parseExamDate } from '@/core/examDate';

let activeChatRequestId: number | null = null;
let watcherInterval: any = null;
let currentSubscribedUserId: string | null = null;

/**
 * Track which chat room the user is currently actively viewing, so we don't
 * spam system notification popups for messages they are already reading live.
 */
export function setActiveChatRequestId(reqId: number | null) {
  activeChatRequestId = reqId;
}

export function getActiveChatRequestId(): number | null {
  return activeChatRequestId;
}

/**
 * Dispatch an important action notification to a specific recipient user.
 * Inserts into the backend `notifications` table so the recipient's phone
 * automatically receives and displays it in their notification bar.
 */
export async function sendActionNotification({
  recipientUserId,
  title,
  message,
  requestId,
}: {
  recipientUserId: string;
  title: string;
  message: string;
  requestId?: number;
}): Promise<void> {
  if (!recipientUserId) return;
  try {
    await supabase.from('notifications').insert({
      user_id: recipientUserId,
      title,
      message,
      is_read: 0,
      created_at: new Date().toISOString(),
    });
  } catch (err) {
    console.warn('Failed to insert action notification:', err);
  }
}

/**
 * Automatically schedule a native phone alarm notification 24 hours before an exam.
 * This runs directly on the phone OS and fires even if the app is closed.
 */
export async function schedule24HourExamReminder(exam: {
  id: number;
  subject?: string;
  exam_type?: string;
  exam_date?: string;
  start_time?: string;
  exam_venue?: string;
}): Promise<void> {
  if (Platform.OS === 'web' || !exam.exam_date) return;

  try {
    const dateStr = exam.start_time ? `${exam.exam_date} ${exam.start_time}` : exam.exam_date;
    const examDate = parseExamDate(dateStr);
    if (!examDate) return;

    // Calculate 24 hours prior
    const reminderTime = new Date(examDate.getTime() - 24 * 60 * 60 * 1000);
    const now = new Date();

    // Only schedule if reminder is in the future
    if (reminderTime > now) {
      const reminderKey = `scheduled_reminder_exam_${exam.id}`;
      const alreadyScheduled = await AsyncStorage.getItem(reminderKey);
      if (alreadyScheduled) return;

      const title = `⏰ Exam Tomorrow Reminder`;
      const body = `Your ${exam.subject || exam.exam_type || 'Exam'} is scheduled tomorrow at ${exam.start_time || 'scheduled time'}${exam.exam_venue ? ` (${exam.exam_venue})` : ''}. Call line is now open!`;

      await Notifications.scheduleNotificationAsync({
        content: {
          title,
          body,
          sound: 'default',
          priority: Notifications.AndroidNotificationPriority?.MAX || 'max',
          data: { examId: exam.id, type: 'exam_24h_reminder' },
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: reminderTime,
          channelId: 'anulekh-default',
        } as any,
      });

      await AsyncStorage.setItem(reminderKey, reminderTime.toISOString());
      console.log(`✅ Scheduled 24h exam reminder for exam ${exam.id} at ${reminderTime.toISOString()}`);
    }
  } catch (err) {
    console.warn('Could not schedule 24h exam reminder:', err);
  }
}

/**
 * Check for new notifications for the given user and trigger phone status bar alerts.
 */
async function checkNewNotifications(userId: string) {
  if (!userId) return;

  try {
    const lastSeenKey = `last_notif_seen_${userId}`;
    const lastSeenStr = await AsyncStorage.getItem(lastSeenKey);
    let lastSeenId = lastSeenStr ? parseInt(lastSeenStr, 10) : 0;

    // Fetch unread notifications for this user
    const { data: notifs, error } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', userId)
      .eq('is_read', 0)
      .order('id', { ascending: true });

    if (error || !notifs || notifs.length === 0) return;

    // If first time checking on this device, establish baseline without spamming past notifications
    if (lastSeenId === 0) {
      const maxId = Math.max(...notifs.map((n: any) => n.id || 0));
      await AsyncStorage.setItem(lastSeenKey, maxId.toString());
      return;
    }

    // Process new notifications that arrived since lastSeenId
    const newItems = notifs.filter((n: any) => n.id > lastSeenId);

    for (const item of newItems) {
      // If it's a chat notification for the chat room currently open in foreground, don't show status bar banner
      const isChat = (item.title || '').includes('💬') || (item.message || '').includes('Chat');
      if (isChat && activeChatRequestId && item.request_id === activeChatRequestId) {
        continue;
      }

      const isSos =
        (item.title || '').includes('SOS') ||
        (item.title || '').includes('Emergency') ||
        (item.message || '').includes('SOS') ||
        (item.message || '').includes('Emergency');

      await triggerLocalNotification({
        title: item.title || 'Anulekh Alert',
        body: item.message || 'You have an important update.',
        channelId: isSos ? 'anulekh-sos' : 'anulekh-default',
        data: {
          id: item.id,
          title: item.title,
          message: item.message,
          timestamp: item.created_at || Date.now(),
        },
      });

      if (item.id > lastSeenId) {
        lastSeenId = item.id;
      }
    }

    await AsyncStorage.setItem(lastSeenKey, lastSeenId.toString());
  } catch (err) {
    // Non-blocking background worker
    console.warn('Error in checkNewNotifications:', err);
  }
}

/**
 * Start the notification watcher loop for the current session.
 */
export function startNotificationWatcher() {
  if (watcherInterval) return;

  const runCheck = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user?.id) {
        currentSubscribedUserId = null;
        return;
      }

      currentSubscribedUserId = session.user.id;
      await checkNewNotifications(session.user.id);
    } catch (e) {
      // quiet loop
    }
  };

  // Run initial check immediately
  runCheck();

  // Poll every 3 seconds for fast real-time chat & update notifications
  watcherInterval = setInterval(runCheck, 3000);
}

/**
 * Stop the notification watcher loop.
 */
export function stopNotificationWatcher() {
  if (watcherInterval) {
    clearInterval(watcherInterval);
    watcherInterval = null;
  }
}
