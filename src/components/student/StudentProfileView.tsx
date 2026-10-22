/**
 * StudentProfileView - the "Profile" tab of the student console.
 *
 * Mounted by app/console/student/index.tsx. Shows a header card (avatar, name, email)
 * and a small form to edit the student's full name and phone number; email is read-only.
 *
 * Data:
 * - reads/updates the student's `profiles` row (`full_name`, `phone`) via the `supabase`
 *   shim (a custom client for the Rust/Axum backend, not real Supabase);
 * - the profile photo is stored ONLY on the device, as a base64 data URI in AsyncStorage
 *   under `profile_photo_<userId>` (the student console header reads the same key).
 *   It is never uploaded to the backend.
 */
import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, ActivityIndicator, Alert, Image } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { supabase } from '@/core/supabase';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';
import { useLanguage } from '@/core/translation';

/**
 * Student profile editor (no props; reads the current session itself).
 * Side effects: updates `profiles`, writes the photo to AsyncStorage.
 */
export default function StudentProfileView() {
  const { t } = useLanguage();
  // Loading/saving flags, the auth user, and controlled form fields.
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [profilePhoto, setProfilePhoto] = useState<string | null>(null);

  // Load the profile once on mount.
  useEffect(() => {
    fetchProfile();
  }, []);

  /**
   * Fills the form: email from the session, photo from AsyncStorage, name/phone from `profiles`.
   * Errors are only logged; the spinner is always cleared.
   */
  const fetchProfile = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      // Email comes from the auth session, not the profiles row.
      setUser(session.user);
      const rawEmail = session.user.email || '';
      const isSynthetic =
        rawEmail.toLowerCase().includes('@anulekh.app') ||
        rawEmail.toLowerCase().includes('@anulekh.internal') ||
        rawEmail.toLowerCase().startsWith('phone_') ||
        rawEmail.toLowerCase().startsWith('user_');
      setEmail(isSynthetic ? '' : rawEmail);

      // Device-local profile photo (see file header).
      const localPhoto = await AsyncStorage.getItem(`profile_photo_${session.user.id}`);
      if (localPhoto) {
        setProfilePhoto(localPhoto);
      }

      // Editable fields from the `profiles` table.
      const { data: profile, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', session.user.id)
        .single();

      if (error) throw error;

      if (profile) {
        setFullName(profile.full_name || '');
        setPhone(profile.phone || '');
      }
    } catch (error: any) {
      console.warn('Error fetching profile:', error?.message);
    } finally {
      setLoading(false);
    }
  };

  /**
   * Reads a local file/blob URI (as returned by the image picker) and converts it to a
   * base64 `data:` URI so it can be stored as a string in AsyncStorage.
   */
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

  /**
   * Asks for photo-library permission, lets the user pick and square-crop an image
   * (quality 0.6 to keep the data URI small), then shows it and saves it to AsyncStorage.
   */
  const handleSelectPhoto = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(t('permission_required'), t('photo_permission_desc'));
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
      Alert.alert(t('error'), e.message || 'Failed to select image.');
    }
  };

  /** Validates that name and phone are non-empty, then saves the trimmed values to `profiles`. */
  const handleUpdateProfile = async () => {
    // Both fields are required.
    if (!fullName.trim() || !phone.trim()) {
      Alert.alert(t('missing_fields'), t('name_phone_required'));
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
        })
        .eq('id', session.user.id);

      if (error) throw error;

      Alert.alert(t('success'), t('profile_updated_success'));
    } catch (error: any) {
      Alert.alert(t('error'), error.message || 'Failed to update profile.');
    } finally {
      setUpdating(false);
    }
  };

  // Spinner until the first profile load completes.
  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', paddingVertical: 40 }}>
        <ActivityIndicator size="large" color="#2563eb" />
      </View>
    );
  }

  return (
    <ScrollView style={{ flex: 1, paddingHorizontal: 20 }} contentContainerStyle={{ paddingBottom: 100 }} showsVerticalScrollIndicator={false}>
      {/* Profile Header Card (3-Column Layout) */}
      <View style={{
        backgroundColor: '#ffffff',
        borderRadius: 24,
        padding: 16,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        borderWidth: 1.5,
        borderColor: '#e2e8f0',
        shadowColor: '#64748b',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.12,
        shadowRadius: 16,
        elevation: 4,
        marginTop: 12,
        marginBottom: 16,
      }}>
        {/* Profile Photo Avatar (Left Corner) */}
        <TouchableOpacity onPress={handleSelectPhoto} activeOpacity={0.8}>
          <View style={{
            width: 58,
            height: 58,
            borderRadius: 20,
            backgroundColor: 'rgba(37,99,235,0.09)',
            borderWidth: 2,
            borderColor: 'rgba(37,99,235,0.2)',
            alignItems: 'center',
            justifyContent: 'center',
            overflow: 'hidden',
          }}>
            {/* Saved photo, or the first letter of the name as a fallback avatar. */}
            {profilePhoto ? (
              <Image source={{ uri: profilePhoto }} style={{ width: '100%', height: '100%' }} />
            ) : (
              <Text style={{ fontSize: 24, fontWeight: '900', color: '#2563eb' }}>
                {fullName ? fullName.charAt(0).toUpperCase() : 'U'}
              </Text>
            )}
          </View>
        </TouchableOpacity>

        {/* User Info (In Between / Middle) */}
        <View style={{ flex: 1, marginLeft: 16, marginRight: 12, justifyContent: 'center' }}>
          <Text style={{ fontSize: 17, fontWeight: '900', color: '#0f172a', letterSpacing: -0.3 }} numberOfLines={1}>
            {fullName || t('candidate_student')}
          </Text>
          <Text style={{ fontSize: 11.5, fontWeight: '500', color: '#64748b', marginTop: 4 }} numberOfLines={1}>
            {email}
          </Text>
        </View>

        {/* Upload Photo Button (Right Corner) */}
        <TouchableOpacity 
          onPress={handleSelectPhoto}
          activeOpacity={0.8}
          style={{
            backgroundColor: 'rgba(37,99,235,0.08)',
            borderWidth: 1,
            borderColor: 'rgba(37,99,235,0.2)',
            paddingHorizontal: 11,
            paddingVertical: 8,
            borderRadius: 12,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Feather name="camera" size={14} color="#2563eb" style={{ marginBottom: 2 }} />
          <Text style={{ fontSize: 8.5, fontWeight: '800', color: '#2563eb', textTransform: 'uppercase', letterSpacing: 0.5 }}>
            {t('upload')}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Editable Account Information Card */}
      <View style={{ backgroundColor: '#ffffff', borderRadius: 24, padding: 20, borderWidth: 1.5, borderColor: '#e2e8f0', shadowColor: '#64748b', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.12, shadowRadius: 16, elevation: 4, marginBottom: 16 }}>
        <Text style={{ fontSize: 12, fontWeight: '800', color: '#64748b', textTransform: 'uppercase', marginBottom: 14, letterSpacing: 0.5 }}>{t('basic_information')}</Text>
        
        <View style={{ gap: 14 }}>
          <View>
            <Text style={{ fontSize: 11, fontWeight: '700', color: '#475569', marginBottom: 6 }}>{t('full_name')}</Text>
            <TextInput
              value={fullName}
              onChangeText={setFullName}
              placeholder={t('full_name')}
              placeholderTextColor="#94a3b8"
              style={{ backgroundColor: '#f8fafc', borderWidth: 1.5, borderColor: '#e2e8f0', borderRadius: 14, paddingHorizontal: 14, paddingVertical: 10, fontSize: 13, color: '#0f172a', fontWeight: '600' }}
            />
          </View>

          <View>
            <Text style={{ fontSize: 11, fontWeight: '700', color: '#475569', marginBottom: 6 }}>{t('phone_number')}</Text>
            <TextInput
              value={phone}
              onChangeText={setPhone}
              keyboardType="phone-pad"
              placeholder={t('phone_number')}
              placeholderTextColor="#94a3b8"
              style={{ backgroundColor: '#f8fafc', borderWidth: 1.5, borderColor: '#e2e8f0', borderRadius: 14, paddingHorizontal: 14, paddingVertical: 10, fontSize: 13, color: '#0f172a', fontWeight: '600' }}
            />
          </View>

          <View>
            <Text style={{ fontSize: 11, fontWeight: '700', color: '#94a3b8', marginBottom: 6 }}>{t('email_non_editable')}</Text>
            <TextInput
              value={email}
              placeholder="Not provided"
              placeholderTextColor="#94a3b8"
              editable={false}
              style={{ backgroundColor: '#f1f5f9', borderWidth: 1.5, borderColor: '#e2e8f0', borderRadius: 14, paddingHorizontal: 14, paddingVertical: 10, fontSize: 13, color: email ? '#0f172a' : '#94a3b8', fontWeight: '600' }}
            />
          </View>
        </View>

        {/* Save button: shows a spinner and is disabled while the update is in flight. */}
        <TouchableOpacity
          onPress={handleUpdateProfile}
          disabled={updating}
          style={{ backgroundColor: '#2563eb', paddingVertical: 14, borderRadius: 16, alignItems: 'center', justifyContent: 'center', shadowColor: '#2563eb', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.18, shadowRadius: 12, elevation: 4, marginTop: 18 }}
        >
          {updating ? (
            <ActivityIndicator size="small" color="#ffffff" />
          ) : (
            <Text style={{ color: '#ffffff', fontWeight: '800', fontSize: 14 }}>{t('save_changes')}</Text>
          )}
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}
