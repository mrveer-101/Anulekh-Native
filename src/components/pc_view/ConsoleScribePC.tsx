/**
 * ConsoleScribePC - desktop / wide-screen shell of the volunteer scribe console.
 *
 * Rendered by app/console/scribe/index.tsx instead of the mobile layout when the
 * window is desktop-width (`isDesktop`). It draws a glass-style top header (logo,
 * breadcrumb, notification bell, profile pill + dropdown), a collapsible left sidebar
 * (260px / 84px) and a content area that hosts the scribe tab views
 * (ScribeHomeView, ScribeExploreView, ScribeCommitmentsView, ScribePlanView,
 * ScribeProfileView, SharedSettingsView, SharedNotificationsPCView).
 *
 * Each tab view is wrapped in a TabPane, so it is mounted on first visit and then kept
 * alive (just hidden) when switching tabs; every view loads its own data. This shell
 * itself only touches the backend to sign out (via the `supabase` shim, which talks to
 * the Rust/Axum backend). Styles such as `backdropFilter`, `boxShadow` and
 * `backgroundImage` are web-only and cast with `as any`.
 */
import React, { useState } from 'react';
import { View, Text, Pressable, ScrollView, Image } from 'react-native';
import { router } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { supabase } from '@/core/supabase';

import ScribeHomeView from '../scribe/ScribeHomeView';
import ScribeExploreView from '../scribe/ScribeExploreView';
import ScribeCommitmentsView from '../scribe/ScribeCommitmentsView';
import ScribeProfileView from '../scribe/ScribeProfileView';
import SharedSettingsView from '../shared/SharedSettingsView';
import SharedNotificationsPCView from './SharedNotificationsPCView';
import ScribePlanView from '../scribe/ScribePlanView';
import { TabPane } from '@/components/ui/TabPane';
import { DesktopShellProvider } from '@/components/ui/DesktopShell';

/**
 * Props for ConsoleScribePC.
 * - `userProfile`: the scribe's `profiles` row; used for the avatar initial and first name.
 * - `activeTab` / `onSelectTab`: optional controlled tab state; when omitted the shell
 *   keeps its own internal tab (default 'home').
 * - `availableRequests`, `myAssignedRequests`, `onAcceptRequest`, `onRefresh`, `layoutMode`,
 *   `onChangeLayoutMode`: accepted for API compatibility but not used by this component
 *   (the tab views fetch their own data).
 */
interface ConsoleScribePCProps {
  userProfile?: any;
  availableRequests?: any[];
  myAssignedRequests?: any[];
  onAcceptRequest?: (requestId: string) => void;
  onRefresh?: () => void;
  activeTab?: string;
  onSelectTab?: (tab: string) => void;
  layoutMode?: 'auto' | 'pc' | 'mobile';
  onChangeLayoutMode?: (mode: 'auto' | 'pc' | 'mobile') => void;
  /** Unread notifications; the bell shows a dot while this is above 0. */
  unreadCount?: number;
  /** Called when the Notifications tab is opened (the parent clears its unread count). */
  onNotificationsOpened?: () => void;
}

/** Desktop scribe console layout (header + sidebar + tab content). See the file header. */
export default function ConsoleScribePC({
  userProfile,
  availableRequests = [],
  myAssignedRequests = [],
  onAcceptRequest,
  onRefresh,
  activeTab: externalActiveTab,
  onSelectTab: externalOnSelectTab,
  layoutMode: _layoutMode,
  onChangeLayoutMode: _onChangeLayoutMode,
  unreadCount = 0,
  onNotificationsOpened,
}: ConsoleScribePCProps) {
  // Local UI state: fallback tab selection, sidebar collapsed flag, profile dropdown visibility.
  const [internalActiveTab, setInternalActiveTab] = useState('home');
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [showProfileDropdown, setShowProfileDropdown] = useState(false);

  // Controlled-or-uncontrolled tab: prefer the parent's tab when provided.
  const activeTab = externalActiveTab || internalActiveTab;
  /** Switches tab (via the parent callback if given) and always closes the profile dropdown. */
  const setActiveTab = (tab: string) => {
    if (externalOnSelectTab) externalOnSelectTab(tab);
    else setInternalActiveTab(tab);
    if (tab === 'notifications') onNotificationsOpened?.();
    setShowProfileDropdown(false);
  };

  /** Signs out (errors ignored) and always navigates to the login screen. */
  const handleLogout = async () => {
    try {
      await supabase.auth.signOut();
    } catch {}
    router.replace('/auth/login');
  };

  // Sidebar entries; `id` must match the TabPane keys below. 'settings' has no sidebar
  // entry and is reached only from the profile dropdown.
  const navItems = [
    { id: 'home', label: 'Exam Matches', icon: 'grid' as const },
    { id: 'explore', label: 'Explore Requests', icon: 'search' as const },
    { id: 'commitments', label: 'My Commitments', icon: 'file-text' as const },
    { id: 'plan', label: 'Plan & Calendar', icon: 'calendar' as const },
    { id: 'profile', label: 'My Account', icon: 'user' as const },
    { id: 'notifications', label: 'Notifications', icon: 'bell' as const },
  ];

  // Dynamic Theme Colors (Ultra-Glassmorphic System)
  const headerBg = 'rgba(255, 255, 255, 0.65)';
  const headerBorder = 'rgba(255, 255, 255, 0.85)';
  const sidebarBg = 'rgba(255, 255, 255, 0.62)';
  const sidebarBorder = 'rgba(255, 255, 255, 0.85)';
  const mainBg = '#f0fdf4';
  const textPrimary = '#0f172a';
  const textSecondary = '#64748b';
  const pillBg = 'rgba(255, 255, 255, 0.82)';
  const pillBorder = 'rgba(255, 255, 255, 0.95)';

  return (
    <View style={{
      flex: 1,
      backgroundColor: mainBg,
      backgroundImage: 'radial-gradient(at 10% 10%, rgba(22, 163, 74, 0.12) 0px, transparent 50%), radial-gradient(at 90% 90%, rgba(37, 99, 235, 0.09) 0px, transparent 50%), radial-gradient(at 50% 50%, rgba(16, 185, 129, 0.05) 0px, transparent 50%)',
    } as any}>
      {/* ═══════════════════════════════════════════
           TOP FULL-WIDTH ULTRA-GLASSMOPHIC HEADER BAR
      ═══════════════════════════════════════════ */}
      <View style={{
        height: 72,
        backgroundColor: headerBg,
        backdropFilter: 'blur(24px) saturate(180%)',
        WebkitBackdropFilter: 'blur(24px) saturate(180%)',
        borderBottomWidth: 1,
        borderBottomColor: headerBorder,
        flexDirection: 'row',
        alignItems: 'center',
        zIndex: 100,
        boxShadow: '0 4px 24px -2px rgba(22, 163, 74, 0.07), inset 0 -1px 0 0 rgba(255, 255, 255, 0.85)',
      } as any}>
        {/* Top Left Branding Box: Aligned with Sidebar (260px / 84px) */}
        <View style={{
          width: isCollapsed ? 84 : 260,
          alignItems: 'center',
          justifyContent: 'center',
          paddingHorizontal: 12,
        }}>
          {/* Logo + wordmark; clicking it goes to the app root route. The wordmark hides when collapsed. */}
          <Pressable
            onPress={() => router.push('/')}
            style={({ hovered }: any) => ({
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 12,
              cursor: 'pointer' as any,
              transform: [{ scale: hovered ? 1.02 : 1 }],
            })}
          >
            <View style={{
              width: 38, height: 38, borderRadius: 12,
              backgroundColor: '#ffffff', alignItems: 'center', justifyContent: 'center',
              padding: 1,
              overflow: 'hidden',
              shadowColor: '#16a34a', shadowOffset: { width: 0, height: 4 },
              shadowOpacity: 0.2, shadowRadius: 8, elevation: 3, borderWidth: 1, borderColor: '#e2e8f0',
            }}>
              <Image
                source={require('../../../assets/images/custom/Pen_Logo.jpg')}
                style={{ width: '100%', height: '100%', borderRadius: 9 }}
                resizeMode="cover"
              />
            </View>
            {!isCollapsed && (
              <Text style={{ fontFamily: 'Roboto', fontSize: 20, fontWeight: '900', color: textPrimary, letterSpacing: -0.5 }}>
                Anulekh
              </Text>
            )}
          </Pressable>
        </View>

        {/* Floating Vertical Separator (Inset 26px line, does not touch top/bottom edges) */}
        <View style={{ width: 1, height: 26, backgroundColor: '#cbd5e1' }} />

        {/* Top Right Main Header Area (Shifted slightly left with paddingLeft: 16) */}
        <View style={{
          flex: 1,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingLeft: 16,
          paddingRight: 24,
        }}>
          {/* Header Breadcrumb Trail with > Chevron Icon */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Text style={{ fontSize: 12, fontWeight: '800', color: '#16a34a', textTransform: 'uppercase', letterSpacing: 0.5 }}>
              VOLUNTEER SCRIBE PORTAL
            </Text>
            <Feather name="chevron-right" size={14} color={textSecondary} />
            <Text style={{ fontSize: 13, fontWeight: '700', color: textSecondary }}>
              {activeTab === 'home' && 'Dashboard Overview'}
              {activeTab === 'explore' && 'Explore Exam Requests'}
              {activeTab === 'commitments' && 'My Scribe Commitments'}
              {activeTab === 'plan' && 'Availability & Schedule'}
              {activeTab === 'profile' && 'Volunteer Profile'}
              {activeTab === 'settings' && 'Account Settings'}
              {activeTab === 'notifications' && 'Your Notifications'}
            </Text>
          </View>
        
        {/* Top Right: Theme Toggle + Notifications + User Profile Pill */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, position: 'relative' }}>

          

          {/* 2. Notification Bell Icon */}
          <Pressable
            onPress={() => setActiveTab('notifications')}
            style={({ hovered }: any) => ({
              width: 42, height: 42, borderRadius: 12,
              backgroundColor: hovered ? ('#e2e8f0') : pillBg,
              borderWidth: 1, borderColor: pillBorder,
              alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer' as any,
              backdropFilter: 'blur(10px)',
              shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.04, shadowRadius: 4,
            })}
          >
            <Feather name="bell" size={19} color={"#475569"} />
            {/* Green dot while there are unread notifications */}
            {unreadCount > 0 && (
              <View style={{
                position: 'absolute', top: 8, right: 8,
                width: 8, height: 8, borderRadius: 4,
                backgroundColor: '#16a34a',
              }} />
            )}
          </Pressable>

          {/* 3. User Profile Pill Button (Compact Pill Shape with First Name Only + Arrow) */}
          <Pressable
            onPress={() => setShowProfileDropdown(!showProfileDropdown)}
            style={({ hovered }: any) => ({
              backgroundColor: hovered ? ('rgba(255, 255, 255, 0.95)') : pillBg,
              borderWidth: 1,
              borderColor: hovered ? '#16a34a' : pillBorder,
              borderRadius: 24,
              paddingLeft: 6,
              paddingRight: 14,
              paddingVertical: 5,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 8,
              cursor: 'pointer' as any,
              backdropFilter: 'blur(10px)',
              boxShadow: '0 4px 16px 0 rgba(31, 38, 135, 0.06)',
            } as any)}
          >
            <View style={{
              width: 30, height: 30, borderRadius: 15,
              backgroundColor: '#16a34a', alignItems: 'center', justifyContent: 'center',
            }}>
              <Text style={{ fontSize: 13, fontWeight: '900', color: '#ffffff' }}>
                {userProfile?.full_name ? userProfile.full_name.charAt(0).toUpperCase() : 'V'}
              </Text>
            </View>
            <Text style={{ fontSize: 13, fontWeight: '800', color: textPrimary }}>
              {userProfile?.full_name ? userProfile.full_name.split(' ')[0] : 'Volunteer'}
            </Text>
            <Feather name={showProfileDropdown ? 'chevron-up' : 'chevron-down'} size={14} color={textSecondary} />
          </Pressable>

          {/* Profile Dropdown Option Box */}
          {showProfileDropdown && (
            <View style={{
              position: 'absolute',
              top: 54,
              right: 0,
              width: 220,
              backgroundColor: 'rgba(255, 255, 255, 0.95)',
              borderWidth: 1,
              borderColor: '#e2e8f0',
              borderRadius: 16,
              padding: 8,
              backdropFilter: 'blur(20px)',
              shadowColor: '#000000', shadowOffset: { width: 0, height: 12 }, shadowOpacity: 0.15, shadowRadius: 24,
              elevation: 12, zIndex: 200,
            }}>
              {/* Dropdown items: My Profile, Account Settings, divider, Log Out. */}
              <Pressable
                onPress={() => setActiveTab('profile')}
                style={({ hovered }: any) => ({
                  flexDirection: 'row', alignItems: 'center', gap: 10,
                  paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10,
                  backgroundColor: hovered ? ('#f1f5f9') : 'transparent',
                  cursor: 'pointer' as any,
                })}
              >
                <Feather name="user" size={16} color="#16a34a" />
                <Text style={{ fontSize: 13, fontWeight: '700', color: textPrimary }}>My Profile</Text>
              </Pressable>

              <Pressable
                onPress={() => setActiveTab('settings')}
                style={({ hovered }: any) => ({
                  flexDirection: 'row', alignItems: 'center', gap: 10,
                  paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10,
                  backgroundColor: hovered ? ('#f1f5f9') : 'transparent',
                  cursor: 'pointer' as any,
                })}
              >
                <Feather name="settings" size={16} color={textSecondary} />
                <Text style={{ fontSize: 13, fontWeight: '700', color: textPrimary }}>Account Settings</Text>
              </Pressable>

              <View style={{ height: 1, backgroundColor: '#e2e8f0', marginVertical: 6 }} />

              <Pressable
                onPress={handleLogout}
                style={({ hovered }: any) => ({
                  flexDirection: 'row', alignItems: 'center', gap: 10,
                  paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10,
                  backgroundColor: hovered ? 'rgba(239, 68, 68, 0.15)' : 'rgba(239, 68, 68, 0.08)',
                  cursor: 'pointer' as any,
                })}
              >
                <Feather name="log-out" size={16} color="#f87171" />
                <Text style={{ fontSize: 13, fontWeight: '800', color: '#f87171' }}>Log Out</Text>
              </Pressable>
            </View>
          )}
        </View>
      </View>
    </View>

      {/* ═══════════════════════════════════════════
           BELOW HEADER LAYOUT: SIDEBAR UNDER HEADER
      ═══════════════════════════════════════════ */}
      <View style={{ flex: 1, flexDirection: 'row', backgroundColor: mainBg }}>
        {/* Left Sidebar (Ultra-Glassmorphic Panel) */}
        <View style={{
          width: isCollapsed ? 84 : 260,
          backgroundColor: sidebarBg,
          backdropFilter: 'blur(24px) saturate(180%)',
          WebkitBackdropFilter: 'blur(24px) saturate(180%)',
          borderRightWidth: 1,
          borderRightColor: sidebarBorder,
          paddingVertical: 28,
          paddingHorizontal: isCollapsed ? 12 : 18,
          justifyContent: 'space-between',
          boxShadow: '4px 0 24px 0 rgba(22, 163, 74, 0.05)',
        } as any}>
          {/* Sidebar Navigation Options */}
          <View style={{ gap: 8 }}>
            {navItems.map((item) => {
              const active = activeTab === item.id;
              return (
                <Pressable
                  key={item.id}
                  onPress={() => setActiveTab(item.id)}
                  style={({ hovered }: any) => ({
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: isCollapsed ? 'center' : 'flex-start',
                    gap: 12,
                    backgroundColor: active
                      ? ('rgba(22, 163, 74, 0.12)')
                      : (hovered ? ('rgba(255, 255, 255, 0.85)') : 'transparent'),
                    borderWidth: 1,
                    borderColor: active
                      ? 'rgba(22, 163, 74, 0.35)'
                      : (hovered ? 'rgba(255, 255, 255, 0.9)' : 'transparent'),
                    paddingHorizontal: isCollapsed ? 12 : 16,
                    paddingVertical: 12,
                    borderRadius: 16,
                    cursor: 'pointer' as any,
                    boxShadow: active
                      ? '0 4px 16px 0 rgba(22, 163, 74, 0.15), inset 0 1px 1px 0 rgba(255, 255, 255, 0.8)'
                      : (hovered ? '0 4px 12px 0 rgba(31, 38, 135, 0.05)' : 'none'),
                    transform: [{ translateX: hovered && !isCollapsed ? 3 : 0 }],
                  })}
                >
                  <Feather name={item.icon} size={20} color={active ? '#16a34a' : textSecondary} />
                  {/* Labels are hidden in the collapsed (icon-only) sidebar. */}
                  {!isCollapsed && (
                    <Text style={{
                      fontSize: 14,
                      fontWeight: active ? '800' : '600',
                      color: active ? '#16a34a' : textPrimary,
                    }}>
                      {item.label}
                    </Text>
                  )}
                </Pressable>
              );
            })}
          </View>

          {/* Bottom Sidebar Action Buttons: Log Out + Collapse */}
          <View style={{ gap: 8 }}>
            {/* Log Out Button */}
            <Pressable
              onPress={handleLogout}
              style={({ hovered }: any) => ({
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: isCollapsed ? 'center' : 'flex-start',
                gap: 10,
                backgroundColor: hovered ? 'rgba(239, 68, 68, 0.15)' : 'rgba(239, 68, 68, 0.08)',
                borderWidth: 1,
                borderColor: 'rgba(239, 68, 68, 0.22)',
                paddingHorizontal: isCollapsed ? 12 : 16,
                paddingVertical: 10,
                borderRadius: 12,
                cursor: 'pointer' as any,
              })}
            >
              <Feather name="log-out" size={18} color="#ef4444" />
              {!isCollapsed && (
                <Text style={{ fontSize: 13, fontWeight: '800', color: '#ef4444' }}>
                  Log Out
                </Text>
              )}
            </Pressable>

            {/* Bottom Sidebar Collapse/Expand Toggle */}
            <Pressable
              onPress={() => setIsCollapsed(!isCollapsed)}
            style={({ hovered }: any) => ({
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: isCollapsed ? 'center' : 'flex-start',
              gap: 10,
              backgroundColor: hovered ? ('#e2e8f0') : ('rgba(241, 245, 249, 0.8)'),
              borderWidth: 1,
              borderColor: pillBorder,
              paddingHorizontal: isCollapsed ? 12 : 16,
              paddingVertical: 10,
              borderRadius: 12,
              cursor: 'pointer' as any,
            })}
          >
            <Feather name={isCollapsed ? 'chevrons-right' : 'chevrons-left'} size={18} color={textSecondary} />
            {!isCollapsed && (
              <Text style={{ fontSize: 13, fontWeight: '700', color: textSecondary }}>
                Collapse Sidebar
              </Text>
            )}
          </Pressable>
        </View>
      </View>

        {/* Right Main Content Area */}
        <View style={{ flex: 1, backgroundColor: mainBg }}>
          <ScrollView contentContainerStyle={{ padding: 32, flexGrow: 1, alignItems: 'center' }} showsVerticalScrollIndicator={false}>
            <View style={{ width: '100%', maxWidth: 1240 }}>

              {/* Content Body Title Header (Hidden for Profile Tab) */}
              {activeTab !== 'profile' && (
                <View style={{
                  flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                  marginBottom: 24, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: '#cbd5e1'
                }}>
                  <Text style={{ fontSize: 26, fontWeight: '900', color: textPrimary, letterSpacing: -0.5 }}>
                    {activeTab === 'home' && 'Scribe Dashboard'}
                    {activeTab === 'explore' && 'Explore Available Requests'}
                    {activeTab === 'commitments' && 'My Active Commitments'}
                    {activeTab === 'plan' && 'Availability Schedule'}
                    {activeTab === 'settings' && 'Account Settings'}
                    {activeTab === 'notifications' && 'Your Notifications'}
                  </Text>

                  {/* Top Right Quick Action */}
                  <Pressable
                    onPress={() => setActiveTab('explore')}
                    style={({ hovered }: any) => ({
                      flexDirection: 'row', alignItems: 'center', gap: 8,
                      backgroundColor: hovered ? '#15803d' : '#16a34a',
                      paddingHorizontal: 18, paddingVertical: 10, borderRadius: 12,
                      shadowColor: '#16a34a', shadowOffset: { width: 0, height: 4 },
                      shadowOpacity: 0.2, shadowRadius: 8, elevation: 4,
                      cursor: 'pointer' as any,
                    })}
                  >
                    <Feather name="search" size={18} color="#ffffff" />
                    <Text style={{ fontSize: 14, fontWeight: '700', color: '#ffffff' }}>Explore Requests</Text>
                  </Pressable>
                </View>
              )}

              {/* Tab View Content */}
              {/* Each view is kept mounted after its first visit (TabPane keep-alive) and fetches its own data. */}
              <DesktopShellProvider>
                <TabPane active={activeTab === 'home'}><ScribeHomeView /></TabPane>
                <TabPane active={activeTab === 'explore'}><ScribeExploreView /></TabPane>
                <TabPane active={activeTab === 'commitments'}><ScribeCommitmentsView /></TabPane>
                <TabPane active={activeTab === 'plan'}><ScribePlanView /></TabPane>
                <TabPane active={activeTab === 'profile'}><ScribeProfileView /></TabPane>
                <TabPane active={activeTab === 'settings'}><SharedSettingsView /></TabPane>
                <TabPane active={activeTab === 'notifications'}><SharedNotificationsPCView userRole="scribe" /></TabPane>
              </DesktopShellProvider>

            </View>
          </ScrollView>
        </View>
      </View>
    </View>
  );
}
