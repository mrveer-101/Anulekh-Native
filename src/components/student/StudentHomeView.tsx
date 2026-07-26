import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, Alert, Modal, Linking, Image } from 'react-native';
import { Feather, Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { supabase } from '@/core/supabase';
import { useLanguage } from '@/core/translation';
import { hoursUntilExam } from '@/core/examDate';
import AsyncStorage from '@react-native-async-storage/async-storage';

const getFirstName = (fullName: string | null | undefined, defaultVal: string) => {
  if (!fullName) return defaultVal;
  const first = fullName.trim().split(/\s+/)[0];
  if (!first) return defaultVal;
  return first.charAt(0).toUpperCase() + first.slice(1);
};

export default function StudentHomeView() {
  const { t } = useLanguage();
  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [confirmedPlans, setConfirmedPlans] = useState<any[]>([]);
  const [examRequestsCount, setExamRequestsCount] = useState(0);
  const [assignmentRequestsCount, setAssignmentRequestsCount] = useState(0);
  const [confirmedAssignmentsCount, setConfirmedAssignmentsCount] = useState(0);

  // Declaration Modal State
  const [selectedExam, setSelectedExam] = useState<any>(null);
  const [isDeclarationOpen, setIsDeclarationOpen] = useState(false);

  // Call Modal State
  const [callExam, setCallExam] = useState<any>(null);
  const [isCallOpen, setIsCallOpen] = useState(false);
  const [showMaskedNumber, setShowMaskedNumber] = useState(false);
  const [profilePhoto, setProfilePhoto] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      fetchSession();
    }, [])
  );

  const fetchSession = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      setUser(session.user);

      const localPhoto = await AsyncStorage.getItem(`profile_photo_${session.user.id}`);
      if (localPhoto) {
        setProfilePhoto(localPhoto);
      }

      // 1. Fetch Profile
      const { data: profileData } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', session.user.id)
        .single();

      setProfile(profileData);

      // 2. Fetch Student's Confirmed Plans (matched status) or active SOS requests
      const { data: committed } = await supabase
        .from('exam_requests')
        .select('*')
        .eq('student_id', session.user.id)
        .order('created_at', { ascending: false });

      const activePlans = (committed || []).filter((exam: any) => {
        return exam.status === 'matched' || (exam.status === 'pending' && exam.is_emergency === 'yes');
      });

      // Enrich active plans with scribe profile details
      const enrichedPlans = await Promise.all(
        activePlans.map(async (exam: any) => {
          let scribeProfile = null;
          if (exam.scribe_id) {
            const { data: scribe } = await supabase
              .from('profiles')
              .select('*')
              .eq('id', exam.scribe_id)
              .single();
            scribeProfile = scribe;
          }
          return {
            ...exam,
            scribeProfile: scribeProfile || undefined
          };
        })
      );

      setConfirmedPlans(enrichedPlans);

      // 3. Fetch Student's Total Exam Requests Count
      const { data: reqs } = await supabase
        .from('exam_requests')
        .select('id')
        .eq('student_id', session.user.id);
      
      setExamRequestsCount(reqs ? reqs.length : 0);

      // 4. Fetch Student's Total Assignment Requests Count
      const { data: assignments } = await supabase
        .from('assignment_requests')
        .select('id, status')
        .eq('student_id', session.user.id);

      setAssignmentRequestsCount(assignments ? assignments.length : 0);

      // 5. Fetch Confirmed Assignments Count
      const matchedAssignments = (assignments || []).filter((a: any) => a.status === 'matched');
      setConfirmedAssignmentsCount(matchedAssignments.length);

    } catch (err: any) {
      console.log('Error fetching student session:', err.message);
    } finally {
      setLoading(false);
    }
  };

  const simulateAdminApproval = async () => {
    setLoading(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ verification_status: 'approved' })
        .eq('id', user.id);

      if (error) throw error;

      Alert.alert(t('success'), t('profile_approved_desc'));
      await fetchSession();
    } catch (err: any) {
      Alert.alert(t('error'), err.message || t('approval_failed'));
    } finally {
      setLoading(false);
    }
  };

  const openCallSheet = (exam: any) => {
    if (!exam || !exam.exam_date) {
      Alert.alert("Contact Info Locked 🔒", "Contact details are only unlocked on the day of the exam for privacy protection.");
      return;
    }
    
    const dateStr = exam.exam_date.split('|')[0].trim();
    const todayStr = new Date().toISOString().split('T')[0];
    
    if (dateStr !== todayStr) {
      Alert.alert("Contact Info Locked 🔒", `Scribe contact details are protected and will unlock on the exam day (${dateStr}).`);
      return;
    }

    setCallExam(exam);
    setShowMaskedNumber(false);
    setIsCallOpen(true);
  };

  const closeCallSheet = () => setIsCallOpen(false);

  const dialNumber = async (phoneNumber: string) => {
    const url = `tel:${phoneNumber}`;
    try {
      const supported = await Linking.canOpenURL(url);
      if (supported) {
        await Linking.openURL(url);
      } else {
        Alert.alert(t('error'), t('call_unsupported'));
      }
    } catch (_) {
      Alert.alert(t('error'), t('call_error'));
    }
  };

  // SOS Emergency Scribe Broadcast
  const [sosSendingId, setSosSendingId] = useState<number | null>(null);
  // Which exam cards are expanded (collapsed by default)
  const [expandedExamIds, setExpandedExamIds] = useState<Set<number>>(new Set());

  const toggleExamCard = (id: number) => {
    setExpandedExamIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleSosBroadcast = (exam: any) => {
    Alert.alert(
      '🚨 Emergency SOS Broadcast',
      `Your scribe for "${exam.subject || 'your exam'}" cancelled? This sends a high-priority alert to all nearby volunteer scribes and reopens your request so someone can step in. Continue?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Send SOS',
          style: 'destructive',
          onPress: async () => {
            setSosSendingId(exam.id);
            try {
              // 1. Reopen the request so a new scribe can apply, and flag it as emergency SOS.
              const { error: reqErr } = await supabase
                .from('exam_requests')
                .update({ status: 'pending', scribe_id: null, is_emergency: 'yes' })
                .eq('id', exam.id);
              if (reqErr) throw reqErr;

              // 2. Alert all approved scribes with a high-priority notification.
              const { data: scribes } = await supabase
                .from('profiles')
                .select('*')
                .eq('role', 'scribe')
                .eq('verification_status', 'approved');

              const title = '🚨 URGENT: Scribe Needed';
              const message = `A candidate urgently needs a scribe for "${exam.subject || 'an exam'}" on ${exam.exam_date || 'the exam day'} at ${exam.exam_venue || 'the venue'}. Open now to help.`;

              for (const scribe of scribes || []) {
                await supabase.from('notifications').insert({
                  user_id: scribe.id,
                  title,
                  message,
                  is_read: 0,
                  created_at: new Date().toISOString(),
                });
              }

              Alert.alert(
                'SOS Sent',
                `Your emergency request was broadcast to ${(scribes || []).length} available scribe(s). You'll be notified as soon as someone applies.`
              );
              await fetchSession();
            } catch (err: any) {
              Alert.alert(t('error'), err.message || 'Failed to send SOS broadcast.');
            } finally {
              setSosSendingId(null);
            }
          },
        },
      ]
    );
  };

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 10, backgroundColor: '#f8fafc' }}>
        <ActivityIndicator size="large" color="#2563eb" />
      </View>
    );
  }

  const isVerified = profile?.verification_status === 'approved';
  const isPending = profile?.verification_status === 'pending';
  const isUnverified = !profile?.verification_status || profile.verification_status === 'unverified';

  // Slate-styled theme constants
  const TEXT = '#0f172a';
  const MUTED = '#64748b';
  const BLUE = '#2563eb';
  const BLUE_BG_LIGHT = 'rgba(37,99,235,0.08)';
  const GREEN = '#059669';
  const GREEN_BG_LIGHT = 'rgba(5,150,105,0.08)';
  const GREEN_BD = 'rgba(5,150,105,0.22)';

  return (
    <ScrollView style={{ flex: 1, paddingHorizontal: 24, paddingVertical: 12 }} contentContainerStyle={{ paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
      {/* Welcome & Profile Header Section */}
      <View style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 16,
        backgroundColor: '#fff',
        borderRadius: 24,
        padding: 16,
        borderWidth: 1,
        borderColor: '#e2e8f0',
        shadowColor: '#64748b',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.05,
        shadowRadius: 12,
        elevation: 2,
      }}>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text style={{ fontFamily: 'Roboto', fontSize: 11, fontWeight: '800', color: '#94a3b8', letterSpacing: 0.5 }}>
              Student Portal
            </Text>
            <Ionicons name="school" size={12} color="#94a3b8" />
          </View>
          <Text style={{ fontFamily: 'Roboto', fontSize: 24, fontWeight: '900', color: TEXT, marginTop: 4, letterSpacing: -0.5 }}>
            {t('hello_user', { name: getFirstName(profile?.full_name, 'Student') })}
          </Text>
        </View>

        {/* Dynamic Avatar & Badge Container */}
        <View style={{ position: 'relative' }}>
          <View style={{
            width: 48,
            height: 48,
            borderTopLeftRadius: 22,
            borderTopRightRadius: 10,
            borderBottomLeftRadius: 14,
            borderBottomRightRadius: 22,
            backgroundColor: BLUE_BG_LIGHT,
            borderWidth: 2,
            borderColor: 'rgba(37,99,235,0.18)',
            alignItems: 'center',
            justifyContent: 'center',
            shadowColor: BLUE,
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.15,
            shadowRadius: 8,
            elevation: 3,
          }}>
            <Feather name="award" size={22} color={BLUE} />
          </View>
          {isVerified && (
            <View style={{
              position: 'absolute',
              bottom: -4,
              right: -4,
              backgroundColor: '#10b981',
              width: 20,
              height: 20,
              borderRadius: 10,
              borderWidth: 2,
              borderColor: '#fff',
              alignItems: 'center',
              justifyContent: 'center',
            }}>
              <Feather name="check" size={10} color="#fff" />
            </View>
          )}
        </View>
      </View>

      {/* 1. Complete Profile Onboarding Card */}
      {isUnverified && (
        <View style={{ backgroundColor: '#fff', borderWidth: 1, borderColor: '#fef3c7', padding: 20, borderRadius: 24, shadowColor: '#d97706', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.1, shadowRadius: 16, elevation: 3, marginBottom: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <View style={{ flex: 1, paddingRight: 16 }}>
            <Text style={{ fontFamily: 'Roboto', fontSize: 15, fontWeight: '800', color: '#92400e' }}>{t('complete_profile')}</Text>
            <Text style={{ fontFamily: 'Roboto', fontSize: 12, color: MUTED, marginTop: 4, lineHeight: 18 }}>
              {t('profile_onboarding_desc')}
            </Text>
          </View>
          <TouchableOpacity 
            onPress={() => router.replace('/console/student/complete_profile' as any)}
            style={{ backgroundColor: '#d97706', paddingVertical: 10, paddingHorizontal: 16, borderRadius: 12 }}
          >
            <Text style={{ fontFamily: 'Roboto', color: '#fff', fontWeight: '800', fontSize: 12 }}>{t('verify_now')}</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* 2. Verification Pending Card with Simulation Tool */}
      {isPending && (
        <View style={{ backgroundColor: '#fff', borderWidth: 1, borderColor: '#dbeafe', padding: 20, borderRadius: 24, shadowColor: '#2563eb', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.1, shadowRadius: 16, elevation: 3, marginBottom: 20 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8, gap: 8 }}>
            <Feather name="clock" size={18} color={BLUE} />
            <Text style={{ fontFamily: 'Roboto', fontSize: 15, fontWeight: '800', color: '#1e40af' }}>{t('verification_pending')}</Text>
          </View>
          <Text style={{ fontFamily: 'Roboto', fontSize: 12, color: MUTED, marginBottom: 14, lineHeight: 18 }}>
            {t('verification_pending_desc')}
          </Text>
          <TouchableOpacity 
            onPress={simulateAdminApproval}
            style={{ width: '100%', backgroundColor: BLUE, paddingVertical: 12, borderRadius: 12, alignItems: 'center', justifyContent: 'center' }}
          >
            <Text style={{ fontFamily: 'Roboto', color: '#fff', fontWeight: '800', fontSize: 12 }}>{t('auto_approve')}</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* 3. Verified Badge (Vibrant soft banner) */}
      {isVerified && (
        <View style={{
          backgroundColor: '#ecfdf5',
          borderWidth: 1, borderColor: '#a7f3d0',
          paddingVertical: 10, paddingHorizontal: 16, borderRadius: 16,
          flexDirection: 'row', alignItems: 'center', marginBottom: 16, gap: 10,
        }}>
          <View style={{
            width: 24, height: 24, borderRadius: 12, backgroundColor: '#10b981',
            alignItems: 'center', justifyContent: 'center',
          }}>
            <Feather name="shield" size={12} color="#fff" />
          </View>
          <Text style={{ fontFamily: 'Roboto', color: '#047857', fontSize: 12, fontWeight: '800' }}>
            Verified Anulekh Candidate Profile
          </Text>
        </View>
      )}

      {/* Student Stats Summary (One block, color coded Blue, Orange, Green) */}
      <View style={{
        backgroundColor: '#ffffff',
        borderRadius: 24,
        borderWidth: 1, borderColor: '#e2e8f0',
        paddingVertical: 14,
        paddingHorizontal: 8,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-around',
        marginBottom: 20,
        shadowColor: '#64748b', shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.05, shadowRadius: 12, elevation: 2,
      }}>
        {/* Exams Stats (Blue) */}
        <View style={{ flex: 1, alignItems: 'center' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
            <Feather name="file-text" size={12} color="#2563eb" />
            <Text style={{ fontFamily: 'Roboto', fontSize: 10, fontWeight: '800', color: '#64748b', textTransform: 'uppercase' }}>Exams</Text>
          </View>
          <Text style={{ fontFamily: 'Roboto', fontSize: 20, fontWeight: '900', color: '#2563eb' }}>{examRequestsCount}</Text>
        </View>

        <View style={{ width: 1, height: 28, backgroundColor: '#e2e8f0' }} />

        {/* Assignments Stats (Orange) */}
        <View style={{ flex: 1, alignItems: 'center' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
            <Feather name="book-open" size={12} color="#ea580c" />
            <Text style={{ fontFamily: 'Roboto', fontSize: 10, fontWeight: '800', color: '#64748b', textTransform: 'uppercase' }}>Assignments</Text>
          </View>
          <Text style={{ fontFamily: 'Roboto', fontSize: 20, fontWeight: '900', color: '#ea580c' }}>{assignmentRequestsCount}</Text>
        </View>

        <View style={{ width: 1, height: 28, backgroundColor: '#e2e8f0' }} />

        {/* Matched Stats (Green) */}
        <View style={{ flex: 1, alignItems: 'center' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
            <Feather name="users" size={12} color="#10b981" />
            <Text style={{ fontFamily: 'Roboto', fontSize: 10, fontWeight: '800', color: '#64748b', textTransform: 'uppercase' }}>Matched</Text>
          </View>
          <Text style={{ fontFamily: 'Roboto', fontSize: 20, fontWeight: '900', color: '#10b981' }}>
            {confirmedPlans.length + confirmedAssignmentsCount}
          </Text>
        </View>
      </View>

      {/* Upcoming Exam Schedule / Plan */}
      <View style={{ marginBottom: 20 }}>
        <Text style={{ fontFamily: 'Roboto', color: '#475569', fontWeight: '800', fontSize: 14, marginBottom: 12 }}>My Schedule</Text>

        {confirmedPlans.length === 0 ? (
          <View style={{
            backgroundColor: '#ffffff',
            padding: 24, borderRadius: 24,
            borderWidth: 1.5, borderColor: '#e2e8f0',
            alignItems: 'center', justifyContent: 'center',
            shadowColor: '#64748b', shadowOffset: { width: 0, height: 6 },
            shadowOpacity: 0.08, shadowRadius: 16, elevation: 2,
          }}>
            <Feather name="calendar" size={28} color="#94a3b8" />
            <Text style={{ fontFamily: 'Roboto', color: '#94a3b8', fontSize: 12, marginTop: 8, textAlign: 'center' }}>{t('no_upcoming_exams')}</Text>
            <Text style={{ fontFamily: 'Roboto', color: '#64748b', fontSize: 11, marginTop: 6, textAlign: 'center', paddingHorizontal: 16 }}>
              {t('need_scribe_desc')}
            </Text>
            <TouchableOpacity 
              onPress={() => {
                if (isVerified) {
                  router.push('/console/student/request_form' as any);
                } else {
                  Alert.alert(t('error'), t('verify_first_error'));
                }
              }}
              style={{ 
                backgroundColor: BLUE, 
                paddingVertical: 12, paddingHorizontal: 24, 
                borderRadius: 12, marginTop: 16,
                shadowColor: BLUE, shadowOffset: { width: 0, height: 4 },
                shadowOpacity: 0.15, shadowRadius: 8, elevation: 3
              }}
            >
              <Text style={{ fontFamily: 'Roboto', color: '#fff', fontWeight: '900', fontSize: 13, letterSpacing: 0.2 }}>{t('request_scribe')}</Text>
            </TouchableOpacity>
          </View>
        ) : (
          confirmedPlans.map((exam) => {
            const isEmergency = exam.is_emergency === 'yes';
            const isExpanded = expandedExamIds.has(exam.id);

            return (
              <View
                key={exam.id}
                style={{
                  backgroundColor: '#ffffff',
                  borderRadius: 20,
                  borderWidth: isEmergency ? 2 : 1.5,
                  borderColor: isEmergency ? '#fca5a5' : '#e2e8f0',
                  shadowColor: isEmergency ? '#dc2626' : '#64748b',
                  shadowOffset: { width: 0, height: 6 },
                  shadowOpacity: isEmergency ? 0.12 : 0.07,
                  shadowRadius: 16,
                  elevation: 3,
                  marginBottom: 10,
                  overflow: 'hidden',
                }}
              >
                {/* ── Collapsed Header Row (Icon + Subject + Status + Chevron) ── */}
                <TouchableOpacity
                  onPress={() => toggleExamCard(exam.id)}
                  activeOpacity={0.8}
                  style={{
                    flexDirection: 'row', alignItems: 'center',
                    paddingHorizontal: 16, paddingVertical: 14, gap: 10,
                  }}
                >
                  {/* Subject/Alert icon */}
                  <View style={{
                    width: 38, height: 38, borderRadius: 11,
                    backgroundColor: isEmergency ? '#fef2f2' : BLUE_BG_LIGHT,
                    alignItems: 'center', justifyContent: 'center',
                    borderWidth: 1,
                    borderColor: isEmergency ? '#fecaca' : 'rgba(37,99,235,0.18)',
                  }}>
                    <Feather name={isEmergency ? 'alert-triangle' : 'book-open'} size={16}
                      color={isEmergency ? '#dc2626' : BLUE} />
                  </View>

                  {/* Subject Name */}
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontFamily: 'Roboto', fontSize: 15, fontWeight: '900', color: TEXT }} numberOfLines={1}>
                      {exam.subject || t('exam_fallback')}
                    </Text>
                  </View>

                  {/* Status pill */}
                  <View style={{
                    paddingVertical: 3, paddingHorizontal: 9, borderRadius: 20,
                    backgroundColor: isEmergency ? '#fef2f2' : 'rgba(5,150,105,0.08)',
                    borderWidth: 1,
                    borderColor: isEmergency ? '#fca5a5' : 'rgba(5,150,105,0.22)',
                    marginRight: 4,
                  }}>
                    <Text style={{
                      fontFamily: 'Roboto', fontSize: 9, fontWeight: '800',
                      color: isEmergency ? '#dc2626' : GREEN,
                    }}>
                      {isEmergency ? '🚨 SOS' : 'Confirmed'}
                    </Text>
                  </View>

                  {/* Chevron */}
                  <Feather
                    name={isExpanded ? 'chevron-up' : 'chevron-down'}
                    size={16} color={MUTED}
                  />
                </TouchableOpacity>

                {/* ── Expanded Detail Panel ── */}
                {isExpanded && (
                  <View style={{ borderTopWidth: 1, borderTopColor: '#f1f5f9', paddingHorizontal: 16, paddingTop: 12, paddingBottom: 14, gap: 10 }}>

                    {isEmergency && (
                      <View style={{
                        backgroundColor: '#fef2f2', padding: 10, borderRadius: 12,
                        borderWidth: 1, borderColor: '#fca5a5',
                        flexDirection: 'row', alignItems: 'center', gap: 8,
                      }}>
                        <Feather name="alert-triangle" size={13} color="#dc2626" />
                        <Text style={{ fontFamily: 'Roboto', color: '#b91c1c', fontSize: 11, fontWeight: '800', flex: 1 }}>
                          Scribe cancelled! Re-broadcasting emergency SOS to all available scribes.
                        </Text>
                      </View>
                    )}

                    {/* All details stacked inside expanded card */}
                    <View style={{ gap: 6 }}>
                      {/* 1. Level of exam */}
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Feather name="award" size={12} color="#64748b" style={{ width: 14 }} />
                        <Text style={{ fontFamily: 'Roboto', fontSize: 12, fontWeight: '600', color: '#475569' }}>
                          Level: {exam.exam_type}
                        </Text>
                      </View>

                      {/* 2. Date and time */}
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Feather name="calendar" size={12} color="#64748b" style={{ width: 14 }} />
                        <Text style={{ fontFamily: 'Roboto', fontSize: 12, fontWeight: '600', color: '#475569' }}>
                          Date & Time: {exam.exam_date || t('date_not_specified')}
                        </Text>
                      </View>

                      {/* 3. Location */}
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Feather name="map-pin" size={12} color="#64748b" style={{ width: 14 }} />
                        <Text style={{ fontFamily: 'Roboto', fontSize: 12, fontWeight: '600', color: '#475569' }} numberOfLines={1}>
                          Location: {exam.exam_venue || t('venue_not_specified')}
                        </Text>
                      </View>

                      {!isEmergency && (
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          <Feather name="user" size={12} color={BLUE} style={{ width: 14 }} />
                          <Text style={{ fontFamily: 'Roboto', color: '#475569', fontSize: 12, fontWeight: '600' }}>
                            {t('volunteer_scribe')}: {exam.scribeProfile?.full_name || t('volunteer_scribe')}
                          </Text>
                        </View>
                      )}

                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Feather name="globe" size={12} color={MUTED} style={{ width: 14 }} />
                        <Text style={{ fontFamily: 'Roboto', color: '#475569', fontSize: 12, fontWeight: '600' }}>
                          {t('exam_language')}: {exam.exam_language}
                        </Text>
                      </View>
                    </View>

                    {/* Action Buttons */}
                    <View style={{ gap: 8, marginTop: 2 }}>
                      {isEmergency ? (
                        <TouchableOpacity
                          onPress={() => router.push('/console/student/view_applications' as any)}
                          style={{
                            width: '100%', backgroundColor: '#dc2626',
                            paddingVertical: 11, borderRadius: 12,
                            alignItems: 'center', justifyContent: 'center',
                            flexDirection: 'row', gap: 6,
                          }}
                        >
                          <ActivityIndicator size="small" color="white" />
                          <Text style={{ fontFamily: 'Roboto', color: 'white', fontWeight: '800', fontSize: 12 }}>🚨 Tracking SOS Applications...</Text>
                        </TouchableOpacity>
                      ) : (
                        <>
                          <View style={{ flexDirection: 'row', gap: 8 }}>
                            <TouchableOpacity
                              onPress={() => openCallSheet(exam)}
                              style={{ flex: 1, backgroundColor: '#f8fafc', borderWidth: 1, borderColor: '#e2e8f0', paddingVertical: 10, borderRadius: 12, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6 }}
                            >
                              <Feather name="phone" size={12} color="#334155" />
                              <Text style={{ fontFamily: 'Roboto', color: '#334155', fontWeight: '800', fontSize: 12 }}>{t('call')}</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                              onPress={() => router.push(`/console/common/chat?requestId=${exam.id}` as any)}
                              style={{ flex: 1, backgroundColor: '#f8fafc', borderWidth: 1, borderColor: '#e2e8f0', paddingVertical: 10, borderRadius: 12, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6 }}
                            >
                              <Feather name="message-square" size={12} color="#334155" />
                              <Text style={{ fontFamily: 'Roboto', color: '#334155', fontWeight: '800', fontSize: 12 }}>{t('chat')}</Text>
                            </TouchableOpacity>
                          </View>

                          {(() => {
                            const hrs = hoursUntilExam(exam.exam_date);
                            const showSos = hrs !== null && hrs <= 24 && hrs > -6;
                            const sending = sosSendingId === exam.id;
                            if (showSos) {
                              return (
                                <View style={{ flexDirection: 'row', gap: 8 }}>
                                  <TouchableOpacity
                                    onPress={() => { setSelectedExam(exam); setIsDeclarationOpen(true); }}
                                    style={{ flex: 1, backgroundColor: BLUE, paddingVertical: 10, borderRadius: 12, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6, shadowColor: BLUE, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 8, elevation: 2 }}
                                  >
                                    <Feather name="file-text" size={12} color="white" />
                                    <Text style={{ fontFamily: 'Roboto', color: 'white', fontWeight: '800', fontSize: 12 }}>{t('view_declaration')}</Text>
                                  </TouchableOpacity>
                                  <TouchableOpacity
                                    onPress={() => handleSosBroadcast(exam)}
                                    disabled={sending}
                                    style={{ flex: 1, backgroundColor: '#fef2f2', borderWidth: 1.5, borderColor: '#fecaca', paddingVertical: 10, borderRadius: 12, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6 }}
                                  >
                                    {sending
                                      ? <ActivityIndicator size="small" color="#dc2626" />
                                      : <><Feather name="alert-triangle" size={12} color="#dc2626" /><Text style={{ fontFamily: 'Roboto', color: '#dc2626', fontWeight: '800', fontSize: 11 }}>SOS - Cancelled?</Text></>
                                    }
                                  </TouchableOpacity>
                                </View>
                              );
                            }
                            return (
                              <TouchableOpacity
                                onPress={() => { setSelectedExam(exam); setIsDeclarationOpen(true); }}
                                style={{ width: '100%', backgroundColor: BLUE, paddingVertical: 10, borderRadius: 12, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6, shadowColor: BLUE, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 8, elevation: 2 }}
                              >
                                <Feather name="file-text" size={12} color="white" />
                                <Text style={{ fontFamily: 'Roboto', color: 'white', fontWeight: '800', fontSize: 12 }}>{t('view_declaration')}</Text>
                              </TouchableOpacity>
                            );
                          })()}
                        </>
                      )}
                    </View>
                  </View>
                )}
              </View>
            );
          })
        )}


        {/* Persistent "New Request" action once at least one request already exists */}

        {confirmedPlans.length > 0 && (
          <TouchableOpacity
            onPress={() => {
              if (isVerified) {
                router.push('/console/student/request_form' as any);
              } else {
                Alert.alert(t('error'), t('verify_first_error'));
              }
            }}
            style={{ 
              width: '100%', 
              backgroundColor: BLUE, 
              paddingVertical: 16, 
              borderRadius: 16, 
              alignItems: 'center', 
              justifyContent: 'center', 
              flexDirection: 'row', 
              gap: 8, 
              marginTop: 14,
              shadowColor: BLUE,
              shadowOffset: { width: 0, height: 6 },
              shadowOpacity: 0.25,
              shadowRadius: 12,
              elevation: 4,
            }}
            activeOpacity={0.85}
          >
            <Feather name="plus" size={18} color="#ffffff" />
            <Text style={{ fontFamily: 'Roboto', color: '#ffffff', fontWeight: '900', fontSize: 15, letterSpacing: 0.3 }}>{t('request_scribe')}</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* 4. Need Help? Contact Support Card */}
      <TouchableOpacity 
        onPress={() => router.push('/console/common/support' as any)}
        style={{
          backgroundColor: '#fff',
          borderWidth: 1,
          borderColor: '#e2e8f0',
          padding: 20,
          borderRadius: 24,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.03,
          shadowRadius: 10,
          elevation: 1.5,
          marginTop: 10,
          marginBottom: 20,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}
      >
        <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 14 }}>
          <View style={{
            width: 44,
            height: 44,
            borderRadius: 14,
            backgroundColor: BLUE_BG_LIGHT,
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <Feather name="life-buoy" size={20} color={BLUE} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontFamily: 'Roboto', fontSize: 15, fontWeight: '800', color: TEXT }}>
              Need Help?
            </Text>
            <Text style={{ fontFamily: 'Roboto', fontSize: 12, color: MUTED, marginTop: 2 }}>
              Contact support to resolve application or matching issues
            </Text>
          </View>
        </View>
        <Feather name="chevron-right" size={18} color={MUTED} />
      </TouchableOpacity>

      {/* FORMAL SCRIBE DECLARATION MODAL */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={isDeclarationOpen}
        onRequestClose={() => setIsDeclarationOpen(false)}
      >
        <View style={{ flex: 1, backgroundColor: 'rgba(15,23,42,0.5)', justifyContent: 'center', alignItems: 'center', paddingHorizontal: 20 }}>
          <View style={{ backgroundColor: '#fff', width: '100%', maxWidth: 360, borderRadius: 28, overflow: 'hidden', shadowColor: '#000', shadowOffset: { width: 0, height: 20 }, shadowOpacity: 0.15, shadowRadius: 30, elevation: 15, borderWidth: 1, borderColor: 'rgba(0,0,0,0.05)' }}>
            {/* Modal Header */}
            <View style={{ paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#f1f5f9', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Text style={{ fontFamily: 'Roboto', fontSize: 13, fontWeight: '800', color: TEXT, textTransform: 'uppercase' }}>{t('scribe_declaration')}</Text>
              <TouchableOpacity onPress={() => setIsDeclarationOpen(false)} style={{ padding: 4 }}>
                <Feather name="x" size={18} color={MUTED} />
              </TouchableOpacity>
            </View>

            {/* Declaration Content */}
            <ScrollView style={{ maxHeight: 380 }} contentContainerStyle={{ padding: 20, gap: 14 }}>
              <View style={{ alignItems: 'center', marginBottom: 6 }}>
                <Text style={{ fontFamily: 'Roboto', fontWeight: '900', fontSize: 20, color: BLUE }}>Anulekh Portal</Text>
                <Text style={{ fontFamily: 'Roboto', fontSize: 9, color: MUTED, textTransform: 'uppercase', letterSpacing: 1.5, marginTop: 2 }}>{t('official_cert_letter')}</Text>
              </View>

              {/* 1. Exam Details */}
              <View style={{ backgroundColor: '#f8fafc', padding: 12, borderRadius: 16, borderWidth: 1, borderColor: '#e2e8f0', gap: 4 }}>
                <Text style={{ fontFamily: 'Roboto', fontSize: 9, fontWeight: '800', color: MUTED, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 }}>{t('exam_details')}</Text>
                <Text style={{ fontFamily: 'Roboto', fontSize: 12, color: '#334155', fontWeight: '700' }}>{t('candidate_student')}: {selectedExam?.subject}</Text>
                <Text style={{ fontFamily: 'Roboto', fontSize: 11, color: '#475569' }}>{t('exam_level')}: {selectedExam?.exam_type}</Text>
                <Text style={{ fontFamily: 'Roboto', fontSize: 11, color: '#475569' }}>{t('exam_date')}: {selectedExam?.exam_date}</Text>
                <Text style={{ fontFamily: 'Roboto', fontSize: 11, color: '#475569' }}>{t('exam_venue')}: {selectedExam?.exam_venue}</Text>
              </View>

              {/* 2. Candidate & Scribe Details */}
              <View style={{ gap: 10 }}>
                <View>
                  <Text style={{ fontFamily: 'Roboto', fontSize: 9, fontWeight: '800', color: MUTED, textTransform: 'uppercase', marginBottom: 2 }}>{t('candidate_student')}</Text>
                  <Text style={{ fontFamily: 'Roboto', fontSize: 12, color: TEXT, fontWeight: '800' }}>{profile?.full_name}</Text>
                  <Text style={{ fontFamily: 'Roboto', fontSize: 10, color: MUTED, marginTop: 1 }}>Grade: {selectedExam?.education_grade}</Text>
                  <Text style={{ fontFamily: 'Roboto', fontSize: 10, color: MUTED }}>Aadhaar ID: Verified</Text>
                </View>

                <View style={{ height: 1, backgroundColor: '#f1f5f9' }} />

                <View>
                  <Text style={{ fontFamily: 'Roboto', fontSize: 9, fontWeight: '800', color: MUTED, textTransform: 'uppercase', marginBottom: 2 }}>{t('volunteer_scribe')}</Text>
                  <Text style={{ fontFamily: 'Roboto', fontSize: 12, color: TEXT, fontWeight: '800' }}>{selectedExam?.scribeProfile?.full_name || t('volunteer_scribe')}</Text>
                  <Text style={{ fontFamily: 'Roboto', fontSize: 10, color: MUTED, marginTop: 1 }}>{t('occupation_label')}{selectedExam?.scribeProfile?.occupation || t('student_scribe_fallback')}</Text>
                </View>
              </View>

              {/* 3. Formal Declaration Text */}
              <View style={{ backgroundColor: 'rgba(5,150,105,0.05)', borderWidth: 1, borderColor: 'rgba(5,150,105,0.18)', padding: 12, borderRadius: 16, marginTop: 4 }}>
                <Text style={{ fontFamily: 'Roboto', fontSize: 10, color: GREEN, lineHeight: 16, fontStyle: 'italic', textAlign: 'center' }}>
                  {t('declaration_agreement_text')}
                </Text>
              </View>

              {/* 4. Verification Stamp */}
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 4 }}>
                <View>
                  <Text style={{ fontFamily: 'Roboto', fontSize: 8, fontWeight: '800', color: MUTED, textTransform: 'uppercase' }}>{t('status')}</Text>
                  <Text style={{ fontFamily: 'Roboto', fontSize: 10, color: GREEN, fontWeight: '800', marginTop: 2 }}>{t('verified_scribe_badge')}</Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={{ fontFamily: 'Roboto', fontSize: 8, fontWeight: '800', color: MUTED, textTransform: 'uppercase' }}>{t('official_stamp')}</Text>
                  <Text style={{ fontFamily: 'Roboto', fontSize: 9, color: TEXT, fontWeight: '800', marginTop: 2 }}>ANULEKH ONLINE</Text>
                </View>
              </View>
            </ScrollView>

            {/* Action Buttons */}
            <View style={{ padding: 16, backgroundColor: '#f8fafc', borderTopWidth: 1, borderTopColor: '#f1f5f9', flexDirection: 'row', gap: 8 }}>
              <TouchableOpacity 
                onPress={() => setIsDeclarationOpen(false)}
                style={{ flex: 1, backgroundColor: '#e2e8f0', paddingVertical: 11, borderRadius: 12, alignItems: 'center' }}
              >
                <Text style={{ fontFamily: 'Roboto', color: '#475569', fontWeight: '700', fontSize: 13 }}>{t('close')}</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                onPress={() => Alert.alert(t('download'), t('download_declaration'))}
                style={{ flex: 1, backgroundColor: BLUE, paddingVertical: 11, borderRadius: 12, alignItems: 'center', shadowColor: BLUE, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 8, elevation: 3 }}
              >
                <Text style={{ fontFamily: 'Roboto', color: 'white', fontWeight: '800', fontSize: 13 }}>{t('download')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ═══════════════════════════════════════════════════
          CALL BOTTOM SHEET MODAL
      ═══════════════════════════════════════════════════ */}
      <Modal
        animationType="slide"
        transparent
        visible={isCallOpen}
        onRequestClose={closeCallSheet}
      >
        {/* Backdrop */}
        <TouchableOpacity
          style={{ flex: 1, backgroundColor: 'rgba(15,23,42,0.45)' }}
          activeOpacity={1}
          onPress={closeCallSheet}
        />

        {/* Sheet */}
        <View style={{
          position: 'absolute',
          bottom: 0, left: 0, right: 0,
          backgroundColor: '#fff',
          borderTopLeftRadius: 28,
          borderTopRightRadius: 28,
          paddingBottom: 30,
          paddingHorizontal: 24,
          paddingTop: 14,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: -8 },
          shadowOpacity: 0.12,
          shadowRadius: 24,
          elevation: 20,
        }}>
          {/* Handle bar */}
          <View style={{ alignItems: 'center', marginBottom: 10 }}>
            <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: '#e2e8f0' }} />
          </View>

          {/* Header row */}
          <View style={{
            flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
            paddingVertical: 14,
            borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.06)',
            marginBottom: 16
          }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <View style={{
                width: 38, height: 38, borderRadius: 11,
                backgroundColor: GREEN_BG_LIGHT, borderWidth: 1, borderColor: GREEN_BD,
                alignItems: 'center', justifyContent: 'center',
              }}>
                <Feather name="phone" size={16} color={GREEN} />
              </View>
              <Text style={{ fontFamily: 'Roboto', fontSize: 16, fontWeight: '900', color: TEXT }}>{t('call_detail')}</Text>
            </View>
            <TouchableOpacity
              onPress={closeCallSheet}
              style={{
                width: 34, height: 34, borderRadius: 10,
                backgroundColor: 'rgba(0,0,0,0.05)',
                alignItems: 'center', justifyContent: 'center',
              }}
            >
              <Feather name="x" size={16} color={MUTED} />
            </TouchableOpacity>
          </View>

          {/* Contact card */}
          <View style={{
            backgroundColor: GREEN_BG_LIGHT, borderWidth: 1, borderColor: GREEN_BD,
            borderRadius: 20, padding: 20,
          }}>
            {/* Avatar + name */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 16 }}>
              <View style={{
                width: 54, height: 54, borderRadius: 16,
                backgroundColor: 'rgba(5,150,105,0.15)',
                borderWidth: 2, borderColor: GREEN_BD,
                alignItems: 'center', justifyContent: 'center',
              }}>
                <Text style={{ fontFamily: 'Roboto', fontSize: 22, fontWeight: '900', color: GREEN }}>
                  {callExam?.scribeProfile?.full_name?.charAt(0)?.toUpperCase() ?? 'S'}
                </Text>
              </View>
              <View>
                <Text style={{ fontFamily: 'Roboto', fontSize: 16, fontWeight: '800', color: TEXT }}>
                  {callExam?.scribeProfile?.full_name ?? t('volunteer_scribe')}
                </Text>
                <View style={{
                  marginTop: 4, backgroundColor: 'rgba(5,150,105,0.09)',
                  borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3,
                  alignSelf: 'flex-start', borderWidth: 1, borderColor: GREEN_BD,
                }}>
                  <Text style={{ fontFamily: 'Roboto', color: GREEN, fontSize: 10, fontWeight: '800' }}>VOLUNTEER SCRIBE</Text>
                </View>
              </View>
            </View>

            {/* Phone number display */}
            {showMaskedNumber ? (
              <View style={{
                backgroundColor: '#fff',
                borderRadius: 14, paddingVertical: 14, paddingHorizontal: 18,
                flexDirection: 'row', alignItems: 'center', gap: 12,
                borderWidth: 1, borderColor: GREEN_BD,
              }}>
                <Feather name="phone" size={18} color={GREEN} />
                <Text style={{ fontFamily: 'Roboto', fontSize: 20, fontWeight: '900', color: TEXT, letterSpacing: 1.5 }}>
                  {callExam?.scribeProfile?.phone || '9876543210'}
                </Text>
              </View>
            ) : (
              <TouchableOpacity
                onPress={() => setShowMaskedNumber(true)}
                style={{
                  backgroundColor: '#fff',
                  borderRadius: 14, paddingVertical: 14, paddingHorizontal: 18,
                  flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
                  borderWidth: 1, borderColor: GREEN_BD,
                  borderStyle: 'dashed'
                }}
              >
                <Feather name="eye" size={16} color={GREEN} />
                <Text style={{ fontFamily: 'Roboto', fontSize: 14, fontWeight: '800', color: GREEN }}>{t('view_number')}</Text>
              </TouchableOpacity>
            )}

            {/* Exam context */}
            <Text style={{ fontFamily: 'Roboto', fontSize: 11, color: MUTED, marginTop: 10, textAlign: 'center' }}>
              {t('subject_label')} <Text style={{ fontWeight: '700', color: TEXT }}>{callExam?.subject}</Text> {t('exam_volunteer')}
            </Text>
          </View>

          {/* Dial Now CTA */}
          <TouchableOpacity
            onPress={() => dialNumber(callExam?.scribeProfile?.phone || '9876543210')}
            style={{
              backgroundColor: GREEN,
              borderRadius: 18, paddingVertical: 16, marginTop: 16,
              flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
              shadowColor: GREEN, shadowOffset: { width: 0, height: 10 },
              shadowOpacity: 0.25, shadowRadius: 20, elevation: 10,
            }}
            activeOpacity={0.85}
          >
            <Feather name="phone-call" size={20} color="#fff" />
            <Text style={{ fontFamily: 'Roboto', color: '#fff', fontSize: 16, fontWeight: '900' }}>{t('dial_now')}</Text>
          </TouchableOpacity>

          {/* Cancel */}
          <TouchableOpacity
            onPress={closeCallSheet}
            style={{ paddingVertical: 14, alignItems: 'center', marginTop: 4 }}
          >
            <Text style={{ fontFamily: 'Roboto', color: MUTED, fontSize: 14, fontWeight: '600' }}>{t('cancel')}</Text>
          </TouchableOpacity>
        </View>
      </Modal>

    </ScrollView>
  );
}
