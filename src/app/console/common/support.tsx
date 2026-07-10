import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput, ActivityIndicator, Alert, Modal, FlatList, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { router } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { supabase } from '../../core/supabase';

const ISSUE_TYPES = [
  'App bug / Crash',
  'Verification issue',
  'Exam request problem',
  'Scribe matching help',
  'Other / Suggestions'
];

export default function SupportScreen() {
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [role, setRole] = useState<'student' | 'scribe'>('student');
  
  // Ticket Form State
  const [issueType, setIssueType] = useState('Select Issue Type');
  const [description, setDescription] = useState('');
  const [referenceImage, setReferenceImage] = useState<string | null>(null);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [sending, setSending] = useState(false);

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

      setUserId(session.user.id);
      setEmail(session.user.email || '');

      const { data: profile, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', session.user.id)
        .single();

      if (error) throw error;
      if (profile) {
        setRole(profile.role || 'student');
        setPhone(profile.phone || '');
      }
    } catch (error) {
      console.error('Error fetching user profile for support:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSimulateAttachment = () => {
    // Simulated base64 mockup screenshot of the app
    setReferenceImage('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAADIAAAAyCAYAAAAeP4ixAAAACXBIWXMAAAsTAAALEwEAmpwYAAAAMklEQVR4nO3BMQEAAADCoPVPbQwfoAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAADgBC1iAAEJf8pIAAAAAElFTkSuQmCC');
    Alert.alert('Image Attached', 'Mock reference screenshot "support_screenshot.png" attached to ticket.');
  };

  const handleRemoveAttachment = () => {
    setReferenceImage(null);
  };

  const handleSubmitTicket = async () => {
    if (issueType === 'Select Issue Type') {
      Alert.alert('Required Field', 'Please select the type of issue you are facing.');
      return;
    }
    if (!description.trim()) {
      Alert.alert('Required Field', 'Please describe your issue in the text area.');
      return;
    }

    setSending(true);

    try {
      const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000';
      const res = await fetch(`${API_URL}/api/support/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: userId,
          email,
          phone,
          issue_type: issueType,
          description: description.trim(),
          reference_image: referenceImage
        })
      });

      if (!res.ok) {
        throw new Error('Failed to submit ticket to admin server.');
      }

      Alert.alert(
        'Ticket Created',
        'Your support ticket has been submitted successfully. Our admin team will inspect and resolve this shortly!',
        [
          {
            text: 'OK',
            onPress: () => {
              // Clear form
              setIssueType('Select Issue Type');
              setDescription('');
              setReferenceImage(null);
              // Navigate back
              handleBack();
            }
          }
        ]
      );
    } catch (error: any) {
      Alert.alert('Submission Error', error.message || 'Unable to reach support server.');
    } finally {
      setSending(false);
    }
  };

  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace(isStudent ? '/console/student' : '/console/scribe');
    }
  };

  const isStudent = role === 'student';
  const themeColorClass = isStudent ? 'bg-blue-600 active:bg-blue-700' : 'bg-emerald-600 active:bg-emerald-700';
  const themeTextClass = isStudent ? 'text-blue-600' : 'text-emerald-600';
  const themeBgClass = isStudent ? 'bg-blue-50' : 'bg-emerald-50';
  const themeBorderClass = isStudent ? 'focus:border-blue-500' : 'focus:border-emerald-500';

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
          <TouchableOpacity 
            onPress={handleBack} 
            className="mr-4 p-2 -ml-2 rounded-lg active:bg-slate-50"
          >
            <Feather name="arrow-left" size={24} color="#334155" />
          </TouchableOpacity>
          <Text className="text-xl font-black text-slate-800">Contact Support</Text>
        </View>
      </View>

      <ScrollView className="flex-1 px-6 py-6" contentContainerStyle={{ paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
        
        {/* Support Card Information */}
        <View className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm mb-6 flex-row items-center space-x-4">
          <View className={`w-12 h-12 rounded-2xl ${themeBgClass} items-center justify-center`}>
            <Feather name="life-buoy" size={24} color={isStudent ? '#2563eb' : '#059669'} />
          </View>
          <View className="flex-1">
            <Text className="font-black text-slate-800 text-base">Helpdesk Ticket Form</Text>
            <Text className="text-slate-400 text-xs mt-0.5">Please specify your issue category and details below.</Text>
          </View>
        </View>

        {/* 1-Slide Ticket Creation Form */}
        <View className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm space-y-4">
          
          {/* User ID (Prefilled & Readonly) */}
          <View>
            <Text className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">User ID (Auto-filled)</Text>
            <View className="w-full bg-slate-100 border border-slate-200 rounded-xl px-4 py-3">
              <Text className="text-slate-500 font-semibold text-sm">{userId}</Text>
            </View>
          </View>

          {/* Email (Prefilled & Readonly) */}
          <View>
            <Text className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">Email Address (Auto-filled)</Text>
            <View className="w-full bg-slate-100 border border-slate-200 rounded-xl px-4 py-3">
              <Text className="text-slate-500 font-semibold text-sm">{email}</Text>
            </View>
          </View>

          {/* Phone Number (Prefilled & Readonly) */}
          <View>
            <Text className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">Phone Number (Auto-filled)</Text>
            <View className="w-full bg-slate-100 border border-slate-200 rounded-xl px-4 py-3">
              <Text className="text-slate-500 font-semibold text-sm">{phone || 'Not Specified'}</Text>
            </View>
          </View>

          {/* Issue Type Selector */}
          <View>
            <Text className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">Type of Issue</Text>
            <TouchableOpacity 
              onPress={() => setIsDropdownOpen(true)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3.5 flex-row justify-between items-center"
            >
              <Text className={`font-semibold text-sm ${issueType === 'Select Issue Type' ? 'text-slate-400' : 'text-slate-800'}`}>
                {issueType}
              </Text>
              <Feather name="chevron-down" size={18} color="#64748b" />
            </TouchableOpacity>
          </View>

          {/* Description Text Area */}
          <View>
            <Text className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">Describe your Issue</Text>
            <TextInput 
              value={description}
              onChangeText={setDescription}
              multiline
              numberOfLines={5}
              placeholder="Provide a detailed description of the error, bug or matching issue..."
              textAlignVertical="top"
              className={`w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-slate-800 h-32 focus:bg-white ${themeBorderClass}`}
            />
          </View>

          {/* Reference Image upload (Optional) */}
          <View>
            <Text className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">Reference Screenshot (Optional)</Text>
            {referenceImage ? (
              <View className="border border-slate-200 rounded-xl p-3 bg-slate-50 flex-row items-center justify-between">
                <View className="flex-row items-center space-x-3">
                  <View className="w-12 h-12 bg-slate-200 rounded-lg overflow-hidden border border-slate-300">
                    <Image source={{ uri: referenceImage }} className="w-full h-full" resizeMode="cover" />
                  </View>
                  <Text className="text-xs font-bold text-slate-600">support_screenshot.png</Text>
                </View>
                <TouchableOpacity onPress={handleRemoveAttachment} className="p-2 rounded-full bg-rose-50 active:bg-rose-100">
                  <Feather name="trash-2" size={16} color="#ef4444" />
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity 
                onPress={handleSimulateAttachment}
                className="w-full border border-slate-200 rounded-xl p-4 bg-slate-50 flex-row justify-center items-center space-x-2 border-dashed"
              >
                <Feather name="image" size={18} color={isStudent ? '#2563eb' : '#059669'} />
                <Text className={`font-bold text-xs ${themeTextClass}`}>Attach Screenshot / Photo</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Submit Button */}
          <View className="pt-2">
            <TouchableOpacity 
              onPress={handleSubmitTicket}
              disabled={sending}
              className={`w-full ${themeColorClass} py-4 rounded-xl items-center justify-center shadow-lg flex-row space-x-2`}
            >
              {sending ? (
                <ActivityIndicator color="white" />
              ) : (
                <>
                  <Feather name="send" size={16} color="white" />
                  <Text className="text-white font-black text-base">Submit Support Ticket</Text>
                </>
              )}
            </TouchableOpacity>
          </View>

        </View>

      </ScrollView>

      {/* CUSTOM ISSUE TYPE DROPDOWN MODAL */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={isDropdownOpen}
        onRequestClose={() => setIsDropdownOpen(false)}
      >
        <View className="flex-1 bg-slate-950/50 justify-end">
          <View className="bg-white rounded-t-3xl p-6 shadow-2xl">
            <View className="flex-row justify-between items-center mb-4 pb-2 border-b border-slate-100">
              <Text className="text-base font-black text-slate-800">Select Issue Category</Text>
              <TouchableOpacity onPress={() => setIsDropdownOpen(false)} className="p-2">
                <Feather name="x" size={20} color="#64748b" />
              </TouchableOpacity>
            </View>

            <FlatList
              data={ISSUE_TYPES}
              keyExtractor={(item) => item}
              renderItem={({ item }) => (
                <TouchableOpacity
                  onPress={() => {
                    setIssueType(item);
                    setIsDropdownOpen(false);
                  }}
                  className="py-4 border-b border-slate-50 flex-row items-center justify-between"
                >
                  <Text className={`font-semibold text-sm ${issueType === item ? themeTextClass : 'text-slate-700'}`}>
                    {item}
                  </Text>
                  {issueType === item && <Feather name="check" size={18} color={isStudent ? '#2563eb' : '#059669'} />}
                </TouchableOpacity>
              )}
              contentContainerStyle={{ paddingBottom: 20 }}
            />
          </View>
        </View>
      </Modal>

    </SafeAreaView>
  );
}
