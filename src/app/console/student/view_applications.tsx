import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, Modal, TextInput, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { router, useLocalSearchParams } from 'expo-router';
import { Feather, Ionicons } from '@expo/vector-icons';
import { supabase } from '@/core/supabase';

interface Application {
  id: number;
  request_id: number;
  scribe_id: string;
  scribe_name: string;
  status: string;
  created_at: string;
  rating?: number;
  achievements?: string[];
  profile?: {
    full_name: string;
    phone: string;
    education_level: string;
    languages: string[];
    location: string;
    occupation: string;
    first_time?: string;
    verification_status?: string;
  };
}

export default function ViewApplicationsPage() {
  const params = useLocalSearchParams<{ id: string; type?: string }>();
  
  const [loading, setLoading] = useState(true);
  const [actioning, setActioning] = useState<number | null>(null);
  const [exam, setExam] = useState<any>(null);
  const [applications, setApplications] = useState<Application[]>([]);

  // Custom Modal States
  const [confirmModalVisible, setConfirmModalVisible] = useState(false);
  const [selectedApp, setSelectedApp] = useState<Application | null>(null);
  const [actionType, setActionType] = useState<'accept' | 'reject' | null>(null);
  const [showSuccessOverlay, setShowSuccessOverlay] = useState(false);

  // Scribe Profile Modal States
  const [profileModalVisible, setProfileModalVisible] = useState(false);
  const [viewingScribe, setViewingScribe] = useState<Application | null>(null);
  const [viewingReviews, setViewingReviews] = useState<any[]>([]);
  const [loadingReviews, setLoadingReviews] = useState(false);

  // Scribe name search query state
  const [searchQuery, setSearchQuery] = useState('');

  const handleOpenScribeProfile = async (app: Application) => {
    setViewingScribe(app);
    setProfileModalVisible(true);
    setLoadingReviews(true);
    try {
      const { data, error } = await supabase
        .from('scribe_reviews')
        .select('*')
        .eq('scribe_id', app.scribe_id);
      if (!error && data) {
        setViewingReviews(data);
      } else {
        setViewingReviews([]);
      }
    } catch (e) {
      console.error(e);
      setViewingReviews([]);
    } finally {
      setLoadingReviews(false);
    }
  };

  useEffect(() => {
    fetchApplications();
  }, [params.id]);

  const fetchApplications = async () => {
    try {
      const type = (params.type as string) === 'assignment' ? 'assignment' : 'exam';
      const table = type === 'assignment' ? 'assignment_requests' : 'exam_requests';
      
      const { data: requestData } = await supabase
        .from(table)
        .select('*')
        .eq('id', params.id)
        .single();
      
      setExam(requestData);

      if (requestData) {
        // Fetch Scribe Applications for this request
        const { data: apps, error } = await supabase
          .from('scribe_applications')
          .select('*')
          .eq('request_id', requestData.id)
          .eq('status', 'pending');

        if (error) throw error;

        // Enrich each application with Scribe profile, achievements, and ratings
        const enrichedApps = await Promise.all(
          (apps || []).map(async (app: any) => {
            const { data: profile } = await supabase
              .from('profiles')
              .select('*')
              .eq('id', app.scribe_id)
              .single();

            const { data: completedExams } = await supabase
              .from('exam_requests')
              .select('id')
              .eq('scribe_id', app.scribe_id)
              .eq('status', 'completed');

            const { data: completedAsgs } = await supabase
              .from('assignment_requests')
              .select('id')
              .eq('scribe_id', app.scribe_id)
              .eq('status', 'completed');

            const examCount = completedExams ? completedExams.length : 0;
            const asgCount = completedAsgs ? completedAsgs.length : 0;

            const achievements: string[] = [];
            if (examCount >= 5) achievements.push('Bronze Volunteer');
            if (examCount >= 15) achievements.push('Silver Volunteer');
            if (examCount >= 30) achievements.push('Gold Elite Scribe');
            if (asgCount >= 1) achievements.push('Assignment Ally');
            if (asgCount >= 5) achievements.push('Submission Hero');
            
            const { data: reviews } = await supabase
              .from('scribe_reviews')
              .select('*')
              .eq('scribe_id', app.scribe_id);

            let finalRating = 0;
            if (reviews && reviews.length > 0) {
              let sumExamAverages = 0;
              reviews.forEach((r: any) => {
                const punct = r.rating_punctuality || 0;
                const comm = r.rating_communication || 0;
                const speed = r.rating_speed || 0;
                const behavior = r.rating_behavior || 0;
                const overall = r.rating_overall || 0;
                sumExamAverages += (punct + comm + speed + behavior + overall) / 5.0;
              });
              finalRating = sumExamAverages / reviews.length;
            }

            return {
              ...app,
              profile: profile || undefined,
              rating: finalRating,
              achievements
            };
          })
        );

        setApplications(enrichedApps);
      }
    } catch (err) {
      console.error('Error fetching applications:', err);
    } finally {
      setLoading(false);
    }
  };

  const triggerAccept = (app: Application) => {
    setSelectedApp(app);
    setActionType('accept');
    setConfirmModalVisible(true);
  };

  const triggerReject = (app: Application) => {
    setSelectedApp(app);
    setActionType('reject');
    setConfirmModalVisible(true);
  };

  const handleConfirmAction = async () => {
    if (!selectedApp || !exam || !actionType) return;
    
    setConfirmModalVisible(false);
    setActioning(selectedApp.id);

    try {
      if (actionType === 'accept') {
        // 1. Update this application to 'accepted'
        await supabase
          .from('scribe_applications')
          .update({ status: 'accepted' })
          .eq('id', selectedApp.id);

        // 2. Update all other applications for this request to 'rejected'
        await supabase
          .from('scribe_applications')
          .update({ status: 'rejected' })
          .eq('request_id', exam.id)
          .neq('id', selectedApp.id);

        // 3. Update request to 'matched' and assign the scribe_id
        const reqType = (params as any).type === 'assignment' ? 'assignment' : 'exam';
        const targetTable = reqType === 'assignment' ? 'assignment_requests' : 'exam_requests';
        const { error } = await supabase
          .from(targetTable)
          .update({ 
            status: 'matched',
            scribe_id: selectedApp.scribe_id
          })
          .eq('id', exam.id);

        if (error) throw error;

        // 4. Create Notification for Accepted Scribe
        await supabase
          .from('notifications')
          .insert({
            user_id: selectedApp.scribe_id,
            title: 'Application Accepted! 🎉',
            message: `Your application to scribe for "${exam.subject}" has been accepted. You are now confirmed!`,
            is_read: 0,
            created_at: new Date().toISOString()
          });

        // 5. Create Notification for Student
        await supabase
          .from('notifications')
          .insert({
            user_id: exam.student_id,
            title: 'Scribe Confirmed',
            message: `You have confirmed ${selectedApp.scribe_name} as your scribe for "${exam.subject}".`,
            is_read: 0,
            created_at: new Date().toISOString()
          });

        // 6. Create Notifications for Rejected Scribes
        const otherApps = applications.filter(app => app.id !== selectedApp.id);
        for (const otherApp of otherApps) {
          await supabase
            .from('notifications')
            .insert({
              user_id: otherApp.scribe_id,
              title: 'Application Update',
              message: `Your application to scribe for "${exam.subject}" was not accepted.`,
              is_read: 0,
              created_at: new Date().toISOString()
            });
        }
        // 7. If it was an emergency request, notify all emergency scribes that it has been filled
        if (exam.is_emergency === 'yes') {
          const { data: emergencyScribes } = await supabase
            .from('profiles')
            .select('id')
            .eq('role', 'scribe')
            .eq('urgent_calls', 'yes');
            
          if (emergencyScribes && emergencyScribes.length > 0) {
            const emergencyNotifs = emergencyScribes.map((s: any) => ({
              user_id: s.id,
              title: '✅ SOS Request Filled',
              message: `The emergency request for "${exam.subject}" today has been matched successfully. No need for anyone now, thank you!`,
              is_read: 0,
              created_at: new Date().toISOString()
            }));
            await supabase.from('notifications').insert(emergencyNotifs);
          }
        }

        // Show Success Overlay and route back
        setShowSuccessOverlay(true);
        setTimeout(() => {
          setShowSuccessOverlay(false);
          if (router.canGoBack()) {
            router.back();
          } else {
            router.replace('/console/student' as any);
          }
        }, 2500);

      } else {
        // Reject Action
        const { error } = await supabase
          .from('scribe_applications')
          .update({ status: 'rejected' })
          .eq('id', selectedApp.id);

        if (error) throw error;

        // Create Notification for Rejected Scribe
        await supabase
          .from('notifications')
          .insert({
            user_id: selectedApp.scribe_id,
            title: 'Application Update',
            message: `Your application to scribe for "${exam.subject}" was not accepted.`,
            is_read: 0,
            created_at: new Date().toISOString()
          });

        fetchApplications();
      }
    } catch (err: any) {
      console.error('Action failed:', err);
    } finally {
      setActioning(null);
      setSelectedApp(null);
      setActionType(null);
    }
  };

  if (loading) {
    return (
      <View className="flex-1 bg-white items-center justify-center">
        <ActivityIndicator size="large" color="#2563eb" />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#f9fafb' }}>
      <StatusBar style="dark" />

      {/* Top Header Bar (matches dashboard look) */}
      <SafeAreaView edges={['top']} style={{ backgroundColor: '#ffffff', borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.07)' }}>
        <View style={{
          height: 60,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: 24,
        }}>
          {/* Logo */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <View style={{
              width: 44, height: 44, borderRadius: 12,
              backgroundColor: 'rgba(37,99,235,0.09)', borderWidth: 1.5, borderColor: 'rgba(37,99,235,0.22)',
              alignItems: 'center', justifyContent: 'center',
              overflow: 'hidden',
            }}>
              <Image 
                source={require('../../../../assets/images/custom/Pen_Logo.jpg')} 
                style={{ width: '100%', height: '100%' }}
                resizeMode="cover"
              />
            </View>
            <Text style={{ fontFamily: 'Roboto', fontSize: 22, fontWeight: '900', color: '#0f172a', letterSpacing: -0.5 }}>Anulekh</Text>
          </View>

          {/* Right Profile Initials */}
          <TouchableOpacity
            onPress={() => router.replace('/console/student?tab=settings')}
            style={{
              width: 44, height: 44, borderRadius: 22,
              backgroundColor: 'rgba(37,99,235,0.09)', borderWidth: 1.5, borderColor: 'rgba(37,99,235,0.22)',
              alignItems: 'center', justifyContent: 'center',
            }}
          >
            <Text style={{ color: '#2563eb', fontWeight: '900', fontSize: 18 }}>S</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
      
      {/* Sub Header for Page Title */}
      <View className="bg-white px-6 py-4 border-b border-slate-100 flex-row items-center shadow-sm">
        <TouchableOpacity 
          onPress={() => {
            if (router.canGoBack()) {
              router.back();
            } else {
              router.replace('/console/student' as any);
            }
          }} 
          className="mr-4 p-2 -ml-2 rounded-lg active:bg-slate-50"
        >
          <Feather name="arrow-left" size={24} color="#334155" />
        </TouchableOpacity>
        <View className="flex-1">
          <Text className="text-xl font-black text-slate-800" numberOfLines={1}>Scribe Applications</Text>
          <Text className="text-[10px] font-semibold text-slate-400 mt-0.5">{exam?.subject || 'Exam'}</Text>
        </View>
      </View>

      {/* Search Scribe Bar */}
      {applications.length > 0 && (
        <View className="bg-white px-6 py-2.5 border-b border-slate-100">
          <View className="bg-slate-50 border border-slate-200 rounded-2xl flex-row items-center px-4 py-1">
            <Feather name="search" size={16} color="#64748b" style={{ marginRight: 8 }} />
            <TextInput
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder="Search scribes by name..."
              placeholderTextColor="#94a3b8"
              className="flex-1 text-slate-800 text-xs py-2 font-semibold"
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity onPress={() => setSearchQuery('')}>
                <Feather name="x" size={14} color="#64748b" />
              </TouchableOpacity>
            )}
          </View>
        </View>
      )}

      <ScrollView className="flex-1 px-6 py-3" contentContainerStyle={{ paddingBottom: 20 }}>
        {applications.filter(app => app.scribe_name.toLowerCase().includes(searchQuery.toLowerCase())).length === 0 ? (
          <View className="bg-white p-8 rounded-3xl border border-slate-100 items-center justify-center mt-10">
            <Feather name="users" size={48} color="#94a3b8" />
            <Text className="text-slate-800 text-base font-bold mt-4">
              {searchQuery.length > 0 ? 'No Matching Scribes' : 'No Applicants Yet'}
            </Text>
            <Text className="text-slate-400 text-xs mt-1 text-center">
              {searchQuery.length > 0
                ? 'Try searching with another name or clear the query.'
                : 'Scribes will appear here once they apply to assist you.'}
            </Text>
          </View>
        ) : (
          applications
            .filter(app => app.scribe_name.toLowerCase().includes(searchQuery.toLowerCase()))
            .map((app) => {
              const isWorking = actioning === app.id;
              return (
                <View key={app.id} className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm mb-4">
                  
                  {/* Scribe Header */}
                  <View className="flex-row items-center justify-between border-b border-slate-50 pb-3 mb-3">
                    <View className="flex-row items-center">
                      <View className="w-9 h-9 rounded-full bg-blue-100 items-center justify-center mr-3">
                        <Text className="text-blue-600 font-bold text-sm">
                          {app.scribe_name.charAt(0).toUpperCase()}
                        </Text>
                      </View>
                      <View>
                        <Text className="text-sm font-bold text-slate-800">{app.scribe_name}</Text>
                        <Text className="text-[10px] font-semibold text-slate-400 mt-0.5">
                          {app.profile?.occupation || 'Volunteer Scribe'}
                        </Text>
                      </View>
                    </View>
                  
                  {/* Scribe Rating Badge */}
                  <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#fef9c3', borderWidth: 1, borderColor: '#fef08a', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12, gap: 4 }}>
                    <Ionicons name="star" size={12} color="#ca8a04" />
                    <Text style={{ fontFamily: 'Roboto', fontSize: 11, fontWeight: '800', color: '#854d0e' }}>
                      {app.rating && app.rating > 0 ? app.rating.toFixed(1) : 'New'}
                    </Text>
                  </View>
                </View>

                {/* Scribe Profile Details */}
                <View className="space-y-2 mb-4">
                  <View className="flex-row items-center">
                    <Feather name="book-open" size={12} color="#64748b" className="mr-2" />
                    <Text className="text-slate-600 text-xs">
                      <Text className="font-semibold text-slate-700">Education: </Text>
                      {app.profile?.education_level || 'N/A'}
                    </Text>
                  </View>

                  <View className="flex-row items-center">
                    <Feather name="globe" size={12} color="#64748b" className="mr-2" />
                    <Text className="text-slate-600 text-xs">
                      <Text className="font-semibold text-slate-755 font-bold">Languages: </Text>
                      {(() => {
                        const langs = app.profile?.languages;
                        if (!langs) return 'N/A';
                        if (Array.isArray(langs)) return langs.join(', ');
                        if (typeof langs === 'string') {
                          try {
                            const parsed = JSON.parse(langs);
                            if (Array.isArray(parsed)) return parsed.join(', ');
                          } catch (_) {}
                          return langs;
                        }
                        return 'N/A';
                      })()}
                    </Text>
                  </View>

                  {/* Scribe Earned Achievements Row */}
                  {app.achievements && app.achievements.length > 0 && (
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
                      {app.achievements.map((ach: string, idx: number) => (
                        <View key={idx} style={{ backgroundColor: 'rgba(37,99,235,0.08)', borderWidth: 1, borderColor: 'rgba(37,99,235,0.2)', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10, flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                          <Ionicons name="trophy" size={10} color="#2563eb" />
                          <Text style={{ fontFamily: 'Roboto', fontSize: 10, fontWeight: '800', color: '#2563eb' }}>{ach}</Text>
                        </View>
                      ))}
                    </View>
                  )}

                  <View className="flex-row items-center">
                    <Feather name="map-pin" size={12} color="#64748b" className="mr-2" />
                    <Text className="text-slate-600 text-xs">
                      <Text className="font-semibold text-slate-755 font-bold">Location: </Text>
                      {app.profile?.location || 'N/A'}
                    </Text>
                  </View>
                </View>

                {/* View Scribe Profile Button */}
                <TouchableOpacity
                  onPress={() => handleOpenScribeProfile(app)}
                  style={{ backgroundColor: '#f1f5f9', borderWidth: 1, borderColor: '#e2e8f0', paddingVertical: 10, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}
                >
                  <Text style={{ fontFamily: 'Roboto', fontSize: 12, fontWeight: '800', color: '#475569' }}>View Scribe Account</Text>
                </TouchableOpacity>

                {/* Action Buttons */}
                <View className="flex-row space-x-3 pt-3 border-t border-slate-50">
                  <TouchableOpacity
                    onPress={() => triggerReject(app)}
                    disabled={isWorking}
                    className="flex-1 bg-red-50 border border-red-100 active:bg-red-100 py-2.5 rounded-xl items-center justify-center"
                  >
                    <Text className="text-red-600 font-bold text-xs">Reject</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    onPress={() => triggerAccept(app)}
                    disabled={isWorking}
                    className="flex-1 bg-blue-500 active:bg-blue-600 py-2.5 rounded-xl items-center justify-center shadow-md shadow-blue-500/20"
                  >
                    {isWorking ? (
                      <ActivityIndicator color="white" size="small" />
                    ) : (
                      <Text className="text-white font-bold text-xs">Accept</Text>
                    )}
                  </TouchableOpacity>
                </View>

              </View>
            );
          })
        )}
      </ScrollView>

      {/* 1. CUSTOM CONFIRMATION MODAL */}
      <Modal
        animationType="fade"
        transparent={true}
        visible={confirmModalVisible}
        onRequestClose={() => setConfirmModalVisible(false)}
      >
        <View className="flex-1 bg-slate-950/60 justify-center items-center px-6">
          <View className="bg-white w-full max-w-sm rounded-3xl p-6 shadow-2xl border border-slate-100">
            <View className="items-center mb-4">
              <View className={`w-12 h-12 rounded-full items-center justify-center mb-3 ${
                actionType === 'accept' ? 'bg-blue-50' : 'bg-red-550 bg-red-50'
              }`}>
                <Feather 
                  name={actionType === 'accept' ? 'check-circle' : 'alert-triangle'} 
                  size={24} 
                  color={actionType === 'accept' ? '#2563eb' : '#dc2626'} 
                />
              </View>
              <Text className="text-lg font-black text-slate-900 text-center">
                {actionType === 'accept' ? 'Accept Scribe?' : 'Reject Scribe?'}
              </Text>
              <Text className="text-xs text-slate-500 text-center mt-2 leading-relaxed px-2">
                {actionType === 'accept' 
                  ? `Are you sure you want to confirm ${selectedApp?.scribe_name} to scribe for your "${exam?.subject}" exam?`
                  : `Are you sure you want to reject ${selectedApp?.scribe_name}'s application?`
                }
              </Text>
            </View>

            <View className="flex-row space-x-3.5 mt-2">
              <TouchableOpacity 
                onPress={() => setConfirmModalVisible(false)}
                className="flex-1 bg-slate-100 border border-slate-200 py-2.5 rounded-xl items-center justify-center"
              >
                <Text className="text-slate-600 font-bold text-xs">Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                onPress={handleConfirmAction}
                className={`flex-1 py-2.5 rounded-xl items-center justify-center shadow-md ${
                  actionType === 'accept' ? 'bg-blue-500 shadow-blue-500/20' : 'bg-red-600 shadow-red-600/20'
                }`}
              >
                <Text className="text-white font-bold text-xs">Confirm</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* 2. MATCHED SUCCESS OVERLAY */}
      {showSuccessOverlay && (
        <View className="absolute inset-0 bg-slate-950/80 items-center justify-center z-50">
          <View className="bg-white/95 p-8 rounded-3xl items-center border border-slate-200/50 shadow-2xl w-80">
            {/* Pulsing Success Icon */}
            <View className="w-20 h-20 bg-blue-50 rounded-full items-center justify-center mb-5 border-2 border-blue-500 shadow-lg shadow-blue-500/20">
              <Feather name="check" size={40} color="#2563eb" />
            </View>
            
            <Text className="text-2xl font-black text-slate-900 text-center tracking-tight">Scribe Confirmed!</Text>
            <Text className="text-xs font-semibold text-slate-500 text-center mt-2 px-2 leading-relaxed">
              {selectedApp?.scribe_name} has been matched to your exam. You can now chat and coordinate with them.
            </Text>
            
            {/* Loading Indicator */}
            <View className="flex-row space-x-1.5 mt-6 items-center">
              <ActivityIndicator size="small" color="#2563eb" className="mr-2" />
              <Text className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Updating Dashboard...</Text>
            </View>
          </View>
        </View>
      )}

      {/* 3. SCRIBE ACCOUNT PROFILE MODAL */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={profileModalVisible}
        onRequestClose={() => setProfileModalVisible(false)}
      >
        <View style={{ flex: 1, backgroundColor: 'rgba(15,23,42,0.6)', justifyContent: 'center', alignItems: 'center', paddingHorizontal: 20 }}>
          <View style={{ backgroundColor: '#fff', width: '100%', maxWidth: 360, borderRadius: 28, overflow: 'hidden', shadowColor: '#000', shadowOffset: { width: 0, height: 20 }, shadowOpacity: 0.15, shadowRadius: 30, elevation: 15, borderWidth: 1, borderColor: 'rgba(0,0,0,0.05)' }}>
            
            {/* Modal Header */}
            <View style={{ paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#f1f5f9', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Text style={{ fontFamily: 'Roboto', fontSize: 13, fontWeight: '800', color: '#0f172a', textTransform: 'uppercase' }}>Scribe Account Profile</Text>
              <TouchableOpacity onPress={() => setProfileModalVisible(false)} style={{ padding: 4 }}>
                <Feather name="x" size={18} color="#64748b" />
              </TouchableOpacity>
            </View>

            {/* Profile Content */}
            <ScrollView style={{ maxHeight: 420 }} contentContainerStyle={{ padding: 20, gap: 14 }} showsVerticalScrollIndicator={false}>
              {/* Profile Header Card */}
              <View style={{ alignItems: 'center', marginBottom: 6 }}>
                <View style={{ width: 56, height: 56, borderRadius: 20, backgroundColor: 'rgba(37,99,235,0.09)', alignItems: 'center', justifyContent: 'center', marginBottom: 8 }}>
                  <Text style={{ fontSize: 20, fontWeight: '900', color: '#2563eb' }}>
                    {viewingScribe?.scribe_name?.charAt(0).toUpperCase() || 'S'}
                  </Text>
                </View>
                <Text style={{ fontFamily: 'Roboto', fontWeight: '900', fontSize: 18, color: '#0f172a' }}>{viewingScribe?.scribe_name}</Text>
                <Text style={{ fontFamily: 'Roboto', fontSize: 11, color: '#64748b', marginTop: 2 }}>{viewingScribe?.profile?.occupation || 'Volunteer Scribe'}</Text>
              </View>

              {/* Scribe Stats / Details */}
              <View style={{ backgroundColor: '#f8fafc', padding: 16, borderRadius: 18, borderWidth: 1, borderColor: '#e2e8f0', gap: 8 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Feather name="book-open" size={13} color="#2563eb" />
                  <Text style={{ fontFamily: 'Roboto', fontSize: 12, color: '#475569' }}>
                    <Text style={{ fontWeight: '800', color: '#334155' }}>Education: </Text>
                    {viewingScribe?.profile?.education_level || 'N/A'}
                  </Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Feather name="globe" size={13} color="#2563eb" />
                  <Text style={{ fontFamily: 'Roboto', fontSize: 12, color: '#475569' }}>
                    <Text style={{ fontWeight: '800', color: '#334155' }}>Languages: </Text>
                    {(() => {
                      const langs = viewingScribe?.profile?.languages;
                      if (!langs) return 'N/A';
                      if (Array.isArray(langs)) return langs.join(', ');
                      if (typeof langs === 'string') {
                        try {
                          const parsed = JSON.parse(langs);
                          if (Array.isArray(parsed)) return parsed.join(', ');
                        } catch (_) {}
                        return langs;
                      }
                      return 'N/A';
                    })()}
                  </Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Feather name="map-pin" size={13} color="#2563eb" />
                  <Text style={{ fontFamily: 'Roboto', fontSize: 12, color: '#475569' }}>
                    <Text style={{ fontWeight: '800', color: '#334155' }}>Location: </Text>
                    {viewingScribe?.profile?.location || 'N/A'}
                  </Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Feather name="award" size={13} color="#2563eb" />
                  <Text style={{ fontFamily: 'Roboto', fontSize: 12, color: '#475569' }}>
                    <Text style={{ fontWeight: '800', color: '#334155' }}>First Time Scribe? </Text>
                    {viewingScribe?.profile?.first_time === 'yes' ? 'Yes' : 'No'}
                  </Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Feather name="shield" size={13} color="#2563eb" />
                  <Text style={{ fontFamily: 'Roboto', fontSize: 12, color: '#475569' }}>
                    <Text style={{ fontWeight: '800', color: '#334155' }}>ID Verification: </Text>
                    {viewingScribe?.profile?.verification_status === 'approved' ? 'Aadhar Verified ✅' : 'Pending Verification'}
                  </Text>
                </View>
              </View>

              {/* Scribe Reviews / Student Feedback Section */}
              <View>
                <Text style={{ fontFamily: 'Roboto', fontSize: 11, fontWeight: '800', color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>Student Feedback & Reviews</Text>
                
                {loadingReviews ? (
                  <ActivityIndicator size="small" color="#2563eb" style={{ marginVertical: 10 }} />
                ) : viewingReviews.length === 0 ? (
                  <Text style={{ fontFamily: 'Roboto', fontSize: 12, color: '#94a3b8', fontStyle: 'italic', textAlign: 'center', paddingVertical: 10 }}>No feedback reviews submitted yet.</Text>
                ) : (
                  <View style={{ gap: 8 }}>
                    {viewingReviews.map((r, idx) => (
                      <View key={r.id || idx} style={{ backgroundColor: '#f8fafc', padding: 12, borderRadius: 16, borderWidth: 1, borderColor: '#e2e8f0', gap: 4 }}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                          <View style={{ flexDirection: 'row', gap: 2 }}>
                            {[1, 2, 3, 4, 5].map((star) => (
                              <Ionicons
                                key={star}
                                name={star <= (r.rating_overall || 5) ? 'star' : 'star-outline'}
                                size={11}
                                color={star <= (r.rating_overall || 5) ? '#eab308' : '#cbd5e1'}
                              />
                            ))}
                          </View>
                          <Text style={{ fontSize: 9, color: '#94a3b8' }}>
                            {r.created_at ? r.created_at.split('T')[0] : ''}
                          </Text>
                        </View>
                        {r.remark ? (
                          <Text style={{ fontFamily: 'Roboto', fontSize: 11, color: '#475569', marginTop: 2 }}>
                            "{r.remark}"
                          </Text>
                        ) : null}
                      </View>
                    ))}
                  </View>
                )}
              </View>
            </ScrollView>

            {/* Modal Footer / Close */}
            <View style={{ padding: 18, borderTopWidth: 1, borderTopColor: '#f1f5f9' }}>
              <TouchableOpacity 
                onPress={() => setProfileModalVisible(false)}
                style={{ width: '100%', backgroundColor: '#2563eb', paddingVertical: 12, borderRadius: 14, alignItems: 'center', justifyContent: 'center' }}
              >
                <Text style={{ fontFamily: 'Roboto', color: '#fff', fontWeight: '800', fontSize: 13 }}>Close Account Profile</Text>
              </TouchableOpacity>
            </View>

          </View>
        </View>
      </Modal>

      {/* Bottom Nav Bar (matches dashboard look) */}
      <SafeAreaView edges={['bottom']} style={{
        backgroundColor: 'rgba(255,255,255,0.82)',
        borderTopLeftRadius: 20,
        borderTopRightRadius: 20,
        shadowColor: '#000', shadowOffset: { width: 0, height: -4 },
        shadowOpacity: 0.07, shadowRadius: 12, elevation: 5,
      }}>
        <View style={{
          flexDirection: 'row',
          paddingVertical: 8,
          paddingHorizontal: 8,
          gap: 4,
          borderTopWidth: 1,
          borderTopColor: 'rgba(0,0,0,0.07)',
          borderTopLeftRadius: 20,
          borderTopRightRadius: 20,
        }}>
          {[
            { id: 'home',     iconActive: 'home',          iconInactive: 'home',          label: 'Home' },
            { id: 'requests', iconActive: 'document-text',  iconInactive: 'document-text',  label: 'Requests' },
            { id: 'plan',     iconActive: 'calendar',       iconInactive: 'calendar',       label: 'Plan' },
            { id: 'settings', iconActive: 'person',        iconInactive: 'person',        label: 'Account' },
          ].map((tab) => {
            const active = tab.id === 'requests';
            return (
              <TouchableOpacity
                key={tab.id}
                onPress={() => {
                  if (tab.id === 'requests') {
                    router.replace('/console/student?tab=requests');
                  } else {
                    router.replace(`/console/student?tab=${tab.id}`);
                  }
                }}
                style={{
                  flex: 1, alignItems: 'center', paddingVertical: 9,
                  borderRadius: 20,
                  backgroundColor: active ? 'rgba(37,99,235,0.09)' : 'transparent',
                }}
              >
                <Ionicons name={(active ? tab.iconActive : tab.iconInactive) as any} size={24} color={active ? '#2563eb' : '#94a3b8'} />
                <Text style={{
                  fontFamily: 'Roboto',
                  fontSize: 11, fontWeight: active ? '800' : '600',
                  marginTop: 3, color: active ? '#2563eb' : '#94a3b8',
                }}>
                  {tab.label}
                </Text>
                {active && (
                  <View style={{
                    position: 'absolute', bottom: 2,
                    width: 4, height: 4, borderRadius: 2, backgroundColor: '#2563eb',
                  }} />
                )}
              </TouchableOpacity>
            );
          })}
        </View>
      </SafeAreaView>

    </View>
  );
}
