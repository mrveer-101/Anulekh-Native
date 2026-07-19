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
import { supabase } from '@/app/core/supabase';
import { Feather, Ionicons } from '@expo/vector-icons';
import { useLanguage } from '@/app/core/translation';
import AsyncStorage from '@react-native-async-storage/async-storage';

import ScribeHomeView from '../../../components/ScribeHomeView';
import ScribeExploreView from '../../../components/ScribeExploreView';
import ScribeCommitmentsView from '../../../components/ScribeCommitmentsView';
import ScribeProfileView from '../../../components/ScribeProfileView';
import SharedSettingsView from '../../../components/SharedSettingsView';
import SharedNotificationsView from '../../../components/SharedNotificationsView';
import ScribePlanView from '../../../components/ScribePlanView';

type Tab = 'home' | 'commitments' | 'plan' | 'profile' | 'settings' | 'notifications' | 'explore';

const TABS: { id: Tab; iconActive: string; iconInactive: string; label: string }[] = [
  { id: 'home',        iconActive: 'home',          iconInactive: 'home',          label: 'Home' },
  { id: 'explore',     iconActive: 'search',        iconInactive: 'search',        label: 'Search' },
  { id: 'commitments', iconActive: 'document-text',  iconInactive: 'document-text',  label: 'Requests' },
  { id: 'settings',    iconActive: 'person',        iconInactive: 'person',        label: 'Account' },
];

// ── Design tokens (light theme) ────────────────────────────────
const BG         = '#f9fafb';   // clean off-white background
const SURFACE    = 'rgba(255,255,255,0.82)'; // glass surface
const BORDER     = 'rgba(0,0,0,0.07)';
const ACCENT     = '#16a34a';   // green primary
const ACCENT_BG  = 'rgba(22,163,74,0.09)';
const ACCENT_BD  = 'rgba(22,163,74,0.22)';
const TEXT       = '#0f172a';
const MUTED      = '#64748b';

export default function ScribeDashboard() {
  const { t } = useLanguage();
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

      {/* Background orbs removed for clean white style */}

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
          paddingHorizontal: 20, paddingVertical: 12,
          borderBottomWidth: 1, borderBottomColor: BORDER,
          borderBottomLeftRadius: 20,
          borderBottomRightRadius: 20,
        }}>
          {/* Logo */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <View style={{
              width: 44, height: 44, borderRadius: 12,
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
            <Text style={{ fontFamily: 'Roboto', fontSize: 22, fontWeight: '900', color: TEXT, letterSpacing: -0.5 }}>Anulekh</Text>
            <View style={{
              backgroundColor: ACCENT_BG, borderWidth: 1, borderColor: ACCENT_BD,
              borderRadius: 7, paddingHorizontal: 8, paddingVertical: 3,
            }}>
              <Text style={{ fontFamily: 'Roboto', color: ACCENT, fontSize: 9, fontWeight: '800', letterSpacing: 0.5 }}>SCRIBE</Text>
            </View>
          </View>

          {/* Icons */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <TouchableOpacity
              onPress={() => { setActiveTab('notifications'); setUnread(0); }}
              style={{
                width: 44, height: 44, borderRadius: 12,
                backgroundColor: activeTab === 'notifications' ? ACCENT_BG : 'rgba(255,255,255,0.8)',
                borderWidth: 1, borderColor: activeTab === 'notifications' ? ACCENT_BD : BORDER,
                alignItems: 'center', justifyContent: 'center',
              }}
            >
              <Ionicons name="notifications" size={20} color={activeTab === 'notifications' ? ACCENT : MUTED} />
              {unreadNotifs > 0 && (
                <View style={{
                  position: 'absolute', top: 6, right: 6,
                  width: 8, height: 8, borderRadius: 4,
                  backgroundColor: '#f97316', borderWidth: 1.5, borderColor: '#fff',
                }} />
              )}
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => setActiveTab('settings')}
              style={{
                width: 44, height: 44, borderRadius: 22,
                backgroundColor: ACCENT_BG, borderWidth: 1.5, borderColor: ACCENT_BD,
                alignItems: 'center', justifyContent: 'center',
                shadowColor: ACCENT, shadowOffset: { width: 0, height: 4 },
                shadowOpacity: 0.2, shadowRadius: 8, elevation: 4,
              }}
            >
              <Text style={{ color: ACCENT, fontWeight: '900', fontSize: 18 }}>
                {profile?.full_name?.charAt(0)?.toUpperCase() ?? 'S'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </SafeAreaView>

      {/* ── CONTENT ── */}
      <View style={{ flex: 1, overflow: 'hidden', minHeight: 0 }}>
        {activeTab === 'home'          && <ScribeHomeView />}
        {activeTab === 'explore'       && <ScribeExploreView />}
        {activeTab === 'commitments'   && <ScribeCommitmentsView />}
        {activeTab === 'settings'      && <SharedSettingsView />}
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
            const translationKey = tab.id === 'home' ? 'nav_home' :
                                   tab.id === 'explore' ? 'nav_explore' :
                                   tab.id === 'commitments' ? 'nav_applied' : 'nav_account';
            const translatedLabel = t(translationKey as any);
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
                <Ionicons name={(active ? tab.iconActive : tab.iconInactive) as any} size={24} color={active ? ACCENT : '#94a3b8'} />
                <Text style={{
                  fontFamily: 'Roboto',
                  fontSize: 11, fontWeight: active ? '800' : '600',
                  marginTop: 3, color: active ? ACCENT : '#94a3b8',
                }}>
                  {translatedLabel}
                </Text>
                {active && (
                  <View style={{
                    position: 'absolute', bottom: 2,
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
