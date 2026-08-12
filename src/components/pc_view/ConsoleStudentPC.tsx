import React, { useState } from 'react';
import { View, Text, Pressable, ScrollView, Image } from 'react-native';
import { router } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { supabase } from '@/core/supabase';
import { useThemeMode } from '@/core/themeContext';

import StudentHomePCView from './StudentHomePCView';
import StudentRequestsPCView from './StudentRequestsPCView';
import StudentProfilePCView from './StudentProfilePCView';
import SharedNotificationsPCView from './SharedNotificationsPCView';
import StudentPlanView from '../student/StudentPlanView';
import SharedSettingsView from '../shared/SharedSettingsView';

interface ConsoleStudentPCProps {
  userProfile?: any;
  requests?: any[];
  onRefresh?: () => void;
  activeTab?: string;
  onSelectTab?: (tab: string) => void;
  layoutMode?: 'auto' | 'pc' | 'mobile';
  onChangeLayoutMode?: (mode: 'auto' | 'pc' | 'mobile') => void;
  children?: React.ReactNode;
}

export default function ConsoleStudentPC({
  userProfile,
  requests = [],
  onRefresh,
  activeTab: externalActiveTab,
  onSelectTab: externalOnSelectTab,
  layoutMode = 'auto',
  onChangeLayoutMode,
  children,
}: ConsoleStudentPCProps) {
  const { isDark, toggleTheme } = useThemeMode();
  const [internalActiveTab, setInternalActiveTab] = useState('home');
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [showProfileDropdown, setShowProfileDropdown] = useState(false);
  const [showLayoutMenu, setShowLayoutMenu] = useState(false);

  const activeTab = externalActiveTab || internalActiveTab;
  const setActiveTab = (tab: string) => {
    if (externalOnSelectTab) externalOnSelectTab(tab);
    else setInternalActiveTab(tab);
    setShowProfileDropdown(false);
    setShowLayoutMenu(false);
  };

  const handleLogout = async () => {
    try {
      await supabase.auth.signOut();
    } catch (_) {}
    router.replace('/auth/login');
  };

  const navItems = [
    { id: 'home', label: 'Dashboard', icon: 'grid' as const },
    { id: 'requests', label: 'My Requests', icon: 'file-text' as const },
    { id: 'plan', label: 'Plan & Schedule', icon: 'calendar' as const },
    { id: 'profile', label: 'My Account', icon: 'user' as const },
    { id: 'notifications', label: 'Notifications', icon: 'bell' as const },
  ];

  // Dynamic Theme Colors (Ultra-Glassmorphic System)
  const headerBg = isDark ? 'rgba(15, 23, 42, 0.75)' : 'rgba(255, 255, 255, 0.65)';
  const headerBorder = isDark ? 'rgba(255, 255, 255, 0.12)' : 'rgba(255, 255, 255, 0.85)';
  const sidebarBg = isDark ? 'rgba(15, 23, 42, 0.72)' : 'rgba(255, 255, 255, 0.62)';
  const sidebarBorder = isDark ? 'rgba(255, 255, 255, 0.12)' : 'rgba(255, 255, 255, 0.85)';
  const mainBg = isDark ? '#090d16' : '#eef2ff';
  const textPrimary = isDark ? '#ffffff' : '#0f172a';
  const textSecondary = isDark ? '#94a3b8' : '#64748b';
  const pillBg = isDark ? 'rgba(30, 41, 59, 0.72)' : 'rgba(255, 255, 255, 0.82)';
  const pillBorder = isDark ? 'rgba(255, 255, 255, 0.2)' : 'rgba(255, 255, 255, 0.95)';

  return (
    <View style={{
      flex: 1,
      backgroundColor: mainBg,
      backgroundImage: isDark
        ? 'radial-gradient(at 15% 15%, rgba(37, 99, 235, 0.18) 0px, transparent 50%), radial-gradient(at 85% 85%, rgba(147, 51, 234, 0.15) 0px, transparent 50%)'
        : 'radial-gradient(at 10% 10%, rgba(37, 99, 235, 0.12) 0px, transparent 50%), radial-gradient(at 90% 90%, rgba(147, 51, 234, 0.09) 0px, transparent 50%), radial-gradient(at 50% 50%, rgba(59, 130, 246, 0.05) 0px, transparent 50%)',
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
        boxShadow: isDark
          ? '0 4px 20px 0 rgba(0, 0, 0, 0.4), inset 0 -1px 0 0 rgba(255, 255, 255, 0.1)'
          : '0 4px 24px -2px rgba(37, 99, 235, 0.07), inset 0 -1px 0 0 rgba(255, 255, 255, 0.85)',
      } as any}>
        {/* Top Left Branding Box: Aligned with Sidebar (260px / 84px) */}
        <View style={{
          width: isCollapsed ? 84 : 260,
          alignItems: 'center',
          justifyContent: 'center',
          paddingHorizontal: 12,
        }}>
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
              overflow: 'hidden',
              shadowColor: '#2563eb', shadowOffset: { width: 0, height: 4 },
              shadowOpacity: 0.2, shadowRadius: 8, elevation: 3, borderWidth: 1, borderColor: '#e2e8f0',
            }}>
              <Image
                source={require('../../../assets/images/custom/Pen_Logo.jpg')}
                style={{ width: '100%', height: '100%' }}
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
        <View style={{ width: 1, height: 26, backgroundColor: isDark ? 'rgba(51, 65, 85, 0.6)' : '#cbd5e1' }} />

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
            <Text style={{ fontSize: 12, fontWeight: '800', color: '#2563eb', textTransform: 'uppercase', letterSpacing: 0.5 }}>
              STUDENT PORTAL
            </Text>
            <Feather name="chevron-right" size={14} color={textSecondary} />
            <Text style={{ fontSize: 13, fontWeight: '700', color: textSecondary }}>
              {activeTab === 'home' && 'Dashboard Overview'}
              {activeTab === 'requests' && 'My Requests & Scribes'}
              {activeTab === 'plan' && 'Plan & Schedule'}
              {activeTab === 'profile' && 'My Account & Verification'}
              {activeTab === 'settings' && 'Account Settings'}
              {activeTab === 'notifications' && 'Notifications & Alerts'}
            </Text>
          </View>

          {/* Top Right: Layout Switcher + Theme Toggle + Notifications + User Profile Pill */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, position: 'relative' }}>
          
          {/* 1. Layout View 1-Click Toggle Button */}
          <Pressable
            onPress={() => {
              if (onChangeLayoutMode) {
                const nextMode = layoutMode === 'mobile' ? 'pc' : 'mobile';
                onChangeLayoutMode(nextMode);
              }
            }}
            style={({ hovered }: any) => ({
              flexDirection: 'row',
              alignItems: 'center',
              gap: 8,
              backgroundColor: hovered ? (isDark ? 'rgba(51, 65, 85, 0.8)' : '#e2e8f0') : pillBg,
              borderWidth: 1, borderColor: pillBorder,
              borderRadius: 14,
              paddingHorizontal: 12,
              paddingVertical: 8,
              cursor: 'pointer' as any,
              backdropFilter: 'blur(10px)',
            })}
          >
            <Feather
              name={layoutMode === 'mobile' ? 'monitor' : 'smartphone'}
              size={16}
              color="#2563eb"
            />
            <Text style={{ fontSize: 12, fontWeight: '800', color: textPrimary }}>
              {layoutMode === 'mobile' ? 'PC View' : 'Phone View'}
            </Text>
          </Pressable>

          {/* 2. Theme Toggle Button */}
          <Pressable
            onPress={toggleTheme}
            style={({ hovered }: any) => ({
              width: 40, height: 40, borderRadius: 12,
              backgroundColor: hovered ? (isDark ? 'rgba(51, 65, 85, 0.8)' : '#e2e8f0') : pillBg,
              borderWidth: 1, borderColor: pillBorder,
              alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer' as any,
              backdropFilter: 'blur(10px)',
              shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.04, shadowRadius: 4,
            })}
          >
            <Feather name={isDark ? "sun" : "moon"} size={18} color={isDark ? "#fbbf24" : "#475569"} />
          </Pressable>

          {/* 3. Notification Bell Icon */}
          <Pressable
            onPress={() => setActiveTab('notifications')}
            style={({ hovered }: any) => ({
              width: 40, height: 40, borderRadius: 12,
              backgroundColor: hovered ? (isDark ? 'rgba(51, 65, 85, 0.8)' : '#e2e8f0') : pillBg,
              borderWidth: 1, borderColor: pillBorder,
              alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer' as any,
              backdropFilter: 'blur(10px)',
              shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.04, shadowRadius: 4,
            })}
          >
            <Feather name="bell" size={18} color={isDark ? "#94a3b8" : "#475569"} />
            <View style={{
              position: 'absolute', top: 7, right: 7,
              width: 8, height: 8, borderRadius: 4,
              backgroundColor: '#2563eb',
            }} />
          </Pressable>

          {/* 4. User Profile Pill Button (Compact Pill Shape with First Name Only + Arrow) */}
          <Pressable
            onPress={() => setShowProfileDropdown(!showProfileDropdown)}
            style={({ hovered }: any) => ({
              backgroundColor: hovered ? (isDark ? 'rgba(30, 41, 59, 0.95)' : 'rgba(255, 255, 255, 0.95)') : pillBg,
              borderWidth: 1,
              borderColor: hovered ? '#2563eb' : pillBorder,
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
              backgroundColor: '#2563eb', alignItems: 'center', justifyContent: 'center',
            }}>
              <Text style={{ fontSize: 13, fontWeight: '900', color: '#ffffff' }}>
                {userProfile?.full_name ? userProfile.full_name.charAt(0).toUpperCase() : 'A'}
              </Text>
            </View>
            <Text style={{ fontSize: 13, fontWeight: '800', color: textPrimary }}>
              {userProfile?.full_name ? userProfile.full_name.split(' ')[0] : 'Aditya'}
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
              backgroundColor: isDark ? '#0f172a' : 'rgba(255, 255, 255, 0.95)',
              borderWidth: 1,
              borderColor: isDark ? 'rgba(51, 65, 85, 0.9)' : '#e2e8f0',
              borderRadius: 16,
              padding: 8,
              backdropFilter: 'blur(20px)',
              shadowColor: '#000000', shadowOffset: { width: 0, height: 12 }, shadowOpacity: 0.15, shadowRadius: 24,
              elevation: 12, zIndex: 200,
            }}>
              <Pressable
                onPress={() => setActiveTab('profile')}
                style={({ hovered }: any) => ({
                  flexDirection: 'row', alignItems: 'center', gap: 10,
                  paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10,
                  backgroundColor: hovered ? (isDark ? 'rgba(30, 41, 59, 0.8)' : '#f1f5f9') : 'transparent',
                  cursor: 'pointer' as any,
                })}
              >
                <Feather name="user" size={16} color="#2563eb" />
                <Text style={{ fontSize: 13, fontWeight: '700', color: textPrimary }}>My Profile</Text>
              </Pressable>

              <Pressable
                onPress={() => setActiveTab('settings')}
                style={({ hovered }: any) => ({
                  flexDirection: 'row', alignItems: 'center', gap: 10,
                  paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10,
                  backgroundColor: hovered ? (isDark ? 'rgba(30, 41, 59, 0.8)' : '#f1f5f9') : 'transparent',
                  cursor: 'pointer' as any,
                })}
              >
                <Feather name="settings" size={16} color={textSecondary} />
                <Text style={{ fontSize: 13, fontWeight: '700', color: textPrimary }}>Account Settings</Text>
              </Pressable>

              <View style={{ height: 1, backgroundColor: isDark ? 'rgba(51, 65, 85, 0.6)' : '#e2e8f0', marginVertical: 6 }} />

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
          boxShadow: isDark
            ? '4px 0 24px 0 rgba(0, 0, 0, 0.35)'
            : '4px 0 24px 0 rgba(37, 99, 235, 0.05)',
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
                      ? (isDark ? 'rgba(37, 99, 235, 0.22)' : 'rgba(37, 99, 235, 0.12)')
                      : (hovered ? (isDark ? 'rgba(30, 41, 59, 0.7)' : 'rgba(255, 255, 255, 0.85)') : 'transparent'),
                    borderWidth: 1,
                    borderColor: active
                      ? 'rgba(37, 99, 235, 0.35)'
                      : (hovered ? 'rgba(255, 255, 255, 0.9)' : 'transparent'),
                    paddingHorizontal: isCollapsed ? 12 : 16,
                    paddingVertical: 12,
                    borderRadius: 16,
                    cursor: 'pointer' as any,
                    boxShadow: active
                      ? '0 4px 16px 0 rgba(37, 99, 235, 0.15), inset 0 1px 1px 0 rgba(255, 255, 255, 0.8)'
                      : (hovered ? '0 4px 12px 0 rgba(31, 38, 135, 0.05)' : 'none'),
                    transform: [{ translateX: hovered && !isCollapsed ? 3 : 0 }],
                  })}
                >
                  <Feather name={item.icon} size={20} color={active ? '#2563eb' : textSecondary} />
                  {!isCollapsed && (
                    <Text style={{
                      fontSize: 14,
                      fontWeight: active ? '800' : '600',
                      color: active ? '#2563eb' : textPrimary,
                    }}>
                      {item.label}
                    </Text>
                  )}
                </Pressable>
              );
            })}

            {/* Quick Action Button: New Scribe Request */}
            <Pressable
              onPress={() => router.push('/console/student/request_form')}
              style={({ hovered }: any) => ({
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: isCollapsed ? 'center' : 'flex-start',
                gap: 12,
                backgroundColor: hovered ? '#1d4ed8' : '#2563eb',
                paddingHorizontal: isCollapsed ? 12 : 16,
                paddingVertical: 12,
                borderRadius: 14,
                marginTop: 12,
                cursor: 'pointer' as any,
                shadowColor: '#2563eb', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.25, shadowRadius: 8, elevation: 4,
              })}
            >
              <Feather name="plus-circle" size={20} color="#ffffff" />
              {!isCollapsed && (
                <Text style={{ fontSize: 14, fontWeight: '800', color: '#ffffff' }}>
                  New Scribe Request
                </Text>
              )}
            </Pressable>
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
              backgroundColor: hovered ? (isDark ? 'rgba(51, 65, 85, 0.8)' : '#e2e8f0') : (isDark ? 'rgba(30, 41, 59, 0.6)' : 'rgba(241, 245, 249, 0.8)'),
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
                  marginBottom: 24, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: isDark ? 'rgba(51, 65, 85, 0.6)' : '#cbd5e1'
                }}>
                  <Text style={{ fontSize: 26, fontWeight: '900', color: textPrimary, letterSpacing: -0.5 }}>
                    {activeTab === 'home' && 'Student Dashboard'}
                    {activeTab === 'requests' && 'Exam & Assignment Requests'}
                    {activeTab === 'plan' && 'Exam Calendar & Schedule'}
                    {activeTab === 'settings' && 'Account Settings'}
                    {activeTab === 'notifications' && 'Your Notifications'}
                  </Text>

                  {/* Top Right Quick Action */}
                  <Pressable
                    onPress={() => router.push('/console/student/request_form')}
                    style={({ hovered }: any) => ({
                      flexDirection: 'row', alignItems: 'center', gap: 8,
                      backgroundColor: hovered ? '#1d4ed8' : '#2563eb',
                      paddingHorizontal: 18, paddingVertical: 10, borderRadius: 12,
                      shadowColor: '#2563eb', shadowOffset: { width: 0, height: 4 },
                      shadowOpacity: 0.2, shadowRadius: 8, elevation: 4,
                      cursor: 'pointer' as any,
                    })}
                  >
                    <Feather name="plus-circle" size={18} color="#ffffff" />
                    <Text style={{ fontSize: 14, fontWeight: '700', color: '#ffffff' }}>New Scribe Request</Text>
                  </Pressable>
                </View>
              )}

              {/* Tab View Content */}
              {children ? children : (
                <>
                  {activeTab === 'home' && <StudentHomePCView userProfile={userProfile} requests={requests} onRefresh={onRefresh} />}
                  {activeTab === 'requests' && <StudentRequestsPCView requests={requests} onRefresh={onRefresh} />}
                  {activeTab === 'plan' && <StudentPlanView userProfile={userProfile} requests={requests} />}
                  {activeTab === 'profile' && <StudentProfilePCView userProfile={userProfile} onRefresh={onRefresh} />}
                  {activeTab === 'settings' && <SharedSettingsView userProfile={userProfile} />}
                  {activeTab === 'notifications' && <SharedNotificationsPCView userRole="student" />}
                </>
              )}

            </View>
          </ScrollView>
        </View>
      </View>
    </View>
  );
}
