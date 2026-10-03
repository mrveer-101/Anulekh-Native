/**
 * Splash Preview (developer tool) — route `/dev/splash-preview`.
 *
 * Replays the three-stage start-up sequence (native splash -> animated
 * `SplashOverlay` -> "app opens" placeholder) for either Android or iOS
 * styling, using the shared components from `components/ui/BrandSplash`.
 * Loads no data and touches no backend tables. Guarded by `__DEV__`: in
 * production builds the screen immediately redirects to `/`.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Redirect } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Feather } from '@expo/vector-icons';

import { SPLASH_PAPER, SplashFullImage, SplashLogo, SplashOverlay } from '@/components/ui/BrandSplash';

// Development-only preview of the app start-up sequence, so it can be checked without a native build.
// Open /dev/splash-preview while running `npx expo start`. Production builds redirect away.
const NATIVE_SPLASH_MS = 900; // stand-in for how long the OS shows the native splash while the app loads

/** Which platform's start-up look to simulate (iOS uses the full-image splash, Android the logo + bloom). */
type Target = 'android' | 'ios';
/** Current step of the simulated start-up: native splash, branded overlay, then the app itself. */
type Stage = 'native' | 'overlay' | 'app';

/** Human-readable caption for each stage, shown in the pill above the replay buttons. */
const STAGE_LABEL: Record<Stage, string> = {
  native: '1 · Native splash (while the app loads)',
  overlay: '2 · Colourful start-up screen',
  app: '3 · App opens',
};

/**
 * Screen component for `/dev/splash-preview`.
 * No props. Holds the selected platform, the current stage, and a `run`
 * counter that is bumped on every replay so the timer effect restarts and the
 * overlay remounts (it is keyed by `run`).
 */
export default function SplashPreview() {
  // Selected platform, current stage, and replay counter.
  const [target, setTarget] = useState<Target>('android');
  const [stage, setStage] = useState<Stage>('native');
  const [run, setRun] = useState(0);

  // Native splash → colourful overlay after a short "loading" pause.
  useEffect(() => {
    if (stage !== 'native') return;
    const timer = setTimeout(() => setStage('overlay'), NATIVE_SPLASH_MS);
    return () => clearTimeout(timer);
  }, [stage, run]);

  // Called by SplashOverlay when its animation finishes; stable identity so
  // the overlay does not re-run because of a new callback.
  const onOverlayDone = useCallback(() => setStage('app'), []);
  /** Restart the whole sequence from the native splash for the given platform. */
  const play = (next: Target) => {
    setTarget(next);
    setStage('native');
    setRun((r) => r + 1);
  };

  // Production guard: this tool must never be reachable in release builds.
  // (It sits after the hooks so hook order stays constant.)
  if (!__DEV__) return <Redirect href="/" />;

  return (
    <View style={styles.screen}>
      <StatusBar style="dark" />

      {/* Stage 3 stand-in: what the user would see once the real app loads */}
      {stage === 'app' && (
        <View style={styles.appStandIn}>
          <Feather name="check-circle" size={28} color="#16a34a" />
          <Text style={styles.done}>The app would open here</Text>
          <Text style={styles.hint}>Tap Android or iOS to watch the start-up again.</Text>
        </View>
      )}
      {/* Stage 1: static native-splash look-alike (platform specific) */}
      {stage === 'native' && (target === 'ios' ? <SplashFullImage /> : <SplashLogo />)}
      {/* Stage 2: animated overlay; keyed by `run` so each replay starts fresh */}
      {stage === 'overlay' && (
        <SplashOverlay key={run} variant={target === 'ios' ? 'full-image' : 'bloom'} onDone={onOverlayDone} />
      )}

      {/* Floating controls: stage caption + Android / iOS replay buttons */}
      <View style={styles.controls}>
        <Text style={styles.stage}>{STAGE_LABEL[stage]}</Text>
        <View style={styles.row}>
          {(['android', 'ios'] as const).map((t) => {
            const active = target === t;
            return (
              <Pressable
                key={t}
                onPress={() => play(t)}
                accessibilityRole="button"
                accessibilityLabel={`Replay ${t === 'ios' ? 'iOS' : 'Android'} start-up`}
                style={[styles.button, active && styles.buttonActive]}
              >
                <Feather name="play" size={14} color={active ? '#ffffff' : '#2563eb'} />
                <Text style={[styles.buttonText, active && styles.buttonTextActive]}>
                  {t === 'ios' ? 'iOS' : 'Android'}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>
    </View>
  );
}

/**
 * Styles for the preview screen. `controls` uses a high zIndex so the replay
 * buttons stay above the full-screen splash / overlay components.
 */
const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: SPLASH_PAPER,
    alignItems: 'center',
    justifyContent: 'center',
  },
  appStandIn: {
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 32,
  },
  done: { fontSize: 18, fontWeight: '800', color: '#0f172a' },
  hint: { fontSize: 14, color: '#64748b', textAlign: 'center' },
  controls: {
    position: 'absolute',
    bottom: 32,
    left: 16,
    right: 16,
    alignItems: 'center',
    gap: 10,
    zIndex: 2000,
  },
  stage: {
    fontSize: 13,
    fontWeight: '700',
    color: '#334155',
    backgroundColor: 'rgba(255,255,255,0.85)',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 999,
    overflow: 'hidden',
  },
  row: { flexDirection: 'row', gap: 10 },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#2563eb',
    backgroundColor: '#ffffff',
  },
  buttonActive: { backgroundColor: '#2563eb' },
  buttonText: { fontSize: 14, fontWeight: '800', color: '#2563eb' },
  buttonTextActive: { color: '#ffffff' },
});
