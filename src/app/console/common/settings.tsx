import React, { useState, useEffect } from 'react';
import { View, Text, Switch, TouchableOpacity, ScrollView, Alert, ActivityIndicator, TextInput, SafeAreaView } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { router } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { supabase } from '@/app/core/supabase';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useLanguage, LanguageType } from '@/app/core/translation';

export default function SettingsScreen() {
  const { lang, changeLanguage, t } = useLanguage();
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [role, setRole] = useState<'student' | 'scribe'>('student');
  const [email, setEmail] = useState('');
  
  // Profile States
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');

  // Settings States
  const [pushEnabled, setPushEnabled] = useState(true);
  const [emailEnabled, setEmailEnabled] = useState(true);
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
      setEmail(session.user.email || '');

      const { data: profile, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', session.user.id)
        .single();

      if (error) throw error;
      if (profile) {
        setRole(profile.role || 'student');
        setFullName(profile.full_name || '');
        setPhone(profile.phone || '');
      }
    } catch (error) {
      console.error('Error fetching user data in Settings page:', error);
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
      Alert.alert(t('success'), t('save_success_desc'));
    } catch (error: any) {
      Alert.alert(t('error'), error.message || 'Error updating profile.');
    } finally {
      setUpdating(false);
    }
  };

  const handleSignOut = async () => {
    try {
      await AsyncStorage.removeItem('welcome_toast_shown');
      await AsyncStorage.removeItem('scribe_welcome_shown');
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      router.replace('/');
    } catch (err: any) {
      Alert.alert(t('signout_failed'), err.message);
    }
  };

  const isStudent = role === 'student';
  const themeColor = isStudent ? '#2563eb' : '#059669';
  const themeBgLight = isStudent ? 'rgba(37,99,235,0.08)' : 'rgba(5,150,105,0.08)';
  const themeBorder = isStudent ? 'rgba(37,99,235,0.18)' : 'rgba(5,150,105,0.18)';

  if (loading) {
    return (
      <SafeAreaView style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f8fafc' }}>
        <ActivityIndicator size="large" color={themeColor} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#f8fafc' }}>
      <StatusBar style="dark" />

      {/* Header */}
      <View style={{ backgroundColor: '#fff', paddingHorizontal: 24, paddingVertical: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: '#e2e8f0', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 2 }}>
        <TouchableOpacity onPress={() => router.back()} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Feather name="arrow-left" size={20} color="#0f172a" />
          <Text style={{ fontFamily: 'Roboto', fontSize: 18, fontWeight: '900', color: '#0f172a' }}>{t('my_requests')}</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={{ flex: 1, paddingHorizontal: 24, paddingVertical: 12 }} contentContainerStyle={{ paddingBottom: 60 }} showsVerticalScrollIndicator={false}>
        
        {/* પ્રોફાઇલ કાર્ડ */}
        <View style={{ backgroundColor: 'rgba(255,255,255,0.85)', padding: 18, borderRadius: 24, borderWidth: 1, borderColor: 'rgba(0,0,0,0.06)', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.04, shadowRadius: 10, elevation: 2, marginBottom: 16 }}>
          <Text style={{ fontFamily: 'Roboto', fontSize: 13, fontWeight: '800', color: '#64748b', textTransform: 'uppercase', marginBottom: 12, letterSpacing: 0.5 }}>{t('profile_info')}</Text>
          
          {/* અવતાર */}
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 16 }}>
            <View style={{ width: 48, height: 48, borderRadius: 14, backgroundColor: themeBgLight, borderWidth: 1.5, borderColor: themeBorder, alignItems: 'center', justifyContent: 'center', marginRight: 12 }}>
              <Text style={{ fontFamily: 'Roboto', fontSize: 20, fontWeight: '900', color: themeColor }}>
                {fullName ? fullName.charAt(0).toUpperCase() : 'U'}
              </Text>
            </View>
            <View>
              <Text style={{ fontFamily: 'Roboto', fontSize: 16, fontWeight: '900', color: '#0f172a' }}>{fullName || 'User'}</Text>
              <Text style={{ fontFamily: 'Roboto', fontSize: 11, color: '#64748b', marginTop: 1 }}>{email}</Text>
            </View>
          </View>

          {/* સંપાદનયોગ્ય ક્ષેત્રો */}
          <View style={{ gap: 12 }}>
            <View>
              <Text style={{ fontFamily: 'Roboto', fontSize: 11, fontWeight: '700', color: '#64748b', marginBottom: 5 }}>{t('full_name')}</Text>
              <TextInput
                value={fullName}
                onChangeText={setFullName}
                placeholder={t('enter_name')}
                placeholderTextColor="#94a3b8"
                style={{ fontFamily: 'Roboto', backgroundColor: '#f8fafc', borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, fontSize: 13, color: '#0f172a' }}
              />
            </View>

            <View>
              <Text style={{ fontFamily: 'Roboto', fontSize: 11, fontWeight: '700', color: '#64748b', marginBottom: 5 }}>{t('phone_number')}</Text>
              <TextInput
                value={phone}
                onChangeText={setPhone}
                keyboardType="phone-pad"
                placeholder={t('enter_phone')}
                placeholderTextColor="#94a3b8"
                style={{ fontFamily: 'Roboto', backgroundColor: '#f8fafc', borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, fontSize: 13, color: '#0f172a' }}
              />
            </View>

            <View>
              <Text style={{ fontFamily: 'Roboto', fontSize: 11, fontWeight: '700', color: '#94a3b8', marginBottom: 5 }}>{t('email_readonly')}</Text>
              <TextInput
                value={email}
                editable={false}
                style={{ fontFamily: 'Roboto', backgroundColor: '#f1f5f9', borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, fontSize: 13, color: '#94a3b8' }}
              />
            </View>
          </View>
        </View>

        {/* નોટિફિકેશન સેટિંગ્સ */}
        <View style={{ backgroundColor: 'rgba(255,255,255,0.85)', padding: 18, borderRadius: 24, borderWidth: 1, borderColor: 'rgba(0,0,0,0.06)', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.04, shadowRadius: 10, elevation: 2, marginBottom: 16 }}>
          <Text style={{ fontFamily: 'Roboto', fontSize: 13, fontWeight: '800', color: '#64748b', textTransform: 'uppercase', marginBottom: 12, letterSpacing: 0.5 }}>{t('notifications_settings')}</Text>
          
          <View style={{ gap: 14 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <View style={{ flex: 1, paddingRight: 10 }}>
                <Text style={{ fontFamily: 'Roboto', fontSize: 13, fontWeight: '700', color: '#0f172a' }}>{t('app_notifications')}</Text>
                <Text style={{ fontFamily: 'Roboto', fontSize: 10, color: '#64748b', marginTop: 2 }}>{t('app_notifications_desc')}</Text>
              </View>
              <Switch
                value={pushEnabled}
                onValueChange={setPushEnabled}
                trackColor={{ true: themeColor }}
                style={{ transform: [{ scaleX: 0.8 }, { scaleY: 0.8 }] }}
              />
            </View>

            <View style={{ height: 1, backgroundColor: '#f1f5f9' }} />

            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <View style={{ flex: 1, paddingRight: 10 }}>
                <Text style={{ fontFamily: 'Roboto', fontSize: 13, fontWeight: '700', color: '#0f172a' }}>{t('email_notifications')}</Text>
                <Text style={{ fontFamily: 'Roboto', fontSize: 10, color: '#64748b', marginTop: 2 }}>{t('email_notifications_desc')}</Text>
              </View>
              <Switch
                value={emailEnabled}
                onValueChange={setEmailEnabled}
                trackColor={{ true: themeColor }}
                style={{ transform: [{ scaleX: 0.8 }, { scaleY: 0.8 }] }}
              />
            </View>
          </View>
        </View>

        {/* ભાષા પસંદગી */}
        <View style={{ backgroundColor: 'rgba(255,255,255,0.85)', padding: 18, borderRadius: 24, borderWidth: 1, borderColor: 'rgba(0,0,0,0.06)', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.04, shadowRadius: 10, elevation: 2, marginBottom: 20 }}>
          <Text style={{ fontFamily: 'Roboto', fontSize: 13, fontWeight: '800', color: '#64748b', textTransform: 'uppercase', marginBottom: 12, letterSpacing: 0.5 }}>{t('language_display')}</Text>
          
          <View>
            <Text style={{ fontFamily: 'Roboto', fontSize: 13, fontWeight: '700', color: '#0f172a' }}>{t('app_language')}</Text>
            <Text style={{ fontFamily: 'Roboto', fontSize: 10, color: '#64748b', marginTop: 2, marginBottom: 10 }}>{t('select_language_desc')}</Text>
            
            <TouchableOpacity 
              onPress={() => setIsLangDropdownOpen(!isLangDropdownOpen)}
              style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#f8fafc', borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10 }}
            >
              <Text style={{ fontFamily: 'Roboto', fontSize: 13, fontWeight: '600', color: '#334155' }}>{lang}</Text>
              <Feather name={isLangDropdownOpen ? "chevron-up" : "chevron-down"} size={16} color="#64748b" />
            </TouchableOpacity>

            {isLangDropdownOpen && (
              <View style={{ marginTop: 6, backgroundColor: '#fff', borderWidth: 1, borderColor: '#f1f5f9', borderRadius: 12, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 5, elevation: 2, overflow: 'hidden' }}>
                {(['English', 'Hindi', 'Gujarati'] as LanguageType[]).map((l) => (
                  <TouchableOpacity
                    key={l}
                    onPress={async () => {
                      await changeLanguage(l);
                      setIsLangDropdownOpen(false);
                    }}
                    style={{ paddingVertical: 12, paddingHorizontal: 14, borderBottomWidth: 1, borderBottomColor: '#f8fafc', backgroundColor: lang === l ? themeBgLight : '#fff' }}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                      <Text style={{ fontFamily: 'Roboto', fontSize: 13, fontWeight: '600', color: lang === l ? themeColor : '#334155' }}>
                        {l}
                      </Text>
                      {lang === l && <Feather name="check" size={14} color={themeColor} />}
                    </View>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>
        </View>

        {/* સેવ બટન */}
        <TouchableOpacity
          onPress={handleSaveSettings}
          disabled={updating}
          style={{ backgroundColor: themeColor, paddingVertical: 14, borderRadius: 16, alignItems: 'center', justifyContent: 'center', shadowColor: themeColor, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.15, shadowRadius: 12, elevation: 4, marginBottom: 12 }}
        >
          {updating ? (
            <ActivityIndicator size="small" color="#ffffff" />
          ) : (
            <Text style={{ fontFamily: 'Roboto', color: '#fff', fontWeight: '800', fontSize: 14 }}>{t('save_settings')}</Text>
          )}
        </TouchableOpacity>

        {/* સાઇન આઉટ */}
        <TouchableOpacity
          onPress={handleSignOut}
          style={{ width: '100%', backgroundColor: '#fee2e2', borderWidth: 1, borderColor: '#fecaca', paddingVertical: 13, borderRadius: 16, alignItems: 'center', justifyContent: 'center', flexDirection: 'row' }}
        >
          <Feather name="log-out" size={14} color="#dc2626" style={{ marginRight: 6 }} />
          <Text style={{ fontFamily: 'Roboto', color: '#dc2626', fontWeight: '800', fontSize: 13 }}>{t('sign_out')}</Text>
        </TouchableOpacity>

      </ScrollView>
    </SafeAreaView>
  );
}
