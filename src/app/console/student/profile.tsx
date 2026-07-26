import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, ActivityIndicator, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { router } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { supabase } from '@/core/supabase';

export default function ProfileScreen() {
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [email, setEmail] = useState('');
  
  // Profile State
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [role, setRole] = useState<'student' | 'scribe'>('student');

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
        setRole(profile.role || 'student');
      }
    } catch (error: any) {
      console.error('Error fetching profile:', error.message);
      Alert.alert('Error', 'Failed to load profile details.');
    } finally {
      setLoading(false);
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
        })
        .eq('id', session.user.id);

      if (error) throw error;

      Alert.alert('Success', 'Profile updated successfully!');
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to update profile.');
    } finally {
      setUpdating(false);
    }
  };



  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/console/student');
    }
  };

  const isStudent = role === 'student';
  const themeColorClass = isStudent ? 'bg-blue-500 active:bg-blue-600' : 'bg-emerald-500 active:bg-emerald-600';
  const themeTextClass = isStudent ? 'text-blue-600' : 'text-emerald-600';
  const themeBorderClass = isStudent ? 'border-blue-200' : 'border-emerald-200';
  const themeBgClass = isStudent ? 'bg-blue-50' : 'bg-emerald-50';

  if (loading) {
    return (
      <SafeAreaView className="flex-1 bg-slate-50 justify-center items-center">
        <ActivityIndicator size="large" color={isStudent ? '#2563eb' : '#059669'} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-slate-50">
      <StatusBar style="dark" />
      
      {/* Header */}
      <View className="bg-white px-6 py-4 border-b border-slate-100 flex-row items-center justify-between shadow-sm">
        <View className="flex-row items-center">
          {isStudent ? (
            <View className="flex-row items-center">
              <View className="w-9 h-9 bg-white border border-slate-200 rounded-lg items-center justify-center mr-2 shadow-sm shadow-slate-200/50">
                <Text className="font-black text-lg text-blue-600">अ</Text>
              </View>
              <Text className="text-xl font-black text-slate-800 tracking-tight">Anulekh</Text>
            </View>
          ) : (
            <View className="flex-row items-center">
              <View className="bg-emerald-500 p-2 rounded-xl mr-3 shadow-md shadow-emerald-500/25">
                <Feather name="heart" size={18} color="white" />
              </View>
              <Text className="text-xl font-black text-slate-800">Anulekh</Text>
            </View>
          )}
        </View>

        <TouchableOpacity 
          onPress={() => router.push(isStudent ? '/console/student' : '/console/scribe')}
          className={`w-10 h-10 rounded-full items-center justify-center border-2 border-white shadow-md ${
            isStudent ? 'bg-blue-400 shadow-blue-500/30' : 'bg-emerald-500 shadow-emerald-500/30'
          }`}
        >
          <Text className="text-white font-black text-base">
            {fullName ? fullName.charAt(0).toUpperCase() : 'U'}
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView className="flex-1 px-6 py-3" contentContainerStyle={{ paddingBottom: 20 }}>
        
        {/* Profile Card Header */}
        <View className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm items-center mb-3">
          <View className={`w-14 h-14 rounded-full items-center justify-center border-2 border-white shadow-sm ${isStudent ? 'bg-blue-400' : 'bg-emerald-400'} mb-2`}>
            <Text className="text-white font-black text-xl">
              {fullName ? fullName.charAt(0).toUpperCase() : 'U'}
            </Text>
          </View>
          <Text className="text-base font-bold text-slate-800">{fullName || 'User'}</Text>
          <Text className="text-slate-400 text-[10px] mt-0.5">{email}</Text>
          
          <View className={`mt-2 py-0.5 px-2.5 rounded-full border ${themeBgClass} ${themeBorderClass}`}>
            <Text className={`text-[9px] font-bold uppercase tracking-wider ${themeTextClass}`}>{role}</Text>
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
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-800 focus:border-blue-500 focus:bg-white transition-all"
              />
            </View>

            <View>
              <Text className="text-[10px] font-semibold text-slate-500 mb-1 ml-1">Phone Number</Text>
              <TextInput 
                value={phone}
                onChangeText={setPhone}
                keyboardType="phone-pad"
                placeholder="Enter phone number"
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-800 focus:border-blue-500 focus:bg-white transition-all"
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
          </View>

          {/* Update Button */}
          <TouchableOpacity 
            onPress={handleUpdateProfile}
            disabled={updating}
            className={`w-full ${themeColorClass} py-2.5 mt-2 rounded-xl items-center justify-center shadow-md`}
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
        <TouchableOpacity onPress={() => router.replace({ pathname: '/console/student' as any, params: { tab: 'home' } })} className="items-center">
          <Feather name="home" size={22} color="#64748b" />
          <Text className="text-slate-400 text-[10px] font-bold mt-1">Home</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => router.replace({ pathname: '/console/student' as any, params: { tab: 'requests' } })} className="items-center">
          <Feather name="list" size={22} color="#64748b" />
          <Text className="text-slate-400 text-[10px] font-bold mt-1">{isStudent ? 'Requests' : 'Commitments'}</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => router.replace({ pathname: '/console/student' as any, params: { tab: 'plan' } })} className="items-center">
          <Feather name="calendar" size={22} color="#64748b" />
          <Text className="text-slate-400 text-[10px] font-bold mt-1">Plan</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => router.replace({ pathname: '/console/student' as any, params: { tab: 'settings' } })} className="items-center">
          <Feather name="user" size={22} color={isStudent ? '#2563eb' : '#059669'} />
          <Text className={`text-[10px] font-bold mt-1 ${themeTextClass}`}>Account</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}
