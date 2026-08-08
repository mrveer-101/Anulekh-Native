import React, { useState } from 'react';
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
  Dimensions,
  Modal,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { router, useLocalSearchParams } from 'expo-router';
import { supabase, friendlyAuthError } from '@/core/supabase';
import { Feather, Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';

const { height } = Dimensions.get('window');

export default function LoginScreen() {
  const [emailOrPhone, setEmailOrPhone] = useState('');
  const [password, setPassword]       = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading]         = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  // Forgot password modal state
  const [forgotModalVisible, setForgotModalVisible] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotOtp, setForgotOtp] = useState('');
  const [forgotNewPass, setForgotNewPass] = useState('');
  const [forgotConfirmPass, setForgotConfirmPass] = useState('');
  const [forgotStep, setForgotStep] = useState(1); // 1 = Email, 2 = OTP + reset passwords
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotError, setForgotError] = useState('');
  const [showForgotNewPass, setShowForgotNewPass] = useState(false);
  const [showForgotConfirmPass, setShowForgotConfirmPass] = useState(false);

  // Google sign in modal state
  const [googleModalVisible, setGoogleModalVisible] = useState(false);
  const [googlePhone, setGooglePhone] = useState('');
  const [googleRole, setGoogleRole] = useState<'student' | 'scribe'>('student');
  const [googleError, setGoogleError] = useState('');

  // Forgot Password Flow Handlers
  const handleForgotSendOtp = async () => {
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
      
      const resText = await res.text();
      let data: any = {};
      try {
        data = JSON.parse(resText);
      } catch (e) {
        data = { error: resText };
      }

      if (!res.ok) throw new Error(data.message || data.error || 'Failed to send verification OTP.');
      
      setForgotStep(2);
    } catch (err: any) {
      setForgotError(friendlyAuthError(err, 'Failed to send OTP. Please try again.'));
    } finally {
      setForgotLoading(false);
    }
  };

  const handleForgotResetPassword = async () => {
    if (!forgotOtp.trim()) {
      setForgotError('Verification code (OTP) is required.');
      return;
    }
    if (forgotNewPass.length < 6) {
      setForgotError('New Password must be at least 6 characters.');
      return;
    }
    if (forgotNewPass !== forgotConfirmPass) {
      setForgotError('Passwords do not match.');
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
          new_password: forgotNewPass,
        }),
      });
      
      const resText = await res.text();
      let data: any = {};
      try {
        data = JSON.parse(resText);
      } catch (e) {
        data = { error: resText };
      }

      if (!res.ok) throw new Error(data.message || data.error || 'Failed to reset password.');

      Alert.alert('Success', 'Your password has been reset successfully! Please log in.');
      setForgotModalVisible(false);
    } catch (err: any) {
      setForgotError(friendlyAuthError(err, 'Failed to reset password. Please try again.'));
    } finally {
      setForgotLoading(false);
    }
  };

  const handleGoogleSignIn = async (phoneVal: string, roleVal: string) => {
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
          phone: phoneVal,
        }),
      });

      const resText = await res.text();
      let data: any = {};
      try {
        data = JSON.parse(resText);
      } catch (e) {
        data = { error: resText };
      }

      if (!res.ok) throw new Error(data.message || data.error || 'Google login failed');

      if (data.user) {
        const { data: profile } = await supabase
          .from('profiles').select('role').eq('id', data.user.id).single();
          
        const session = { user: data.user };
        await AsyncStorage.setItem('local_db_session', JSON.stringify(session));

        router.replace(profile?.role === 'scribe' ? '/console/scribe' : '/console/student');
      }
    } catch (err: any) {
      setErrorMessage(friendlyAuthError(err, 'Failed Google authentication.'));
    } finally {
      setLoading(false);
    }
  };

  const accentColor  = '#2563eb';
  const accentBg     = 'rgba(37,99,235,0.08)';
  const accentBorder = 'rgba(37,99,235,0.22)';
  const accentShadow = 'rgba(37,99,235,0.25)';

  const handleLogin = async () => {
    if (!emailOrPhone.trim() || !password.trim()) {
      setErrorMessage('Please enter both email/phone and password.');
      return;
    }
    setLoading(true);
    setErrorMessage('');
    try {
      const input   = emailOrPhone.trim();
      const isEmail = input.includes('@');
      const { data, error } = await supabase.auth.signInWithPassword(
        isEmail ? { email: input, password } : { phone: input, password }
      );
      if (error) throw error;
      if (data.user) {
        const { data: profile } = await supabase
          .from('profiles').select('role').eq('id', data.user.id).single();
        router.replace(profile?.role === 'scribe' ? '/console/scribe' : '/console/student');
      }
    } catch (err: any) {
      setErrorMessage(friendlyAuthError(err, 'Invalid credentials. Please try again.'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: '#f0f4ff' }}>
      <StatusBar style="dark" />

      {/* Soft background orbs */}
      <View style={{ position: 'absolute', top: -80, right: -70, width: 260, height: 260, borderRadius: 130, backgroundColor: 'rgba(37,99,235,0.20)' }} />
      <View style={{ position: 'absolute', bottom: 80, left: -60, width: 220, height: 220, borderRadius: 110, backgroundColor: 'rgba(234,88,12,0.16)' }} />

      <SafeAreaView style={{ flex: 1 }}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
          <ScrollView
            contentContainerStyle={{ flexGrow: 1, paddingHorizontal: 24, paddingBottom: 36 }}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {/* Back */}
            <View style={{ paddingTop: 16, paddingBottom: 4 }}>
              <TouchableOpacity
                onPress={() => router.replace('/landing')}
                style={{
                  flexDirection: 'row', alignItems: 'center', gap: 6,
                  backgroundColor: 'rgba(255,255,255,0.8)',
                  borderWidth: 1, borderColor: 'rgba(0,0,0,0.08)',
                  borderRadius: 12, paddingVertical: 8, paddingHorizontal: 14,
                  alignSelf: 'flex-start',
                  shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
                  shadowOpacity: 0.06, shadowRadius: 6, elevation: 2,
                }}
              >
                <Feather name="arrow-left" size={14} color="#64748b" />
                <Text style={{ color: '#64748b', fontSize: 14, fontWeight: '600' }}>Back</Text>
              </TouchableOpacity>
            </View>

            {/* Header */}
            <View style={{ paddingTop: 28, paddingBottom: 28 }}>
              <Text style={{ fontSize: 34, fontWeight: '900', color: '#0f172a', letterSpacing: -0.8 }}>
                Welcome back 👋
              </Text>
              <Text style={{ fontSize: 15, color: '#64748b', marginTop: 6, lineHeight: 22 }}>
                Sign in to continue your journey
              </Text>
            </View>

            {/* Error */}
            {errorMessage ? (
              <View style={{
                backgroundColor: 'rgba(239,68,68,0.07)',
                borderWidth: 1, borderColor: 'rgba(239,68,68,0.25)',
                borderRadius: 14, padding: 14, marginBottom: 20,
                flexDirection: 'row', alignItems: 'center', gap: 10,
              }}>
                <Feather name="alert-circle" size={16} color="#dc2626" />
                <Text style={{ color: '#dc2626', fontSize: 14, fontWeight: '600', flex: 1 }}>{errorMessage}</Text>
              </View>
            ) : null}




            {/* Unified Portal Status Pill (Both Selected) */}
            <View style={{
              backgroundColor: 'rgba(255,255,255,0.7)',
              borderWidth: 1, borderColor: 'rgba(0,0,0,0.07)',
              borderRadius: 18, padding: 4,
              flexDirection: 'row', marginBottom: 28,
              shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
              shadowOpacity: 0.06, shadowRadius: 12, elevation: 2,
              gap: 8,
            }}>
              <View
                style={{
                  flex: 1, paddingVertical: 14, borderRadius: 14,
                  flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
                  backgroundColor: 'rgba(37,99,235,0.08)',
                  borderWidth: 1,
                  borderColor: 'rgba(37,99,235,0.22)',
                }}
              >
                <Ionicons name="school" size={17} color="#334155" />
                <Text style={{ fontSize: 14, fontWeight: '800', color: '#2563eb' }}>
                  Student
                </Text>
              </View>
              <View
                style={{
                  flex: 1, paddingVertical: 14, borderRadius: 14,
                  flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
                  backgroundColor: 'rgba(22,163,74,0.08)',
                  borderWidth: 1,
                  borderColor: 'rgba(22,163,74,0.22)',
                }}
              >
                <Ionicons name="pencil" size={16} color="#334155" />
                <Text style={{ fontSize: 14, fontWeight: '800', color: '#16a34a' }}>
                  Scribe
                </Text>
              </View>
            </View>

            {/* Form — glass card */}
            <View style={{
              backgroundColor: 'rgba(255,255,255,0.75)',
              borderWidth: 1, borderColor: 'rgba(0,0,0,0.07)',
              borderRadius: 24, padding: 20, gap: 18,
              shadowColor: '#000', shadowOffset: { width: 0, height: 8 },
              shadowOpacity: 0.07, shadowRadius: 20, elevation: 4,
              marginBottom: 24,
            }}>
              {/* Email / Phone */}
              <View>
                <Text style={{ color: '#475569', fontSize: 12, fontWeight: '700', letterSpacing: 0.6, marginBottom: 10, textTransform: 'uppercase' }}>
                  Email or Phone
                </Text>
                <View style={{
                  flexDirection: 'row', alignItems: 'center',
                  backgroundColor: '#f8faff', borderWidth: 1.5,
                  borderColor: 'rgba(0,0,0,0.08)', borderRadius: 14,
                  paddingHorizontal: 14,
                }}>
                  <Feather name="user" size={16} color="#94a3b8" style={{ marginRight: 10 }} />
                  <TextInput
                    style={{ flex: 1, color: '#0f172a', fontSize: 15, paddingVertical: 14 }}
                    placeholder="email@example.com or phone"
                    placeholderTextColor="#94a3b8"
                    value={emailOrPhone}
                    onChangeText={setEmailOrPhone}
                    editable={!loading}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                </View>
              </View>

              {/* Password */}
              <View>
                <Text style={{ color: '#475569', fontSize: 12, fontWeight: '700', letterSpacing: 0.6, marginBottom: 10, textTransform: 'uppercase' }}>
                  Password
                </Text>
                <View style={{
                  flexDirection: 'row', alignItems: 'center',
                  backgroundColor: '#f8faff', borderWidth: 1.5,
                  borderColor: 'rgba(0,0,0,0.08)', borderRadius: 14,
                  paddingHorizontal: 14,
                }}>
                  <Feather name="lock" size={16} color="#94a3b8" style={{ marginRight: 10 }} />
                  <TextInput
                    style={{ flex: 1, color: '#0f172a', fontSize: 15, paddingVertical: 14 }}
                    placeholder="Enter your password"
                    placeholderTextColor="#94a3b8"
                    value={password}
                    onChangeText={setPassword}
                    editable={!loading}
                    secureTextEntry={!showPassword}
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                  <TouchableOpacity onPress={() => setShowPassword(v => !v)} style={{ padding: 4 }}>
                    <Feather name={showPassword ? 'eye-off' : 'eye'} size={16} color="#94a3b8" />
                  </TouchableOpacity>
                </View>
              </View>

              {/* Forgot */}
              <TouchableOpacity 
                onPress={() => {
                  setForgotEmail('');
                  setForgotOtp('');
                  setForgotNewPass('');
                  setForgotConfirmPass('');
                  setForgotStep(1);
                  setForgotError('');
                  setForgotModalVisible(true);
                }}
                style={{ alignSelf: 'flex-end', marginTop: -6 }}
              >
                <Text style={{ color: accentColor, fontSize: 13, fontWeight: '700' }}>Forgot Password?</Text>
              </TouchableOpacity>
            </View>

            {/* Login CTA */}
            <TouchableOpacity
              onPress={handleLogin}
              disabled={loading}
              style={{
                backgroundColor: accentColor,
                borderRadius: 18, paddingVertical: 18,
                flexDirection: 'row', alignItems: 'center',
                justifyContent: 'center', gap: 8,
                shadowColor: accentColor,
                shadowOffset: { width: 0, height: 10 },
                shadowOpacity: 0.35, shadowRadius: 20, elevation: 10,
                marginBottom: 12,
              }}
            >
              {loading ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <Text style={{ color: '#fff', fontSize: 17, fontWeight: '800' }}>
                    Sign In
                  </Text>
                  <Feather name="arrow-right" size={18} color="#fff" />
                </>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => router.push('/auth/register')}
              disabled={loading}
              style={{ paddingVertical: 14, alignItems: 'center' }}
            >
              <Text style={{ color: '#64748b', fontSize: 14 }}>
                Don't have an account?{' '}
                <Text style={{ color: accentColor, fontWeight: '800' }}>Register here</Text>
              </Text>
            </TouchableOpacity>

            {/* Divider */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginVertical: 8 }}>
              <View style={{ flex: 1, height: 1, backgroundColor: 'rgba(0,0,0,0.08)' }} />
              <Text style={{ color: '#94a3b8', fontSize: 12 }}>or continue with</Text>
              <View style={{ flex: 1, height: 1, backgroundColor: 'rgba(0,0,0,0.08)' }} />
            </View>

            {/* Social */}
            <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 16, marginTop: 8 }}>
              {/* Google */}
              <TouchableOpacity
                onPress={() => {
                  setGooglePhone('');
                  setGoogleRole('student');
                  setGoogleError('');
                  setGoogleModalVisible(true);
                }}
                disabled={loading}
                style={{
                  width: 58, height: 58,
                  backgroundColor: 'rgba(255,255,255,0.85)',
                  borderWidth: 1.5, borderColor: 'rgba(0,0,0,0.08)',
                  borderRadius: 18, alignItems: 'center', justifyContent: 'center',
                  shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
                  shadowOpacity: 0.07, shadowRadius: 10, elevation: 3,
                }}
              >
                <Image 
                  source={{ uri: 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/c1/Google_%22G%22_logo.svg/120px-Google_%22G%22_logo.svg.png' }} 
                  style={{ width: 24, height: 24 }}
                  resizeMode="contain"
                />
              </TouchableOpacity>

              {/* Apple */}
              <TouchableOpacity
                style={{
                  width: 58, height: 58,
                  backgroundColor: 'rgba(255,255,255,0.85)',
                  borderWidth: 1.5, borderColor: 'rgba(0,0,0,0.08)',
                  borderRadius: 18, alignItems: 'center', justifyContent: 'center',
                  shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
                  shadowOpacity: 0.07, shadowRadius: 10, elevation: 3,
                }}
              >
                <Ionicons name="logo-apple" size={24} color="#000000" />
              </TouchableOpacity>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>

      {/* Forgot Password Modal */}
      <Modal
        visible={forgotModalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setForgotModalVisible(false)}
      >
        <View style={{ flex: 1, backgroundColor: 'rgba(15,23,42,0.3)', justifyContent: 'center', padding: 24 }}>
          <View style={{
            backgroundColor: '#ffffff',
            borderRadius: 28,
            padding: 24,
            borderWidth: 1.5,
            borderColor: '#e2e8f0',
            shadowColor: '#64748b',
            shadowOffset: { width: 0, height: 10 },
            shadowOpacity: 0.12,
            shadowRadius: 20,
            elevation: 8,
          }}>
            {/* Header */}
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
              <Text style={{ fontFamily: 'Roboto', fontSize: 20, fontWeight: '900', color: '#0f172a' }}>
                {forgotStep === 1 ? 'Reset Password' : 'Set New Password'}
              </Text>
              <TouchableOpacity onPress={() => setForgotModalVisible(false)} style={{ padding: 4 }}>
                <Feather name="x" size={20} color="#64748b" />
              </TouchableOpacity>
            </View>

            {/* Error Message */}
            {forgotError ? (
              <View style={{
                backgroundColor: 'rgba(239,68,68,0.05)',
                borderWidth: 1, borderColor: 'rgba(239,68,68,0.18)',
                borderRadius: 14, padding: 12, marginBottom: 16,
                flexDirection: 'row', alignItems: 'center', gap: 8,
              }}>
                <Feather name="alert-circle" size={14} color="#dc2626" />
                <Text style={{ color: '#dc2626', fontSize: 13, fontWeight: '600', flex: 1 }}>{forgotError}</Text>
              </View>
            ) : null}

            {forgotStep === 1 ? (
              <View style={{ gap: 16 }}>
                <Text style={{ fontSize: 13, color: '#64748b', lineHeight: 18 }}>
                  Enter your registered email address below. We'll send you a 6-digit OTP code to verify your identity.
                </Text>
                
                <View>
                  <Text style={{ color: '#475569', fontSize: 11, fontWeight: '700', letterSpacing: 0.6, marginBottom: 8, textTransform: 'uppercase' }}>
                    Email Address
                  </Text>
                  <View style={{
                    flexDirection: 'row', alignItems: 'center',
                    backgroundColor: '#f8faff', borderWidth: 1.5,
                    borderColor: 'rgba(0,0,0,0.08)', borderRadius: 14,
                    paddingHorizontal: 14,
                  }}>
                    <Feather name="mail" size={16} color="#94a3b8" style={{ marginRight: 10 }} />
                    <TextInput
                      style={{ flex: 1, color: '#0f172a', fontSize: 15, paddingVertical: 12 }}
                      placeholder="email@example.com"
                      placeholderTextColor="#94a3b8"
                      value={forgotEmail}
                      onChangeText={setForgotEmail}
                      keyboardType="email-address"
                      autoCapitalize="none"
                      autoCorrect={false}
                    />
                  </View>
                </View>

                <TouchableOpacity
                  onPress={handleForgotSendOtp}
                  disabled={forgotLoading}
                  style={{
                    backgroundColor: '#2563eb',
                    borderRadius: 16, paddingVertical: 14,
                    alignItems: 'center', justifyContent: 'center',
                    shadowColor: '#2563eb', shadowOffset: { width: 0, height: 6 },
                    shadowOpacity: 0.2, shadowRadius: 10, elevation: 4,
                    marginTop: 8
                  }}
                >
                  {forgotLoading ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Text style={{ color: '#fff', fontSize: 15, fontWeight: '800' }}>Send OTP</Text>
                  )}
                </TouchableOpacity>
              </View>
            ) : (
              <View style={{ gap: 14 }}>
                <Text style={{ fontSize: 13, color: '#64748b', lineHeight: 18 }}>
                  We have sent an email with a 6-digit verification code to <Text style={{ fontWeight: '700', color: '#0f172a' }}>{forgotEmail}</Text>.
                </Text>

                <View>
                  <Text style={{ color: '#475569', fontSize: 11, fontWeight: '700', letterSpacing: 0.6, marginBottom: 8, textTransform: 'uppercase' }}>
                    Verification Code (OTP)
                  </Text>
                  <View style={{
                    flexDirection: 'row', alignItems: 'center',
                    backgroundColor: '#f8faff', borderWidth: 1.5,
                    borderColor: 'rgba(0,0,0,0.08)', borderRadius: 14,
                    paddingHorizontal: 14,
                  }}>
                    <Feather name="key" size={16} color="#94a3b8" style={{ marginRight: 10 }} />
                    <TextInput
                      style={{ flex: 1, color: '#0f172a', fontSize: 15, paddingVertical: 12 }}
                      placeholder="Enter 6-digit code"
                      placeholderTextColor="#94a3b8"
                      value={forgotOtp}
                      onChangeText={setForgotOtp}
                      keyboardType="number-pad"
                      autoCapitalize="none"
                      autoCorrect={false}
                    />
                  </View>
                </View>

                <View>
                  <Text style={{ color: '#475569', fontSize: 11, fontWeight: '700', letterSpacing: 0.6, marginBottom: 8, textTransform: 'uppercase' }}>
                    New Password
                  </Text>
                  <View style={{
                    flexDirection: 'row', alignItems: 'center',
                    backgroundColor: '#f8faff', borderWidth: 1.5,
                    borderColor: 'rgba(0,0,0,0.08)', borderRadius: 14,
                    paddingHorizontal: 14,
                  }}>
                    <Feather name="lock" size={16} color="#94a3b8" style={{ marginRight: 10 }} />
                    <TextInput
                      style={{ flex: 1, color: '#0f172a', fontSize: 15, paddingVertical: 12 }}
                      placeholder="Minimum 6 characters"
                      placeholderTextColor="#94a3b8"
                      value={forgotNewPass}
                      onChangeText={setForgotNewPass}
                      secureTextEntry={!showForgotNewPass}
                      autoCapitalize="none"
                      autoCorrect={false}
                    />
                    <TouchableOpacity onPress={() => setShowForgotNewPass(v => !v)} style={{ padding: 4 }}>
                      <Feather name={showForgotNewPass ? 'eye-off' : 'eye'} size={15} color="#94a3b8" />
                    </TouchableOpacity>
                  </View>
                </View>

                <View>
                  <Text style={{ color: '#475569', fontSize: 11, fontWeight: '700', letterSpacing: 0.6, marginBottom: 8, textTransform: 'uppercase' }}>
                    Confirm Password
                  </Text>
                  <View style={{
                    flexDirection: 'row', alignItems: 'center',
                    backgroundColor: '#f8faff', borderWidth: 1.5,
                    borderColor: 'rgba(0,0,0,0.08)', borderRadius: 14,
                    paddingHorizontal: 14,
                  }}>
                    <Feather name="lock" size={16} color="#94a3b8" style={{ marginRight: 10 }} />
                    <TextInput
                      style={{ flex: 1, color: '#0f172a', fontSize: 15, paddingVertical: 12 }}
                      placeholder="Confirm new password"
                      placeholderTextColor="#94a3b8"
                      value={forgotConfirmPass}
                      onChangeText={setForgotConfirmPass}
                      secureTextEntry={!showForgotConfirmPass}
                      autoCapitalize="none"
                      autoCorrect={false}
                    />
                    <TouchableOpacity onPress={() => setShowForgotConfirmPass(v => !v)} style={{ padding: 4 }}>
                      <Feather name={showForgotConfirmPass ? 'eye-off' : 'eye'} size={15} color="#94a3b8" />
                    </TouchableOpacity>
                  </View>
                </View>

                <TouchableOpacity
                  onPress={handleForgotResetPassword}
                  disabled={forgotLoading}
                  style={{
                    backgroundColor: '#2563eb',
                    borderRadius: 16, paddingVertical: 14,
                    alignItems: 'center', justifyContent: 'center',
                    shadowColor: '#2563eb', shadowOffset: { width: 0, height: 6 },
                    shadowOpacity: 0.2, shadowRadius: 10, elevation: 4,
                    marginTop: 10
                  }}
                >
                  {forgotLoading ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Text style={{ color: '#fff', fontSize: 15, fontWeight: '800' }}>Reset Password</Text>
                  )}
                </TouchableOpacity>
              </View>
            )}

          </View>
        </View>
      </Modal>

      {/* Google Details Modal */}
      <Modal
        visible={googleModalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setGoogleModalVisible(false)}
      >
        <View style={{ flex: 1, backgroundColor: 'rgba(15,23,42,0.3)', justifyContent: 'center', padding: 24 }}>
          <View style={{
            backgroundColor: '#ffffff',
            borderRadius: 28,
            padding: 24,
            borderWidth: 1.5,
            borderColor: '#e2e8f0',
            shadowColor: '#64748b',
            shadowOffset: { width: 0, height: 10 },
            shadowOpacity: 0.12,
            shadowRadius: 20,
            elevation: 8,
          }}>
            {/* Header */}
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
              <Text style={{ fontFamily: 'Roboto', fontSize: 20, fontWeight: '900', color: '#0f172a' }}>
                Google Sign-In Setup
              </Text>
              <TouchableOpacity onPress={() => setGoogleModalVisible(false)} style={{ padding: 4 }}>
                <Feather name="x" size={20} color="#64748b" />
              </TouchableOpacity>
            </View>

            {/* Error Message */}
            {googleError ? (
              <View style={{
                backgroundColor: 'rgba(239,68,68,0.05)',
                borderWidth: 1, borderColor: 'rgba(239,68,68,0.18)',
                borderRadius: 14, padding: 12, marginBottom: 16,
                flexDirection: 'row', alignItems: 'center', gap: 8,
              }}>
                <Feather name="alert-circle" size={14} color="#dc2626" />
                <Text style={{ color: '#dc2626', fontSize: 13, fontWeight: '600', flex: 1 }}>{googleError}</Text>
              </View>
            ) : null}

            <View style={{ gap: 16 }}>
              <Text style={{ fontSize: 13, color: '#64748b', lineHeight: 18 }}>
                Provide your mobile phone number and choose your role to register or sign in with your Google account.
              </Text>

              {/* Account Type Selection */}
              <View>
                <Text style={{ color: '#475569', fontSize: 11, fontWeight: '700', letterSpacing: 0.6, marginBottom: 8, textTransform: 'uppercase' }}>
                  Choose Account Type
                </Text>
                <View style={{
                  backgroundColor: '#f8faff',
                  borderWidth: 1.5, borderColor: 'rgba(0,0,0,0.08)',
                  borderRadius: 14, padding: 4,
                  flexDirection: 'row',
                }}>
                  {(['student', 'scribe'] as const).map((r) => {
                    const active = googleRole === r;
                    const color = r === 'student' ? '#2563eb' : '#16a34a';
                    const bg = r === 'student' ? 'rgba(37,99,235,0.08)' : 'rgba(22,163,74,0.08)';
                    const border = r === 'student' ? 'rgba(37,99,235,0.22)' : 'rgba(22,163,74,0.22)';
                    return (
                      <TouchableOpacity
                        key={r}
                        onPress={() => setGoogleRole(r)}
                        style={{
                          flex: 1, paddingVertical: 12, borderRadius: 10,
                          alignItems: 'center',
                          backgroundColor: active ? bg : 'transparent',
                          borderWidth: active ? 1 : 0,
                          borderColor: active ? border : 'transparent',
                        }}
                      >
                        <Text style={{ fontSize: 13, fontWeight: '700', color: active ? color : '#94a3b8' }}>
                          {r === 'student' ? '🎓 Student' : '✍️ Scribe'}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
              
              {/* Phone Number Input */}
              <View>
                <Text style={{ color: '#475569', fontSize: 11, fontWeight: '700', letterSpacing: 0.6, marginBottom: 8, textTransform: 'uppercase' }}>
                  Mobile Phone Number
                </Text>
                <View style={{
                  flexDirection: 'row', alignItems: 'center',
                  backgroundColor: '#f8faff', borderWidth: 1.5,
                  borderColor: 'rgba(0,0,0,0.08)', borderRadius: 14,
                  paddingHorizontal: 14,
                }}>
                  <Feather name="phone" size={16} color="#94a3b8" style={{ marginRight: 10 }} />
                  <TextInput
                    style={{ flex: 1, color: '#0f172a', fontSize: 15, paddingVertical: 12 }}
                    placeholder="Enter 10-digit number"
                    placeholderTextColor="#94a3b8"
                    value={googlePhone}
                    onChangeText={setGooglePhone}
                    keyboardType="phone-pad"
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                </View>
              </View>

              <TouchableOpacity
                onPress={async () => {
                  if (!googlePhone.trim() || googlePhone.trim().length < 10) {
                    setGoogleError('Please enter a valid 10-digit phone number.');
                    return;
                  }
                  setGoogleModalVisible(false);
                  await handleGoogleSignIn(googlePhone.trim(), googleRole);
                }}
                style={{
                  backgroundColor: '#2563eb',
                  borderRadius: 16, paddingVertical: 14,
                  flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
                  shadowColor: '#2563eb', shadowOffset: { width: 0, height: 6 },
                  shadowOpacity: 0.2, shadowRadius: 10, elevation: 4,
                  marginTop: 8
                }}
              >
                <Text style={{ color: '#fff', fontSize: 15, fontWeight: '800' }}>Continue with Google</Text>
                <Feather name="arrow-right" size={16} color="#fff" />
              </TouchableOpacity>
            </View>

          </View>
        </View>
      </Modal>
    </View>
  );
}
