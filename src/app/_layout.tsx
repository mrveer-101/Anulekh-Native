import React, { Component, ErrorInfo, ReactNode } from 'react';
import { DefaultTheme, ThemeProvider, Stack } from 'expo-router';
import { Alert, Platform, View, Text, TextInput, ScrollView, LogBox } from 'react-native';
import {
  useFonts,
  Roboto_300Light,
  Roboto_400Regular,
  Roboto_500Medium,
  Roboto_700Bold,
  Roboto_900Black,
} from '@expo-google-fonts/roboto';

LogBox.ignoreAllLogs(true);

// Set global fixed Roboto typography across Android & iOS
if ((Text as any).defaultProps == null) {
  (Text as any).defaultProps = {};
}
const defaultTextStyle = (Text as any).defaultProps.style;
(Text as any).defaultProps.style = defaultTextStyle
  ? [defaultTextStyle, { fontFamily: 'Roboto' }]
  : { fontFamily: 'Roboto' };

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

class GlobalErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean; error: Error | null }> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Global Catch:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <View style={{ flex: 1, backgroundColor: '#0f172a', padding: 24, justifyContent: 'center' }}>
          <Text style={{ fontSize: 20, fontWeight: 'bold', color: '#ef4444', marginBottom: 12 }}>
            App Runtime Error Caught
          </Text>
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

export default function RootLayout() {

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

  useEffect(() => {
    initializeNotificationChannels().catch(console.warn);
  }, []);

  return (
    <GlobalErrorBoundary>
      <ThemeProvider value={DefaultTheme}>
        <AnimatedSplashOverlay />
        <Stack screenOptions={{ headerShown: false }} />
        <AppUpdateModal />
      </ThemeProvider>
    </GlobalErrorBoundary>
  );
}
