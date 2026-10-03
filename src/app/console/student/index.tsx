/**
 * Student dashboard — route `/console/student` (optionally `?tab=<Tab>`).
 *
 * Reached from app/console/index.tsx (role router) and from login once a
 * student's profile is complete. It is the shell for every student screen:
 *  - Mobile / narrow (< 768px): a header (logo, notifications bell, avatar),
 *    a tab body, and a bottom tab bar (Home, Requests, Plan, Account). The
 *    Notifications tab has no bottom-bar button and is opened from the header
 *    bell; the header avatar opens Account ('settings'). The 'profile' tab is
 *    only reachable through the `tab` URL param.
 *  - Desktop (>= 768px): renders ConsoleStudentPC instead, passing the profile.
 *
 * Each tab body is wrapped in a TabPane, so a tab mounts on first visit and is
 * then kept alive (hidden) when the user switches away.
 *
 * Data loaded (through the `supabase` shim, which calls the Rust/Axum backend):
 *  - the stored session (AsyncStorage) — no session → `/landing`;
 *  - `profiles` row for the user — role 'scribe' → redirected to `/console/scribe`;
 *  - unread `notifications` count (rows with is_read = 0) for the bell dot.
 * The avatar photo comes from AsyncStorage key `profile_photo_<userId>`, and a
 * one-time welcome toast is gated by AsyncStorage key `welcome_toast_shown`.
 *
 * Accessibility: tabs announce the selection to screen readers and expose
 * role="tab" + selected state; decorative icons/labels inside are hidden from
 * the accessibility tree so each tab is read once.
 */
import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  Animated,
  useWindowDimensions,
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
import { announceForAccessibility } from '@/core/a11y';


import StudentHomeView from '@/components/student/StudentHomeView';
import StudentRequestsView from '@/components/student/StudentRequestsView';
import StudentProfileView from '@/components/student/StudentProfileView';
import SharedSettingsView from '@/components/shared/SharedSettingsView';
import SharedNotificationsView from '@/components/shared/SharedNotificationsView';
import StudentPlanView from '@/components/student/StudentPlanView';
import ConsoleStudentPC from '@/components/pc_view/ConsoleStudentPC';
import { TabPane } from '@/components/ui/TabPane';

/** Every screen the dashboard can show; also the accepted values of the `?tab=` route param. */
type Tab = 'home' | 'requests' | 'plan' | 'profile' | 'settings' | 'notifications';

/**
 * Buttons shown in the mobile bottom tab bar, in display order.
 * The 'settings' tab is labelled "Account" (translated via `nav_account`).
 * `label` is an English fallback; the rendered label comes from translations.
 */
const TABS: { id: Tab; iconActive: keyof typeof Ionicons.glyphMap; iconInactive: keyof typeof Ionicons.glyphMap; label: string }[] = [
  { id: 'home',     iconActive: 'home',          iconInactive: 'home-outline',          label: 'Home' },
  { id: 'requests', iconActive: 'document-text', iconInactive: 'document-text-outline', label: 'Requests' },
  { id: 'plan',     iconActive: 'calendar',      iconInactive: 'calendar-outline',      label: 'Plan' },
  { id: 'settings', iconActive: 'person',        iconInactive: 'person-outline',        label: 'Account' },
];

// ── Design tokens (light theme) ────────────────────────────────
const BG         = '#f9fafb';   // clean off-white background
const SURFACE    = 'rgba(255,255,255,0.82)'; // glass surface
const ACCENT     = '#2563eb';   // blue primary
const ACCENT_BG  = 'rgba(37,99,235,0.09)';
const ACCENT_BD  = 'rgba(37,99,235,0.22)';
const TEXT       = '#0f172a';
const MUTED      = '#64748b';

/**
 * Student dashboard screen (default export for the `/console/student` route).
 *
 * Side effects: reads the session and `profiles` row, counts unread
 * `notifications`, reads/writes AsyncStorage (avatar photo, welcome-toast flag)
 * and may redirect to `/landing` or `/console/scribe`.
 *
 * @returns The desktop console, a loading spinner, or the mobile tabbed layout.
 */
export default function StudentDashboard() {
  const { width: windowWidth } = useWindowDimensions();

  // ── ALL STATE (must come before any useEffect) ──────────────────────────
  const [mounted, setMounted]       = useState(false);
  const [screenWidth, setScreenWidth] = useState(windowWidth);
  const { t } = useLanguage();
  const params = useLocalSearchParams<{ tab?: string }>();
  const [loading, setLoading]       = useState(true);
  const [profile, setProfile]       = useState<any>(null);
  const [activeTab, setActiveTab]   = useState<Tab>('home');
  const [unreadNotifs, setUnread]   = useState(0);
  const [showWelcome, setShowWelcome] = useState(false);
  const [profilePhoto, setProfilePhoto] = useState<string | null>(null);
  const welcomeOpacity = React.useRef(new Animated.Value(0)).current;

  // ── ALL EFFECTS (after all state) ───────────────────────────────────────
  // Mount guard: sync real window width after hydration to avoid SSR mismatch
  useEffect(() => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      setScreenWidth(window.innerWidth);
    }
    setMounted(true);
  }, []);

  // Web only: track browser resizes so the layout can switch between mobile and desktop live.
  useEffect(() => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const handleResize = () => setScreenWidth(window.innerWidth);
      window.addEventListener('resize', handleResize);
      return () => window.removeEventListener('resize', handleResize);
    }
  }, []);

  // Only evaluate responsive layout AFTER client has mounted (avoids SSR mismatch)
  const currentWidth = mounted ? screenWidth : windowWidth;
  const isDesktop = currentWidth >= 768;

  // ── HELPER FUNCTIONS ───────────────────────────────────────────────────
  /**
   * Counts the user's unread notifications (`notifications` rows with
   * is_read = 0) and stores the number for the header bell's red dot.
   * @param uid The signed-in user's id.
   */
  const fetchUnread = async (uid: string) => {
    const { data } = await supabase
      .from('notifications').select('id').eq('user_id', uid).eq('is_read', 0);
    setUnread(data?.length ?? 0);
  };

  /**
   * Loads everything the dashboard shell needs and guards the route.
   * Also passed to ConsoleStudentPC as `onRefresh` so the desktop view can reload it.
   *
   * Side effects: may redirect to `/landing` (no session or any error) or to
   * `/console/scribe` (user is a scribe); sets profile, unread count, avatar
   * photo and the welcome-toast flag; always clears `loading` at the end.
   */
  const fetchSession = async () => {
    try {
      // 1. Session check — the shim keeps the signed-in user in AsyncStorage.
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.replace('/landing'); return; }

      // 2. Load the full profile row and bounce scribes to their own dashboard.
      const { data: profileData } = await supabase
        .from('profiles').select('*').eq('id', session.user.id).single();

      if (profileData?.role === 'scribe') { router.replace('/console/scribe' as any); return; }

      // 3. Store the profile and fetch the unread count in the background (not awaited).
      setProfile(profileData);
      fetchUnread(session.user.id);

      // 4. Avatar photo is cached on the device only, keyed by user id.
      const localPhoto = await AsyncStorage.getItem(`profile_photo_${session.user.id}`);
      if (localPhoto) {
        setProfilePhoto(localPhoto);
      }

      // 5. Show the welcome toast only once per device (flag is not per-user).
      const shown = await AsyncStorage.getItem('welcome_toast_shown');
      if (!shown) {
        setShowWelcome(true);
        await AsyncStorage.setItem('welcome_toast_shown', 'true');
      }
    } catch {
      router.replace('/landing');
    } finally {
      setLoading(false);
    }
  };

  // Load session/profile once on mount.
  useEffect(() => { fetchSession(); }, []);

  // Deep-link support: `/console/student?tab=requests` (etc.) opens that tab.
  // The value is cast without validation, so an unknown tab shows an empty body.
  useEffect(() => {
    if (params.tab) {
      setActiveTab(params.tab as Tab);
    }
  }, [params.tab]);

  // Welcome toast animation: fade in (0.4s), hold (2.6s), fade out (0.6s), then unmount.
  useEffect(() => {
    if (!showWelcome) return;
    Animated.sequence([
      Animated.timing(welcomeOpacity, { toValue: 1, duration: 400, useNativeDriver: true }),
      Animated.delay(2600),
      Animated.timing(welcomeOpacity, { toValue: 0, duration: 600, useNativeDriver: true }),
    ]).start(() => setShowWelcome(false));
  }, [showWelcome]);

  // Re-read the cached avatar whenever the screen regains focus or the tab changes,
  // so a photo changed in Profile/Settings shows up in the header immediately.
  useFocusEffect(
    useCallback(() => {
      if (profile?.id) {
        AsyncStorage.getItem(`profile_photo_${profile.id}`).then((photo) => {
          if (photo) setProfilePhoto(photo);
        });
      }
    }, [profile?.id, activeTab])
  );

  // ── RENDER ──────────────────────────────────────────────────────────────
  // Full-screen spinner until fetchSession() finishes (or redirects).
  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: BG, alignItems: 'center', justifyContent: 'center' }}>
        <StatusBar style="dark" />
        <ActivityIndicator size="large" color={ACCENT} />
        <Text style={{ color: MUTED, marginTop: 12, fontSize: 14 }}>Loading your dashboard…</Text>
      </View>
    );
  }

  // Wide screens get the separate desktop console (its own sidebar and tabs).
  if (isDesktop) {
    return (
      <ConsoleStudentPC
        userProfile={profile}
        onRefresh={fetchSession}
        unreadCount={unreadNotifs}
        onNotificationsOpened={() => setUnread(0)}
      />
    );
  }

  // Mobile layout. On web the root is locked to the viewport height so only the
  // tab body scrolls and the header / bottom bar stay fixed.
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
          {/* Logo */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <View style={{
              width: 44, height: 44, borderRadius: 14,
              backgroundColor: '#ffffff', borderWidth: 1.5, borderColor: ACCENT_BD,
              alignItems: 'center', justifyContent: 'center',
              padding: 1,
              overflow: 'hidden',
            }}>
              <Image 
                source={require('../../../../assets/images/custom/Pen_Logo.jpg')} 
                style={{ width: '100%', height: '100%', borderRadius: 11 }}
                resizeMode="cover"
              />
            </View>
            <Text style={{ fontFamily: 'Roboto', fontSize: 22, fontWeight: '900', color: TEXT, letterSpacing: -0.5 }}>Anulekh</Text>
            <View style={{
              backgroundColor: ACCENT_BG, borderWidth: 1, borderColor: ACCENT_BD,
              borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3,
            }}>
              <Text style={{ fontFamily: 'Roboto', color: ACCENT, fontSize: 9, fontWeight: '800', letterSpacing: 0.5 }}>STUDENT</Text>
            </View>
          </View>

          {/* Right Action Icons: Notifications + Profile */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            {/* Bell: opens the Notifications tab and hides the red dot locally (rows are not marked read here) */}
            <TouchableOpacity
              onPress={() => { setActiveTab('notifications'); setUnread(0); }}
              activeOpacity={0.75}
              accessible={true}
              accessibilityRole="button"
              accessibilityLabel={`Notifications, ${unreadNotifs} unread`}
              style={{
                width: 44, height: 44, borderRadius: 15,
                backgroundColor: '#2563eb',
                borderWidth: 1.5, borderColor: '#1d4ed8',
                alignItems: 'center', justifyContent: 'center',
                shadowColor: '#2563eb', shadowOffset: { width: 0, height: 3 },
                shadowOpacity: 0.25, shadowRadius: 6, elevation: 3,
              }}
            >
              <Ionicons 
                name={activeTab === 'notifications' ? "notifications" : "notifications-outline"} 
                size={20} 
                color="#ffffff" 
              />
              {unreadNotifs > 0 && (
                <View style={{
                  position: 'absolute', top: 5, right: 5,
                  width: 9, height: 9, borderRadius: 4.5,
                  backgroundColor: '#ef4444', borderWidth: 1.5, borderColor: '#ffffff',
                }} />
              )}
            </TouchableOpacity>

            {/* Avatar: cached photo or first initial; opens the Account (settings) tab */}
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
                  {profile?.full_name?.charAt(0)?.toUpperCase() ?? 'U'}
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </SafeAreaView>

      {/* ── CONTENT ── */}
      <View style={{ flex: 1, overflow: 'hidden', minHeight: 0 }}>
        <TabPane active={activeTab === 'home'}><StudentHomeView /></TabPane>
        <TabPane active={activeTab === 'requests'}><StudentRequestsView /></TabPane>
        <TabPane active={activeTab === 'plan'}><StudentPlanView /></TabPane>
        <TabPane active={activeTab === 'profile'}><StudentProfileView /></TabPane>
        <TabPane active={activeTab === 'settings'}><SharedSettingsView /></TabPane>
        <TabPane active={activeTab === 'notifications'}><SharedNotificationsView /></TabPane>
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
            // Map tab id → translation key for the visible (and spoken) label.
            const translationKey = tab.id === 'home' ? 'nav_home' :
                                   tab.id === 'requests' ? 'nav_requests' :
                                   tab.id === 'plan' ? 'nav_plan' : 'nav_account';
            const translatedLabel = t(translationKey as any);
            return (
              <TouchableOpacity
                key={tab.id}
                onPress={() => {
                  setActiveTab(tab.id);
                  announceForAccessibility(`${translatedLabel} tab selected`);
                }}
                activeOpacity={0.7}
                accessible={true}
                accessibilityRole="tab"
                accessibilityState={{ selected: active }}
                accessibilityLabel={`${translatedLabel} tab`}
                accessibilityHint={`Switches to ${translatedLabel} screen`}
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
                <Ionicons
                  name={(active ? tab.iconActive : tab.iconInactive) as any}
                  size={21}
                  color={active ? ACCENT : '#94a3b8'}
                  importantForAccessibility="no"
                  accessibilityElementsHidden={true}
                />
                <Text
                  importantForAccessibility="no"
                  accessibilityElementsHidden={true}
                  style={{
                    fontFamily: 'Roboto',
                    fontSize: 11.5,
                    fontWeight: active ? '800' : '600',
                    marginTop: 3,
                    color: active ? ACCENT : '#64748b',
                  }}
                >
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
              <Feather name="check-circle" size={20} color={ACCENT} />
            </View>
            <View>
              <Text style={{ color: TEXT, fontWeight: '800', fontSize: 15 }}>
                Welcome, {profile?.full_name?.split(' ')[0] ?? 'there'}! 👋
              </Text>
              <Text style={{ color: MUTED, fontSize: 12, marginTop: 2 }}>Your dashboard is ready</Text>
            </View>
          </View>
        </Animated.View>
      )}

    </View>
  );
}
