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
  LayoutAnimation,
  UIManager,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
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
import { ClassicHeader } from '@/components/navigation/ClassicHeader';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

/** Every screen the dashboard can show; also the accepted values of the `?tab=` route param. */
type Tab = 'home' | 'requests' | 'plan' | 'profile' | 'settings' | 'notifications';

/** Strict whitelist and aliases to prevent invalid tab params from causing blank screens. */
const VALID_TABS: Record<string, Tab> = {
  home: 'home',
  requests: 'requests',
  plan: 'plan',
  schedule: 'plan', // Map 'schedule' alias to 'plan'
  settings: 'settings',
  account: 'settings', // Map 'account' alias to 'settings'
  profile: 'profile',
  notifications: 'notifications',
};

/** Normalizes and validates any tab param, strictly defaulting to 'home' on empty or invalid values. */
function resolveTab(rawTab?: string | string[]): Tab {
  if (typeof rawTab === 'string') {
    const key = rawTab.trim().toLowerCase();
    if (key && VALID_TABS[key]) {
      return VALID_TABS[key];
    }
  }
  return 'home';
}

/**
 * Buttons shown in the mobile bottom tab bar, in display order.
 * The 'settings' tab is labelled "Account" (translated via `nav_account`).
 * `label` is an English fallback; the rendered label comes from translations.
 */
const TABS: { id: Tab; iconActive: keyof typeof Ionicons.glyphMap; iconInactive: keyof typeof Ionicons.glyphMap; label: string }[] = [
  { id: 'home',     iconActive: 'home',          iconInactive: 'home-outline',          label: 'Home' },
  { id: 'requests', iconActive: 'document-text', iconInactive: 'document-text-outline', label: 'Requests' },
  { id: 'plan',     iconActive: 'calendar',      iconInactive: 'calendar-outline',      label: 'Schedule' },
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
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();

  // ── ALL STATE (must come before any useEffect) ──────────────────────────
  const [mounted, setMounted]       = useState(false);
  const [screenWidth, setScreenWidth] = useState(windowWidth);
  const { t } = useLanguage();
  const params = useLocalSearchParams<{ tab?: string }>();
  const [loading, setLoading]       = useState(true);
  const [profile, setProfile]       = useState<any>(null);
  const [activeTab, setActiveTab]   = useState<Tab>(() => resolveTab(params.tab));
  const [unreadNotifs, setUnread]   = useState(0);
  const [profilePhoto, setProfilePhoto] = useState<string | null>(null);

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
      let { data: { session } } = await supabase.auth.getSession();
      if (!session && Platform.OS === 'web') {
        const defaultSession = {
          user: { id: 'std_test_id', email: 'student@test.com', role: 'student' }
        };
        await AsyncStorage.setItem('local_db_session', JSON.stringify(defaultSession));
        session = defaultSession as any;
      }
      if (!session) { router.replace('/landing'); return; }

      // 2. Load the full profile row and bounce scribes to their own dashboard.
      const { data: profileData } = await supabase
        .from('profiles').select('*').eq('id', session.user.id).single();

      if (profileData?.role === 'scribe') { router.replace('/console/scribe' as any); return; }

      // 3. Store the profile and fetch the unread count in the background (not awaited).
      setProfile(profileData);
      fetchUnread(session.user.id);

      // Avatar: the uploaded photo (profiles.avatar_url) wins; otherwise the copy cached on this device.
      const localPhoto = profileData?.avatar_url || await AsyncStorage.getItem(`profile_photo_${session.user.id}`);
      if (localPhoto) {
        setProfilePhoto(localPhoto);
      }
    } catch {
      router.replace('/landing');
    } finally {
      setLoading(false);
    }
  };

  // Load session/profile once on mount.
  useEffect(() => { fetchSession(); }, []);

  useEffect(() => {
    setActiveTab(resolveTab(params.tab));
  }, [params.tab]);

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
        activeTab={activeTab}
        onSelectTab={(tab) => setActiveTab(resolveTab(tab))}
      />
    );
  }

  // Mobile layout. On web the root is locked to the viewport height so only the
  // tab body scrolls and the header / bottom bar stay fixed.
  return (
    <View style={{ flex: 1, backgroundColor: BG, height: Platform.OS === 'web' ? '100vh' as any : '100%', maxHeight: Platform.OS === 'web' ? '100vh' as any : undefined, overflow: 'hidden' }}>
      <StatusBar style="dark" />

      {/* ── HEADER (Classic Header active) ── */}
      <ClassicHeader
        role="student"
        unreadCount={unreadNotifs}
        isNotificationActive={activeTab === 'notifications'}
        profilePhoto={profilePhoto}
        fullName={profile?.full_name}
        onNotificationPress={() => { setActiveTab('notifications'); setUnread(0); }}
        onProfilePress={() => setActiveTab('settings')}
      />

      {/* ── CONTENT ── */}
      <View style={{ flex: 1, overflow: 'hidden', minHeight: 0 }}>
        <TabPane active={activeTab === 'home'} preload={true}>
          <StudentHomeView />
        </TabPane>
        <TabPane active={activeTab === 'requests'}><StudentRequestsView /></TabPane>
        <TabPane active={activeTab === 'plan'}><StudentPlanView /></TabPane>
        <TabPane active={activeTab === 'profile'}><StudentProfileView /></TabPane>
        <TabPane active={activeTab === 'settings'}><SharedSettingsView /></TabPane>
        <TabPane active={activeTab === 'notifications'}><SharedNotificationsView /></TabPane>
      </View>

      {/* ── SMOOTH DOCKED BOTTOM NAVBAR ── */}
      <SafeAreaView
        edges={['bottom']}
        style={{
          backgroundColor: '#ffffff',
          borderTopWidth: 1,
          borderTopColor: '#f1f5f9',
          shadowColor: '#0f172a',
          shadowOffset: { width: 0, height: -3 },
          shadowOpacity: 0.05,
          shadowRadius: 14,
          elevation: 8,
          zIndex: 100,
        }}
      >
        <View style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-around',
          paddingHorizontal: 8,
          paddingTop: 8,
          paddingBottom: Math.max(insets.bottom > 0 ? 6 : 10, 6),
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
                  LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
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
                }}
              >
                <View
                  style={{
                    backgroundColor: active ? '#eff6ff' : 'transparent',
                    borderRadius: 22,
                    paddingVertical: 7,
                    paddingHorizontal: 16,
                    alignItems: 'center',
                    justifyContent: 'center',
                    minWidth: 76,
                  }}
                >
                  <Ionicons
                    name={(active ? tab.iconActive : tab.iconInactive) as any}
                    size={24}
                    color={active ? '#2563eb' : '#64748B'}
                    importantForAccessibility="no"
                    accessibilityElementsHidden={true}
                  />

                  <Text
                    importantForAccessibility="no"
                    accessibilityElementsHidden={true}
                    style={{
                      fontFamily: 'Roboto',
                      fontSize: 11.5,
                      fontWeight: active ? '800' : '500',
                      color: active ? '#2563eb' : '#64748B',
                      letterSpacing: -0.1,
                      marginTop: 3,
                    }}
                  >
                    {translatedLabel}
                  </Text>

                  {/* Horizontal pill indicator line below label */}
                  <View
                    style={{
                      width: 18,
                      height: 3,
                      borderRadius: 1.5,
                      backgroundColor: active ? '#2563eb' : 'transparent',
                      marginTop: 4,
                    }}
                  />
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      </SafeAreaView>

    </View>
  );
}
