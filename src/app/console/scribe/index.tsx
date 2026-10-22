/**
 * Scribe Dashboard — route `/console/scribe` (the volunteer scribe's home console).
 *
 * Reached after login / profile completion for users whose role is 'scribe'
 * (see `app/auth/login.tsx`, `app/console/index.tsx`, `app/index.tsx`).
 *
 * Layout:
 *  - Width >= 768px (desktop / large web): renders `ConsoleScribePC` instead.
 *  - Otherwise: a mobile shell with a header (logo, notifications bell,
 *    avatar), a tab body built from keep-alive `TabPane`s (Home, Search /
 *    Explore, Requests / Commitments, Account / Settings, Notifications) and
 *    a bottom tab bar. The initial tab can be set via the `?tab=` param.
 *
 * Data (via the `supabase` shim — a custom client for the Rust/Axum backend,
 * not real Supabase): the session, the scribe's `profiles` row and the count
 * of unread `notifications`. Uses AsyncStorage for a locally cached profile
 * photo (`profile_photo_<userId>`) and a one-time welcome toast flag
 * (`scribe_welcome_shown`). Redirects to `/landing` if there is no session.
 * Tab switches are announced to screen readers.
 */
import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  Animated,
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

import ScribeHomeView from '@/components/scribe/ScribeHomeView';
import ScribeExploreView from '@/components/scribe/ScribeExploreView';
import ScribeCommitmentsView from '@/components/scribe/ScribeCommitmentsView';
import SharedSettingsView from '@/components/shared/SharedSettingsView';
import SharedNotificationsView from '@/components/shared/SharedNotificationsView';
import { useWindowDimensions } from 'react-native';
import ConsoleScribePC from '@/components/pc_view/ConsoleScribePC';
import { TabPane } from '@/components/ui/TabPane';
import { ClassicHeader } from '@/components/navigation/ClassicHeader';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

/**
 * Every tab id the console understands. Note: only home, explore,
 * commitments, settings and notifications have a TabPane below; 'plan' and
 * 'profile' are accepted ids (e.g. from `?tab=`) but render no content.
 */
type Tab = 'home' | 'commitments' | 'plan' | 'profile' | 'settings' | 'notifications' | 'explore';

/**
 * Bottom-bar tabs in display order, with Ionicons names for the selected /
 * unselected state. `label` is an English fallback; the bar actually shows a
 * translated label looked up from the tab id (nav_home, nav_explore, ...).
 * Notifications is not in the bar — it is opened from the header bell.
 */
const TABS: { id: Tab; iconActive: keyof typeof Ionicons.glyphMap; iconInactive: keyof typeof Ionicons.glyphMap; label: string }[] = [
  { id: 'home',        iconActive: 'home',          iconInactive: 'home-outline',          label: 'Home' },
  { id: 'explore',     iconActive: 'search',        iconInactive: 'search-outline',        label: 'Search' },
  { id: 'commitments', iconActive: 'document-text', iconInactive: 'document-text-outline', label: 'Applied' },
  { id: 'settings',    iconActive: 'person',        iconInactive: 'person-outline',        label: 'Account' },
];

// ── Design tokens (light theme) ────────────────────────────────
const BG         = '#f9fafb';   // clean off-white background
const SURFACE    = 'rgba(255,255,255,0.82)'; // glass surface
const ACCENT     = '#16a34a';   // green primary
const ACCENT_BG  = 'rgba(22,163,74,0.09)';
const ACCENT_BD  = 'rgba(22,163,74,0.22)';
const TEXT       = '#0f172a';
const MUTED      = '#64748b';

/**
 * Scribe console screen (default export for expo-router). No props; reads the
 * optional `tab` search param to pre-select a tab.
 */
export default function ScribeDashboard() {
  const insets = useSafeAreaInsets();
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
   * Count the user's unread notifications (`notifications` rows with
   * `is_read = 0`) and store the count for the header bell's red dot.
   * @param uid the signed-in user's id.
   */
  const fetchUnread = async (uid: string) => {
    const { data } = await supabase
      .from('notifications').select('id').eq('user_id', uid).eq('is_read', 0);
    setUnread(data?.length ?? 0);
  };

  /**
   * Bootstrap the dashboard: verify the session, load the `profiles` row,
   * kick off the unread-notification count (not awaited), restore the cached
   * profile photo and decide whether to show the one-time welcome toast.
   * Any failure, or no session, sends the user to `/landing`. Also passed to
   * the desktop view as its `onRefresh` callback.
   */
  const fetchSession = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.replace('/landing'); return; }

      // Full profile row for the header avatar, welcome name and desktop view.
      const { data: profileData } = await supabase
        .from('profiles').select('*').eq('id', session.user.id).single();

      setProfile(profileData);
      fetchUnread(session.user.id);

      // Avatar: the uploaded photo (profiles.avatar_url) wins; otherwise the copy cached on this device.
      const localPhoto = profileData?.avatar_url || await AsyncStorage.getItem(`profile_photo_${session.user.id}`);
      if (localPhoto) {
        setProfilePhoto(localPhoto);
      }

      // Welcome toast is shown only once per device (flag is not per user).
      const shown = await AsyncStorage.getItem('scribe_welcome_shown');
      if (!shown) {
        setShowWelcome(true);
        await AsyncStorage.setItem('scribe_welcome_shown', 'true');
      }
    } catch {
      router.replace('/landing');
    } finally {
      setLoading(false);
    }
  };

  // Initial data load on mount.
  useEffect(() => { fetchSession(); }, []);

  // Deep-link support: `?tab=<id>` selects a tab (value is cast, not validated).
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

  // Re-read the cached profile photo whenever the screen regains focus or the
  // tab changes, so a newly saved photo shows up in the header.
  useFocusEffect(
    useCallback(() => {
      if (profile?.id) {
        AsyncStorage.getItem(`profile_photo_${profile.id}`).then((photo) => {
          if (photo) setProfilePhoto(photo);
        });
      }
    }, [profile?.id, activeTab])
  );

  // Full-screen spinner until the session / profile check finishes.
  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: BG, alignItems: 'center', justifyContent: 'center' }}>
        <StatusBar style="dark" />
        <ActivityIndicator size="large" color={ACCENT} />
        <Text style={{ color: MUTED, marginTop: 12, fontSize: 14 }}>Loading your dashboard…</Text>
      </View>
    );
  }

  // Wide screens get the separate desktop console (which manages its own tabs).
  if (isDesktop) {
    return (
      <ConsoleScribePC
        userProfile={profile}
        onRefresh={fetchSession}
        unreadCount={unreadNotifs}
        onNotificationsOpened={() => setUnread(0)}
      />
    );
  }

  // Mobile layout. On web the root is pinned to the viewport height so only
  // the tab body scrolls, keeping the header and bottom bar fixed.
  return (
    <View style={{ flex: 1, backgroundColor: BG, height: Platform.OS === 'web' ? '100vh' as any : '100%', maxHeight: Platform.OS === 'web' ? '100vh' as any : undefined, overflow: 'hidden' }}>
      <StatusBar style="dark" />

      {/* ── HEADER (Classic Header active) ── */}
      <ClassicHeader
        role="scribe"
        unreadCount={unreadNotifs}
        isNotificationActive={activeTab === 'notifications'}
        profilePhoto={profilePhoto}
        fullName={profile?.full_name}
        onNotificationPress={() => { setActiveTab('notifications'); setUnread(0); }}
        onProfilePress={() => setActiveTab('settings')}
      />

      {/* ── CONTENT ── */}
      <View style={{ flex: 1, overflow: 'hidden', minHeight: 0 }}>
        {/* Each tab mounts on first visit and then stays alive (hidden) — see TabPane */}
        <TabPane active={activeTab === 'home'}><ScribeHomeView /></TabPane>
        <TabPane active={activeTab === 'explore'}><ScribeExploreView /></TabPane>
        <TabPane active={activeTab === 'commitments'}><ScribeCommitmentsView /></TabPane>
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
          {/* One button per tab; styled with soft peach squircle pill and orange indicator dash when active */}
          {TABS.map((tab) => {
            const active = activeTab === tab.id;
            // Map tab id -> translation key ('commitments' uses nav_applied, i.e. "Applied").
            const translationKey = tab.id === 'home' ? 'nav_home' :
                                   tab.id === 'explore' ? 'nav_explore' :
                                   tab.id === 'commitments' ? 'nav_applied' : 'nav_account';
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
                    backgroundColor: active ? '#f0fdf4' : 'transparent',
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
                    color={active ? '#16a34a' : '#64748B'}
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
                      color: active ? '#16a34a' : '#64748B',
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
                      backgroundColor: active ? '#16a34a' : 'transparent',
                      marginTop: 4,
                    }}
                  />
                </View>
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
