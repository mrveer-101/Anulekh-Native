import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Modal,
  Animated,
  Dimensions,
  Platform,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { router, useLocalSearchParams } from 'expo-router';
import { supabase } from '../../core/supabase';
import { Feather, Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';

import ScribeHomeView from '../../../components/ScribeHomeView';
import ScribeCommitmentsView from '../../../components/ScribeCommitmentsView';
import ScribeProfileView from '../../../components/ScribeProfileView';
import SharedSettingsView from '../../../components/SharedSettingsView';
import SharedNotificationsView from '../../../components/SharedNotificationsView';
import ScribePlanView from '../../../components/ScribePlanView';

type Tab = 'home' | 'commitments' | 'plan' | 'profile' | 'settings' | 'notifications';

const TABS: { id: Tab; iconActive: string; iconInactive: string; label: string }[] = [
  { id: 'home',        iconActive: 'home',     iconInactive: 'home-outline',     label: 'Home'    },
  { id: 'commitments', iconActive: 'list',     iconInactive: 'list-outline',     label: 'Applied' },
  { id: 'plan',        iconActive: 'calendar', iconInactive: 'calendar-outline', label: 'Plan'    },
  { id: 'settings',    iconActive: 'person',   iconInactive: 'person-outline',   label: 'Account' },
];

// ── Design tokens (light theme — green accent for scribe) ──────
const BG         = '#f0fdf4';   // soft green-tinted white
const SURFACE    = 'rgba(255,255,255,0.82)';
const BORDER     = 'rgba(0,0,0,0.07)';
const ACCENT     = '#16a34a';   // green primary
const ACCENT_BG  = 'rgba(22,163,74,0.09)';
const ACCENT_BD  = 'rgba(22,163,74,0.22)';
const TEXT       = '#0f172a';
const MUTED      = '#64748b';

export default function ScribeDashboard() {
  const params = useLocalSearchParams<{ tab?: string }>();
  const [loading, setLoading]       = useState(true);
  const [profile, setProfile]       = useState<any>(null);
  const [activeTab, setActiveTab]   = useState<Tab>('home');
  const [unreadNotifs, setUnread]   = useState(0);
  const [showWelcome, setShowWelcome] = useState(false);
  const welcomeOpacity = React.useRef(new Animated.Value(0)).current;

  useEffect(() => { fetchSession(); }, []);

  useEffect(() => {
    if (params.tab) {
      setActiveTab(params.tab as Tab);
    }
  }, [params.tab]);

  useEffect(() => {
    if (!showWelcome) return;
    Animated.sequence([
      Animated.timing(welcomeOpacity, { toValue: 1, duration: 400, useNativeDriver: true }),
      Animated.delay(2600),
      Animated.timing(welcomeOpacity, { toValue: 0, duration: 600, useNativeDriver: true }),
    ]).start(() => setShowWelcome(false));
  }, [showWelcome]);

  const fetchSession = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.replace('/landing'); return; }

      const { data: profileData } = await supabase
        .from('profiles').select('*').eq('id', session.user.id).single();

      setProfile(profileData);
      fetchUnread(session.user.id);

      const shown = await AsyncStorage.getItem('scribe_welcome_shown');
      if (!shown) {
        setShowWelcome(true);
        await AsyncStorage.setItem('scribe_welcome_shown', 'true');
      }
    } catch (_) {
      router.replace('/landing');
    } finally {
      setLoading(false);
    }
  };

  const fetchUnread = async (uid: string) => {
    const { data } = await supabase
      .from('notifications').select('id').eq('user_id', uid).eq('is_read', 0);
    setUnread(data?.length ?? 0);
  };

  const handleSignOut = () => {
    Alert.alert('Sign Out', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out', style: 'destructive',
        onPress: async () => {
          await AsyncStorage.removeItem('scribe_welcome_shown');
          await supabase.auth.signOut();
          router.replace('/landing');
        }
      }
    ]);
  };

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: BG, alignItems: 'center', justifyContent: 'center' }}>
        <StatusBar style="dark" />
        <ActivityIndicator size="large" color={ACCENT} />
        <Text style={{ color: MUTED, marginTop: 12, fontSize: 14 }}>Loading your dashboard…</Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: BG, height: Platform.OS === 'web' ? '100vh' as any : '100%', maxHeight: Platform.OS === 'web' ? '100vh' as any : undefined, overflow: 'hidden' }}>
      <StatusBar style="dark" />

      {/* Background orbs — bolder opacity */}
      <View style={{ position: 'absolute', top: -50, right: -50, width: 200, height: 200, borderRadius: 100, backgroundColor: 'rgba(22,163,74,0.38)' }} />
      <View style={{ position: 'absolute', bottom: 100, left: -50, width: 170, height: 170, borderRadius: 85, backgroundColor: 'rgba(37,99,235,0.33)' }} />

      {/* ── HEADER ── */}
      <SafeAreaView edges={['top']} style={{
        backgroundColor: SURFACE,
        borderBottomLeftRadius: 20,
        borderBottomRightRadius: 20,
        shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.07, shadowRadius: 12, elevation: 5,
        zIndex: 10,
      }}>
        <View style={{
          flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
          paddingHorizontal: 20, paddingVertical: 18,
          borderBottomWidth: 1, borderBottomColor: BORDER,
          borderBottomLeftRadius: 20,
          borderBottomRightRadius: 20,
        }}>
          {/* Logo */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <View style={{
              width: 36, height: 36, borderRadius: 10,
              backgroundColor: ACCENT_BG, borderWidth: 1.5, borderColor: ACCENT_BD,
              alignItems: 'center', justifyContent: 'center',
              overflow: 'hidden',
            }}>
              <Image 
                source={require('../../../../assets/images/custom/Pen_Logo.jpg')} 
                style={{ width: '100%', height: '100%' }}
                resizeMode="cover"
              />
            </View>
            <Text style={{ fontSize: 20, fontWeight: '900', color: TEXT, letterSpacing: -0.5 }}>Anulekh</Text>
            <View style={{
              backgroundColor: ACCENT_BG, borderWidth: 1, borderColor: ACCENT_BD,
              borderRadius: 7, paddingHorizontal: 8, paddingVertical: 3,
            }}>
              <Text style={{ color: ACCENT, fontSize: 9, fontWeight: '800', letterSpacing: 0.5 }}>SCRIBE</Text>
            </View>
          </View>

          {/* Icons */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <TouchableOpacity
              onPress={() => { setActiveTab('notifications'); setUnread(0); }}
              style={{
                width: 38, height: 38, borderRadius: 11,
                backgroundColor: activeTab === 'notifications' ? ACCENT_BG : 'rgba(255,255,255,0.8)',
                borderWidth: 1, borderColor: activeTab === 'notifications' ? ACCENT_BD : BORDER,
                alignItems: 'center', justifyContent: 'center',
              }}
            >
              <Ionicons name={activeTab === 'notifications' ? "notifications" : "notifications-outline"} size={17} color={activeTab === 'notifications' ? ACCENT : MUTED} />
              {unreadNotifs > 0 && (
                <View style={{
                  position: 'absolute', top: 5, right: 5,
                  width: 8, height: 8, borderRadius: 4,
                  backgroundColor: '#f97316', borderWidth: 1.5, borderColor: '#fff',
                }} />
              )}
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => setActiveTab('settings')}
              style={{
                width: 38, height: 38, borderRadius: 11,
                backgroundColor: ACCENT_BG, borderWidth: 1.5, borderColor: ACCENT_BD,
                alignItems: 'center', justifyContent: 'center',
                shadowColor: ACCENT, shadowOffset: { width: 0, height: 4 },
                shadowOpacity: 0.2, shadowRadius: 8, elevation: 4,
              }}
            >
              <Text style={{ color: ACCENT, fontWeight: '900', fontSize: 15 }}>
                {profile?.full_name?.charAt(0)?.toUpperCase() ?? 'S'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </SafeAreaView>

      {/* ── CONTENT ── */}
      <View style={{ flex: 1, overflow: 'hidden', minHeight: 0 }}>
        {activeTab === 'home'          && <ScribeHomeView />}
        {activeTab === 'commitments'   && <ScribeCommitmentsView />}
        {activeTab === 'plan'          && <ScribePlanView />}
        {activeTab === 'profile'       && <ScribeProfileView />}
        {activeTab === 'settings'      && <ScribeProfileView />}
        {activeTab === 'notifications' && <SharedNotificationsView />}
      </View>

      {/* ── BOTTOM NAV — top corners rounded ── */}
      <SafeAreaView edges={['bottom']} style={{
        backgroundColor: SURFACE,
        borderTopLeftRadius: 20,
        borderTopRightRadius: 20,
        shadowColor: '#000', shadowOffset: { width: 0, height: -4 },
        shadowOpacity: 0.07, shadowRadius: 12, elevation: 5,
      }}>
        <View style={{
          flexDirection: 'row',
          paddingVertical: 8,
          paddingHorizontal: 8,
          gap: 4,
          borderTopWidth: 1,
          borderTopColor: BORDER,
          borderTopLeftRadius: 20,
          borderTopRightRadius: 20,
        }}>
          {TABS.map((tab) => {
            const active = activeTab === tab.id;
            return (
              <TouchableOpacity
                key={tab.id}
                onPress={() => setActiveTab(tab.id)}
                style={{
                  flex: 1, alignItems: 'center', paddingVertical: 9,
                  borderRadius: 20,
                  backgroundColor: active ? ACCENT_BG : 'transparent',
                }}
              >
                <Ionicons name={(active ? tab.iconActive : tab.iconInactive) as any} size={20} color={active ? ACCENT : '#94a3b8'} />
                <Text style={{
                  fontSize: 10, fontWeight: active ? '700' : '500',
                  marginTop: 4, color: active ? ACCENT : '#94a3b8',
                }}>
                  {tab.label}
                </Text>
                {active && (
                  <View style={{
                    position: 'absolute', bottom: 4,
                    width: 4, height: 4, borderRadius: 2, backgroundColor: ACCENT,
                  }} />
                )}
              </TouchableOpacity>
            );
          })}
        </View>
      </SafeAreaView>

      {/* ── WELCOME TOAST ── */}
      {showWelcome && (
        <Animated.View style={{
          position: 'absolute', top: 100, left: 20, right: 20, zIndex: 999,
          opacity: welcomeOpacity,
        }}>
          <View style={{
            backgroundColor: SURFACE, borderWidth: 1, borderColor: ACCENT_BD,
            borderRadius: 18, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 12,
            shadowColor: ACCENT, shadowOffset: { width: 0, height: 8 },
            shadowOpacity: 0.18, shadowRadius: 18, elevation: 8,
          }}>
            <View style={{
              width: 40, height: 40, borderRadius: 12,
              backgroundColor: ACCENT_BG, alignItems: 'center', justifyContent: 'center',
            }}>
              <Feather name="heart" size={20} color={ACCENT} />
            </View>
            <View>
              <Text style={{ color: TEXT, fontWeight: '800', fontSize: 15 }}>
                Welcome, {profile?.full_name?.split(' ')[0] ?? 'Scribe'}! 🤝
              </Text>
              <Text style={{ color: MUTED, fontSize: 12, marginTop: 2 }}>Thank you for volunteering</Text>
            </View>
          </View>
        </Animated.View>
      )}

    </View>
  );
}
