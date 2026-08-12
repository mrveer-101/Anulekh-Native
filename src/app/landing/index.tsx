import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Animated,
  Dimensions,
  ScrollView,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { router } from 'expo-router';
import { supabase } from '@/core/supabase';
import { useWindowDimensions } from 'react-native';
import { Feather } from '@expo/vector-icons';
import LandingPC from '@/components/pc_view/LandingPC';

export default function LandingScreen() {
  const { width: windowWidth, height } = useWindowDimensions();
  const isDesktop = windowWidth >= 768;

  const fadeAnim  = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(40)).current;
  const scaleLogo = useRef(new Animated.Value(0.85)).current;
  const card1Anim = useRef(new Animated.Value(50)).current;
  const card2Anim = useRef(new Animated.Value(50)).current;
  const card3Anim = useRef(new Animated.Value(50)).current;

  const checkExistingSession = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const { data: profile } = await supabase
        .from('profiles').select('role').eq('id', session.user.id).single();
      router.replace((profile?.role === 'scribe' ? '/console/scribe' : '/console/student') as any);
    } catch (_) {}
  };

  const runEntryAnimations = () => {
    Animated.parallel([
      Animated.timing(fadeAnim,  { toValue: 1, duration: 800, useNativeDriver: true }),
      Animated.spring(scaleLogo, { toValue: 1, friction: 6, tension: 50, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 700, useNativeDriver: true }),
    ]).start(() => {
      Animated.stagger(100, [
        Animated.spring(card1Anim, { toValue: 0, friction: 7, tension: 60, useNativeDriver: true }),
        Animated.spring(card2Anim, { toValue: 0, friction: 7, tension: 60, useNativeDriver: true }),
        Animated.spring(card3Anim, { toValue: 0, friction: 7, tension: 60, useNativeDriver: true }),
      ]).start();
    });
  };

  useEffect(() => {
    checkExistingSession();
    if (!isDesktop) {
      runEntryAnimations();
    }
  }, [isDesktop]);

  if (isDesktop) {
    return <LandingPC />;
  }

  const handleGetStarted = () => {
    // Always show the intro flow when "Get Started" is tapped —
    // the intro itself marks onboarding complete when the user picks a role.
    router.push('/landing/induction' as any);
  };

  const features = [
    {
      icon: 'search' as const,
      color: '#2563eb',
      bgColor: 'rgba(37,99,235,0.08)',
      borderColor: 'rgba(37,99,235,0.18)',
      shadowColor: '#2563eb',
      title: 'Smart Matching',
      desc: 'Find scribes within 10 km by language & subject',
      anim: card1Anim,
    },
    {
      icon: 'shield' as const,
      color: '#16a34a',
      bgColor: 'rgba(22,163,74,0.08)',
      borderColor: 'rgba(22,163,74,0.18)',
      shadowColor: '#16a34a',
      title: 'Verified Volunteers',
      desc: 'Every scribe is reviewed and approved before joining',
      anim: card2Anim,
    },
    {
      icon: 'message-circle' as const,
      color: '#ea580c',
      bgColor: 'rgba(234,88,12,0.08)',
      borderColor: 'rgba(234,88,12,0.18)',
      shadowColor: '#ea580c',
      title: 'Easy Coordination',
      desc: 'Built-in chat, calling & digital declaration form',
      anim: card3Anim,
    },
  ];

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
        <Animated.ScrollView
          contentContainerStyle={{ flexGrow: 1, paddingHorizontal: 24, paddingBottom: 36 }}
          showsVerticalScrollIndicator={false}
          style={{ opacity: fadeAnim }}
        >
          {/* ── Logo + tagline ── */}
          <Animated.View style={{
            alignItems: 'center',
            paddingTop: 44,
            paddingBottom: 32,
            transform: [{ scale: scaleLogo }],
          }}>
             <View style={{
              width: 84, height: 84, borderRadius: 26,
              backgroundColor: 'rgba(255,255,255,0.75)',
              borderWidth: 1.5, borderColor: 'rgba(37,99,235,0.25)',
              alignItems: 'center', justifyContent: 'center',
              marginBottom: 20,
              shadowColor: '#2563eb',
              shadowOffset: { width: 0, height: 10 },
              shadowOpacity: 0.2, shadowRadius: 24, elevation: 12,
              overflow: 'hidden',
            }}>
              <Image 
                source={require('../../../assets/images/custom/Pen_Logo.jpg')} 
                style={{ width: '100%', height: '100%' }}
                resizeMode="cover"
              />
            </View>

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
          <Animated.View style={{ gap: 12, marginBottom: 32, transform: [{ translateY: slideAnim }] }}>
            {features.map((f) => (
              <Animated.View key={f.title} style={{ transform: [{ translateY: f.anim }] }}>
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
                    <Feather name={f.icon} size={22} color={f.color} />
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
          </Animated.View>

          {/* ── CTA Buttons ── */}
          <View style={{ gap: 12, marginBottom: 28 }}>
            {/* Primary CTA */}
            <TouchableOpacity
              onPress={handleGetStarted}
              activeOpacity={0.85}
              style={{
                backgroundColor: '#2563eb',
                borderRadius: 18, paddingVertical: 18,
                flexDirection: 'row', alignItems: 'center',
                justifyContent: 'center', gap: 8,
                shadowColor: '#2563eb',
                shadowOffset: { width: 0, height: 10 },
                shadowOpacity: 0.35, shadowRadius: 20, elevation: 10,
              }}
            >
              <Text style={{ color: '#ffffff', fontSize: 17, fontWeight: '800', letterSpacing: 0.2 }}>
                Get Started
              </Text>
              <Feather name="arrow-right" size={18} color="#ffffff" />
            </TouchableOpacity>

            {/* Secondary CTA */}
            <TouchableOpacity
              onPress={() => router.push('/auth/login')}
              activeOpacity={0.7}
              style={{
                alignItems: 'center',
                paddingVertical: 10,
                marginTop: 4,
              }}
            >
              <Text style={{ fontFamily: 'Roboto', color: '#475569', fontSize: 14, fontWeight: '600' }}>
                Already have an account?{' '}
                <Text style={{ color: '#2563eb', fontWeight: '800' }}>Log In</Text>
              </Text>
            </TouchableOpacity>
          </View>

          {/* Footer */}
          <View style={{
            flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
            backgroundColor: 'rgba(255,255,255,0.8)',
            borderWidth: 1, borderColor: 'rgba(0,0,0,0.05)',
            borderRadius: 16, paddingVertical: 8, paddingHorizontal: 16,
            alignSelf: 'center', marginTop: 24,
            shadowColor: '#64748b', shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.06, shadowRadius: 8, elevation: 2,
          }}>
            <Text style={{
              fontFamily: 'Roboto',
              fontSize: 13,
              fontWeight: '700',
              color: '#475569',
            }}>
              Made with <Text style={{ color: '#ef4444' }}>❤️</Text> to help students
            </Text>
          </View>
        </Animated.ScrollView>
      </SafeAreaView>
    </View>
  );
}
