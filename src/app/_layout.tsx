import React, { Component, ErrorInfo, ReactNode } from 'react';
import { DarkTheme, DefaultTheme, ThemeProvider, Stack } from 'expo-router';
import { useColorScheme, Alert, Platform, View, Text, ScrollView } from 'react-native';

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

export default function RootLayout() {
  const colorScheme = useColorScheme();
  return (
    <GlobalErrorBoundary>
      <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
        <AnimatedSplashOverlay />
        <Stack screenOptions={{ headerShown: false }} />
      </ThemeProvider>
    </GlobalErrorBoundary>
  );
}
