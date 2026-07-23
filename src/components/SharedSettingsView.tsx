import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, ActivityIndicator, Alert, Image } from 'react-native';
import { Feather, Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { supabase } from '../app/core/supabase';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useLanguage, LanguageType } from '../app/core/translation';
import * as ImagePicker from 'expo-image-picker';

export default function SharedSettingsView() {
  const { lang, changeLanguage, t } = useLanguage();
  const [user, setUser] = useState<any>(null);
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
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

  // Scribe Specific Settings states
  const [role, setRole] = useState<'student' | 'scribe' | ''>('');
  const [firstTime, setFirstTime] = useState(false);
  const [selectedLanguages, setSelectedLanguages] = useState<string[]>([]);
  const [availabilitySlots, setAvailabilitySlots] = useState<string[]>([]);

  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [isLangDropdownOpen, setIsLangDropdownOpen] = useState(false);

  useEffect(() => {
    fetchUserData();
  }, []);

  const fetchUserData = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.replace('/auth/login');
        return;
      }
      setUser(session.user);
      setEmail(session.user.email || '');

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
        setRole(profile.role || '');
        
        // Populate extra details
        setDob(profile.dob || '2005-02-03');
        setLocation(profile.location || 'Ahmedabad, Gujarat');
        setOccupation(profile.occupation || 'Working Professional');
        setEducationLevel(profile.education_level || 'Undergraduate - Completed');
        setAadharNumber(profile.aadhar_number || '8102917340');
        setCertificationProof(profile.certification_proof || 'educational_certificate.pdf');
        setAadharImageProof(profile.aadhar_image_proof || 'government_id_proof.jpg');

        // Scribe specific fields
        setFirstTime(profile.first_time === 'yes');
        try {
          const parsedLangs = typeof profile.languages === 'string' ? JSON.parse(profile.languages) : (profile.languages || []);
          setSelectedLanguages(Array.isArray(parsedLangs) ? parsedLangs : []);
        } catch (_) {
          setSelectedLanguages(typeof profile.languages === 'string' ? [profile.languages] : []);
        }
        const slotsStr = profile.availability_slots || '';
        setAvailabilitySlots(slotsStr.split(',').map((s: string) => s.trim()).filter(Boolean));
      }
    } catch (error) {
      console.error('Error fetching user data in Settings:', error);
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

  const handleSaveSettings = async () => {
    if (!fullName.trim() || !phone.trim()) {
      Alert.alert(t('error'), t('enter_name') + ' & ' + t('enter_phone'));
      return;
    }

    setUpdating(true);
    try {
      const updateData: any = {
        full_name: fullName.trim(),
        phone: phone.trim(),
        dob: dob.trim(),
        location: location.trim(),
        occupation: occupation.trim(),
        education_level: educationLevel.trim(),
        aadhar_number: aadharNumber.trim(),
      };
      
      if (role === 'scribe') {
        updateData.first_time = firstTime ? 'yes' : 'no';
        updateData.languages = JSON.stringify(selectedLanguages);
        updateData.availability_slots = availabilitySlots.join(', ');
      }

      const { error } = await supabase
        .from('profiles')
        .update(updateData)
        .eq('id', user.id);

      if (error) throw error;
      Alert.alert(t('success'), t('save_success_desc'));
    } catch (error: any) {
      Alert.alert(t('error'), error.message || 'Error updating profile.');
    } finally {
      setUpdating(false);
    }
  };

  const handleSignOut = () => {
    Alert.alert('Sign Out', 'Are you sure you want to log out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out',
        style: 'destructive',
        onPress: async () => {
          await AsyncStorage.removeItem('welcome_toast_shown');
          await AsyncStorage.removeItem('scribe_welcome_shown');
          await supabase.auth.signOut();
          router.replace('/landing');
        }
      }
    ]);
  };

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', paddingVertical: 40, backgroundColor: '#f0f4ff' }}>
        <ActivityIndicator size="large" color="#2563eb" />
      </View>
    );
  }

  return (
    <ScrollView style={{ flex: 1, paddingHorizontal: 20 }} contentContainerStyle={{ paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
      
      {/* Profile Header Card */}
      <View style={{
        backgroundColor: '#f8fafc',
        borderRadius: 24,
        padding: 16,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        borderWidth: 1,
        borderColor: '#e2e8f0',
        shadowColor: '#64748b',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.08,
        shadowRadius: 12,
        elevation: 3,
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
            {fullName || 'User'}
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
            Upload
          </Text>
        </TouchableOpacity>
      </View>

      {/* Editable Account Information Card */}
      <View style={{ backgroundColor: '#f8fafc', borderRadius: 24, padding: 20, borderWidth: 1, borderColor: '#e2e8f0', shadowColor: '#64748b', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.08, shadowRadius: 12, elevation: 3, marginBottom: 16 }}>
        
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <Text style={{ fontSize: 12, fontWeight: '800', color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5 }}>Basic Information</Text>
          <TouchableOpacity onPress={() => setIsExpanded(!isExpanded)}>
            <Text style={{ fontSize: 12, fontWeight: '700', color: '#2563eb' }}>
              {isExpanded ? 'Collapse' : 'Details'}
            </Text>
          </TouchableOpacity>
        </View>
        
        <View style={{ gap: 14 }}>
          {/* Full Name */}
          <View>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
              <Feather name="user" size={12} color="#2563eb" style={{ marginRight: 6 }} />
              <Text style={{ fontSize: 11, fontWeight: '700', color: '#475569' }}>Full Name</Text>
            </View>
            <TextInput
              value={fullName}
              onChangeText={setFullName}
              placeholder="Your Name"
              placeholderTextColor="#94a3b8"
              style={{ backgroundColor: '#f8fafc', borderWidth: 1.5, borderColor: '#e2e8f0', borderRadius: 14, paddingHorizontal: 14, paddingVertical: 10, fontSize: 13, color: '#0f172a', fontWeight: '600' }}
            />
          </View>

          {/* Phone Number */}
          <View>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
              <Feather name="phone" size={12} color="#94a3b8" style={{ marginRight: 6 }} />
              <Text style={{ fontSize: 11, fontWeight: '700', color: '#94a3b8' }}>Mobile Number (Non-editable)</Text>
            </View>
            <TextInput
              value={phone}
              editable={false}
              style={{ backgroundColor: '#f1f5f9', borderWidth: 1.5, borderColor: '#e2e8f0', borderRadius: 14, paddingHorizontal: 14, paddingVertical: 10, fontSize: 13, color: '#94a3b8', fontWeight: '600' }}
            />
          </View>

          {/* Email Address */}
          <View>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
              <Feather name="mail" size={12} color="#94a3b8" style={{ marginRight: 6 }} />
              <Text style={{ fontSize: 11, fontWeight: '700', color: '#94a3b8' }}>Email Address (Non-editable)</Text>
            </View>
            <TextInput
              value={email}
              editable={false}
              style={{ backgroundColor: '#f1f5f9', borderWidth: 1.5, borderColor: '#e2e8f0', borderRadius: 14, paddingHorizontal: 14, paddingVertical: 10, fontSize: 13, color: '#94a3b8', fontWeight: '600' }}
            />
          </View>

          {/* Expanded Fields */}
          {isExpanded && (
            <View style={{ gap: 14, paddingTop: 6, borderTopWidth: 1, borderTopColor: '#f1f5f9', marginTop: 6 }}>
              
              {/* Date of Birth */}
              <View>
                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
                  <Feather name="calendar" size={12} color="#2563eb" style={{ marginRight: 6 }} />
                  <Text style={{ fontSize: 11, fontWeight: '700', color: '#475569' }}>Date of Birth</Text>
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
                  <Ionicons name="transgender-outline" size={12} color="#2563eb" style={{ marginRight: 6 }} />
                  <Text style={{ fontSize: 11, fontWeight: '700', color: '#475569' }}>Gender</Text>
                </View>
                <TextInput
                  value={gender}
                  onChangeText={setGender}
                  placeholder="Gender"
                  placeholderTextColor="#94a3b8"
                  style={{ backgroundColor: '#f8fafc', borderWidth: 1.5, borderColor: '#e2e8f0', borderRadius: 14, paddingHorizontal: 14, paddingVertical: 10, fontSize: 13, color: '#0f172a', fontWeight: '600' }}
                />
              </View>

              {/* City / Location */}
              <View>
                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
                  <Feather name="map-pin" size={12} color="#2563eb" style={{ marginRight: 6 }} />
                  <Text style={{ fontSize: 11, fontWeight: '700', color: '#475569' }}>City / State</Text>
                </View>
                <TextInput
                  value={location}
                  onChangeText={setLocation}
                  placeholder="City, State"
                  placeholderTextColor="#94a3b8"
                  style={{ backgroundColor: '#f8fafc', borderWidth: 1.5, borderColor: '#e2e8f0', borderRadius: 14, paddingHorizontal: 14, paddingVertical: 10, fontSize: 13, color: '#0f172a', fontWeight: '600' }}
                />
              </View>

              {/* Highest Qualification Level */}
              <View>
                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
                  <Feather name="book-open" size={12} color="#2563eb" style={{ marginRight: 6 }} />
                  <Text style={{ fontSize: 11, fontWeight: '700', color: '#475569' }}>Highest Qualification Level</Text>
                </View>
                <TextInput
                  value={educationLevel}
                  onChangeText={setEducationLevel}
                  placeholder="e.g. Undergraduate"
                  placeholderTextColor="#94a3b8"
                  style={{ backgroundColor: '#f8fafc', borderWidth: 1.5, borderColor: '#e2e8f0', borderRadius: 14, paddingHorizontal: 14, paddingVertical: 10, fontSize: 13, color: '#0f172a', fontWeight: '600' }}
                />
              </View>

              {/* Current Status / Occupation */}
              <View>
                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
                  <Feather name="briefcase" size={12} color="#2563eb" style={{ marginRight: 6 }} />
                  <Text style={{ fontSize: 11, fontWeight: '700', color: '#475569' }}>Current Status / Occupation</Text>
                </View>
                <TextInput
                  value={occupation}
                  onChangeText={setOccupation}
                  placeholder="e.g. Working Professional"
                  placeholderTextColor="#94a3b8"
                  style={{ backgroundColor: '#f8fafc', borderWidth: 1.5, borderColor: '#e2e8f0', borderRadius: 14, paddingHorizontal: 14, paddingVertical: 10, fontSize: 13, color: '#0f172a', fontWeight: '600' }}
                />
              </View>

              {/* Government ID / Aadhar Number */}
              <View>
                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
                  <Feather name="shield" size={12} color="#2563eb" style={{ marginRight: 6 }} />
                  <Text style={{ fontSize: 11, fontWeight: '700', color: '#475569' }}>Aadhar / Government ID Number</Text>
                </View>
                <TextInput
                  value={aadharNumber}
                  onChangeText={setAadharNumber}
                  placeholder="Government ID / Aadhar Number"
                  placeholderTextColor="#94a3b8"
                  style={{ backgroundColor: '#f8fafc', borderWidth: 1.5, borderColor: '#e2e8f0', borderRadius: 14, paddingHorizontal: 14, paddingVertical: 10, fontSize: 13, color: '#0f172a', fontWeight: '600' }}
                />
              </View>

              {/* Verification Proof Documents (Read Only Row style) */}
              <View style={{ borderTopWidth: 1.5, borderTopColor: '#f8fafc', paddingTop: 10, gap: 10 }}>
                <Text style={{ fontSize: 11, fontWeight: '800', color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 }}>Verification Documents</Text>
                
                {/* Government ID Document Row */}
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#f8fafc', padding: 12, borderRadius: 14, borderWidth: 1, borderColor: '#e2e8f0' }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, marginRight: 8 }}>
                    <Feather name="file-text" size={16} color="#2563eb" style={{ marginRight: 8 }} />
                    <Text style={{ fontSize: 12, fontWeight: '700', color: '#475569' }} numberOfLines={1}>
                      {aadharImageProof || 'government_id_proof.jpg'}
                    </Text>
                  </View>
                  <TouchableOpacity onPress={() => Alert.alert('Preview', 'Simulated document viewer opening.')} style={{ backgroundColor: '#2563eb', paddingHorizontal: 12, paddingVertical: 5, borderRadius: 8 }}>
                    <Text style={{ fontSize: 11, fontWeight: '700', color: '#ffffff' }}>View</Text>
                  </TouchableOpacity>
                </View>

                {/* Educational Certificate Row */}
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#f8fafc', padding: 12, borderRadius: 14, borderWidth: 1, borderColor: '#e2e8f0' }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, marginRight: 8 }}>
                    <Feather name="file-text" size={16} color="#2563eb" style={{ marginRight: 8 }} />
                    <Text style={{ fontSize: 12, fontWeight: '700', color: '#475569' }} numberOfLines={1}>
                      {certificationProof || 'educational_certificate.pdf'}
                    </Text>
                  </View>
                  <TouchableOpacity onPress={() => Alert.alert('Preview', 'Simulated document viewer opening.')} style={{ backgroundColor: '#2563eb', paddingHorizontal: 12, paddingVertical: 5, borderRadius: 8 }}>
                    <Text style={{ fontSize: 11, fontWeight: '700', color: '#ffffff' }}>View</Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* Scribe Specific Profile Details */}
              {role === 'scribe' && (
                <View style={{ borderTopWidth: 1.5, borderTopColor: '#f8fafc', paddingTop: 10, gap: 14 }}>
                  <Text style={{ fontSize: 11, fontWeight: '800', color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5 }}>Scribe Configuration</Text>
                  
                  {/* First Time Scribe Switcher Option */}
                  <View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#f8fafc', padding: 12, borderRadius: 14, borderWidth: 1, borderColor: '#e2e8f0' }}>
                      <Text style={{ fontSize: 12, fontWeight: '700', color: '#475569' }}>First Time Scribe?</Text>
                      <View style={{ flexDirection: 'row', gap: 6 }}>
                        <TouchableOpacity
                          onPress={() => setFirstTime(true)}
                          style={{
                            paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10,
                            backgroundColor: firstTime ? '#16a34a' : '#fff',
                            borderWidth: 1, borderColor: firstTime ? '#16a34a' : 'rgba(0,0,0,0.06)'
                          }}
                        >
                          <Text style={{ fontSize: 11, fontWeight: '700', color: firstTime ? '#fff' : '#64748b' }}>Yes</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          onPress={() => setFirstTime(false)}
                          style={{
                            paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10,
                            backgroundColor: !firstTime ? '#16a34a' : '#fff',
                            borderWidth: 1, borderColor: !firstTime ? '#16a34a' : 'rgba(0,0,0,0.06)'
                          }}
                        >
                          <Text style={{ fontSize: 11, fontWeight: '700', color: !firstTime ? '#fff' : '#64748b' }}>No</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  </View>

                  {/* Languages Selector */}
                  <View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
                      <Feather name="globe" size={12} color="#2563eb" style={{ marginRight: 6 }} />
                      <Text style={{ fontSize: 11, fontWeight: '700', color: '#475569' }}>Preferred Scribe Languages</Text>
                    </View>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                      {['English', 'Hindi', 'Gujarati'].map(langOption => {
                        const isSelected = selectedLanguages.includes(langOption);
                        return (
                          <TouchableOpacity
                            key={langOption}
                            onPress={() => {
                              if (isSelected) {
                                setSelectedLanguages(selectedLanguages.filter(l => l !== langOption));
                              } else {
                                setSelectedLanguages([...selectedLanguages, langOption]);
                              }
                            }}
                            style={{
                              paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10,
                              backgroundColor: isSelected ? '#2563eb' : '#f8fafc',
                              borderWidth: 1, borderColor: isSelected ? '#2563eb' : 'rgba(0,0,0,0.06)'
                            }}
                          >
                            <Text style={{ fontSize: 11, fontWeight: '700', color: isSelected ? '#fff' : '#64748b' }}>{langOption}</Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </View>

                  {/* Availability Slots */}
                  <View style={{ marginTop: 6 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
                      <Feather name="clock" size={12} color="#2563eb" style={{ marginRight: 6 }} />
                      <Text style={{ fontSize: 11, fontWeight: '700', color: '#475569' }}>Availability Slots</Text>
                    </View>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                      {['Morning', 'Afternoon', 'Evening'].map(slotOption => {
                        const isSelected = availabilitySlots.includes(slotOption);
                        return (
                          <TouchableOpacity
                            key={slotOption}
                            onPress={() => {
                              if (isSelected) {
                                setAvailabilitySlots(availabilitySlots.filter(s => s !== slotOption));
                              } else {
                                setAvailabilitySlots([...availabilitySlots, slotOption]);
                              }
                            }}
                            style={{
                              paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10,
                              backgroundColor: isSelected ? '#2563eb' : '#f8fafc',
                              borderWidth: 1, borderColor: isSelected ? '#2563eb' : 'rgba(0,0,0,0.06)'
                            }}
                          >
                            <Text style={{ fontSize: 11, fontWeight: '700', color: isSelected ? '#fff' : '#64748b' }}>{slotOption}</Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </View>
                </View>
              )}

            </View>
          )}

        </View>
      </View>

      {/* App Settings Card (Language Toggle Display) */}
      <View style={{ backgroundColor: '#f8fafc', borderRadius: 24, padding: 20, borderWidth: 1, borderColor: '#e2e8f0', shadowColor: '#64748b', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.08, shadowRadius: 12, elevation: 3, marginBottom: 20 }}>
        <Text style={{ fontSize: 12, fontWeight: '800', color: '#64748b', textTransform: 'uppercase', marginBottom: 10, letterSpacing: 0.5 }}>{t('language_display')}</Text>
        <Text style={{ fontSize: 10, color: '#64748b', marginBottom: 12 }}>{t('select_language_desc')}</Text>
        
        <TouchableOpacity 
          onPress={() => setIsLangDropdownOpen(!isLangDropdownOpen)}
          style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#f8fafc', borderWidth: 1.5, borderColor: '#e2e8f0', borderRadius: 14, paddingHorizontal: 14, paddingVertical: 10 }}
        >
          <Text style={{ fontSize: 13, fontWeight: '700', color: '#334155' }}>{lang}</Text>
          <Feather name={isLangDropdownOpen ? "chevron-up" : "chevron-down"} size={16} color="#64748b" />
        </TouchableOpacity>

        {isLangDropdownOpen && (
          <View style={{ marginTop: 6, backgroundColor: '#ffffff', borderWidth: 1.5, borderColor: '#f1f5f9', borderRadius: 14, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 5, elevation: 2, overflow: 'hidden' }}>
            {(['English', 'Hindi', 'Gujarati'] as LanguageType[]).map((l) => (
              <TouchableOpacity
                key={l}
                onPress={async () => {
                  await changeLanguage(l);
                  setIsLangDropdownOpen(false);
                }}
                style={{ paddingVertical: 12, paddingHorizontal: 14, borderBottomWidth: 1, borderBottomColor: '#f8fafc', backgroundColor: lang === l ? 'rgba(37,99,235,0.06)' : '#ffffff' }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Text style={{ fontSize: 13, fontWeight: '700', color: lang === l ? '#2563eb' : '#334155' }}>
                    {l}
                  </Text>
                  {lang === l && <Feather name="check" size={14} color="#2563eb" />}
                </View>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </View>

      {/* Primary Action Button (Save changes) */}
      <TouchableOpacity
        onPress={handleSaveSettings}
        disabled={updating}
        style={{ backgroundColor: '#2563eb', paddingVertical: 14, borderRadius: 16, alignItems: 'center', justifyContent: 'center', shadowColor: '#2563eb', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.18, shadowRadius: 12, elevation: 4, marginBottom: 12 }}
      >
        {updating ? (
          <ActivityIndicator size="small" color="#ffffff" />
        ) : (
          <Text style={{ color: '#ffffff', fontWeight: '800', fontSize: 14 }}>{t('save_settings')}</Text>
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
