import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, Alert, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { router, useLocalSearchParams } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { supabase } from '@/app/core/supabase';

export default function AssignmentRequestForm() {
  const params = useLocalSearchParams<{ id?: string }>();
  const isEditing = !!params.id;

  const [loading, setLoading] = useState(false);
  const [profile, setProfile] = useState<any>(null);

  // Form Fields
  const [subject, setSubject] = useState('');
  const [title, setTitle] = useState('');
  const [academicLevel, setAcademicLevel] = useState('College');
  const [description, setDescription] = useState('');
  const [deadline, setDeadline] = useState('');

  const ACADEMIC_LEVELS = ['High School', 'College', 'University'];

  useEffect(() => {
    fetchProfile();
  }, []);

  const fetchProfile = async () => {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const { data: profileData } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', session.user.id)
        .single();

      setProfile(profileData);

      if (isEditing) {
        const { data: requestData } = await supabase
          .from('assignment_requests')
          .select('*')
          .eq('id', params.id)
          .single();

        if (requestData) {
          setSubject(requestData.subject || '');
          setTitle(requestData.assignment_title || '');
          setAcademicLevel(requestData.academic_level || 'College');
          setDescription(requestData.description || '');
          setDeadline(requestData.deadline || '');
        }
      }
    } catch (err: any) {
      console.log('Error fetching assignment edit profile/details:', err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!subject.trim()) {
      Alert.alert('Error', 'Subject is required.');
      return;
    }
    if (!title.trim()) {
      Alert.alert('Error', 'Assignment Title is required.');
      return;
    }
    if (!deadline.trim()) {
      Alert.alert('Error', 'Deadline is required.');
      return;
    }

    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error("You must be logged in to create a request.");
      }

      const requestPayload = {
        student_id: session.user.id,
        student_name: profile?.official_name || profile?.full_name || 'Student',
        subject: subject.trim(),
        assignment_title: title.trim(),
        academic_level: academicLevel,
        description: description.trim(),
        deadline: deadline.trim(),
        status: 'pending'
      };

      if (isEditing) {
        const { error } = await supabase
          .from('assignment_requests')
          .update(requestPayload)
          .eq('id', params.id);

        if (error) throw error;
        Alert.alert('Success', 'Your assignment request has been updated successfully!');
      } else {
        const { error } = await supabase
          .from('assignment_requests')
          .insert(requestPayload);

        if (error) throw error;
        Alert.alert('Success', 'Your assignment request has been posted successfully!');
      }

      router.replace({ pathname: '/console/student' as any, params: { tab: 'requests' } });
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to save request.');
    } finally {
      setLoading(false);
    }
  };

  if (loading && !profile) {
    return (
      <View className="flex-1 items-center justify-center bg-slate-50">
        <ActivityIndicator size="large" color="#2563eb" />
      </View>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-slate-50">
      <StatusBar style="dark" />

      {/* Header */}
      <View className="bg-white px-6 py-4 border-b border-slate-100 flex-row items-center shadow-sm">
        <TouchableOpacity
          onPress={() => {
            if (router.canGoBack()) router.back();
            else router.replace('/console/student' as any);
          }}
          className="mr-4 p-2 -ml-2 rounded-lg active:bg-slate-50"
        >
          <Feather name="arrow-left" size={24} color="#334155" />
        </TouchableOpacity>
        <Text className="text-xl font-black text-slate-800">
          {isEditing ? 'Edit Assignment Request' : 'New Assignment Request'}
        </Text>
      </View>

      <ScrollView className="flex-1 px-6 py-4" contentContainerStyle={{ paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
        {/* Form Inputs */}
        <View className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm gap-5">
          
          <View>
            <Text className="text-xs font-bold text-slate-500 mb-1.5 uppercase tracking-wider">Subject</Text>
            <TextInput
              value={subject}
              onChangeText={setSubject}
              placeholder="e.g. Applied Physics, Chemistry-II"
              placeholderTextColor="#94a3b8"
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm text-slate-800 focus:border-blue-500 focus:bg-white"
            />
          </View>

          <View>
            <Text className="text-xs font-bold text-slate-500 mb-1.5 uppercase tracking-wider">Assignment Title</Text>
            <TextInput
              value={title}
              onChangeText={setTitle}
              placeholder="e.g. Lab Report 2, Term Paper 1"
              placeholderTextColor="#94a3b8"
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm text-slate-800 focus:border-blue-500 focus:bg-white"
            />
          </View>

          <View>
            <Text className="text-xs font-bold text-slate-500 mb-2 uppercase tracking-wider">Academic Level</Text>
            <View className="flex-row gap-2">
              {ACADEMIC_LEVELS.map(level => {
                const isActive = academicLevel === level;
                return (
                  <TouchableOpacity
                    key={level}
                    onPress={() => setAcademicLevel(level)}
                    className={`flex-1 py-2 rounded-xl border items-center justify-center ${isActive ? 'bg-blue-600 border-blue-600' : 'bg-slate-50 border-slate-200'}`}
                  >
                    <Text className={`text-xs font-bold ${isActive ? 'text-white' : 'text-slate-500'}`}>{level}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          <View>
            <Text className="text-xs font-bold text-slate-500 mb-1.5 uppercase tracking-wider">Deadline</Text>
            <TextInput
              value={deadline}
              onChangeText={setDeadline}
              placeholder="e.g. 2026-07-25 05:00 PM"
              placeholderTextColor="#94a3b8"
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm text-slate-800 focus:border-blue-500 focus:bg-white"
            />
          </View>

          <View>
            <Text className="text-xs font-bold text-slate-500 mb-1.5 uppercase tracking-wider">Description & Instructions</Text>
            <TextInput
              value={description}
              onChangeText={setDescription}
              placeholder="Write specifications, requirements, guidelines or instructions..."
              placeholderTextColor="#94a3b8"
              multiline
              numberOfLines={4}
              style={{ textAlignVertical: 'top' }}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-800 focus:border-blue-500 focus:bg-white"
            />
          </View>

        </View>

        {/* Action Button */}
        <TouchableOpacity
          onPress={handleSave}
          disabled={loading}
          activeOpacity={0.85}
          className="mt-6 w-full bg-blue-600 py-3.5 rounded-2xl items-center justify-center shadow-lg shadow-blue-500/20 active:bg-blue-700"
        >
          {loading ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text className="font-black text-white text-base">
              {isEditing ? 'Update Request' : 'Post Assignment Request'}
            </Text>
          )}
        </TouchableOpacity>

      </ScrollView>
    </SafeAreaView>
  );
}
