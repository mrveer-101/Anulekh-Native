/**
 * DesktopShell — lets the portal screens adapt when they are shown inside the desktop (PC) console.
 *
 * The desktop consoles (components/pc_view/ConsoleStudentPC.tsx and ConsoleScribePC.tsx) wrap their
 * tab content in <DesktopShellProvider>. The tab screens are the same ones the phone uses
 * (StudentHomeView, StudentRequestsView, ScribeHomeView, ...), so every feature works the same on
 * both; they call `useInDesktopShell()` only to change layout:
 *   - skip their own full-page background (the desktop console already paints one), and
 *   - lay card lists out in columns with <DesktopGrid>.
 * On phones nothing here has any effect: the hook returns false and DesktopGrid renders its
 * children unchanged.
 */
import React, { createContext, useContext } from 'react';
import { Image, Platform, Pressable, Text, View, useWindowDimensions } from 'react-native';
import { router } from 'expo-router';
import { Feather } from '@expo/vector-icons';

/** True while rendering inside a desktop console. Defaults to false (phone layout). */
const DesktopShellContext = createContext(false);

/** Whether the current screen is shown inside the desktop console. */
export const useInDesktopShell = () => useContext(DesktopShellContext);

/** Marks everything below it as being inside the desktop console. */
export function DesktopShellProvider({ children }: { children: React.ReactNode }) {
  return <DesktopShellContext.Provider value={true}>{children}</DesktopShellContext.Provider>;
}

// Space taken beside the content by the desktop console: sidebar (260) plus content padding (2 × 32).
const SHELL_CHROME_WIDTH = 324;
// Content narrower than this keeps a single column so cards never get cramped.
const TWO_COLUMN_MIN_CONTENT = 860;
// Horizontal space between columns.
const COLUMN_GAP = 18;

/**
 * Number of card columns the desktop console has room for: 2 on normal laptop/desktop screens,
 * 1 on narrow windows. Always 1 outside the desktop console.
 */
export function useDesktopColumns(): number {
  const inShell = useInDesktopShell();
  const { width } = useWindowDimensions();
  if (!inShell) return 1;
  return width - SHELL_CHROME_WIDTH >= TWO_COLUMN_MIN_CONTENT ? 2 : 1;
}

/** Width of one cell in a row of `columns` cells, leaving room for the gaps between them. */
const cellWidth = (columns: number) => `calc(${100 / columns}% - ${(COLUMN_GAP * (columns - 1)) / columns}px)` as any;

/**
 * One cell of a desktop grid. With a single column it renders its child unchanged; otherwise
 * it gives it an equal share of the row. Used directly by FlatLists with `numColumns`
 * (e.g. StudentRequestsView) and internally by DesktopGrid.
 */
export function DesktopCell({ columns, children }: { columns: number; children: React.ReactNode }) {
  if (columns < 2) return <>{children}</>;
  return <View style={{ width: cellWidth(columns) }}>{children}</View>;
}

/** FlatList `columnWrapperStyle` for a desktop grid row (undefined for one column). */
export const desktopRowStyle = (columns: number) => (columns > 1 ? { columnGap: COLUMN_GAP } : undefined);

/**
 * Lays its children out in columns inside the desktop console; on phones (or narrow windows)
 * it returns the children exactly as they are, so the phone layout is untouched.
 * Each child keeps its own bottom margin, which provides the spacing between rows.
 */
export function DesktopGrid({ children }: { children: React.ReactNode }) {
  const columns = useDesktopColumns();
  if (columns < 2) return <>{children}</>;

  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: COLUMN_GAP, alignItems: 'flex-start' }}>
      {React.Children.toArray(children).map((child, i) => (
        <DesktopCell key={(child as any)?.key ?? i} columns={columns}>
          {child}
        </DesktopCell>
      ))}
    </View>
  );
}

// ── Desktop page frame ────────────────────────────────────────────────────────────────────────
// Pages that open on top of the portals (chat, support, applications, profile forms, sign-in, ...)
// were designed for phones. On a wide browser window the root layout (app/_layout.tsx) wraps them
// in <DesktopPageFrame>: a brand bar on a soft background with the page centred in a rounded
// "window", instead of stretching it edge to edge. Phones and narrow windows are unaffected.

/** Same breakpoint as the portal consoles: web windows at least this wide get the desktop layout. */
export const DESKTOP_MIN_WIDTH = 768;

/** True on web when the window is wide enough for the desktop layout. */
export function useIsDesktopWeb(): boolean {
  const { width } = useWindowDimensions();
  return Platform.OS === 'web' && width >= DESKTOP_MIN_WIDTH;
}

/**
 * Column widths for framed pages: 'page' for lists and chat, 'form' for forms, 'narrow' for small
 * pages, 'auth' for sign-in / sign-up (the form beside a brand panel on wide windows).
 */
export type DesktopFrameWidth = 'page' | 'form' | 'narrow' | 'auth';
const FRAME_MAX_WIDTH: Record<DesktopFrameWidth, number> = { page: 1040, form: 760, narrow: 520, auth: 1040 };
// The 'auth' brand panel needs this much window width; below it the form is shown alone (narrow).
const AUTH_PANEL_MIN_WINDOW = 1000;

/** Selling points on the sign-in brand panel (same claims as the landing page, LandingPC). */
const BRAND_POINTS: { icon: React.ComponentProps<typeof Feather>['name']; title: string; text: string }[] = [
  { icon: 'shield', title: 'Verified Volunteers', text: 'Every scribe is ID-checked and approved before they can apply.' },
  { icon: 'zap', title: '3-Min SOS Backup', text: 'A city reserve pool steps in if a scribe cannot make it.' },
  { icon: 'globe', title: 'Multi-Language', text: 'Use Anulekh in English, Hindi or Gujarati.' },
];

/** Left half of the 'auth' frame: logo, tagline and the selling points on the brand gradient. */
function AuthBrandPanel() {
  return (
    <View
      style={{
        width: '44%',
        padding: 44,
        justifyContent: 'space-between',
        backgroundColor: '#2563eb',
        backgroundImage: 'linear-gradient(150deg, #1d4ed8 0%, #4f46e5 55%, #7c3aed 100%)',
      } as any}
    >
      <View>
        <View style={{ width: 64, height: 64, borderRadius: 18, backgroundColor: '#ffffff', padding: 4, overflow: 'hidden' }}>
          <Image source={require('../../../assets/images/custom/Pen_Logo.jpg')} style={{ width: '100%', height: '100%', borderRadius: 14 }} resizeMode="cover" />
        </View>
        <Text style={{ fontFamily: 'Roboto', marginTop: 28, fontSize: 32, lineHeight: 38, fontWeight: '900', color: '#ffffff', letterSpacing: -0.6 }}>
          A Scribe for every Voice, dignity for every Exam.
        </Text>
        <Text style={{ fontFamily: 'Roboto', marginTop: 12, fontSize: 14.5, lineHeight: 21, color: 'rgba(255,255,255,0.82)' }}>
          Anulekh matches students who need a scribe with verified volunteers nearby.
        </Text>
      </View>

      <View style={{ gap: 16, marginTop: 32 }}>
        {BRAND_POINTS.map((p) => (
          <View key={p.title} style={{ flexDirection: 'row', gap: 14, alignItems: 'flex-start' }}>
            <View style={{ width: 38, height: 38, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.16)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)', alignItems: 'center', justifyContent: 'center' }}>
              <Feather name={p.icon} size={18} color="#ffffff" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontFamily: 'Roboto', fontSize: 14.5, fontWeight: '800', color: '#ffffff' }}>{p.title}</Text>
              <Text style={{ fontFamily: 'Roboto', fontSize: 12.5, lineHeight: 18, marginTop: 2, color: 'rgba(255,255,255,0.78)' }}>{p.text}</Text>
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

/** True while rendering inside a DesktopPageFrame (pages use it to hide phone-only chrome). */
const DesktopFrameContext = createContext(false);
export const useInDesktopFrame = () => useContext(DesktopFrameContext);

/**
 * Centres a phone-designed page in a desktop window frame.
 * @param width Column width preset; when undefined (or on phones) the page is returned unchanged.
 */
export function DesktopPageFrame({ width, children }: { width?: DesktopFrameWidth; children: React.ReactNode }) {
  const isDesktop = useIsDesktopWeb();
  const { width: windowWidth } = useWindowDimensions();
  if (!width || !isDesktop) return <>{children}</>;
  // Sign-in pages: brand panel + form when there is room, otherwise just the narrow form.
  const showBrandPanel = width === 'auth' && windowWidth >= AUTH_PANEL_MIN_WINDOW;
  const maxWidth = width === 'auth' && !showBrandPanel ? FRAME_MAX_WIDTH.narrow : FRAME_MAX_WIDTH[width];

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: '#eef2ff',
        backgroundImage: 'radial-gradient(at 8% 0%, rgba(37,99,235,0.12) 0px, transparent 45%), radial-gradient(at 95% 100%, rgba(22,163,74,0.10) 0px, transparent 45%)',
      } as any}
    >
      {/* Brand bar — the logo returns to the start screen, which routes signed-in users to their portal */}
      <View style={{ height: 64, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 28 }}>
        <Pressable
          onPress={() => router.replace('/')}
          accessibilityRole="link"
          accessibilityLabel="Anulekh home"
          style={{ flexDirection: 'row', alignItems: 'center', gap: 10, cursor: 'pointer' } as any}
        >
          <View style={{ width: 36, height: 36, borderRadius: 11, backgroundColor: '#ffffff', overflow: 'hidden', borderWidth: 1, borderColor: '#e2e8f0' }}>
            <Image source={require('../../../assets/images/custom/Pen_Logo.jpg')} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
          </View>
          <Text style={{
            fontFamily: Platform.select({
              ios: 'System',
              android: 'sans-serif-medium',
              default: '-apple-system, BlinkMacSystemFont, "Inter", "Segoe UI", Roboto, sans-serif',
            }),
            fontSize: 20,
            fontWeight: '800',
            color: '#0f172a',
            letterSpacing: -0.6,
          }}>
            Anulekh<Text style={{ color: '#2563eb', fontWeight: '900' }}>.</Text>
          </Text>
        </Pressable>
      </View>

      {/* The page itself, in a rounded white window */}
      <View
        style={{
          flex: 1,
          width: '100%',
          maxWidth,
          flexDirection: showBrandPanel ? 'row' : 'column',
          alignSelf: 'center',
          marginBottom: 24,
          borderRadius: 24,
          overflow: 'hidden',
          backgroundColor: '#ffffff',
          borderWidth: 1,
          borderColor: 'rgba(15,23,42,0.06)',
          boxShadow: '0 18px 48px -12px rgba(15,23,42,0.18)',
        } as any}
      >
        {showBrandPanel && <AuthBrandPanel />}
        <View style={{ flex: 1 }}>
          <DesktopFrameContext.Provider value={true}>{children}</DesktopFrameContext.Provider>
        </View>
      </View>
    </View>
  );
}
