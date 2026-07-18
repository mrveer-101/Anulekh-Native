import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, Alert, Modal, Linking } from 'react-native';
import { Feather, Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { supabase } from '../app/core/supabase';
import { useLanguage } from '../app/core/translation';

const getFirstName = (fullName: string | null | undefined, defaultVal: string) => {
  if (!fullName) return defaultVal;
  const first = fullName.trim().split(/\s+/)[0];
  if (!first) return defaultVal;
  return first.charAt(0).toUpperCase() + first.slice(1);
};

export default function ScribeHomeView() {
  const { t } = useLanguage();
  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [availableExams, setAvailableExams] = useState<any[]>([]);
  const [scribeCommitments, setScribeCommitments] = useState<any[]>([]);
  const [pendingApplicationsCount, setPendingApplicationsCount] = useState(0);
  const [completedExamsCount, setCompletedExamsCount] = useState(0);
  const [reviews, setReviews] = useState<any[]>([]);
  const [showRatingDetails, setShowRatingDetails] = useState(false);

  // Calling States
  const [callExam, setCallExam] = useState<any>(null);
  const [isCallOpen, setIsCallOpen] = useState(false);
  const [showMaskedNumber, setShowMaskedNumber] = useState(false);

  const openCallSheet = (exam: any) => {
    if (!exam || !exam.exam_date) {
      Alert.alert("Calling Unavailable", "Calling is only permitted on the day of the exam.");
      return;
    }
    
    // Check if the exam date is today
    const dateStr = exam.exam_date.split('|')[0].trim(); // Get YYYY-MM-DD
    const todayStr = new Date().toISOString().split('T')[0];
    
    if (dateStr !== todayStr) {
      Alert.alert("Calling Unavailable", `Calling is only permitted on the day of the exam (${dateStr}).`);
      return;
    }

    setCallExam(exam);
    setShowMaskedNumber(false);
    setIsCallOpen(true);
  };

  const closeCallSheet = () => setIsCallOpen(false);

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

      // 1. Fetch Profile
      const { data: profileData } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', session.user.id)
        .single();

      setProfile(profileData);

      // 2. Fetch Available Exams (where status is pending), excluding exams this
      // scribe was already rejected from — stays public for every other scribe.
      const { data: available } = await supabase
        .from('exam_requests')
        .select('*')
        .eq('status', 'pending')
        .order('created_at', { ascending: false });

      // Fetch all student reviews to calculate average ratings
      const { data: studentReviews } = await supabase
        .from('student_reviews')
        .select('student_id, rating_overall');

      // Map student_id -> { sum: number, count: number }
      const studentRatingsMap: { [studentId: string]: { sum: number; count: number } } = {};
      (studentReviews || []).forEach((r: any) => {
        if (!studentRatingsMap[r.student_id]) {
          studentRatingsMap[r.student_id] = { sum: 0, count: 0 };
        }
        studentRatingsMap[r.student_id].sum += r.rating_overall || 0;
        studentRatingsMap[r.student_id].count += 1;
      });

      // Map student_id -> avg_rating (default 5.0 for students with no reviews so they start with high priority)
      const getStudentAvgRating = (studentId: string): number => {
        const stats = studentRatingsMap[studentId];
        if (!stats || stats.count === 0) return 5.0; // New student / no rating gets maximum priority
        return stats.sum / stats.count;
      };

      const { data: rejectedApps } = await supabase
        .from('scribe_applications')
        .select('request_id')
        .eq('scribe_id', session.user.id)
        .eq('status', 'rejected');

      const rejectedRequestIds = new Set((rejectedApps || []).map((a: any) => a.request_id));
      const sortedAvailable = (available || [])
        .filter((exam: any) => !rejectedRequestIds.has(exam.id))
        .sort((a: any, b: any) => {
          const ratingA = getStudentAvgRating(a.student_id);
          const ratingB = getStudentAvgRating(b.student_id);
          return ratingB - ratingA; // higher rating first
        });

      setAvailableExams(sortedAvailable);

      // 3. Fetch Scribe's Confirmed Commitments
      const { data: committed } = await supabase
        .from('exam_requests')
        .select('*')
        .eq('status', 'matched')
        .eq('scribe_id', session.user.id)
        .order('created_at', { ascending: false });

      setScribeCommitments(committed || []);

      // 4. Fetch Scribe's Pending Applications Count
      const { data: apps } = await supabase
        .from('scribe_applications')
        .select('id')
        .eq('scribe_id', session.user.id)
        .eq('status', 'pending');
      
      setPendingApplicationsCount(apps ? apps.length : 0);

      // 5. Fetch Scribe's Completed Exam Requests
      const { data: completed } = await supabase
        .from('exam_requests')
        .select('id')
        .eq('status', 'completed')
        .eq('scribe_id', session.user.id);

      setCompletedExamsCount(completed ? completed.length : 0);

      // 6. Fetch Scribe's Reviews
      const { data: reviewsData } = await supabase
        .from('scribe_reviews')
        .select('*')
        .eq('scribe_id', session.user.id);

      setReviews(reviewsData || []);

    } catch (err: any) {
      console.log('Error fetching volunteer session:', err.message);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 10, backgroundColor: '#f8fafc' }}>
        <ActivityIndicator size="large" color="#059669" />
      </View>
    );
  }

  // Compute rating stats
  let finalRating = 0;
  let avgPunctuality = 0;
  let avgCommunication = 0;
  let avgSpeed = 0;
  let avgBehavior = 0;
  let avgOverall = 0;

  if (reviews && reviews.length > 0) {
    let sumExamAverages = 0;
    let sumPunctuality = 0;
    let sumCommunication = 0;
    let sumSpeed = 0;
    let sumBehavior = 0;
    let sumOverall = 0;

    reviews.forEach(r => {
      const punctuality = r.rating_punctuality || 0;
      const communication = r.rating_communication || 0;
      const speed = r.rating_speed || 0;
      const behavior = r.rating_behavior || 0;
      const overall = r.rating_overall || 0;

      const examAvg = (punctuality + communication + speed + behavior + overall) / 5.0;
      sumExamAverages += examAvg;

      sumPunctuality += punctuality;
      sumCommunication += communication;
      sumSpeed += speed;
      sumBehavior += behavior;
      sumOverall += overall;
    });

    finalRating = sumExamAverages / reviews.length;
    avgPunctuality = sumPunctuality / reviews.length;
    avgCommunication = sumCommunication / reviews.length;
    avgSpeed = sumSpeed / reviews.length;
    avgBehavior = sumBehavior / reviews.length;
    avgOverall = sumOverall / reviews.length;
  }

  const isVerified = profile?.verification_status === 'approved';
  const isPending = profile?.verification_status === 'pending';
  const isUnverified = !profile?.verification_status || profile.verification_status === 'unverified';

  return (
    <ScrollView style={{ flex: 1, paddingHorizontal: 24, paddingVertical: 12 }} contentContainerStyle={{ paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
      {/* Welcome Section */}
      <View style={{ marginBottom: 16 }}>
        <Text style={{ fontFamily: 'Roboto', fontSize: 11, fontWeight: '800', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 1.5 }}>
          {t('welcome_scribe_portal')}
        </Text>
        <Text style={{ fontFamily: 'Roboto', fontSize: 24, fontWeight: '900', color: '#0f172a', marginTop: 4, letterSpacing: -0.5 }}>
          {t('hello_user', { name: getFirstName(profile?.full_name, 'Scribe') })}
        </Text>
      </View>

      {/* 1. Complete Profile Onboarding Card */}
      {isUnverified && (
        <View style={{ backgroundColor: '#fff', borderWidth: 1, borderColor: '#fef3c7', padding: 20, borderRadius: 24, shadowColor: '#d97706', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.05, shadowRadius: 10, elevation: 2, marginBottom: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <View style={{ flex: 1, paddingRight: 16 }}>
            <Text style={{ fontFamily: 'Roboto', fontSize: 15, fontWeight: '800', color: '#92400e' }}>{t('complete_profile')}</Text>
            <Text style={{ fontFamily: 'Roboto', fontSize: 12, color: '#64748b', marginTop: 4, lineHeight: 18 }}>
              {t('profile_onboarding_desc')}
            </Text>
          </View>
          <TouchableOpacity 
            onPress={() => router.replace('/console/scribe/complete_profile' as any)}
            style={{ backgroundColor: '#d97706', paddingVertical: 10, paddingHorizontal: 16, borderRadius: 12 }}
          >
            <Text style={{ fontFamily: 'Roboto', color: '#fff', fontWeight: '800', fontSize: 12 }}>{t('verify_now')}</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* 2. Verification Pending Card with Simulation Tool */}
      {isPending && (
        <View style={{ backgroundColor: '#fff', borderWidth: 1, borderColor: '#dbeafe', padding: 20, borderRadius: 24, shadowColor: '#2563eb', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.05, shadowRadius: 10, elevation: 2, marginBottom: 20 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8, gap: 8 }}>
            <Feather name="clock" size={18} color="#2563eb" />
            <Text style={{ fontFamily: 'Roboto', fontSize: 15, fontWeight: '800', color: '#1e40af' }}>{t('verification_pending')}</Text>
          </View>
          <Text style={{ fontFamily: 'Roboto', fontSize: 12, color: '#64748b', lineHeight: 18 }}>
            {t('verification_pending_desc')}
          </Text>
        </View>
      )}

      {/* 3. Verified Badge */}
      {isVerified && (
        <View style={{ backgroundColor: 'rgba(5,150,105,0.08)', borderWidth: 1, borderColor: 'rgba(5,150,105,0.18)', paddingVertical: 10, paddingHorizontal: 16, borderRadius: 14, flexDirection: 'row', alignItems: 'center', marginBottom: 20, gap: 8 }}>
          <Feather name="check-circle" size={16} color="#059669" />
          <Text style={{ fontFamily: 'Roboto', color: '#047857', fontSize: 12, fontWeight: '800' }}>{t('verified_scribe_profile')}</Text>
        </View>
      )}

      {/* Scribe Stats Summary */}
      <View style={{ backgroundColor: '#fff', padding: 16, borderRadius: 24, borderWidth: 1, borderColor: 'rgba(0,0,0,0.05)', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.04, shadowRadius: 10, elevation: 2, flexDirection: 'row', justifyContent: 'space-around', marginBottom: 20 }}>
        <View style={{ alignItems: 'center', flex: 1 }}>
          <Text style={{ fontFamily: 'Roboto', fontSize: 20, fontWeight: '900', color: '#0f172a' }}>{scribeCommitments.length}</Text>
          <Text style={{ fontFamily: 'Roboto', color: '#64748b', fontSize: 10, fontWeight: '800', marginTop: 2 }}>{t('commitments')}</Text>
        </View>
        <View style={{ width: 1, height: 32, backgroundColor: '#f1f5f9' }} />
        <View style={{ alignItems: 'center', flex: 1 }}>
          <Text style={{ fontFamily: 'Roboto', fontSize: 20, fontWeight: '900', color: '#0f172a' }}>{pendingApplicationsCount}</Text>
          <Text style={{ fontFamily: 'Roboto', color: '#64748b', fontSize: 10, fontWeight: '800', marginTop: 2 }}>{t('applications')}</Text>
        </View>
        <View style={{ width: 1, height: 32, backgroundColor: '#f1f5f9' }} />
        <View style={{ alignItems: 'center', flex: 1 }}>
          <Text style={{ fontFamily: 'Roboto', fontSize: 20, fontWeight: '900', color: '#0f172a' }}>{availableExams.length}</Text>
          <Text style={{ fontFamily: 'Roboto', color: '#64748b', fontSize: 10, fontWeight: '800', marginTop: 2 }}>{t('available')}</Text>
        </View>
      </View>

      {/* My Contributions Block */}
      <View style={{ marginBottom: 24 }}>
        <Text style={{ fontFamily: 'Roboto', color: '#475569', fontWeight: '800', fontSize: 14, marginBottom: 12 }}>My Contributions 🤝</Text>
        <View style={{ flexDirection: 'row', gap: 12 }}>
          {/* Card 1: Hours Contributed */}
          <View style={{ flex: 1, backgroundColor: '#fff', borderWidth: 1, borderColor: 'rgba(0,0,0,0.05)', borderRadius: 24, padding: 18, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.04, shadowRadius: 10, elevation: 2 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <Feather name="clock" size={16} color="#059669" />
              <View style={{ backgroundColor: 'rgba(5,150,105,0.08)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 }}>
                <Text style={{ fontFamily: 'Roboto', fontSize: 8, fontWeight: '800', color: '#059669' }}>HOURS</Text>
              </View>
            </View>
            <Text style={{ fontFamily: 'Roboto', fontSize: 22, fontWeight: '900', color: '#0f172a' }}>{completedExamsCount * 3} hrs</Text>
            <Text style={{ fontFamily: 'Roboto', fontSize: 11, fontWeight: '800', color: '#475569', marginTop: 4 }}>Hours contributed</Text>
            <Text style={{ fontFamily: 'Roboto', fontSize: 9, color: '#94a3b8', marginTop: 2 }}>Based on 3 hrs/exam</Text>
          </View>

          {/* Card 2: Requests Completed */}
          <View style={{ flex: 1, backgroundColor: '#fff', borderWidth: 1, borderColor: 'rgba(0,0,0,0.05)', borderRadius: 24, padding: 18, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.04, shadowRadius: 10, elevation: 2 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <Feather name="award" size={16} color="#d97706" />
              <View style={{ backgroundColor: 'rgba(217,119,6,0.08)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 }}>
                <Text style={{ fontFamily: 'Roboto', fontSize: 8, fontWeight: '800', color: '#d97706' }}>EXAMS</Text>
              </View>
            </View>
            <Text style={{ fontFamily: 'Roboto', fontSize: 22, fontWeight: '900', color: '#0f172a' }}>{completedExamsCount} requests</Text>
            <Text style={{ fontFamily: 'Roboto', fontSize: 11, fontWeight: '800', color: '#475569', marginTop: 4 }}>Requests completed</Text>
            <Text style={{ fontFamily: 'Roboto', fontSize: 9, color: '#94a3b8', marginTop: 2 }}>Successfully completed</Text>
          </View>
        </View>
      </View>

      {/* Upcoming Confirmed Exams (Upcoming Matches) */}
      {scribeCommitments.length > 0 && (
        <View style={{ marginBottom: 24 }}>
          <Text style={{ fontFamily: 'Roboto', color: '#475569', fontWeight: '800', fontSize: 14, marginBottom: 12 }}>Upcoming Matches</Text>
          {scribeCommitments.map((exam) => (
            <View 
              key={exam.id} 
              style={{ backgroundColor: '#fff', padding: 16, borderRadius: 28, borderWidth: 1, borderColor: 'rgba(22,163,74,0.15)', shadowColor: '#16a34a', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.04, shadowRadius: 10, elevation: 2, marginBottom: 14 }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <View style={{ flex: 1, paddingRight: 8 }}>
                  <Text style={{ fontFamily: 'Roboto', fontSize: 16, fontWeight: '900', color: '#0f172a' }}>{exam.subject || 'Exam'}</Text>
                  <Text style={{ fontFamily: 'Roboto', fontSize: 10, color: '#64748b', marginTop: 1 }}>{t('exam_level')}: {exam.exam_type}</Text>
                </View>
                <View style={{ backgroundColor: 'rgba(22,163,74,0.08)', borderWidth: 1, borderColor: 'rgba(22,163,74,0.2)', paddingVertical: 4, paddingHorizontal: 10, borderRadius: 20 }}>
                  <Text style={{ fontFamily: 'Roboto', fontSize: 9, fontWeight: '800', color: '#16a34a' }}>Confirmed Match</Text>
                </View>
              </View>

              <View style={{ borderTopWidth: 1, borderTopColor: '#f8fafc', paddingTop: 10, marginBottom: 12, gap: 6 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Feather name="user" size={12} color="#64748b" style={{ marginRight: 8 }} />
                  <Text style={{ fontFamily: 'Roboto', color: '#475569', fontSize: 12 }}>
                    {t('candidate_student')}: <Text style={{ fontWeight: '700', color: '#0f172a' }}>{exam.student_name} ({exam.education_grade})</Text>
                  </Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Feather name="calendar" size={12} color="#64748b" style={{ marginRight: 8 }} />
                  <Text style={{ fontFamily: 'Roboto', color: '#475569', fontSize: 12 }}>
                    {t('exam_date')}: {exam.exam_date || t('date_not_specified')}
                  </Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Feather name="map-pin" size={12} color="#64748b" style={{ marginRight: 8 }} />
                  <Text style={{ fontFamily: 'Roboto', color: '#475569', fontSize: 12 }} numberOfLines={1}>
                    {t('exam_venue')}: {exam.exam_venue || t('venue_not_specified')}
                  </Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Feather name="globe" size={12} color="#64748b" style={{ marginRight: 8 }} />
                  <Text style={{ fontFamily: 'Roboto', color: '#475569', fontSize: 12 }}>
                    {t('exam_language')}: {exam.exam_language}
                  </Text>
                </View>
              </View>

              {/* Chat & Call Action buttons */}
              <View style={{ flexDirection: 'row', gap: 8, borderTopWidth: 1, borderTopColor: '#f1f5f9', paddingTop: 10 }}>
                {/* Call */}
                <TouchableOpacity 
                  onPress={() => openCallSheet(exam)}
                  style={{ flex: 1, backgroundColor: '#fff', borderWidth: 1, borderColor: '#e2e8f0', paddingVertical: 10, borderRadius: 12, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6 }}
                >
                  <Feather name="phone" size={12} color="#334155" />
                  <Text style={{ fontFamily: 'Roboto', color: '#334155', fontWeight: '800', fontSize: 12 }}>{t('call')}</Text>
                </TouchableOpacity>

                {/* Chat */}
                <TouchableOpacity 
                  onPress={() => router.push(`/console/common/chat?requestId=${exam.id}` as any)}
                  style={{ flex: 1, backgroundColor: '#fff', borderWidth: 1, borderColor: '#e2e8f0', paddingVertical: 10, borderRadius: 12, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6 }}
                >
                  <Feather name="message-square" size={12} color="#334155" />
                  <Text style={{ fontFamily: 'Roboto', color: '#334155', fontWeight: '800', fontSize: 12 }}>{t('chat')}</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))}
        </View>
      )}

      {/* Available Opportunities List */}
      <View>
        <Text style={{ fontFamily: 'Roboto', color: '#475569', fontWeight: '800', fontSize: 14, marginBottom: 12 }}>{t('available_opportunities')}</Text>

        {availableExams.length === 0 ? (
          <View style={{ backgroundColor: '#fff', padding: 24, borderRadius: 24, borderWidth: 1, borderColor: 'rgba(0,0,0,0.05)', alignItems: 'center', justifyContent: 'center' }}>
            <Feather name="inbox" size={28} color="#94a3b8" />
            <Text style={{ fontFamily: 'Roboto', color: '#94a3b8', fontSize: 12, marginTop: 8, textAlign: 'center' }}>{t('no_opportunities_found')}</Text>
          </View>
        ) : (
          availableExams.map((exam) => (
            <TouchableOpacity 
              key={exam.id} 
              onPress={() => {
                if (isVerified) {
                  router.push(`/console/scribe/apply?id=${exam.id}` as any);
                } else {
                  Alert.alert(t('error'), 'અરજી કરવા માટે કૃપા કરીને પહેલા તમારી ચકાસણી પૂર્ણ કરો.');
                }
              }}
              activeOpacity={0.9}
              style={{ backgroundColor: '#fff', padding: 16, borderRadius: 28, borderWidth: 1, borderColor: 'rgba(0,0,0,0.06)', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.04, shadowRadius: 10, elevation: 2, marginBottom: 14 }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <View style={{ flex: 1, paddingRight: 8 }}>
                  <Text style={{ fontFamily: 'Roboto', fontSize: 16, fontWeight: '900', color: '#0f172a' }}>{exam.subject || 'Exam'}</Text>
                  <Text style={{ fontFamily: 'Roboto', fontSize: 10, color: '#64748b', marginTop: 1 }}>{t('exam_level')}: {exam.exam_type}</Text>
                </View>
              </View>

              <View style={{ borderTopWidth: 1, borderTopColor: '#f8fafc', paddingTop: 10, marginBottom: 12, gap: 6 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Feather name="user" size={12} color="#64748b" style={{ marginRight: 8 }} />
                  <Text style={{ fontFamily: 'Roboto', color: '#475569', fontSize: 12 }}>
                    {t('candidate_student')}: {exam.student_name} ({exam.education_grade})
                  </Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Feather name="calendar" size={12} color="#64748b" style={{ marginRight: 8 }} />
                  <Text style={{ fontFamily: 'Roboto', color: '#475569', fontSize: 12 }}>
                    {t('exam_date')}: {exam.exam_date || t('date_not_specified')}
                  </Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Feather name="map-pin" size={12} color="#64748b" style={{ marginRight: 8 }} />
                  <Text style={{ fontFamily: 'Roboto', color: '#475569', fontSize: 12 }} numberOfLines={1}>
                    {t('exam_venue')}: {exam.exam_venue || t('venue_not_specified')}
                  </Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Feather name="globe" size={12} color="#64748b" style={{ marginRight: 8 }} />
                  <Text style={{ fontFamily: 'Roboto', color: '#475569', fontSize: 12 }}>
                    {t('exam_language')}: {exam.exam_language}
                  </Text>
                </View>
              </View>

              <View style={{ width: '105%', marginLeft: '-2.5%', backgroundColor: 'rgba(5,150,105,0.08)', paddingVertical: 10, borderRadius: 16, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6 }}>
                <Feather name="file-text" size={12} color="#059669" />
                <Text style={{ fontFamily: 'Roboto', color: '#047857', fontWeight: '800', fontSize: 12 }}>{t('view_details_apply')}</Text>
              </View>
            </TouchableOpacity>
          ))
        )}
      </View>

      {/* Need Help? Contact Support Card */}
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
            backgroundColor: '#ecfdf5',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <Feather name="life-buoy" size={20} color="#059669" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontFamily: 'Roboto', fontSize: 15, fontWeight: '800', color: '#0f172a' }}>
              Need Help?
            </Text>
            <Text style={{ fontFamily: 'Roboto', fontSize: 12, color: '#64748b', marginTop: 2 }}>
              Contact support to resolve application or profile issues
            </Text>
          </View>
        </View>
        <Feather name="chevron-right" size={18} color="#64748b" />
      </TouchableOpacity>

      {/* Call Modal Sheet */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={isCallOpen}
        onRequestClose={closeCallSheet}
      >
        <View style={{ flex: 1, backgroundColor: 'rgba(15,23,42,0.6)', justifyContent: 'flex-end' }}>
          <View style={{ backgroundColor: '#fff', borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24, shadowColor: '#000', shadowOffset: { width: 0, height: -10 }, shadowOpacity: 0.1, shadowRadius: 20, elevation: 15 }}>
            <View style={{ alignItems: 'center', marginBottom: 20 }}>
              <View style={{ width: 44, height: 44, borderRadius: 14, backgroundColor: 'rgba(5,150,105,0.08)', alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
                <Feather name="phone-call" size={20} color="#059669" />
              </View>
              <Text style={{ fontFamily: 'Roboto', fontSize: 18, fontWeight: '900', color: '#0f172a' }}>{t('call_detail')}</Text>
              <Text style={{ fontFamily: 'Roboto', fontSize: 11, color: '#64748b', marginTop: 4 }}>પ્રાઈવસી પ્રોટેક્શન સક્રિય કરેલ છે.</Text>
            </View>

            <View style={{ gap: 14, marginBottom: 20 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(5,150,105,0.08)', alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ fontSize: 16, fontWeight: '900', color: '#059669' }}>
                    {callExam?.student_name?.charAt(0).toUpperCase()}
                  </Text>
                </View>
                <View>
                  <Text style={{ fontFamily: 'Roboto', fontSize: 14, fontWeight: '900', color: '#0f172a' }}>{callExam?.student_name}</Text>
                  <View style={{ marginTop: 4, backgroundColor: 'rgba(5,150,105,0.09)', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3, alignSelf: 'flex-start', borderWidth: 1, borderColor: 'rgba(5,150,105,0.22)' }}>
                    <Text style={{ fontFamily: 'Roboto', color: '#059669', fontSize: 10, fontWeight: '800' }}>CANDIDATE STUDENT</Text>
                  </View>
                </View>
              </View>

              {showMaskedNumber ? (
                <View style={{ backgroundColor: '#fff', borderRadius: 14, paddingVertical: 14, paddingHorizontal: 18, flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderColor: 'rgba(5,150,105,0.22)' }}>
                  <Feather name="phone" size={18} color="#059669" />
                  <Text style={{ fontFamily: 'Roboto', fontSize: 20, fontWeight: '900', color: '#0f172a', letterSpacing: 1.5 }}>
                    {callExam?.phone || '9876543210'}
                  </Text>
                </View>
              ) : (
                <TouchableOpacity
                  onPress={() => setShowMaskedNumber(true)}
                  style={{ backgroundColor: '#fff', borderRadius: 14, paddingVertical: 14, paddingHorizontal: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderWidth: 1, borderColor: 'rgba(5,150,105,0.22)', borderStyle: 'dashed' }}
                >
                  <Feather name="eye" size={16} color="#059669" />
                  <Text style={{ fontFamily: 'Roboto', fontSize: 14, fontWeight: '800', color: '#059669' }}>{t('view_number')}</Text>
                </TouchableOpacity>
              )}

              <Text style={{ fontFamily: 'Roboto', fontSize: 11, color: '#64748b', marginTop: 10, textAlign: 'center' }}>
                વિષય: <Text style={{ fontWeight: '700', color: '#0f172a' }}>{callExam?.subject}</Text> પરીક્ષાના વિદ્યાર્થી
              </Text>
            </View>

            <TouchableOpacity
              onPress={async () => {
                const url = `tel:${callExam?.phone || '9876543210'}`;
                try {
                  const supported = await Linking.canOpenURL(url);
                  if (supported) {
                    await Linking.openURL(url);
                  } else {
                    Alert.alert(t('error'), 'આ ઉપકરણથી કૉલ કરવો શક્ય નથી.');
                  }
                } catch (_) {
                  Alert.alert(t('error'), 'કૉલ શરૂ કરવામાં ભૂલ આવી.');
                }
              }}
              style={{ backgroundColor: '#059669', borderRadius: 18, paddingVertical: 16, marginTop: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, shadowColor: '#059669', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.25, shadowRadius: 20, elevation: 10 }}
              activeOpacity={0.85}
            >
              <Feather name="phone-call" size={20} color="#fff" />
              <Text style={{ fontFamily: 'Roboto', color: '#fff', fontSize: 16, fontWeight: '900' }}>{t('dial_now')}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={closeCallSheet}
              style={{ paddingVertical: 14, alignItems: 'center', marginTop: 4 }}
            >
              <Text style={{ fontFamily: 'Roboto', color: '#64748b', fontSize: 14, fontWeight: '600' }}>{t('cancel')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

    </ScrollView>
  );
}
