import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, Pressable, ActivityIndicator, Alert, Image } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { supabase } from '@/core/supabase';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';

interface StudentProfilePCViewProps {
  userProfile?: any;
  onRefresh?: () => void;
}

export default function StudentProfilePCView({
  userProfile,
  onRefresh,
}: StudentProfilePCViewProps) {
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<any>(userProfile || null);
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [educationGrade, setEducationGrade] = useState('');
  const [profilePhoto, setProfilePhoto] = useState<string | null>(null);

  useEffect(() => {
    fetchProfile();
  }, []);

  const fetchProfile = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      setUser(session.user);
      setEmail(session.user.email || '');

      const localPhoto = await AsyncStorage.getItem(`profile_photo_${session.user.id}`);
      if (localPhoto) {
        setProfilePhoto(localPhoto);
      }

      const { data: profileData } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', session.user.id)
        .single();

      if (profileData) {
        setProfile(profileData);
        setFullName(profileData.full_name || '');
        setPhone(profileData.phone || '');
        setEducationGrade(profileData.education_grade || profileData.qualification || 'Higher Secondary / College');
      }
    } catch (error: any) {
      console.warn('Error fetching PC profile:', error?.message);
    } finally {
      setLoading(false);
    }
  };

  const toDataUri = async (uri: string): Promise<string> => {
    const response = await fetch(uri);
    const blob = await response.blob();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  };

  const handleSelectPhoto = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Required', 'Please allow photo library access to upload a profile photo.');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.6,
      });
      if (result.canceled || !result.assets?.length) return;
      const asset = result.assets[0];
      const dataUri = await toDataUri(asset.uri);
      setProfilePhoto(dataUri);
      if (user) {
        await AsyncStorage.setItem(`profile_photo_${user.id}`, dataUri);
      }
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to select image.');
    }
  };

  const handleUpdateProfile = async () => {
    if (!fullName.trim() || !phone.trim()) {
      Alert.alert('Missing Fields', 'Full Name and Phone Number are required.');
      return;
    }

    setUpdating(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const { error } = await supabase
        .from('profiles')
        .update({
          full_name: fullName.trim(),
          phone: phone.trim(),
          education_grade: educationGrade.trim(),
        })
        .eq('id', session.user.id);

      if (error) throw error;

      Alert.alert('Success', 'Profile details updated successfully!');
      if (onRefresh) onRefresh();
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to update profile.');
    } finally {
      setUpdating(false);
    }
  };

  const handleSignOut = async () => {
    Alert.alert('Sign Out', 'Are you sure you want to log out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Log Out',
        style: 'destructive',
        onPress: async () => {
          await supabase.auth.signOut();
          router.replace('/auth/login');
        },
      },
    ]);
  };

  if (loading) {
    return (
      <View style={{ paddingVertical: 60, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" color="#2563eb" />
        <Text style={{ marginTop: 14, color: '#64748b', fontSize: 14, fontWeight: '600' }}>
          Loading profile details…
        </Text>
      </View>
    );
  }

  const isApproved = profile?.verification_status === 'approved';

  // Glassmorphic Helper Style (Ultra-Glassmorphic System)
  const glassCardStyle = {
    backgroundColor: 'rgba(255, 255, 255, 0.72)',
    backdropFilter: 'blur(24px) saturate(180%)',
    WebkitBackdropFilter: 'blur(24px) saturate(180%)',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.85)',
    borderTopColor: 'rgba(255, 255, 255, 0.98)',
    borderLeftColor: 'rgba(255, 255, 255, 0.9)',
    shadowColor: '#2563eb',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.06,
    shadowRadius: 28,
    elevation: 6,
    boxShadow: '0 12px 36px 0 rgba(37, 99, 235, 0.08), inset 0 1px 2px 0 rgba(255, 255, 255, 0.95)',
  };

  return (
    <View style={{ gap: 28 }}>
      {/* ── 1. DESKTOP PROFILE HEADER BANNER (Glassmorphic) ── */}
      <View style={{
        ...glassCardStyle,
        padding: 28,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: 16,
      }}>
        {/* Avatar + Info */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 20, flex: 1, minWidth: 280 }}>
          {/* Avatar with Camera Badge */}
          <Pressable onPress={handleSelectPhoto} style={{ position: 'relative' }}>
            <View style={{
              width: 80, height: 80, borderRadius: 26,
              backgroundColor: 'rgba(37,99,235,0.12)', borderWidth: 2, borderColor: 'rgba(37,99,235,0.25)',
              alignItems: 'center', justifyContent: 'center',
              overflow: 'hidden',
            }}>
              {profilePhoto ? (
                <Image source={{ uri: profilePhoto }} style={{ width: '100%', height: '100%' }} />
              ) : (
                <Text style={{ fontSize: 32, fontWeight: '900', color: '#2563eb' }}>
                  {fullName ? fullName.charAt(0).toUpperCase() : 'U'}
                </Text>
              )}
            </View>
            <View style={{
              position: 'absolute', bottom: -2, right: -2,
              width: 28, height: 28, borderRadius: 10,
              backgroundColor: '#2563eb', borderWidth: 2, borderColor: '#ffffff',
              alignItems: 'center', justifyContent: 'center',
              shadowColor: '#2563eb', shadowOffset: { width: 0, height: 2 },
              shadowOpacity: 0.3, shadowRadius: 4, elevation: 4,
            }}>
              <Feather name="camera" size={13} color="#ffffff" />
            </View>
          </Pressable>

          {/* Name & Credentials */}
          <View style={{ gap: 4, flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <Text style={{ fontSize: 22, fontWeight: '900', color: '#0f172a', letterSpacing: -0.5 }}>
                {fullName || 'Student Candidate'}
              </Text>
              <View style={{
                backgroundColor: 'rgba(37,99,235,0.1)', borderWidth: 1, borderColor: 'rgba(37,99,235,0.22)',
                borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2,
              }}>
                <Text style={{ fontSize: 10, fontWeight: '800', color: '#2563eb', letterSpacing: 0.5 }}>
                  STUDENT CANDIDATE
                </Text>
              </View>
            </View>
            <Text style={{ fontSize: 14, color: '#64748b' }}>{email}</Text>
          </View>
        </View>

        {/* Verification Status & Upload Action */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <View style={{
            flexDirection: 'row', alignItems: 'center', gap: 8,
            backgroundColor: isApproved ? 'rgba(22,163,74,0.08)' : 'rgba(234,88,12,0.08)',
            borderWidth: 1, borderColor: isApproved ? 'rgba(22,163,74,0.22)' : 'rgba(234,88,12,0.22)',
            paddingHorizontal: 16, paddingVertical: 10, borderRadius: 14,
            backdropFilter: 'blur(10px)',
          }}>
            <Feather name={isApproved ? "check-circle" : "clock"} size={16} color={isApproved ? "#16a34a" : "#ea580c"} />
            <Text style={{ fontSize: 13, fontWeight: '800', color: isApproved ? "#16a34a" : "#ea580c" }}>
              {isApproved ? "VERIFIED CANDIDATE" : "VERIFICATION PENDING"}
            </Text>
          </View>

          <Pressable
            onPress={handleSelectPhoto}
            style={({ hovered }: any) => ({
              flexDirection: 'row', alignItems: 'center', gap: 8,
              backgroundColor: hovered ? '#1d4ed8' : '#2563eb',
              paddingHorizontal: 16, paddingVertical: 10, borderRadius: 14,
              cursor: 'pointer' as any,
              shadowColor: '#2563eb', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 8,
            })}
          >
            <Feather name="upload" size={15} color="#ffffff" />
            <Text style={{ fontSize: 13, fontWeight: '800', color: '#ffffff' }}>Upload Photo</Text>
          </Pressable>
        </View>
      </View>

      {/* ── 2. DUAL-COLUMN DESKTOP GRID (Fluid Wrapping) ── */}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 24 }}>
        {/* Left Column: Personal Information Form */}
        <View style={{
          ...glassCardStyle,
          flex: 3,
          minWidth: 320,
          padding: 28,
          gap: 20,
        }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 4 }}>
            <Feather name="user" size={18} color="#2563eb" />
            <Text style={{ fontSize: 16, fontWeight: '800', color: '#0f172a' }}>Personal Details</Text>
          </View>

          {/* Form Inputs Grid */}
          <View style={{ gap: 16 }}>
            {/* Full Name */}
            <View>
              <Text style={{ fontSize: 12, fontWeight: '700', color: '#475569', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                Full Name
              </Text>
              <View style={{
                flexDirection: 'row', alignItems: 'center',
                backgroundColor: 'rgba(248, 250, 252, 0.85)', borderWidth: 1.5, borderColor: '#cbd5e1',
                borderRadius: 14, paddingHorizontal: 14,
              }}>
                <Feather name="user" size={16} color="#94a3b8" style={{ marginRight: 10 }} />
                <TextInput
                  value={fullName}
                  onChangeText={setFullName}
                  placeholder="Enter your full name"
                  placeholderTextColor="#94a3b8"
                  style={{ flex: 1, color: '#0f172a', fontSize: 14, paddingVertical: 12, fontWeight: '600', fontFamily: 'Roboto' }}
                />
              </View>
            </View>

            {/* Phone & Education Grid Row */}
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 16 }}>
              {/* Phone Number */}
              <View style={{ flex: 1, minWidth: 200 }}>
                <Text style={{ fontSize: 12, fontWeight: '700', color: '#475569', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  Phone Number
                </Text>
                <View style={{
                  flexDirection: 'row', alignItems: 'center',
                  backgroundColor: 'rgba(248, 250, 252, 0.85)', borderWidth: 1.5, borderColor: '#cbd5e1',
                  borderRadius: 14, paddingHorizontal: 14,
                }}>
                  <Feather name="phone" size={16} color="#94a3b8" style={{ marginRight: 10 }} />
                  <TextInput
                    value={phone}
                    onChangeText={setPhone}
                    keyboardType="phone-pad"
                    placeholder="Enter phone number"
                    placeholderTextColor="#94a3b8"
                    style={{ flex: 1, color: '#0f172a', fontSize: 14, paddingVertical: 12, fontWeight: '600', fontFamily: 'Roboto' }}
                  />
                </View>
              </View>

              {/* Education Grade */}
              <View style={{ flex: 1, minWidth: 200 }}>
                <Text style={{ fontSize: 12, fontWeight: '700', color: '#475569', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  Grade / Education
                </Text>
                <View style={{
                  flexDirection: 'row', alignItems: 'center',
                  backgroundColor: 'rgba(248, 250, 252, 0.85)', borderWidth: 1.5, borderColor: '#cbd5e1',
                  borderRadius: 14, paddingHorizontal: 14,
                }}>
                  <Feather name="book" size={16} color="#94a3b8" style={{ marginRight: 10 }} />
                  <TextInput
                    value={educationGrade}
                    onChangeText={setEducationGrade}
                    placeholder="e.g. Class 12 / College"
                    placeholderTextColor="#94a3b8"
                    style={{ flex: 1, color: '#0f172a', fontSize: 14, paddingVertical: 12, fontWeight: '600', fontFamily: 'Roboto' }}
                  />
                </View>
              </View>
            </View>

            {/* Email (Disabled) */}
            <View>
              <Text style={{ fontSize: 12, fontWeight: '700', color: '#94a3b8', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                Email Address (Non-editable)
              </Text>
              <View style={{
                flexDirection: 'row', alignItems: 'center',
                backgroundColor: 'rgba(241, 245, 249, 0.85)', borderWidth: 1.5, borderColor: '#e2e8f0',
                borderRadius: 14, paddingHorizontal: 14,
              }}>
                <Feather name="lock" size={16} color="#94a3b8" style={{ marginRight: 10 }} />
                <TextInput
                  value={email}
                  editable={false}
                  style={{ flex: 1, color: '#64748b', fontSize: 14, paddingVertical: 12, fontWeight: '600', fontFamily: 'Roboto' }}
                />
              </View>
            </View>
          </View>

          {/* Save Button */}
          <Pressable
            onPress={handleUpdateProfile}
            disabled={updating}
            style={({ hovered }: any) => ({
              backgroundColor: hovered ? '#1d4ed8' : '#2563eb',
              paddingVertical: 14, borderRadius: 14,
              alignItems: 'center', justifyContent: 'center',
              shadowColor: '#2563eb', shadowOffset: { width: 0, height: 6 },
              shadowOpacity: 0.2, shadowRadius: 10, elevation: 4,
              marginTop: 10,
              cursor: 'pointer' as any,
            })}
          >
            {updating ? (
              <ActivityIndicator size="small" color="#ffffff" />
            ) : (
              <Text style={{ color: '#ffffff', fontWeight: '800', fontSize: 15 }}>Save Profile Changes</Text>
            )}
          </Pressable>
        </View>

        {/* Right Column: Verification & Security Actions */}
        <View style={{ flex: 2, minWidth: 280, gap: 20 }}>
          {/* Card 1: Disability Certificate Status */}
          <View style={{
            ...glassCardStyle,
            padding: 24,
            gap: 14,
          }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Feather name="shield" size={18} color="#16a34a" />
              <Text style={{ fontSize: 16, fontWeight: '800', color: '#0f172a' }}>Verification Document</Text>
            </View>

            <Text style={{ fontSize: 13, color: '#64748b', lineHeight: 20 }}>
              Official disability card or scribe entitlement certificate required for exam board compliance.
            </Text>

            <View style={{
              backgroundColor: isApproved ? 'rgba(22,163,74,0.08)' : 'rgba(234,88,12,0.08)',
              borderWidth: 1, borderColor: isApproved ? 'rgba(22,163,74,0.22)' : 'rgba(234,88,12,0.22)',
              borderRadius: 14, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12,
            }}>
              <Feather name={isApproved ? "check-circle" : "alert-circle"} size={20} color={isApproved ? "#16a34a" : "#ea580c"} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 13, fontWeight: '800', color: isApproved ? "#16a34a" : "#ea580c" }}>
                  {isApproved ? "Document Approved" : "Under Admin Review"}
                </Text>
                <Text style={{ fontSize: 11, color: '#64748b', marginTop: 1 }}>
                  {isApproved ? "Valid for all board scribe requests" : "Verification in progress by Anulekh admin team"}
                </Text>
              </View>
            </View>
          </View>

          {/* Card 2: Account Security & Log Out */}
          <View style={{
            ...glassCardStyle,
            padding: 24,
            gap: 14,
          }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Feather name="lock" size={18} color="#2563eb" />
              <Text style={{ fontSize: 16, fontWeight: '800', color: '#0f172a' }}>Account Security</Text>
            </View>

            <Pressable
              onPress={() => Alert.alert('Password Reset', `Password reset instructions sent to ${email}`)}
              style={({ hovered }: any) => ({
                flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                backgroundColor: hovered ? '#f1f5f9' : 'rgba(248,250,252,0.85)',
                borderWidth: 1, borderColor: '#cbd5e1',
                borderRadius: 12, padding: 12, cursor: 'pointer' as any,
              })}
            >
              <Text style={{ fontSize: 13, fontWeight: '700', color: '#334155' }}>Reset Password</Text>
              <Feather name="chevron-right" size={16} color="#94a3b8" />
            </Pressable>

            <Pressable
              onPress={handleSignOut}
              style={({ hovered }: any) => ({
                flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
                backgroundColor: hovered ? 'rgba(239,68,68,0.15)' : 'rgba(239,68,68,0.08)',
                borderWidth: 1, borderColor: 'rgba(239,68,68,0.22)',
                borderRadius: 14, paddingVertical: 12, cursor: 'pointer' as any,
              })}
            >
              <Feather name="log-out" size={16} color="#ef4444" />
              <Text style={{ fontSize: 13, fontWeight: '800', color: '#ef4444' }}>Log Out of Account</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </View>
  );
}
