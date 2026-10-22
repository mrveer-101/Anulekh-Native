/**
 * ScribeProfileView - the volunteer scribe's "My Account" / profile tab.
 *
 * Mounted (inside a TabPane) by the desktop shell components/pc_view/ConsoleScribePC.tsx
 * for the 'profile' tab. The mobile scribe console (app/console/scribe/index.tsx) does
 * not render it.
 *
 * What it shows / does:
 * - header card with avatar (device-local photo), name and email;
 * - "Basic Information" form (name, phone, read-only email) with a "Details" toggle that
 *   reveals DOB, gender, city, education, occupation, Aadhaar number and the names of the
 *   verification documents (their "View" buttons only show a placeholder alert);
 * - multi-select of exam languages the scribe can write in (English / Hindi / Gujarati);
 * - an achievements card whose badges are a hard-coded demo list, not real data;
 * - app display-language picker (useLanguage / changeLanguage);
 * - Save Changes and Log Out buttons.
 *
 * Data (via the `supabase` shim, a custom client for the Rust/Axum backend):
 * - reads and updates the scribe's `profiles` row;
 * - the profile photo lives only in AsyncStorage under `profile_photo_<userId>`.
 */
import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, ActivityIndicator, Alert, Image } from 'react-native';
import { Feather, Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { supabase } from '@/core/supabase';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useLanguage, LanguageType } from '@/core/translation';
import * as ImagePicker from 'expo-image-picker';
import { fileLabel } from '@/services/storageService';

/** Exam languages a scribe can offer; saved as an array in `profiles.languages`. */
const EXAM_LANGUAGES = ['English', 'Hindi', 'Gujarati'];

/**
 * Scribe profile editor (no props; reads the current session itself).
 * Side effects: updates `profiles`, writes the photo to AsyncStorage, can change the
 * app language, and can sign out (navigating to /landing).
 */
export default function ScribeProfileView() {
  const { lang, changeLanguage, t } = useLanguage();
  // Auth user and the basic, always-visible form fields.
  const [user, setUser] = useState<any>(null);
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [selectedLanguages, setSelectedLanguages] = useState<string[]>([]);
  const [profilePhoto, setProfilePhoto] = useState<string | null>(null);
  
  // Expanded Detail fields
  const [isExpanded, setIsExpanded] = useState(false);
  const [dob, setDob] = useState('');
  const [gender, setGender] = useState('male');
  const [location, setLocation] = useState('');
  const [occupation, setOccupation] = useState('');
  const [educationLevel, setEducationLevel] = useState('');
  const [aadharNumber, setAadharNumber] = useState('');
  const [certificationProof, setCertificationProof] = useState('');
  const [aadharImageProof, setAadharImageProof] = useState('');

  // Load / save spinners and the app-language dropdown toggle.
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [isLangDropdownOpen, setIsLangDropdownOpen] = useState(false);

  /** Converts a picked image's local URI into a base64 `data:` URI so it can be stored in AsyncStorage. */
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
   * Requests photo-library permission, lets the scribe pick a square-cropped image
   * (quality 0.5), shows it immediately and saves it on the device only.
   */
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
        quality: 0.5,
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

  // Load the profile once on mount.
  useEffect(() => {
    fetchProfile();
  }, []);

  /**
   * Fills the form from the session (email), AsyncStorage (photo) and the `profiles` row.
   * Errors are only logged; the spinner is always cleared.
   */
  const fetchProfile = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      setUser(session.user);
      const rawEmail = session.user.email || '';
      const isSynthetic =
        rawEmail.toLowerCase().includes('@anulekh.app') ||
        rawEmail.toLowerCase().includes('@anulekh.internal') ||
        rawEmail.toLowerCase().startsWith('phone_') ||
        rawEmail.toLowerCase().startsWith('user_');
      setEmail(isSynthetic ? '' : rawEmail);

      // Device-local profile photo (never uploaded).
      const localPhoto = await AsyncStorage.getItem(`profile_photo_${session.user.id}`);
      if (localPhoto) {
        setProfilePhoto(localPhoto);
      }

      const { data: profile, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', session.user.id)
        .single();

      if (error) throw error;

      if (profile) {
        setFullName(profile.full_name || '');
        setPhone(profile.phone || '');
        setSelectedLanguages(profile.languages || []);
        
        // Populate extra details
        // NOTE: empty columns fall back to hard-coded sample values (including a sample
        // Aadhaar number); handleUpdateProfile will then save those samples back to `profiles`.
        setDob(profile.dob || '2005-02-03');
        setLocation(profile.location || 'Ahmedabad, Gujarat');
        setOccupation(profile.occupation || 'Working Professional');
        setEducationLevel(profile.education_level || 'Undergraduate - Completed');
        setAadharNumber(profile.aadhar_number || '8102917340');
        setCertificationProof(profile.certification_proof || 'educational_certificate.pdf');
        setAadharImageProof(profile.aadhar_image_proof || 'government_id_proof.jpg');
      }
    } catch (err: any) {
      console.error('Error fetching profile:', err.message);
    } finally {
      setLoading(false);
    }
  };

  /** Adds or removes one exam language from the selection (saved only on "Save Changes"). */
  const toggleLanguage = (langName: string) => {
    if (selectedLanguages.includes(langName)) {
      setSelectedLanguages(selectedLanguages.filter((l) => l !== langName));
    } else {
      setSelectedLanguages([...selectedLanguages, langName]);
    }
  };

  /**
   * Validates and saves the form to the scribe's `profiles` row.
   * Gender and the document file names are shown but not saved.
   */
  const handleUpdateProfile = async () => {
    // Validation: name and phone required, plus at least one exam language.
    if (!fullName.trim() || !phone.trim()) {
      Alert.alert(t('error'), t('enter_name') + ' & ' + t('enter_phone'));
      return;
    }

    if (selectedLanguages.length === 0) {
      Alert.alert('Selection Required', 'Please select at least one scribe language.');
      return;
    }

    setUpdating(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          full_name: fullName.trim(),
          phone: phone.trim(),
          languages: selectedLanguages,
          dob: dob.trim(),
          location: location.trim(),
          occupation: occupation.trim(),
          education_level: educationLevel.trim(),
          aadhar_number: aadharNumber.trim(),
        })
        .eq('id', user.id);

      if (error) throw error;
      Alert.alert(t('success'), t('save_success_desc'));
    } catch (err: any) {
      Alert.alert(t('error'), err.message || 'Failed to update profile.');
    } finally {
      setUpdating(false);
    }
  };

  /**
   * Confirms, then clears the one-time welcome-toast flags, signs out and goes to /landing.
   * On web the global Alert polyfill (app/_layout.tsx) auto-confirms this dialog.
   */
  const handleSignOut = () => {
    Alert.alert('Sign Out', 'Are you sure you want to log out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out', style: 'destructive',
        onPress: async () => {
          await AsyncStorage.removeItem('welcome_toast_shown');
          await AsyncStorage.removeItem('scribe_welcome_shown');
          await supabase.auth.signOut();
          router.replace('/landing');
        }
      }
    ]);
  };

  // Spinner until the first profile load completes.
  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', paddingVertical: 40, backgroundColor: '#f8fafc' }}>
        <ActivityIndicator size="large" color="#16a34a" />
      </View>
    );
  }

  return (
    <ScrollView style={{ flex: 1, paddingHorizontal: 20, backgroundColor: '#f8fafc' }} contentContainerStyle={{ paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
      
      {/* Profile Header Card */}
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
            backgroundColor: 'rgba(22,163,74,0.09)',
            borderWidth: 2,
            borderColor: 'rgba(22,163,74,0.2)',
            alignItems: 'center',
            justifyContent: 'center',
            overflow: 'hidden',
          }}>
            {/* Saved photo, or the first letter of the name as a fallback avatar. */}
            {profilePhoto ? (
              <Image source={{ uri: profilePhoto }} style={{ width: '100%', height: '100%' }} />
            ) : (
              <Text style={{ fontSize: 24, fontWeight: '900', color: '#16a34a' }}>
                {fullName ? fullName.charAt(0).toUpperCase() : 'S'}
              </Text>
            )}
          </View>
        </TouchableOpacity>

        {/* User Info (In Between / Middle) */}
        <View style={{ flex: 1, marginLeft: 16, marginRight: 12, justifyContent: 'center' }}>
          <Text style={{ fontSize: 17, fontWeight: '900', color: '#0f172a', letterSpacing: -0.3 }} numberOfLines={1}>
            {fullName || 'Volunteer'}
          </Text>
        </View>

        {/* Upload Photo Button (Right Corner) */}
        <TouchableOpacity 
          onPress={handleSelectPhoto}
          activeOpacity={0.8}
          style={{
            backgroundColor: 'rgba(22,163,74,0.08)',
            borderWidth: 1,
            borderColor: 'rgba(22,163,74,0.2)',
            paddingHorizontal: 11,
            paddingVertical: 8,
            borderRadius: 12,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Feather name="camera" size={14} color="#16a34a" style={{ marginBottom: 2 }} />
          <Text style={{ fontSize: 8.5, fontWeight: '800', color: '#16a34a', textTransform: 'uppercase', letterSpacing: 0.5 }}>
            {t('upload')}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Editable Account Information Card */}
      <View style={{ backgroundColor: '#ffffff', borderRadius: 24, padding: 20, borderWidth: 1.5, borderColor: '#e2e8f0', shadowColor: '#64748b', shadowOffset: { width: 0, height: 12 }, shadowOpacity: 0.18, shadowRadius: 24, elevation: 6, marginBottom: 16 }}>

        {/* Card title with the "Details" / "Collapse" toggle for the extra fields. */}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <Text style={{ fontSize: 12, fontWeight: '800', color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5 }}>{t('basic_information')}</Text>
          <TouchableOpacity onPress={() => setIsExpanded(!isExpanded)}>
            <Text style={{ fontSize: 12, fontWeight: '700', color: '#2563eb' }}>
              {isExpanded ? t('collapse') : t('details')}
            </Text>
          </TouchableOpacity>
        </View>
        
        <View style={{ gap: 14 }}>
          {/* Full Name */}
          <View>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
              <Feather name="user" size={12} color="#16a34a" style={{ marginRight: 6 }} />
              <Text style={{ fontSize: 11, fontWeight: '700', color: '#475569' }}>{t('full_name')}</Text>
            </View>
            <TextInput
              value={fullName}
              onChangeText={setFullName}
              placeholder={t('your_name')}
              placeholderTextColor="#94a3b8"
              style={{ backgroundColor: '#f8fafc', borderWidth: 1.5, borderColor: '#e2e8f0', borderRadius: 14, paddingHorizontal: 14, paddingVertical: 10, fontSize: 13, color: '#0f172a', fontWeight: '600' }}
            />
          </View>

          {/* Phone Number */}
          <View>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
              <Feather name="phone" size={12} color="#16a34a" style={{ marginRight: 6 }} />
              <Text style={{ fontSize: 11, fontWeight: '700', color: '#475569' }}>{t('mobile_number')}</Text>
            </View>
            <TextInput
              value={phone}
              onChangeText={setPhone}
              keyboardType="phone-pad"
              placeholder={t('mobile_number')}
              placeholderTextColor="#94a3b8"
              style={{ backgroundColor: '#f8fafc', borderWidth: 1.5, borderColor: '#e2e8f0', borderRadius: 14, paddingHorizontal: 14, paddingVertical: 10, fontSize: 13, color: '#0f172a', fontWeight: '600' }}
            />
          </View>

          {/* Email Address */}
          <View>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
              <Feather name="mail" size={12} color="#94a3b8" style={{ marginRight: 6 }} />
              <Text style={{ fontSize: 11, fontWeight: '700', color: '#94a3b8' }}>{t('email_address_readonly')}</Text>
            </View>
            <TextInput
              value={email}
              placeholder="Not provided"
              placeholderTextColor="#94a3b8"
              editable={false}
              style={{ backgroundColor: '#f1f5f9', borderWidth: 1.5, borderColor: '#e2e8f0', borderRadius: 14, paddingHorizontal: 14, paddingVertical: 10, fontSize: 13, color: email ? '#0f172a' : '#94a3b8', fontWeight: '600' }}
            />
          </View>

          {/* Expanded Fields */}
          {isExpanded && (
            <View style={{ gap: 14, paddingTop: 6, borderTopWidth: 1, borderTopColor: '#f1f5f9', marginTop: 6 }}>
              
              {/* Date of Birth */}
              <View>
                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
                  <Feather name="calendar" size={12} color="#16a34a" style={{ marginRight: 6 }} />
                  <Text style={{ fontSize: 11, fontWeight: '700', color: '#475569' }}>{t('dob')}</Text>
                </View>
                <TextInput
                  value={dob}
                  onChangeText={setDob}
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor="#94a3b8"
                  style={{ backgroundColor: '#f8fafc', borderWidth: 1.5, borderColor: '#e2e8f0', borderRadius: 14, paddingHorizontal: 14, paddingVertical: 10, fontSize: 13, color: '#0f172a', fontWeight: '600' }}
                />
              </View>

              {/* Gender */}
              <View>
                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
                  <Ionicons name="transgender-outline" size={12} color="#16a34a" style={{ marginRight: 6 }} />
                  <Text style={{ fontSize: 11, fontWeight: '700', color: '#475569' }}>{t('gender')}</Text>
                </View>
                <TextInput
                  value={gender}
                  onChangeText={setGender}
                  placeholder={t('gender')}
                  placeholderTextColor="#94a3b8"
                  style={{ backgroundColor: '#f8fafc', borderWidth: 1.5, borderColor: '#e2e8f0', borderRadius: 14, paddingHorizontal: 14, paddingVertical: 10, fontSize: 13, color: '#0f172a', fontWeight: '600' }}
                />
              </View>

              {/* City / Location */}
              <View>
                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
                  <Feather name="map-pin" size={12} color="#16a34a" style={{ marginRight: 6 }} />
                  <Text style={{ fontSize: 11, fontWeight: '700', color: '#475569' }}>{t('city_state')}</Text>
                </View>
                <TextInput
                  value={location}
                  onChangeText={setLocation}
                  placeholder={t('city_state')}
                  placeholderTextColor="#94a3b8"
                  style={{ backgroundColor: '#f8fafc', borderWidth: 1.5, borderColor: '#e2e8f0', borderRadius: 14, paddingHorizontal: 14, paddingVertical: 10, fontSize: 13, color: '#0f172a', fontWeight: '600' }}
                />
              </View>

              {/* Highest Qualification Level */}
              <View>
                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
                  <Feather name="book-open" size={12} color="#16a34a" style={{ marginRight: 6 }} />
                  <Text style={{ fontSize: 11, fontWeight: '700', color: '#475569' }}>{t('highest_qualification')}</Text>
                </View>
                <TextInput
                  value={educationLevel}
                  onChangeText={setEducationLevel}
                  placeholder={t('highest_qualification')}
                  placeholderTextColor="#94a3b8"
                  style={{ backgroundColor: '#f8fafc', borderWidth: 1.5, borderColor: '#e2e8f0', borderRadius: 14, paddingHorizontal: 14, paddingVertical: 10, fontSize: 13, color: '#0f172a', fontWeight: '600' }}
                />
              </View>

              {/* Current Status / Occupation */}
              <View>
                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
                  <Feather name="briefcase" size={12} color="#16a34a" style={{ marginRight: 6 }} />
                  <Text style={{ fontSize: 11, fontWeight: '700', color: '#475569' }}>{t('current_status_occupation')}</Text>
                </View>
                <TextInput
                  value={occupation}
                  onChangeText={setOccupation}
                  placeholder={t('current_status_occupation')}
                  placeholderTextColor="#94a3b8"
                  style={{ backgroundColor: '#f8fafc', borderWidth: 1.5, borderColor: '#e2e8f0', borderRadius: 14, paddingHorizontal: 14, paddingVertical: 10, fontSize: 13, color: '#0f172a', fontWeight: '600' }}
                />
              </View>

              {/* Government ID / Aadhar Number */}
              <View>
                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
                  <Feather name="shield" size={12} color="#16a34a" style={{ marginRight: 6 }} />
                  <Text style={{ fontSize: 11, fontWeight: '700', color: '#475569' }}>{t('aadhar_gov_id')}</Text>
                </View>
                <TextInput
                  value={aadharNumber}
                  onChangeText={setAadharNumber}
                  placeholder={t('aadhar_gov_id')}
                  placeholderTextColor="#94a3b8"
                  style={{ backgroundColor: '#f8fafc', borderWidth: 1.5, borderColor: '#e2e8f0', borderRadius: 14, paddingHorizontal: 14, paddingVertical: 10, fontSize: 13, color: '#0f172a', fontWeight: '600' }}
                />
              </View>

              {/* Verification Proof Documents (Read Only Row style) */}
              <View style={{ borderTopWidth: 1.5, borderTopColor: '#f8fafc', paddingTop: 10, gap: 10 }}>
                <Text style={{ fontSize: 11, fontWeight: '800', color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 }}>{t('verification_documents')}</Text>

                {/* Government ID Document Row */}
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#f8fafc', padding: 12, borderRadius: 14, borderWidth: 1, borderColor: '#e2e8f0' }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, marginRight: 8 }}>
                    <Feather name="file-text" size={16} color="#16a34a" style={{ marginRight: 8 }} />
                    <Text style={{ fontSize: 12, fontWeight: '700', color: '#475569' }} numberOfLines={1}>
                      {fileLabel(aadharImageProof || 'government_id_proof.jpg')}
                    </Text>
                  </View>
                  <TouchableOpacity onPress={() => Alert.alert('Preview', 'Simulated document viewer opening.')} style={{ backgroundColor: '#16a34a', paddingHorizontal: 12, paddingVertical: 5, borderRadius: 8 }}>
                    <Text style={{ fontSize: 11, fontWeight: '700', color: '#ffffff' }}>{t('view')}</Text>
                  </TouchableOpacity>
                </View>

                {/* Educational Certificate Row */}
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#f8fafc', padding: 12, borderRadius: 14, borderWidth: 1, borderColor: '#e2e8f0' }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, marginRight: 8 }}>
                    <Feather name="file-text" size={16} color="#16a34a" style={{ marginRight: 8 }} />
                    <Text style={{ fontSize: 12, fontWeight: '700', color: '#475569' }} numberOfLines={1}>
                      {fileLabel(certificationProof || 'educational_certificate.pdf')}
                    </Text>
                  </View>
                  <TouchableOpacity onPress={() => Alert.alert('Preview', 'Simulated document viewer opening.')} style={{ backgroundColor: '#16a34a', paddingHorizontal: 12, paddingVertical: 5, borderRadius: 8 }}>
                    <Text style={{ fontSize: 11, fontWeight: '700', color: '#ffffff' }}>{t('view')}</Text>
                  </TouchableOpacity>
                </View>
              </View>

            </View>
          )}

        </View>
      </View>

      {/* Scribe Preferences Card */}
      <View style={{ backgroundColor: '#ffffff', borderRadius: 24, padding: 20, borderWidth: 1.5, borderColor: '#e2e8f0', shadowColor: '#64748b', shadowOffset: { width: 0, height: 12 }, shadowOpacity: 0.18, shadowRadius: 24, elevation: 6, marginBottom: 16 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
          <Feather name="globe" size={13} color="#16a34a" style={{ marginRight: 6 }} />
          <Text style={{ fontSize: 12, fontWeight: '800', color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5 }}>{t('preferred_scribe_languages')}</Text>
        </View>
        <Text style={{ fontSize: 10, color: '#94a3b8', marginBottom: 10 }}>{t('select_comfortable_languages')}</Text>
        
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {/* Toggleable language chips; a check mark shows the selected ones. */}
          {EXAM_LANGUAGES.map((langName) => {
            const isSelected = selectedLanguages.includes(langName);
            return (
              <TouchableOpacity
                key={langName}
                onPress={() => toggleLanguage(langName)}
                style={{
                  paddingHorizontal: 16, paddingVertical: 8, borderRadius: 12, borderWidth: 1.5,
                  flexDirection: 'row', alignItems: 'center', gap: 6,
                  backgroundColor: isSelected ? 'rgba(22,163,74,0.08)' : '#f8fafc',
                  borderColor: isSelected ? '#16a34a' : '#e2e8f0',
                }}
              >
                <Text style={{ fontSize: 12, fontWeight: '700', color: isSelected ? '#16a34a' : '#475569' }}>
                  {langName}
                </Text>
                {isSelected && <Feather name="check" size={12} color="#16a34a" />}
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* 🏆 Coursera-Style Achievements & Badges Card */}
      <View style={{ backgroundColor: '#ffffff', borderRadius: 24, padding: 20, borderWidth: 1.5, borderColor: '#e2e8f0', shadowColor: '#64748b', shadowOffset: { width: 0, height: 12 }, shadowOpacity: 0.18, shadowRadius: 24, elevation: 6, marginBottom: 20 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Ionicons name="trophy" size={16} color="#eab308" />
            <Text style={{ fontSize: 13, fontWeight: '900', color: '#0f172a' }}>{t('achievements_badges')}</Text>
          </View>
          {/* "View Certificate": shows an alert with a certificate id derived from the user id and the backend's /api/certificates/view/<userId> link. */}
          <TouchableOpacity
            onPress={() => {
              if (user) {
                const apiHost = process.env.EXPO_PUBLIC_API_URL || 'https://anulekh-axum.onrender.com';
                Alert.alert("Verified Certificate", `Certificate ID: ANULEKH-CERT-${user.id.substring(0,8).toUpperCase()}-2026\n\nAccess online at:\n${apiHost}/api/certificates/view/${user.id}`);
              }
            }}
            style={{ backgroundColor: 'rgba(37,99,235,0.08)', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10, borderWidth: 1, borderColor: 'rgba(37,99,235,0.2)' }}
          >
            <Text style={{ fontSize: 11, fontWeight: '800', color: '#2563eb' }}>{t('view_certificate')}</Text>
          </TouchableOpacity>
        </View>

        <Text style={{ fontSize: 11, color: '#64748b', marginBottom: 14 }}>
          {t('earn_milestone_badges_desc')}
        </Text>

        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
          {/* Static demo badge list */}
          {[
            { title: 'Bronze Volunteer', icon: 'award', color: '#cd7f32', unlocked: true, desc: '5 Jobs' },
            { title: 'Silver Volunteer', icon: 'shield-checkmark', color: '#94a3b8', unlocked: false, desc: '15 Jobs' },
            { title: 'Gold Scribe', icon: 'star', color: '#eab308', unlocked: false, desc: '30 Jobs' },
            { title: 'Emergency Hero', icon: 'flash', color: '#ef4444', unlocked: true, desc: 'SOS Hero' },
            { title: 'Assignment Ally', icon: 'document-text', color: '#6366f1', unlocked: true, desc: '1 Assignment' },
            { title: 'Submission Hero', icon: 'checkmark-done-circle', color: '#10b981', unlocked: true, desc: '5 Assignments' },
          ].map((b, idx) => (
            <View key={idx} style={{
              width: '48%',
              backgroundColor: b.unlocked ? 'rgba(248,250,252,1)' : 'rgba(241,245,249,0.5)',
              borderWidth: 1.5,
              borderColor: b.unlocked ? b.color : '#e2e8f0',
              borderRadius: 16,
              padding: 10,
              opacity: b.unlocked ? 1 : 0.6,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 8,
            }}>
              <View style={{
                width: 30, height: 30, borderRadius: 10,
                backgroundColor: b.unlocked ? `${b.color}20` : '#e2e8f0',
                alignItems: 'center', justifyContent: 'center',
              }}>
                <Ionicons name={b.icon as any} size={15} color={b.unlocked ? b.color : '#94a3b8'} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 10.5, fontWeight: '800', color: b.unlocked ? '#0f172a' : '#94a3b8' }} numberOfLines={1}>
                  {b.title}
                </Text>
                <Text style={{ fontSize: 9, fontWeight: '600', color: '#64748b' }}>
                  {b.unlocked ? 'Unlocked ✓' : b.desc}
                </Text>
              </View>
            </View>
          ))}
        </View>
      </View>

      {/* App Settings Card (Language Toggle Display) */}
      <View style={{ backgroundColor: '#ffffff', borderRadius: 24, padding: 20, borderWidth: 1.5, borderColor: '#e2e8f0', shadowColor: '#64748b', shadowOffset: { width: 0, height: 12 }, shadowOpacity: 0.18, shadowRadius: 24, elevation: 6, marginBottom: 20 }}>
        <Text style={{ fontSize: 12, fontWeight: '800', color: '#64748b', textTransform: 'uppercase', marginBottom: 10, letterSpacing: 0.5 }}>{t('language_display')}</Text>
        <Text style={{ fontSize: 10, color: '#64748b', marginBottom: 12 }}>{t('select_language_desc')}</Text>
        
        <TouchableOpacity 
          onPress={() => setIsLangDropdownOpen(!isLangDropdownOpen)}
          style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#f8fafc', borderWidth: 1.5, borderColor: '#e2e8f0', borderRadius: 14, paddingHorizontal: 14, paddingVertical: 10 }}
        >
          <Text style={{ fontSize: 13, fontWeight: '700', color: '#334155' }}>{lang}</Text>
          <Feather name={isLangDropdownOpen ? "chevron-up" : "chevron-down"} size={16} color="#64748b" />
        </TouchableOpacity>

        {/* Language options */}
        {isLangDropdownOpen && (
          <View style={{ marginTop: 6, backgroundColor: '#ffffff', borderWidth: 1.5, borderColor: '#f1f5f9', borderRadius: 14, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 5, elevation: 2, overflow: 'hidden' }}>
            {(['English', 'Hindi', 'Gujarati'] as LanguageType[]).map((l) => (
              <TouchableOpacity
                key={l}
                onPress={async () => {
                  await changeLanguage(l);
                  setIsLangDropdownOpen(false);
                }}
                style={{ paddingVertical: 12, paddingHorizontal: 14, borderBottomWidth: 1, borderBottomColor: '#f8fafc', backgroundColor: lang === l ? 'rgba(22,163,74,0.06)' : '#ffffff' }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Text style={{ fontSize: 13, fontWeight: '700', color: lang === l ? '#16a34a' : '#334155' }}>
                    {l}
                  </Text>
                  {lang === l && <Feather name="check" size={14} color="#16a34a" />}
                </View>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </View>

      {/* Primary Action Button (Save changes) */}
      <TouchableOpacity
        onPress={handleUpdateProfile}
        disabled={updating}
        style={{ backgroundColor: '#16a34a', paddingVertical: 14, borderRadius: 16, alignItems: 'center', justifyContent: 'center', shadowColor: '#16a34a', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.18, shadowRadius: 12, elevation: 4, marginBottom: 12 }}
      >
        {updating ? (
          <ActivityIndicator size="small" color="#ffffff" />
        ) : (
          <Text style={{ color: '#ffffff', fontWeight: '800', fontSize: 14 }}>{t('save_changes')}</Text>
        )}
      </TouchableOpacity>

      {/* Secondary Action Button (Log Out) */}
      <TouchableOpacity
        onPress={handleSignOut}
        style={{ 
          width: '100%', 
          backgroundColor: '#dc2626', 
          paddingVertical: 15, 
          borderRadius: 16, 
          alignItems: 'center', 
          justifyContent: 'center', 
          flexDirection: 'row',
          shadowColor: '#dc2626',
          shadowOffset: { width: 0, height: 6 },
          shadowOpacity: 0.25,
          shadowRadius: 12,
          elevation: 4,
          marginBottom: 10
        }}
        activeOpacity={0.85}
      >
        <Feather name="log-out" size={16} color="#ffffff" style={{ marginRight: 8 }} />
        <Text style={{ color: '#ffffff', fontWeight: '900', fontSize: 14, letterSpacing: 0.3 }}>{t('sign_out')}</Text>
      </TouchableOpacity>

    </ScrollView>
  );
}
