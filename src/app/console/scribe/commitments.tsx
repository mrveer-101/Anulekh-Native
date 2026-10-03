/**
 * Scribe "Commitments" screen — route `/console/scribe/commitments`.
 *
 * Older standalone version of the scribe's Commitments tab. Nothing in the app
 * currently links here: the scribe dashboard (app/console/scribe/index.tsx)
 * renders components/scribe/ScribeCommitmentsView.tsx in its 'commitments'
 * tab instead. The route still works if opened directly.
 *
 * Data (via the `supabase` shim, i.e. the Rust/Axum backend):
 *  - `exam_requests` where status = 'matched' and scribe_id = the signed-in
 *    user, newest first — the exams this scribe has confirmed;
 *  - the scribe's `profiles.full_name`, used only for the avatar initial.
 * Redirects to `/auth/login` without a session. Pull-to-refresh reloads.
 *
 * Styling uses NativeWind `className` utilities. The bottom bar is a fake tab
 * bar that jumps back to the scribe dashboard with `?tab=...`.
 */
import React, { useState, useEffect } from 'react';
import { View, Text, FlatList, TouchableOpacity, ActivityIndicator, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { router } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { supabase } from '@/core/supabase';

/**
 * Lists the signed-in scribe's matched exam requests.
 *
 * @returns A spinner while loading, then a header, a pull-to-refresh list of
 *          commitment cards (or an empty state) and a bottom navigation bar.
 */
export default function VolunteerCommitments() {
  // `loading` = first load spinner; `refreshing` = pull-to-refresh indicator.
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [commitments, setCommitments] = useState<any[]>([]);
  const [fullName, setFullName] = useState('');

  /**
   * Loads the scribe's matched `exam_requests` and their `profiles.full_name`.
   * Redirects to `/auth/login` if signed out. Errors are logged only.
   * Always clears both `loading` and `refreshing`.
   */
  const fetchCommitments = async () => {
    try {
      // Session guard.
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.replace('/auth/login');
        return;
      }

      // Confirmed exams assigned to this scribe, newest request first.
      const { data, error } = await supabase
        .from('exam_requests')
        .select('*')
        .eq('status', 'matched')
        .eq('scribe_id', session.user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setCommitments(data || []);

      // Scribe's name for the header avatar initial.
      const { data: profile } = await supabase
        .from('profiles')
        .select('full_name')
        .eq('id', session.user.id)
        .single();
      
      if (profile) {
        setFullName(profile.full_name || '');
      }
    } catch (error: any) {
      console.error('Error fetching commitments:', error.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  // Initial load on mount.
  useEffect(() => {
    fetchCommitments();
  }, []);

  /** Pull-to-refresh handler: shows the spinner and reloads the list. */
  const onRefresh = () => {
    setRefreshing(true);
    fetchCommitments();
  };

  /**
   * Formats an ISO date string as e.g. "Mar 5, 2026" (US English locale).
   * @param dateString Date/time string from the backend; empty → ''.
   */
  const formatDate = (dateString: string) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  // First-load spinner.
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
          onPress={() => router.push('/console/scribe')}
          className="w-10 h-10 rounded-full items-center justify-center border-2 border-white bg-emerald-500 shadow-md shadow-emerald-500/30"
        >
          <Text className="text-white font-black text-base">
            {fullName ? fullName.charAt(0).toUpperCase() : 'U'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Commitment list: one card per matched exam request (exam type, assigned date, student, language, contact) */}
      <FlatList
        className="flex-1 bg-slate-50"
        data={commitments}
        keyExtractor={(item) => item.id.toString()}
        contentContainerStyle={{ padding: 24, paddingBottom: 40 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#059669']} />
        }
        ListEmptyComponent={
          <View className="bg-white p-8 rounded-2xl border border-slate-100 items-center justify-center mt-8">
            <Feather name="inbox" size={48} color="#94a3b8" />
            <Text className="text-slate-800 text-lg font-bold mt-4">No Commitments</Text>
            <Text className="text-slate-400 text-sm mt-1 text-center">
              You don't have any confirmed scribe commitments yet. Accept an invite on the Home tab.
            </Text>
          </View>
        }
        renderItem={({ item }) => (
          <View className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm mb-4">
            <View className="flex-row items-center justify-between mb-3">
              <View>
                <Text className="text-base font-bold text-slate-800">{item.exam_type} Exam</Text>
                <Text className="text-slate-400 text-[10px] mt-0.5">Assigned on {formatDate(item.created_at)}</Text>
              </View>
              <View className="py-0.5 px-2 rounded-full border bg-emerald-50 border-emerald-200">
                <Text className="text-[10px] font-bold uppercase text-emerald-700">Matched</Text>
              </View>
            </View>

            <View className="space-y-1.5 border-t border-slate-50 pt-2.5">
              <View className="flex-row items-center">
                <Feather name="user" size={12} color="#64748b" className="mr-2" />
                <Text className="text-slate-600 text-xs">
                  <Text className="font-semibold text-slate-700">Student: </Text>
                  {item.student_name} ({item.education_grade})
                </Text>
              </View>
              <View className="flex-row items-center">
                <Feather name="globe" size={12} color="#64748b" className="mr-2" />
                <Text className="text-slate-600 text-xs">
                  <Text className="font-semibold text-slate-700">Language: </Text>
                  {item.exam_language}
                </Text>
              </View>
              <View className="flex-row items-center">
                <Feather name="phone" size={12} color="#64748b" className="mr-2" />
                <Text className="text-slate-600 text-xs">
                  <Text className="font-semibold text-slate-700">Contact: </Text>
                  {item.phone}
                </Text>
              </View>
            </View>
          </View>
        )}
      />

      {/* Bottom Navigation Tab Bar */}
      {/* Each button replaces this screen with the scribe dashboard opened on the given tab */}
      <View className="bg-white border-t border-slate-100 py-2.5 px-6 flex-row justify-around items-center shadow-lg">
        <TouchableOpacity onPress={() => router.replace({ pathname: '/console/scribe' as any, params: { tab: 'home' } })} className="items-center">
          <Feather name="home" size={22} color="#64748b" />
          <Text className="text-slate-400 text-[10px] font-bold mt-1">Home</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => router.replace({ pathname: '/console/scribe' as any, params: { tab: 'commitments' } })} className="items-center">
          <Feather name="list" size={22} color="#059669" />
          <Text className="text-emerald-600 text-[10px] font-bold mt-1">Commitments</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => router.replace({ pathname: '/console/scribe' as any, params: { tab: 'plan' } })} className="items-center">
          <Feather name="calendar" size={22} color="#64748b" />
          <Text className="text-slate-400 text-[10px] font-bold mt-1">Plan</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => router.replace({ pathname: '/console/scribe' as any, params: { tab: 'settings' } })} className="items-center">
          <Feather name="user" size={22} color="#64748b" />
          <Text className="text-slate-400 text-[10px] font-bold mt-1">Account</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}
