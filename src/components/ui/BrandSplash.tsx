import React from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';

// Shared launch visuals. The paper colour and logo image are the same ones the native splash uses
// (app.json → expo-splash-screen), so the hand-off from the native splash into the app is seamless.
// Assets: assets/images/splash-icon.png (logo tile) and assets/images/splash-background.jpg (paper + clouds).
export const SPLASH_PAPER = '#FBF8F3';
export const SPLASH_LOGO_SIZE = 152; // must match "imageWidth" for expo-splash-screen in app.json

/** Warm paper texture with soft blue / orange / green clouds, filling its parent. */
export function SplashBackground() {
  return (
    <Image
      source={require('@/assets/images/splash-background.jpg')}
      style={styles.background}
      resizeMode="cover"
      accessibilityElementsHidden
      importantForAccessibility="no"
    />
  );
}

/** Rounded, padded logo tile — the exact image shown on the native splash. */
export function SplashLogo() {
  return (
    <Image
      source={require('@/assets/images/splash-icon.png')}
      style={styles.logo}
      accessibilityLabel="Anulekh logo"
    />
  );
}

/** App name + tagline, placed just below the centred logo without shifting it. */
export function SplashTitle() {
  return (
    <View style={styles.titleWrap} pointerEvents="none">
      <Text style={styles.title}>Anulekh</Text>
      <Text style={styles.tagline}>A Scribe for every Voice</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  // Explicit size: on web an absolutely-positioned Image otherwise keeps its natural 1080×2400 size.
  background: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: '100%',
    height: '100%',
  },
  logo: {
    width: SPLASH_LOGO_SIZE,
    height: SPLASH_LOGO_SIZE,
  },
  titleWrap: {
    position: 'absolute',
    top: '50%',
    left: 0,
    right: 0,
    marginTop: SPLASH_LOGO_SIZE / 2 + 6,
    alignItems: 'center',
  },
  title: {
    fontSize: 28,
    fontWeight: '900',
    color: '#0f172a',
    letterSpacing: -0.6,
  },
  tagline: {
    fontSize: 14,
    fontWeight: '600',
    color: '#475569',
    marginTop: 4,
  },
});
