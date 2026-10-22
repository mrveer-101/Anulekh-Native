import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, Alert, Modal, Linking } from 'react-native';
import { Feather, Ionicons, FontAwesome5 } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { supabase } from '@/core/supabase';
import { useLanguage } from '@/core/translation';
import PolicyModal from '@/components/modals/PolicyModal';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { gradient, SCRIBE_THEME as THEME } from '@/core/portalTheme';
import { DesktopGrid, useInDesktopShell } from '@/components/ui/DesktopShell';
import { useTabActive } from '@/components/ui/TabPane';
import { readScreenCache, writeScreenCache } from '@/core/screenCache';
import { CallSheetModal } from '@/components/common/modals/CallSheetModal';
import Animated, {
  Easing,
  FadeIn,
  FadeInDown,
  interpolateColor,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

const getFirstName = (fullName: string | null | undefined, defaultVal: string) => {
  if (!fullName) return defaultVal;
  const first = fullName.trim().split(/\s+/)[0];
  if (!first) return defaultVal;
  return first.charAt(0).toUpperCase() + first.slice(1);
};

// Scribe accent palette for this screen. Green matches the scribe portal; ACCENT_PALETTES.orange is the alternative.
// `contrast` is the Applications stat colour, chosen so it never matches the accent.
const ACCENT_PALETTES = {
  green: {
    main: '#059669', bright: '#10b981', dark: '#047857', soft: '#ecfdf5', border: '#a7f3d0',
    tint08: 'rgba(5,150,105,0.08)', tint12: 'rgba(16,185,129,0.12)', tint22: 'rgba(5,150,105,0.22)', tint25: 'rgba(16,185,129,0.25)',
    contrast: '#ea580c',
  },
  orange: {
    main: '#ea580c', bright: '#f97316', dark: '#c2410c', soft: '#fff7ed', border: '#fed7aa',
    tint08: 'rgba(234,88,12,0.08)', tint12: 'rgba(249,115,22,0.12)', tint22: 'rgba(234,88,12,0.22)', tint25: 'rgba(249,115,22,0.25)',
    contrast: '#059669',
  },
} as const;
const ACCENT = ACCENT_PALETTES.green;

/** Everything the scribe home shows, cached so the next visit paints instantly (see core/screenCache). */
interface ScribeHomeSnapshot {
  profile: any;
  availableExams: any[];
  scribeCommitments: any[];
  pendingApplicationsCount: number;
  completedExamsCount: number;
  reviews: any[];
  incomingInvitations: any[];
}

export default function ScribeHomeView() {
  // Inside the desktop console: no own page background, wider layout (see ui/DesktopShell).
  const inShell = useInDesktopShell();
  const { t } = useLanguage();
  // True while this tab is visible (TabPane keep-alive): refresh only then, and pause animations when hidden.
  const isActive = useTabActive();
  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [availableExams, setAvailableExams] = useState<any[]>([]);
  const [scribeCommitments, setScribeCommitments] = useState<any[]>([]);
  const [incomingInvitations, setIncomingInvitations] = useState<any[]>([]);
  const [pendingApplicationsCount, setPendingApplicationsCount] = useState(0);
  const [completedExamsCount, setCompletedExamsCount] = useState(0);
  const [reviews, setReviews] = useState<any[]>([]);
  const [expandedMatchIds, setExpandedMatchIds] = useState<Set<number>>(new Set());
  const [isSosRegistered, setIsSosRegistered] = useState(true);
  const [togglingSos, setTogglingSos] = useState(false);
  const [showAchievementsModal, setShowAchievementsModal] = useState(false);

  const handleToggleSos = async () => {
    if (!user) return;
    const nextVal = !isSosRegistered;
    setIsSosRegistered(nextVal);
    setTogglingSos(true);
    try {
      await supabase
        .from('profiles')
        .update({ is_sos_registered: nextVal ? 1 : 0 })
        .eq('id', user.id);
    } catch (e) {
      console.log('Error toggling SOS status:', e);
    } finally {
      setTogglingSos(false);
    }
  };

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
  const [agreedGuidelines, setAgreedGuidelines] = useState(false);
  const [showGuidelinesModal, setShowGuidelinesModal] = useState(false);
  const [pendingTargetAction, setPendingTargetAction] = useState<{ exam: any; isInvite: boolean } | null>(null);
  const [profilePhoto, setProfilePhoto] = useState<string | null>(null);

  // ── Motion polish ──
  // Honour the OS "Reduce Motion" setting: when on, content simply appears without animation.
  const reduceMotion = useReducedMotion();
  const enter = <T,>(animation: T) => (reduceMotion ? undefined : animation);
  // Staggered section entrance: each block rises in slightly after the previous one.
  const rise = (index: number) => enter(FadeInDown.delay(index * 70).duration(420));

  // SOS switch: knob slides and track recolours instead of jumping.
  const sosProgress = useSharedValue(isSosRegistered ? 1 : 0);
  useEffect(() => {
    sosProgress.set(withTiming(isSosRegistered ? 1 : 0, { duration: reduceMotion ? 0 : 220, easing: Easing.out(Easing.cubic) }));
  }, [isSosRegistered, reduceMotion, sosProgress]);
  const sosTrackStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(sosProgress.get(), [0, 1], ['#cbd5e1', '#ef4444']),
  }));
  const sosKnobStyle = useAnimatedStyle(() => ({ transform: [{ translateX: sosProgress.get() * 20 }] }));

  const openCallSheet = (exam: any) => {
    if (!exam) return;
    setCallExam(exam);
    setIsCallOpen(true);
  };

  // Refresh whenever the console is focused *and* this tab is the visible one (switching back to the tab
  // flips isActive and triggers a quiet background refresh; hidden tabs don't fetch).
  useFocusEffect(
    useCallback(() => {
      if (!isActive) return;
      fetchSession();
    }, [isActive])
  );

  /** Puts a snapshot (cached or freshly fetched) on screen. */
  const applySnapshot = (snap: ScribeHomeSnapshot) => {
    setProfile(snap.profile);
    if (snap.profile && snap.profile.is_sos_registered !== undefined && snap.profile.is_sos_registered !== null) {
      setIsSosRegistered(snap.profile.is_sos_registered !== 0);
    }
    setAvailableExams(snap.availableExams);
    setScribeCommitments(snap.scribeCommitments);
    setPendingApplicationsCount(snap.pendingApplicationsCount);
    setCompletedExamsCount(snap.completedExamsCount);
    setReviews(snap.reviews);
    setIncomingInvitations(snap.incomingInvitations);
  };

  /**
   * Loads the scribe home.
   * 1. Shows the last cached snapshot instantly (no spinner on repeat visits, even after an app restart).
   * 2. Fetches the profile — it decides whether this scribe may see the dashboard yet.
   * 3. Fetches everything else in parallel (all of it depends only on the scribe's id).
   * 4. Puts the fresh data on screen and caches it for next time.
   */
  const fetchSession = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const userId = session.user.id;
      setUser(session.user);

      const cached = await readScreenCache<ScribeHomeSnapshot>('scribe_home', userId);
      if (cached) {
        applySnapshot(cached);
        setLoading(false);
      }

      // 1. Profile (+ locally stored photo) — gates access to the dashboard
      const [localPhoto, { data: profileData }, skippedFlag] = await Promise.all([
        AsyncStorage.getItem(`profile_photo_${userId}`),
        supabase.from('profiles').select('*').eq('id', userId).single(),
        AsyncStorage.getItem(`onboarding_skipped_${userId}`).catch(() => null),
      ]);
      if (localPhoto) {
        setProfilePhoto(localPhoto);
      }

      const hasIdProof = !!(profileData?.aadhar_number || profileData?.aadhar_image_proof || profileData?.location);
      const isApproved = profileData?.verification_status === 'approved' || hasIdProof || skippedFlag === 'true';

      if (profileData && !isApproved) {
        router.replace('/console/scribe/complete_profile' as any);
        return;
      }

      if (profileData && hasIdProof && profileData.verification_status !== 'approved') {
        supabase.from('profiles').update({ verification_status: 'approved' }).eq('id', userId);
        profileData.verification_status = 'approved';
      }

      // 2. Everything else, in parallel
      const [
        { data: available },       // open exam requests
        { data: studentReviews },  // ratings used to prioritise students
        { data: pastMatches },     // students this scribe worked with before (boosted)
        { data: myAppsData },      // this scribe's applications (all statuses)
        { data: committed },       // confirmed commitments ("My Plans")
        { data: completed },       // completed exams (count)
        { data: reviewsData },     // reviews of this scribe
        { data: invitations },     // private invitations awaiting a reply
      ] = await Promise.all([
        supabase.from('exam_requests').select('*').eq('status', 'pending').order('created_at', { ascending: false }),
        supabase.from('student_reviews').select('student_id, rating_overall'),
        supabase.from('exam_requests').select('student_id').eq('scribe_id', userId),
        supabase.from('scribe_applications').select('request_id, status').eq('scribe_id', userId),
        supabase.from('exam_requests').select('*').eq('status', 'matched').eq('scribe_id', userId).order('created_at', { ascending: false }),
        supabase.from('exam_requests').select('id').eq('status', 'completed').eq('scribe_id', userId),
        supabase.from('scribe_reviews').select('*').eq('scribe_id', userId),
        supabase.from('scribe_applications').select('*').eq('scribe_id', userId).eq('status', 'invited'),
      ]);

      // Average rating per student (students with no reviews get the maximum, so new students aren't buried)
      const studentRatingsMap: { [studentId: string]: { sum: number; count: number } } = {};
      (studentReviews || []).forEach((r: any) => {
        if (!studentRatingsMap[r.student_id]) {
          studentRatingsMap[r.student_id] = { sum: 0, count: 0 };
        }
        studentRatingsMap[r.student_id].sum += r.rating_overall || 0;
        studentRatingsMap[r.student_id].count += 1;
      });
      const getStudentAvgRating = (studentId: string): number => {
        const stats = studentRatingsMap[studentId];
        if (!stats || stats.count === 0) return 5.0;
        return stats.sum / stats.count;
      };

      const pastStudentsSet = new Set((pastMatches || []).map((pm: any) => pm.student_id));
      const appStatusMap = new Map<number, string>();
      const rejectedRequestIds = new Set<number>();
      let pendingCount = 0;
      (myAppsData || []).forEach((a: any) => {
        appStatusMap.set(a.request_id, a.status);
        if (a.status === 'rejected') rejectedRequestIds.add(a.request_id);
        if (a.status === 'pending') pendingCount++;
      });

      // Open exams this scribe can take, best matches first:
      // SOS → private invite for this scribe → past student → student rating.
      const sortedAvailable = (available || [])
        .filter((exam: any) => {
          if (rejectedRequestIds.has(exam.id)) return false;
          if (exam.private_scribe_id && exam.private_scribe_id !== userId) return false;
          return true;
        })
        .sort((a: any, b: any) => {
          const aEmergency = a.is_emergency === 'yes' ? 1 : 0;
          const bEmergency = b.is_emergency === 'yes' ? 1 : 0;
          if (aEmergency !== bEmergency) return bEmergency - aEmergency;

          const aPrivate = a.private_scribe_id === userId ? 1 : 0;
          const bPrivate = b.private_scribe_id === userId ? 1 : 0;
          if (aPrivate !== bPrivate) return bPrivate - aPrivate;

          const aPast = pastStudentsSet.has(a.student_id) ? 1 : 0;
          const bPast = pastStudentsSet.has(b.student_id) ? 1 : 0;
          if (aPast !== bPast) return bPast - aPast;

          return getStudentAvgRating(b.student_id) - getStudentAvgRating(a.student_id);
        });

      // Attach the exam/assignment each invitation refers to (in parallel)
      const enrichedInvitations = await Promise.all(
        (invitations || []).map(async (invite: any) => {
          const table = invite.type === 'assignment' ? 'assignment_requests' : 'exam_requests';
          const { data } = await supabase.from(table).select('*').eq('id', invite.request_id).single();
          return { ...invite, details: data };
        })
      );

      // Only confirmed commitments where this scribe hasn't rejected the request and is not still unaccepted (invited/pending)
      const validCommitments = (committed || []).filter((exam: any) => {
        const appStatus = appStatusMap.get(exam.id);
        if (appStatus === 'rejected' || appStatus === 'invited' || appStatus === 'pending') {
          return false;
        }
        if (rejectedRequestIds.has(exam.id)) {
          return false;
        }
        return true;
      });

      const snapshot: ScribeHomeSnapshot = {
        profile: profileData,
        availableExams: sortedAvailable,
        scribeCommitments: validCommitments,
        pendingApplicationsCount: pendingCount,
        completedExamsCount: completed ? completed.length : 0,
        reviews: reviewsData || [],
        incomingInvitations: enrichedInvitations.filter(inv => inv.details !== null && !rejectedRequestIds.has(inv.request_id)),
      };
      applySnapshot(snapshot);
      writeScreenCache('scribe_home', userId, snapshot);

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

      // Revert the request back to pending (so the student can receive other scribes)
      // and clear the scribe_id & private_scribe_id so this scribe no longer appears as a commitment.
      const table = invite.type === 'assignment' ? 'assignment_requests' : 'exam_requests';
      await supabase
        .from(table)
        .update({ status: 'pending', scribe_id: null, private_scribe_id: null })
        .eq('id', invite.request_id);

      // Optimistically update UI so it vanishes immediately from invitations and commitments
      setIncomingInvitations(prev => prev.filter(inv => inv.id !== invite.id));
      setScribeCommitments(prev => prev.filter(c => c.id !== invite.request_id));

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
        <ActivityIndicator size="large" color={ACCENT.main} />
      </View>
    );
  }

  const isVerified = profile?.verification_status === 'approved';
  const isPending = profile?.verification_status === 'pending';
  const isUnverified = !profile?.verification_status || profile.verification_status === 'unverified';

  const TEXT = '#0f172a';
  const MUTED = '#64748b';
  const BLUE = '#2563eb';
  const BLUE_BG_LIGHT = 'rgba(37,99,235,0.08)';

  return (
    <>
      <View style={inShell ? { flex: 1 } : [{ flex: 1, backgroundColor: THEME.page }, gradient(THEME.pageGradient)]}>
      {/* Soft colour orb for depth behind the cards */}
      {!inShell && <View pointerEvents="none" style={{ position: 'absolute', top: -70, right: -80, width: 240, height: 240, borderRadius: 120, backgroundColor: THEME.orb }} />}
      <ScrollView style={{ flex: 1, paddingHorizontal: inShell ? 0 : 24, paddingVertical: 12 }} contentContainerStyle={{ paddingBottom: 100 }} showsVerticalScrollIndicator={false}>
      {/* Welcome & Profile Header Section */}
      <Animated.View entering={rise(0)}>
      <View style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 16,
        backgroundColor: THEME.hero,
        ...gradient(THEME.heroGradient),
        borderRadius: 24,
        padding: 16,
        borderWidth: 1,
        borderColor: THEME.softBorder,
        shadowColor: THEME.shadow,
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.12,
        shadowRadius: 18,
        elevation: 4,
      }}>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text style={{ fontFamily: 'Roboto', fontSize: 11, fontWeight: '800', color: THEME.accentText, letterSpacing: 0.5 }}>
              Scribe Portal
            </Text>
            <Ionicons name="school" size={12} color={THEME.accentText} />
          </View>
          <Text style={{ fontFamily: 'Roboto', fontSize: 24, fontWeight: '900', color: TEXT, marginTop: 4, letterSpacing: -0.5 }}>
            {t('hello_user', { name: getFirstName(profile?.full_name, 'Scribe') })}
          </Text>
        </View>

        {/* Scribe Avatar & Badge Container */}
        <Animated.View style={{ position: 'relative' }}>
          <View style={{
            width: 48,
            height: 48,
            borderTopLeftRadius: 22,
            borderTopRightRadius: 10,
            borderBottomLeftRadius: 14,
            borderBottomRightRadius: 22,
            backgroundColor: '#ffffff',
            borderWidth: 2,
            borderColor: '#ffffff',
            alignItems: 'center',
            justifyContent: 'center',
            shadowColor: ACCENT.bright,
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.15,
            shadowRadius: 8,
            elevation: 3,
          }}>
            <FontAwesome5 name="pen-nib" size={20} color={ACCENT.main} />
          </View>
          {isVerified && (
            <Animated.View entering={enter(FadeIn.delay(450).duration(300))} style={{
              position: 'absolute',
              bottom: -4,
              right: -4,
              backgroundColor: ACCENT.bright,
              width: 20,
              height: 20,
              borderRadius: 10,
              borderWidth: 2,
              borderColor: '#fff',
              alignItems: 'center',
              justifyContent: 'center',
            }}>
              <Ionicons name="checkmark" size={12} color="#fff" />
            </Animated.View>
          )}
        </Animated.View>
      </View>

      </Animated.View>

      {/* 1. Complete Profile Onboarding Card */}
      <Animated.View entering={rise(1)}>
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

      </Animated.View>

      {/* 2. Verification Pending Card with Simulation Tool */}
      <Animated.View entering={rise(1)}>
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

      </Animated.View>

      {/* 3. Verified Badge (Vibrant soft banner) */}
      <Animated.View entering={rise(1)}>
      {isVerified && (
        <View style={{
          backgroundColor: ACCENT.soft,
          borderWidth: 1, borderColor: ACCENT.border,
          paddingVertical: 10, paddingHorizontal: 16, borderRadius: 16,
          flexDirection: 'row', alignItems: 'center', marginBottom: 16, gap: 10,
        }}>
          <View style={{
            width: 24, height: 24, borderRadius: 12, backgroundColor: ACCENT.bright,
            alignItems: 'center', justifyContent: 'center',
          }}>
            <Ionicons name="shield-checkmark" size={13} color="#fff" />
          </View>
          <Text style={{ fontFamily: 'Roboto', color: ACCENT.dark, fontSize: 12, fontWeight: '800' }}>
            Verified Scribe Volunteer Profile
          </Text>
        </View>
      )}

      </Animated.View>

      {/* Incoming Invitations List */}
      <Animated.View entering={rise(2)}>
      {incomingInvitations.length > 0 && (
        <View style={{ marginBottom: 20 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 }}>
            <Feather name="mail" size={13} color="#db2777" />
            <Text style={{ fontFamily: 'Roboto', color: '#db2777', fontWeight: '900', fontSize: 13, textTransform: 'uppercase', letterSpacing: 0.5 }}>
              Incoming Invitations ({incomingInvitations.length})
            </Text>
          </View>
          <DesktopGrid>{incomingInvitations.map((invite) => {
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
                  borderColor: '#fbcfe8', 
                  shadowColor: '#0f172a', 
                  shadowOffset: { width: 0, height: 4 }, 
                  shadowOpacity: 0.05, 
                  shadowRadius: 12, 
                  elevation: 2, 
                  marginBottom: 12,
                  overflow: 'hidden'
                }}
              >
                {/* ── Collapsed Header Row ── */}
                <TouchableOpacity
                  onPress={() => toggleInviteCard(invite.id)}
                  activeOpacity={0.8}
                  style={{
                    flexDirection: 'row', alignItems: 'center',
                    paddingHorizontal: 16, paddingVertical: 14, gap: 12,
                  }}
                >
                  <View style={{
                    width: 42, height: 42, borderRadius: 13,
                    backgroundColor: 'rgba(219,39,119,0.08)',
                    alignItems: 'center', justifyContent: 'center',
                    borderWidth: 1,
                    borderColor: 'rgba(219,39,119,0.18)',
                  }}>
                    <Feather name="mail" size={17} color="#db2777" />
                  </View>

                  <View style={{ flex: 1 }}>
                    <Text style={{ fontFamily: 'Roboto', fontSize: 15, fontWeight: '900', color: TEXT }} numberOfLines={1}>
                      {details.subject || 'Invitation'}
                    </Text>
                  </View>

                  <View style={{ paddingVertical: 3.5, paddingHorizontal: 9, borderRadius: 999, backgroundColor: 'rgba(219,39,119,0.08)', borderWidth: 1, borderColor: 'rgba(219,39,119,0.18)', marginRight: 4 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      <Feather name={isAssign ? 'edit-3' : 'calendar'} size={9} color="#db2777" />
                      <Text style={{ fontFamily: 'Roboto', fontSize: 9.5, fontWeight: '800', color: '#db2777' }}>
                        {isAssign ? 'Assignment' : 'Scribe'}
                      </Text>
                    </View>
                  </View>

                  {/* Chevron Button */}
                  <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: '#f8fafc', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#f1f5f9' }}>
                    <Feather
                      name={isExpanded ? 'chevron-up' : 'chevron-down'}
                      size={14} color="#64748b"
                    />
                  </View>
                </TouchableOpacity>

                {/* ── Expanded Detail Panel ── */}
                {isExpanded && (
                  <Animated.View entering={enter(FadeInDown.duration(260))}>
                  <View style={{ borderTopWidth: 1, borderTopColor: '#f1f5f9', paddingHorizontal: 16, paddingTop: 12, paddingBottom: 14, gap: 12 }}>
                    <View style={{ gap: 6 }}>
                      <Text style={{ fontFamily: 'Roboto', fontSize: 12, color: '#475569' }}>
                        {t('student_prefix')}<Text style={{ fontWeight: '700', color: TEXT }}>{details.student_name || t('candidate_student')}</Text>
                      </Text>
                      <Text style={{ fontFamily: 'Roboto', fontSize: 12, color: '#475569' }}>
                        {isAssign ? t('deadline_prefix') : (t('date_time') + ': ')}
                        <Text style={{ fontWeight: '700', color: TEXT }}>
                          {isAssign ? details.deadline : details.exam_date}
                        </Text>
                      </Text>
                      {isAssign ? (
                        <Text style={{ fontFamily: 'Roboto', fontSize: 12, color: '#475569' }} numberOfLines={1}>
                          {t('title') + ': '}<Text style={{ fontWeight: '700', color: TEXT }}>{details.assignment_title}</Text>
                        </Text>
                      ) : (
                        <Text style={{ fontFamily: 'Roboto', fontSize: 12, color: '#475569' }} numberOfLines={1}>
                          {t('exam_venue') + ': '}<Text style={{ fontWeight: '700', color: TEXT }}>{details.exam_venue}</Text>
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
                      <Text style={{ fontFamily: 'Roboto', color: '#2563eb', fontWeight: '800', fontSize: 12 }}>{t('view_details')}</Text>
                    </TouchableOpacity>

                    {/* Actions */}
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                      <TouchableOpacity
                        onPress={() => handleAcceptInvitation(invite)}
                        style={{ flex: 1, backgroundColor: '#059669', paddingVertical: 10, borderRadius: 12, alignItems: 'center', justifyContent: 'center' }}
                      >
                        <Text style={{ fontFamily: 'Roboto', color: '#fff', fontSize: 12, fontWeight: '800' }}>{t('accept')}</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => handleRejectInvitation(invite)}
                        style={{ flex: 1, backgroundColor: '#fff', borderWidth: 1.5, borderColor: '#fca5a5', paddingVertical: 10, borderRadius: 12, alignItems: 'center', justifyContent: 'center' }}
                      >
                        <Text style={{ fontFamily: 'Roboto', color: '#ef4444', fontSize: 12, fontWeight: '800' }}>{t('decline')}</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                  </Animated.View>
                )}
              </View>
            );
          })}</DesktopGrid>
        </View>
      )}

      </Animated.View>

      {/* Scribe Stats Summary (One block, color coded Blue, Orange, Green) */}
      <Animated.View entering={rise(3)}>
      <View style={{
        backgroundColor: '#ffffff',
        borderRadius: 24,
        borderWidth: 1, borderColor: THEME.cardBorder,
        paddingVertical: 14,
        paddingHorizontal: 8,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-around',
        marginBottom: 20,
        shadowColor: THEME.shadow, shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.08, shadowRadius: 16, elevation: 3,
      }}>
        {/* Contributions Stats (Blue) */}
        <View style={{ flex: 1, alignItems: 'center' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
            <FontAwesome5 name="award" size={12} color="#2563eb" />
            <Text style={{ fontFamily: 'Roboto', fontSize: 10, fontWeight: '800', color: '#64748b', textTransform: 'uppercase' }}>{t('commitments')}</Text>
          </View>
          <Animated.View key={`stat-${scribeCommitments.length}`} entering={enter(FadeIn.delay(350).duration(300))}>
            <Text style={{ fontFamily: 'Roboto', fontSize: 20, fontWeight: '900', color: '#2563eb' }}>{scribeCommitments.length}</Text>
          </Animated.View>
        </View>

        <View style={{ width: 1, height: 28, backgroundColor: '#e2e8f0' }} />

        {/* Applications Stats (Orange) */}
        <View style={{ flex: 1, alignItems: 'center' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
            <FontAwesome5 name="file-alt" size={12} color={ACCENT.contrast} />
            <Text style={{ fontFamily: 'Roboto', fontSize: 10, fontWeight: '800', color: '#64748b', textTransform: 'uppercase' }}>{t('applications')}</Text>
          </View>
          <Animated.View key={`stat-${pendingApplicationsCount}`} entering={enter(FadeIn.delay(350).duration(300))}>
            <Text style={{ fontFamily: 'Roboto', fontSize: 20, fontWeight: '900', color: ACCENT.contrast }}>{pendingApplicationsCount}</Text>
          </Animated.View>
        </View>

        <View style={{ width: 1, height: 28, backgroundColor: '#e2e8f0' }} />

        {/* Available Stats (Green) */}
        <View style={{ flex: 1, alignItems: 'center' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
            <Ionicons name="search" size={13} color={ACCENT.bright} />
            <Text style={{ fontFamily: 'Roboto', fontSize: 10, fontWeight: '800', color: '#64748b', textTransform: 'uppercase' }}>{t('available')}</Text>
          </View>
          <Animated.View key={`stat-${availableExams.length}`} entering={enter(FadeIn.delay(350).duration(300))}>
            <Text style={{ fontFamily: 'Roboto', fontSize: 20, fontWeight: '900', color: ACCENT.bright }}>{availableExams.length}</Text>
          </Animated.View>
        </View>
      </View>

      </Animated.View>

      {/* My Contributions Block */}
      <Animated.View entering={rise(4)}>
      <View style={{ marginBottom: 24 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 }}>
          <View style={{ width: 30, height: 30, borderRadius: 10, backgroundColor: THEME.soft, borderWidth: 1, borderColor: THEME.softBorder, alignItems: 'center', justifyContent: 'center' }}>
            <Feather name="award" size={15} color={THEME.accentText} />
          </View>
          <Text accessibilityRole="header" style={{ fontFamily: 'Roboto', color: '#334155', fontWeight: '800', fontSize: 14.5 }}>{t('my_contributions')}</Text>
        </View>
        <View style={{ flexDirection: 'row', gap: 12 }}>
          {/* Card 1: Hours Contributed */}
          <View style={{ flex: 1, backgroundColor: '#ffffff', borderWidth: 1.5, borderColor: THEME.cardBorder, borderRadius: 24, padding: 18, shadowColor: THEME.shadow, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.05, shadowRadius: 16, elevation: 2 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <Feather name="clock" size={16} color={ACCENT.main} />
              <View style={{ backgroundColor: ACCENT.tint08, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 }}>
                <Text style={{ fontFamily: 'Roboto', fontSize: 8, fontWeight: '800', color: ACCENT.main }}>{t('hours_upper')}</Text>
              </View>
            </View>
            <Text style={{ fontFamily: 'Roboto', fontSize: 22, fontWeight: '900', color: TEXT }}>{completedExamsCount * 3} {t('hours')}</Text>
          </View>

          {/* Card 2: Requests Completed */}
          <View style={{ flex: 1, backgroundColor: '#ffffff', borderWidth: 1.5, borderColor: THEME.cardBorder, borderRadius: 24, padding: 18, shadowColor: THEME.shadow, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.05, shadowRadius: 16, elevation: 2 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <Feather name="award" size={16} color="#d97706" />
              <View style={{ backgroundColor: 'rgba(217,119,6,0.08)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 }}>
                <Text style={{ fontFamily: 'Roboto', fontSize: 8, fontWeight: '800', color: '#d97706' }}>{t('exams_upper')}</Text>
              </View>
            </View>
            <Text style={{ fontFamily: 'Roboto', fontSize: 22, fontWeight: '900', color: TEXT }}>{completedExamsCount} {t('requests_word')}</Text>
          </View>
        </View>
      </View>

      </Animated.View>

      {/* 🚨 Separate Thin Line Row Block for SOS Standby Duty Toggle */}
      <Animated.View entering={rise(5)}>
      <View style={{
        backgroundColor: '#ffffff',
        borderRadius: 18,
        borderWidth: 1.5,
        borderColor: isSosRegistered ? 'rgba(239,68,68,0.25)' : '#e2e8f0',
        paddingHorizontal: 16,
        paddingVertical: 12,
        marginBottom: 20,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        shadowColor: THEME.shadow,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.06,
        shadowRadius: 10,
        elevation: 2
      }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
          <View style={{
            width: 32,
            height: 32,
            borderRadius: 10,
            backgroundColor: isSosRegistered ? 'rgba(239,68,68,0.12)' : '#f1f5f9',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <Ionicons name="flash" size={16} color={isSosRegistered ? '#ef4444' : '#64748b'} />
          </View>
          <Text style={{ fontFamily: 'Roboto', fontSize: 13, fontWeight: '900', color: '#0f172a' }}>{t('opt_sos_standby')}</Text>
        </View>

        <TouchableOpacity
          onPress={handleToggleSos}
          disabled={togglingSos}
          activeOpacity={0.8}
          accessibilityRole="switch"
          accessibilityLabel={t('opt_sos_standby')}
          aria-checked={isSosRegistered}
          aria-disabled={togglingSos}
          style={{ marginLeft: 10 }}
        >
          <Animated.View style={[{
            width: 44,
            height: 24,
            borderRadius: 12,
            padding: 3,
            alignItems: 'flex-start',
            justifyContent: 'center',
          }, sosTrackStyle]}>
            <Animated.View style={[{ width: 18, height: 18, borderRadius: 9, backgroundColor: '#ffffff', shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.2, shadowRadius: 2, elevation: 2 }, sosKnobStyle]} />
          </Animated.View>
        </TouchableOpacity>
      </View>

      </Animated.View>

      {/* Upcoming Confirmed Exams (My Plans) */}
      <Animated.View entering={rise(6)}>
      <View style={{ marginBottom: 24 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 }}>
          <View style={{ width: 30, height: 30, borderRadius: 10, backgroundColor: THEME.soft, borderWidth: 1, borderColor: THEME.softBorder, alignItems: 'center', justifyContent: 'center' }}>
            <Feather name="calendar" size={15} color={THEME.accentText} />
          </View>
          <Text accessibilityRole="header" style={{ fontFamily: 'Roboto', color: '#334155', fontWeight: '800', fontSize: 14.5 }}>{t('my_plans')}</Text>
        </View>

        {scribeCommitments.length > 0 ? (
          <DesktopGrid>{scribeCommitments.map((exam) => {
            const isEmergency = exam.is_emergency === 'yes';
            const isExpanded = expandedMatchIds.has(exam.id);

            return (
              <View 
                key={exam.id} 
                style={{ 
                  backgroundColor: isEmergency ? '#fffdfd' : '#ffffff', 
                  borderRadius: 20, 
                  borderWidth: 1.5, 
                  borderColor: isEmergency ? '#fca5a5' : '#e2e8f0',
                  shadowColor: '#0f172a', 
                  shadowOffset: { width: 0, height: 4 }, 
                  shadowOpacity: isEmergency ? 0.06 : 0.05, 
                  shadowRadius: 12, 
                  elevation: 2, 
                  marginBottom: 12,
                  overflow: 'hidden'
                }}
              >
                {/* ── Collapsed Header Row ── */}
                <TouchableOpacity
                  onPress={() => toggleMatchCard(exam.id)}
                  activeOpacity={0.8}
                  style={{
                    flexDirection: 'row', alignItems: 'center',
                    paddingHorizontal: 16, paddingVertical: 14, gap: 12,
                  }}
                >
                  {/* Subject icon */}
                  <View style={{
                    width: 42, height: 42, borderRadius: 13,
                    backgroundColor: isEmergency ? '#fef2f2' : BLUE_BG_LIGHT,
                    alignItems: 'center', justifyContent: 'center',
                    borderWidth: 1,
                    borderColor: isEmergency ? '#fee2e2' : 'rgba(37,99,235,0.15)',
                  }}>
                    <Feather name={isEmergency ? 'alert-triangle' : 'book-open'} size={17}
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
                    paddingVertical: 3.5, paddingHorizontal: 10, borderRadius: 999, marginRight: 4
                  }}>
                    <Text style={{ fontFamily: 'Roboto', fontSize: 9.5, fontWeight: '800', color: '#16a34a' }}>
                      {t('status_matched')}
                    </Text>
                  </View>

                  {/* Chevron Button */}
                  <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: '#f8fafc', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#f1f5f9' }}>
                    <Feather
                      name={isExpanded ? 'chevron-up' : 'chevron-down'}
                      size={14} color="#64748b"
                    />
                  </View>
                </TouchableOpacity>

                {/* ── Expanded Detail Panel ── */}
                {isExpanded && (
                  <Animated.View entering={enter(FadeInDown.duration(260))}>
                  <View style={{ borderTopWidth: 1, borderTopColor: '#f1f5f9', paddingHorizontal: 16, paddingTop: 12, paddingBottom: 14, gap: 10 }}>
                    {/* Remaining details stacked */}
                    <View style={{ gap: 6 }}>
                      {/* 1. Level of exam */}
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Feather name="award" size={12} color="#64748b" style={{ width: 14 }} />
                        <Text style={{ fontFamily: 'Roboto', fontSize: 12, fontWeight: '600', color: '#475569' }}>
                          {t('level_prefix')}{exam.exam_type}
                        </Text>
                      </View>

                      {/* 2. Date and time */}
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Feather name="calendar" size={12} color="#64748b" style={{ width: 14 }} />
                        <Text style={{ fontFamily: 'Roboto', fontSize: 12, fontWeight: '600', color: '#475569' }}>
                          {t('date_time_prefix')}{exam.exam_date || t('date_not_specified')}
                        </Text>
                      </View>

                      {/* 3. Location */}
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Feather name="map-pin" size={12} color="#64748b" style={{ width: 14 }} />
                        <Text style={{ fontFamily: 'Roboto', fontSize: 12, fontWeight: '600', color: '#475569' }} numberOfLines={1}>
                          {t('location_prefix')}{exam.exam_venue || t('venue_not_specified')}
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
                        style={{ flex: 1, backgroundColor: THEME.soft, borderWidth: 1, borderColor: THEME.softBorder, paddingVertical: 10, borderRadius: 12, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6 }}
                      >
                        <Feather name="phone" size={13} color={THEME.accentText} />
                        <Text style={{ fontFamily: 'Roboto', color: THEME.accentText, fontWeight: '800', fontSize: 12 }}>{t('call')}</Text>
                      </TouchableOpacity>

                      {/* Chat */}
                      <TouchableOpacity 
                        onPress={() => router.push(`/console/common/chat?requestId=${exam.id}` as any)}
                        style={{ flex: 1, backgroundColor: THEME.soft, borderWidth: 1, borderColor: THEME.softBorder, paddingVertical: 10, borderRadius: 12, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6 }}
                      >
                        <Feather name="message-square" size={13} color={THEME.accentText} />
                        <Text style={{ fontFamily: 'Roboto', color: THEME.accentText, fontWeight: '800', fontSize: 12 }}>{t('chat')}</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                  </Animated.View>
                )}
              </View>
            );
          })}</DesktopGrid>
        ) : (
          <View style={{ backgroundColor: '#ffffff', borderRadius: 16, padding: 14, borderWidth: 1, borderColor: THEME.cardBorder, alignItems: 'center' }}>
            <Text style={{ fontFamily: 'Roboto', fontSize: 11, fontWeight: '600', color: '#94a3b8' }}>
              {t('no_confirmed_commitments')}
            </Text>
          </View>
        )}
      </View>

      </Animated.View>

      {/* 🏆 My Achievements Block */}
      <Animated.View entering={rise(7)}>
      <View style={{ marginBottom: 24 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <View style={{ width: 30, height: 30, borderRadius: 10, backgroundColor: THEME.soft, borderWidth: 1, borderColor: THEME.softBorder, alignItems: 'center', justifyContent: 'center' }}>
            <Feather name="star" size={15} color={THEME.accentText} />
          </View>
          <Text accessibilityRole="header" style={{ fontFamily: 'Roboto', color: '#334155', fontWeight: '800', fontSize: 14.5 }}>{t('my_achievements')}</Text>
          </View>
          <TouchableOpacity
            onPress={() => router.push('/console/scribe/achievements' as any)}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}
          >
            <Text style={{ fontFamily: 'Roboto', fontSize: 12, fontWeight: '800', color: THEME.accentText }}>{t('view_all')}</Text>
            <Feather name="chevron-right" size={13} color={THEME.accentText} />
          </TouchableOpacity>
        </View>

        <View style={{ flexDirection: 'row', gap: 12 }}>
          {/* Card 1: Badges Earned */}
          <TouchableOpacity 
            onPress={() => setShowAchievementsModal(true)}
            activeOpacity={0.85}
            style={{ flex: 1, backgroundColor: '#ffffff', borderWidth: 1.5, borderColor: THEME.cardBorder, borderRadius: 24, padding: 18, shadowColor: THEME.shadow, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.05, shadowRadius: 16, elevation: 2 }}
          >
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <Ionicons name="trophy-outline" size={16} color="#d97706" />
              <View style={{ backgroundColor: 'rgba(217,119,6,0.08)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 }}>
                <Text style={{ fontFamily: 'Roboto', fontSize: 8, fontWeight: '800', color: '#d97706' }}>{t('badges_upper')}</Text>
              </View>
            </View>
            <Text style={{ fontFamily: 'Roboto', fontSize: 22, fontWeight: '900', color: TEXT }}>
              {(completedExamsCount >= 5 ? 1 : 0) + (completedExamsCount >= 15 ? 1 : 0) + (completedExamsCount >= 30 ? 1 : 0)} {t('badges')}
            </Text>
          </TouchableOpacity>

          {/* Card 2: Verified Certificates */}
          <TouchableOpacity 
            onPress={() => setShowAchievementsModal(true)}
            activeOpacity={0.85}
            style={{ flex: 1, backgroundColor: '#ffffff', borderWidth: 1.5, borderColor: THEME.cardBorder, borderRadius: 24, padding: 18, shadowColor: THEME.shadow, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.05, shadowRadius: 16, elevation: 2 }}
          >
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <Ionicons name="ribbon-outline" size={16} color="#2563eb" />
              <View style={{ backgroundColor: 'rgba(37,99,235,0.08)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 }}>
                <Text style={{ fontFamily: 'Roboto', fontSize: 8, fontWeight: '800', color: '#2563eb' }}>{t('verified_upper')}</Text>
              </View>
            </View>
            <Text style={{ fontFamily: 'Roboto', fontSize: 22, fontWeight: '900', color: TEXT }}>
              {completedExamsCount} {t('certify')}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      </Animated.View>

      {/* Available Opportunities List */}
      <Animated.View entering={rise(8)}>
      <View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 }}>
          <View style={{ width: 30, height: 30, borderRadius: 10, backgroundColor: THEME.soft, borderWidth: 1, borderColor: THEME.softBorder, alignItems: 'center', justifyContent: 'center' }}>
            <Feather name="search" size={15} color={THEME.accentText} />
          </View>
          <Text accessibilityRole="header" style={{ fontFamily: 'Roboto', color: '#334155', fontWeight: '800', fontSize: 14.5 }}>{t('available_opportunities')}</Text>
        </View>

        {availableExams.length === 0 ? (
          <View style={{
            backgroundColor: '#ffffff',
            padding: 24, borderRadius: 24,
            borderWidth: 1.5, borderColor: THEME.cardBorder,
            shadowColor: THEME.shadow, shadowOffset: { width: 0, height: 6 },
            shadowOpacity: 0.08, shadowRadius: 16, elevation: 3,
            alignItems: 'center', justifyContent: 'center'
          }}>
            <Feather name="inbox" size={28} color="#94a3b8" />
            <Text style={{ fontFamily: 'Roboto', color: '#94a3b8', fontSize: 12, marginTop: 8, textAlign: 'center' }}>{t('no_opportunities_found')}</Text>
          </View>
        ) : (
          <DesktopGrid>{availableExams.map((exam) => {
            const isExpanded = expandedAvailableIds.has(exam.id);
            const isEmergency = exam.is_emergency === 'yes';

            return (
              <View 
                key={exam.id} 
                style={{ 
                  backgroundColor: isEmergency ? '#fffdfd' : '#ffffff', 
                  borderRadius: 20, 
                  borderWidth: 1.5, 
                  borderColor: isEmergency ? '#fca5a5' : (exam.private_scribe_id ? '#fbcfe8' : '#e2e8f0'),
                  shadowColor: '#0f172a', 
                  shadowOffset: { width: 0, height: 4 }, 
                  shadowOpacity: isEmergency ? 0.06 : 0.05, 
                  shadowRadius: 12, 
                  elevation: 2, 
                  marginBottom: 12,
                  overflow: 'hidden'
                }}
              >
                {/* ── Collapsed Header Row ── */}
                <TouchableOpacity
                  onPress={() => toggleAvailableCard(exam.id)}
                  activeOpacity={0.8}
                  style={{
                    flexDirection: 'row', alignItems: 'center',
                    paddingHorizontal: 16, paddingVertical: 14, gap: 12,
                  }}
                >
                  {/* Subject icon */}
                  <View style={{
                    width: 42, height: 42, borderRadius: 13,
                    backgroundColor: isEmergency ? '#fef2f2' : BLUE_BG_LIGHT,
                    alignItems: 'center', justifyContent: 'center',
                    borderWidth: 1,
                    borderColor: isEmergency ? '#fee2e2' : 'rgba(37,99,235,0.15)',
                  }}>
                    <Feather name={isEmergency ? 'alert-triangle' : 'book-open'} size={17}
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
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 3.5, paddingHorizontal: 9, borderRadius: 999, backgroundColor: '#fef2f2', borderWidth: 1, borderColor: '#fca5a5' }}>
                        <Ionicons name="flash" size={10} color="#dc2626" />
                        <Text style={{ fontFamily: 'Roboto', fontSize: 9.5, fontWeight: '900', color: '#dc2626', letterSpacing: 0.4 }}>SOS</Text>
                      </View>
                    )}
                    {!!exam.private_scribe_id && (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 3.5, paddingHorizontal: 9, borderRadius: 999, backgroundColor: '#fdf2f8', borderWidth: 1, borderColor: '#fbcfe8' }}>
                        <Feather name="lock" size={9} color="#db2777" />
                        <Text style={{ fontFamily: 'Roboto', fontSize: 9.5, fontWeight: '800', color: '#db2777' }}>INVITE</Text>
                      </View>
                    )}
                  </View>

                  {/* Chevron Button */}
                  <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: '#f8fafc', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#f1f5f9' }}>
                    <Feather
                      name={isExpanded ? 'chevron-up' : 'chevron-down'}
                      size={14} color="#64748b"
                    />
                  </View>
                </TouchableOpacity>

                {/* ── Expanded Detail Panel ── */}
                {isExpanded && (
                  <Animated.View entering={enter(FadeInDown.duration(260))}>
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
                          Alert.alert(t('error'), t('verify_first_error'));
                        }
                      }}
                      style={{ 
                        width: '100%', 
                        backgroundColor: exam.private_scribe_id ? '#db2777' : THEME.solid,
                        ...(exam.private_scribe_id ? {} : gradient(THEME.buttonGradient)),
                        paddingVertical: 12, 
                        borderRadius: 12, 
                        alignItems: 'center', 
                        justifyContent: 'center', 
                        flexDirection: 'row', 
                        gap: 6,
                        shadowColor: exam.private_scribe_id ? '#db2777' : THEME.shadow,
                        shadowOffset: { width: 0, height: 4 },
                        shadowOpacity: 0.2,
                        shadowRadius: 8,
                        elevation: 2,
                      }}
                    >
                      <Feather name={exam.private_scribe_id ? "check-circle" : "file-text"} size={13} color="#ffffff" />
                      <Text style={{
                        fontFamily: 'Roboto',
                        color: '#ffffff', 
                        fontWeight: '800', 
                        fontSize: 12 
                      }}>
                        {exam.private_scribe_id ? 'Accept Invitation' : 'Apply as Scribe'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                  </Animated.View>
                )}
              </View>
            );
          })}</DesktopGrid>
        )}
      </View>

      </Animated.View>

      {/* Need Help? Contact Support Card */}
      <Animated.View entering={rise(9)}>
      <TouchableOpacity 
        onPress={() => router.push('/console/common/support' as any)}
        style={{
          backgroundColor: '#fff',
          borderWidth: 1,
          borderColor: THEME.cardBorder,
          padding: 20,
          borderRadius: 24,
          shadowColor: THEME.shadow,
          shadowOffset: { width: 0, height: 6 },
          shadowOpacity: 0.07,
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
            backgroundColor: ACCENT.soft,
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <Feather name="life-buoy" size={20} color={ACCENT.main} />
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

      </Animated.View>

      {/* Call Modal Sheet */}
      <CallSheetModal
        visible={isCallOpen}
        onClose={() => setIsCallOpen(false)}
        exam={callExam}
        accentColor="#059669"
      />

    </ScrollView>
      </View>

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

      {/* 🏆 My Achievements & Verified Certificates Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={showAchievementsModal}
        onRequestClose={() => setShowAchievementsModal(false)}
      >
        <View style={{ flex: 1, backgroundColor: 'rgba(15,23,42,0.6)', justifyContent: 'flex-end' }}>
          <View style={{ backgroundColor: '#ffffff', borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24, maxHeight: '85%', shadowColor: '#000', shadowOffset: { width: 0, height: -10 }, shadowOpacity: 0.1, shadowRadius: 20, elevation: 15 }}>
            {/* Header */}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, borderBottomWidth: 1, borderBottomColor: '#f1f5f9', paddingBottom: 14 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <View style={{ width: 40, height: 40, borderRadius: 14, backgroundColor: 'rgba(234,179,8,0.12)', alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name="trophy" size={20} color="#eab308" />
                </View>
                <View>
                  <Text style={{ fontFamily: 'Roboto', fontSize: 18, fontWeight: '900', color: '#0f172a' }}>My Achievements</Text>
                  <Text style={{ fontFamily: 'Roboto', fontSize: 11, color: '#64748b', marginTop: 1 }}>Badges & Verified Certificates</Text>
                </View>
              </View>
              <TouchableOpacity onPress={() => setShowAchievementsModal(false)} style={{ padding: 4 }}>
                <Feather name="x" size={20} color="#64748b" />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              {/* Section 1: Unlocked Milestone Badges */}
              <View style={{ marginBottom: 24 }}>
                <Text style={{ fontFamily: 'Roboto', fontSize: 13, fontWeight: '800', color: '#475569', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 12 }}>
                  🏆 Earned Volunteer Badges
                </Text>

                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
                  {[
                    { title: 'Bronze Volunteer', icon: 'award', color: '#cd7f32', unlocked: completedExamsCount >= 5, desc: '5 Scribe Jobs Required' },
                    { title: 'Silver Volunteer', icon: 'shield-checkmark', color: '#94a3b8', unlocked: completedExamsCount >= 15, desc: '15 Scribe Jobs Required' },
                    { title: 'Gold Scribe', icon: 'star', color: '#eab308', unlocked: completedExamsCount >= 30, desc: '30 Scribe Jobs Required' },
                    { title: 'Emergency Hero', icon: 'flash', color: '#ef4444', unlocked: false, desc: '3 SOS Emergency Dispatches' },
                    { title: 'Assignment Ally', icon: 'document-text', color: '#6366f1', unlocked: false, desc: '1 Assignment Completed' },
                    { title: 'Submission Hero', icon: 'checkmark-done-circle', color: '#10b981', unlocked: false, desc: '5 Assignments Completed' },
                  ].map((b, idx) => (
                    <View key={idx} style={{
                      width: '48%',
                      backgroundColor: b.unlocked ? '#f8fafc' : '#f1f5f9',
                      borderWidth: 1.5,
                      borderColor: b.unlocked ? b.color : '#e2e8f0',
                      borderRadius: 16,
                      padding: 12,
                      opacity: b.unlocked ? 1 : 0.6,
                    }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                        <View style={{ width: 30, height: 30, borderRadius: 10, backgroundColor: `${b.color}20`, alignItems: 'center', justifyContent: 'center' }}>
                          <Ionicons name={b.icon as any} size={16} color={b.color} />
                        </View>
                        <Text style={{ fontFamily: 'Roboto', fontSize: 11, fontWeight: '900', color: b.unlocked ? '#0f172a' : '#64748b', flex: 1 }} numberOfLines={1}>
                          {b.title}
                        </Text>
                      </View>
                      <Text style={{ fontFamily: 'Roboto', fontSize: 9.5, color: '#64748b', fontWeight: '500' }}>
                        {b.unlocked ? 'Unlocked ✓' : b.desc}
                      </Text>
                    </View>
                  ))}
                </View>
              </View>

              {/* Section 2: Verified Certificates */}
              <View style={{ marginBottom: 16 }}>
                <Text style={{ fontFamily: 'Roboto', fontSize: 13, fontWeight: '800', color: '#475569', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 12 }}>
                  📜 Verified Digital Certificates
                </Text>

                <View style={{ backgroundColor: '#ffffff', borderRadius: 20, borderWidth: 1.5, borderColor: 'rgba(37,99,235,0.25)', padding: 16 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <Ionicons name="ribbon" size={20} color="#2563eb" />
                      <Text style={{ fontFamily: 'Roboto', fontSize: 14, fontWeight: '900', color: '#0f172a' }}>Official Scribing Certificate</Text>
                    </View>
                    <View style={{ backgroundColor: '#10b981', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 }}>
                      <Text style={{ fontFamily: 'Roboto', fontSize: 8, fontWeight: '900', color: '#ffffff' }}>VERIFIED QR</Text>
                    </View>
                  </View>

                  <Text style={{ fontFamily: 'Roboto', fontSize: 11, color: '#64748b', marginBottom: 12 }}>
                    Certificate ID: <Text style={{ fontWeight: '800', color: '#0f172a' }}>ANULEKH-CERT-2026</Text> • Authorized by Anulekh Disability Accessibility Network.
                  </Text>

                  <TouchableOpacity
                    onPress={() => {
                      if (user) {
                        const apiHost = process.env.EXPO_PUBLIC_API_URL || 'https://anulekh-axum.onrender.com';
                        const certUrl = `${apiHost}/api/certificates/view/${user.id}`;
                        Linking.openURL(certUrl).catch(() => {
                          Alert.alert("Certificate URL", certUrl);
                        });
                      }
                    }}
                    style={{ backgroundColor: '#2563eb', paddingVertical: 10, borderRadius: 12, alignItems: 'center', justifyContent: 'center' }}
                  >
                    <Text style={{ fontFamily: 'Roboto', fontSize: 12, fontWeight: '800', color: '#ffffff' }}>Open Official Certificate 📜</Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* View Full Achievements & Detailed List Page Button */}
              <TouchableOpacity
                onPress={() => {
                  setShowAchievementsModal(false);
                  router.push('/console/scribe/achievements' as any);
                }}
                style={{ backgroundColor: '#0f172a', paddingVertical: 14, borderRadius: 16, alignItems: 'center', justifyContent: 'center', marginTop: 12, marginBottom: 8 }}
              >
                <Text style={{ fontFamily: 'Roboto', fontSize: 13, fontWeight: '900', color: '#ffffff' }}>View Full Achievements Page →</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </>
  );
}
