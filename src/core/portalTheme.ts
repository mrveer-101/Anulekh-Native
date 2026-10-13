/**
 * Portal colour themes and small style helpers.
 *
 * Pure styling module (no data loading). Exports the `PortalTheme` palette shape, the concrete
 * themes (`PORTAL_THEMES`, `STUDENT_THEME`, `SCRIBE_THEME`), a cross-platform CSS `gradient()`
 * helper and `portalCardStyle()`. Imported by the student views (StudentHomeView,
 * StudentRequestsView, StudentPlanView), the scribe views (ScribeHomeView, ScribeExploreView,
 * ScribeCommitmentsView) and the shared SharedSettingsView so both portals look consistent.
 */
import { Platform } from 'react-native';

// Shared look for the student and scribe portal tabs (Account, Plan, Applied, …).
// Student matches the blue student portal; scribe matches the green scribe portal (header + tab bar).
// `solid` is used wherever white text sits on the colour, so it always meets contrast guidelines.
export interface PortalTheme {
  primary: string;       // icons, borders, accents
  accentText: string;    // coloured text on white
  solid: string;         // filled chips / small buttons with white text
  soft: string;          // tinted backgrounds
  softBorder: string;    // tinted borders
  cardBorder: string;
  shadow: string;
  page: string;          // fallback colour when gradients aren't available
  pageGradient: string;
  orb: string;
  hero: string;
  heroGradient: string;
  buttonGradient: string;
  roleLabel: string;
  roleIcon: 'user-graduate' | 'pen-nib';
}

/**
 * All available portal palettes, keyed by name. `scribeGreen` is the one in use for scribes;
 * `scribeOrange` is kept as an alternative (see SCRIBE_THEME below). Gradient fields are CSS
 * `linear-gradient(...)` strings meant to be passed through `gradient()`.
 */
export const PORTAL_THEMES: Record<'student' | 'scribeGreen' | 'scribeOrange', PortalTheme> = {
  student: {
    primary: '#2563eb', accentText: '#1d4ed8', solid: '#2563eb',
    soft: 'rgba(37,99,235,0.08)', softBorder: 'rgba(37,99,235,0.20)', cardBorder: 'rgba(37,99,235,0.12)', shadow: '#2563eb',
    page: '#F3F6FF', pageGradient: 'linear-gradient(180deg, #E4EDFF 0%, #EFEBFF 40%, #F7F9FF 72%, #FFFFFF 100%)',
    orb: 'rgba(99,102,241,0.10)',
    hero: '#E0EAFF', heroGradient: 'linear-gradient(135deg, #DCE8FF 0%, #E8E2FF 100%)',
    buttonGradient: 'linear-gradient(90deg, #2563eb 0%, #4f46e5 100%)',
    roleLabel: 'Student', roleIcon: 'user-graduate',
  },
  scribeGreen: {
    primary: '#16a34a', accentText: '#15803d', solid: '#15803d',
    soft: 'rgba(22,163,74,0.08)', softBorder: 'rgba(22,163,74,0.22)', cardBorder: 'rgba(22,163,74,0.14)', shadow: '#16a34a',
    page: '#F1FAF4', pageGradient: 'linear-gradient(180deg, #DDF4E6 0%, #ECF8EE 40%, #F6FBF7 72%, #FFFFFF 100%)',
    orb: 'rgba(20,184,166,0.10)',
    hero: '#DCF3E5', heroGradient: 'linear-gradient(135deg, #D6F2E0 0%, #E7F6DD 100%)',
    buttonGradient: 'linear-gradient(90deg, #166534 0%, #15803d 100%)',
    roleLabel: 'Scribe', roleIcon: 'pen-nib',
  },
  scribeOrange: {
    primary: '#ea580c', accentText: '#c2410c', solid: '#c2410c',
    soft: 'rgba(234,88,12,0.08)', softBorder: 'rgba(234,88,12,0.22)', cardBorder: 'rgba(234,88,12,0.14)', shadow: '#ea580c',
    page: '#FFF6EE', pageGradient: 'linear-gradient(180deg, #FFE9D8 0%, #FFF3E6 40%, #FFFAF4 72%, #FFFFFF 100%)',
    orb: 'rgba(245,158,11,0.12)',
    hero: '#FFE8D6', heroGradient: 'linear-gradient(135deg, #FFE2C9 0%, #FFF0D4 100%)',
    buttonGradient: 'linear-gradient(90deg, #b8390b 0%, #c2410c 100%)',
    roleLabel: 'Scribe', roleIcon: 'pen-nib',
  },
};

/** Theme used by every student-portal tab. */
export const STUDENT_THEME = PORTAL_THEMES.student;
// Scribe side uses the portal's green; switch to PORTAL_THEMES.scribeOrange to match the orange scribe-home test.
export const SCRIBE_THEME = PORTAL_THEMES.scribeGreen;

/**
 * CSS gradient on every platform: web passes `backgroundImage` straight to CSS, native uses RN's
 * experimental_backgroundImage. Always pair it with a solid backgroundColor as the fallback.
 */
export const gradient = (css: string) =>
  (Platform.OS === 'web' ? { backgroundImage: css } : {}) as object;

/**
 * White card with a tinted border and soft coloured shadow.
 * @param theme Portal palette supplying the border and shadow colours.
 * @returns A plain style object (iOS shadow* props plus Android `elevation`) to spread into `style`.
 */
export const portalCardStyle = (theme: PortalTheme) => ({
  backgroundColor: '#ffffff',
  borderRadius: 22,
  padding: 18,
  borderWidth: 1,
  borderColor: theme.cardBorder,
  shadowColor: theme.shadow,
  shadowOffset: { width: 0, height: 6 },
  shadowOpacity: 0.08,
  shadowRadius: 16,
  elevation: 3,
  marginBottom: 16,
});
