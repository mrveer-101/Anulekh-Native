import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, ActivityIndicator, Alert } from 'react-native';
import { supabase } from '../app/core/supabase';

export default function StudentProfileView() {
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');

  useEffect(() => {
    fetchProfile();
  }, []);

  const fetchProfile = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      
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

  if (loading) {
    return (
      <View className="flex-1 justify-center items-center py-10">
        <ActivityIndicator size="large" color="#2563eb" />
      </View>
    );
  }

  return (
    <ScrollView className="flex-1 px-6 py-3" contentContainerStyle={{ paddingBottom: 30 }}>
      {/* Profile Card Header */}
      <View className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm items-center mb-3">
        <View className="w-14 h-14 rounded-full items-center justify-center border-2 border-white shadow-sm bg-blue-400 mb-2">
          <Text className="text-white font-black text-xl">
            {fullName ? fullName.charAt(0).toUpperCase() : 'U'}
          </Text>
        </View>
        <Text className="text-base font-bold text-slate-800">{fullName || 'User'}</Text>
        <Text className="text-slate-400 text-[10px] mt-0.5">{email}</Text>
        
        <View className="mt-2 py-0.5 px-2.5 rounded-full border bg-blue-550 bg-blue-50 border-blue-200">
          <Text className="text-[9px] font-bold uppercase tracking-wider text-blue-600">Student</Text>
        </View>
      </View>

      {/* Editable Profile Fields */}
      <View className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm space-y-4">
        <Text className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Account Information</Text>
        
        <View className="space-y-3">
          <View>
            <Text className="text-[10px] font-semibold text-slate-500 mb-1.5 ml-1">Full Name</Text>
            <TextInput
              value={fullName}
              onChangeText={setFullName}
              placeholder="Your Full Name"
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-800 focus:border-blue-500 focus:bg-white transition-all"
            />
          </View>

          <View>
            <Text className="text-[10px] font-semibold text-slate-500 mb-1.5 ml-1">Phone Number</Text>
            <TextInput
              value={phone}
              onChangeText={setPhone}
              keyboardType="phone-pad"
              placeholder="Phone Number"
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-800 focus:border-blue-500 focus:bg-white transition-all"
            />
          </View>

          <View>
            <Text className="text-[10px] font-semibold text-slate-400 mb-1.5 ml-1">Email Address (Cannot be changed)</Text>
            <TextInput
              value={email}
              editable={false}
              className="w-full bg-slate-100 border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-400"
            />
          </View>
        </View>

        <TouchableOpacity
          onPress={handleUpdateProfile}
          disabled={updating}
          className="w-full bg-blue-500 active:bg-blue-600 py-3 rounded-xl items-center justify-center shadow-md shadow-blue-500/20 mt-2"
        >
          {updating ? (
            <ActivityIndicator size="small" color="#ffffff" />
          ) : (
            <Text className="text-white font-bold text-sm">Save Changes</Text>
          )}
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}
