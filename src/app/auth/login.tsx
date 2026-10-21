/**
 * Unified Sign-in screen.
 * Route: `/auth/login` (supports all users: students and scribes).
 *
 * Implements the modernized UI matching the user's reference:
 *   - Rounded pill Back and Register navigation buttons.
 *   - "Welcome back 👋" with ambient background styling & dot matrix accents.
 *   - Unified EMAIL OR PHONE and PASSWORD fields.
 *   - "Forgot Password?" flow.
 *   - "Sign In →" pill CTA with automatic role-based dashboard redirection.
 *   - Social logins (Google & Apple) in elegant squircle containers.
 */
import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
  Modal,
  StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { router, useLocalSearchParams } from 'expo-router';
import { supabase, friendlyAuthError } from '@/core/supabase';
import { Feather, Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { announceForAccessibility } from '@/core/a11y';
import Animated, {
  FadeIn,
  FadeInDown,
  FadeInUp,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { DotCluster, GoogleGLogo, WavingHandIcon } from '@/components/auth/AuthDecorations';

const WEB_NO_OUTLINE = (Platform.OS === 'web' ? { outlineStyle: 'none' } : {}) as object;

export default function LoginScreen() {
  const params = useLocalSearchParams<{ role?: string }>();
  const [emailOrPhone, setEmailOrPhone] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const passwordInputRef = React.useRef<TextInput>(null);

  // Accent color is modern primary blue for the unified login
  const accentColor = '#2563EB';

  // Focused input tracking
  const [focusedField, setFocusedField] = useState<'email' | 'password' | null>(null);

  // Forgot password modal state
  const [forgotModalVisible, setForgotModalVisible] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotOtp, setForgotOtp] = useState('');
  const [forgotNewPass, setForgotNewPass] = useState('');
  const [forgotConfirmPass, setForgotConfirmPass] = useState('');
  const [forgotStep, setForgotStep] = useState(1);
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotError, setForgotError] = useState('');
  const [showForgotNewPass, setShowForgotNewPass] = useState(false);
  const [showForgotConfirmPass, setShowForgotConfirmPass] = useState(false);

  // Google sign in modal state
  const [googleModalVisible, setGoogleModalVisible] = useState(false);
  const [googleRole, setGoogleRole] = useState<'student' | 'scribe'>('student');
  const [googleError, setGoogleError] = useState('');

  // ── Animations ──
  const reduceMotion = useReducedMotion();
  const enter = <T,>(animation: T) => (reduceMotion ? undefined : animation);

  const errorShake = useSharedValue(0);
  useEffect(() => {
    if (!errorMessage) return;
    announceForAccessibility(errorMessage);
    if (reduceMotion) return;
    errorShake.set(
      withSequence(
        withTiming(-8, { duration: 50 }),
        withTiming(8, { duration: 50 }),
        withTiming(-5, { duration: 50 }),
        withTiming(5, { duration: 50 }),
        withTiming(0, { duration: 50 })
      )
    );
  }, [errorMessage, reduceMotion, errorShake]);
  const errorShakeStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: errorShake.get() }],
  }));

  const waveRotate = useSharedValue(0);
  useEffect(() => {
    if (reduceMotion) return;
    waveRotate.set(
      withDelay(
        400,
        withSequence(
          withTiming(15, { duration: 150 }),
          withTiming(-10, { duration: 150 }),
          withTiming(15, { duration: 150 }),
          withTiming(-5, { duration: 150 }),
          withTiming(0, { duration: 150 })
        )
      )
    );
  }, [reduceMotion, waveRotate]);
  const waveStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${waveRotate.get()}deg` }],
  }));

  // Forgot password step 1
  const handleRequestOtp = async () => {
    if (!forgotEmail.trim()) {
      setForgotError('Please enter your registered email address.');
      return;
    }
    setForgotLoading(true);
    setForgotError('');
    try {
      const apiHost = process.env.EXPO_PUBLIC_API_URL || 'https://anulekh-axum.onrender.com';
      const res = await fetch(`${apiHost}/api/auth/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: forgotEmail.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || data.error || 'Failed to send OTP.');
      setForgotStep(2);
    } catch (err: any) {
      setForgotError(friendlyAuthError(err, 'Failed to send reset OTP.'));
    } finally {
      setForgotLoading(false);
    }
  };

  // Forgot password step 2
  const handleResetPassword = async () => {
    if (!forgotOtp.trim() || !forgotNewPass.trim() || !forgotConfirmPass.trim()) {
      setForgotError('Please fill in all fields.');
      return;
    }
    if (forgotNewPass !== forgotConfirmPass) {
      setForgotError('New passwords do not match.');
      return;
    }
    if (forgotNewPass.length < 6) {
      setForgotError('Password must be at least 6 characters.');
      return;
    }
    setForgotLoading(true);
    setForgotError('');
    try {
      const apiHost = process.env.EXPO_PUBLIC_API_URL || 'https://anulekh-axum.onrender.com';
      const res = await fetch(`${apiHost}/api/auth/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: forgotEmail.trim(),
          otp: forgotOtp.trim(),
          new_password: forgotNewPass.trim(),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || data.error || 'Failed to reset password.');
      Alert.alert('Success', 'Your password has been reset successfully! Please sign in.');
      setForgotModalVisible(false);
    } catch (err: any) {
      setForgotError(friendlyAuthError(err, 'Failed to reset password.'));
    } finally {
      setForgotLoading(false);
    }
  };

  // Google Sign-in flow (email-based only, no phone required)
  const handleGoogleSignIn = async (roleVal: 'student' | 'scribe') => {
    setLoading(true);
    setErrorMessage('');
    try {
      const apiHost = process.env.EXPO_PUBLIC_API_URL || 'https://anulekh-axum.onrender.com';
      const res = await fetch(`${apiHost}/api/auth/google-login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id_token: 'mock-google-token',
          role: roleVal,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || data.error || 'Google login failed');

      if (data.user) {
        // Ensure profile role matches the chosen account type
        try {
          await supabase
            .from('profiles')
            .update({ role: roleVal })
            .eq('id', data.user.id);
        } catch {
          // non-critical
        }

        data.user.role = roleVal;
        await AsyncStorage.setItem('local_db_session', JSON.stringify({ user: data.user }));
        router.replace(roleVal === 'scribe' ? '/console/scribe' : '/console/student');
      }
    } catch (err: any) {
      setErrorMessage(friendlyAuthError(err, 'Failed Google authentication.'));
    } finally {
      setLoading(false);
    }
  };

  // Main login submit
  const handleLogin = async () => {
    if (loading) return;
    if (!emailOrPhone.trim() || !password.trim()) {
      setErrorMessage('Please enter both email/phone and password.');
      return;
    }
    setLoading(true);
    setErrorMessage('');
    try {
      const input = emailOrPhone.trim();
      const isEmail = input.includes('@');
      const cleanPhone = input.replace(/[^0-9]/g, '');
      const formattedPhone =
        cleanPhone.length === 10 ? `+91${cleanPhone}` : cleanPhone ? `+${cleanPhone}` : input;

      const { data, error } = await supabase.auth.signInWithPassword({
        identifier: input,
        email: isEmail ? input : undefined,
        phone: !isEmail ? formattedPhone : undefined,
        password: password.trim(),
      });
      if (error) throw error;

      if (data.user) {
        let userRole = (data.user as any).role;
        let verificationStatus = (data.user as any).verification_status;
        let hasIdProof = !!(data.user as any).aadhar_number;

        try {
          const { data: profileData } = await supabase
            .from('profiles')
            .select('role, verification_status, aadhar_number, aadhar_image_proof, disability_certificate, location')
            .eq('id', data.user.id)
            .single();
          if (profileData) {
            userRole = profileData.role || userRole;
            verificationStatus = profileData.verification_status || verificationStatus;
            if (
              profileData.aadhar_number ||
              profileData.aadhar_image_proof ||
              profileData.disability_certificate ||
              profileData.location
            ) {
              hasIdProof = true;
            }
          }
        } catch (e) {
          console.log('Non-critical profile lookup catch:', e);
        }

        const isScribe = userRole === 'scribe';
        const isApproved = verificationStatus === 'approved' || hasIdProof;

        if (!isApproved) {
          router.replace(
            isScribe
              ? ('/console/scribe/complete_profile' as any)
              : ('/console/student/complete_profile' as any)
          );
        } else {
          router.replace(isScribe ? '/console/scribe' : '/console/student');
        }
      }
    } catch (err: any) {
      setErrorMessage(friendlyAuthError(err, 'Invalid credentials. Please try again.'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="dark" />

      {/* Decorative Background Elements */}
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          top: -100,
          right: -80,
          width: 300,
          height: 300,
          borderRadius: 150,
          backgroundColor: 'rgba(219, 234, 254, 0.45)',
        }}
      />
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          bottom: -120,
          left: -80,
          width: 320,
          height: 320,
          borderRadius: 160,
          backgroundColor: 'rgba(224, 242, 254, 0.35)',
        }}
      />
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          bottom: -80,
          left: -80,
          width: 360,
          height: 360,
          borderRadius: 180,
          borderWidth: 1.5,
          borderColor: 'rgba(191, 219, 254, 0.55)',
        }}
      />
      <DotCluster
        rows={4}
        cols={3}
        dotSize={4.5}
        gap={9}
        color="#93C5FD"
        style={{ position: 'absolute', top: 120, left: 16 }}
      />
      <DotCluster
        rows={4}
        cols={3}
        dotSize={4.5}
        gap={9}
        color="#93C5FD"
        style={{ position: 'absolute', bottom: 40, right: 18 }}
      />

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Top Bar: Back & Register Pill Buttons */}
          <Animated.View entering={enter(FadeIn.duration(300))} style={styles.topBar}>
            <TouchableOpacity
              onPress={() => {
                if (router.canGoBack()) {
                  router.back();
                } else {
                  router.replace('/landing');
                }
              }}
              activeOpacity={0.75}
              style={styles.backButton}
              accessibilityRole="button"
              accessibilityLabel="Go back"
            >
              <Feather name="arrow-left" size={17} color="#1E293B" />
              <Text style={styles.backButtonText}>Back</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => router.push('/auth/register')}
              activeOpacity={0.8}
              style={styles.registerPillButton}
              accessibilityRole="button"
              accessibilityLabel="Go to register"
            >
              <Text style={styles.registerPillText}>Register</Text>
              <Feather name="user-plus" size={15} color="#FFFFFF" />
            </TouchableOpacity>
          </Animated.View>

          {/* Heading Section: Welcome back 👋 */}
          <Animated.View entering={enter(FadeInDown.duration(400).delay(80))} style={styles.headerSection}>
            <View style={styles.titleRow}>
              <Text style={styles.titleText}>Welcome back</Text>
              <Animated.View style={waveStyle}>
                <WavingHandIcon size={28} color="#2563EB" />
              </Animated.View>
            </View>
            <Text style={styles.subtitleText}>Sign in to continue your journey</Text>
          </Animated.View>

          {/* Error Banner */}
          {errorMessage ? (
            <Animated.View style={[styles.errorCard, errorShakeStyle]}>
              <Feather name="alert-circle" size={16} color="#DC2626" style={{ marginTop: 2, marginRight: 8 }} />
              <Text style={styles.errorText}>{errorMessage}</Text>
            </Animated.View>
          ) : null}

          {/* Main Card */}
          <Animated.View entering={enter(FadeInDown.duration(450).delay(150))} style={styles.mainCard}>
            {/* Field: EMAIL OR PHONE */}
            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>EMAIL OR PHONE</Text>
              <View
                style={[
                  styles.inputBox,
                  focusedField === 'email' && styles.inputBoxFocused,
                ]}
              >
                <Feather
                  name="user"
                  size={18}
                  color={focusedField === 'email' ? accentColor : '#94A3B8'}
                  style={{ marginRight: 8 }}
                />
                <TextInput
                  style={[styles.input, WEB_NO_OUTLINE]}
                  placeholder="email@example.com or phone"
                  placeholderTextColor="#94A3B8"
                  value={emailOrPhone}
                  onChangeText={(val) => {
                    setEmailOrPhone(val);
                    setErrorMessage('');
                  }}
                  onFocus={() => setFocusedField('email')}
                  onBlur={() => setFocusedField(null)}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="email-address"
                  returnKeyType="next"
                  blurOnSubmit={false}
                  onSubmitEditing={() => passwordInputRef.current?.focus()}
                />
              </View>
            </View>

            {/* Field: PASSWORD */}
            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>PASSWORD</Text>
              <View
                style={[
                  styles.inputBox,
                  focusedField === 'password' && styles.inputBoxFocused,
                ]}
              >
                <Feather
                  name="lock"
                  size={18}
                  color={focusedField === 'password' ? accentColor : '#94A3B8'}
                  style={{ marginRight: 8 }}
                />
                <TextInput
                  ref={passwordInputRef}
                  style={[styles.input, WEB_NO_OUTLINE]}
                  placeholder="Enter your password"
                  placeholderTextColor="#94A3B8"
                  secureTextEntry={!showPassword}
                  value={password}
                  onChangeText={(val) => {
                    setPassword(val);
                    setErrorMessage('');
                  }}
                  onFocus={() => setFocusedField('password')}
                  onBlur={() => setFocusedField(null)}
                  autoCapitalize="none"
                  returnKeyType="done"
                  onSubmitEditing={handleLogin}
                />
                <TouchableOpacity
                  onPress={() => setShowPassword(!showPassword)}
                  activeOpacity={0.7}
                  style={{ padding: 4 }}
                >
                  <Feather
                    name={showPassword ? 'eye-off' : 'eye'}
                    size={18}
                    color="#94A3B8"
                  />
                </TouchableOpacity>
              </View>

              {/* Forgot Password Link */}
              <TouchableOpacity
                onPress={() => {
                  setForgotError('');
                  setForgotStep(1);
                  setForgotModalVisible(true);
                }}
                activeOpacity={0.7}
                style={styles.forgotLinkContainer}
              >
                <Text style={styles.forgotLinkText}>Forgot Password?</Text>
              </TouchableOpacity>
            </View>

            {/* Action CTA: Sign In → */}
            <TouchableOpacity
              onPress={handleLogin}
              activeOpacity={0.85}
              disabled={loading}
              style={styles.signInButton}
            >
              {loading ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : (
                <>
                  <Text style={styles.signInButtonText}>Sign In</Text>
                  <Feather name="arrow-right" size={18} color="#FFFFFF" />
                </>
              )}
            </TouchableOpacity>
          </Animated.View>

          {/* Bottom Switcher: Don't have an account? Register here */}
          <Animated.View entering={enter(FadeInUp.duration(400).delay(220))} style={styles.registerRow}>
            <Text style={styles.registerPrompt}>Don't have an account? </Text>
            <TouchableOpacity onPress={() => router.push('/auth/register')} activeOpacity={0.7}>
              <Text style={styles.registerLink}>Register here</Text>
            </TouchableOpacity>
          </Animated.View>

          {/* Divider: or continue with */}
          <Animated.View entering={enter(FadeInUp.duration(400).delay(260))} style={styles.dividerRow}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>or continue with</Text>
            <View style={styles.dividerLine} />
          </Animated.View>

          {/* Social Sign-in Buttons */}
          <Animated.View entering={enter(FadeInUp.duration(400).delay(300))} style={styles.socialRow}>
            {/* Google */}
            <TouchableOpacity
              onPress={() => {
                setGoogleError('');
                setGoogleRole('student');
                setGoogleModalVisible(true);
              }}
              activeOpacity={0.75}
              style={styles.socialButton}
              accessibilityRole="button"
              accessibilityLabel="Sign in with Google"
            >
              <GoogleGLogo size={24} />
            </TouchableOpacity>

            {/* Apple */}
            <TouchableOpacity
              onPress={() => {
                Alert.alert('Apple Sign In', 'Apple Sign In is coming soon in the next release!');
              }}
              activeOpacity={0.75}
              style={styles.socialButton}
              accessibilityRole="button"
              accessibilityLabel="Sign in with Apple"
            >
              <Ionicons name="logo-apple" size={26} color="#000000" />
            </TouchableOpacity>
          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* ── FORGOT PASSWORD MODAL ── */}
      <Modal visible={forgotModalVisible} animationType="fade" transparent onRequestClose={() => setForgotModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <View style={{ width: 36, height: 36, borderRadius: 12, backgroundColor: '#EFF6FF', alignItems: 'center', justifyContent: 'center' }}>
                  <Feather name="key" size={18} color="#2563EB" />
                </View>
                <Text style={{ fontFamily: 'Roboto', fontSize: 17, fontWeight: '800', color: '#0F172A' }}>Reset Password</Text>
              </View>
              <TouchableOpacity
                onPress={() => setForgotModalVisible(false)}
                style={[{ width: 32, height: 32, borderRadius: 16, backgroundColor: '#F1F5F9', alignItems: 'center', justifyContent: 'center' }, WEB_NO_OUTLINE]}
                activeOpacity={0.7}
              >
                <Feather name="x" size={18} color="#64748B" />
              </TouchableOpacity>
            </View>

            {forgotError ? (
              <View style={{ backgroundColor: '#FEE2E2', padding: 10, borderRadius: 10, marginBottom: 12 }}>
                <Text style={{ color: '#DC2626', fontSize: 12, fontWeight: '600' }}>{forgotError}</Text>
              </View>
            ) : null}

            {forgotStep === 1 ? (
              <View style={{ gap: 14 }}>
                <Text style={{ fontSize: 13, color: '#475569', lineHeight: 18 }}>
                  Enter your registered email address. We'll send a 6-digit OTP code to verify your identity.
                </Text>
                <View style={[styles.inputBox, { height: 48 }]}>
                  <Feather name="mail" size={17} color="#94A3B8" style={{ marginRight: 8 }} />
                  <TextInput
                    style={[styles.input, WEB_NO_OUTLINE]}
                    placeholder="Enter your email"
                    placeholderTextColor="#94A3B8"
                    value={forgotEmail}
                    onChangeText={setForgotEmail}
                    autoCapitalize="none"
                    keyboardType="email-address"
                  />
                </View>
                <TouchableOpacity
                  onPress={handleRequestOtp}
                  disabled={forgotLoading}
                  style={[styles.signInButton, { height: 46 }]}
                >
                  {forgotLoading ? (
                    <ActivityIndicator color="#FFFFFF" size="small" />
                  ) : (
                    <Text style={{ color: '#FFFFFF', fontWeight: '800', fontSize: 14 }}>Send OTP</Text>
                  )}
                </TouchableOpacity>
              </View>
            ) : (
              <View style={{ gap: 12 }}>
                <Text style={{ fontSize: 12.5, color: '#475569' }}>
                  OTP sent to <Text style={{ fontWeight: '700', color: '#0F172A' }}>{forgotEmail}</Text>
                </Text>
                <View style={[styles.inputBox, { height: 48 }]}>
                  <Feather name="shield" size={17} color="#94A3B8" style={{ marginRight: 8 }} />
                  <TextInput
                    style={[styles.input, WEB_NO_OUTLINE]}
                    placeholder="6-digit OTP code"
                    placeholderTextColor="#94A3B8"
                    value={forgotOtp}
                    onChangeText={setForgotOtp}
                    keyboardType="number-pad"
                  />
                </View>

                <View style={[styles.inputBox, { height: 48 }]}>
                  <Feather name="lock" size={17} color="#94A3B8" style={{ marginRight: 8 }} />
                  <TextInput
                    style={[styles.input, WEB_NO_OUTLINE]}
                    placeholder="New password (min 6 chars)"
                    placeholderTextColor="#94A3B8"
                    secureTextEntry={!showForgotNewPass}
                    value={forgotNewPass}
                    onChangeText={setForgotNewPass}
                  />
                  <TouchableOpacity onPress={() => setShowForgotNewPass(!showForgotNewPass)}>
                    <Feather name={showForgotNewPass ? 'eye-off' : 'eye'} size={16} color="#94A3B8" />
                  </TouchableOpacity>
                </View>

                <View style={[styles.inputBox, { height: 48 }]}>
                  <Feather name="lock" size={17} color="#94A3B8" style={{ marginRight: 8 }} />
                  <TextInput
                    style={[styles.input, WEB_NO_OUTLINE]}
                    placeholder="Confirm new password"
                    placeholderTextColor="#94A3B8"
                    secureTextEntry={!showForgotConfirmPass}
                    value={forgotConfirmPass}
                    onChangeText={setForgotConfirmPass}
                  />
                  <TouchableOpacity onPress={() => setShowForgotConfirmPass(!showForgotConfirmPass)}>
                    <Feather name={showForgotConfirmPass ? 'eye-off' : 'eye'} size={16} color="#94A3B8" />
                  </TouchableOpacity>
                </View>

                <TouchableOpacity
                  onPress={handleResetPassword}
                  disabled={forgotLoading}
                  style={[styles.signInButton, { height: 46 }]}
                >
                  {forgotLoading ? (
                    <ActivityIndicator color="#FFFFFF" size="small" />
                  ) : (
                    <Text style={{ color: '#FFFFFF', fontWeight: '800', fontSize: 14 }}>Reset Password</Text>
                  )}
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>
      </Modal>

      {/* ── GOOGLE SIGN-IN MODAL (Role selection only, email-based, no phone required) ── */}
      <Modal visible={googleModalVisible} animationType="fade" transparent onRequestClose={() => setGoogleModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            {/* Header */}
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <GoogleGLogo size={22} />
                <Text style={{ fontFamily: 'Roboto', fontSize: 18, fontWeight: '800', color: '#0F172A' }}>Google Sign-In</Text>
              </View>
              <TouchableOpacity
                onPress={() => setGoogleModalVisible(false)}
                style={[{ width: 32, height: 32, borderRadius: 16, backgroundColor: '#F1F5F9', alignItems: 'center', justifyContent: 'center' }, WEB_NO_OUTLINE]}
                activeOpacity={0.7}
              >
                <Feather name="x" size={18} color="#64748B" />
              </TouchableOpacity>
            </View>

            {googleError ? (
              <View style={{ backgroundColor: '#FEE2E2', padding: 10, borderRadius: 10, marginBottom: 12 }}>
                <Text style={{ color: '#DC2626', fontSize: 12, fontWeight: '600' }}>{googleError}</Text>
              </View>
            ) : null}

            <Text style={{ fontSize: 13, color: '#475569', lineHeight: 18, marginBottom: 14 }}>
              Choose what type of account you want to create with your Google email:
            </Text>

            {/* Option 1: Student Account Card */}
            <TouchableOpacity
              onPress={() => setGoogleRole('student')}
              activeOpacity={0.8}
              style={[
                {
                  flexDirection: 'row',
                  alignItems: 'center',
                  padding: 12,
                  borderRadius: 14,
                  borderWidth: 1.5,
                  borderColor: googleRole === 'student' ? '#2563EB' : '#E2E8F0',
                  backgroundColor: googleRole === 'student' ? '#EFF6FF' : '#F8FAFC',
                  marginBottom: 10,
                },
                WEB_NO_OUTLINE,
              ]}
            >
              <View
                style={{
                  width: 38,
                  height: 38,
                  borderRadius: 10,
                  backgroundColor: googleRole === 'student' ? '#2563EB' : '#E2E8F0',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginRight: 10,
                }}
              >
                <Ionicons
                  name="school"
                  size={20}
                  color={googleRole === 'student' ? '#FFFFFF' : '#64748B'}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text
                  style={{
                    fontFamily: 'Roboto',
                    fontSize: 14,
                    fontWeight: '800',
                    color: googleRole === 'student' ? '#1D4ED8' : '#0F172A',
                    marginBottom: 2,
                  }}
                >
                  Student Account
                </Text>
                <Text style={{ fontSize: 11.5, color: '#64748B' }}>
                  I need a verified scribe for my exams
                </Text>
              </View>
              <View
                style={{
                  width: 20,
                  height: 20,
                  borderRadius: 10,
                  borderWidth: 2,
                  borderColor: googleRole === 'student' ? '#2563EB' : '#CBD5E1',
                  backgroundColor: googleRole === 'student' ? '#2563EB' : 'transparent',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {googleRole === 'student' && (
                  <Feather name="check" size={12} color="#FFFFFF" />
                )}
              </View>
            </TouchableOpacity>

            {/* Option 2: Scribe Account Card */}
            <TouchableOpacity
              onPress={() => setGoogleRole('scribe')}
              activeOpacity={0.8}
              style={[
                {
                  flexDirection: 'row',
                  alignItems: 'center',
                  padding: 12,
                  borderRadius: 14,
                  borderWidth: 1.5,
                  borderColor: googleRole === 'scribe' ? '#16A34A' : '#E2E8F0',
                  backgroundColor: googleRole === 'scribe' ? '#DCFCE7' : '#F8FAFC',
                  marginBottom: 14,
                },
                WEB_NO_OUTLINE,
              ]}
            >
              <View
                style={{
                  width: 38,
                  height: 38,
                  borderRadius: 10,
                  backgroundColor: googleRole === 'scribe' ? '#16A34A' : '#E2E8F0',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginRight: 10,
                }}
              >
                <Ionicons
                  name="pencil"
                  size={18}
                  color={googleRole === 'scribe' ? '#FFFFFF' : '#64748B'}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text
                  style={{
                    fontFamily: 'Roboto',
                    fontSize: 14,
                    fontWeight: '800',
                    color: googleRole === 'scribe' ? '#15803D' : '#0F172A',
                    marginBottom: 2,
                  }}
                >
                  Scribe Account
                </Text>
                <Text style={{ fontSize: 11.5, color: '#64748B' }}>
                  Volunteer to write exams for students
                </Text>
              </View>
              <View
                style={{
                  width: 20,
                  height: 20,
                  borderRadius: 10,
                  borderWidth: 2,
                  borderColor: googleRole === 'scribe' ? '#16A34A' : '#CBD5E1',
                  backgroundColor: googleRole === 'scribe' ? '#16A34A' : 'transparent',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {googleRole === 'scribe' && (
                  <Feather name="check" size={12} color="#FFFFFF" />
                )}
              </View>
            </TouchableOpacity>

            {/* Google Email notice */}
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                marginBottom: 14,
              }}
            >
              <Feather name="shield" size={13} color="#94A3B8" />
              <Text style={{ fontSize: 11.5, color: '#64748B' }}>
                Created via Google Email • No phone required
              </Text>
            </View>

            {/* Action CTA Button */}
            <TouchableOpacity
              onPress={() => {
                setGoogleModalVisible(false);
                handleGoogleSignIn(googleRole);
              }}
              activeOpacity={0.85}
              style={[
                styles.signInButton,
                {
                  height: 46,
                  backgroundColor: googleRole === 'student' ? '#2563EB' : '#16A34A',
                  shadowColor: googleRole === 'student' ? '#2563EB' : '#16A34A',
                },
              ]}
            >
              <Text style={{ color: '#FFFFFF', fontWeight: '800', fontSize: 14 }}>
                Continue as {googleRole === 'student' ? 'Student' : 'Scribe'} →
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  scrollContent: {
    paddingBottom: 36,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 10,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
    gap: 6,
  },
  backButtonText: {
    fontFamily: 'Roboto',
    fontSize: 13.5,
    fontWeight: '700',
    color: '#1E293B',
  },
  registerPillButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#2563EB',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    shadowColor: '#2563EB',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 3,
    gap: 6,
  },
  registerPillText: {
    fontFamily: 'Roboto',
    fontSize: 13.5,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  headerSection: {
    paddingHorizontal: 20,
    marginTop: 20,
    marginBottom: 20,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  titleText: {
    fontFamily: 'Roboto',
    fontSize: 32,
    fontWeight: '900',
    color: '#0F172A',
    letterSpacing: -0.6,
  },
  waveEmoji: {
    fontSize: 30,
  },
  subtitleText: {
    fontFamily: 'Roboto',
    fontSize: 15.5,
    color: '#475569',
    fontWeight: '500',
    marginTop: 6,
  },
  errorCard: {
    marginHorizontal: 20,
    marginBottom: 16,
    padding: 12,
    borderRadius: 14,
    backgroundColor: '#FEE2E2',
    borderWidth: 1,
    borderColor: '#FCA5A5',
    flexDirection: 'row',
    alignItems: 'center',
  },
  errorText: {
    fontFamily: 'Roboto',
    color: '#DC2626',
    fontSize: 13,
    fontWeight: '600',
    flex: 1,
  },
  mainCard: {
    marginHorizontal: 20,
    backgroundColor: '#FFFFFF',
    borderRadius: 26,
    padding: 22,
    borderWidth: 1.5,
    borderColor: '#F1F5F9',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.05,
    shadowRadius: 22,
    elevation: 4,
    gap: 18,
  },
  fieldGroup: {
    gap: 6,
  },
  fieldLabel: {
    fontFamily: 'Roboto',
    fontSize: 10.5,
    fontWeight: '800',
    color: '#64748B',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  inputBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    paddingHorizontal: 14,
    height: 52,
  },
  inputBoxFocused: {
    backgroundColor: '#FFFFFF',
    borderColor: '#2563EB',
  },
  input: {
    flex: 1,
    fontFamily: 'Roboto',
    fontSize: 14.5,
    color: '#0F172A',
  },
  forgotLinkContainer: {
    alignSelf: 'flex-end',
    marginTop: 6,
  },
  forgotLinkText: {
    fontFamily: 'Roboto',
    color: '#2563EB',
    fontSize: 12.5,
    fontWeight: '700',
  },
  signInButton: {
    backgroundColor: '#2563EB',
    borderRadius: 26,
    height: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    shadowColor: '#2563EB',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.22,
    shadowRadius: 10,
    elevation: 3,
  },
  signInButtonText: {
    fontFamily: 'Roboto',
    color: '#FFFFFF',
    fontSize: 15.5,
    fontWeight: '800',
  },
  registerRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 22,
    alignItems: 'center',
  },
  registerPrompt: {
    fontFamily: 'Roboto',
    color: '#64748B',
    fontSize: 13.5,
    fontWeight: '500',
  },
  registerLink: {
    fontFamily: 'Roboto',
    color: '#2563EB',
    fontSize: 13.5,
    fontWeight: '700',
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 24,
    marginVertical: 20,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#E2E8F0',
  },
  dividerText: {
    fontFamily: 'Roboto',
    color: '#64748B',
    fontSize: 12.5,
    fontWeight: '600',
    paddingHorizontal: 12,
  },
  socialRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 16,
  },
  socialButton: {
    width: 64,
    height: 58,
    borderRadius: 18,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalCard: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    padding: 20,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.12,
    shadowRadius: 24,
    elevation: 10,
  },
});
