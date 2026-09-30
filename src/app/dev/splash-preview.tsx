import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Redirect } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Feather } from '@expo/vector-icons';

import { SPLASH_PAPER, SplashFullImage, SplashLogo, SplashOverlay } from '@/components/ui/BrandSplash';

// Development-only preview of the app start-up sequence, so it can be checked without a native build.
// Open /dev/splash-preview while running `npx expo start`. Production builds redirect away.
const NATIVE_SPLASH_MS = 900; // stand-in for how long the OS shows the native splash while the app loads

type Target = 'android' | 'ios';
type Stage = 'native' | 'overlay' | 'app';

const STAGE_LABEL: Record<Stage, string> = {
  native: '1 · Native splash (while the app loads)',
  overlay: '2 · Colourful start-up screen',
  app: '3 · App opens',
};

export default function SplashPreview() {
  const [target, setTarget] = useState<Target>('android');
  const [stage, setStage] = useState<Stage>('native');
  const [run, setRun] = useState(0);

  // Native splash → colourful overlay after a short "loading" pause.
  useEffect(() => {
    if (stage !== 'native') return;
    const timer = setTimeout(() => setStage('overlay'), NATIVE_SPLASH_MS);
    return () => clearTimeout(timer);
  }, [stage, run]);

  const onOverlayDone = useCallback(() => setStage('app'), []);
  const play = (next: Target) => {
    setTarget(next);
    setStage('native');
    setRun((r) => r + 1);
  };

  if (!__DEV__) return <Redirect href="/" />;

  return (
    <View style={styles.screen}>
      <StatusBar style="dark" />

      {stage === 'app' && (
        <View style={styles.appStandIn}>
          <Feather name="check-circle" size={28} color="#16a34a" />
          <Text style={styles.done}>The app would open here</Text>
          <Text style={styles.hint}>Tap Android or iOS to watch the start-up again.</Text>
        </View>
      )}
      {stage === 'native' && (target === 'ios' ? <SplashFullImage /> : <SplashLogo />)}
      {stage === 'overlay' && (
        <SplashOverlay key={run} variant={target === 'ios' ? 'full-image' : 'bloom'} onDone={onOverlayDone} />
      )}

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
