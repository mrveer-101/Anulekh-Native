import { useEffect, useState } from 'react';
import { Image, Platform, StyleSheet } from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';

import { SPLASH_PAPER, SplashBackground, SplashLogo, SplashTitle } from './BrandSplash';

// Timeline (ms) once the native splash hides.
const CLOUDS_IN = 200;
const HOLD = 1400;
const FADE_OUT = 350;

// iOS shows this full-screen image as its native splash (app.json → expo-splash-screen → ios).
const IOS_FULL_SPLASH = Platform.OS === 'ios';

/**
 * Continues the native splash with the colourful paper-and-clouds screen, then fades away to reveal the app.
 * - iOS: the native splash is already the full picture, so the same image is shown here — no visible change.
 * - Android: the native splash can only be the paper colour + logo tile, so the clouds and title appear
 *   around the logo almost immediately.
 */
export function AnimatedSplashOverlay() {
  const reduceMotion = useReducedMotion();
  const [visible, setVisible] = useState(true);
  const clouds = useSharedValue(IOS_FULL_SPLASH || reduceMotion ? 1 : 0);
  const layer = useSharedValue(1);

  useEffect(() => {
    const hold = reduceMotion ? 800 : HOLD;
    const fade = reduceMotion ? 200 : FADE_OUT;
    clouds.set(withTiming(1, { duration: reduceMotion ? 0 : CLOUDS_IN, easing: Easing.out(Easing.quad) }));
    layer.set(withDelay(hold, withTiming(0, { duration: fade, easing: Easing.in(Easing.quad) })));
    const timer = setTimeout(() => setVisible(false), hold + fade + 50);
    return () => clearTimeout(timer);
  }, [reduceMotion, clouds, layer]);

  const layerStyle = useAnimatedStyle(() => ({ opacity: layer.get() }));
  const cloudStyle = useAnimatedStyle(() => ({ opacity: clouds.get() }));

  if (!visible) return null;

  if (IOS_FULL_SPLASH) {
    return (
      <Animated.View style={[styles.overlay, layerStyle]} pointerEvents="none">
        <Image
          source={require('@/assets/images/splash-full.png')}
          style={styles.fullImage}
          resizeMode="cover"
          accessibilityLabel="Anulekh — A Scribe for every Voice"
        />
      </Animated.View>
    );
  }

  return (
    <Animated.View style={[styles.overlay, layerStyle]} pointerEvents="none">
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
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: SPLASH_PAPER,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  },
  fullImage: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: '100%',
    height: '100%',
  },
});
