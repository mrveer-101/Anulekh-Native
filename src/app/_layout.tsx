import React, { Component, ErrorInfo, ReactNode } from 'react';
import { DarkTheme, DefaultTheme, ThemeProvider, Stack } from 'expo-router';
import { useColorScheme, Alert, Platform, View, Text, ScrollView, LogBox } from 'react-native';

LogBox.ignoreAllLogs(true);

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

  // Inject Vector Icon Fonts & Google Roboto Font for Web automatically
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
      @font-face {
        font-family: 'Feather';
        src: url('/assets/fonts/Feather.ttf') format('truetype'),
             url('https://cdn.jsdelivr.net/npm/react-native-vector-icons@10.2.0/Fonts/Feather.ttf') format('truetype');
        font-weight: normal;
        font-style: normal;
      }
      @font-face {
        font-family: 'Ionicons';
        src: url('/assets/fonts/Ionicons.ttf') format('truetype'),
             url('https://cdn.jsdelivr.net/npm/react-native-vector-icons@10.2.0/Fonts/Ionicons.ttf') format('truetype');
        font-weight: normal;
        font-style: normal;
      }
      @font-face {
        font-family: 'MaterialIcons';
        src: url('/assets/fonts/MaterialIcons.ttf') format('truetype'),
             url('https://cdn.jsdelivr.net/npm/react-native-vector-icons@10.2.0/Fonts/MaterialIcons.ttf') format('truetype');
        font-weight: normal;
        font-style: normal;
      }
      @font-face {
        font-family: 'Material Icons';
        src: url('/assets/fonts/MaterialIcons.ttf') format('truetype'),
             url('https://cdn.jsdelivr.net/npm/react-native-vector-icons@10.2.0/Fonts/MaterialIcons.ttf') format('truetype');
        font-weight: normal;
        font-style: normal;
      }
      @font-face {
        font-family: 'MaterialCommunityIcons';
        src: url('/assets/fonts/MaterialCommunityIcons.ttf') format('truetype'),
             url('https://cdn.jsdelivr.net/npm/react-native-vector-icons@10.2.0/Fonts/MaterialCommunityIcons.ttf') format('truetype');
        font-weight: normal;
        font-style: normal;
      }
      @font-face {
        font-family: 'FontAwesome';
        src: url('/assets/fonts/FontAwesome.ttf') format('truetype'),
             url('https://cdn.jsdelivr.net/npm/react-native-vector-icons@10.2.0/Fonts/FontAwesome.ttf') format('truetype');
        font-weight: normal;
        font-style: normal;
      }
      @font-face {
        font-family: 'FontAwesome5';
        src: url('/assets/fonts/FontAwesome5_Solid.ttf') format('truetype'),
             url('https://cdn.jsdelivr.net/npm/react-native-vector-icons@10.2.0/Fonts/FontAwesome5_Solid.ttf') format('truetype');
        font-weight: normal;
        font-style: normal;
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

import { ThemeProvider as AppThemeProvider } from '@/core/themeContext';

export default function RootLayout() {
  const colorScheme = useColorScheme();
  return (
    <GlobalErrorBoundary>
      <AppThemeProvider>
        <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
          <AnimatedSplashOverlay />
          <Stack screenOptions={{ headerShown: false }} />
        </ThemeProvider>
      </AppThemeProvider>
    </GlobalErrorBoundary>
  );
}
