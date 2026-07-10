import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, Alert, Modal } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { router, useLocalSearchParams } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { supabase } from '../../core/supabase';

export default function ScribeApplyDetailsPage() {
  const params = useLocalSearchParams<{ id: string }>();
  
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [exam, setExam] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const [hasApplied, setHasApplied] = useState(false);
  const [showSuccessOverlay, setShowSuccessOverlay] = useState(false);

  useEffect(() => {
    fetchExamAndProfile();
  }, [params.id]);

  const fetchExamAndProfile = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.replace('/auth/login');
        return;
      }

      // 1. Fetch Scribe Profile
      const { data: profileData } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', session.user.id)
        .single();
      
      setProfile(profileData);

      // 2. Fetch Exam Details
      const { data: examData } = await supabase
        .from('exam_requests')
        .select('*')
        .eq('id', params.id)
        .single();
      
      setExam(examData);

      // 3. Check if Scribe has already applied
      if (examData) {
        const { data: existingApps } = await supabase
          .from('scribe_applications')
          .select('*')
          .eq('request_id', examData.id)
          .eq('scribe_id', session.user.id);
        
        if (existingApps && existingApps.length > 0) {
          setHasApplied(true);
        }
      }
    } catch (err) {
      console.error('Error fetching exam details:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleApply = async () => {
    if (!profile) return;

    if (profile.verification_status !== 'approved') {
      Alert.alert(
        'Verification Required',
        'Your profile must be approved by an administrator before you can apply as a scribe. Please complete your profile or click "Auto Approve" on the home screen.'
      );
      return;
    }

    setSubmitting(true);

    try {
      const { error } = await supabase
        .from('scribe_applications')
        .insert({
          request_id: exam.id,
          scribe_id: profile.id,
          scribe_name: profile.official_name || profile.full_name,
          status: 'pending'
        });

      if (error) throw error;

      // Create a notification for the Student
      await supabase
        .from('notifications')
        .insert({
          user_id: exam.student_id,
          title: 'New Scribe Application',
          message: `${profile.official_name || profile.full_name} has applied to be a scribe for your "${exam.subject || 'Exam'}" exam.`,
          is_read: 0,
          created_at: new Date().toISOString()
        });

      // Show success overlay and redirect
      setShowSuccessOverlay(true);
      setTimeout(() => {
        setShowSuccessOverlay(false);
        router.replace('/console/scribe');
      }, 3000);

    } catch (err: any) {
      Alert.alert('Application Failed', err.message || 'Failed to submit application.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <View className="flex-1 bg-white items-center justify-center">
        <ActivityIndicator size="large" color="#059669" />
      </View>
    );
  }

  if (!exam) {
    return (
      <SafeAreaView className="flex-1 bg-slate-50 justify-center items-center p-6">
        <Feather name="alert-circle" size={48} color="#ef4444" />
        <Text className="text-base font-bold text-slate-800 mt-4">Exam Request Not Found</Text>
        <TouchableOpacity onPress={() => router.back()} className="mt-4 bg-emerald-500 px-6 py-2.5 rounded-xl shadow-md">
          <Text className="text-white font-bold text-xs">Go Back</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-slate-50">
      <StatusBar style="dark" />
      
      {/* Header */}
      <View className="bg-white px-6 py-4 border-b border-slate-100 flex-row items-center shadow-sm">
        <TouchableOpacity 
          onPress={() => router.back()} 
          className="mr-4 p-2 -ml-2 rounded-lg active:bg-slate-50"
        >
          <Feather name="arrow-left" size={24} color="#334155" />
        </TouchableOpacity>
        <Text className="text-xl font-black text-slate-800">Exam Details</Text>
      </View>

      <ScrollView className="flex-1 px-6 py-3" contentContainerStyle={{ paddingBottom: 20 }}>
        {/* Main Details Card */}
        <View className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm space-y-4 mb-4">
          
          {/* Header & Status */}
          <View className="flex-row items-center justify-between border-b border-slate-50 pb-3">
            <View className="flex-1 pr-2">
              <Text className="text-xl font-black text-slate-850 text-slate-900">{exam.subject || 'Exam'}</Text>
              <Text className="text-xs font-semibold text-slate-400 mt-0.5">{exam.exam_type}</Text>
            </View>
            <View className="py-1 px-3 rounded-full border bg-amber-50 border-amber-200">
              <Text className="text-[10px] font-bold uppercase text-amber-700">{exam.status}</Text>
            </View>
          </View>

          {/* Details Grid */}
          <View className="space-y-3.5">
            <View className="flex-row items-start">
              <Feather name="calendar" size={16} color="#059669" className="mr-3.5 mt-0.5" />
              <View className="flex-1">
                <Text className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Date & Time</Text>
                <Text className="text-sm font-semibold text-slate-700 mt-0.5">{exam.exam_date || 'Date not specified'}</Text>
              </View>
            </View>

            <View className="flex-row items-start">
              <Feather name="map-pin" size={16} color="#059669" className="mr-3.5 mt-0.5" />
              <View className="flex-1">
                <Text className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Exam Venue</Text>
                <Text className="text-sm font-semibold text-slate-700 mt-0.5">{exam.exam_venue || 'Venue not specified'}</Text>
              </View>
            </View>

            <View className="flex-row items-start">
              <Feather name="globe" size={16} color="#059669" className="mr-3.5 mt-0.5" />
              <View className="flex-1">
                <Text className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Languages Required</Text>
                <Text className="text-sm font-semibold text-slate-700 mt-0.5">{exam.exam_language}</Text>
              </View>
            </View>

            <View className="flex-row items-start">
              <Feather name="user" size={16} color="#059669" className="mr-3.5 mt-0.5" />
              <View className="flex-1">
                <Text className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Student Name & Grade</Text>
                <Text className="text-sm font-semibold text-slate-700 mt-0.5">{exam.student_name} ({exam.education_grade})</Text>
              </View>
            </View>
          </View>

          {/* Admit Card Section */}
          {exam.admit_card_proof ? (
            <View className="pt-3 border-t border-slate-100">
              <Text className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Student's Admit Card / Proof</Text>
              <View className="bg-slate-50 border border-slate-200 rounded-2xl p-4 flex-row items-center justify-between">
                <View className="flex-row items-center flex-1 pr-2">
                  <View className="w-10 h-10 bg-emerald-50 rounded-xl items-center justify-center mr-3 border border-emerald-100">
                    <Feather name="image" size={18} color="#059669" />
                  </View>
                  <View className="flex-1">
                    <Text className="text-xs font-bold text-slate-800" numberOfLines={1}>{exam.admit_card_proof}</Text>
                    <Text className="text-[9px] text-slate-400 mt-0.5">JPEG Image • 1.2 MB</Text>
                  </View>
                </View>
                <TouchableOpacity className="p-2 bg-emerald-100/40 rounded-lg">
                  <Feather name="eye" size={14} color="#059669" />
                </TouchableOpacity>
              </View>
            </View>
          ) : null}

        </View>

        {/* Action Button */}
        {hasApplied ? (
          <View className="bg-emerald-50 border border-emerald-200 p-4 rounded-2xl flex-row items-center justify-center">
            <Feather name="clock" size={16} color="#059669" className="mr-2" />
            <Text className="text-emerald-800 text-xs font-bold">Application Pending Approval</Text>
          </View>
        ) : (
          <TouchableOpacity
            onPress={handleApply}
            disabled={submitting}
            className="w-full bg-emerald-500 active:bg-emerald-600 py-3.5 rounded-2xl items-center justify-center shadow-lg shadow-emerald-500/20"
          >
            {submitting ? (
              <ActivityIndicator color="white" size="small" />
            ) : (
              <Text className="text-white font-bold text-sm">Apply as Scribe</Text>
            )}
          </TouchableOpacity>
        )}
      </ScrollView>

      {/* 100% APPLICATION SUCCESS OVERLAY */}
      {showSuccessOverlay && (
        <View className="absolute inset-0 bg-slate-950/80 items-center justify-center z-50">
          <View className="bg-white/95 p-8 rounded-3xl items-center border border-slate-200/50 shadow-2xl w-80">
            {/* Pulsing Success Icon */}
            <View className="w-20 h-20 bg-emerald-50 rounded-full items-center justify-center mb-5 border-2 border-emerald-500 shadow-lg shadow-emerald-500/20">
              <Feather name="check" size={40} color="#059669" />
            </View>
            
            <Text className="text-2xl font-black text-slate-900 text-center tracking-tight">Application Sent!</Text>
            <Text className="text-xs font-semibold text-slate-500 text-center mt-2 px-2 leading-relaxed">
              Your application has been sent to the student. You will be notified once they accept or reject it.
            </Text>
            
            {/* Loading Indicator */}
            <View className="flex-row space-x-1.5 mt-6 items-center">
              <ActivityIndicator size="small" color="#059669" className="mr-2" />
              <Text className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Returning to Portal...</Text>
            </View>
          </View>
        </View>
      )}

    </SafeAreaView>
  );
}
