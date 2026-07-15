import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, ActivityIndicator, Alert } from 'react-native';
import { Feather, Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { supabase } from '../app/core/supabase';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useLanguage, LanguageType } from '../app/core/translation';

export default function SharedSettingsView() {
  const { lang, changeLanguage, t } = useLanguage();
  const [user, setUser] = useState<any>(null);
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  
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

      const { data: profile, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', session.user.id)
        .single();

      if (error) throw error;
      if (profile) {
        setFullName(profile.full_name || '');
        setPhone(profile.phone || '');
        
        // Populate extra details
        setDob(profile.dob || '2005-02-03');
        setLocation(profile.location || 'Ahmedabad, Gujarat');
        setOccupation(profile.occupation || 'Working Professional');
        setEducationLevel(profile.education_level || 'Undergraduate - Completed');
        setAadharNumber(profile.aadhar_number || '8102917340');
        setCertificationProof(profile.certification_proof || 'educational_certificate.pdf');
        setAadharImageProof(profile.aadhar_image_proof || 'government_id_proof.jpg');
      }
    } catch (error) {
      console.error('Error fetching user data in Settings:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveSettings = async () => {
    if (!fullName.trim() || !phone.trim()) {
      Alert.alert(t('error'), t('enter_name') + ' & ' + t('enter_phone'));
      return;
    }

    setUpdating(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          full_name: fullName.trim(),
          phone: phone.trim(),
          dob: dob.trim(),
          location: location.trim(),
          occupation: occupation.trim(),
          education_level: educationLevel.trim(),
          aadhar_number: aadharNumber.trim(),
        })
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
      <View style={{ backgroundColor: '#ffffff', borderRadius: 24, padding: 20, alignItems: 'center', borderWidth: 1, borderColor: 'rgba(0,0,0,0.05)', shadowColor: '#2563eb', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.04, shadowRadius: 16, marginTop: 12, marginBottom: 16 }}>
        <View style={{ width: 64, height: 64, borderRadius: 22, backgroundColor: 'rgba(37,99,235,0.09)', borderWidth: 2, borderColor: 'rgba(37,99,235,0.2)', alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
          <Text style={{ fontSize: 24, fontWeight: '900', color: '#2563eb' }}>
            {fullName ? fullName.charAt(0).toUpperCase() : 'S'}
          </Text>
        </View>
        <Text style={{ fontSize: 18, fontWeight: '900', color: '#0f172a' }}>{fullName || 'Student'}</Text>
        <Text style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>{email}</Text>
        
        <TouchableOpacity style={{ marginTop: 8, backgroundColor: 'rgba(37,99,235,0.08)', borderWidth: 1, borderColor: 'rgba(37,99,235,0.18)', paddingHorizontal: 12, paddingVertical: 4, borderRadius: 10 }}>
          <Text style={{ fontSize: 9, fontWeight: '800', color: '#2563eb', textTransform: 'uppercase', letterSpacing: 0.5 }}>Upload Photo</Text>
        </TouchableOpacity>
      </View>

      {/* Editable Account Information Card */}
      <View style={{ backgroundColor: '#ffffff', borderRadius: 24, padding: 20, borderWidth: 1, borderColor: 'rgba(0,0,0,0.05)', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.03, shadowRadius: 12, marginBottom: 16 }}>
        
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

            </View>
          )}

        </View>
      </View>

      {/* App Settings Card (Language Toggle Display) */}
      <View style={{ backgroundColor: '#ffffff', borderRadius: 24, padding: 20, borderWidth: 1, borderColor: 'rgba(0,0,0,0.05)', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.03, shadowRadius: 12, marginBottom: 20 }}>
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
        style={{ width: '100%', backgroundColor: '#fee2e2', borderWidth: 1.5, borderColor: '#fecaca', paddingVertical: 13, borderRadius: 16, alignItems: 'center', justifyContent: 'center', flexDirection: 'row' }}
      >
        <Feather name="log-out" size={14} color="#dc2626" style={{ marginRight: 6 }} />
        <Text style={{ color: '#dc2626', fontWeight: '800', fontSize: 13 }}>{t('sign_out')}</Text>
      </TouchableOpacity>

    </ScrollView>
  );
}
