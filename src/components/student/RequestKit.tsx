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

/** Full-width gradient button; shows a spinner and ignores taps while `loading`. */
export function SubmitButton({ label, onPress, loading, disabled }: { label: string; onPress: () => void; loading?: boolean; disabled?: boolean }) {
  const off = loading || disabled;
  return (
    <Pressable
      onPress={onPress}
      disabled={off}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [
        { backgroundColor: THEME.solid, borderRadius: 16, paddingVertical: 15, alignItems: 'center', shadowColor: THEME.shadow, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.25, shadowRadius: 14, elevation: 5, opacity: off ? 0.65 : 1, transform: [{ scale: pressed ? 0.98 : 1 }] },
        gradient(THEME.buttonGradient),
      ]}
    >
      {loading ? <ActivityIndicator color="#ffffff" /> : <Text style={{ fontFamily: 'Roboto', fontSize: 15, fontWeight: '900', color: '#ffffff' }}>{label}</Text>}
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
function ChoiceCard({ icon, title, text, badge, tint, filled, onPress, a11yHint }: {
  icon: FeatherName; title: string; text: string; badge?: string; tint: string; filled?: boolean; onPress: () => void; a11yHint: string;
}) {
  const fg = filled ? '#ffffff' : '#0f172a';
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${text}`}
      accessibilityHint={a11yHint}
      style={({ pressed }) => [
        { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16, borderRadius: 20, marginBottom: 12, transform: [{ scale: pressed ? 0.98 : 1 }] },
        filled
          ? [{ backgroundColor: THEME.solid, shadowColor: THEME.shadow, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.25, shadowRadius: 16, elevation: 5 }, gradient(THEME.buttonGradient)]
          : { backgroundColor: '#ffffff', borderWidth: 1.5, borderColor: THEME.cardBorder },
      ]}
    >
      <View style={{ width: 50, height: 50, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: filled ? 'rgba(255,255,255,0.18)' : `${tint}14` }}>
        <Feather name={icon} size={23} color={filled ? '#ffffff' : tint} />
      </View>
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Text style={{ fontFamily: 'Roboto', fontSize: 15.5, fontWeight: '900', color: fg }}>{title}</Text>
          {!!badge && (
            <View style={{ backgroundColor: filled ? 'rgba(255,255,255,0.22)' : THEME.soft, borderRadius: 8, paddingHorizontal: 7, paddingVertical: 2 }}>
              <Text style={{ fontFamily: 'Roboto', fontSize: 9.5, fontWeight: '900', color: filled ? '#ffffff' : THEME.accentText, letterSpacing: 0.4 }}>{badge}</Text>
            </View>
          )}
        </View>
        <Text style={{ fontFamily: 'Roboto', fontSize: 12, marginTop: 3, color: filled ? 'rgba(255,255,255,0.85)' : '#64748b' }}>{text}</Text>
      </View>
      <Feather name="chevron-right" size={20} color={filled ? '#ffffff' : '#94a3b8'} />
    </Pressable>
  );
}

/** Small uppercase label above a group of choices. */
function GroupLabel({ icon, label }: { icon: FeatherName; label: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10, marginTop: 6 }}>
      <Feather name={icon} size={13} color="#64748b" />
      <Text style={{ fontFamily: 'Roboto', fontSize: 11.5, fontWeight: '900', color: '#64748b', letterSpacing: 1, textTransform: 'uppercase' }}>{label}</Text>
    </View>
  );
}

/**
 * First screen of a new request: Exam (auto-fill from admit card, or manual) or Assignment.
 * The page decides what each choice does.
 */
export function RequestTypeChooser({ onAutoFill, onManual, onAssignment }: { onAutoFill: () => void; onManual: () => void; onAssignment: () => void }) {
  return (
    <View>
      <Text accessibilityRole="header" style={{ fontFamily: 'Roboto', fontSize: 22, fontWeight: '900', color: '#0f172a', letterSpacing: -0.4 }}>What do you need help with?</Text>
      <Text style={{ fontFamily: 'Roboto', fontSize: 13, color: '#64748b', marginTop: 4, marginBottom: 18 }}>Pick one to get started.</Text>

      <GroupLabel icon="edit" label="Exam" />
      <ChoiceCard filled icon="upload-cloud" title="Scan admit card" text="Upload a photo or PDF — we fill the details" badge="FAST" tint={THEME.primary} onPress={onAutoFill} a11yHint="Opens the file picker to select your hall ticket" />
      <ChoiceCard icon="edit-3" title="Fill manually" text="Enter subject, date and venue yourself" tint={THEME.primary} onPress={onManual} a11yHint="Opens the exam request form" />

      <GroupLabel icon="book-open" label="Assignment" />
      <ChoiceCard icon="file-text" title="Assignment help" text="Get a writer for an assignment" tint="#7c3aed" onPress={onAssignment} a11yHint="Opens the assignment request form" />
    </View>
  );
}
