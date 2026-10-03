/**
 * app/_layout.tsx — Expo Router root layout; wraps every route in the app.
 *
 * Runs once at start-up, before any screen renders, and:
 *  - silences LogBox warnings and forces Roboto as the default font on every <Text>/<TextInput>;
 *  - on web, replaces `Alert.alert` with a browser `alert()` polyfill and injects the Roboto stylesheet;
 *  - loads the bundled Roboto font files on native (web uses Google Fonts instead);
 *  - creates the Android notification channel(s) via `initializeNotificationChannels`.
 *
 * Render tree: GlobalErrorBoundary > ThemeProvider > [splash overlay, header-less Stack of all
 * routes, AppUpdateModal]. It loads no backend data itself; AppUpdateModal checks the app version.
 */
import React, { Component, ErrorInfo, ReactNode } from 'react';
import { DefaultTheme, ThemeProvider, Stack } from 'expo-router';
import { DesktopPageFrame, DesktopFrameWidth } from '@/components/ui/DesktopShell';
import { Alert, Platform, View, Text, TextInput, ScrollView, LogBox } from 'react-native';
import {
  useFonts,
  Roboto_300Light,
  Roboto_400Regular,
  Roboto_500Medium,
  Roboto_700Bold,
  Roboto_900Black,
} from '@expo-google-fonts/roboto';

// Hide all in-app yellow/red LogBox warnings (errors still reach the console and the error boundary).
LogBox.ignoreAllLogs(true);

// Set global fixed Roboto typography across Android & iOS
if ((Text as any).defaultProps == null) {
  (Text as any).defaultProps = {};
}
const defaultTextStyle = (Text as any).defaultProps.style;
(Text as any).defaultProps.style = defaultTextStyle
  ? [defaultTextStyle, { fontFamily: 'Roboto' }]
  : { fontFamily: 'Roboto' };

// Same default font for text inputs, preserving any existing default style.
if ((TextInput as any).defaultProps == null) {
  (TextInput as any).defaultProps = {};
}
const defaultInputStyle = (TextInput as any).defaultProps.style;
(TextInput as any).defaultProps.style = defaultInputStyle
  ? [defaultInputStyle, { fontFamily: 'Roboto' }]
  : { fontFamily: 'Roboto' };

import '@/global.css';
import { AnimatedSplashOverlay } from '@/components/ui/animated-icon';

// Global Alert Polyfill for React Native Web
if (Platform.OS === 'web') {
  // React Native Web's Alert.alert is a no-op, so show a blocking browser alert() instead. Since
  // alert() has no buttons, after it is dismissed the first non-"Cancel" button's onPress (or the
  // first button's) is invoked automatically — i.e. confirmation dialogs auto-confirm on web.
  Alert.alert = (title, message, buttons) => {
    const msg = message ? `\n\n${message}` : '';
    alert(`${title}${msg}`);
    
    if (buttons && buttons.length > 0) {
      const primaryButton = buttons.find(b => b.text && b.text !== 'Cancel') || buttons[0];
      if (primaryButton && primaryButton.onPress) {
        primaryButton.onPress();
      }
    }
  };

  // Inject the Google Roboto text font for web. Icon fonts come from src/vector-fonts-b64.css.
  if (typeof document !== 'undefined' && !document.getElementById('expo-vector-icons-web')) {
    if (!document.getElementById('google-font-roboto')) {
      const link = document.createElement('link');
      link.id = 'google-font-roboto';
      link.rel = 'stylesheet';
      link.href = 'https://fonts.googleapis.com/css2?family=Roboto:ital,wght@0,300;0,400;0,500;0,700;0,900;1,400&display=swap';
      document.head.appendChild(link);
    }

    // Global CSS that applies Roboto to the body, inputs and any RN-Web text without an explicit
    // font-family. The `expo-vector-icons-web` id doubles as the "already injected" guard above.
    const iconFontStyles = `
      @import url('https://fonts.googleapis.com/css2?family=Roboto:ital,wght@0,300;0,400;0,500;0,700;0,900;1,400&display=swap');

      body, #root, [dir="auto"]:not([style*="font-family"]), input, textarea {
        font-family: 'Roboto', -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }
    `;
    const styleElement = document.createElement('style');
    styleElement.id = 'expo-vector-icons-web';
    styleElement.appendChild(document.createTextNode(iconFontStyles));
    document.head.appendChild(styleElement);
  }
}

/**
 * Top-level React error boundary. If any screen throws during render, it replaces the whole app
 * with a dark full-screen panel showing the error message and stack trace (instead of a blank
 * screen) and logs the error to the console. There is no reset/retry; the app must be reloaded.
 *
 * Props: `children` — the app tree to protect.
 */
class GlobalErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean; error: Error | null }> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  /** Switches the boundary into its error state on the next render. */
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  /** Side effect only: logs the error and component stack. */
  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Global Catch:", error, errorInfo);
  }

  render() {
    // Error state: render the diagnostic panel; otherwise pass children through untouched.
    if (this.state.hasError) {
      return (
        <View style={{ flex: 1, backgroundColor: '#0f172a', padding: 24, justifyContent: 'center' }}>
          <Text style={{ fontSize: 20, fontWeight: 'bold', color: '#ef4444', marginBottom: 12 }}>
            App Runtime Error Caught
          </Text>
          {/* Scrollable error message + stack trace */}
          <ScrollView style={{ backgroundColor: '#1e293b', borderRadius: 8, padding: 12, maxHeight: 350 }}>
            <Text style={{ color: '#f87171', fontSize: 13, fontFamily: 'monospace' }}>
              {this.state.error?.toString()}
            </Text>
            <Text style={{ color: '#94a3b8', fontSize: 11, fontFamily: 'monospace', marginTop: 8 }}>
              {this.state.error?.stack}
            </Text>
          </ScrollView>
        </View>
      );
    }
    return this.props.children;
  }
}

import { initializeNotificationChannels } from '@/core/notifications';
import { useEffect } from 'react';

import { AppUpdateModal } from '@/components/ui/AppUpdateModal';

/**
 * Pages shown in a centred desktop frame on wide browser windows (see ui/DesktopShell), keyed by
 * route name, with the column width for each. Routes not listed render as before: the two portal
 * dashboards (they draw the desktop console) and the landing page (its own design, LandingPC).
 */
const DESKTOP_FRAMED_ROUTES: Record<string, DesktopFrameWidth> = {
  'auth/login': 'auth',
  'auth/register': 'auth',
  'landing/induction': 'narrow',
  'console/common/chat': 'page',
  'console/common/support': 'form',
  'console/common/notifications': 'form',
  'console/common/settings': 'form',
  'console/student/view_applications': 'page',
  'console/student/my_requests': 'page',
  'console/student/complete_profile': 'form',
  'console/student/request_form': 'form',
  'console/student/assignment_form': 'form',
  'console/student/profile': 'form',
  'console/scribe/apply': 'form',
  'console/scribe/achievements': 'page',
  'console/scribe/commitments': 'page',
  'console/scribe/complete_profile': 'form',
  'console/scribe/profile': 'form',
};

/**
 * Root layout component rendered by Expo Router around every route.
 * Side effects: registers fonts (native only) and Android notification channels on mount.
 */
export default function RootLayout() {

  // Native: register the bundled Roboto weights under several alias names ('Roboto',
  // 'Roboto-Bold', ...) so styles using any of them resolve. Web gets Roboto from Google Fonts.
  // The loaded flag is ignored: screens render immediately and pick up fonts once ready.
  useFonts(
    Platform.OS === 'web'
      ? {}
      : {
          Roboto_300Light,
          Roboto_400Regular,
          Roboto_500Medium,
          Roboto_700Bold,
          Roboto_900Black,
          Roboto: Roboto_400Regular,
          'Roboto-Regular': Roboto_400Regular,
          'Roboto-Medium': Roboto_500Medium,
          'Roboto-Bold': Roboto_700Bold,
          'Roboto-Black': Roboto_900Black,
        }
  );

  // Create the Android notification channel once at start-up (no-op on other platforms).
  useEffect(() => {
    initializeNotificationChannels().catch(console.warn);
  }, []);

  return (
    <GlobalErrorBoundary>
      <ThemeProvider value={DefaultTheme}>
        {/* Branded splash animation drawn over the app until it finishes (renders nothing on web) */}
        <AnimatedSplashOverlay />
        {/* All routes; each screen draws its own header */}
        <Stack
          screenOptions={{ headerShown: false }}
          // Wide web windows: phone-designed pages get a centred desktop frame (no-op on phones).
          screenLayout={({ children, route }) => (
            <DesktopPageFrame width={DESKTOP_FRAMED_ROUTES[route.name]}>{children}</DesktopPageFrame>
          )}
        />
        {/* Startup version check; shows an update prompt when the app is outdated */}
        <AppUpdateModal />
      </ThemeProvider>
    </GlobalErrorBoundary>
  );
}
