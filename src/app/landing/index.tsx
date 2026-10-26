/**
 * Landing screen — route "/landing".
 *
 * The first thing a signed-out user sees (the root route "/" redirects here when there is no session).
 * On phones it renders the animated welcome page: logo + tagline, three feature cards, a
 * "Get Started" button (-> /landing/induction, the intro/role-selection flow) and a "Log In" link
 * (-> /auth/login). On wide screens (>= 768 px) it renders the desktop version, <LandingPC />, instead.
 *
 * Data: on mount it re-checks the stored session via `supabase.auth.getSession()` and, if one exists,
 * reads the user's `role` from the `profiles` table and replaces the route with the matching console
 * (/console/scribe or /console/student). `supabase` is the app's shim over the Rust/Axum backend
 * (core/supabase.ts), not real Supabase.
 *
 * Accessibility: all entrance animations are skipped when the OS "Reduce Motion" setting is on.
 */
import React, { useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Pressable,
  ScrollView,
  Image,
  useWindowDimensions,
} from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  FadeInDown,
  FadeInUp,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { router } from 'expo-router';
import { supabase } from '@/core/supabase';
import { Feather } from '@expo/vector-icons';
import LandingPC from '@/components/pc_view/LandingPC';

/** Pressable that accepts Reanimated animated styles (used for the scaling "Get Started" button). */
const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

// Entrance timeline (ms). Cards start while the logo is still settling so the screen flows as one motion.
const CARD_START = 250;
const CARD_STAGGER = 120;
const CTA_DELAY = 700;
const FOOTER_DELAY = 950;

/**
 * Default-exported route component for /landing.
 * Takes no props. Side effects: may redirect a signed-in user to their console (see file header).
 */
export default function LandingScreen() {
  // Window size drives the phone/desktop switch and positions the background orbs.
  const { width, height } = useWindowDimensions();
  const isDesktop = width >= 768;

  // Honour the OS "Reduce Motion" setting: when on, content simply appears without animation.
  const reduceMotion = useReducedMotion();
  const enter = <T,>(animation: T) => (reduceMotion ? undefined : animation);

  // Logo tile grows from 85% to full size while the header fades in.
  const logoScale = useSharedValue(reduceMotion ? 1 : 0.85);
  const logoStyle = useAnimatedStyle(() => ({
    transform: [{ scale: logoScale.get() }],
  }));

  // "Get Started" press-down feedback.
  const ctaPress = useSharedValue(1);
  const ctaStyle = useAnimatedStyle(() => ({
    transform: [{ scale: ctaPress.get() }],
  }));

  /**
   * If a session is stored, looks up the user's role in `profiles` and replaces this route with
   * /console/scribe (role 'scribe') or /console/student (anything else). Errors are swallowed so the
   * landing page simply stays visible.
   */
  const checkExistingSession = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const { data: profile } = await supabase
        .from('profiles').select('role').eq('id', session.user.id).single();
      router.replace((profile?.role === 'scribe' ? '/console/scribe?tab=home' : '/console/student?tab=home') as any);
    } catch {}
  };

  // Run the session check on mount (and again if the layout flips between phone and desktop).
  useEffect(() => {
    checkExistingSession();
  }, [isDesktop]);

  // Entrance: the logo eases up to full size once (no bounce).
  useEffect(() => {
    if (isDesktop || reduceMotion) return;
    logoScale.set(withTiming(1, { duration: 450, easing: Easing.out(Easing.cubic) }));
  }, [isDesktop, reduceMotion, logoScale]);

  // Wide screens get the dedicated desktop landing page (all hooks above still run first).
  if (isDesktop) {
    return <LandingPC />;
  }

  const handleGetStarted = () => {
    // Always show the intro flow when "Get Started" is tapped —
    // the intro itself marks onboarding complete when the user picks a role.
    router.push('/landing/induction' as any);
  };

  // Content for the three feature cards; `delay` staggers each card's entrance on the timeline above.
  const features = [
    {
      icon: 'target' as const,
      color: '#2563eb',
      bgColor: 'rgba(37,99,235,0.08)',
      borderColor: 'rgba(37,99,235,0.18)',
      shadowColor: '#2563eb',
      title: 'Smart Matching',
      desc: 'Find scribes within 10 km by language & subject',
      delay: CARD_START,
    },
    {
      icon: 'shield' as const,
      color: '#16a34a',
      bgColor: 'rgba(22,163,74,0.08)',
      borderColor: 'rgba(22,163,74,0.18)',
      shadowColor: '#16a34a',
      title: 'Verified Volunteers',
      desc: 'Every scribe is reviewed and approved before joining',
      delay: CARD_START + CARD_STAGGER,
    },
    {
      icon: 'message-circle' as const,
      color: '#ea580c',
      bgColor: 'rgba(234,88,12,0.08)',
      borderColor: 'rgba(234,88,12,0.18)',
      shadowColor: '#ea580c',
      title: 'Easy Coordination',
      desc: 'Built-in chat, calling & digital declaration form',
      delay: CARD_START + CARD_STAGGER * 2,
    },
  ];

  // Phone layout: decorative orbs behind a scrollable column of logo, cards, buttons and footer.
  return (
    <View style={{ flex: 1, backgroundColor: '#f0f4ff' }}>
      <StatusBar style="dark" />

      {/* ── Soft pastel orbs (bolder now) ── */}
      <View style={{
        position: 'absolute', top: -100, left: -80,
        width: 320, height: 320, borderRadius: 160,
        backgroundColor: 'rgba(37,99,235,0.22)',
      }} />
      <View style={{
        position: 'absolute', top: height * 0.3, right: -100,
        width: 280, height: 280, borderRadius: 140,
        backgroundColor: 'rgba(22,163,74,0.18)',
      }} />
      <View style={{
        position: 'absolute', bottom: 60, left: width * 0.15,
        width: 250, height: 250, borderRadius: 125,
        backgroundColor: 'rgba(234,88,12,0.16)',
      }} />
      {/* Extra subtle orb */}
      <View style={{
        position: 'absolute', top: height * 0.55, left: -60,
        width: 200, height: 200, borderRadius: 100,
        backgroundColor: 'rgba(37,99,235,0.14)',
      }} />

      <SafeAreaView style={{ flex: 1 }}>
        <ScrollView
          contentContainerStyle={{ flexGrow: 1, paddingHorizontal: 24, paddingBottom: 36 }}
          showsVerticalScrollIndicator={false}
        >
          {/* ── Logo + tagline ── */}
          <Animated.View
            entering={enter(FadeIn.duration(700))}
            style={{
              alignItems: 'center',
              paddingTop: 44,
              paddingBottom: 32,
            }}
          >
            {/* Logo tile — scaled in by logoStyle */}
             <Animated.View style={[{
              width: 84, height: 84, borderRadius: 26,
              backgroundColor: '#ffffff',
              borderWidth: 1.5, borderColor: 'rgba(37,99,235,0.25)',
              alignItems: 'center', justifyContent: 'center',
              padding: 11, // inner space so the rounded corners never clip the logo
              marginBottom: 20,
              shadowColor: '#2563eb',
              shadowOffset: { width: 0, height: 10 },
              shadowOpacity: 0.2, shadowRadius: 24, elevation: 12,
              overflow: 'hidden',
            }, logoStyle]}>
              <Image
                source={require('../../../assets/images/custom/Pen_Logo.jpg')}
                style={{ width: '100%', height: '100%' }}
                resizeMode="contain"
              />
            </Animated.View>

            {/* App name and tagline */}
            <Text style={{
              fontSize: 40, fontWeight: '900',
              color: '#0f172a', letterSpacing: -1, marginBottom: 12,
            }}>
              Anulekh
            </Text>
            <Text style={{
              fontSize: 16, color: '#475569',
              textAlign: 'center', lineHeight: 26, maxWidth: 280,
            }}>
              A Scribe for every Voice
            </Text>
          </Animated.View>

          {/* ── Feature cards (glass) ── */}
          <View style={{ gap: 12, marginBottom: 32 }}>
            {features.map((f) => (
              <Animated.View
                key={f.title}
                entering={enter(FadeInDown.delay(f.delay).duration(550))}
              >
                <View style={{
                  flexDirection: 'row', alignItems: 'center',
                  backgroundColor: 'rgba(255,255,255,0.85)',
                  borderWidth: 1, borderColor: f.borderColor,
                  borderRadius: 20, padding: 18,
                  shadowColor: f.shadowColor,
                  shadowOffset: { width: 0, height: 6 },
                  shadowOpacity: 0.12, shadowRadius: 16, elevation: 4,
                }}>
                  <View style={{
                    width: 48, height: 48, borderRadius: 15,
                    backgroundColor: f.bgColor,
                    borderWidth: 1, borderColor: f.borderColor,
                    alignItems: 'center', justifyContent: 'center',
                    marginRight: 16,
                  }}>
                    <Animated.View entering={enter(FadeIn.delay(f.delay + 220).duration(300))}>
                      <Feather name={f.icon} size={22} color={f.color} />
                    </Animated.View>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 15, fontWeight: '700', color: '#0f172a', marginBottom: 3 }}>
                      {f.title}
                    </Text>
                    <Text style={{ fontSize: 13, color: '#64748b', lineHeight: 19 }}>
                      {f.desc}
                    </Text>
                  </View>
                </View>
              </Animated.View>
            ))}
          </View>

          {/* ── CTA Buttons ── */}
          <Animated.View
            entering={enter(FadeInUp.delay(CTA_DELAY).duration(500))}
            style={{ gap: 12, marginBottom: 28 }}
          >
            {/* Primary CTA — presses down slightly when tapped */}
            <AnimatedPressable
              onPress={handleGetStarted}
              onPressIn={() => ctaPress.set(withTiming(0.96, { duration: 120 }))}
              onPressOut={() => ctaPress.set(withTiming(1, { duration: 120 }))}
              accessibilityRole="button"
              accessibilityLabel="Get Started"
              style={[
                {
                  backgroundColor: '#2563eb',
                  borderRadius: 18, paddingVertical: 18,
                  flexDirection: 'row', alignItems: 'center',
                  justifyContent: 'center', gap: 8,
                  shadowColor: '#2563eb',
                  shadowOffset: { width: 0, height: 10 },
                  shadowOpacity: 0.35, shadowRadius: 20, elevation: 10,
                },
                ctaStyle,
              ]}
            >
              <Text style={{ color: '#ffffff', fontSize: 17, fontWeight: '800', letterSpacing: 0.2 }}>
                Get Started
              </Text>
              <Feather name="arrow-right" size={18} color="#ffffff" />
            </AnimatedPressable>

            {/* Secondary CTA */}
            <TouchableOpacity
              onPress={() => router.push('/auth/login')}
              activeOpacity={0.7}
              style={{
                alignItems: 'center',
                paddingVertical: 4,
                marginTop: 2,
              }}
            >
              <Text style={{ fontFamily: 'Roboto', color: '#475569', fontSize: 14, fontWeight: '600' }}>
                Already have an account?{' '}
                <Text style={{ color: '#2563eb', fontWeight: '800' }}>Log In</Text>
              </Text>
            </TouchableOpacity>
          </Animated.View>

          {/* Footer */}
          <Animated.View
            entering={enter(FadeIn.delay(FOOTER_DELAY).duration(500))}
            style={{
              flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
              backgroundColor: 'rgba(255,255,255,0.8)',
              borderWidth: 1, borderColor: 'rgba(0,0,0,0.05)',
              borderRadius: 16, paddingVertical: 8, paddingHorizontal: 16,
              alignSelf: 'center', marginTop: 4,
              shadowColor: '#64748b', shadowOffset: { width: 0, height: 4 },
              shadowOpacity: 0.06, shadowRadius: 8, elevation: 2,
            }}
          >
            <Text style={{
              fontFamily: 'Roboto',
              fontSize: 13,
              fontWeight: '700',
              color: '#475569',
            }}>
              Made with <Text style={{ color: '#ef4444' }}>❤️</Text> to help students
            </Text>
          </Animated.View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}
