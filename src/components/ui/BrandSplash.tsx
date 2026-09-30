import React, { useEffect } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';

// Shared launch visuals. The paper colour and logo image are the same ones the native splash uses
// (app.json → expo-splash-screen), so the hand-off from the native splash into the app is seamless.
// Assets: assets/images/splash-icon.png (logo tile), assets/images/splash-background.jpg (paper + clouds),
// assets/images/splash-full.png (the complete colourful screen, used as the iOS native splash).
export const SPLASH_PAPER = '#FBF8F3';
export const SPLASH_LOGO_SIZE = 152; // must match "imageWidth" for expo-splash-screen in app.json

/** Warm paper texture with soft blue / orange / green clouds, filling its parent. */
export function SplashBackground() {
  return (
    <Image
      source={require('@/assets/images/splash-background.jpg')}
      style={styles.fill}
      resizeMode="cover"
      accessibilityElementsHidden
      importantForAccessibility="no"
    />
  );
}

/** The complete colourful screen as one image — identical to the iOS native splash. */
export function SplashFullImage() {
  return (
    <Image
      source={require('@/assets/images/splash-full.png')}
      style={styles.fill}
      resizeMode="cover"
      accessibilityLabel="Anulekh — A Scribe for every Voice"
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

// Overlay timeline (ms) once the native splash hides.
const CLOUDS_IN = 200;
const HOLD = 1400;
const FADE_OUT = 350;

/**
 * The colourful start-up screen that continues the native splash, then fades away to reveal the app.
 * - 'full-image' (iOS): the native splash is already the full picture, so the same image is shown — no visible change.
 * - 'bloom' (Android): the native splash can only be the paper colour + logo tile, so the clouds and title
 *   appear around the logo almost immediately.
 */
export function SplashOverlay({ variant, onDone }: { variant: 'full-image' | 'bloom'; onDone: () => void }) {
  const reduceMotion = useReducedMotion();
  const clouds = useSharedValue(variant === 'full-image' || reduceMotion ? 1 : 0);
  const layer = useSharedValue(1);

  useEffect(() => {
    const hold = reduceMotion ? 800 : HOLD;
    const fade = reduceMotion ? 200 : FADE_OUT;
    clouds.set(withTiming(1, { duration: reduceMotion ? 0 : CLOUDS_IN, easing: Easing.out(Easing.quad) }));
    layer.set(withDelay(hold, withTiming(0, { duration: fade, easing: Easing.in(Easing.quad) })));
    const timer = setTimeout(onDone, hold + fade + 50);
    return () => clearTimeout(timer);
  }, [reduceMotion, clouds, layer, onDone]);

  const layerStyle = useAnimatedStyle(() => ({ opacity: layer.get() }));
  const cloudStyle = useAnimatedStyle(() => ({ opacity: clouds.get() }));

  return (
    <Animated.View style={[styles.overlay, layerStyle]} pointerEvents="none">
      {variant === 'full-image' ? (
        <SplashFullImage />
      ) : (
        <>
          <Animated.View style={[StyleSheet.absoluteFill, cloudStyle]}>
            <SplashBackground />
          </Animated.View>
          <SplashLogo />
          <Animated.View
            entering={reduceMotion ? undefined : FadeIn.duration(CLOUDS_IN)}
            style={StyleSheet.absoluteFill}
            pointerEvents="none"
          >
            <SplashTitle />
          </Animated.View>
        </>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  // Explicit size: on web an absolutely-positioned Image otherwise keeps its natural pixel size.
  fill: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: '100%',
    height: '100%',
  },
  overlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: SPLASH_PAPER,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
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
