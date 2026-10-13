/**
 * RequestKit — small building blocks shared by the student's "new request" pages:
 * app/console/student/request_form.tsx (exam) and assignment_form.tsx (assignment).
 *
 * Keeping the page frame, header, section cards, submit button, tab bar and the request-type
 * chooser here means both pages stay short, look the same, and use the student portal theme.
 * Pure UI: no data loading.
 */
import React from 'react';
import { View, Text, Pressable, ActivityIndicator, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { router } from 'expo-router';
import { Feather, Ionicons } from '@expo/vector-icons';
import { gradient, portalCardStyle, STUDENT_THEME as THEME } from '@/core/portalTheme';
import { useInDesktopFrame } from '@/components/ui/DesktopShell';

type FeatherName = React.ComponentProps<typeof Feather>['name'];

/** Full-height page with the student portal's soft gradient background. */
export function RequestPage({ children }: { children: React.ReactNode }) {
  // Phone web: lock to the viewport so only the content scrolls and the tab bar stays put.
  // Inside the desktop frame the frame already sets the height.
  const inFrame = useInDesktopFrame();
  const lockToViewport = Platform.OS === 'web' && !inFrame;
  return (
    <View
      style={[
        { flex: 1, backgroundColor: THEME.page, overflow: 'hidden' },
        gradient(THEME.pageGradient),
        lockToViewport && ({ height: '100vh', maxHeight: '100vh' } as object),
      ]}
    >
      <StatusBar style="dark" />
      {children}
    </View>
  );
}

/** Top bar: round back button, title and an optional one-line subtitle. */
export function RequestHeader({ title, subtitle, onBack }: { title: string; subtitle?: string; onBack: () => void }) {
  return (
    <SafeAreaView edges={['top']} style={{ backgroundColor: '#ffffff', borderBottomLeftRadius: 22, borderBottomRightRadius: 22, shadowColor: THEME.shadow, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.08, shadowRadius: 12, elevation: 4 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 18, paddingVertical: 14 }}>
        <Pressable
          onPress={onBack}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          style={{ width: 42, height: 42, borderRadius: 14, backgroundColor: THEME.soft, borderWidth: 1, borderColor: THEME.softBorder, alignItems: 'center', justifyContent: 'center' }}
        >
          <Feather name="arrow-left" size={20} color={THEME.accentText} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text accessibilityRole="header" style={{ fontFamily: 'Roboto', fontSize: 19, fontWeight: '900', color: '#0f172a' }}>{title}</Text>
          {!!subtitle && <Text style={{ fontFamily: 'Roboto', fontSize: 12, color: '#64748b', marginTop: 2 }}>{subtitle}</Text>}
        </View>
      </View>
    </SafeAreaView>
  );
}

/** White card with an icon badge and an uppercase title; `right` is an optional badge or action. */
export function FormSection({ icon, title, right, children }: { icon: FeatherName; title: string; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <View style={portalCardStyle(THEME)}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14 }}>
        <View style={{ width: 30, height: 30, borderRadius: 10, backgroundColor: THEME.soft, borderWidth: 1, borderColor: THEME.softBorder, alignItems: 'center', justifyContent: 'center' }}>
          <Feather name={icon} size={15} color={THEME.accentText} />
        </View>
        <Text accessibilityRole="header" style={{ flex: 1, fontFamily: 'Roboto', fontSize: 12.5, fontWeight: '900', color: '#334155', letterSpacing: 0.8, textTransform: 'uppercase' }}>{title}</Text>
        {right}
      </View>
      {children}
    </View>
  );
}

/** Full-width button; shows a spinner and ignores taps while `loading`. */
export function SubmitButton({
  label,
  onPress,
  loading,
  disabled,
  color,
}: {
  label: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  color?: string;
}) {
  const off = loading || disabled;
  const bg = color || THEME.solid;
  return (
    <Pressable
      onPress={onPress}
      disabled={off}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [
        {
          backgroundColor: bg,
          borderRadius: 16,
          paddingVertical: 16,
          alignItems: 'center',
          justifyContent: 'center',
          shadowColor: bg,
          shadowOffset: { width: 0, height: 6 },
          shadowOpacity: 0.35,
          shadowRadius: 14,
          elevation: 5,
          opacity: off ? 0.65 : 1,
          transform: [{ scale: pressed ? 0.98 : 1 }],
          marginTop: 12,
          marginBottom: 20,
        },
      ]}
    >
      {loading ? (
        <ActivityIndicator color="#ffffff" />
      ) : (
        <Text style={{ fontFamily: 'Roboto', fontSize: 16, fontWeight: '900', color: '#ffffff', letterSpacing: 0.3 }}>
          {label}
        </Text>
      )}
    </Pressable>
  );
}

/** The student console's bottom tab bar with "Requests" active. Hidden inside the desktop frame. */
const TABS = [
  { id: 'home', icon: 'home', label: 'Home' },
  { id: 'requests', icon: 'document-text', label: 'Requests' },
  { id: 'plan', icon: 'calendar', label: 'Plan' },
  { id: 'settings', icon: 'person', label: 'Account' },
] as const;

export function RequestTabBar() {
  const inFrame = useInDesktopFrame();
  if (inFrame) return null;
  return (
    <SafeAreaView edges={['bottom']} style={{ backgroundColor: '#ffffff', borderTopLeftRadius: 20, borderTopRightRadius: 20, shadowColor: '#000', shadowOffset: { width: 0, height: -4 }, shadowOpacity: 0.07, shadowRadius: 12, elevation: 5 }}>
      <View style={{ flexDirection: 'row', padding: 8, gap: 4 }}>
        {TABS.map((tab) => {
          const active = tab.id === 'requests';
          return (
            <Pressable
              key={tab.id}
              onPress={() => router.replace(`/console/student?tab=${tab.id}` as any)}
              accessibilityRole="tab"
              accessibilityLabel={tab.label}
              style={{ flex: 1, alignItems: 'center', paddingVertical: 9, borderRadius: 20, backgroundColor: active ? THEME.soft : 'transparent' }}
            >
              <Ionicons name={tab.icon} size={23} color={active ? THEME.primary : '#94a3b8'} />
              <Text style={{ fontFamily: 'Roboto', fontSize: 11, fontWeight: active ? '800' : '600', marginTop: 3, color: active ? THEME.primary : '#94a3b8' }}>{tab.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </SafeAreaView>
  );
}

// ── Request-type chooser ──────────────────────────────────────────────────────────────────────

/** One option row: icon tile, title, one-line description, optional badge, chevron. */
function ChoiceCard({
  icon,
  title,
  text,
  badge,
  tint,
  filled,
  borderColor,
  badgeBg,
  badgeTextColor,
  onPress,
  a11yHint,
}: {
  icon: FeatherName;
  title: string;
  text: string;
  badge?: string;
  tint: string;
  filled?: boolean;
  borderColor?: string;
  badgeBg?: string;
  badgeTextColor?: string;
  onPress: () => void;
  a11yHint: string;
}) {
  const isFilled = !!filled;
  const cardBorder = borderColor || (isFilled ? '#1d4ed8' : '#e2e8f0');

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${text}`}
      accessibilityHint={a11yHint}
      style={({ pressed }) => [
        {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 14,
          padding: 16,
          borderRadius: 20,
          marginBottom: 12,
          borderWidth: 1.5,
          borderColor: cardBorder,
          backgroundColor: isFilled ? tint : '#ffffff',
          shadowColor: tint,
          shadowOffset: { width: 0, height: isFilled ? 6 : 4 },
          shadowOpacity: isFilled ? 0.28 : 0.08,
          shadowRadius: isFilled ? 14 : 10,
          elevation: isFilled ? 5 : 2,
          transform: [{ scale: pressed ? 0.98 : 1 }],
        },
      ]}
    >
      {/* Icon tile */}
      <View
        style={{
          width: 50,
          height: 50,
          borderRadius: 16,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: isFilled ? 'rgba(255,255,255,0.22)' : `${tint}14`,
          borderWidth: isFilled ? 0 : 1,
          borderColor: isFilled ? 'transparent' : `${tint}30`,
        }}
      >
        <Feather name={icon} size={23} color={isFilled ? '#ffffff' : tint} />
      </View>

      {/* Text block */}
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <Text
            style={{
              fontFamily: 'Roboto',
              fontSize: 16,
              fontWeight: '900',
              color: isFilled ? '#ffffff' : '#0f172a',
            }}
          >
            {title}
          </Text>
          {!!badge && (
            <View
              style={{
                backgroundColor: badgeBg || (isFilled ? '#ffffff' : `${tint}16`),
                borderRadius: 8,
                paddingHorizontal: 8,
                paddingVertical: 2.5,
                borderWidth: isFilled ? 0 : 1,
                borderColor: isFilled ? 'transparent' : `${tint}35`,
              }}
            >
              <Text
                style={{
                  fontFamily: 'Roboto',
                  fontSize: 10,
                  fontWeight: '900',
                  color: badgeTextColor || (isFilled ? tint : tint),
                  letterSpacing: 0.5,
                }}
              >
                {badge}
              </Text>
            </View>
          )}
        </View>
        <Text
          style={{
            fontFamily: 'Roboto',
            fontSize: 12.5,
            marginTop: 4,
            lineHeight: 17,
            color: isFilled ? 'rgba(255,255,255,0.92)' : '#64748b',
          }}
        >
          {text}
        </Text>
      </View>

      <Feather
        name="chevron-right"
        size={22}
        color={isFilled ? '#ffffff' : tint}
      />
    </Pressable>
  );
}

/** Section header pill matching category theme colors. */
function GroupLabel({
  icon,
  label,
  tint,
  bg,
  borderColor,
}: {
  icon: FeatherName;
  label: string;
  tint: string;
  bg: string;
  borderColor: string;
}) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12, marginTop: 14 }}>
      <View
        style={{
          backgroundColor: bg,
          paddingHorizontal: 10,
          paddingVertical: 4.5,
          borderRadius: 10,
          borderWidth: 1,
          borderColor: borderColor,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 6,
        }}
      >
        <Feather name={icon} size={12} color={tint} />
        <Text
          style={{
            fontFamily: 'Roboto',
            fontSize: 11,
            fontWeight: '900',
            color: tint,
            letterSpacing: 0.8,
            textTransform: 'uppercase',
          }}
        >
          {label}
        </Text>
      </View>
      <View style={{ flex: 1, height: 1, backgroundColor: '#e2e8f0' }} />
    </View>
  );
}

/**
 * First screen of a new request: Exam (auto-fill from admit card, or manual) or Assignment.
 * Beautifully color-coded: Blue for Exam Scribes, Warm Orange for Assignments.
 */
export function RequestTypeChooser({
  onAutoFill,
  onManual,
  onAssignment,
}: {
  onAutoFill: () => void;
  onManual: () => void;
  onAssignment: () => void;
}) {
  return (
    <View>
      <Text
        accessibilityRole="header"
        style={{
          fontFamily: 'Roboto',
          fontSize: 22,
          fontWeight: '900',
          color: '#0f172a',
          letterSpacing: -0.4,
        }}
      >
        What do you need help with?
      </Text>
      <Text style={{ fontFamily: 'Roboto', fontSize: 13, color: '#64748b', marginTop: 4, marginBottom: 10 }}>
        Pick a request category below to get started.
      </Text>

      {/* ── EXAMS SECTION (Blue #2563eb theme) ── */}
      <GroupLabel
        icon="edit-3"
        label="Exam Scribe Requests"
        tint="#1d4ed8"
        bg="#eff6ff"
        borderColor="#bfdbfe"
      />
      <ChoiceCard
        filled
        icon="upload-cloud"
        title="Scan Admit Card"
        text="Upload photo or PDF hall ticket — exam details auto-filled by AI"
        badge="FASTEST • AI"
        tint="#2563eb"
        badgeBg="#ffffff"
        badgeTextColor="#1d4ed8"
        onPress={onAutoFill}
        a11yHint="Opens file picker to select hall ticket for automatic extraction"
      />
      <ChoiceCard
        icon="edit-3"
        title="Fill Exam Manually"
        text="Enter subject, date, time and venue yourself step by step"
        badge="STEP BY STEP"
        tint="#2563eb"
        borderColor="#bfdbfe"
        badgeBg="#eff6ff"
        badgeTextColor="#2563eb"
        onPress={onManual}
        a11yHint="Opens manual exam request form"
      />

      {/* ── ASSIGNMENTS SECTION (Warm Orange #ea580c theme) ── */}
      <GroupLabel
        icon="file-text"
        label="Academic Writing & Assignments"
        tint="#c2410c"
        bg="#fff7ed"
        borderColor="#fed7aa"
      />
      <ChoiceCard
        icon="file-text"
        title="Assignment Help"
        text="Get a verified writer to complete your written homework, reports or projects"
        badge="WRITING HELP"
        tint="#ea580c"
        borderColor="#fed7aa"
        badgeBg="#fff7ed"
        badgeTextColor="#ea580c"
        onPress={onAssignment}
        a11yHint="Opens assignment request form"
      />
    </View>
  );
}
