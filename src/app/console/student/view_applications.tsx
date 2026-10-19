/**
 * Scribe applications for one of the student's requests.
 * Route: `/console/student/view_applications?id=<request id>` (optional `&type=assignment`).
 *
 * Opened from StudentRequestsView (the request cards' applications button). Lists the scribes whose
 * `scribe_applications` row for this request is still 'pending', each enriched with the scribe's
 * `profiles` row, achievement badges (from counts of their completed `exam_requests` /
 * `assignment_requests`) and an average rating from `scribe_reviews`. The student can search by name,
 * open a scribe's profile + reviews, and accept or reject an application.
 *
 * Accepting marks that application 'accepted' and the request's other applications 'rejected', sets the
 * request to 'matched' with the chosen `scribe_id`, inserts `notifications` for the accepted scribe, the
 * student and the other listed applicants (plus every urgent-call scribe when the request was an
 * emergency), then shows a success overlay and navigates back. Rejecting marks one application
 * 'rejected', notifies that scribe and reloads the list.
 *
 * All data goes through the `supabase` shim (core/supabase.ts), a custom client for the Rust/Axum
 * backend's `POST /api/query`, not real Supabase. The request table is `exam_requests`, or
 * `assignment_requests` when `type=assignment`.
 *
 * Notes: no current caller passes `type=assignment`; StudentRequestsPCView passes `request_id=` and
 * StudentHomeView / StudentPlanView pass no id, so those entry points do not identify a request.
 * Styling mixes NativeWind `className` utilities and inline styles (no StyleSheet).
 */
import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, Modal, TextInput, Image, Platform } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { router, useLocalSearchParams } from 'expo-router';
import { Feather, Ionicons } from '@expo/vector-icons';
import { supabase } from '@/core/supabase';
import { useInDesktopFrame } from '@/components/ui/DesktopShell';
import { useLanguage } from '@/core/translation';

/** One `scribe_applications` row as shown on this screen, plus data added by fetchApplications. */
interface Application {
  id: number;
  request_id: number;
  scribe_id: string;
  scribe_name: string;
  status: string;
  created_at: string;
  // Computed on this screen by fetchApplications (not stored on the application row).
  rating?: number;
  achievements?: string[];
  /** The applicant's `profiles` row (only the fields this screen shows). */
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

/**
 * Applications screen (default export for the route): header, applicant cards with accept/reject,
 * confirmation modal, success overlay, scribe profile modal and a copy of the console's bottom tab bar.
 */
export default function ViewApplicationsPage() {
  const insets = useSafeAreaInsets();
  const { t } = useLanguage();
  // Inside the desktop page frame the phone header bar and tab bar are hidden (the frame has its own brand bar).
  const inDesktopFrame = useInDesktopFrame();
  // Route params: `id` is the request id; `type=assignment` switches to assignment_requests.
  const params = useLocalSearchParams<{ id: string; type?: string }>();
  
  // Page loading flag, id of the application being accepted/rejected, the request row and its pending applications.
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

  /**
   * Opens the scribe profile modal for `app` and loads every `scribe_reviews` row for that scribe.
   * Errors just show an empty review list.
   */
  const handleOpenScribeProfile = async (app: Application) => {
    setViewingScribe(app);
    setProfileModalVisible(true);
    setLoadingReviews(true);
    try {
      // Load all reviews students have left for this scribe.
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

  // Load the request and its applications on mount and whenever the request id changes.
  useEffect(() => {
    fetchApplications();
  }, [params.id]);

  /**
   * Loads the request row, then its pending `scribe_applications`, and enriches each with the scribe's
   * profile, achievement badges and average rating. Errors are only logged; always clears `loading`.
   */
  const fetchApplications = async () => {
    try {
      // Pick the request table from the type param.
      const type = (params.type as string) === 'assignment' ? 'assignment' : 'exam';
      const table = type === 'assignment' ? 'assignment_requests' : 'exam_requests';
      
      // Load the request itself (its subject is shown in the title bar and it is used when accepting).
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
            // The applicant's profile.
            const { data: profile } = await supabase
              .from('profiles')
              .select('*')
              .eq('id', app.scribe_id)
              .single();

            // Completed exams and assignments, counted to award achievement badges.
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

            // Badge thresholds: 5 / 15 / 30 completed exams, 1 / 5 completed assignments.
            const achievements: string[] = [];
            if (examCount >= 5) achievements.push('Bronze Volunteer');
            if (examCount >= 15) achievements.push('Silver Volunteer');
            if (examCount >= 30) achievements.push('Gold Elite Scribe');
            if (asgCount >= 1) achievements.push('Assignment Ally');
            if (asgCount >= 5) achievements.push('Submission Hero');
            
            // Rating = mean over reviews of each review's average of its five category scores (0 when unreviewed).
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

  /** Opens the confirmation modal to accept `app`. */
  const triggerAccept = (app: Application) => {
    setSelectedApp(app);
    setActionType('accept');
    setConfirmModalVisible(true);
  };

  /** Opens the confirmation modal to reject `app`. */
  const triggerReject = (app: Application) => {
    setSelectedApp(app);
    setActionType('reject');
    setConfirmModalVisible(true);
  };

  /**
   * Runs the confirmed accept or reject for `selectedApp` (see the file header for every write).
   * Accept ends with the success overlay and a navigation back after 2.5 s; reject reloads the list.
   * Errors are only logged to the console; the modal state is reset either way.
   */
  const handleConfirmAction = async () => {
    if (!selectedApp || !exam || !actionType) return;
    
    // Close the modal and show a spinner on this card's buttons.
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

        // Reload so the rejected applicant drops off the list.
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

  // Full-screen spinner until the first load finishes.
  if (loading) {
    return (
      <View className="flex-1 bg-white items-center justify-center">
        <ActivityIndicator size="large" color="#2563eb" />
      </View>
    );
  }

  // Main page: header, title bar, search, applicant cards, modals and the bottom tab bar.
  return (
    <View style={{ flex: 1, backgroundColor: '#f9fafb' }}>
      <StatusBar style="dark" />

      {/* Top Header Bar (matches dashboard look; phones only) */}
      {!inDesktopFrame && (
      <SafeAreaView edges={['top']} style={{ backgroundColor: '#ffffff', borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.07)' }}>
        <View style={{
          height: 60,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: 24,
        }}>
          {/* Logo & Modern Brand Wordmark with Subtitle */}
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <View style={{
              width: 44, height: 44, borderRadius: 14,
              backgroundColor: '#ffffff',
              borderWidth: 1.5, borderColor: '#F8FAFC',
              alignItems: 'center', justifyContent: 'center',
              padding: 1.5,
              overflow: 'hidden',
              shadowColor: '#0F172A', shadowOffset: { width: 0, height: 4 },
              shadowOpacity: 0.08, shadowRadius: 10, elevation: 4,
            }}>
              <Image 
                source={require('../../../../assets/images/custom/Pen_Logo.jpg')} 
                style={{ width: '100%', height: '100%', borderRadius: 11 }}
                resizeMode="cover"
              />
            </View>

            {/* Inset vertical divider line */}
            <View style={{ width: 1.5, height: 24, backgroundColor: '#CBD5E1', marginHorizontal: 12 }} />

            {/* Title + Subtitle Column */}
            <View style={{ justifyContent: 'center' }}>
              <Text style={{
                fontFamily: 'Roboto',
                fontSize: 20,
                fontWeight: '800',
                color: '#0f172a',
                letterSpacing: -0.5,
                lineHeight: 22,
              }}>
                Anulekh<Text style={{ color: '#2563eb', fontWeight: '900' }}>.</Text>
              </Text>
              <Text style={{
                fontFamily: 'Roboto',
                fontSize: 9.5,
                fontWeight: '700',
                color: '#64748B',
                letterSpacing: 1.8,
                textTransform: 'uppercase',
                marginTop: 2,
              }}>
                STUDENT PORTAL
              </Text>
            </View>
          </View>

          {/* Right Profile Initials */}
          <TouchableOpacity
            onPress={() => router.replace('/console/student?tab=settings')}
            style={{
              width: 42, height: 42, borderRadius: 21,
              backgroundColor: '#F8FAFC',
              borderWidth: 2, borderColor: '#F8FAFC',
              alignItems: 'center', justifyContent: 'center',
              shadowColor: '#0F172A', shadowOffset: { width: 0, height: 4 },
              shadowOpacity: 0.08, shadowRadius: 10, elevation: 4,
              overflow: 'hidden',
            }}
          >
            <Text style={{ color: '#2563eb', fontWeight: '900', fontSize: 18 }}>S</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
      )}
      
      {/* Sub Header for Page Title */}
      <View className="bg-white px-6 py-4 border-b border-slate-100 flex-row items-center shadow-sm">
        {/* Back: previous screen, or the student console when there is no history */}
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
          <Text className="text-xl font-black text-slate-800" numberOfLines={1}>{t('scribe_applications_title')}</Text>
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
              placeholder={t('search_applicants')}
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

      {/* Applicant list filtered by the name search; empty state when nothing matches */}
      <ScrollView className="flex-1 px-6 py-3" contentContainerStyle={{ paddingBottom: 20 }}>
        {applications.filter(app => app.scribe_name.toLowerCase().includes(searchQuery.toLowerCase())).length === 0 ? (
          <View className="bg-white p-8 rounded-3xl border border-slate-100 items-center justify-center mt-10">
            <Feather name="users" size={48} color="#94a3b8" />
            <Text className="text-slate-800 text-base font-bold mt-4">
              {searchQuery.length > 0 ? t('no_requests_found') : t('no_applicants_yet')}
            </Text>
            <Text className="text-slate-400 text-xs mt-1 text-center">
              {searchQuery.length > 0
                ? 'Try searching with another name or clear the query.'
                : t('no_applicants_desc')}
            </Text>
          </View>
        ) : (
          // One card per matching applicant.
          applications
            .filter(app => app.scribe_name.toLowerCase().includes(searchQuery.toLowerCase()))
            .map((app) => {
              // Disables this card's buttons while its accept/reject is in flight.
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

                  {/* Languages: profiles.languages may be an array, a JSON string or plain text */}
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
                          } catch {}
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
                      <Text className="font-semibold text-slate-755 font-bold">{t('location')}: </Text>
                      {app.profile?.location || 'N/A'}
                    </Text>
                  </View>
                </View>

                {/* View Scribe Profile Button */}
                <TouchableOpacity
                  onPress={() => handleOpenScribeProfile(app)}
                  style={{ backgroundColor: '#f1f5f9', borderWidth: 1, borderColor: '#e2e8f0', paddingVertical: 10, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}
                >
                  <Text style={{ fontFamily: 'Roboto', fontSize: 12, fontWeight: '800', color: '#475569' }}>{t('view_profile_btn')}</Text>
                </TouchableOpacity>

                {/* Action Buttons */}
                <View className="flex-row space-x-3 pt-3 border-t border-slate-50">
                  <TouchableOpacity
                    onPress={() => triggerReject(app)}
                    disabled={isWorking}
                    className="flex-1 bg-red-50 border border-red-100 active:bg-red-100 py-2.5 rounded-xl items-center justify-center"
                  >
                    <Text className="text-red-600 font-bold text-xs">{t('reject_applicant')}</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    onPress={() => triggerAccept(app)}
                    disabled={isWorking}
                    className="flex-1 bg-blue-500 active:bg-blue-600 py-2.5 rounded-xl items-center justify-center shadow-md shadow-blue-500/20"
                  >
                    {isWorking ? (
                      <ActivityIndicator color="white" size="small" />
                    ) : (
                      <Text className="text-white font-bold text-xs">{t('accept_applicant')}</Text>
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
            {/* Icon, title and message change with accept vs reject */}
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

            {/* Cancel / Confirm (Confirm runs handleConfirmAction) */}
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
      {/* Shown for 2.5 s after an accept, then the screen navigates back */}
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
                {/* Languages: same array / JSON string / plain text handling as on the card */}
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
                        } catch {}
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
                {/* Flags stored as strings: first_time 'yes', verification_status 'approved' */}
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
                
                {/* Spinner while loading, empty message, or one card per review (stars use rating_overall, default 5) */}
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

      {/* ── DOCKED BOTTOM NAVBAR (phones only) ── */}
      {!inDesktopFrame && (
        <SafeAreaView
          edges={['bottom']}
          style={{
            backgroundColor: '#ffffff',
            borderTopWidth: 1,
            borderTopColor: 'rgba(0,0,0,0.05)',
            shadowColor: '#0f172a',
            shadowOffset: { width: 0, height: -3 },
            shadowOpacity: 0.04,
            shadowRadius: 12,
            elevation: 6,
            zIndex: 100,
          }}
        >
          <View style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-around',
            paddingHorizontal: 8,
            paddingTop: 10,
            paddingBottom: Math.max(insets.bottom > 0 ? 6 : 12, 6),
          }}>
          {/* Tabs go back to the student console with ?tab=...; "Requests" is shown as active */}
          {[
            { id: 'home',     iconActive: 'home',          iconInactive: 'home-outline',          label: 'Home' },
            { id: 'requests', iconActive: 'document-text', iconInactive: 'document-text-outline', label: 'Requests' },
            { id: 'plan',     iconActive: 'calendar',      iconInactive: 'calendar-outline',      label: 'Plan' },
            { id: 'settings', iconActive: 'person',        iconInactive: 'person-outline',        label: 'Account' },
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
                activeOpacity={0.7}
                style={{
                  flex: 1,
                  alignItems: 'center',
                  justifyContent: 'center',
                  paddingVertical: 3,
                  position: 'relative',
                }}
              >
                {/* Soft ambient aura around active icon */}
                {active && (
                  <View
                    pointerEvents="none"
                    style={{
                      position: 'absolute',
                      top: -4,
                      width: 48,
                      height: 48,
                      borderRadius: 24,
                      backgroundColor: 'rgba(37, 99, 235, 0.07)',
                      ...(Platform.OS === 'web'
                        ? ({
                            background: 'radial-gradient(circle, rgba(37, 99, 235, 0.12) 0%, rgba(37, 99, 235, 0) 72%)',
                          } as any)
                        : {}),
                    }}
                  />
                )}
                <Ionicons
                  name={(active ? tab.iconActive : tab.iconInactive) as any}
                  size={24}
                  color={active ? '#1D4ED8' : '#64748B'}
                />
                <Text style={{
                  fontFamily: 'Roboto',
                  fontSize: 12,
                  fontWeight: active ? '700' : '500',
                  marginTop: 4,
                  color: active ? '#1D4ED8' : '#64748B',
                }}>
                  {tab.label}
                </Text>
              </TouchableOpacity>
            );
          })}
          </View>
        </SafeAreaView>
      )}

    </View>
  );
}
