import { DarkTheme, DefaultTheme, ThemeProvider, Stack } from 'expo-router';
import { useColorScheme, Alert, Platform } from 'react-native';

import '@/global.css';
import { AnimatedSplashOverlay } from '@/components/ui/animated-icon';

// Global Alert Polyfill for React Native Web
if (Platform.OS === 'web') {
  Alert.alert = (title, message, buttons) => {
    // Standard alert box for web
    const msg = message ? `\n\n${message}` : '';
    alert(`${title}${msg}`);
    
    // Auto-execute the callback of the primary option (e.g. redirecting)
    if (buttons && buttons.length > 0) {
      const primaryButton = buttons.find(b => b.text && b.text !== 'Cancel') || buttons[0];
      if (primaryButton && primaryButton.onPress) {
        primaryButton.onPress();
      }
    }
  };
}

export default function RootLayout() {
  const colorScheme = useColorScheme();
  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <AnimatedSplashOverlay />
      <Stack screenOptions={{ headerShown: false }} />
    </ThemeProvider>
  );
}
