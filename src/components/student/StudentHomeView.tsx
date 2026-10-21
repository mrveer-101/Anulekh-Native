/**
 * StudentHomeView — the "Home" tab of the student portal.
 *
 * Rendered inside a keep-alive <TabPane> by the student console (app/console/student/index.tsx).
 * Shows a greeting header, a verification status card (complete profile / pending / verified), a
 * request statistics strip, the "My Schedule" list of matched and SOS exams (expandable cards with
 * call, chat, declaration and SOS actions), a support link, and two modals: the scribe declaration
 * certificate and the "call your scribe" bottom sheet.
 *
 * Data: reads `profiles` (own row, plus matched scribes via core/profileLookup `getProfilesByIds`),
 * `exam_requests` and `assignment_requests`; writes `profiles.verification_status`, `exam_requests`
 * (SOS reopen) and `notifications` (SOS broadcast). All of it goes through the `supabase` object from
 * core/supabase.ts, a custom shim that sends `POST /api/query` to the Rust/Axum backend (not real
 * Supabase). The profile photo is read from AsyncStorage (`profile_photo_<userId>`).
 * Navigates to complete_profile, request_form, view_applications, common/chat and common/support.
 */
import React, { useState, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, Alert, Modal, Linking } from 'react-native';
import { Feather, Ionicons, FontAwesome5 } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { supabase } from '@/core/supabase';
import { useLanguage } from '@/core/translation';
import { hoursUntilExam } from '@/core/examDate';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { announceForAccessibility } from '@/core/a11y';
import Animated, { FadeIn, FadeInDown, useReducedMotion } from 'react-native-reanimated';
import { gradient, STUDENT_THEME as THEME } from '@/core/portalTheme';
import { DesktopGrid, useInDesktopShell } from '@/components/ui/DesktopShell';
import { useTabActive } from '@/components/ui/TabPane';
import { readScreenCache, writeScreenCache } from '@/core/screenCache';
import { getProfilesByIds } from '@/core/profileLookup';
import { CallSheetModal } from '@/components/common/modals/CallSheetModal';
import { DeclarationModal } from '@/components/common/modals/DeclarationModal';

/**
 * Returns the capitalised first word of a full name, for the greeting.
 * @param fullName   The profile's full name (may be null or blank).
 * @param defaultVal Fallback returned when there is no usable name.
 */
const getFirstName = (fullName: string | null | undefined, defaultVal: string) => {
  if (!fullName) return defaultVal;
  const first = fullName.trim().split(/\s+/)[0];
  if (!first) return defaultVal;
  return first.charAt(0).toUpperCase() + first.slice(1);
};

/** Everything the student home shows, cached so the next visit paints instantly (see core/screenCache). */
interface StudentHomeSnapshot {
  profile: any;
  confirmedPlans: any[];
  examRequestsCount: number;
  assignmentRequestsCount: number;
  confirmedAssignmentsCount: number;
}

/**
 * Student portal Home tab.
 *
 * Follows the stale-while-revalidate pattern of core/screenCache: the cached `StudentHomeSnapshot`
 * is painted first, then fresh data replaces it and is cached again. It refreshes only while its tab
 * is visible (`useTabActive` + `useFocusEffect`). Students who are neither approved nor have any ID
 * proof are redirected to the complete-profile screen.
 */
export default function StudentHomeView({ hideInlineHero = false }: { hideInlineHero?: boolean } = {}) {
  // Inside the desktop console: no own page background, wider layout (see ui/DesktopShell).
  const inShell = useInDesktopShell();
  const { t } = useLanguage();
  // True while this tab is visible (TabPane keep-alive) — data refreshes only then.
  const isActive = useTabActive();
  // Sections and cards rise in one after another (off with Reduce Motion).
  const reduceMotion = useReducedMotion();
  const rise = (index: number) => (reduceMotion ? undefined : FadeInDown.delay(Math.min(index, 8) * 70).duration(420));
  const pop = reduceMotion ? undefined : FadeIn.delay(350).duration(300);
  // Session user, loaded profile, schedule and the counts shown in the stats strip.
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
  // Profile photo from AsyncStorage; loaded but not currently rendered (the avatar shows an icon).
  const [profilePhoto, setProfilePhoto] = useState<string | null>(null);

  // Refresh whenever the console is focused *and* this tab is visible: switching back to the tab flips
  // isActive and triggers a quiet background refresh, while hidden tabs don't fetch at all.
  useFocusEffect(
    useCallback(() => {
      if (!isActive) return;
      fetchSession();
    }, [isActive])
  );

  /** Puts a snapshot (cached or freshly fetched) on screen. */
  const applySnapshot = (snap: StudentHomeSnapshot) => {
    setProfile(snap.profile);
    setConfirmedPlans(snap.confirmedPlans);
    setExamRequestsCount(snap.examRequestsCount);
    setAssignmentRequestsCount(snap.assignmentRequestsCount);
    setConfirmedAssignmentsCount(snap.confirmedAssignmentsCount);
  };

  /**
   * Loads the student home.
   * 1. Shows the last cached snapshot instantly.
   * 2. Fetches the profile — it decides whether the student may see the dashboard yet.
   * 3. Fetches exam + assignment requests in parallel (one exam query now serves both the schedule and
   *    the "Exams" count — it used to be fetched twice), then the matched scribes' profiles in one batch.
   */
  const fetchSession = async () => {
    try {
      // Nothing to load without a signed-in session.
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const userId = session.user.id;
      setUser(session.user);

      // Stale-while-revalidate: paint the last cached snapshot straight away (no spinner) while fresh
      // data loads below.
      const cached = await readScreenCache<StudentHomeSnapshot>('student_home', userId);
      if (cached) {
        applySnapshot(cached);
        setLoading(false);
      }

      // 1. Profile (+ locally stored photo) — gates access to the dashboard
      const [localPhoto, { data: profileData }] = await Promise.all([
        AsyncStorage.getItem(`profile_photo_${userId}`),
        supabase.from('profiles').select('*').eq('id', userId).single(),
      ]);
      if (localPhoto) {
        setProfilePhoto(localPhoto);
      }

      // A student counts as approved if an admin approved them or they have uploaded any ID proof
      // (Aadhaar number/image, disability certificate or location). Anyone else must finish the profile
      // first; the profile is fetched before everything else precisely so this redirect happens early.
      const hasIdProof = !!(profileData?.aadhar_number || profileData?.aadhar_image_proof || profileData?.disability_certificate || profileData?.location);
      const isApproved = profileData?.verification_status === 'approved' || hasIdProof;

      if (profileData && !isApproved) {
        router.replace('/console/student/complete_profile' as any);
        return;
      }

      // Students with ID proof are promoted to 'approved'. The local copy is updated for the UI, but note
      // the update query is not awaited, and the shim only sends a request when a query is awaited
      // (`then`), so this write does not actually reach the backend.
      if (profileData && hasIdProof && profileData.verification_status !== 'approved') {
        supabase.from('profiles').update({ verification_status: 'approved' }).eq('id', userId);
        profileData.verification_status = 'approved';
      }

      // 2. All of the student's exam requests and assignment requests, in parallel
      const [{ data: committed }, { data: assignments }] = await Promise.all([
        supabase.from('exam_requests').select('*').eq('student_id', userId).order('created_at', { ascending: false }),
        supabase.from('assignment_requests').select('id, status').eq('student_id', userId),
      ]);

      // Schedule = matched exams + pending SOS requests, with the matched scribe's profile attached
      const activePlans = (committed || []).filter((exam: any) => {
        return exam.status === 'matched' || (exam.status === 'pending' && exam.is_emergency === 'yes');
      });
      const scribes = await getProfilesByIds(activePlans.map((exam: any) => exam.scribe_id));
      const enrichedPlans = activePlans.map((exam: any) => ({
        ...exam,
        scribeProfile: (exam.scribe_id && scribes.get(exam.scribe_id)) || undefined,
      }));

      // Build the fresh snapshot, put it on screen and cache it for the next visit.
      const snapshot: StudentHomeSnapshot = {
        profile: profileData,
        confirmedPlans: enrichedPlans,
        examRequestsCount: (committed || []).length,
        assignmentRequestsCount: assignments ? assignments.length : 0,
        confirmedAssignmentsCount: (assignments || []).filter((a: any) => a.status === 'matched').length,
      };
      applySnapshot(snapshot);
      writeScreenCache('student_home', userId, snapshot);
    // Errors are only logged; whatever is on screen (e.g. the cached snapshot) stays.
    } catch (err: any) {
      console.log('Error fetching student session:', err.message);
    // Always clear the spinner, whether or not there was a cache or the fetch succeeded.
    } finally {
      setLoading(false);
    }
  };
  /**
   * Testing shortcut on the "Verification pending" card: sets the student's
   * `profiles.verification_status` to 'approved' and reloads the screen.
   */
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

  /**
   * Opens the call bottom sheet for an exam's scribe.
   * For privacy the scribe's contact is only unlocked on the exam day: the date part of `exam_date`
   * (before any "|" time suffix) must equal today's date (UTC, via toISOString), otherwise an alert
   * explains when it unlocks.
   */
  const openCallSheet = (exam: any) => {
    if (!exam || !exam.exam_date) {
      Alert.alert("Contact Info Locked 🔒", "Contact details are only unlocked on the day of the exam for privacy protection.");
      return;
    }
    
    // Compare only the date part of exam_date with today's date.
    const dateStr = exam.exam_date.split('|')[0].trim();
    const todayStr = new Date().toISOString().split('T')[0];
    
    if (dateStr !== todayStr) {
      Alert.alert("Contact Info Locked 🔒", `Scribe contact details are protected and will unlock on the exam day (${dateStr}).`);
      return;
    }

    setCallExam(exam);
    setIsCallOpen(true);
  };

  // SOS Emergency Scribe Broadcast
  const [sosSendingId, setSosSendingId] = useState<number | null>(null);
  // Which exam cards are expanded (collapsed by default)
  const [expandedExamIds, setExpandedExamIds] = useState<Set<number>>(new Set());

  /** Expands or collapses one exam card in the schedule. */
  const toggleExamCard = (id: number) => {
    setExpandedExamIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  /**
   * Emergency SOS for a confirmed exam whose scribe dropped out.
   * After the student confirms, it reopens the exam request (status 'pending', scribe cleared,
   * is_emergency 'yes'), inserts a high-priority `notifications` row for every approved scribe,
   * then reloads the home so the card shows as SOS. `sosSendingId` drives the button spinner.
   */
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

              // One notification per scribe, inserted one after another.
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

  // First load with no cached snapshot yet: full-screen spinner.
  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 10, backgroundColor: '#f8fafc' }}>
        <ActivityIndicator size="large" color="#2563eb" />
      </View>
    );
  }

  // Verification state decides which status card is shown below the header.
  const isVerified = profile?.verification_status === 'approved';
  const isPending = profile?.verification_status === 'pending';
  const isUnverified = !profile?.verification_status || profile.verification_status === 'unverified';

  // Styling is inline: page, hero and card colours come from STUDENT_THEME (core/portalTheme, with
  // gradient() for CSS gradients); these local constants cover text, blue and green accents.
  // Slate-styled theme constants
  const TEXT = '#0f172a';
  const MUTED = '#64748b';
  const BLUE = '#2563eb';
  const BLUE_BG_LIGHT = 'rgba(37,99,235,0.08)';
  const GREEN = '#059669';
  const GREEN_BG_LIGHT = 'rgba(5,150,105,0.08)';
  const GREEN_BD = 'rgba(5,150,105,0.22)';

  // Page: themed gradient background with a decorative orb, then the scrolling content. Each section is
  // wrapped in an Animated.View so the sections rise in one after another (see `rise`).
  return (
    <View style={inShell ? { flex: 1 } : [{ flex: 1, backgroundColor: THEME.page }, gradient(THEME.pageGradient)]}>
      {/* Soft colour orb for depth behind the cards */}
      {!inShell && <View pointerEvents="none" style={{ position: 'absolute', top: -70, right: -80, width: 240, height: 240, borderRadius: 120, backgroundColor: THEME.orb }} />}
    <ScrollView style={{ flex: 1, paddingHorizontal: inShell ? 0 : 24, paddingVertical: 12 }} contentContainerStyle={{ paddingBottom: 100 }} showsVerticalScrollIndicator={false}>
      {/* Welcome & Profile Header Section (hidden when dark navy hero header is active) */}
      {!hideInlineHero && (
        <Animated.View entering={rise(0)}>
        <View
          accessible={true}
          accessibilityRole="header"
          accessibilityLabel={`Welcome ${getFirstName(profile?.full_name, 'Student')}, Student Portal`}
          style={{
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
          }}
        >
          {/* "Student Portal" label and "Hello <first name>" greeting */}
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Text style={{ fontFamily: 'Roboto', fontSize: 11, fontWeight: '800', color: THEME.accentText, letterSpacing: 0.5 }}>
                {t('student_portal')}
              </Text>
              <Ionicons name="school" size={12} color={THEME.accentText}  importantForAccessibility="no" accessibilityElementsHidden={true} />
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
              backgroundColor: '#ffffff',
              borderWidth: 2,
              borderColor: '#ffffff',
              alignItems: 'center',
              justifyContent: 'center',
              shadowColor: BLUE,
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: 0.15,
              shadowRadius: 8,
              elevation: 3,
            }}>
              <FontAwesome5 name="user-graduate" size={18} color={BLUE} importantForAccessibility="no" accessibilityElementsHidden={true} />
            </View>
            {/* Green check badge on the avatar once the profile is verified */}
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
                <Feather name="check" size={10} color="#fff" importantForAccessibility="no" accessibilityElementsHidden={true} />
              </View>
            )}
          </View>
        </View>
        </Animated.View>
      )}

      {/* 1. Complete Profile Onboarding Card */}
      <Animated.View entering={rise(1)}>
      {isUnverified && (
        <View
          accessible={true}
          accessibilityLabel={`${t('complete_profile')}. ${t('profile_onboarding_desc')}`}
          style={{ backgroundColor: '#fff', borderWidth: 1, borderColor: '#fef3c7', padding: 20, borderRadius: 24, shadowColor: '#d97706', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.1, shadowRadius: 16, elevation: 3, marginBottom: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
        >
          <View style={{ flex: 1, paddingRight: 16 }}>
            <Text style={{ fontFamily: 'Roboto', fontSize: 15, fontWeight: '800', color: '#92400e' }}>{t('complete_profile')}</Text>
            <Text style={{ fontFamily: 'Roboto', fontSize: 12, color: MUTED, marginTop: 4, lineHeight: 18 }}>
              {t('profile_onboarding_desc')}
            </Text>
          </View>
          {/* Opens the complete-profile form (replace, so Back does not return to an unverified home) */}
          <TouchableOpacity 
            onPress={() => router.replace('/console/student/complete_profile' as any)}
            accessible={true}
            accessibilityRole="button"
            accessibilityLabel={`${t('verify_now')}, button`}
            accessibilityHint="Opens identity and disability verification form"
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
        <View
          accessible={true}
          accessibilityLabel={`${t('verification_pending')}. ${t('verification_pending_desc')}`}
          style={{ backgroundColor: '#fff', borderWidth: 1, borderColor: '#dbeafe', padding: 20, borderRadius: 24, shadowColor: '#2563eb', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.1, shadowRadius: 16, elevation: 3, marginBottom: 20 }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8, gap: 8 }}>
            <Feather name="clock" size={18} color={BLUE} importantForAccessibility="no" accessibilityElementsHidden={true} />
            <Text style={{ fontFamily: 'Roboto', fontSize: 15, fontWeight: '800', color: '#1e40af' }}>{t('verification_pending')}</Text>
          </View>
          <Text style={{ fontFamily: 'Roboto', fontSize: 12, color: MUTED, marginBottom: 14, lineHeight: 18 }}>
            {t('verification_pending_desc')}
          </Text>
          {/* Test-only shortcut: approves the profile instantly (simulateAdminApproval) */}
          <TouchableOpacity 
            onPress={simulateAdminApproval}
            accessible={true}
            accessibilityRole="button"
            accessibilityLabel="Instant Admin Approval Simulation"
            accessibilityHint="Simulates profile verification approval for testing"
            style={{ width: '100%', backgroundColor: BLUE, paddingVertical: 12, borderRadius: 12, alignItems: 'center', justifyContent: 'center' }}
          >
            <Text style={{ fontFamily: 'Roboto', color: '#fff', fontWeight: '800', fontSize: 12 }}>{t('auto_approve')}</Text>
          </TouchableOpacity>
        </View>
      )}

      </Animated.View>

      {/* 3. Verified Badge (Vibrant soft banner) */}
      <Animated.View entering={rise(1)}>
      {isVerified && (
        <View
          accessible={true}
          accessibilityLabel="Verified Anulekh Candidate Profile badge"
          style={{
            backgroundColor: '#ecfdf5',
            borderWidth: 1, borderColor: '#a7f3d0',
            paddingVertical: 10, paddingHorizontal: 16, borderRadius: 16,
            flexDirection: 'row', alignItems: 'center', marginBottom: 16, gap: 10,
          }}
        >
          <View style={{
            width: 24, height: 24, borderRadius: 12, backgroundColor: '#10b981',
            alignItems: 'center', justifyContent: 'center',
          }}>
            <Ionicons name="shield-checkmark" size={13} color="#fff" importantForAccessibility="no" accessibilityElementsHidden={true} />
          </View>
          <Text style={{ fontFamily: 'Roboto', color: '#047857', fontSize: 12, fontWeight: '800' }}>
            Verified Anulekh Candidate Profile
          </Text>
        </View>
      )}

      </Animated.View>

      {/* Student Stats Summary (Rendered outside the header in page body) */}
      <Animated.View entering={rise(2)}>
        <View
          accessible={true}
          accessibilityLabel={`Summary Statistics: ${examRequestsCount} exams requested, ${assignmentRequestsCount} assignments requested, ${confirmedPlans.length + confirmedAssignmentsCount} matched scribes`}
          style={{
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
          }}
        >
          {/* Exams Stats (Blue) */}
          <View style={{ flex: 1, alignItems: 'center' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
              <FontAwesome5 name="file-alt" size={12} color="#2563eb" importantForAccessibility="no" accessibilityElementsHidden={true} />
              <Text style={{ fontFamily: 'Roboto', fontSize: 10, fontWeight: '800', color: '#64748b', textTransform: 'uppercase' }}>{t('exams')}</Text>
            </View>
            {/* Keyed by the value so the number fades in again whenever it changes */}
            <Animated.View key={`stat-${examRequestsCount}`} entering={pop}>
              <Text style={{ fontFamily: 'Roboto', fontSize: 20, fontWeight: '900', color: '#2563eb' }}>{examRequestsCount}</Text>
            </Animated.View>
          </View>

          <View style={{ width: 1, height: 28, backgroundColor: '#e2e8f0' }} />

          {/* Assignments Stats (Orange) */}
          <View style={{ flex: 1, alignItems: 'center' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
              <FontAwesome5 name="book" size={12} color="#ea580c" importantForAccessibility="no" accessibilityElementsHidden={true} />
              <Text style={{ fontFamily: 'Roboto', fontSize: 10, fontWeight: '800', color: '#64748b', textTransform: 'uppercase' }}>{t('assignments')}</Text>
            </View>
            <Animated.View key={`stat-${assignmentRequestsCount}`} entering={pop}>
              <Text style={{ fontFamily: 'Roboto', fontSize: 20, fontWeight: '900', color: '#ea580c' }}>{assignmentRequestsCount}</Text>
            </Animated.View>
          </View>

          <View style={{ width: 1, height: 28, backgroundColor: '#e2e8f0' }} />

          {/* Matched Stats (Green) */}
          <View style={{ flex: 1, alignItems: 'center' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
              <FontAwesome5 name="user-check" size={12} color="#10b981" importantForAccessibility="no" accessibilityElementsHidden={true} />
              <Text style={{ fontFamily: 'Roboto', fontSize: 10, fontWeight: '800', color: '#64748b', textTransform: 'uppercase' }}>{t('matched')}</Text>
            </View>
            <Animated.View key={`stat-${confirmedPlans.length + confirmedAssignmentsCount}`} entering={pop}>
              <Text style={{ fontFamily: 'Roboto', fontSize: 20, fontWeight: '900', color: '#10b981' }}>
                {confirmedPlans.length + confirmedAssignmentsCount}
              </Text>
            </Animated.View>
          </View>
        </View>
        </Animated.View>

      {/* Upcoming Exam Schedule / Plan */}
      <Animated.View entering={rise(3)}>
      <View style={{ marginBottom: 20 }}>
        {/* Section heading */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 }}>
          <View style={{ width: 30, height: 30, borderRadius: 10, backgroundColor: THEME.soft, borderWidth: 1, borderColor: THEME.softBorder, alignItems: 'center', justifyContent: 'center' }}>
            <Feather name="calendar" size={15} color={THEME.accentText} importantForAccessibility="no" accessibilityElementsHidden={true} />
          </View>
          <Text
            accessible={true}
            accessibilityRole="header"
            style={{ fontFamily: 'Roboto', color: '#334155', fontWeight: '800', fontSize: 14.5 }}
          >
            {t('my_schedule')}
          </Text>
        </View>

        {/* Empty state with a "Request scribe" button, otherwise one expandable card per exam */}
        {confirmedPlans.length === 0 ? (
          <View style={{
            backgroundColor: '#ffffff',
            padding: 24, borderRadius: 24,
            borderWidth: 1.5, borderColor: THEME.cardBorder,
            alignItems: 'center', justifyContent: 'center',
            shadowColor: THEME.shadow, shadowOffset: { width: 0, height: 6 },
            shadowOpacity: 0.08, shadowRadius: 16, elevation: 2,
          }}>
            <View style={{ width: 60, height: 60, borderRadius: 30, backgroundColor: THEME.soft, ...gradient(THEME.heroGradient), borderWidth: 1, borderColor: THEME.softBorder, alignItems: 'center', justifyContent: 'center' }}>
              <Feather name="calendar" size={24} color={THEME.accentText} importantForAccessibility="no" accessibilityElementsHidden={true} />
            </View>
            <Text style={{ fontFamily: 'Roboto', color: '#334155', fontSize: 13.5, fontWeight: '800', marginTop: 12, textAlign: 'center' }}>{t('no_upcoming_exams')}</Text>
            <Text style={{ fontFamily: 'Roboto', color: '#64748b', fontSize: 11, marginTop: 6, textAlign: 'center', paddingHorizontal: 16 }}>
              {t('need_scribe_desc')}
            </Text>
            {/* Only verified students may open the request form */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 16 }}>
              <TouchableOpacity 
                onPress={() => {
                  if (isVerified) {
                    router.push('/console/student/request_form' as any);
                  } else {
                    Alert.alert(t('error'), t('verify_first_error'));
                  }
                }}
                accessible={true}
                accessibilityRole="button"
                accessibilityLabel={`${t('request_scribe')}, button`}
                accessibilityHint="Opens exam scribe request booking form"
                style={{
                  backgroundColor: BLUE,
                  ...gradient(THEME.buttonGradient),
                  flexDirection: 'row', alignItems: 'center', gap: 6,
                  paddingVertical: 12, paddingHorizontal: 20,
                  borderRadius: 12,
                  shadowColor: BLUE, shadowOffset: { width: 0, height: 4 },
                  shadowOpacity: 0.15, shadowRadius: 8, elevation: 3
                }}
              >
                <Feather name="plus" size={15} color="#ffffff" importantForAccessibility="no" accessibilityElementsHidden={true} />
                <Text style={{ fontFamily: 'Roboto', color: '#fff', fontWeight: '900', fontSize: 13, letterSpacing: 0.2 }}>{t('request_scribe')}</Text>
              </TouchableOpacity>

              <TouchableOpacity 
                onPress={() => {
                  if (isVerified) {
                    router.push('/console/student/request_form?mode=voice' as any);
                  } else {
                    Alert.alert(t('error'), t('verify_first_error'));
                  }
                }}
                accessible={true}
                accessibilityRole="button"
                accessibilityLabel="Voice Assistant Request"
                accessibilityHint="Opens conversational voice assistant to create exam request"
                style={{
                  backgroundColor: '#4f46e5',
                  flexDirection: 'row', alignItems: 'center', gap: 6,
                  paddingVertical: 12, paddingHorizontal: 16,
                  borderRadius: 12,
                  shadowColor: '#4f46e5', shadowOffset: { width: 0, height: 4 },
                  shadowOpacity: 0.2, shadowRadius: 8, elevation: 3
                }}
              >
                <Feather name="mic" size={15} color="#ffffff" importantForAccessibility="no" accessibilityElementsHidden={true} />
                <Text style={{ fontFamily: 'Roboto', color: '#fff', fontWeight: '900', fontSize: 13, letterSpacing: 0.2 }}>Voice AI</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <DesktopGrid>{confirmedPlans.map((exam, index) => {
            // SOS cards (pending + is_emergency) get red styling and have no scribe details yet.
            const isEmergency = exam.is_emergency === 'yes';
            const isExpanded = expandedExamIds.has(exam.id);

            return (
              <Animated.View
                key={exam.id}
                entering={rise(index + 4)}
                style={{
                  backgroundColor: isEmergency ? '#fffdfd' : '#ffffff',
                  borderRadius: 20,
                  borderWidth: 1.5,
                  borderColor: isEmergency ? '#fca5a5' : '#e2e8f0',
                  shadowColor: '#0f172a',
                  shadowOffset: { width: 0, height: 4 },
                  shadowOpacity: 0.05,
                  shadowRadius: 12,
                  elevation: 2,
                  marginBottom: 12,
                  overflow: 'hidden',
                }}
              >
                {/* ── Collapsed Header Row (Icon + Subject + Status + Chevron) ── */}
                <TouchableOpacity
                  onPress={() => {
                    toggleExamCard(exam.id);
                    announceForAccessibility(isExpanded ? 'Exam details collapsed' : 'Exam details expanded');
                  }}
                  activeOpacity={0.8}
                  accessible={true}
                  accessibilityRole="button"
                  accessibilityLabel={`${exam.subject || t('exam_fallback')}, on ${exam.exam_date || 'scheduled date'}, status: ${isEmergency ? 'Emergency SOS' : 'Confirmed'}. Double tap to ${isExpanded ? 'collapse' : 'expand'} details`}
                  style={{
                    flexDirection: 'row', alignItems: 'center',
                    paddingHorizontal: 16, paddingVertical: 14, gap: 12,
                  }}
                >
                  {/* Subject/Alert icon */}
                  <View style={{
                    width: 42, height: 42, borderRadius: 13,
                    backgroundColor: isEmergency ? '#fef2f2' : '#eff6ff',
                    alignItems: 'center', justifyContent: 'center',
                    borderWidth: 1,
                    borderColor: isEmergency ? '#fee2e2' : 'rgba(37,99,235,0.15)',
                  }}>
                    <Feather
                      name={isEmergency ? 'alert-triangle' : 'book-open'}
                      size={17}
                      color={isEmergency ? '#dc2626' : BLUE}
                      importantForAccessibility="no"
                      accessibilityElementsHidden={true}
                    />
                  </View>

                  {/* Subject Name */}
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontFamily: 'Roboto', fontSize: 15, fontWeight: '800', color: TEXT, letterSpacing: -0.2 }} numberOfLines={1}>
                      {exam.subject || t('exam_fallback')}
                    </Text>
                  </View>

                  {/* Status pill */}
                  <View style={{
                    paddingVertical: 3.5, paddingHorizontal: 9, borderRadius: 999,
                    backgroundColor: isEmergency ? '#fef2f2' : '#f0fdf4',
                    borderWidth: 1,
                    borderColor: isEmergency ? '#fca5a5' : '#bbf7d0',
                  }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                      <Feather name={isEmergency ? 'alert-triangle' : 'check-circle'} size={9} color={isEmergency ? '#dc2626' : GREEN} importantForAccessibility="no" accessibilityElementsHidden={true} />
                      <Text style={{
                        fontFamily: 'Roboto', fontSize: 9, fontWeight: '800',
                        color: isEmergency ? '#dc2626' : GREEN,
                        letterSpacing: 0.4,
                      }}>
                        {isEmergency ? 'SOS' : 'Confirmed'}
                      </Text>
                    </View>
                  </View>

                  {/* Circular Chevron Button */}
                  <View style={{
                    width: 28, height: 28, borderRadius: 14,
                    backgroundColor: '#f8fafc',
                    alignItems: 'center', justifyContent: 'center',
                    borderWidth: 1, borderColor: '#f1f5f9',
                    marginLeft: 2,
                  }}>
                    <Feather
                      name={isExpanded ? 'chevron-up' : 'chevron-down'}
                      size={15} color={MUTED}
                      importantForAccessibility="no" accessibilityElementsHidden={true}
                    />
                  </View>
                </TouchableOpacity>

                {/* ── Expanded Detail Panel ── */}
                {isExpanded && (
                  <View style={{ borderTopWidth: 1, borderTopColor: '#f1f5f9', paddingHorizontal: 16, paddingTop: 12, paddingBottom: 14, gap: 10 }}>

                    {/* SOS warning banner */}
                    {isEmergency && (
                      <View
                        accessible={true}
                        accessibilityLabel="Alert: Scribe cancelled. Re-broadcasting emergency SOS to all available scribes."
                        style={{
                          backgroundColor: '#fef2f2', padding: 10, borderRadius: 12,
                          borderWidth: 1, borderColor: '#fca5a5',
                          flexDirection: 'row', alignItems: 'center', gap: 8,
                        }}
                      >
                        <Feather name="alert-triangle" size={13} color="#dc2626" importantForAccessibility="no" accessibilityElementsHidden={true} />
                        <Text style={{ fontFamily: 'Roboto', color: '#b91c1c', fontSize: 11, fontWeight: '800', flex: 1 }}>
                          Scribe cancelled! Re-broadcasting emergency SOS to all available scribes.
                        </Text>
                      </View>
                    )}

                    {/* All details stacked inside expanded card */}
                    <View style={{ gap: 6 }}>
                      {/* 1. Level of exam */}
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Feather name="award" size={12} color="#64748b" style={{ width: 14 }} importantForAccessibility="no" accessibilityElementsHidden={true} />
                        <Text style={{ fontFamily: 'Roboto', fontSize: 12, fontWeight: '600', color: '#475569' }}>
                          Level: {exam.exam_type}
                        </Text>
                      </View>

                      {/* 2. Date and time */}
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Feather name="calendar" size={12} color="#64748b" style={{ width: 14 }} importantForAccessibility="no" accessibilityElementsHidden={true} />
                        <Text style={{ fontFamily: 'Roboto', fontSize: 12, fontWeight: '600', color: '#475569' }}>
                          Date & Time: {exam.exam_date || t('date_not_specified')}
                        </Text>
                      </View>

                      {/* 3. Location */}
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Feather name="map-pin" size={12} color="#64748b" style={{ width: 14 }} importantForAccessibility="no" accessibilityElementsHidden={true} />
                        <Text style={{ fontFamily: 'Roboto', fontSize: 12, fontWeight: '600', color: '#475569' }} numberOfLines={1}>
                          Location: {exam.exam_venue || t('venue_not_specified')}
                        </Text>
                      </View>

                      {/* Matched scribe's name (SOS requests have no scribe yet) */}
                      {!isEmergency && (
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          <Feather name="user" size={12} color={BLUE} style={{ width: 14 }} importantForAccessibility="no" accessibilityElementsHidden={true} />
                          <Text style={{ fontFamily: 'Roboto', color: '#475569', fontSize: 12, fontWeight: '600' }}>
                            {t('volunteer_scribe')}: {exam.scribeProfile?.full_name || t('volunteer_scribe')}
                          </Text>
                        </View>
                      )}

                      {/* Exam language */}
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Feather name="globe" size={12} color={MUTED} style={{ width: 14 }} importantForAccessibility="no" accessibilityElementsHidden={true} />
                        <Text style={{ fontFamily: 'Roboto', color: '#475569', fontSize: 12, fontWeight: '600' }}>
                          {t('exam_language')}: {exam.exam_language}
                        </Text>
                      </View>
                    </View>

                    {/* Action Buttons */}
                    <View style={{ gap: 8, marginTop: 2 }}>
                      {/* SOS cards link to the applications list; confirmed cards get Call / Chat and Declaration
                          (plus the SOS button close to exam time) */}
                      {isEmergency ? (
                        <TouchableOpacity
                          onPress={() => router.push(`/console/student/view_applications?id=${exam.id}` as any)}
                          accessible={true}
                          accessibilityRole="button"
                          accessibilityLabel="Tracking Emergency SOS Applications"
                          accessibilityHint="Opens applications list to accept a volunteer scribe"
                          style={{
                            width: '100%', backgroundColor: '#dc2626',
                            paddingVertical: 11, borderRadius: 12,
                            alignItems: 'center', justifyContent: 'center',
                            flexDirection: 'row', gap: 6,
                          }}
                        >
                          <ActivityIndicator size="small" color="white" />
                          <Text style={{ fontFamily: 'Roboto', color: 'white', fontWeight: '800', fontSize: 12 }}>Tracking SOS Applications...</Text>
                        </TouchableOpacity>
                      ) : (
                        <>
                          {/* Call (unlocks on exam day, see openCallSheet) and chat with the scribe */}
                          <View style={{ flexDirection: 'row', gap: 8 }}>
                            <TouchableOpacity
                              onPress={() => openCallSheet(exam)}
                              accessible={true}
                              accessibilityRole="button"
                              accessibilityLabel="Call Volunteer Scribe"
                              accessibilityHint="Opens call bottom sheet to dial assigned scribe"
                              style={{ flex: 1, backgroundColor: THEME.soft, borderWidth: 1, borderColor: THEME.softBorder, paddingVertical: 10, borderRadius: 12, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6 }}
                            >
                              <Feather name="phone" size={13} color={THEME.accentText} importantForAccessibility="no" accessibilityElementsHidden={true} />
                              <Text style={{ fontFamily: 'Roboto', color: THEME.accentText, fontWeight: '800', fontSize: 12 }}>{t('call')}</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                              onPress={() => router.push(`/console/common/chat?requestId=${exam.id}` as any)}
                              accessible={true}
                              accessibilityRole="button"
                              accessibilityLabel="Chat with Volunteer Scribe"
                              accessibilityHint="Opens messaging screen with your scribe"
                              style={{ flex: 1, backgroundColor: THEME.soft, borderWidth: 1, borderColor: THEME.softBorder, paddingVertical: 10, borderRadius: 12, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6 }}
                            >
                              <Feather name="message-square" size={13} color={THEME.accentText} importantForAccessibility="no" accessibilityElementsHidden={true} />
                              <Text style={{ fontFamily: 'Roboto', color: THEME.accentText, fontWeight: '800', fontSize: 12 }}>{t('chat')}</Text>
                            </TouchableOpacity>
                          </View>

                          {/* The SOS button is offered only from 24 h before the exam until 6 h after it starts;
                              otherwise the declaration button takes the full width */}
                          {(() => {
                            const hrs = hoursUntilExam(exam.exam_date);
                            const showSos = hrs !== null && hrs <= 24 && hrs > -6;
                            const sending = sosSendingId === exam.id;
                            if (showSos) {
                              return (
                                <View style={{ flexDirection: 'row', gap: 8 }}>
                                  <TouchableOpacity
                                    onPress={() => { setSelectedExam(exam); setIsDeclarationOpen(true); }}
                                    accessible={true}
                                    accessibilityRole="button"
                                    accessibilityLabel="View Scribe Declaration Certificate"
                                    accessibilityHint="Opens formal certification letter modal"
                                    style={{ flex: 1, backgroundColor: BLUE, ...gradient(THEME.buttonGradient), paddingVertical: 10, borderRadius: 12, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6, shadowColor: BLUE, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 8, elevation: 2 }}
                                  >
                                    <Feather name="file-text" size={12} color="white" importantForAccessibility="no" accessibilityElementsHidden={true} />
                                    <Text style={{ fontFamily: 'Roboto', color: 'white', fontWeight: '800', fontSize: 12 }}>{t('view_declaration')}</Text>
                                  </TouchableOpacity>
                                  <TouchableOpacity
                                    onPress={() => handleSosBroadcast(exam)}
                                    disabled={sending}
                                    accessible={true}
                                    accessibilityRole="button"
                                    accessibilityLabel="Emergency SOS: Scribe Cancelled? Tap to broadcast immediately"
                                    accessibilityHint="Broadcasts an urgent high-priority alert to all approved scribes in your area"
                                    style={{ flex: 1, backgroundColor: '#fef2f2', borderWidth: 1.5, borderColor: '#fecaca', paddingVertical: 10, borderRadius: 12, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6 }}
                                  >
                                    {sending
                                      ? <ActivityIndicator size="small" color="#dc2626" />
                                      : <><Feather name="alert-triangle" size={12} color="#dc2626" importantForAccessibility="no" accessibilityElementsHidden={true} /><Text style={{ fontFamily: 'Roboto', color: '#dc2626', fontWeight: '800', fontSize: 11 }}>SOS - Cancelled?</Text></>
                                    }
                                  </TouchableOpacity>
                                </View>
                              );
                            }
                            return (
                              <TouchableOpacity
                                onPress={() => { setSelectedExam(exam); setIsDeclarationOpen(true); }}
                                accessible={true}
                                accessibilityRole="button"
                                accessibilityLabel="View Scribe Declaration Certificate"
                                accessibilityHint="Opens formal certification letter modal"
                                style={{ width: '100%', backgroundColor: BLUE, ...gradient(THEME.buttonGradient), paddingVertical: 10, borderRadius: 12, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6, shadowColor: BLUE, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 8, elevation: 2 }}
                              >
                                <Feather name="file-text" size={12} color="white" importantForAccessibility="no" accessibilityElementsHidden={true} />
                                <Text style={{ fontFamily: 'Roboto', color: 'white', fontWeight: '800', fontSize: 12 }}>{t('view_declaration')}</Text>
                              </TouchableOpacity>
                            );
                          })()}
                        </>
                      )}
                    </View>
                  </View>
                )}
              </Animated.View>
            );
          })}</DesktopGrid>
        )}

        {/* Persistent "New Request" action once at least one request already exists */}
        {confirmedPlans.length > 0 && (
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
            <TouchableOpacity
              onPress={() => {
                if (isVerified) {
                  router.push('/console/student/request_form' as any);
                } else {
                  Alert.alert(t('error'), t('verify_first_error'));
                }
              }}
              accessible={true}
              accessibilityRole="button"
              accessibilityLabel="Request another scribe for an exam"
              accessibilityHint="Opens booking form to request an exam scribe"
              style={{ 
                flex: 1,
                backgroundColor: BLUE,
                ...gradient(THEME.buttonGradient),
                paddingVertical: 16, 
                borderRadius: 16, 
                alignItems: 'center', 
                justifyContent: 'center', 
                flexDirection: 'row', 
                gap: 8, 
                shadowColor: BLUE,
                shadowOffset: { width: 0, height: 6 },
                shadowOpacity: 0.25,
                shadowRadius: 12,
                elevation: 4,
              }}
              activeOpacity={0.85}
            >
              <Feather name="plus" size={18} color="#ffffff" importantForAccessibility="no" accessibilityElementsHidden={true} />
              <Text style={{ fontFamily: 'Roboto', color: '#ffffff', fontWeight: '900', fontSize: 14, letterSpacing: 0.3 }}>{t('request_scribe')}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => {
                if (isVerified) {
                  router.push('/console/student/request_form?mode=voice' as any);
                } else {
                  Alert.alert(t('error'), t('verify_first_error'));
                }
              }}
              accessible={true}
              accessibilityRole="button"
              accessibilityLabel="Voice Assistant Request"
              accessibilityHint="Opens conversational voice assistant to create exam request"
              style={{ 
                backgroundColor: '#4f46e5',
                paddingVertical: 16, 
                paddingHorizontal: 20,
                borderRadius: 16, 
                alignItems: 'center', 
                justifyContent: 'center', 
                flexDirection: 'row', 
                gap: 8, 
                shadowColor: '#4f46e5',
                shadowOffset: { width: 0, height: 6 },
                shadowOpacity: 0.25,
                shadowRadius: 12,
                elevation: 4,
              }}
              activeOpacity={0.85}
            >
              <Feather name="mic" size={18} color="#ffffff" importantForAccessibility="no" accessibilityElementsHidden={true} />
              <Text style={{ fontFamily: 'Roboto', color: '#ffffff', fontWeight: '900', fontSize: 14, letterSpacing: 0.3 }}>Voice AI</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      </Animated.View>

      {/* 4. Need Help? Contact Support Card */}
      <Animated.View entering={rise(4)}>
      <TouchableOpacity 
        onPress={() => router.push('/console/common/support' as any)}
        accessible={true}
        accessibilityRole="button"
        accessibilityLabel="Need Help? Contact Support. Contact support to resolve application or matching issues"
        accessibilityHint="Navigates to support center"
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
            backgroundColor: BLUE_BG_LIGHT,
            ...gradient(THEME.heroGradient),
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <Feather name="life-buoy" size={20} color={THEME.accentText} />
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

      </Animated.View>

      {/* SCRIBE DECLARATION MODAL */}
      <DeclarationModal
        visible={isDeclarationOpen}
        onClose={() => setIsDeclarationOpen(false)}
        exam={selectedExam}
        studentName={profile?.full_name}
        scribeName={selectedExam?.scribeProfile?.full_name}
        scribeOccupation={selectedExam?.scribeProfile?.occupation}
        accentColor={BLUE}
      />

      {/* CALL BOTTOM SHEET MODAL */}
      <CallSheetModal
        visible={isCallOpen}
        onClose={() => setIsCallOpen(false)}
        exam={callExam}
        accentColor={GREEN}
      />

    </ScrollView>
    </View>
  );
}
