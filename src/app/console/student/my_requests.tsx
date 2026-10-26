/**
 * My Requests screen — route `/console/student/my_requests`.
 *
 * A standalone list of exam requests for the signed-in user (no other screen
 * currently links here directly; the main student console has its own
 * requests tab). Works for both roles:
 *  - student: shows requests they created (`exam_requests.student_id`)
 *  - scribe:  shows requests they are committed to (`exam_requests.scribe_id`)
 *
 * Data: reads the user's `role` and `full_name` from `profiles`, then all
 * matching rows of `exam_requests`, newest first, via the `supabase` shim
 * (a custom client for the Rust/Axum backend, not real Supabase).
 * Supports pull-to-refresh. The bottom tab bar replaces the route with the
 * student console (`/console/student`) and selects a tab via the `tab` param.
 */
import React, { useState, useEffect } from 'react';
import { View, Text, FlatList, TouchableOpacity, ActivityIndicator, RefreshControl, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { router } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { supabase } from '@/core/supabase';

/**
 * Local shape of an `exam_requests` row — only the columns this screen
 * displays or keys on. `status` is free text such as 'pending', 'matched'
 * or 'cancelled' (see `getStatusStyle`). `id_proof` holds the student's
 * ID (Aadhaar) number entered on the request form.
 */
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

/**
 * Screen component (default export used by expo-router). No props.
 * Renders a header, the request list (spinner while loading, empty state
 * with a "Create Request" button for students) and a bottom tab bar.
 */
export default function MyRequests() {
  // List data + loading flags, and the viewer's role / name for the header avatar.
  const [requests, setRequests] = useState<ExamRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [role, setRole] = useState<'student' | 'scribe'>('student');
  const [fullName, setFullName] = useState('');

  /**
   * Load the viewer's profile and their exam requests.
   * Reads `profiles` (role, full_name) and `exam_requests`; filters by
   * `student_id` for students or `scribe_id` for scribes. Errors are only
   * logged. Always clears both `loading` and `refreshing` when done.
   */
  const fetchRequests = async () => {
    try {
      // No session (signed out) -> just stop the spinner and show the empty list.
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setLoading(false);
        return;
      }

      // Step 1: role decides which column the requests are filtered on.
      const { data: profile } = await supabase
        .from('profiles')
        .select('role, full_name')
        .eq('id', session.user.id)
        .single();
      
      const userRole = profile?.role || 'student';
      setRole(userRole);
      setFullName(profile?.full_name || '');

      // Step 2: build the role-specific `exam_requests` query, newest first.
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

  // Initial load on mount.
  useEffect(() => {
    fetchRequests();
  }, []);

  /** Pull-to-refresh handler for the FlatList. */
  const onRefresh = () => {
    setRefreshing(true);
    fetchRequests();
  };

  /**
   * Map a request status to Tailwind (NativeWind) class names for the badge.
   * Returns `{ bg, border, text }`; unknown statuses fall back to blue.
   */
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

  /** Format an ISO timestamp as an Indian-style short date, e.g. "05 Mar 2026". */
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
          {/* Brand mark: blue "अ" tile for students, green heart for scribes */}
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
          {/* Header actions: "New Request" (students only) + initial avatar that opens the role's console */}
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

      {/* Body: spinner while loading, otherwise the pull-to-refresh request list */}
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
                {/* Card header: exam type, creation date and status badge */}
                <View className="flex-row items-center justify-between mb-3">
                  <View>
                    <Text className="text-base font-bold text-slate-800">{item.exam_type} Exam</Text>
                    <Text className="text-slate-400 text-[10px] mt-0.5">Created on {formatDate(item.created_at)}</Text>
                  </View>
                  <View className={`py-0.5 px-2 rounded-full border ${statusStyle.bg} ${statusStyle.border}`}>
                    <Text className={`text-[10px] font-bold uppercase ${statusStyle.text}`}>{item.status}</Text>
                  </View>
                </View>

                {/* Card details: languages, grade and ID proof number */}
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

                {role === 'student' && item.status !== 'completed' && item.status !== 'cancelled' && (
                  <View style={{ flexDirection: 'row', gap: 10, marginTop: 12, paddingTop: 10, borderTopWidth: 1, borderColor: '#f1f5f9' }}>
                    <TouchableOpacity
                      onPress={() => {
                        Alert.alert(
                          'Cancel & Delete Exam Request',
                          'Are you sure you want to cancel and delete this exam request? This action cannot be undone.',
                          [
                            { text: 'Cancel', style: 'cancel' },
                            {
                              text: 'Delete Request',
                              style: 'destructive',
                              onPress: async () => {
                                await supabase.from('exam_requests').delete().eq('id', item.id);
                                fetchRequests();
                              },
                            },
                          ]
                        );
                      }}
                      style={{
                        flex: 1,
                        paddingVertical: 10,
                        borderRadius: 12,
                        borderWidth: 1.5,
                        borderColor: '#fca5a5',
                        backgroundColor: '#fff7f7',
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 6,
                      }}
                      activeOpacity={0.7}
                    >
                      <Feather name="trash-2" size={14} color="#ef4444" />
                      <Text style={{ fontFamily: 'Roboto', fontSize: 12.5, fontWeight: '800', color: '#ef4444' }}>
                        Delete Request
                      </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      onPress={() => {
                        router.push(`/console/student/request_form?id=${item.id}` as any);
                      }}
                      style={{
                        flex: 1,
                        paddingVertical: 10,
                        borderRadius: 12,
                        borderWidth: 1.5,
                        borderColor: '#bfdbfe',
                        backgroundColor: '#eff6ff',
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 6,
                      }}
                      activeOpacity={0.7}
                    >
                      <Feather name="edit-2" size={14} color="#2563eb" />
                      <Text style={{ fontFamily: 'Roboto', fontSize: 12.5, fontWeight: '800', color: '#2563eb' }}>
                        Edit Request
                      </Text>
                    </TouchableOpacity>
                  </View>
                )}
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
