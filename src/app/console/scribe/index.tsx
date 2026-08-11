import React, { useEffect, useState, useCallback } from 'react';
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
import { router, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { supabase } from '@/core/supabase';
import { Feather, Ionicons } from '@expo/vector-icons';
import { useLanguage } from '@/core/translation';
import AsyncStorage from '@react-native-async-storage/async-storage';

import ScribeHomeView from '@/components/scribe/ScribeHomeView';
import ScribeExploreView from '@/components/scribe/ScribeExploreView';
import ScribeCommitmentsView from '@/components/scribe/ScribeCommitmentsView';
import ScribeProfileView from '@/components/scribe/ScribeProfileView';
import SharedSettingsView from '@/components/shared/SharedSettingsView';
import SharedNotificationsView from '@/components/shared/SharedNotificationsView';
import { useWindowDimensions } from 'react-native';
import ScribePlanView from '@/components/scribe/ScribePlanView';
import ConsoleScribePC from '@/components/pc_view/ConsoleScribePC';

type Tab = 'home' | 'commitments' | 'plan' | 'profile' | 'settings' | 'notifications' | 'explore';

const TABS: { id: Tab; iconActive: keyof typeof Feather.glyphMap; iconInactive: keyof typeof Feather.glyphMap; label: string }[] = [
  { id: 'home',        iconActive: 'home',      iconInactive: 'home',      label: 'Home' },
  { id: 'explore',     iconActive: 'search',    iconInactive: 'search',    label: 'Search' },
  { id: 'commitments', iconActive: 'file-text', iconInactive: 'file-text', label: 'Requests' },
  { id: 'settings',    iconActive: 'user',      iconInactive: 'user',      label: 'Account' },
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
  const { width: windowWidth } = useWindowDimensions();
  const isDesktop = windowWidth >= 768;
  const { t } = useLanguage();
  const params = useLocalSearchParams<{ tab?: string }>();
  const [loading, setLoading]       = useState(true);
  const [profile, setProfile]       = useState<any>(null);
  const [activeTab, setActiveTab]   = useState<Tab>('home');
  const [unreadNotifs, setUnread]   = useState(0);
  const [showWelcome, setShowWelcome] = useState(false);
  const [profilePhoto, setProfilePhoto] = useState<string | null>(null);
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

      const localPhoto = await AsyncStorage.getItem(`profile_photo_${session.user.id}`);
      if (localPhoto) {
        setProfilePhoto(localPhoto);
      }

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

  useFocusEffect(
    useCallback(() => {
      if (profile?.id) {
        AsyncStorage.getItem(`profile_photo_${profile.id}`).then((photo) => {
          if (photo) setProfilePhoto(photo);
        });
      }
    }, [profile?.id, activeTab])
  );

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
  if (isDesktop) {
    return <ConsoleScribePC userProfile={profile} onRefresh={fetchSession} />;
  }

  return (
    <View style={{ flex: 1, backgroundColor: BG, height: Platform.OS === 'web' ? '100vh' as any : '100%', maxHeight: Platform.OS === 'web' ? '100vh' as any : undefined, overflow: 'hidden' }}>
      <StatusBar style="dark" />

      {/* Background orbs removed for clean white style */}

      {/* ── HEADER ── */}
      <SafeAreaView edges={['top']} style={{
        backgroundColor: '#ffffff',
        borderBottomLeftRadius: 24,
        borderBottomRightRadius: 24,
        shadowColor: '#0f172a', shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.06, shadowRadius: 16, elevation: 8,
        zIndex: 10,
      }}>
        <View style={{
          flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
          paddingHorizontal: 16, paddingTop: 12, paddingBottom: 12,
          borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.05)',
          borderBottomLeftRadius: 24,
          borderBottomRightRadius: 24,
        }}>
          {/* Logo & Portal Tag */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <View style={{
              width: 44, height: 44, borderRadius: 14,
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
              borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3,
            }}>
              <Text style={{ fontFamily: 'Roboto', color: ACCENT, fontSize: 9, fontWeight: '800', letterSpacing: 0.5 }}>SCRIBE</Text>
            </View>
          </View>

          {/* Right Action Icons */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <TouchableOpacity
              onPress={() => { setActiveTab('notifications'); setUnread(0); }}
              activeOpacity={0.75}
              style={{
                width: 44, height: 44, borderRadius: 15,
                backgroundColor: activeTab === 'notifications' ? ACCENT_BG : '#f1f5f9',
                borderWidth: 1.5, borderColor: activeTab === 'notifications' ? ACCENT_BD : '#cbd5e1',
                alignItems: 'center', justifyContent: 'center',
              }}
            >
              <Image 
                source={{ uri: activeTab === 'notifications' 
                  ? 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNCIgaGVpZ2h0PSIyNCIgdmlld0JveD0iMCAwIDI0IDI0IiBmaWxsPSJub25lIiBzdHJva2U9IiMxNmEzNGEiIHN0cm9rZS13aWR0aD0iMiIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIiBzdHJva2UtbGluZWpvaW49InJvdW5kIj48cGF0aCBkPSJNNiA4YTYgNiAwIDAgMSAxMiAwYzAgNyAzIDkgMyA5SDNzMy0yIDMtOSIvPjxwYXRoIGQ9Ik0xMC4zIDIxYTEuOTQgMS45NCAwIDAgMCAzLjQgMCIvPjwvc3ZnPg=='
                  : 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNCIgaGVpZ2h0PSIyNCIgdmlld0JveD0iMCAwIDI0IDI0IiBmaWxsPSJub25lIiBzdHJva2U9IiM0NzU1NjkiIHN0cm9rZS13aWR0aD0iMiIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIiBzdHJva2UtbGluZWpvaW49InJvdW5kIj48cGF0aCBkPSJNNiA4YTYgNiAwIDAgMSAxMiAwYzAgNyAzIDkgMyA5SDNzMy0yIDMtOSIvPjxwYXRoIGQ9Ik0xMC4zIDIxYTEuOTQgMS45NCAwIDAgMCAzLjQgMCIvPjwvc3ZnPg=='
                }} 
                style={{ width: 20, height: 20 }}
                resizeMode="contain"
              />
              {unreadNotifs > 0 && (
                <View style={{
                  position: 'absolute', top: 6, right: 6,
                  width: 9, height: 9, borderRadius: 4.5,
                  backgroundColor: '#ef4444', borderWidth: 1.5, borderColor: '#ffffff',
                }} />
              )}
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => setActiveTab('settings')}
              activeOpacity={0.8}
              style={{
                width: 44, height: 44, borderRadius: 22,
                backgroundColor: ACCENT_BG, borderWidth: 1.5, borderColor: ACCENT_BD,
                alignItems: 'center', justifyContent: 'center',
                shadowColor: ACCENT, shadowOffset: { width: 0, height: 4 },
                shadowOpacity: 0.15, shadowRadius: 6, elevation: 3,
                overflow: 'hidden',
              }}
            >
              {profilePhoto ? (
                <Image source={{ uri: profilePhoto }} style={{ width: '100%', height: '100%' }} />
              ) : (
                <Text style={{ color: ACCENT, fontWeight: '900', fontSize: 18 }}>
                  {profile?.full_name?.charAt(0)?.toUpperCase() ?? 'S'}
                </Text>
              )}
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
        backgroundColor: '#ffffff',
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        shadowColor: '#0f172a', shadowOffset: { width: 0, height: -6 },
        shadowOpacity: 0.06, shadowRadius: 16, elevation: 8,
      }}>
        <View style={{
          flexDirection: 'row',
          alignItems: 'center',
          paddingTop: 12,
          paddingBottom: 12,
          paddingHorizontal: 16,
          gap: 6,
          borderTopWidth: 1,
          borderTopColor: 'rgba(0,0,0,0.05)',
          borderTopLeftRadius: 24,
          borderTopRightRadius: 24,
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
                activeOpacity={0.7}
                style={{
                  flex: 1,
                  alignItems: 'center',
                  justifyContent: 'center',
                  paddingVertical: 9,
                  paddingHorizontal: 4,
                  borderRadius: 18,
                  backgroundColor: active ? ACCENT_BG : 'transparent',
                  borderWidth: 1,
                  borderColor: active ? ACCENT_BD : 'transparent',
                }}
              >
                <Feather name={(active ? tab.iconActive : tab.iconInactive) as any} size={20} color={active ? ACCENT : '#94a3b8'} />
                <Text style={{
                  fontFamily: 'Roboto',
                  fontSize: 11.5,
                  fontWeight: active ? '800' : '600',
                  marginTop: 3,
                  color: active ? ACCENT : '#64748b',
                }}>
                  {translatedLabel}
                </Text>
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
