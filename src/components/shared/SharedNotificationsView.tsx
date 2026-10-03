/**
 * SharedNotificationsView - the "Notifications" tab shared by both consoles.
 *
 * Mounted inside a TabPane by app/console/student/index.tsx and
 * app/console/scribe/index.tsx. It lists the signed-in user's in-app notifications,
 * newest first, and lets them mark one (tap) or all ("Mark all read") as read.
 *
 * Data (via the `supabase` shim, which calls the Rust/Axum backend, not real Supabase):
 * - reads `profiles.role` only to pick the colour theme (blue = student, green = scribe);
 * - reads and updates `notifications` rows for the current user (`is_read` is 0/1).
 *
 * Loads once on mount; pull-to-refresh reloads. The parent consoles count unread rows
 * separately for their tab badge, so marking read here does not update that badge directly.
 */
import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, RefreshControl, Alert } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { supabase } from '@/core/supabase';
import { useLanguage } from '@/core/translation';

/** One `notifications` row. `is_read` is stored as an integer flag: 0 = unread, 1 = read. */
interface Notification {
  id: number;
  user_id: string;
  title: string;
  message: string;
  is_read: number;
  created_at: string;
}

/**
 * Notification inbox for the current user (takes no props; reads the session itself).
 * Side effects: updates `notifications.is_read` when the user marks items read.
 */
export default function SharedNotificationsView() {
  const { t } = useLanguage();
  // Loading flags, the user's role (theme only) and the fetched notification list.
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [role, setRole] = useState<'student' | 'scribe'>('student');
  const [notifications, setNotifications] = useState<Notification[]>([]);

  // Initial load on mount only.
  useEffect(() => {
    fetchNotifications();
  }, []);

  /**
   * Loads the role and the notification list for the signed-in user.
   * Errors are only logged; both loading spinners are always cleared in `finally`
   * (including when there is no session).
   */
  const fetchNotifications = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      // 1. Fetch user role
      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', session.user.id)
        .single();
      
      if (profile) {
        setRole(profile.role || 'student');
      }

      // 2. Fetch notifications
      const { data: notifs, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', session.user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setNotifications(notifs || []);
    } catch (err) {
      console.warn('Error loading notifications:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  /** Sets `is_read = 1` on every notification of the current user, then mirrors it locally. Shows an Alert on failure. */
  const handleMarkAllAsRead = async () => {
    if (notifications.length === 0) return;
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const { error } = await supabase
        .from('notifications')
        .update({ is_read: 1 })
        .eq('user_id', session.user.id);

      if (error) throw error;
      
      // Update local state
      setNotifications(notifications.map(n => ({ ...n, is_read: 1 })));
    } catch (err: any) {
      Alert.alert(t('error'), err.message || 'Failed to update notifications.');
    }
  };

  /** Marks one notification (by `notifications.id`) as read; failures are only logged. */
  const handleMarkSingleAsRead = async (id: number) => {
    try {
      const { error } = await supabase
        .from('notifications')
        .update({ is_read: 1 })
        .eq('id', id);

      if (error) throw error;
      
      // Update local state
      setNotifications(notifications.map(n => n.id === id ? { ...n, is_read: 1 } : n));
    } catch (err) {
      console.error('Error marking notification as read:', err);
    }
  };

  /** Pull-to-refresh handler: shows the refresh spinner and reloads everything. */
  const onRefresh = () => {
    setRefreshing(true);
    fetchNotifications();
  };

  // Role-based accent colours: blue for students, green for scribes.
  const isStudent = role === 'student';
  const themeColor = isStudent ? '#2563eb' : '#059669';
  const themeBgColor = isStudent ? '#2563eb' : '#059669';
  const themeBgLight = isStudent ? 'rgba(37,99,235,0.08)' : 'rgba(5,150,105,0.08)';

  /** Formats a timestamp as a short day + month + time string in the en-IN locale; returns '' if formatting throws. */
  const formatTime = (isoString: string) => {
    try {
      const date = new Date(isoString);
      return date.toLocaleDateString('en-IN', {
        day: '2-digit',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return '';
    }
  };

  // Full-area spinner until the first load finishes.
  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 10, backgroundColor: '#f9fafb' }}>
        <ActivityIndicator size="large" color={themeColor} />
      </View>
    );
  }

  return (
    <ScrollView 
      style={{ flex: 1, backgroundColor: '#f9fafb' }} 
      contentContainerStyle={{ paddingHorizontal: 24, paddingVertical: 12, paddingBottom: 40 }}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[themeColor]} />
      }
    >
      {/* Title & Mark All read */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, marginTop: 4 }}>
        <Text style={{ fontFamily: 'Roboto', color: '#475569', fontWeight: '800', fontSize: 13 }}>{t('your_notifications')}</Text>
        {notifications.some(n => n.is_read === 0) && (
          <TouchableOpacity onPress={handleMarkAllAsRead} style={{ paddingVertical: 6, paddingHorizontal: 12, backgroundColor: '#fff', borderRadius: 20, borderWidth: 1, borderColor: '#e2e8f0' }}>
            <Text style={{ fontFamily: 'Roboto', fontSize: 9, fontWeight: '800', color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5 }}>{t('mark_all_read')}</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Empty state ("All caught up") or one card per notification; tapping an unread card marks it read. */}
      {notifications.length === 0 ? (
        <View style={{ backgroundColor: '#f8fafc', padding: 32, borderRadius: 24, borderWidth: 1, borderColor: '#e2e8f0', alignItems: 'center', justifyContent: 'center', marginTop: 8 }}>
          <View style={{ width: 60, height: 60, borderRadius: 30, backgroundColor: '#f1f5f9', alignItems: 'center', justifyContent: 'center', marginBottom: 16, borderWidth: 1, borderColor: '#e2e8f0' }}>
            <Feather name="bell-off" size={24} color="#94a3b8" />
          </View>
          <Text style={{ fontFamily: 'Roboto', fontSize: 16, fontWeight: '900', color: '#0f172a' }}>{t('all_caught_up')}</Text>
          <Text style={{ fontFamily: 'Roboto', fontSize: 12, color: '#64748b', marginTop: 4, textAlign: 'center' }}>
            {t('no_notifications_desc')}
          </Text>
        </View>
      ) : (
        notifications.map((item) => {
          const isUnread = item.is_read === 0;
          return (
            <TouchableOpacity
              key={item.id}
              onPress={() => {
                if (isUnread) handleMarkSingleAsRead(item.id);
              }}
              activeOpacity={isUnread ? 0.8 : 1}
              style={{ padding: 16, borderRadius: 24, borderWidth: 1, shadowColor: '#64748b', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 12, elevation: 3, marginBottom: 14, flexDirection: 'row', alignItems: 'flex-start', backgroundColor: isUnread ? '#fff' : '#f8fafc', borderColor: isUnread ? themeBgLight : '#e2e8f0' }}
            >
              {/* Status Indicator Icon */}
              <View style={{ width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', marginRight: 12, backgroundColor: isUnread ? themeBgLight : '#f1f5f9' }}>
                <Feather 
                  name={item.title.includes('Accepted') ? 'check-circle' : 'bell'} 
                  size={14} 
                  color={isUnread ? themeColor : '#94a3b8'} 
                />
              </View>

              {/* Message Body */}
              <View style={{ flex: 1, paddingRight: 8 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Text style={{ fontFamily: 'Roboto', fontSize: 12, fontWeight: '800', color: isUnread ? '#0f172a' : '#64748b' }}>
                    {item.title}
                  </Text>
                  {isUnread && (
                    <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: themeBgColor }} />
                  )}
                </View>
                <Text style={{ fontFamily: 'Roboto', fontSize: 11, marginTop: 4, lineHeight: 16, color: isUnread ? '#334155' : '#64748b' }}>
                  {item.message}
                </Text>
                <Text style={{ fontFamily: 'Roboto', fontSize: 9, color: '#94a3b8', marginTop: 8 }}>
                  {formatTime(item.created_at)}
                </Text>
              </View>
            </TouchableOpacity>
          );
        })
      )}
    </ScrollView>
  );
}
