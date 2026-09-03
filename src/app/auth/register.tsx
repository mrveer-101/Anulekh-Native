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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { router, useLocalSearchParams } from 'expo-router';
import { supabase, friendlyAuthError, API_URL } from '@/core/supabase';
import { Feather, FontAwesome5 } from '@expo/vector-icons';
import PolicyModal from '@/components/modals/PolicyModal';
import { announceForAccessibility } from '@/core/a11y';

const { height } = Dimensions.get('window');

export default function RegisterScreen() {
  const params = useLocalSearchParams<{ role?: string }>();
  const [role, setRole]               = useState<'student' | 'scribe' | null>(
    params.role === 'scribe' ? 'scribe' : params.role === 'student' ? 'student' : null
  );
  const [fullName, setFullName]       = useState('');
  const [email, setEmail]             = useState('');
  const [password, setPassword]       = useState('');
  const [showPass, setShowPass]       = useState(false);
  const [loading, setLoading]         = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [phone, setPhone] = useState('');
  const [emailOtpCode, setEmailOtpCode] = useState('');
  const [mobileOtpCode, setMobileOtpCode] = useState('');
  const [showOtpModal, setShowOtpModal] = useState(false);
  const [otpLoading, setOtpLoading] = useState(false);
  const [otpError, setOtpError] = useState('');
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [showTermsModal, setShowTermsModal] = useState(false);

  const [showEmailField, setShowEmailField] = useState(false);

  const isStudent   = role === 'student';
  const isScribe    = role === 'scribe';
  const accentColor = isScribe ? '#16a34a' : '#2563eb';
  const accentBg    = isScribe ? 'rgba(22,163,74,0.08)' : 'rgba(37,99,235,0.08)';
  const accentBorder= isScribe ? 'rgba(22,163,74,0.22)' : 'rgba(37,99,235,0.22)';

  const getStrength = (p: string) => {
    if (p.length >= 10) return 4;
    if (p.length >= 8) return 3;
    if (p.length >= 5) return 2;
    if (p.length >= 1) return 1;
    return 0;
  };
  const strengthColors = ['#ef4444', '#f97316', '#eab308', '#22c55e'];
  const strengthLabels = ['Too short', 'Weak', 'Fair', 'Strong'];

  const handleRegister = async () => {
    if (!role) {
      setErrorMessage('Please select your role: Student or Scribe.');
      return;
    }
    if (!fullName.trim() || !phone.trim() || !password.trim()) {
      setErrorMessage('Please fill in Full Name, Phone Number, and Password.');
      return;
    }
    if (password.length < 6) {
      setErrorMessage('Password must be at least 6 characters.');
      return;
    }
    if (!agreedToTerms) {
      setErrorMessage(`Please agree to the ${isStudent ? 'Student' : 'Scribe'} Terms & Conditions to proceed.`);
      return;
    }

    let formattedPhone = phone.trim();
    // Default to +91 (India) if it is a standard 10-digit number
    if (/^\d{10}$/.test(formattedPhone)) {
      formattedPhone = `+91${formattedPhone}`;
    } else if (formattedPhone.startsWith('91') && formattedPhone.length === 12) {
      formattedPhone = `+${formattedPhone}`;
    } else if (!formattedPhone.startsWith('+')) {
      formattedPhone = `+91${formattedPhone}`;
    }

    // Save formatted phone back to state
    setPhone(formattedPhone);

    setLoading(true);
    setErrorMessage('');

    const finalEmail = email.trim() || `${formattedPhone.replace(/[^0-9]/g, '')}@anulekh.app`;

    try {
      // Direct registration without OTP modal (OTP verification paused for testing)
      const res = await fetch(`${API_URL}/api/auth/verify-otp-signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: finalEmail,
          password,
          full_name: fullName.trim(),
          role,
          phone: formattedPhone,
          email_otp: '123456',
          mobile_otp: '123456',
        }),
      });

      const resText = await res.text();
      let resData: any = {};
      try {
        resData = JSON.parse(resText);
      } catch (e) {
        resData = { message: resText, error: resText };
      }

      if (!res.ok) {
        throw new Error(resData.message || resData.error || 'Failed to create account.');
      }

      if (resData.user) {
        // Ensure profile record has phone and role saved
        const { error: updateError } = await supabase.from('profiles').update({
          full_name: fullName.trim(),
          role,
          phone: formattedPhone,
        }).eq('id', resData.user.id);

        if (updateError) {
          // If row doesn't exist, insert it
          await supabase.from('profiles').insert({
            id: resData.user.id,
            full_name: fullName.trim(),
            role,
            phone: formattedPhone,
            languages: [],
          });
        }

        if (Platform.OS === 'web') {
          alert(`🎉 Account Created!\n\n${role === 'scribe' ? 'Scribe' : 'Student'} account created successfully.`);
          router.replace(`/auth/login?role=${role}`);
        } else {
          Alert.alert(
            '🎉 Account Created!',
            `${role === 'scribe' ? 'Scribe' : 'Student'} account created successfully.`,
            [{ text: 'Sign In', onPress: () => router.replace(`/auth/login?role=${role}`) }]
          );
        }
      }
    } catch (err: any) {
      setErrorMessage(friendlyAuthError(err, 'Registration failed. Please try again.'));
    } finally {
      setLoading(false);
    }
  };

  const strength = getStrength(password);

  return (
    <View style={{ flex: 1, backgroundColor: '#f0f4ff' }}>
      <StatusBar style="dark" />

      {/* Background orbs */}
      <View style={{ position: 'absolute', top: -90, left: -70, width: 300, height: 300, borderRadius: 150, backgroundColor: isScribe ? 'rgba(22,163,74,0.20)' : 'rgba(37,99,235,0.20)' }} />
      <View style={{ position: 'absolute', bottom: 60, right: -80, width: 240, height: 240, borderRadius: 120, backgroundColor: 'rgba(234,88,12,0.16)' }} />

      <SafeAreaView style={{ flex: 1 }}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
          <ScrollView
            contentContainerStyle={{ flexGrow: 1, paddingHorizontal: 24, paddingBottom: 80 }}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {/* Back & Top Action Row */}
            <View style={{ paddingTop: 16, paddingBottom: 4, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <TouchableOpacity
                onPress={() => router.replace('/landing')}
                accessible={true}
                accessibilityRole="button"
                accessibilityLabel="Go back"
                style={{
                  flexDirection: 'row', alignItems: 'center', gap: 6,
                  backgroundColor: '#ffffff',
                  borderWidth: 1.5, borderColor: '#e2e8f0',
                  borderRadius: 12, paddingVertical: 8, paddingHorizontal: 14,
                  shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
                  shadowOpacity: 0.06, shadowRadius: 6, elevation: 2,
                }}
              >
                <Feather name="arrow-left" size={14} color="#64748b" />
                <Text style={{ color: '#64748b', fontSize: 14, fontWeight: '600' }}>Back</Text>
              </TouchableOpacity>

              {/* Top Sign In Tag Button */}
              <TouchableOpacity
                onPress={() => router.push(`/auth/login?role=${role}`)}
                accessible={true}
                accessibilityRole="button"
                accessibilityLabel="Sign in to your account"
                accessibilityHint="Navigates to the sign in login page"
                style={{
                  flexDirection: 'row', alignItems: 'center', gap: 6,
                  backgroundColor: '#2563eb',
                  borderWidth: 1.5, borderColor: '#1d4ed8',
                  borderRadius: 12, paddingVertical: 8, paddingHorizontal: 14,
                  shadowColor: '#2563eb', shadowOffset: { width: 0, height: 2 },
                  shadowOpacity: 0.25, shadowRadius: 6, elevation: 3,
                }}
              >
                <Text style={{ color: '#ffffff', fontSize: 13, fontWeight: '800' }}>Sign In</Text>
                <Feather name="log-in" size={13} color="#ffffff" />
              </TouchableOpacity>
            </View>

            {/* Header */}
            <View style={{ paddingTop: 24, paddingBottom: 24 }}>
              <Text style={{ fontSize: 32, fontWeight: '900', color: '#0f172a', letterSpacing: -0.8 }}>
                Create account ✨
              </Text>
              <Text style={{ fontSize: 15, color: '#64748b', marginTop: 6, lineHeight: 22 }}>
                {role === 'student' ? 'Join as a student seeking a scribe' : role === 'scribe' ? 'Join as a volunteer scribe' : 'Select your account type to get started'}
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

            {/* Premium Role Slider (No fill by default until explicitly selected) */}
            <View style={{
              backgroundColor: '#f1f5f9',
              borderWidth: 1.5, borderColor: '#cbd5e1',
              borderRadius: 20, padding: 5, flexDirection: 'row',
              marginBottom: 24, gap: 6,
              shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
              shadowOpacity: 0.06, shadowRadius: 10, elevation: 2,
            }}>
              {(['student', 'scribe'] as const).map((r) => {
                const isSelected = role === r;
                const activeBg = r === 'student' ? '#2563eb' : '#16a34a';

                return (
                  <TouchableOpacity
                    key={r}
                    onPress={() => setRole(r)}
                    disabled={loading}
                    activeOpacity={0.8}
                    style={{
                      flex: 1,
                      paddingVertical: 13,
                      paddingHorizontal: 12,
                      borderRadius: 15,
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 8,
                      backgroundColor: isSelected ? activeBg : '#ffffff',
                      borderWidth: 1.5,
                      borderColor: isSelected ? activeBg : '#cbd5e1',
                      shadowColor: isSelected ? activeBg : '#000',
                      shadowOffset: { width: 0, height: isSelected ? 4 : 2 },
                      shadowOpacity: isSelected ? 0.3 : 0.04,
                      shadowRadius: isSelected ? 8 : 4,
                      elevation: isSelected ? 4 : 1,
                    }}
                  >
                    <FontAwesome5
                      name={r === 'student' ? 'user-graduate' : 'pen-nib'}
                      size={15}
                      color={isSelected ? '#ffffff' : '#0f172a'}
                    />
                    <Text style={{
                      fontSize: 14,
                      fontWeight: '800',
                      color: isSelected ? '#ffffff' : '#0f172a',
                      letterSpacing: 0.2
                    }}>
                      {r === 'student' ? 'Student' : 'Scribe'}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Form card */}
            <View style={{
              backgroundColor: '#ffffff',
              borderWidth: 1.5, borderColor: '#e2e8f0',
              borderRadius: 24, padding: 20, gap: 18,
              shadowColor: '#000', shadowOffset: { width: 0, height: 8 },
              shadowOpacity: 0.07, shadowRadius: 20, elevation: 4,
              marginBottom: 20,
            }}>
              {/* 1. Name */}
              <View>
                <Text style={{ color: '#475569', fontSize: 12, fontWeight: '700', letterSpacing: 0.6, marginBottom: 10, textTransform: 'uppercase' }}>
                  Name
                </Text>
                <View style={{
                  flexDirection: 'row', alignItems: 'center',
                  backgroundColor: '#f8fafc', borderWidth: 1.5,
                  borderColor: '#e2e8f0', borderRadius: 14,
                  paddingHorizontal: 14,
                }}>
                  <Feather name="user" size={16} color="#94a3b8" style={{ marginRight: 10 }} importantForAccessibility="no" accessibilityElementsHidden={true} />
                  <TextInput
                    style={{ flex: 1, color: '#0f172a', fontSize: 15, paddingVertical: 14 }}
                    placeholder="Enter your full name"
                    placeholderTextColor="#94a3b8"
                    value={fullName}
                    onChangeText={setFullName}
                    editable={!loading}
                    autoCapitalize="words"
                    autoCorrect={false}
                    accessible={true}
                    accessibilityLabel="Full Name"
                    accessibilityHint="Enter your full name"
                  />
                </View>
              </View>

              {/* 2. Phone + + Add Email ID button in header */}
              <View>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                  <Text style={{ color: '#475569', fontSize: 12, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase' }}>
                    Phone
                  </Text>
                  {!showEmailField && (
                    <TouchableOpacity
                      onPress={() => setShowEmailField(true)}
                      activeOpacity={0.7}
                      accessible={true}
                      accessibilityRole="button"
                      accessibilityLabel="Add optional Email ID"
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 4,
                        paddingVertical: 3,
                        paddingHorizontal: 9,
                        borderRadius: 12,
                        backgroundColor: accentBg,
                        borderWidth: 1,
                        borderColor: accentBorder,
                      }}
                    >
                      <Feather name="plus" size={11} color={accentColor} importantForAccessibility="no" accessibilityElementsHidden={true} />
                      <Text style={{ fontSize: 11, fontWeight: '700', color: accentColor }}>
                        Add Email ID
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>
                <View style={{
                  flexDirection: 'row', alignItems: 'center',
                  backgroundColor: '#f8fafc', borderWidth: 1.5,
                  borderColor: '#e2e8f0', borderRadius: 14,
                  paddingHorizontal: 14,
                }}>
                  <Feather name="phone" size={16} color="#94a3b8" style={{ marginRight: 10 }} importantForAccessibility="no" accessibilityElementsHidden={true} />
                  <TextInput
                    style={{ flex: 1, color: '#0f172a', fontSize: 15, paddingVertical: 14 }}
                    placeholder="Enter your 10-digit mobile number"
                    placeholderTextColor="#94a3b8"
                    value={phone}
                    onChangeText={setPhone}
                    editable={!loading}
                    keyboardType="phone-pad"
                    accessible={true}
                    accessibilityLabel="Mobile Phone Number"
                    accessibilityHint="Enter your 10-digit mobile number"
                  />
                </View>
              </View>

              {/* Optional Email Field (expanded when user clicks + Add Email ID) */}
              {showEmailField && (
                <View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                    <Text style={{ color: '#475569', fontSize: 12, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase' }}>
                      Email <Text style={{ color: '#94a3b8', textTransform: 'none', fontWeight: '500' }}>(Optional)</Text>
                    </Text>
                    <TouchableOpacity
                      onPress={() => { setShowEmailField(false); setEmail(''); }}
                      accessible={true}
                      accessibilityRole="button"
                      accessibilityLabel="Remove email input"
                      style={{ padding: 2 }}
                    >
                      <Feather name="x" size={15} color="#94a3b8" importantForAccessibility="no" accessibilityElementsHidden={true} />
                    </TouchableOpacity>
                  </View>
                  <View style={{
                    flexDirection: 'row', alignItems: 'center',
                    backgroundColor: '#f8fafc', borderWidth: 1.5,
                    borderColor: '#e2e8f0', borderRadius: 14,
                    paddingHorizontal: 14,
                  }}>
                    <Feather name="mail" size={16} color="#94a3b8" style={{ marginRight: 10 }} importantForAccessibility="no" accessibilityElementsHidden={true} />
                    <TextInput
                      style={{ flex: 1, color: '#0f172a', fontSize: 15, paddingVertical: 14 }}
                      placeholder="Enter your optional email"
                      placeholderTextColor="#94a3b8"
                      value={email}
                      onChangeText={setEmail}
                      editable={!loading}
                      keyboardType="email-address"
                      autoCapitalize="none"
                      autoCorrect={false}
                      accessible={true}
                      accessibilityLabel="Optional Email Address"
                      accessibilityHint="Enter your email address"
                    />
                  </View>
                </View>
              )}

              {/* 3. Password */}
              <View>
                <Text style={{ color: '#475569', fontSize: 12, fontWeight: '700', letterSpacing: 0.6, marginBottom: 10, textTransform: 'uppercase' }}>
                  Password
                </Text>
                <View style={{
                  flexDirection: 'row', alignItems: 'center',
                  backgroundColor: '#f8fafc', borderWidth: 1.5,
                  borderColor: '#e2e8f0', borderRadius: 14,
                  paddingHorizontal: 14,
                }}>
                  <Feather name="lock" size={16} color="#94a3b8" style={{ marginRight: 10 }} importantForAccessibility="no" accessibilityElementsHidden={true} />
                  <TextInput
                    style={{ flex: 1, color: '#0f172a', fontSize: 15, paddingVertical: 14 }}
                    placeholder="Create a strong password"
                    placeholderTextColor="#94a3b8"
                    value={password}
                    onChangeText={setPassword}
                    editable={!loading}
                    secureTextEntry={!showPass}
                    autoCapitalize="none"
                    autoCorrect={false}
                    accessible={true}
                    accessibilityLabel="Password"
                    accessibilityHint="Create a password with at least 6 characters"
                  />
                  <TouchableOpacity
                    onPress={() => setShowPass(!showPass)}
                    accessible={true}
                    accessibilityRole="button"
                    accessibilityLabel={showPass ? "Hide password" : "Show password"}
                    accessibilityHint="Toggles password visibility"
                    style={{ padding: 6 }}
                  >
                    <Feather name={showPass ? 'eye-off' : 'eye'} size={16} color="#94a3b8" importantForAccessibility="no" accessibilityElementsHidden={true} />
                  </TouchableOpacity>
                </View>
              </View>

              {/* Password strength */}
              {password.length > 0 && (
                <View
                  accessible={true}
                  accessibilityLabel={`Password strength: ${strength > 0 ? strengthLabels[strength - 1] : 'Weak'}`}
                  style={{ marginTop: -6 }}
                >
                  <View style={{ flexDirection: 'row', gap: 6, marginBottom: 6 }}>
                    {[1, 2, 3, 4].map((i) => (
                      <View
                        key={i}
                        style={{
                          flex: 1, height: 4, borderRadius: 2,
                          backgroundColor: i <= strength
                            ? strengthColors[strength - 1]
                            : 'rgba(0,0,0,0.08)',
                        }}
                      />
                    ))}
                  </View>
                  <Text style={{ fontSize: 12, color: strength > 0 ? strengthColors[strength - 1] : '#94a3b8', fontWeight: '600' }}>
                    {strength > 0 ? strengthLabels[strength - 1] : ''}
                  </Text>
                </View>
              )}
            </View>

            {/* Terms and Conditions Checkbox */}
            <View style={{
              flexDirection: 'row',
              alignItems: 'center',
              marginBottom: 16,
              paddingHorizontal: 4,
              gap: 10,
            }}>
              <TouchableOpacity
                onPress={() => {
                  setAgreedToTerms(!agreedToTerms);
                  announceForAccessibility(!agreedToTerms ? 'Agreed to Terms and Conditions checked' : 'Terms and Conditions unchecked');
                }}
                accessible={true}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: agreedToTerms }}
                accessibilityLabel="I agree to Terms & Conditions"
                accessibilityHint="Toggles agreement to terms and conditions"
                style={{
                  width: 24,
                  height: 24,
                  borderRadius: 6,
                  borderWidth: 2,
                  borderColor: agreedToTerms ? accentColor : '#94a3b8',
                  backgroundColor: agreedToTerms ? accentColor : '#ffffff',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {agreedToTerms && <Feather name="check" size={14} color="#ffffff" importantForAccessibility="no" accessibilityElementsHidden={true} />}
              </TouchableOpacity>
              
              <Text style={{ flex: 1, fontSize: 13, color: '#475569', lineHeight: 18 }}>
                I agree to the{' '}
                <Text
                  onPress={() => setShowTermsModal(true)}
                  accessible={true}
                  accessibilityRole="link"
                  accessibilityLabel={isStudent ? 'Read Student Terms & Conditions' : 'Read Scribe Terms & Conditions'}
                  style={{ color: accentColor, fontWeight: '800', textDecorationLine: 'underline' }}
                >
                  {isStudent ? 'Student Terms & Conditions' : 'Scribe Terms & Conditions'}
                </Text>
              </Text>
            </View>

            {/* CTA */}
            <TouchableOpacity
              onPress={handleRegister}
              disabled={loading}
              accessible={true}
              accessibilityRole="button"
              accessibilityLabel={loading ? "Creating account, please wait" : (role === 'student' ? 'Create Student Account' : role === 'scribe' ? 'Create Scribe Account' : 'Select Role & Create Account')}
              accessibilityState={{ busy: loading, disabled: loading }}
              style={{
                backgroundColor: role === 'scribe' ? '#16a34a' : role === 'student' ? '#2563eb' : '#334155',
                borderRadius: 18, paddingVertical: 18,
                flexDirection: 'row', alignItems: 'center',
                justifyContent: 'center', gap: 8,
                shadowColor: role === 'scribe' ? '#16a34a' : role === 'student' ? '#2563eb' : '#334155',
                shadowOffset: { width: 0, height: 10 },
                shadowOpacity: 0.35, shadowRadius: 20, elevation: 10,
                marginBottom: 12,
              }}
            >
              {loading ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <Text style={{ color: '#fff', fontSize: 16.5, fontWeight: '800' }}>
                    {role === 'student' ? 'Create Student Account' : role === 'scribe' ? 'Create Scribe Account' : 'Select Role & Create Account'}
                  </Text>
                  <Feather name="arrow-right" size={18} color="#fff" importantForAccessibility="no" accessibilityElementsHidden={true} />
                </>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => router.push(`/auth/login?role=${role}`)}
              disabled={loading}
              accessible={true}
              accessibilityRole="link"
              accessibilityLabel="Already have an account? Sign In"
              style={{ paddingVertical: 14, alignItems: 'center' }}
            >
              <Text style={{ color: '#64748b', fontSize: 14 }}>
                Already have an account?{' '}
                <Text style={{ color: accentColor, fontWeight: '800' }}>Sign In</Text>
              </Text>
            </TouchableOpacity>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>

      {/* ── OTP Verification Modal Overlay ── */}
      {showOtpModal && (
        <View style={{
          position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(15,23,42,0.65)',
          justifyContent: 'center', alignItems: 'center', zIndex: 1000,
          paddingHorizontal: 24,
        }}>
          <View style={{
            backgroundColor: '#ffffff',
            borderRadius: 28, padding: 24, width: '100%', maxWidth: 360,
            shadowColor: '#000', shadowOffset: { width: 0, height: 10 },
            shadowOpacity: 0.15, shadowRadius: 24, elevation: 12,
            borderWidth: 1, borderColor: 'rgba(0,0,0,0.04)',
          }}>
            <View style={{ alignItems: 'center', marginBottom: 16 }}>
              <View style={{
                width: 50, height: 50, borderRadius: 16,
                backgroundColor: 'rgba(37,99,235,0.08)',
                alignItems: 'center', justifyContent: 'center',
                marginBottom: 12,
              }}>
                <Feather name="shield" size={22} color="#2563eb" />
              </View>
              <Text style={{ fontSize: 18, fontWeight: '800', color: '#0f172a', textAlign: 'center' }}>
                Double OTP Verification
              </Text>
              <Text style={{ fontSize: 12, color: '#64748b', textAlign: 'center', marginTop: 6, lineHeight: 16 }}>
                Enter the codes sent to verify your identity.
              </Text>
            </View>

            {otpError ? (
              <Text style={{ color: '#ef4444', fontSize: 12, fontWeight: '600', textAlign: 'center', marginBottom: 12 }}>
                {otpError}
              </Text>
            ) : null}

            {/* Email OTP Field */}
            {/* Email OTP Field */}
            <View style={{ marginBottom: 16 }}>
              <Text style={{ fontSize: 10, fontWeight: '700', color: '#475569', textTransform: 'uppercase', marginBottom: 8 }}>
                📧 Email OTP (sent to {email})
              </Text>
              
              <View style={{ position: 'relative', height: 54, width: '100%', justifyContent: 'center' }}>
                <TextInput
                  value={emailOtpCode}
                  onChangeText={(val) => setEmailOtpCode(val.replace(/[^0-9]/g, ''))}
                  keyboardType="number-pad"
                  maxLength={6}
                  style={{
                    position: 'absolute',
                    opacity: 0,
                    width: '100%',
                    height: '100%',
                    zIndex: 2,
                  }}
                />
                
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 6, zIndex: 1 }}>
                  {[0, 1, 2, 3, 4, 5].map((index) => {
                    const digit = emailOtpCode[index] || '';
                    const isFocused = emailOtpCode.length === index;
                    return (
                      <View
                        key={index}
                        style={{
                          flex: 1,
                          height: 52,
                          borderRadius: 14,
                          borderWidth: 1.5,
                          borderColor: isFocused ? '#2563eb' : '#e2e8f0',
                          backgroundColor: '#ffffff',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <Text style={{ fontSize: 18, fontWeight: '700', color: '#0f172a' }}>
                          {digit}
                        </Text>
                      </View>
                    );
                  })}
                </View>
              </View>
            </View>

            {/* Mobile OTP Field */}
            <View style={{ marginBottom: 20 }}>
              <Text style={{ fontSize: 10, fontWeight: '700', color: '#475569', textTransform: 'uppercase', marginBottom: 8 }}>
                📱 SMS OTP (sent to {phone})
              </Text>
              
              <View style={{ position: 'relative', height: 54, width: '100%', justifyContent: 'center' }}>
                <TextInput
                  value={mobileOtpCode}
                  onChangeText={(val) => setMobileOtpCode(val.replace(/[^0-9]/g, ''))}
                  keyboardType="number-pad"
                  maxLength={6}
                  style={{
                    position: 'absolute',
                    opacity: 0,
                    width: '100%',
                    height: '100%',
                    zIndex: 2,
                  }}
                />
                
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 6, zIndex: 1 }}>
                  {[0, 1, 2, 3, 4, 5].map((index) => {
                    const digit = mobileOtpCode[index] || '';
                    const isFocused = mobileOtpCode.length === index;
                    return (
                      <View
                        key={index}
                        style={{
                          flex: 1,
                          height: 52,
                          borderRadius: 14,
                          borderWidth: 1.5,
                          borderColor: isFocused ? '#2563eb' : '#e2e8f0',
                          backgroundColor: '#ffffff',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <Text style={{ fontSize: 18, fontWeight: '700', color: '#0f172a' }}>
                          {digit}
                        </Text>
                      </View>
                    );
                  })}
                </View>
              </View>
            </View>

            <View style={{ gap: 8 }}>
              <TouchableOpacity
                onPress={handleVerifyOtpAndSignUp}
                disabled={otpLoading}
                style={{
                  backgroundColor: '#2563eb',
                  borderRadius: 14, paddingVertical: 13,
                  alignItems: 'center', justifyContent: 'center',
                  shadowColor: '#2563eb', shadowOffset: { width: 0, height: 4 },
                  shadowOpacity: 0.2, shadowRadius: 8, elevation: 3,
                }}
              >
                {otpLoading ? (
                  <ActivityIndicator color="#ffffff" />
                ) : (
                  <Text style={{ color: '#ffffff', fontSize: 14, fontWeight: '700' }}>
                    Verify & Create {isStudent ? 'Student' : 'Scribe'} Account
                  </Text>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => setShowOtpModal(false)}
                style={{
                  paddingVertical: 8,
                  alignItems: 'center',
                }}
              >
                <Text style={{ color: '#64748b', fontSize: 13, fontWeight: '600' }}>
                  Cancel
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}

      {/* Policy Terms Modal */}
      <PolicyModal
        visible={showTermsModal}
        onClose={() => setShowTermsModal(false)}
        type={isStudent ? 'student_terms' : 'scribe_terms'}
        onAgree={() => setAgreedToTerms(true)}
      />
    </View>
  );
}
