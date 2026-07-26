import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, ActivityIndicator, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { router } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { supabase } from '@/core/supabase';

const EXAM_LANGUAGES = ['English', 'Hindi', 'Gujarati'];

export default function VolunteerProfile() {
  const [user, setUser] = useState<any>(null);
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [selectedLanguages, setSelectedLanguages] = useState<string[]>([]);
  const [occupation, setOccupation] = useState('');
  const [location, setLocation] = useState('');
  const [firstTime, setFirstTime] = useState(false);
  const [urgentCalls, setUrgentCalls] = useState(false);
  
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);

  useEffect(() => {
    fetchProfile();
  }, []);

  const fetchProfile = async () => {
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
        setSelectedLanguages(profile.languages || []);
        setOccupation(profile.occupation || '');
        setLocation(profile.location || '');
        setFirstTime(profile.first_time === 'yes');
        setUrgentCalls(profile.urgent_calls === 'yes');
      }
    } catch (err: any) {
      console.error('Error fetching profile:', err.message);
    } finally {
      setLoading(false);
    }
  };

  const toggleLanguage = (lang: string) => {
    if (selectedLanguages.includes(lang)) {
      setSelectedLanguages(selectedLanguages.filter((l) => l !== lang));
    } else {
      setSelectedLanguages([...selectedLanguages, lang]);
    }
  };

  const handleUpdateProfile = async () => {
    if (!fullName.trim() || !phone.trim()) {
      Alert.alert('Required Fields', 'Name and Phone number are required.');
      return;
    }

    if (selectedLanguages.length === 0) {
      Alert.alert('Selection Required', 'Please select at least one language you can scribe in.');
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
          occupation: occupation.trim(),
          location: location.trim(),
          first_time: firstTime ? 'yes' : 'no',
          urgent_calls: urgentCalls ? 'yes' : 'no'
        })
        .eq('id', user.id);

      if (error) throw error;
      Alert.alert('Success', 'Profile updated successfully!');
    } catch (err: any) {
      Alert.alert('Update Failed', err.message || 'Failed to update profile.');
    } finally {
      setUpdating(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView className="flex-1 bg-white items-center justify-center">
        <ActivityIndicator size="large" color="#059669" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-slate-50">
      <StatusBar style="dark" />
      
      {/* Header */}
      <View className="bg-white px-6 py-4 border-b border-slate-100 flex-row items-center justify-between shadow-sm">
        <View className="flex-row items-center">
          <View className="bg-emerald-500 p-2 rounded-xl mr-3 shadow-md shadow-emerald-500/25">
            <Feather name="heart" size={18} color="white" />
          </View>
          <Text className="text-xl font-black text-slate-800">Anulekh</Text>
        </View>

        <TouchableOpacity 
          onPress={() => router.push('/console/scribe' as any)}
          className="w-10 h-10 rounded-full items-center justify-center border-2 border-white bg-emerald-500 shadow-md shadow-emerald-500/30"
        >
          <Text className="text-white font-black text-base">
            {fullName ? fullName.charAt(0).toUpperCase() : 'U'}
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView className="flex-1 px-6 py-3" contentContainerStyle={{ paddingBottom: 20 }}>
        
        {/* Profile Card Header */}
        <View className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm items-center mb-3">
          <View className="w-14 h-14 rounded-full items-center justify-center border-2 border-white shadow-sm bg-emerald-400 mb-2">
            <Text className="text-white font-black text-xl">
              {fullName ? fullName.charAt(0).toUpperCase() : 'V'}
            </Text>
          </View>
          <Text className="text-base font-bold text-slate-800">{fullName || 'Volunteer'}</Text>
          <Text className="text-slate-400 text-[10px] mt-0.5">{email}</Text>
          
          <View className="mt-2 py-0.5 px-2.5 rounded-full border bg-emerald-50 border-emerald-200">
            <Text className="text-[9px] font-bold uppercase tracking-wider text-emerald-600">Scribe</Text>
          </View>
        </View>

        {/* Editable Profile Fields */}
        <View className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm space-y-4">
          <Text className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Account Information</Text>
          
          <View className="space-y-3">
            <View>
              <Text className="text-[10px] font-semibold text-slate-500 mb-1 ml-1">Full Name</Text>
              <TextInput 
                value={fullName}
                onChangeText={setFullName}
                placeholder="Enter your name"
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-800 focus:border-emerald-500 focus:bg-white transition-all"
              />
            </View>

            <View>
              <Text className="text-[10px] font-semibold text-slate-500 mb-1 ml-1">Phone Number</Text>
              <TextInput 
                value={phone}
                onChangeText={setPhone}
                keyboardType="phone-pad"
                placeholder="Enter phone number"
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-800 focus:border-emerald-500 focus:bg-white transition-all"
              />
            </View>

            <View>
              <Text className="text-[10px] font-semibold text-slate-500 mb-1 ml-1">Email Address (Non-editable)</Text>
              <TextInput 
                value={email}
                editable={false}
                className="w-full bg-slate-100 border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-400"
              />
            </View>

            <View>
              <Text className="text-[10px] font-semibold text-slate-500 mb-1 ml-1">Occupation</Text>
              <TextInput 
                value={occupation}
                onChangeText={setOccupation}
                placeholder="e.g. Student, Teacher, etc."
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-800 focus:border-emerald-500 focus:bg-white transition-all"
              />
            </View>

            <View>
              <Text className="text-[10px] font-semibold text-slate-500 mb-1 ml-1">Location</Text>
              <TextInput 
                value={location}
                onChangeText={setLocation}
                placeholder="e.g. Navrangpura, Ahmedabad"
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-800 focus:border-emerald-500 focus:bg-white transition-all"
              />
            </View>

            {/* Scribe Preferences Section */}
            <View className="pt-2 border-t border-slate-100 mt-2">
              <Text className="text-[10px] font-semibold text-slate-500 mb-3 ml-1">Scribe Preferences</Text>
              
              <View className="flex-row items-center justify-between bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 mb-3">
                <View>
                  <Text className="text-sm font-bold text-slate-700">First Time Scribe</Text>
                  <Text className="text-[10px] text-slate-500 mt-0.5">Is this your first time scribing?</Text>
                </View>
                <TouchableOpacity
                  onPress={() => setFirstTime(!firstTime)}
                  className={`w-12 h-6 rounded-full p-0.5 flex-row ${firstTime ? 'bg-emerald-500 justify-end' : 'bg-slate-300 justify-start'}`}
                >
                  <View className="w-5 h-5 rounded-full bg-white shadow-sm" />
                </TouchableOpacity>
              </View>

              <View className="flex-row items-center justify-between bg-slate-50 border border-slate-200 rounded-xl px-3 py-2">
                <View className="flex-1 pr-4">
                  <Text className="text-sm font-bold text-slate-700">Emergency SOS Scribe</Text>
                  <Text className="text-[10px] text-slate-500 mt-0.5">Notify me for urgent day-of-exam requests.</Text>
                </View>
                <TouchableOpacity
                  onPress={() => setUrgentCalls(!urgentCalls)}
                  className={`w-12 h-6 rounded-full p-0.5 flex-row ${urgentCalls ? 'bg-emerald-500 justify-end' : 'bg-slate-300 justify-start'}`}
                >
                  <View className="w-5 h-5 rounded-full bg-white shadow-sm" />
                </TouchableOpacity>
              </View>
            </View>

            {/* Languages Scribe Section */}
            <View className="pt-2">
              <Text className="text-[10px] font-semibold text-slate-500 mb-2 ml-1">Languages You Can Scribe In</Text>
              <View className="flex-row flex-wrap gap-2">
                {EXAM_LANGUAGES.map((lang) => {
                  const isSelected = selectedLanguages.includes(lang);
                  return (
                    <TouchableOpacity
                      key={lang}
                      onPress={() => toggleLanguage(lang)}
                      className={`px-3 py-1.5 rounded-full border flex-row items-center ${
                        isSelected 
                          ? 'bg-emerald-500 border-emerald-500 shadow-sm shadow-emerald-500/30' 
                          : 'bg-slate-50 border-slate-200'
                      }`}
                    >
                      <Text className={`font-bold text-xs ${isSelected ? 'text-white' : 'text-slate-600'}`}>
                        {lang}
                      </Text>
                      {isSelected && <Feather name="check" size={12} color="white" className="ml-1" />}
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          </View>

          {/* Update Button */}
          <TouchableOpacity 
            onPress={handleUpdateProfile}
            disabled={updating}
            className="w-full bg-emerald-500 active:bg-emerald-600 py-2.5 mt-2 rounded-xl items-center justify-center shadow-md shadow-emerald-500/20"
          >
            {updating ? (
              <ActivityIndicator color="white" size="small" />
            ) : (
              <Text className="text-white font-bold text-sm">Save Changes</Text>
            )}
          </TouchableOpacity>

        </View>

      </ScrollView>

      {/* Bottom Navigation Tab Bar */}
      <View className="bg-white border-t border-slate-100 py-2.5 px-6 flex-row justify-around items-center shadow-lg">
        <TouchableOpacity onPress={() => router.replace({ pathname: '/console/scribe' as any, params: { tab: 'home' } })} className="items-center">
          <Feather name="home" size={22} color="#64748b" />
          <Text className="text-slate-400 text-[10px] font-bold mt-1">Home</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => router.replace({ pathname: '/console/scribe' as any, params: { tab: 'commitments' } })} className="items-center">
          <Feather name="list" size={22} color="#64748b" />
          <Text className="text-slate-400 text-[10px] font-bold mt-1">Commitments</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => router.replace({ pathname: '/console/scribe' as any, params: { tab: 'plan' } })} className="items-center">
          <Feather name="calendar" size={22} color="#64748b" />
          <Text className="text-slate-400 text-[10px] font-bold mt-1">Plan</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => router.replace({ pathname: '/console/scribe' as any, params: { tab: 'settings' } })} className="items-center">
          <Feather name="user" size={22} color="#059669" />
          <Text className="text-emerald-600 text-[10px] font-bold mt-1">Account</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}
