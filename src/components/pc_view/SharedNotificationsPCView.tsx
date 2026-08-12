import React, { useState, useEffect } from 'react';
import { View, Text, Pressable, ActivityIndicator, Alert } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { supabase } from '@/core/supabase';

interface Notification {
  id: number;
  user_id: string;
  title: string;
  message: string;
  is_read: number;
  created_at: string;
}

interface SharedNotificationsPCViewProps {
  userRole?: 'student' | 'scribe';
}

export default function SharedNotificationsPCView({
  userRole = 'student',
}: SharedNotificationsPCViewProps) {
  const [loading, setLoading] = useState(true);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [filterTab, setFilterTab] = useState<'all' | 'unread' | 'emergency'>('all');

  // Preference Toggles State
  const [pushAlerts, setPushAlerts] = useState(true);
  const [sosAlerts, setSosAlerts] = useState(true);
  const [emailAlerts, setEmailAlerts] = useState(true);

  useEffect(() => {
    fetchNotifications();
  }, []);

  const fetchNotifications = async () => {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const { data: notifs, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', session.user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setNotifications(notifs || []);
    } catch (err: any) {
      console.warn('Error loading notifications:', err);
    } finally {
      setLoading(false);
    }
  };

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
      setNotifications(notifications.map(n => ({ ...n, is_read: 1 })));
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to update notifications.');
    }
  };

  const handleMarkSingleAsRead = async (id: number) => {
    try {
      const { error } = await supabase
        .from('notifications')
        .update({ is_read: 1 })
        .eq('id', id);

      if (error) throw error;
      setNotifications(notifications.map(n => n.id === id ? { ...n, is_read: 1 } : n));
    } catch (err: any) {
      console.error('Error marking notification as read:', err);
    }
  };

  const handleDeleteNotification = async (id: number) => {
    try {
      const { error } = await supabase
        .from('notifications')
        .delete()
        .eq('id', id);

      if (error) throw error;
      setNotifications(notifications.filter(n => n.id !== id));
    } catch (err: any) {
      console.error('Error deleting notification:', err);
    }
  };

  const formatTime = (isoString: string) => {
    try {
      const date = new Date(isoString);
      return date.toLocaleDateString('en-IN', {
        day: '2-digit',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch (e) {
      return 'Just now';
    }
  };

  const unreadCount = notifications.filter(n => n.is_read === 0).length;

  const filteredNotifications = notifications.filter((n) => {
    if (filterTab === 'unread') return n.is_read === 0;
    if (filterTab === 'emergency') return n.title.includes('URGENT') || n.title.includes('SOS');
    return true;
  });

  const accentColor = userRole === 'student' ? '#2563eb' : '#16a34a';

  if (loading) {
    return (
      <View style={{ paddingVertical: 60, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" color={accentColor} />
        <Text style={{ marginTop: 14, color: '#64748b', fontSize: 14, fontWeight: '600' }}>
          Loading notification alerts…
        </Text>
      </View>
    );
  }

  return (
    <View style={{ gap: 28 }}>
      {/* ── 1. TOP SUMMARY & CONTROL BAR (Ultra-Glassmorphic) ── */}
      <View style={{
        backgroundColor: 'rgba(255, 255, 255, 0.72)',
        backdropFilter: 'blur(24px) saturate(180%)',
        WebkitBackdropFilter: 'blur(24px) saturate(180%)',
        borderRadius: 24,
        padding: 24,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.85)',
        borderTopColor: 'rgba(255, 255, 255, 0.98)',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: 16,
        boxShadow: '0 12px 36px 0 rgba(37, 99, 235, 0.08), inset 0 1px 2px 0 rgba(255, 255, 255, 0.95)',
      } as any}>
        {/* Title & Counter */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16, flex: 1, minWidth: 280 }}>
          <View style={{
            width: 52, height: 52, borderRadius: 16,
            backgroundColor: userRole === 'student' ? 'rgba(37,99,235,0.1)' : 'rgba(22,163,74,0.1)',
            borderWidth: 1.5, borderColor: userRole === 'student' ? 'rgba(37,99,235,0.25)' : 'rgba(22,163,74,0.25)',
            alignItems: 'center', justifyContent: 'center',
          }}>
            <Feather name="bell" size={24} color={accentColor} />
          </View>
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <Text style={{ fontSize: 22, fontWeight: '900', color: '#0f172a', letterSpacing: -0.5 }}>
                Notifications & Alerts 🔔
              </Text>
              {unreadCount > 0 && (
                <View style={{
                  backgroundColor: 'rgba(239,68,68,0.1)', borderWidth: 1, borderColor: 'rgba(239,68,68,0.25)',
                  borderRadius: 10, paddingHorizontal: 10, paddingVertical: 3,
                }}>
                  <Text style={{ fontSize: 11, fontWeight: '800', color: '#ef4444' }}>
                    {unreadCount} NEW UNREAD
                  </Text>
                </View>
              )}
            </View>
            <Text style={{ fontSize: 14, color: '#64748b', marginTop: 2 }}>
              Stay updated on scribe matches, SOS broadcasts, and system updates
            </Text>
          </View>
        </View>

        {/* Action Button: Mark All Read */}
        {unreadCount > 0 && (
          <Pressable
            onPress={handleMarkAllAsRead}
            style={({ hovered }: any) => ({
              flexDirection: 'row', alignItems: 'center', gap: 8,
              backgroundColor: hovered ? '#f1f5f9' : '#ffffff',
              borderWidth: 1, borderColor: '#cbd5e1',
              paddingHorizontal: 16, paddingVertical: 10, borderRadius: 12,
              cursor: 'pointer' as any,
            })}
          >
            <Feather name="check-circle" size={15} color="#475569" />
            <Text style={{ fontSize: 13, fontWeight: '700', color: '#475569' }}>Mark All as Read</Text>
          </Pressable>
        )}
      </View>

      {/* ── 2. DUAL-COLUMN DESKTOP GRID (Fluid Wrapping) ── */}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 24 }}>
        {/* Left Column: Notification Feed (65% Width) */}
        <View style={{ flex: 3, minWidth: 320, gap: 16 }}>
          {/* Category Filter Tabs */}
          <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
            {[
              { id: 'all', label: `All Alerts (${notifications.length})` },
              { id: 'unread', label: `Unread (${unreadCount})` },
              { id: 'emergency', label: '🚨 SOS & Urgent' },
            ].map((tab) => {
              const active = filterTab === tab.id;
              return (
                <Pressable
                  key={tab.id}
                  onPress={() => setFilterTab(tab.id as any)}
                  style={({ hovered }: any) => ({
                    paddingHorizontal: 16, paddingVertical: 10, borderRadius: 12,
                    backgroundColor: active ? accentColor : (hovered ? 'rgba(37,99,235,0.08)' : '#ffffff'),
                    borderWidth: 1, borderColor: active ? accentColor : '#e2e8f0',
                    cursor: 'pointer' as any,
                  })}
                >
                  <Text style={{ fontSize: 13, fontWeight: active ? '800' : '600', color: active ? '#ffffff' : '#475569' }}>
                    {tab.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {/* Notifications List */}
          {filteredNotifications.length === 0 ? (
            <View style={{
              backgroundColor: '#ffffff', borderRadius: 20, padding: 40,
              alignItems: 'center', justifyContent: 'center',
              borderWidth: 1, borderColor: '#e2e8f0', borderStyle: 'dashed',
            }}>
              <View style={{
                width: 60, height: 60, borderRadius: 20,
                backgroundColor: '#f1f5f9', alignItems: 'center', justifyContent: 'center',
                marginBottom: 16,
              }}>
                <Feather name="bell-off" size={24} color="#94a3b8" />
              </View>
              <Text style={{ fontSize: 17, fontWeight: '800', color: '#0f172a' }}>All Caught Up!</Text>
              <Text style={{ fontSize: 13, color: '#64748b', marginTop: 4, textAlign: 'center', maxWidth: 360 }}>
                You have no notifications matching this filter right now.
              </Text>
            </View>
          ) : (
            <View style={{ gap: 12 }}>
              {filteredNotifications.map((item) => {
                const isUnread = item.is_read === 0;
                const isUrgent = item.title.includes('URGENT') || item.title.includes('SOS');

                return (
                  <View
                    key={item.id}
                    style={{
                      backgroundColor: isUnread ? '#ffffff' : '#f8fafc',
                      borderRadius: 18,
                      borderWidth: 1,
                      borderColor: isUrgent ? 'rgba(239,68,68,0.3)' : (isUnread ? 'rgba(37,99,235,0.22)' : '#e2e8f0'),
                      padding: 20,
                      flexDirection: 'row',
                      alignItems: 'flex-start',
                      justifyContent: 'space-between',
                      gap: 16,
                      shadowColor: '#0f172a',
                      shadowOffset: { width: 0, height: 2 },
                      shadowOpacity: isUnread ? 0.04 : 0,
                      shadowRadius: 8,
                      elevation: isUnread ? 2 : 0,
                    }}
                  >
                    {/* Icon Indicator */}
                    <View style={{
                      width: 42, height: 42, borderRadius: 14,
                      backgroundColor: isUrgent ? 'rgba(239,68,68,0.1)' : (isUnread ? 'rgba(37,99,235,0.1)' : '#f1f5f9'),
                      borderWidth: 1, borderColor: isUrgent ? 'rgba(239,68,68,0.22)' : (isUnread ? 'rgba(37,99,235,0.22)' : '#e2e8f0'),
                      alignItems: 'center', justifyContent: 'center',
                    }}>
                      <Feather
                        name={isUrgent ? 'alert-triangle' : (item.title.includes('Accepted') ? 'check-circle' : 'bell')}
                        size={18}
                        color={isUrgent ? '#ef4444' : (isUnread ? accentColor : '#94a3b8')}
                      />
                    </View>

                    {/* Notification Content */}
                    <View style={{ flex: 1, gap: 4 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                        <Text style={{ fontSize: 15, fontWeight: '800', color: isUnread ? '#0f172a' : '#475569' }}>
                          {item.title}
                        </Text>
                        {isUnread && (
                          <View style={{ width: 7, height: 7, borderRadius: 3.5, backgroundColor: accentColor }} />
                        )}
                      </View>

                      <Text style={{ fontSize: 13, color: isUnread ? '#334155' : '#64748b', lineHeight: 19 }}>
                        {item.message}
                      </Text>

                      <Text style={{ fontSize: 11, color: '#94a3b8', marginTop: 4, fontWeight: '600' }}>
                        {formatTime(item.created_at)}
                      </Text>
                    </View>

                    {/* PC Actions: Mark Read / Delete */}
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      {isUnread && (
                        <Pressable
                          onPress={() => handleMarkSingleAsRead(item.id)}
                          style={({ hovered }: any) => ({
                            paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8,
                            backgroundColor: hovered ? 'rgba(37,99,235,0.15)' : 'rgba(37,99,235,0.08)',
                            borderWidth: 1, borderColor: 'rgba(37,99,235,0.22)',
                            cursor: 'pointer' as any,
                          })}
                        >
                          <Text style={{ fontSize: 11, fontWeight: '800', color: accentColor }}>Mark Read</Text>
                        </Pressable>
                      )}

                      <Pressable
                        onPress={() => handleDeleteNotification(item.id)}
                        style={({ hovered }: any) => ({
                          width: 32, height: 32, borderRadius: 8,
                          backgroundColor: hovered ? 'rgba(239,68,68,0.15)' : '#f1f5f9',
                          alignItems: 'center', justifyContent: 'center',
                          cursor: 'pointer' as any,
                        })}
                      >
                        <Feather name="x" size={14} color="#94a3b8" />
                      </Pressable>
                    </View>
                  </View>
                );
              })}
            </View>
          )}
        </View>

        {/* Right Column: Preferences & Info Card */}
        <View style={{ flex: 2, minWidth: 280, gap: 20 }}>
          {/* Card 1: Notification Preferences */}
          <View style={{
            backgroundColor: '#ffffff',
            borderRadius: 24,
            padding: 24,
            borderWidth: 1,
            borderColor: '#e2e8f0',
            gap: 16,
          }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Feather name="settings" size={18} color={accentColor} />
              <Text style={{ fontSize: 16, fontWeight: '800', color: '#0f172a' }}>Alert Preferences</Text>
            </View>

            <View style={{ gap: 14 }}>
              {/* Toggle 1: Push Alerts */}
              <Pressable
                onPress={() => setPushAlerts(!pushAlerts)}
                style={{
                  flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                  paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#f1f5f9',
                }}
              >
                <View style={{ flex: 1, paddingRight: 8 }}>
                  <Text style={{ fontSize: 13, fontWeight: '700', color: '#334155' }}>Push Notifications</Text>
                  <Text style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>Instant browser & device alerts</Text>
                </View>
                <View style={{
                  width: 38, height: 22, borderRadius: 11,
                  backgroundColor: pushAlerts ? accentColor : '#cbd5e1',
                  padding: 2, justifyContent: 'center',
                }}>
                  <View style={{
                    width: 18, height: 18, borderRadius: 9, backgroundColor: '#ffffff',
                    alignSelf: pushAlerts ? 'flex-end' : 'flex-start',
                  }} />
                </View>
              </Pressable>

              {/* Toggle 2: Emergency SOS Alerts */}
              <Pressable
                onPress={() => setSosAlerts(!sosAlerts)}
                style={{
                  flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                  paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#f1f5f9',
                }}
              >
                <View style={{ flex: 1, paddingRight: 8 }}>
                  <Text style={{ fontSize: 13, fontWeight: '700', color: '#334155' }}>Emergency SOS Alerts</Text>
                  <Text style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>High-priority exam broadcast alerts</Text>
                </View>
                <View style={{
                  width: 38, height: 22, borderRadius: 11,
                  backgroundColor: sosAlerts ? accentColor : '#cbd5e1',
                  padding: 2, justifyContent: 'center',
                }}>
                  <View style={{
                    width: 18, height: 18, borderRadius: 9, backgroundColor: '#ffffff',
                    alignSelf: sosAlerts ? 'flex-end' : 'flex-start',
                  }} />
                </View>
              </Pressable>

              {/* Toggle 3: Email Summaries */}
              <Pressable
                onPress={() => setEmailAlerts(!emailAlerts)}
                style={{
                  flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                  paddingVertical: 8,
                }}
              >
                <View style={{ flex: 1, paddingRight: 8 }}>
                  <Text style={{ fontSize: 13, fontWeight: '700', color: '#334155' }}>Email Confirmations</Text>
                  <Text style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>Match & declaration letter copies</Text>
                </View>
                <View style={{
                  width: 38, height: 22, borderRadius: 11,
                  backgroundColor: emailAlerts ? accentColor : '#cbd5e1',
                  padding: 2, justifyContent: 'center',
                }}>
                  <View style={{
                    width: 18, height: 18, borderRadius: 9, backgroundColor: '#ffffff',
                    alignSelf: emailAlerts ? 'flex-end' : 'flex-start',
                  }} />
                </View>
              </Pressable>
            </View>
          </View>

          {/* Card 2: SOS Broadcast Notice */}
          <View style={{
            backgroundColor: '#ffffff',
            borderRadius: 24,
            padding: 24,
            borderWidth: 1,
            borderColor: '#e2e8f0',
            gap: 12,
          }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Feather name="shield" size={18} color="#ef4444" />
              <Text style={{ fontSize: 16, fontWeight: '800', color: '#0f172a' }}>Emergency SOS Pool</Text>
            </View>
            <Text style={{ fontSize: 12.5, color: '#64748b', lineHeight: 19 }}>
              When a candidate or scribe triggers an Emergency SOS, high-priority notifications are dispatched to all verified volunteers in the city.
            </Text>
          </View>
        </View>
      </View>
    </View>
  );
}
