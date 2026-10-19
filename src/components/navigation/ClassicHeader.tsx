/**
 * ClassicHeader — Preserved edge-to-edge white brand header component.
 *
 * Saved for future reference and alternative design presentation per user request.
 * Contains:
 * - Brand squircle Pen_Logo box (44x44, borderRadius 14, subtle shadow)
 * - Inset vertical divider line (#CBD5E1)
 * - Wordmark title "Anulekh." with uppercase colored subtitle ("STUDENT PORTAL" / "SCRIBE PORTAL")
 * - Circular notification bell action button with unread badge counter
 * - Circular profile button with avatar photo or user initials and theme status dot
 * - Edge-to-edge flat layout with hairline bottom border and subtle elevation shadow
 */
import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Image,
  StyleProp,
  ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather, Ionicons } from '@expo/vector-icons';
import { useLanguage } from '@/core/translation';

export interface ClassicHeaderProps {
  /** Role theme: 'student' (blue accents) or 'scribe' (green accents). */
  role?: 'student' | 'scribe';
  /** Unread notifications count. */
  unreadCount?: number;
  /** Whether the notification screen/tab is currently open. */
  isNotificationActive?: boolean;
  /** Local or remote avatar photo URL. */
  profilePhoto?: string | null;
  /** User's full name for initials fallback. */
  fullName?: string | null;
  /** Callback when notification bell is pressed. */
  onNotificationPress?: () => void;
  /** Callback when profile button is pressed. */
  onProfilePress?: () => void;
  /** Optional container style override. */
  style?: StyleProp<ViewStyle>;
}

export function ClassicHeader({
  role = 'student',
  unreadCount = 0,
  isNotificationActive = false,
  profilePhoto,
  fullName,
  onNotificationPress,
  onProfilePress,
  style,
}: ClassicHeaderProps) {
  const { t } = useLanguage();
  const isScribe = role === 'scribe';

  // Title Case subtitle: only the first letter of each word is capital, not all
  const subtitleText = isScribe ? 'Scribe Portal' : (t('student_portal') || 'Student Portal');
  const subtitleColor = isScribe ? '#16A34A' : '#2563EB';
  const dotColor = isScribe ? '#16A34A' : '#2563EB';

  const userInitial = (fullName?.trim()?.[0] || 'U').toUpperCase();

  return (
    <SafeAreaView
      edges={['top']}
      style={[
        {
          backgroundColor: '#ffffff',
          borderBottomWidth: 1,
          borderBottomColor: 'rgba(0,0,0,0.06)',
          shadowColor: '#0f172a',
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.05,
          shadowRadius: 12,
          elevation: 4,
          zIndex: 10,
        },
        style,
      ]}
    >
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: 16,
          paddingTop: 12,
          paddingBottom: 12,
        }}
      >
        {/* Logo & Modern Brand Wordmark with Subtitle */}
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          {/* Brand Logo with shiny white border and deep shade */}
          <View
            style={{
              width: 44,
              height: 44,
              borderRadius: 14,
              backgroundColor: '#ffffff',
              borderWidth: 2,
              borderColor: '#ffffff',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 1.5,
              overflow: 'hidden',
              shadowColor: '#0f172a',
              shadowOffset: { width: 0, height: 6 },
              shadowOpacity: 0.16,
              shadowRadius: 14,
              elevation: 6,
            }}
          >
            <Image
              source={require('../../../assets/images/custom/Pen_Logo.jpg')}
              style={{ width: '100%', height: '100%', borderRadius: 10 }}
              resizeMode="cover"
            />
          </View>

          {/* Inset vertical divider line */}
          <View style={{ width: 1.5, height: 24, backgroundColor: '#CBD5E1', marginHorizontal: 12 }} />

          {/* Title + Subtitle Column */}
          <View style={{ justifyContent: 'center' }}>
            <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
              <Text
                style={{
                  fontFamily: 'Roboto',
                  fontSize: 20,
                  fontWeight: '900',
                  color: '#0F172A',
                  letterSpacing: -0.5,
                }}
              >
                Anulekh
              </Text>
              <Text
                style={{
                  fontFamily: 'Roboto',
                  fontSize: 20,
                  fontWeight: '900',
                  color: subtitleColor,
                  letterSpacing: -0.5,
                  marginLeft: 1,
                }}
              >
                .
              </Text>
            </View>

            {/* Subtitle tag: Title Case */}
            <Text
              style={{
                fontFamily: 'Roboto',
                fontSize: 11.5,
                fontWeight: '700',
                color: subtitleColor,
                letterSpacing: 0.2,
                marginTop: 1,
              }}
            >
              {subtitleText}
            </Text>
          </View>
        </View>

        {/* Right Actions: Notification bell + Profile Avatar */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          {/* Notification Button: solid filled black and white bell with active / idle states (no yellow) */}
          <TouchableOpacity
            onPress={onNotificationPress}
            activeOpacity={0.75}
            accessible={true}
            accessibilityRole="button"
            accessibilityLabel={`Notifications, ${unreadCount} unread`}
            style={{
              width: 42,
              height: 42,
              borderRadius: 14,
              backgroundColor: isNotificationActive ? '#0f172a' : '#ffffff',
              borderWidth: 1.5,
              borderColor: isNotificationActive ? '#0f172a' : '#cbd5e1',
              alignItems: 'center',
              justifyContent: 'center',
              shadowColor: '#0f172a',
              shadowOffset: { width: 0, height: isNotificationActive ? 4 : 2 },
              shadowOpacity: isNotificationActive ? 0.25 : 0.08,
              shadowRadius: isNotificationActive ? 8 : 6,
              elevation: isNotificationActive ? 4 : 2,
              position: 'relative',
            }}
          >
            <Ionicons
              name="notifications"
              size={20}
              color={isNotificationActive ? '#ffffff' : '#0f172a'}
            />
            {unreadCount > 0 && (
              <View
                style={{
                  position: 'absolute',
                  top: 5,
                  right: 5,
                  width: 9,
                  height: 9,
                  borderRadius: 4.5,
                  backgroundColor: '#ef4444',
                  borderWidth: 1.5,
                  borderColor: '#ffffff',
                }}
              />
            )}
          </TouchableOpacity>

          {/* Profile Button: clean card with crisp border and slight color shades profile icon */}
          <TouchableOpacity
            onPress={onProfilePress}
            activeOpacity={0.8}
            accessible={true}
            accessibilityRole="button"
            accessibilityLabel={`Profile, ${fullName || 'User'}`}
            style={{
              width: 42,
              height: 42,
              borderRadius: 14,
              backgroundColor: '#ffffff',
              borderWidth: 1.5,
              borderColor: '#cbd5e1',
              alignItems: 'center',
              justifyContent: 'center',
              overflow: 'hidden',
              shadowColor: '#0f172a',
              shadowOffset: { width: 0, height: 2 },
              shadowOpacity: 0.08,
              shadowRadius: 8,
              elevation: 3,
              position: 'relative',
            }}
          >
            {profilePhoto ? (
              <Image source={{ uri: profilePhoto }} style={{ width: '100%', height: '100%', borderRadius: 12 }} />
            ) : (
              <View
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 10,
                  backgroundColor: isScribe ? '#ecfdf5' : '#eff6ff',
                  borderWidth: 1,
                  borderColor: isScribe ? '#bbf7d0' : '#bfdbfe',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Ionicons
                  name="person"
                  size={17}
                  color={isScribe ? '#059669' : '#2563eb'}
                />
              </View>
            )}

            {/* Status dot in theme accent */}
            <View
              style={{
                position: 'absolute',
                bottom: 2,
                right: 2,
                width: 9,
                height: 9,
                borderRadius: 4.5,
                backgroundColor: dotColor,
                borderWidth: 1.5,
                borderColor: '#ffffff',
              }}
            />
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}

export default ClassicHeader;
