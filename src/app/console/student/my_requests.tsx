import React, { useState, useEffect } from 'react';
import { View, Text, FlatList, TouchableOpacity, ActivityIndicator, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { router } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { supabase } from '@/app/core/supabase';

interface ExamRequest {
  id: number;
  student_name: string;
  dob: string;
  education_grade: string;
  phone: string;
  emergency_phone: string | null;
  exam_type: string;
  exam_language: string;
  id_proof: string;
  status: string;
  created_at: string;
}

export default function MyRequests() {
  const [requests, setRequests] = useState<ExamRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [role, setRole] = useState<'student' | 'scribe'>('student');
  const [fullName, setFullName] = useState('');

  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/console/student');
    }
  };

  const fetchRequests = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setLoading(false);
        return;
      }

      const { data: profile } = await supabase
        .from('profiles')
        .select('role, full_name')
        .eq('id', session.user.id)
        .single();
      
      const userRole = profile?.role || 'student';
      setRole(userRole);
      setFullName(profile?.full_name || '');

      let query = supabase.from('exam_requests').select('*');
      
      if (userRole === 'student') {
        query = query.eq('student_id', session.user.id);
      } else {
        query = query.eq('scribe_id', session.user.id);
      }

      const { data, error } = await query.order('created_at', { ascending: false });

      if (error) throw error;
      setRequests(data || []);
    } catch (error: any) {
      console.error('Error fetching requests:', error.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchRequests();
  }, []);

  const onRefresh = () => {
    setRefreshing(true);
    fetchRequests();
  };

  const getStatusStyle = (status: string) => {
    switch (status.toLowerCase()) {
      case 'pending':
        return { bg: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-700' };
      case 'matched':
        return { bg: 'bg-emerald-50', border: 'border-emerald-200', text: 'text-emerald-700' };
      case 'cancelled':
        return { bg: 'bg-slate-50', border: 'border-slate-200', text: 'text-slate-600' };
      default:
        return { bg: 'bg-blue-50', border: 'border-blue-200', text: 'text-blue-700' };
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  };

  return (
    <SafeAreaView className="flex-1 bg-slate-50">
      <StatusBar style="dark" />
      
      {/* Header */}
      <View className="bg-white px-6 py-4 border-b border-slate-100 flex-row items-center justify-between shadow-sm">
        <View className="flex-row items-center">
          {role === 'student' ? (
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

        <View className="flex-row items-center" style={{ gap: 10 }}>
          {role === 'student' && (
            <TouchableOpacity
              onPress={() => router.push('/console/student/request_form' as any)}
              className="flex-row items-center bg-blue-500 px-3 py-2 rounded-xl"
              style={{ gap: 6 }}
            >
              <Feather name="plus" size={14} color="#fff" />
              <Text className="text-white font-bold text-xs">New Request</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            onPress={() => router.push(role === 'student' ? '/console/student' : '/console/scribe')}
            className={`w-10 h-10 rounded-full items-center justify-center border-2 border-white shadow-md ${
              role === 'student' ? 'bg-blue-400 shadow-blue-500/30' : 'bg-emerald-500 shadow-emerald-500/30'
            }`}
          >
            <Text className="text-white font-black text-base">
              {fullName ? fullName.charAt(0).toUpperCase() : 'U'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {loading ? (
        <View className="flex-1 justify-center items-center bg-slate-50">
          <ActivityIndicator size="large" color="#2563eb" />
        </View>
      ) : (
        <FlatList
          className="flex-1 bg-slate-50"
          data={requests}
          keyExtractor={(item) => item.id.toString()}
          contentContainerStyle={{ padding: 24, paddingBottom: 40 }}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#2563eb']} />
          }
          ListEmptyComponent={
            <View className="bg-white p-8 rounded-2xl border border-slate-100 items-center justify-center mt-8">
              <Feather name="inbox" size={48} color="#94a3b8" />
              <Text className="text-slate-800 text-lg font-bold mt-4">
                {role === 'student' ? 'No Requests Found' : 'No Commitments'}
              </Text>
              <Text className="text-slate-400 text-sm mt-1 text-center">
                {role === 'student' 
                  ? "You haven't created any scribe requests yet." 
                  : "You don't have any confirmed scribe commitments yet."}
              </Text>
              {role === 'student' && (
                <TouchableOpacity 
                  onPress={() => router.push('/console/student/request_form')}
                  className="mt-6 bg-blue-500 py-3 px-6 rounded-xl"
                >
                  <Text className="text-white font-bold text-sm">Create Request</Text>
                </TouchableOpacity>
              )}
            </View>
          }
          renderItem={({ item }) => {
            const statusStyle = getStatusStyle(item.status);
            return (
              <View className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm mb-4">
                <View className="flex-row items-center justify-between mb-3">
                  <View>
                    <Text className="text-base font-bold text-slate-800">{item.exam_type} Exam</Text>
                    <Text className="text-slate-400 text-[10px] mt-0.5">Created on {formatDate(item.created_at)}</Text>
                  </View>
                  <View className={`py-0.5 px-2 rounded-full border ${statusStyle.bg} ${statusStyle.border}`}>
                    <Text className={`text-[10px] font-bold uppercase ${statusStyle.text}`}>{item.status}</Text>
                  </View>
                </View>

                <View className="space-y-1.5 border-t border-slate-50 pt-2.5">
                  <View className="flex-row items-center">
                    <Feather name="globe" size={12} color="#64748b" className="mr-2" />
                    <Text className="text-slate-600 text-xs">
                      <Text className="font-semibold text-slate-700">Languages: </Text>
                      {item.exam_language}
                    </Text>
                  </View>
                  <View className="flex-row items-center">
                    <Feather name="award" size={12} color="#64748b" className="mr-2" />
                    <Text className="text-slate-600 text-xs">
                      <Text className="font-semibold text-slate-700">Grade: </Text>
                      {item.education_grade}
                    </Text>
                  </View>
                  <View className="flex-row items-center">
                    <Feather name="file-text" size={12} color="#64748b" className="mr-2" />
                    <Text className="text-slate-600 text-xs">
                      <Text className="font-semibold text-slate-700">ID (Aadhar): </Text>
                      {item.id_proof}
                    </Text>
                  </View>
                </View>
              </View>
            );
          }}
        />
      )}

      {/* Bottom Navigation Tab Bar */}
      <View className="bg-white border-t border-slate-100 py-2.5 px-6 flex-row justify-around items-center shadow-lg">
        <TouchableOpacity onPress={() => router.replace({ pathname: '/console/student', params: { tab: 'home' } })} className="items-center">
          <Feather name="home" size={22} color="#64748b" />
          <Text className="text-slate-400 text-[10px] font-bold mt-1">Home</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => router.replace({ pathname: '/console/student', params: { tab: 'requests' } })} className="items-center">
          <Feather name="list" size={22} color={role === 'student' ? '#2563eb' : '#059669'} />
          <Text className={`text-[10px] font-bold mt-1 ${role === 'student' ? 'text-blue-600' : 'text-emerald-600'}`}>
            {role === 'student' ? 'Requests' : 'Commitments'}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => router.replace({ pathname: '/console/student', params: { tab: 'plan' } })} className="items-center">
          <Feather name="calendar" size={22} color="#64748b" />
          <Text className="text-slate-400 text-[10px] font-bold mt-1">Plan</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => router.replace({ pathname: '/console/student', params: { tab: 'settings' } })} className="items-center">
          <Feather name="user" size={22} color="#64748b" />
          <Text className="text-slate-400 text-[10px] font-bold mt-1">Account</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}
