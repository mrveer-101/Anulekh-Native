/**
 * FloatingPillNavBar — Preserved floating pill bottom navigation component.
 *
 * Saved for future reference and reuse per design request.
 * Contains both:
 * 1. 'shiny-white' variant: Shiny white rim (1.5px #FFFFFF, rgba(255,255,255,0.95))
 *    with deep floating shadows (elevation: 10, multi-layered ambient blur & inset glass sheen).
 * 2. 'blue-rim' variant: Anulekh light blue outer rim (#DCEBFA, 5.5px visual rim)
 *    with inner white container.
 *
 * Supports both 'student' (blue accent #1D4ED8 / #EAF3FF) and 'scribe' (green accent #16A34A / #DCFCE7).
 */
import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Platform,
  LayoutAnimation,
  StyleProp,
  ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

export type PillTabItem = {
  id: string;
  label: string;
  iconActive: keyof typeof Ionicons.glyphMap;
  iconInactive: keyof typeof Ionicons.glyphMap;
};

export const DEFAULT_STUDENT_TABS: PillTabItem[] = [
  { id: 'home', label: 'Home', iconActive: 'home', iconInactive: 'home-outline' },
  { id: 'requests', label: 'Requests', iconActive: 'document-text', iconInactive: 'document-text-outline' },
  { id: 'plan', label: 'Plan', iconActive: 'calendar', iconInactive: 'calendar-outline' },
  { id: 'settings', label: 'Account', iconActive: 'person', iconInactive: 'person-outline' },
];

export const DEFAULT_SCRIBE_TABS: PillTabItem[] = [
  { id: 'home', label: 'Home', iconActive: 'home', iconInactive: 'home-outline' },
  { id: 'explore', label: 'Search', iconActive: 'search', iconInactive: 'search-outline' },
  { id: 'commitments', label: 'Applied', iconActive: 'document-text', iconInactive: 'document-text-outline' },
  { id: 'settings', label: 'Account', iconActive: 'person', iconInactive: 'person-outline' },
];

export interface FloatingPillNavBarProps {
  /** Array of tabs to render. Defaults to DEFAULT_STUDENT_TABS or DEFAULT_SCRIBE_TABS based on role. */
  tabs?: PillTabItem[];
  /** The currently selected tab ID. */
  activeTab: string;
  /** Callback invoked when a tab is pressed. */
  onTabPress: (tabId: string) => void;
  /** Design variant: 'shiny-white' (glass highlight with deep shadow) or 'blue-rim' (#DCEBFA border). */
  variant?: 'shiny-white' | 'blue-rim';
  /** Role theme accent: 'student' (blue) or 'scribe' (green). */
  role?: 'student' | 'scribe';
  /** Optional container style override. */
  containerStyle?: StyleProp<ViewStyle>;
  /** Optional max width for the floating pill (default 440). */
  maxWidth?: number;
}

export function FloatingPillNavBar({
  tabs,
  activeTab,
  onTabPress,
  variant = 'shiny-white',
  role = 'student',
  containerStyle,
  maxWidth = 440,
}: FloatingPillNavBarProps) {
  const insets = useSafeAreaInsets();
  const tabList = tabs || (role === 'scribe' ? DEFAULT_SCRIBE_TABS : DEFAULT_STUDENT_TABS);

  // Theme accents
  const isScribe = role === 'scribe';
  const activeBg = isScribe ? '#DCFCE7' : '#EAF3FF';
  const activeBorder = isScribe ? '#BBF7D0' : '#CFE2FE';
  const activeColor = isScribe ? '#16A34A' : '#1D4ED8';
  const inactiveColor = '#64748B';

  // Variant styling
  const isShiny = variant === 'shiny-white';

  const outerRimStyle: ViewStyle = isShiny
    ? {
        width: '100%',
        maxWidth,
        backgroundColor: 'rgba(255, 255, 255, 0.95)',
        borderWidth: 1.5,
        borderColor: '#FFFFFF',
        borderRadius: 28,
        padding: 5.5,
        shadowColor: '#0F172A',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.14,
        shadowRadius: 22,
        elevation: 10,
        ...(Platform.OS === 'web'
          ? ({
              boxShadow:
                '0 18px 36px -4px rgba(15, 23, 42, 0.14), 0 8px 16px -3px rgba(15, 23, 42, 0.08), inset 0 1.5px 1.5px 0 rgba(255, 255, 255, 1)',
            } as any)
          : {}),
      }
    : {
        width: '100%',
        maxWidth,
        backgroundColor: '#DCEBFA',
        borderRadius: 28,
        padding: 5.5,
        shadowColor: '#0F172A',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.10,
        shadowRadius: 16,
        elevation: 6,
      };

  const innerSurfaceStyle: ViewStyle = {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: isShiny ? '#E2E8F0' : '#D4E4F7',
    paddingHorizontal: 4,
    paddingVertical: 4,
    flexDirection: 'row',
    alignItems: 'center',
  };

  return (
    <View
      pointerEvents="box-none"
      style={[
        {
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          paddingHorizontal: 16,
          paddingBottom: Math.max(insets.bottom, 12),
          alignItems: 'center',
          zIndex: 100,
        },
        containerStyle,
      ]}
    >
      <View style={outerRimStyle}>
        <View style={innerSurfaceStyle}>
          {tabList.map((tab) => {
            const active = activeTab === tab.id;
            return (
              <TouchableOpacity
                key={tab.id}
                onPress={() => {
                  LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                  onTabPress(tab.id);
                }}
                activeOpacity={0.7}
                accessible={true}
                accessibilityRole="tab"
                accessibilityState={{ selected: active }}
                accessibilityLabel={`${tab.label} tab`}
                style={{
                  flex: 1,
                  alignItems: 'center',
                  justifyContent: 'center',
                  paddingVertical: 7,
                  paddingHorizontal: 4,
                  borderRadius: 18,
                  backgroundColor: active ? activeBg : 'transparent',
                  borderWidth: 1,
                  borderColor: active ? activeBorder : 'transparent',
                }}
              >
                <Ionicons
                  name={(active ? tab.iconActive : tab.iconInactive) as any}
                  size={22}
                  color={active ? activeColor : inactiveColor}
                  importantForAccessibility="no"
                  accessibilityElementsHidden={true}
                />
                <Text
                  importantForAccessibility="no"
                  accessibilityElementsHidden={true}
                  style={{
                    fontFamily: 'Roboto',
                    fontSize: 12,
                    fontWeight: active ? '700' : '500',
                    marginTop: 3,
                    color: active ? activeColor : inactiveColor,
                  }}
                >
                  {tab.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
    </View>
  );
}

export default FloatingPillNavBar;
