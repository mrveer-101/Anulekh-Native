import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, Alert, Modal, Linking } from 'react-native';
import { Feather, Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { supabase } from '../app/core/supabase';
import { useLanguage } from '../app/core/translation';
import PolicyModal from '../components/PolicyModal';

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
  const [incomingInvitations, setIncomingInvitations] = useState<any[]>([]);
  const [pendingApplicationsCount, setPendingApplicationsCount] = useState(0);
  const [completedExamsCount, setCompletedExamsCount] = useState(0);
  const [reviews, setReviews] = useState<any[]>([]);
  const [showRatingDetails, setShowRatingDetails] = useState(false);
  const [isRatingsExpanded, setIsRatingsExpanded] = useState(false);
  const [expandedMatchIds, setExpandedMatchIds] = useState<Set<number>>(new Set());

  const toggleMatchCard = (id: number) => {
    setExpandedMatchIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const [expandedInviteIds, setExpandedInviteIds] = useState<Set<number | string>>(new Set());
  const [expandedAvailableIds, setExpandedAvailableIds] = useState<Set<number>>(new Set());

  const toggleInviteCard = (id: number | string) => {
    setExpandedInviteIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleAvailableCard = (id: number) => {
    setExpandedAvailableIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  // Calling States
  const [callExam, setCallExam] = useState<any>(null);
  const [isCallOpen, setIsCallOpen] = useState(false);
  const [showMaskedNumber, setShowMaskedNumber] = useState(false);
  const [agreedGuidelines, setAgreedGuidelines] = useState(false);
  const [showGuidelinesModal, setShowGuidelinesModal] = useState(false);
  const [pendingTargetAction, setPendingTargetAction] = useState<{ exam: any; isInvite: boolean } | null>(null);

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

      // Fetch past matches to boost previously worked student requests
      const { data: pastMatches } = await supabase
        .from('exam_requests')
        .select('student_id')
        .eq('scribe_id', session.user.id);

      const pastStudentsSet = new Set((pastMatches || []).map((pm: any) => pm.student_id));

      const { data: rejectedApps } = await supabase
        .from('scribe_applications')
        .select('request_id')
        .eq('scribe_id', session.user.id)
        .eq('status', 'rejected');

      const rejectedRequestIds = new Set((rejectedApps || []).map((a: any) => a.request_id));
      const sortedAvailable = (available || [])
        .filter((exam: any) => {
          // Exclude rejected opportunities
          if (rejectedRequestIds.has(exam.id)) return false;
          // Exclude private invitations meant for other scribes
          if (exam.private_scribe_id && exam.private_scribe_id !== session.user.id) return false;
          return true;
        })
        .sort((a: any, b: any) => {
          // 0. Emergency SOS check (highest priority booster)
          const aEmergency = a.is_emergency === 'yes' ? 1 : 0;
          const bEmergency = b.is_emergency === 'yes' ? 1 : 0;
          if (aEmergency !== bEmergency) return bEmergency - aEmergency;

          // 1. Private invite check (booster)
          const aPrivate = a.private_scribe_id === session.user.id ? 1 : 0;
          const bPrivate = b.private_scribe_id === session.user.id ? 1 : 0;
          if (aPrivate !== bPrivate) return bPrivate - aPrivate;

          // 2. Past student check (booster)
          const aPast = pastStudentsSet.has(a.student_id) ? 1 : 0;
          const bPast = pastStudentsSet.has(b.student_id) ? 1 : 0;
          if (aPast !== bPast) return bPast - aPast;

          // 3. Fallback to student average rating
          const ratingA = getStudentAvgRating(a.student_id);
          const ratingB = getStudentAvgRating(b.student_id);
          return ratingB - ratingA;
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

      // 7. Fetch Incoming Invitations for Scribe
      const { data: invitations } = await supabase
        .from('scribe_applications')
        .select('*')
        .eq('scribe_id', session.user.id)
        .eq('status', 'invited');

      const enrichedInvitations = await Promise.all(
        (invitations || []).map(async (invite: any) => {
          let requestDetails = null;
          if (invite.type === 'assignment') {
            const { data } = await supabase
              .from('assignment_requests')
              .select('*')
              .eq('id', invite.request_id)
              .single();
            requestDetails = data;
          } else {
            const { data } = await supabase
              .from('exam_requests')
              .select('*')
              .eq('id', invite.request_id)
              .single();
            requestDetails = data;
          }
          return { ...invite, details: requestDetails };
        })
      );
      setIncomingInvitations(enrichedInvitations.filter(inv => inv.details !== null));

    } catch (err: any) {
      console.log('Error fetching volunteer session:', err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleAcceptInvitation = async (invite: any) => {
    try {
      const { error: appErr } = await supabase
        .from('scribe_applications')
        .update({ status: 'accepted' })
        .eq('id', invite.id);

      if (appErr) throw appErr;

      const table = invite.type === 'assignment' ? 'assignment_requests' : 'exam_requests';
      const { error: reqErr } = await supabase
        .from(table)
        .update({ status: 'matched', scribe_id: profile.id })
        .eq('id', invite.request_id);

      if (reqErr) throw reqErr;

      await supabase
        .from('notifications')
        .insert({
          user_id: invite.details.student_id,
          title: invite.type === 'assignment' ? '📝 Writer Match Confirmed' : '📅 Scribe Match Confirmed',
          message: `${profile.official_name || profile.full_name} accepted your invitation for "${invite.details.subject}".`,
          is_read: 0,
          created_at: new Date().toISOString()
        });

      Alert.alert('Success', 'You have accepted this invitation.');
      fetchSession();
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to accept invitation.');
    }
  };

  const handleRejectInvitation = async (invite: any) => {
    try {
      const { error } = await supabase
        .from('scribe_applications')
        .update({ status: 'rejected' })
        .eq('id', invite.id);

      if (error) throw error;

      await supabase
        .from('notifications')
        .insert({
          user_id: invite.details.student_id,
          title: invite.type === 'assignment' ? '📝 Invitation Declined' : '📅 Invitation Declined',
          message: `${profile.official_name || profile.full_name} declined your invitation for "${invite.details.subject}".`,
          is_read: 0,
          created_at: new Date().toISOString()
        });

      Alert.alert('Invitation Declined', 'You have declined this invitation.');
      fetchSession();
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to decline invitation.');
    }
  };

  const handleAcceptInviteDirect = async (exam: any) => {
    setLoading(true);
    try {
      // 1. Get application row for this invitation
      const { data: apps } = await supabase
        .from('scribe_applications')
        .select('id')
        .eq('request_id', exam.id)
        .eq('scribe_id', profile.id)
        .eq('status', 'invited')
        .eq('type', 'exam');
      
      const appId = apps?.[0]?.id;
      if (appId) {
        await supabase
          .from('scribe_applications')
          .update({ status: 'accepted' })
          .eq('id', appId);
      } else {
        await supabase
          .from('scribe_applications')
          .insert({
            request_id: exam.id,
            scribe_id: profile.id,
            scribe_name: profile.official_name || profile.full_name,
            status: 'accepted',
            type: 'exam'
          });
      }

      // 2. Update request status to matched
      await supabase
        .from('exam_requests')
        .update({ status: 'matched', scribe_id: profile.id })
        .eq('id', exam.id);

      // 3. Notify student
      await supabase
        .from('notifications')
        .insert({
          user_id: exam.student_id,
          title: '📅 Scribe Match Confirmed',
          message: `${profile.official_name || profile.full_name} accepted your invitation for "${exam.subject}".`,
          is_read: 0,
          created_at: new Date().toISOString()
        });

      Alert.alert('Success', 'You have accepted this request. It is now added to your plans!');
      fetchSession();
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to accept invitation.');
      setLoading(false);
    }
  };

  const handleApplyDirect = async (exam: any) => {
    if (profile?.verification_status !== 'approved') {
      Alert.alert(
        'Verification Required',
        'Your profile must be completed before you can apply.'
      );
      return;
    }

    setLoading(true);
    try {
      // Check if already applied
      const { data: existingApps } = await supabase
        .from('scribe_applications')
        .select('id')
        .eq('request_id', exam.id)
        .eq('scribe_id', profile.id)
        .eq('type', 'exam');

      if (existingApps && existingApps.length > 0) {
        Alert.alert('Already Applied', 'You have already submitted an application for this exam request.');
        setLoading(false);
        return;
      }

      // 1. Insert pending application for manual student review
      await supabase
        .from('scribe_applications')
        .insert({
          request_id: exam.id,
          scribe_id: profile.id,
          scribe_name: profile.official_name || profile.full_name,
          status: 'pending',
          type: 'exam'
        });

      // 2. Notify student
      await supabase
        .from('notifications')
        .insert({
          user_id: exam.student_id,
          title: 'New Scribe Application',
          message: `${profile.official_name || profile.full_name} has applied to scribe for your "${exam.subject || 'Exam'}" exam.`,
          is_read: 0,
          created_at: new Date().toISOString()
        });

      Alert.alert('Application Sent!', 'Your application has been sent to the student for manual review.');
      fetchSession();
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to submit application.');
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

  const getScribeBadge = (reviewCount: number) => {
    if (reviewCount === 0) return { name: 'Novice', bg: '#f1f5f9', border: '#e2e8f0', text: '#64748b' };
    if (reviewCount >= 1 && reviewCount < 10) return { name: 'Apprentice', bg: 'rgba(37,99,235,0.06)', border: 'rgba(37,99,235,0.18)', text: '#2563eb' };
    if (reviewCount >= 10 && reviewCount < 25) return { name: 'Bronze', bg: 'rgba(180,83,9,0.06)', border: 'rgba(180,83,9,0.18)', text: '#b45309' };
    if (reviewCount >= 25 && reviewCount < 50) return { name: 'Silver', bg: 'rgba(100,116,139,0.06)', border: 'rgba(100,116,139,0.18)', text: '#64748b' };
    if (reviewCount >= 50 && reviewCount < 100) return { name: 'Gold', bg: 'rgba(234,179,8,0.06)', border: 'rgba(234,179,8,0.18)', text: '#ca8a04' };
    return { name: 'Diamond', bg: 'rgba(6,182,212,0.06)', border: 'rgba(6,182,212,0.18)', text: '#0891b2' };
  };

  const isVerified = profile?.verification_status === 'approved';
  const isPending = profile?.verification_status === 'pending';
  const isUnverified = !profile?.verification_status || profile.verification_status === 'unverified';

  const TEXT = '#0f172a';
  const MUTED = '#64748b';
  const BLUE = '#2563eb';
  const BLUE_BG_LIGHT = 'rgba(37,99,235,0.08)';
  const GREEN = '#059669';
  const GREEN_BG_LIGHT = 'rgba(5,150,105,0.08)';
  const GREEN_BD = 'rgba(5,150,105,0.22)';

  return (
    <>
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
              Scribe Portal
            </Text>
            <Ionicons name="school" size={12} color="#94a3b8" />
          </View>
          <Text style={{ fontFamily: 'Roboto', fontSize: 24, fontWeight: '900', color: TEXT, marginTop: 4, letterSpacing: -0.5 }}>
            {t('hello_user', { name: getFirstName(profile?.full_name, 'Scribe') })}
          </Text>
        </View>

        {/* Scribe Avatar & Badge Container */}
        <View style={{ position: 'relative' }}>
          <View style={{
            width: 48,
            height: 48,
            borderRadius: 24,
            backgroundColor: 'rgba(16,185,129,0.08)',
            borderWidth: 2,
            borderColor: 'rgba(16,185,129,0.18)',
            alignItems: 'center',
            justifyContent: 'center',
            shadowColor: '#10b981',
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.15,
            shadowRadius: 8,
            elevation: 3,
          }}>
            <Text style={{ fontFamily: 'Roboto', color: '#10b981', fontWeight: '900', fontSize: 18 }}>
              {profile?.full_name?.charAt(0)?.toUpperCase() ?? 'S'}
            </Text>
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
        <View style={{ backgroundColor: '#fff', borderWidth: 1, borderColor: '#fef3c7', padding: 20, borderRadius: 24, shadowColor: '#d97706', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.05, shadowRadius: 10, elevation: 2, marginBottom: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <View style={{ flex: 1, paddingRight: 16 }}>
            <Text style={{ fontFamily: 'Roboto', fontSize: 15, fontWeight: '800', color: '#92400e' }}>{t('complete_profile')}</Text>
            <Text style={{ fontFamily: 'Roboto', fontSize: 12, color: MUTED, marginTop: 4, lineHeight: 18 }}>
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
          <Text style={{ fontFamily: 'Roboto', fontSize: 12, color: MUTED, lineHeight: 18 }}>
            {t('verification_pending_desc')}
          </Text>
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
            Verified Scribe Volunteer Profile
          </Text>
        </View>
      )}

      {/* Incoming Invitations List */}
      {incomingInvitations.length > 0 && (
        <View style={{ marginBottom: 20 }}>
          <Text style={{ fontFamily: 'Roboto', color: '#db2777', fontWeight: '900', fontSize: 13, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 }}>
            💌 Incoming Invitations ({incomingInvitations.length})
          </Text>
          {incomingInvitations.map((invite) => {
            const isAssign = invite.type === 'assignment';
            const details = invite.details || {};
            const isExpanded = expandedInviteIds.has(invite.id);

            return (
              <View 
                key={invite.id}
                style={{ 
                  backgroundColor: '#ffffff', 
                  borderRadius: 20, 
                  borderWidth: 1.5, 
                  borderColor: '#fca5a5', 
                  shadowColor: '#ef4444', 
                  shadowOffset: { width: 0, height: 4 }, 
                  shadowOpacity: 0.08, 
                  shadowRadius: 12, 
                  elevation: 3, 
                  marginBottom: 10,
                  overflow: 'hidden'
                }}
              >
                {/* ── Collapsed Header Row ── */}
                <TouchableOpacity
                  onPress={() => toggleInviteCard(invite.id)}
                  activeOpacity={0.8}
                  style={{
                    flexDirection: 'row', alignItems: 'center',
                    paddingHorizontal: 16, paddingVertical: 14, gap: 10,
                  }}
                >
                  <View style={{
                    width: 38, height: 38, borderRadius: 11,
                    backgroundColor: 'rgba(219,39,119,0.08)',
                    alignItems: 'center', justifyContent: 'center',
                    borderWidth: 1,
                    borderColor: 'rgba(219,39,119,0.18)',
                  }}>
                    <Feather name="mail" size={16} color="#db2777" />
                  </View>

                  <View style={{ flex: 1 }}>
                    <Text style={{ fontFamily: 'Roboto', fontSize: 15, fontWeight: '900', color: TEXT }} numberOfLines={1}>
                      {details.subject || 'Invitation'}
                    </Text>
                  </View>

                  <View style={{ paddingVertical: 3, paddingHorizontal: 9, borderRadius: 20, backgroundColor: 'rgba(219,39,119,0.08)', borderWidth: 1, borderColor: 'rgba(219,39,119,0.18)', marginRight: 4 }}>
                    <Text style={{ fontFamily: 'Roboto', fontSize: 9, fontWeight: '800', color: '#db2777' }}>
                      {isAssign ? '📝 Assignment' : '📅 Scribe'}
                    </Text>
                  </View>

                  <Feather
                    name={isExpanded ? 'chevron-up' : 'chevron-down'}
                    size={16} color={MUTED}
                  />
                </TouchableOpacity>

                {/* ── Expanded Detail Panel ── */}
                {isExpanded && (
                  <View style={{ borderTopWidth: 1, borderTopColor: '#f1f5f9', paddingHorizontal: 16, paddingTop: 12, paddingBottom: 14, gap: 12 }}>
                    <View style={{ gap: 6 }}>
                      <Text style={{ fontFamily: 'Roboto', fontSize: 12, color: '#475569' }}>
                        Student: <Text style={{ fontWeight: '700', color: TEXT }}>{details.student_name || 'Student'}</Text>
                      </Text>
                      <Text style={{ fontFamily: 'Roboto', fontSize: 12, color: '#475569' }}>
                        {isAssign ? 'Deadline: ' : 'Exam Date: '}
                        <Text style={{ fontWeight: '700', color: TEXT }}>
                          {isAssign ? details.deadline : details.exam_date}
                        </Text>
                      </Text>
                      {isAssign ? (
                        <Text style={{ fontFamily: 'Roboto', fontSize: 12, color: '#475569' }} numberOfLines={1}>
                          Title: <Text style={{ fontWeight: '700', color: TEXT }}>{details.assignment_title}</Text>
                        </Text>
                      ) : (
                        <Text style={{ fontFamily: 'Roboto', fontSize: 12, color: '#475569' }} numberOfLines={1}>
                          Venue: <Text style={{ fontWeight: '700', color: TEXT }}>{details.exam_venue}</Text>
                        </Text>
                      )}
                    </View>

                    {/* View Details Button */}
                    <TouchableOpacity
                      onPress={() => router.push(`/console/scribe/apply?id=${invite.request_id}&type=${invite.type}` as any)}
                      style={{
                        width: '100%',
                        backgroundColor: 'rgba(37,99,235,0.05)',
                        borderWidth: 1.5,
                        borderColor: '#2563eb',
                        paddingVertical: 10,
                        borderRadius: 12,
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexDirection: 'row',
                        gap: 6,
                        marginBottom: 4,
                      }}
                    >
                      <Feather name="file-text" size={12} color="#2563eb" />
                      <Text style={{ fontFamily: 'Roboto', color: '#2563eb', fontWeight: '800', fontSize: 12 }}>View Details</Text>
                    </TouchableOpacity>

                    {/* Actions */}
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                      <TouchableOpacity
                        onPress={() => handleAcceptInvitation(invite)}
                        style={{ flex: 1, backgroundColor: '#059669', paddingVertical: 10, borderRadius: 12, alignItems: 'center', justifyContent: 'center' }}
                      >
                        <Text style={{ fontFamily: 'Roboto', color: '#fff', fontSize: 12, fontWeight: '800' }}>Accept</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => handleRejectInvitation(invite)}
                        style={{ flex: 1, backgroundColor: '#fff', borderWidth: 1.5, borderColor: '#fca5a5', paddingVertical: 10, borderRadius: 12, alignItems: 'center', justifyContent: 'center' }}
                      >
                        <Text style={{ fontFamily: 'Roboto', color: '#ef4444', fontSize: 12, fontWeight: '800' }}>Decline</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                )}
              </View>
            );
          })}
        </View>
      )}

      {/* Scribe Stats Summary (One block, color coded Blue, Orange, Green) */}
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
        {/* Contributions Stats (Blue) */}
        <View style={{ flex: 1, alignItems: 'center' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
            <Feather name="award" size={12} color="#2563eb" />
            <Text style={{ fontFamily: 'Roboto', fontSize: 10, fontWeight: '800', color: '#64748b', textTransform: 'uppercase' }}>Contributions</Text>
          </View>
          <Text style={{ fontFamily: 'Roboto', fontSize: 20, fontWeight: '900', color: '#2563eb' }}>{scribeCommitments.length}</Text>
        </View>

        <View style={{ width: 1, height: 28, backgroundColor: '#e2e8f0' }} />

        {/* Applications Stats (Orange) */}
        <View style={{ flex: 1, alignItems: 'center' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
            <Feather name="file-text" size={12} color="#ea580c" />
            <Text style={{ fontFamily: 'Roboto', fontSize: 10, fontWeight: '800', color: '#64748b', textTransform: 'uppercase' }}>Applications</Text>
          </View>
          <Text style={{ fontFamily: 'Roboto', fontSize: 20, fontWeight: '900', color: '#ea580c' }}>{pendingApplicationsCount}</Text>
        </View>

        <View style={{ width: 1, height: 28, backgroundColor: '#e2e8f0' }} />

        {/* Available Stats (Green) */}
        <View style={{ flex: 1, alignItems: 'center' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
            <Feather name="search" size={12} color="#10b981" />
            <Text style={{ fontFamily: 'Roboto', fontSize: 10, fontWeight: '800', color: '#64748b', textTransform: 'uppercase' }}>Available</Text>
          </View>
          <Text style={{ fontFamily: 'Roboto', fontSize: 20, fontWeight: '900', color: '#10b981' }}>{availableExams.length}</Text>
        </View>
      </View>

      {/* My Contributions Block */}
      <View style={{ marginBottom: 24 }}>
        <Text style={{ fontFamily: 'Roboto', color: '#475569', fontWeight: '800', fontSize: 14, marginBottom: 12 }}>My Contributions</Text>
        <View style={{ flexDirection: 'row', gap: 12 }}>
          {/* Card 1: Hours Contributed */}
          <View style={{ flex: 1, backgroundColor: '#ffffff', borderWidth: 1.5, borderColor: '#e2e8f0', borderRadius: 24, padding: 18, shadowColor: '#64748b', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.05, shadowRadius: 16, elevation: 2 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <Feather name="clock" size={16} color="#059669" />
              <View style={{ backgroundColor: 'rgba(5,150,105,0.08)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 }}>
                <Text style={{ fontFamily: 'Roboto', fontSize: 8, fontWeight: '800', color: '#059669' }}>HOURS</Text>
              </View>
            </View>
            <Text style={{ fontFamily: 'Roboto', fontSize: 22, fontWeight: '900', color: TEXT }}>{completedExamsCount * 3} Hours</Text>
          </View>

          {/* Card 2: Requests Completed */}
          <View style={{ flex: 1, backgroundColor: '#ffffff', borderWidth: 1.5, borderColor: '#e2e8f0', borderRadius: 24, padding: 18, shadowColor: '#64748b', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.05, shadowRadius: 16, elevation: 2 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <Feather name="award" size={16} color="#d97706" />
              <View style={{ backgroundColor: 'rgba(217,119,6,0.08)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 }}>
                <Text style={{ fontFamily: 'Roboto', fontSize: 8, fontWeight: '800', color: '#d97706' }}>EXAMS</Text>
              </View>
            </View>
            <Text style={{ fontFamily: 'Roboto', fontSize: 22, fontWeight: '900', color: TEXT }}>{completedExamsCount} Requests</Text>
          </View>
        </View>
      </View>

      {/* My Ratings Section */}
      <View style={{ marginBottom: 24 }}>
        <Text style={{ fontFamily: 'Roboto', color: '#475569', fontWeight: '800', fontSize: 14, marginBottom: 12 }}>My Ratings</Text>
        
        <TouchableOpacity 
          onPress={() => setIsRatingsExpanded(!isRatingsExpanded)}
          activeOpacity={0.85}
          style={{ 
            backgroundColor: '#ffffff',
            borderRadius: 24,
            borderWidth: 1.5,
            borderColor: '#e2e8f0',
            padding: 16,
            shadowColor: '#64748b',
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.04,
            shadowRadius: 12,
            elevation: 2
          }}
        >
          {/* Collapsed Summary Header Row inside the card */}
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', position: 'relative' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              {/* First: Number of reviews */}
              <View style={{ 
                backgroundColor: 'rgba(37,99,235,0.06)', 
                borderWidth: 1, 
                borderColor: 'rgba(37,99,235,0.18)', 
                paddingHorizontal: 9, 
                paddingVertical: 3.5, 
                borderRadius: 7,
              }}>
                <Text style={{ fontFamily: 'Roboto', fontSize: 10, fontWeight: '800', color: '#2563eb' }}>
                  {reviews.length} {reviews.length === 1 ? 'REVIEW' : 'REVIEWS'}
                </Text>
              </View>
            </View>

            {/* Mid: Absolute Centered Ratings Stars */}
            <View 
              style={{ 
                position: 'absolute', 
                left: 0, 
                right: 0, 
                top: 0, 
                bottom: 0, 
                justifyContent: 'center', 
                alignItems: 'center',
                zIndex: -1
              }}
              pointerEvents="none"
            >
              <View style={{ flexDirection: 'row', gap: 3 }}>
                {[1, 2, 3, 4, 5].map((star) => {
                  const ratingVal = finalRating;
                  const hasNoReviews = reviews.length === 0;
                  
                  let starName: "star" | "star-outline" = "star-outline";
                  let starColor = "#cbd5e1"; // silver/gray
                  
                  if (hasNoReviews) {
                    starName = "star";
                    starColor = "#cbd5e1"; // filled silver
                  } else {
                    const isFilled = ratingVal > 0 && star <= Math.round(ratingVal);
                    starName = isFilled ? "star" : "star-outline";
                    starColor = isFilled ? "#eab308" : "#cbd5e1";
                  }
                  return (
                    <Ionicons 
                      key={star} 
                      name={starName} 
                      size={22} 
                      color={starColor} 
                    />
                  );
                })}
              </View>
            </View>

            {/* Right: Stage Badge & Chevron */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              {(() => {
                const badge = getScribeBadge(reviews.length);
                return (
                  <View style={{ 
                    backgroundColor: badge.bg, 
                    borderWidth: 1, 
                    borderColor: badge.border, 
                    paddingHorizontal: 9, 
                    paddingVertical: 3.5, 
                    borderRadius: 7,
                  }}>
                    <Text style={{ fontFamily: 'Roboto', fontSize: 10, fontWeight: '800', color: badge.text }}>
                      {badge.name}
                    </Text>
                  </View>
                );
              })()}
              <Feather name={isRatingsExpanded ? "chevron-up" : "chevron-down"} size={18} color="#64748b" />
            </View>
          </View>

          {/* Expanded Content */}
          {isRatingsExpanded && (
            <View style={{ marginTop: 16, borderTopWidth: 1, borderColor: '#f1f5f9', paddingTop: 16 }}>
              {/* Score Dashboard Header */}
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
                <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4 }}>
                  <Text style={{ fontFamily: 'Roboto', fontSize: 36, fontWeight: '900', color: TEXT }}>
                    {finalRating.toFixed(1)}
                  </Text>
                  <Text style={{ fontFamily: 'Roboto', fontSize: 14, fontWeight: '700', color: '#64748b' }}>/5.0</Text>
                </View>
                <View style={{ flex: 1, marginLeft: 16 }}>
                  <View style={{ flexDirection: 'row', gap: 3, marginBottom: 2 }}>
                    {[1, 2, 3, 4, 5].map((star) => {
                      const ratingVal = finalRating;
                      const hasNoReviews = reviews.length === 0;
                      
                      let starName: "star" | "star-outline" = "star-outline";
                      let starColor = "#cbd5e1"; // silver/gray
                      
                      if (hasNoReviews) {
                        starName = "star";
                        starColor = "#cbd5e1"; // filled silver
                      } else {
                        const isFilled = ratingVal > 0 && star <= Math.round(ratingVal);
                        starName = isFilled ? "star" : "star-outline";
                        starColor = isFilled ? "#eab308" : "#cbd5e1";
                      }
                      return (
                        <Ionicons 
                          key={star} 
                          name={starName} 
                          size={22} 
                          color={starColor} 
                        />
                      );
                    })}
                  </View>
                  <Text style={{ fontFamily: 'Roboto', fontSize: 10, color: '#64748b' }}>
                    Overall rating from students
                  </Text>
                </View>
              </View>

              {/* Metric Ratings list */}
              <View style={{ gap: 8 }}>
                {[
                  { label: 'Punctuality', val: avgPunctuality, icon: 'time-outline' },
                  { label: 'Communication', val: avgCommunication, icon: 'chatbubble-ellipses-outline' },
                  { label: 'Writing Speed', val: avgSpeed, icon: 'speedometer-outline' },
                  { label: 'Behavior & Conduct', val: avgBehavior, icon: 'shield-checkmark-outline' },
                  { label: 'Overall Experience', val: avgOverall, icon: 'star-outline' }
                ].map((metric) => (
                  <View key={metric.label} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', width: '38%', gap: 6 }}>
                      <Ionicons name={metric.icon as any} size={13} color="#64748b" />
                      <Text style={{ fontFamily: 'Roboto', fontSize: 11, fontWeight: '700', color: '#64748b' }} numberOfLines={1}>
                        {metric.label}
                      </Text>
                    </View>
                    <View style={{ flex: 1, height: 6, backgroundColor: '#f1f5f9', borderRadius: 3, marginHorizontal: 12, overflow: 'hidden' }}>
                      <View style={{ height: '100%', width: `${(metric.val / 5) * 100}%`, backgroundColor: '#10b981', borderRadius: 3 }} />
                    </View>
                    <Text style={{ fontFamily: 'Roboto', fontSize: 11, fontWeight: '800', color: TEXT, width: '12%', textAlign: 'right' }}>
                      {metric.val.toFixed(1)}
                    </Text>
                  </View>
                ))}
              </View>
            </View>
          )}
        </TouchableOpacity>
      </View>

      {/* Upcoming Confirmed Exams (My Plans - Collapsible) */}
      {scribeCommitments.length > 0 && (
        <View style={{ marginBottom: 24 }}>
          <Text style={{ fontFamily: 'Roboto', color: '#475569', fontWeight: '800', fontSize: 14, marginBottom: 12 }}>My Plans</Text>
          {scribeCommitments.map((exam) => {
            const isEmergency = exam.is_emergency === 'yes';
            const isExpanded = expandedMatchIds.has(exam.id);

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
                  overflow: 'hidden'
                }}
              >
                {/* ── Collapsed Header Row ── */}
                <TouchableOpacity
                  onPress={() => toggleMatchCard(exam.id)}
                  activeOpacity={0.8}
                  style={{
                    flexDirection: 'row', alignItems: 'center',
                    paddingHorizontal: 16, paddingVertical: 14, gap: 10,
                  }}
                >
                  {/* Subject icon */}
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
                      {exam.subject || 'Exam'}
                    </Text>
                  </View>

                  {/* Status pill */}
                  <View style={{ 
                    backgroundColor: 'rgba(22,163,74,0.08)', borderWidth: 1, borderColor: 'rgba(22,163,74,0.2)', 
                    paddingVertical: 3, paddingHorizontal: 9, borderRadius: 20, marginRight: 4
                  }}>
                    <Text style={{ fontFamily: 'Roboto', fontSize: 9, fontWeight: '800', color: '#16a34a' }}>
                      Confirmed
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
                    {/* Remaining details stacked */}
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

                      {/* 4. Student profile */}
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Feather name="user" size={12} color="#64748b" style={{ width: 14 }} />
                        <Text style={{ fontFamily: 'Roboto', color: '#475569', fontSize: 12, fontWeight: '600' }}>
                          {t('candidate_student')}: {exam.student_name} ({exam.education_grade})
                        </Text>
                      </View>

                      {/* 5. Language */}
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Feather name="globe" size={12} color={MUTED} style={{ width: 14 }} />
                        <Text style={{ fontFamily: 'Roboto', color: '#475569', fontSize: 12, fontWeight: '600' }}>
                          {t('exam_language')}: {exam.exam_language}
                        </Text>
                      </View>
                    </View>

                    {/* Chat & Call Action buttons */}
                    <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
                      {/* Call */}
                      <TouchableOpacity 
                        onPress={() => openCallSheet(exam)}
                        style={{ flex: 1, backgroundColor: '#f8fafc', borderWidth: 1, borderColor: '#e2e8f0', paddingVertical: 10, borderRadius: 12, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6 }}
                      >
                        <Feather name="phone" size={12} color="#334155" />
                        <Text style={{ fontFamily: 'Roboto', color: '#334155', fontWeight: '800', fontSize: 12 }}>{t('call')}</Text>
                      </TouchableOpacity>

                      {/* Chat */}
                      <TouchableOpacity 
                        onPress={() => router.push(`/console/common/chat?requestId=${exam.id}` as any)}
                        style={{ flex: 1, backgroundColor: '#f8fafc', borderWidth: 1, borderColor: '#e2e8f0', paddingVertical: 10, borderRadius: 12, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6 }}
                      >
                        <Feather name="message-square" size={12} color="#334155" />
                        <Text style={{ fontFamily: 'Roboto', color: '#334155', fontWeight: '800', fontSize: 12 }}>{t('chat')}</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                )}
              </View>
            );
          })}
        </View>
      )}

      {/* Available Opportunities List */}
      <View>
        <Text style={{ fontFamily: 'Roboto', color: '#475569', fontWeight: '800', fontSize: 14, marginBottom: 12 }}>{t('available_opportunities')}</Text>

        {availableExams.length === 0 ? (
          <View style={{
            backgroundColor: '#ffffff',
            padding: 24, borderRadius: 24,
            borderWidth: 1.5, borderColor: '#e2e8f0',
            shadowColor: '#64748b', shadowOffset: { width: 0, height: 6 },
            shadowOpacity: 0.08, shadowRadius: 16, elevation: 3,
            alignItems: 'center', justifyContent: 'center'
          }}>
            <Feather name="inbox" size={28} color="#94a3b8" />
            <Text style={{ fontFamily: 'Roboto', color: '#94a3b8', fontSize: 12, marginTop: 8, textAlign: 'center' }}>{t('no_opportunities_found')}</Text>
          </View>
        ) : (
          availableExams.map((exam) => {
            const isExpanded = expandedAvailableIds.has(exam.id);
            const isEmergency = exam.is_emergency === 'yes';

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
                  overflow: 'hidden'
                }}
              >
                {/* ── Collapsed Header Row ── */}
                <TouchableOpacity
                  onPress={() => toggleAvailableCard(exam.id)}
                  activeOpacity={0.8}
                  style={{
                    flexDirection: 'row', alignItems: 'center',
                    paddingHorizontal: 16, paddingVertical: 14, gap: 10,
                  }}
                >
                  {/* Subject icon */}
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
                      {exam.subject || 'Exam'}
                    </Text>
                  </View>

                  {/* Badges container */}
                  <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end', marginRight: 4 }}>
                    {isEmergency && (
                      <View style={{ paddingVertical: 3, paddingHorizontal: 8, borderRadius: 12, backgroundColor: '#fee2e2', borderWidth: 1, borderColor: '#fca5a5' }}>
                        <Text style={{ fontFamily: 'Roboto', fontSize: 8, fontWeight: '900', color: '#b91c1c' }}>🚨 SOS</Text>
                      </View>
                    )}
                    {!!exam.private_scribe_id && (
                      <View style={{ paddingVertical: 3, paddingHorizontal: 8, borderRadius: 12, backgroundColor: 'rgba(219,39,119,0.08)', borderWidth: 1, borderColor: 'rgba(219,39,119,0.2)' }}>
                        <Text style={{ fontFamily: 'Roboto', fontSize: 8, fontWeight: '800', color: '#db2777' }}>INVITE</Text>
                      </View>
                    )}
                  </View>

                  {/* Chevron */}
                  <Feather
                    name={isExpanded ? 'chevron-up' : 'chevron-down'}
                    size={16} color={MUTED}
                  />
                </TouchableOpacity>

                {/* ── Expanded Detail Panel ── */}
                {isExpanded && (
                  <View style={{ borderTopWidth: 1, borderTopColor: '#f1f5f9', paddingHorizontal: 16, paddingTop: 12, paddingBottom: 14, gap: 12 }}>
                    {/* Remaining details stacked */}
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

                      {/* 4. Student profile */}
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Feather name="user" size={12} color="#64748b" style={{ width: 14 }} />
                        <Text style={{ fontFamily: 'Roboto', color: '#475569', fontSize: 12, fontWeight: '600' }}>
                          {t('candidate_student')}: {exam.student_name} ({exam.education_grade})
                        </Text>
                      </View>

                      {/* 5. Language */}
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Feather name="globe" size={12} color={MUTED} style={{ width: 14 }} />
                        <Text style={{ fontFamily: 'Roboto', color: '#475569', fontSize: 12, fontWeight: '600' }}>
                          {t('exam_language')}: {exam.exam_language}
                        </Text>
                      </View>
                    </View>

                    {/* Apply action button */}
                    <TouchableOpacity 
                      onPress={() => {
                        if (isVerified) {
                          if (!agreedGuidelines) {
                            setPendingTargetAction({ exam, isInvite: !!exam.private_scribe_id });
                            setShowGuidelinesModal(true);
                          } else {
                            if (exam.private_scribe_id) {
                              handleAcceptInviteDirect(exam);
                            } else {
                              handleApplyDirect(exam);
                            }
                          }
                        } else {
                          Alert.alert(t('error'), 'અરજી કરવા માટે કૃપા કરીને પહેલા તમારી ચકાસણી પૂર્ણ કરો.');
                        }
                      }}
                      style={{ 
                        width: '100%', 
                        backgroundColor: exam.private_scribe_id ? '#db2777' : 'rgba(5,150,105,0.08)', 
                        paddingVertical: 11, 
                        borderRadius: 12, 
                        alignItems: 'center', 
                        justifyContent: 'center', 
                        flexDirection: 'row', 
                        gap: 6,
                        borderWidth: exam.private_scribe_id ? 0 : 1,
                        borderColor: 'rgba(5,150,105,0.22)'
                      }}
                    >
                      <Feather name={exam.private_scribe_id ? "check-circle" : "file-text"} size={12} color={exam.private_scribe_id ? "#fff" : "#059669"} />
                      <Text style={{ 
                        fontFamily: 'Roboto', 
                        color: exam.private_scribe_id ? '#fff' : '#047857', 
                        fontWeight: '800', 
                        fontSize: 12 
                      }}>
                        {exam.private_scribe_id ? 'Accept Invitation' : 'Apply as Scribe'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            );
          })
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

      {/* Guidelines Policy Modal */}
      <PolicyModal
        visible={showGuidelinesModal}
        onClose={() => setShowGuidelinesModal(false)}
        type="guidelines"
        onAgree={() => {
          setAgreedGuidelines(true);
          if (pendingTargetAction) {
            const { exam, isInvite } = pendingTargetAction;
            setPendingTargetAction(null);
            if (isInvite) {
              handleAcceptInviteDirect(exam);
            } else {
              handleApplyDirect(exam);
            }
          }
        }}
      />
    </>
  );
}
