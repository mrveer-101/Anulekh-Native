/**
 * ScribeCommitmentsView — the scribe portal's "Applied" tab.
 *
 * Rendered inside a keep-alive <TabPane> by the scribe console (app/console/scribe/index.tsx), its
 * desktop counterpart (components/pc_view/ConsoleScribePC.tsx) and the standalone route
 * app/console/scribe/commitments.tsx. Shows a month calendar of the scribe's exam/assignment dates,
 * status filter pills and one expandable card per application (with call, chat, declaration,
 * withdraw and rate-student actions), plus three modals: scribe declaration, call sheet, rate student.
 *
 * Data goes through the `supabase` shim (core/supabase.ts → Rust backend `POST /api/query`), cached
 * stale-while-revalidate in core/screenCache under the key 'scribe_commitments'.
 *   Reads:  profiles, scribe_applications, scribe_reviews, student_reviews, exam_requests,
 *           assignment_requests.
 *   Writes: student_reviews (insert a rating), scribe_applications (status → 'rejected' on withdraw),
 *           exam_requests / assignment_requests (back to 'pending', scribe_id cleared, when a confirmed
 *           commitment is withdrawn), notifications (insert, tells the student about the withdrawal).
 *
 * Styling is inline (no StyleSheet) using SCRIBE_THEME tokens and gradient() from core/portalTheme.
 */
import React, { useState, useCallback } from 'react';
import { View, Text, ScrollView, ActivityIndicator, RefreshControl, TouchableOpacity, Alert, Modal, Linking, TextInput } from 'react-native';
import { Feather, Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { supabase } from '@/core/supabase';
import { useLanguage } from '@/core/translation';
import { canScribeWithdraw } from '@/core/examDate';
import Animated, { FadeInDown, useReducedMotion } from 'react-native-reanimated';
import { gradient, SCRIBE_THEME as THEME } from '@/core/portalTheme';
import { useDesktopColumns, useInDesktopShell } from '@/components/ui/DesktopShell';
import { useTabActive } from '@/components/ui/TabPane';
import { readScreenCache, writeScreenCache } from '@/core/screenCache';

/** One scribe_applications row. `type` is 'assignment' for assignment requests, otherwise an exam request. */
interface Application {
  id: number;
  request_id: number;
  scribe_id: string;
  status: string;
  created_at: string;
  type?: string;
}

/**
 * An application joined with the request it points to: the exam_requests row as-is, or an
 * assignment_requests row mapped into the same exam-card shape (see fetchApplications).
 */
interface EnrichedApplication extends Application {
  examDetails?: {
    id: number;
    subject: string;
    exam_type: string;
    exam_date: string;
    exam_venue: string;
    exam_language: string;
    student_name: string;
    education_grade: string;
    phone?: string;
    status?: string;
    is_emergency?: string;
    student_id?: string;
  };
}

/** Everything the Applied tab shows, cached so the next visit paints instantly (see core/screenCache). */
interface CommitmentsSnapshot {
  profile: any;
  applications: any[];
  reviews: any[];
  studentReviews: any[];
}

/**
 * The scribe "Applied" tab: every application this scribe has made, newest first.
 *
 * Refreshes only while its tab is visible (`useTabActive()` + `useFocusEffect`), painting the cached
 * snapshot first and then fetching fresh data. Takes no props; the user comes from the current session.
 */
export default function ScribeCommitmentsView() {
  // Inside the desktop console: no own page background, wider layout (see ui/DesktopShell).
  const inShell = useInDesktopShell();
  // Wide desktop screens show the calendar beside the list instead of above it.
  const twoColumns = useDesktopColumns() > 1;
  const { t } = useLanguage();
  // True while this tab is visible (TabPane keep-alive) — data refreshes only then.
  const isActive = useTabActive();
  // Blocks and cards rise in one after another (off with Reduce Motion).
  const reduceMotion = useReducedMotion();
  const rise = (index: number) => (reduceMotion ? undefined : FadeInDown.delay(Math.min(index, 6) * 70).duration(420));
  // Data loaded from the backend (also restored from the snapshot cache).
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [applications, setApplications] = useState<EnrichedApplication[]>([]);
  const [scribeProfile, setScribeProfile] = useState<any>(null);
  const [reviews, setReviews] = useState<any[]>([]);

  // Student reviews states
  const [studentReviews, setStudentReviews] = useState<any[]>([]);
  const [ratingModalVisible, setRatingModalVisible] = useState(false);
  const [ratingTarget, setRatingTarget] = useState<any>(null);
  const [selectedRating, setSelectedRating] = useState(5);
  const [remark, setRemark] = useState('');
  const [submittingRating, setSubmittingRating] = useState(false);

  // Status filter for the flat applications list
  const [selectedFilter, setSelectedFilter] = useState<'All' | 'Pending' | 'Completed' | 'Rejected'>('All');

  // Calendar States
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [isCalendarCollapsed, setIsCalendarCollapsed] = useState(false);

  /**
   * Builds the calendar grid for `date`'s month: leading `null`s pad the first week up to its weekday
   * (Sunday-first), followed by one Date per day of the month.
   */
  const getDaysInMonth = (date: Date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const days = [];
    const startingDayOfWeek = firstDay.getDay();
    for (let i = 0; i < startingDayOfWeek; i++) {
      days.push(null);
    }
    for (let i = 1; i <= lastDay.getDate(); i++) {
      days.push(new Date(year, month, i));
    }
    return days;
  };

  /** Moves the calendar by `increment` months (negative goes back). */
  const changeMonth = (increment: number) => {
    const newMonth = new Date(currentMonth);
    newMonth.setMonth(newMonth.getMonth() + increment);
    setCurrentMonth(newMonth);
  };

  /** True if any loaded application's exam date / deadline falls on `date` (matched on the YYYY-MM-DD prefix). */
  const hasPlanOnDate = (date: Date) => {
    if (!date) return false;
    const dateString = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    return applications.some(app => app.examDetails?.exam_date && app.examDetails.exam_date.startsWith(dateString));
  };

  /** Applications whose exam date / deadline falls on `date`. */
  const getPlansOnDate = (date: Date) => {
    if (!date) return [];
    const dateString = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    return applications.filter(app => app.examDetails?.exam_date && app.examDetails.exam_date.startsWith(dateString));
  };

  // Track which cards are expanded (by application id) for the collapsed list / detailed view toggle
  const [expandedIds, setExpandedIds] = useState<number[]>([]);

  /** Expands or collapses one application card. */
  const toggleExpanded = (id: number) => {
    setExpandedIds(prev => (prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]));
  };

  // Declaration Modal State
  const [selectedExam, setSelectedExam] = useState<any>(null);
  const [isDeclarationOpen, setIsDeclarationOpen] = useState(false);

  // Call Modal State
  const [callExam, setCallExam] = useState<any>(null);
  const [isCallOpen, setIsCallOpen] = useState(false);
  const [showMaskedNumber, setShowMaskedNumber] = useState(false);

  // Refresh whenever the console is focused *and* this tab is visible: switching back to the tab flips
  // isActive and triggers a quiet background refresh, while hidden tabs don't fetch at all.
  useFocusEffect(
    useCallback(() => {
      if (!isActive) return;
      fetchApplications();
    }, [isActive])
  );

  /** Puts a snapshot (cached or freshly fetched) on screen. */
  const applySnapshot = (snap: CommitmentsSnapshot) => {
    setScribeProfile(snap.profile);
    setApplications(snap.applications);
    setReviews(snap.reviews);
    setStudentReviews(snap.studentReviews);
  };

  /**
   * Loads the Applied tab: cached snapshot first, then profile, applications and both review lists in
   * parallel, then each application's exam/assignment details (in parallel).
   */
  const fetchApplications = async () => {
    try {
      // Every query is scoped to the signed-in user; no session means nothing to load.
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const userId = session.user.id;

      // 1. Show the cached snapshot straight away (no spinner on repeat visits).
      const cached = await readScreenCache<CommitmentsSnapshot>('scribe_commitments', userId);
      if (cached) {
        applySnapshot(cached);
        setLoading(false);
      }

      // 2. Fetch profile, applications and both review lists in parallel.
      const [
        { data: profile },
        { data, error },                 // this scribe's applications (newest first)
        { data: reviewsData },           // reviews students left for this scribe
        { data: studentReviewsData },    // ratings this scribe left for students
      ] = await Promise.all([
        supabase.from('profiles').select('*').eq('id', userId).single(),
        supabase.from('scribe_applications').select('*').eq('scribe_id', userId).order('created_at', { ascending: false }),
        supabase.from('scribe_reviews').select('*').eq('scribe_id', userId),
        supabase.from('student_reviews').select('*').eq('scribe_id', userId),
      ]);
      if (error) throw error;

      // Attach each application's request details (assignments are mapped into the exam card shape)
      const enriched = await Promise.all(
        (data || []).map(async (app: any) => {
          let details = null;
          if (app.type === 'assignment') {
            const { data: assign } = await supabase
              .from('assignment_requests')
              .select('*')
              .eq('id', app.request_id)
              .single();
            if (assign) {
              details = {
                id: assign.id,
                subject: assign.subject || 'Assignment',
                exam_type: 'Assignment: ' + assign.academic_level,
                exam_date: assign.deadline,
                exam_venue: assign.description || 'No instructions provided.',
                exam_language: 'Written',
                student_name: assign.student_name || 'Student',
                education_grade: assign.academic_level,
                status: assign.status
              };
            }
          } else {
            const { data: exam } = await supabase
              .from('exam_requests')
              .select('*')
              .eq('id', app.request_id)
              .single();
            details = exam;
          }
          return {
            ...app,
            examDetails: details || undefined
          };
        })
      );

      // 3. Show the fresh data and save it for the next visit.
      const snapshot: CommitmentsSnapshot = {
        profile,
        applications: enriched,
        reviews: reviewsData || [],
        studentReviews: studentReviewsData || [],
      };
      applySnapshot(snapshot);
      writeScreenCache('scribe_commitments', userId, snapshot);
    } catch (error: any) {
      console.error('Error fetching applications:', error.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };
  /** Pull-to-refresh: shows the refresh spinner and reloads everything. */
  const onRefresh = () => {
    setRefreshing(true);
    fetchApplications();
  };

  /** Opens the "Rate Candidate Student" modal for a completed application, resetting it to 5 stars and no remark. */
  const openRatingModal = (app: EnrichedApplication) => {
    setRatingTarget(app);
    setSelectedRating(5);
    setRemark('');
    setRatingModalVisible(true);
  };

  /**
   * Saves the scribe's rating of the student as a new student_reviews row, then closes the modal and
   * reloads the tab so the card shows "Your Rating for Student". Ignores repeat taps while saving.
   */
  const submitStudentRating = async () => {
    if (!ratingTarget || submittingRating) return;
    setSubmittingRating(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      // Insert the rating (overall stars + optional remark) for this request.
      const { error } = await supabase
        .from('student_reviews')
        .insert({
          request_id: ratingTarget.request_id,
          student_id: ratingTarget.examDetails.student_id,
          scribe_id: session.user.id,
          rating_overall: selectedRating,
          remark: remark.trim(),
          created_at: new Date().toISOString(),
        });

      if (error) throw error;

      // Close the modal and reload so the card shows the saved rating.
      Alert.alert("Success", "Student rating submitted successfully!");
      setRatingModalVisible(false);
      fetchApplications();
    } catch (e: any) {
      Alert.alert("Error", e.message || "Failed to submit rating.");
    } finally {
      setSubmittingRating(false);
    }
  };

  /** Opens the call bottom sheet for a confirmed exam's student. */
  const openCallSheet = (exam: any) => {
    if (!exam) return;
    setCallExam(exam);
    setShowMaskedNumber(true);
    setIsCallOpen(true);
  };

  /** Closes the call bottom sheet. */
  const closeCallSheet = () => setIsCallOpen(false);

  /**
   * Withdraws a pending application or a confirmed commitment after a confirmation alert.
   *
   * Blocked within 24 hours of the exam (core/examDate `canScribeWithdraw`). For a confirmed commitment
   * the request goes back to 'pending' with no scribe and the student is notified; in every case the
   * scribe_applications row is set to 'rejected'. Reloads the tab afterwards.
   */
  const handleWithdrawApplication = (app: EnrichedApplication) => {
    const exam = app.examDetails;
    const isConfirmed = app.status === 'accepted' && exam?.status === 'matched';
    const withdrawalCheck = canScribeWithdraw(exam?.exam_date);

    // Withdrawal is locked close to the exam to protect the student.
    if (!withdrawalCheck.allowed) {
      Alert.alert(
        'Withdrawal Locked',
        'Withdrawal is locked within 24 hours of the scheduled exam date to protect the student. If you have an unavoidable emergency, please contact support.'
      );
      return;
    }

    // Confirm first; the wording depends on whether the scribe was already matched.
    Alert.alert(
      isConfirmed ? 'Withdraw Commitment' : 'Withdraw Application',
      `Are you sure you want to withdraw your ${isConfirmed ? 'commitment' : 'application'} for "${exam?.subject || 'this exam'}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Withdraw',
          style: 'destructive',
          onPress: async () => {
            try {
              // Confirmed commitment: release the request back to pending and tell the student.
              if (isConfirmed && exam) {
                const table = app.type === 'assignment' ? 'assignment_requests' : 'exam_requests';
                await supabase
                  .from(table)
                  .update({ status: 'pending', scribe_id: null })
                  .eq('id', exam.id);

                if (exam.student_id) {
                  await supabase.from('notifications').insert({
                    user_id: exam.student_id,
                    title: 'Scribe Withdrawn',
                    message: `Scribe ${scribeProfile?.full_name || ''} has withdrawn from your request for "${exam.subject}". Your request is back to pending.`,
                    is_read: 0,
                    created_at: new Date().toISOString()
                  });
                }
              }

              // Mark this scribe's application as rejected (both pending and confirmed cases).
              await supabase
                .from('scribe_applications')
                .update({ status: 'rejected' })
                .eq('id', app.id);

              Alert.alert('Withdrawn', 'Your withdrawal was processed successfully.');
              fetchApplications();
            } catch (err: any) {
              Alert.alert('Error', err.message || 'Failed to process withdrawal.');
            }
          }
        }
      ]
    );
  };

  // First load with nothing cached yet: full-screen spinner.
  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', paddingVertical: 10, backgroundColor: '#f9fafb' }}>
        <ActivityIndicator size="large" color="#059669" />
      </View>
    );
  }

  /** Read-only row of five stars, filled up to `rating`. */
  const StarDisplay = ({ rating }: { rating: number }) => {
    return (
      <View style={{ flexDirection: 'row', gap: 2 }}>
        {[1, 2, 3, 4, 5].map((star) => (
          <Ionicons
            key={star}
            name={star <= rating ? 'star' : 'star-outline'}
            size={13}
            color={star <= rating ? '#eab308' : '#cbd5e1'}
          />
        ))}
      </View>
    );
  };

  // Classify a single application into one of the display buckets (matches renderCard's `type`).
  const getAppType = (app: EnrichedApplication): 'pending' | 'confirmed' | 'completed' | 'rejected' | null => {
    if (app.status === 'pending') return 'pending';
    if (app.status === 'rejected') return 'rejected';
    if (app.status === 'accepted' && app.examDetails?.status === 'matched') return 'confirmed';
    if (app.status === 'accepted' && app.examDetails?.status === 'completed') return 'completed';
    return null;
  };

  /** Status filter pills shown above the list. */
  const FILTERS: { key: 'All' | 'Pending' | 'Completed' | 'Rejected'; label: string }[] = [
    { key: 'All', label: 'All' },
    { key: 'Pending', label: 'Pending' },
    { key: 'Completed', label: 'Completed' },
    { key: 'Rejected', label: 'Rejected' },
  ];

  // Apply the active filter to the (already newest-first) applications list.
  // "Pending" covers both pending applications and confirmed commitments (accepted but not yet completed).
  let visibleApps = applications.filter(app => {
    const type = getAppType(app);
    if (!type) return false;
    if (selectedFilter === 'All') return true;
    if (selectedFilter === 'Pending') return type === 'pending' || type === 'confirmed';
    return type === selectedFilter.toLowerCase();
  });

  // A calendar day is selected: also narrow the list to that date.
  if (selectedDate) {
    visibleApps = visibleApps.filter(app => app.examDetails?.exam_date && app.examDetails.exam_date.startsWith(selectedDate));
  }

  /**
   * Renders one collapsible application card.
   *
   * @param app   The application with its request details (cards without details render nothing).
   * @param type  Display bucket from getAppType; picks the status colour/label and which actions show.
   * @param index Position in the list, used to stagger the entrance animation.
   */
  const renderCard = (app: EnrichedApplication, type: 'pending' | 'confirmed' | 'rejected' | 'completed', index = 0) => {
    const exam = app.examDetails;
    if (!exam) return null;

    // Status pill colours and label (defaults are for 'pending').
    let badgeBg = 'rgba(234,179,8,0.08)';
    let badgeBorder = 'rgba(234,179,8,0.2)';
    let badgeText = '#d97706';
    let statusLabel = t('status_pending');

    if (type === 'confirmed') {
      badgeBg = 'rgba(5,150,105,0.08)';
      badgeBorder = 'rgba(5,150,105,0.2)';
      badgeText = '#059669';
      statusLabel = t('status_matched');
    } else if (type === 'completed') {
      badgeBg = 'rgba(16,185,129,0.08)';
      badgeBorder = 'rgba(16,185,129,0.2)';
      badgeText = '#10b981';
      statusLabel = 'Completed';
    } else if (type === 'rejected') {
      badgeBg = 'rgba(220,38,38,0.08)';
      badgeBorder = 'rgba(220,38,38,0.2)';
      badgeText = '#dc2626';
      statusLabel = t('status_rejected') || 'Rejected';
    }

    // Student's review of this scribe for this request (shown on completed cards) and card state.
    const review = reviews.find(r => r.request_id === app.request_id);
    const isExpanded = expandedIds.includes(app.id);
    const isEmergency = exam.is_emergency === 'yes';

    return (
      <Animated.View
        key={app.id}
        entering={rise(index + 2)}
        style={{
          backgroundColor: '#ffffff',
          borderRadius: 20,
          borderWidth: isEmergency ? 2 : 1.5,
          borderColor: isEmergency ? '#fca5a5' : THEME.cardBorder,
          shadowColor: isEmergency ? '#dc2626' : THEME.shadow, 
          shadowOffset: { width: 0, height: 6 }, 
          shadowOpacity: isEmergency ? 0.12 : 0.07, 
          shadowRadius: 16, 
          elevation: 3, 
          marginBottom: 10,
          overflow: 'hidden'
        }}
      >
        {/* Status accent strip (colour matches the status pill) */}
        <View style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 4, backgroundColor: isEmergency ? '#dc2626' : badgeText }} />

        {/* ── Collapsed Header Row ── */}
        <TouchableOpacity
          onPress={() => toggleExpanded(app.id)}
          activeOpacity={0.8}
          style={{
            flexDirection: 'row', alignItems: 'center',
            paddingHorizontal: 16, paddingVertical: 14, gap: 10,
          }}
        >
          {/* Subject icon */}
          <View style={{
            width: 38, height: 38, borderRadius: 11,
            backgroundColor: isEmergency ? '#fee2e2' : THEME.soft,
            alignItems: 'center', justifyContent: 'center',
            borderWidth: 1,
            borderColor: isEmergency ? '#fca5a5' : THEME.softBorder,
          }}>
            <Feather name={isEmergency ? 'alert-triangle' : 'book-open'} size={16}
              color={isEmergency ? '#dc2626' : THEME.accentText} />
          </View>

          {/* Subject Name */}
          <View style={{ flex: 1 }}>
            <Text style={{ fontFamily: 'Roboto', fontSize: 15, fontWeight: '900', color: '#0f172a' }} numberOfLines={1}>
              {exam.subject || 'Exam'}
            </Text>
          </View>

          {/* Status pill */}
          <View style={{ 
            backgroundColor: badgeBg, borderWidth: 1, borderColor: badgeBorder, 
            paddingVertical: 3, paddingHorizontal: 9, borderRadius: 20, marginRight: 4
          }}>
            <Text style={{ fontFamily: 'Roboto', fontSize: 9, fontWeight: '800', color: badgeText }}>
              {statusLabel}
            </Text>
          </View>

          {/* Chevron */}
          <Feather
            name={isExpanded ? 'chevron-up' : 'chevron-down'}
            size={16} color="#64748b"
          />
        </TouchableOpacity>

        {/* ── Expanded Detail Panel ── */}
        {isExpanded && (
          <View style={{ borderTopWidth: 1, borderTopColor: '#f1f5f9', paddingHorizontal: 16, paddingTop: 12, paddingBottom: 14, gap: 12 }}>
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
                  Student: {exam.student_name} ({exam.education_grade})
                </Text>
              </View>

              {/* 5. Language */}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Feather name="globe" size={12} color="#64748b" style={{ width: 14 }} />
                <Text style={{ fontFamily: 'Roboto', color: '#475569', fontSize: 12, fontWeight: '600' }}>
                  Language: {exam.exam_language}
                </Text>
              </View>
            </View>

            {/* If Confirmed, render Chat, Call, and Declaration Buttons */}
            {type === 'confirmed' && (
              <View style={{ gap: 8, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#f1f5f9' }}>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  {/* Call */}
                  {app.type !== 'assignment' && (
                    <TouchableOpacity 
                      onPress={() => openCallSheet(exam)}
                      style={{ flex: 1, backgroundColor: THEME.soft, borderWidth: 1, borderColor: THEME.softBorder, paddingVertical: 10, borderRadius: 12, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6 }}
                    >
                      <Feather name="phone" size={13} color={THEME.accentText} />
                      <Text style={{ fontFamily: 'Roboto', color: THEME.accentText, fontWeight: '800', fontSize: 12 }}>{t('call')}</Text>
                    </TouchableOpacity>
                  )}

                  {/* Chat */}
                  <TouchableOpacity 
                    onPress={() => router.push(`/console/common/chat?requestId=${exam.id}&type=${app.type || 'exam'}` as any)}
                    style={{ flex: 1, backgroundColor: THEME.soft, borderWidth: 1, borderColor: THEME.softBorder, paddingVertical: 10, borderRadius: 12, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6 }}
                  >
                    <Feather name="message-square" size={13} color={THEME.accentText} />
                    <Text style={{ fontFamily: 'Roboto', color: THEME.accentText, fontWeight: '800', fontSize: 12 }}>{t('chat')}</Text>
                  </TouchableOpacity>
                </View>

                {/* View Declaration */}
                {app.type !== 'assignment' && (
                  <TouchableOpacity 
                    onPress={() => {
                      setSelectedExam(exam);
                      setIsDeclarationOpen(true);
                    }}
                    style={{ width: '100%', backgroundColor: THEME.solid, ...gradient(THEME.buttonGradient), paddingVertical: 11, borderRadius: 12, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6, shadowColor: THEME.shadow, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 8, elevation: 2 }}
                  >
                    <Feather name="file-text" size={12} color="white" />
                    <Text style={{ fontFamily: 'Roboto', color: 'white', fontWeight: '800', fontSize: 12 }}>{t('view_declaration')}</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}

            {/* Withdrawal Action (Pending Applications or Confirmed Commitments) */}
            {(type === 'pending' || type === 'confirmed') && (
              <View style={{ paddingTop: 10, borderTopWidth: 1, borderTopColor: '#f1f5f9' }}>
                {(() => {
                  const withdrawalCheck = canScribeWithdraw(exam.exam_date);
                  if (!withdrawalCheck.allowed) {
                    return (
                      <TouchableOpacity
                        onPress={() => {
                          Alert.alert(
                            'Withdrawal Locked',
                            'Withdrawal is locked within 24 hours of the scheduled exam date to protect the student. If you have an unavoidable emergency, please contact support.'
                          );
                        }}
                        style={{
                          width: '100%',
                          backgroundColor: '#f8fafc',
                          borderWidth: 1,
                          borderColor: '#cbd5e1',
                          paddingVertical: 10,
                          borderRadius: 12,
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexDirection: 'row',
                          gap: 6,
                        }}
                        activeOpacity={0.7}
                      >
                        <Feather name="lock" size={13} color="#64748b" />
                        <Text style={{ fontFamily: 'Roboto', color: '#64748b', fontWeight: '800', fontSize: 12 }}>
                          Withdrawal Locked (&lt;24h to Exam)
                        </Text>
                      </TouchableOpacity>
                    );
                  }
                  return (
                    <TouchableOpacity
                      onPress={() => handleWithdrawApplication(app)}
                      style={{
                        width: '100%',
                        backgroundColor: '#fff7f7',
                        borderWidth: 1.5,
                        borderColor: '#fca5a5',
                        paddingVertical: 10,
                        borderRadius: 12,
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexDirection: 'row',
                        gap: 6,
                      }}
                      activeOpacity={0.7}
                    >
                      <Feather name="x-circle" size={13} color="#ef4444" />
                      <Text style={{ fontFamily: 'Roboto', color: '#ef4444', fontWeight: '800', fontSize: 12 }}>
                        {type === 'confirmed' ? 'Withdraw Commitment' : 'Withdraw Application'}
                      </Text>
                    </TouchableOpacity>
                  );
                })()}
              </View>
            )}

            {/* If Completed and Review exists, render Star Feedback */}
            {type === 'completed' && review && (
              <View style={{ marginTop: 12, borderTopWidth: 1, borderTopColor: '#f1f5f9', paddingTop: 12 }}>
                <Text style={{ fontFamily: 'Roboto', fontSize: 10, fontWeight: '800', color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>Student Feedback & Ratings</Text>
                
                <View style={{ backgroundColor: '#f8fafc', padding: 12, borderRadius: 16, borderStyle: 'solid', borderWidth: 1, borderColor: '#e2e8f0', gap: 6 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Text style={{ fontFamily: 'Roboto', fontSize: 11, color: '#475569' }}>Punctuality:</Text>
                    <StarDisplay rating={review.rating_punctuality} />
                  </View>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Text style={{ fontFamily: 'Roboto', fontSize: 11, color: '#475569' }}>Communication:</Text>
                    <StarDisplay rating={review.rating_communication} />
                  </View>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Text style={{ fontFamily: 'Roboto', fontSize: 11, color: '#475569' }}>Writing Speed:</Text>
                    <StarDisplay rating={review.rating_speed} />
                  </View>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Text style={{ fontFamily: 'Roboto', fontSize: 11, color: '#475569' }}>Politeness & Behavior:</Text>
                    <StarDisplay rating={review.rating_behavior} />
                  </View>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderTopWidth: 1, borderTopColor: '#e2e8f0', paddingTop: 4, marginTop: 2 }}>
                    <Text style={{ fontFamily: 'Roboto', fontSize: 11, fontWeight: '700', color: '#0f172a' }}>Overall Rating:</Text>
                    <StarDisplay rating={review.rating_overall} />
                  </View>
                </View>
              </View>
            )}

            {/* Scribe's Feedback for Student (Rate Student) */}
            {type === 'completed' && (
              <View style={{ marginTop: 12, borderTopWidth: 1, borderTopColor: '#f1f5f9', paddingTop: 12 }}>
                {(() => {
                  const studentReview = studentReviews.find(r => r.request_id === app.request_id);
                  if (studentReview) {
                    return (
                      <View style={{ gap: 4 }}>
                        <Text style={{ fontFamily: 'Roboto', fontSize: 10, fontWeight: '800', color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5 }}>Your Rating for Student</Text>
                        <View style={{ backgroundColor: '#f8fafc', padding: 12, borderRadius: 16, borderStyle: 'solid', borderWidth: 1, borderColor: '#e2e8f0', gap: 6 }}>
                          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                            <Text style={{ fontFamily: 'Roboto', fontSize: 11, color: '#475569', fontWeight: '700' }}>Overall Rating:</Text>
                            <StarDisplay rating={studentReview.rating_overall} />
                          </View>
                          {studentReview.remark ? (
                            <View style={{ borderTopWidth: 1, borderTopColor: '#e2e8f0', paddingTop: 4, marginTop: 2 }}>
                              <Text style={{ fontFamily: 'Roboto', fontSize: 10, color: '#94a3b8', fontStyle: 'italic' }}>"{studentReview.remark}"</Text>
                            </View>
                          ) : null}
                        </View>
                      </View>
                    );
                  }
                  return (
                    <TouchableOpacity 
                      onPress={() => openRatingModal(app)}
                      style={{ width: '100%', backgroundColor: 'rgba(234,88,12,0.08)', borderWidth: 1, borderColor: 'rgba(234,88,12,0.22)', paddingVertical: 10, borderRadius: 12, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6 }}
                    >
                      <Feather name="star" size={12} color="#ea580c" />
                      <Text style={{ fontFamily: 'Roboto', color: '#ea580c', fontWeight: '800', fontSize: 12 }}>Rate Candidate Student</Text>
                    </TouchableOpacity>
                  );
                })()}
              </View>
            )}
          </View>
        )}
      </Animated.View>
    );
  };

  // Layout: calendar card, filter pills, application cards, then the three modals.
  return (
    <View style={inShell ? { flex: 1 } : [{ flex: 1, backgroundColor: THEME.page }, gradient(THEME.pageGradient)]}>
      {/* Soft colour orb for depth behind the cards */}
      {!inShell && <View pointerEvents="none" style={{ position: 'absolute', top: -70, right: -80, width: 240, height: 240, borderRadius: 120, backgroundColor: THEME.orb }} />}

      {/* Scrollable content; pull-to-refresh reloads everything */}
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: inShell ? 0 : 24, paddingTop: 16, paddingBottom: 40 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#059669']} />
        }
      >
        {/* Desktop: calendar on the right, filters + application cards on the left (row-reverse keeps
            the phone order — calendar first — in the code). Phones: one column, unchanged. */}
        <View style={twoColumns ? { flexDirection: 'row-reverse', gap: 24, alignItems: 'flex-start' } : undefined}>
        <View style={twoColumns ? { flex: 1 } : undefined}>
        {/* Interactive Calendar Card (First) */}
        <Animated.View entering={rise(0)} style={{
          backgroundColor: '#ffffff',
          borderRadius: 24,
          padding: 16,
          borderWidth: 1.5,
          borderColor: THEME.cardBorder,
          shadowColor: THEME.shadow,
          shadowOffset: { width: 0, height: 6 },
          shadowOpacity: 0.08,
          shadowRadius: 16,
          elevation: 4,
          marginBottom: 16
        }}>
          {/* Header: Month Selector with Interactive Collapse/Expand */}
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: isCalendarCollapsed ? 0 : 14 }}>
            <TouchableOpacity 
              onPress={() => changeMonth(-1)} 
              style={{ padding: 8, backgroundColor: 'rgba(5,150,105,0.08)', borderWidth: 1, borderColor: 'rgba(5,150,105,0.18)', borderRadius: 12 }}
            >
              <Feather name="chevron-left" size={18} color="#059669" />
            </TouchableOpacity>
            
            <TouchableOpacity 
              onPress={() => setIsCalendarCollapsed(!isCalendarCollapsed)}
              activeOpacity={0.7}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 6,
                paddingHorizontal: 12,
                paddingVertical: 6,
                backgroundColor: 'rgba(5,150,105,0.06)',
                borderRadius: 14,
                borderWidth: 1,
                borderColor: 'rgba(5,150,105,0.18)'
              }}
            >
              <Feather name="calendar" size={14} color="#059669" />
              <Text style={{ fontFamily: 'Roboto', fontSize: 15, fontWeight: '900', color: '#059669', letterSpacing: -0.3 }}>
                {currentMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
              </Text>
              <Feather name={isCalendarCollapsed ? "chevron-down" : "chevron-up"} size={16} color="#059669" />
            </TouchableOpacity>

            <TouchableOpacity 
              onPress={() => changeMonth(1)} 
              style={{ padding: 8, backgroundColor: 'rgba(5,150,105,0.08)', borderWidth: 1, borderColor: 'rgba(5,150,105,0.18)', borderRadius: 12 }}
            >
              <Feather name="chevron-right" size={18} color="#059669" />
            </TouchableOpacity>
          </View>

          {/* Month grid (hidden while the calendar is collapsed) */}
          {!isCalendarCollapsed && (
            <>
              {/* Weekdays Row */}
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 }}>
                {['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'].map((day, idx) => (
                  <View key={idx} style={{ width: '14.2%', alignItems: 'center' }}>
                    <Text style={{ fontFamily: 'Roboto', fontSize: 10, fontWeight: '900', color: '#f97316', letterSpacing: 0.5 }}>{day}</Text>
                  </View>
                ))}
              </View>

              {/* Days Grid */}
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', rowGap: 8 }}>
                {getDaysInMonth(currentMonth).map((day, idx) => {
                  if (!day) {
                    return <View key={`empty-${idx}`} style={{ width: '14.2%', height: 38 }} />;
                  }
                  const dateString = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`;
                  const isSelected = selectedDate === dateString;
                  const hasPlan = hasPlanOnDate(day);
                  const isToday = day.toISOString().split('T')[0] === new Date().toISOString().split('T')[0];

                  // Day cell colours: selected > has plans (red if any is an emergency, else orange) > today.
                  let cellBg = 'transparent';
                  let cellTextColor = '#334155';
                  let cellBorder = {};
                  let dotColor = '#94a3b8';

                  if (isSelected) {
                    cellBg = '#059669';
                    cellTextColor = '#ffffff';
                    dotColor = '#ffffff';
                  } else if (hasPlan) {
                    const plansOnDay = getPlansOnDate(day);
                    const hasEmergency = plansOnDay.some(p => p.examDetails?.is_emergency === 'yes');
                    if (hasEmergency) {
                      cellBg = 'rgba(239,68,68,0.15)';
                      cellTextColor = '#dc2626';
                      cellBorder = { borderWidth: 1.5, borderColor: 'rgba(239,68,68,0.35)' };
                      dotColor = '#dc2626';
                    } else {
                      cellBg = 'rgba(249,115,22,0.14)';
                      cellTextColor = '#c2410c';
                      cellBorder = { borderWidth: 1.5, borderColor: 'rgba(249,115,22,0.35)' };
                      dotColor = '#f97316';
                    }
                  } else if (isToday) {
                    cellBg = 'rgba(5,150,105,0.08)';
                    cellTextColor = '#059669';
                    cellBorder = { borderWidth: 1.5, borderColor: 'rgba(5,150,105,0.3)' };
                  }

                  return (
                    <TouchableOpacity
                      key={dateString}
                      onPress={() => {
                        if (isSelected) {
                          setSelectedDate(null);
                        } else {
                          setSelectedDate(dateString);
                        }
                      }}
                      style={{
                        width: '14.2%',
                        height: 38,
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <View style={{
                        width: 32,
                        height: 32,
                        borderRadius: 16,
                        backgroundColor: cellBg,
                        alignItems: 'center',
                        justifyContent: 'center',
                        ...cellBorder
                      }}>
                        <Text style={{ fontFamily: 'Roboto', fontSize: 12, fontWeight: isSelected || hasPlan || isToday ? '900' : '600', color: cellTextColor }}>
                          {day.getDate()}
                        </Text>
                        {hasPlan && !isSelected && (
                          <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: dotColor, marginTop: 1 }} />
                        )}
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </>
          )}

          {/* Selected Date Filter Badge / Reset */}
          {selectedDate && (
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 12, paddingTop: 10, borderTopWidth: 1, borderColor: '#f1f5f9' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Feather name="calendar" size={13} color="#059669" />
                <Text style={{ fontFamily: 'Roboto', fontSize: 11, fontWeight: '800', color: '#059669' }}>
                  Filtered by date: {selectedDate}
                </Text>
              </View>
              <TouchableOpacity onPress={() => setSelectedDate(null)} style={{ backgroundColor: '#f1f5f9', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 }}>
                <Text style={{ fontFamily: 'Roboto', fontSize: 10, fontWeight: '800', color: '#64748b' }}>Clear Date</Text>
              </TouchableOpacity>
            </View>
          )}
        </Animated.View>
        </View>

        <View style={twoColumns ? { flex: 1 } : undefined}>
        {/* ── FILTER SELECTION BLOCK (Slider Track) ── */}
        <Animated.View entering={rise(1)} style={{
          flexDirection: 'row',
          backgroundColor: '#ffffff',
          padding: 5,
          borderRadius: 18,
          borderWidth: 1.5,
          borderColor: THEME.cardBorder,
          shadowColor: THEME.shadow,
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.08,
          shadowRadius: 10,
          elevation: 3,
          marginBottom: 16,
          gap: 4
        }}>
          {FILTERS.map(f => {
            const isActive = selectedFilter === f.key;
            return (
              <TouchableOpacity
                key={f.key}
                onPress={() => setSelectedFilter(f.key)}
                style={{
                  flex: 1,
                  paddingVertical: 9,
                  borderRadius: 14,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: isActive ? THEME.solid : 'transparent',
                  ...(isActive ? gradient(THEME.buttonGradient) : {}),
                  shadowColor: isActive ? THEME.shadow : 'transparent',
                  shadowOffset: { width: 0, height: 4 },
                  shadowOpacity: isActive ? 0.35 : 0,
                  shadowRadius: 10,
                  elevation: isActive ? 4 : 0
                }}
              >
                <Text style={{
                  fontFamily: 'Roboto',
                  fontSize: 11,
                  fontWeight: '900',
                  textTransform: 'uppercase',
                  color: isActive ? '#ffffff' : '#64748b',
                  letterSpacing: 0.5
                }}>
                  {f.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </Animated.View>
        {/* Application cards, or an empty state for the current filter */}
        {visibleApps.length === 0 ? (
          <Animated.View entering={rise(2)} style={{ backgroundColor: '#ffffff', padding: 32, borderRadius: 24, borderWidth: 1.5, borderColor: THEME.cardBorder, shadowColor: THEME.shadow, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.06, shadowRadius: 16, elevation: 3, justifyContent: 'center', alignItems: 'center', marginTop: 10 }}>
            <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: THEME.soft, ...gradient(THEME.heroGradient), borderWidth: 1, borderColor: THEME.softBorder, alignItems: 'center', justifyContent: 'center' }}>
              <Feather name="inbox" size={26} color={THEME.accentText} />
            </View>
            <Text style={{ fontFamily: 'Roboto', fontSize: 14, fontWeight: '900', color: '#0f172a', marginTop: 10 }}>
              {selectedFilter === 'All' ? 'No applications yet' : `No ${selectedFilter.toLowerCase()} applications`}
            </Text>
            <Text style={{ fontFamily: 'Roboto', fontSize: 11, color: '#64748b', marginTop: 4, textAlign: 'center', lineHeight: 16 }}>
              {selectedFilter === 'All'
                ? 'Apply to exams from the Search tab to see them here.'
                : 'Try selecting a different filter above.'}
            </Text>
          </Animated.View>
        ) : (
          visibleApps.map((app, i) => renderCard(app, getAppType(app) as 'pending' | 'confirmed' | 'rejected' | 'completed', i))
        )}
        </View>
        </View>
      </ScrollView>

      {/* FORMAL SCRIBE DECLARATION MODAL */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={isDeclarationOpen}
        onRequestClose={() => setIsDeclarationOpen(false)}
      >
        <View style={{ flex: 1, backgroundColor: 'rgba(15,23,42,0.5)', justifyContent: 'center', alignItems: 'center', paddingHorizontal: 20 }}>
          <View style={{ backgroundColor: '#f8fafc', width: '100%', maxWidth: 360, borderRadius: 28, overflow: 'hidden', shadowColor: '#64748b', shadowOffset: { width: 0, height: 20 }, shadowOpacity: 0.08, shadowRadius: 12, elevation: 3, borderWidth: 1, borderColor: '#e2e8f0' }}>
            {/* Modal Header */}
            <View style={{ paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#f1f5f9', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Text style={{ fontFamily: 'Roboto', fontSize: 13, fontWeight: '800', color: '#0f172a', textTransform: 'uppercase' }}>{t('scribe_declaration')}</Text>
              <TouchableOpacity onPress={() => setIsDeclarationOpen(false)} style={{ padding: 4 }}>
                <Feather name="x" size={18} color="#64748b" />
              </TouchableOpacity>
            </View>

            {/* Declaration Content */}
            <ScrollView style={{ maxHeight: 380 }} contentContainerStyle={{ padding: 20, gap: 14 }}>
              <View style={{ alignItems: 'center', marginBottom: 6 }}>
                <Text style={{ fontFamily: 'Roboto', fontWeight: '900', fontSize: 20, color: '#059669', letterSpacing: -0.5 }}>Anulekh Portal</Text>
                <Text style={{ fontFamily: 'Roboto', fontSize: 9, fontStyle: 'normal', color: '#64748b', textTransform: 'uppercase', letterSpacing: 1.5, marginTop: 2 }}>{t('official_cert_letter')}</Text>
              </View>

              {/* 1. Exam Details */}
              <View style={{ backgroundColor: '#f8fafc', padding: 12, borderRadius: 16, borderWidth: 1, borderColor: '#e2e8f0', gap: 4 }}>
                <Text style={{ fontFamily: 'Roboto', fontSize: 9, fontWeight: '800', color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 }}>{t('exam_details')}</Text>
                <Text style={{ fontFamily: 'Roboto', fontSize: 12, color: '#334155', fontWeight: '700' }}>Subject: {selectedExam?.subject}</Text>
                <Text style={{ fontFamily: 'Roboto', fontSize: 11, color: '#475569' }}>Level: {selectedExam?.exam_type}</Text>
                <Text style={{ fontFamily: 'Roboto', fontSize: 11, color: '#475569' }}>Date: {selectedExam?.exam_date}</Text>
                <Text style={{ fontFamily: 'Roboto', fontSize: 11, color: '#475569' }}>Venue: {selectedExam?.exam_venue}</Text>
              </View>

              {/* 2. Candidate & Scribe Details */}
              <View style={{ gap: 10 }}>
                <View>
                  <Text style={{ fontFamily: 'Roboto', fontSize: 9, fontWeight: '800', color: '#64748b', textTransform: 'uppercase', marginBottom: 2 }}>{t('candidate_student')}</Text>
                  <Text style={{ fontFamily: 'Roboto', fontSize: 12, color: '#0f172a', fontWeight: '800' }}>{selectedExam?.student_name}</Text>
                  <Text style={{ fontFamily: 'Roboto', fontSize: 10, color: '#64748b', marginTop: 1 }}>Grade: {selectedExam?.education_grade}</Text>
                  <Text style={{ fontFamily: 'Roboto', fontSize: 10, color: '#64748b' }}>Aadhaar ID: Verified</Text>
                </View>

                <View style={{ height: 1, backgroundColor: '#f1f5f9' }} />

                <View>
                  <Text style={{ fontFamily: 'Roboto', fontSize: 9, fontWeight: '800', color: '#64748b', textTransform: 'uppercase', marginBottom: 2 }}>{t('volunteer_scribe')}</Text>
                  <Text style={{ fontFamily: 'Roboto', fontSize: 12, color: '#0f172a', fontWeight: '800' }}>{scribeProfile?.full_name}</Text>
                  <Text style={{ fontFamily: 'Roboto', fontSize: 10, color: '#64748b', marginTop: 1 }}>Occupation: {scribeProfile?.occupation || 'Student Volunteer Scribe'}</Text>
                  <Text style={{ fontFamily: 'Roboto', fontSize: 10, color: '#64748b' }}>Education: {scribeProfile?.education_level || 'Undergraduate'}</Text>
                </View>
              </View>

              {/* 3. Formal Declaration Text */}
              <View style={{ backgroundColor: 'rgba(5,150,105,0.05)', borderWidth: 1, borderColor: 'rgba(5,150,105,0.18)', padding: 12, borderRadius: 16, marginTop: 4 }}>
                <Text style={{ fontFamily: 'Roboto', fontSize: 10, color: '#047857', lineHeight: 16, fontStyle: 'italic', textAlign: 'center' }}>
                  {t('declaration_agreement_text')}
                </Text>
              </View>

              {/* 4. Verification Stamp */}
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 2, paddingVertical: 4 }}>
                <View>
                  <Text style={{ fontFamily: 'Roboto', fontSize: 8, fontWeight: '800', color: '#64748b', textTransform: 'uppercase' }}>{t('status')}</Text>
                  <Text style={{ fontFamily: 'Roboto', fontSize: 10, color: '#059669', fontWeight: '800', marginTop: 2 }}>✓ Verified Scribe</Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={{ fontFamily: 'Roboto', fontSize: 8, fontWeight: '800', color: '#64748b', textTransform: 'uppercase' }}>{t('official_stamp')}</Text>
                  <Text style={{ fontFamily: 'Roboto', fontSize: 9, color: '#0f172a', fontWeight: '800', marginTop: 2 }}>ANULEKH ONLINE</Text>
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
                style={{ flex: 1, backgroundColor: '#059669', paddingVertical: 11, borderRadius: 12, alignItems: 'center', shadowColor: '#059669', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 8, elevation: 3 }}
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
                backgroundColor: 'rgba(5,150,105,0.09)', borderWidth: 1, borderColor: 'rgba(5,150,105,0.22)',
                alignItems: 'center', justifyContent: 'center',
              }}>
                <Feather name="phone" size={16} color="#059669" />
              </View>
              <Text style={{ fontFamily: 'Roboto', fontSize: 16, fontWeight: '900', color: '#0f172a' }}>{t('call_detail')}</Text>
            </View>
            <TouchableOpacity
              onPress={closeCallSheet}
              style={{
                width: 34, height: 34, borderRadius: 10,
                backgroundColor: 'rgba(0,0,0,0.05)',
                alignItems: 'center', justifyContent: 'center',
              }}
            >
              <Feather name="x" size={16} color="#64748b" />
            </TouchableOpacity>
          </View>

          {/* Contact card */}
          <View style={{
            backgroundColor: 'rgba(5,150,105,0.09)', borderWidth: 1, borderColor: 'rgba(5,150,105,0.22)',
            borderRadius: 20, padding: 20,
          }}>
            {/* Avatar + name */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 16 }}>
              <View style={{
                width: 54, height: 54, borderRadius: 16,
                backgroundColor: 'rgba(5,150,105,0.15)',
                borderWidth: 2, borderColor: 'rgba(5,150,105,0.22)',
                alignItems: 'center', justifyContent: 'center',
              }}>
                <Text style={{ fontFamily: 'Roboto', fontSize: 22, fontWeight: '900', color: '#059669' }}>
                  {callExam?.student_name?.charAt(0)?.toUpperCase() ?? 'S'}
                </Text>
              </View>
              <View>
                <Text style={{ fontFamily: 'Roboto', fontSize: 17, fontWeight: '900', color: '#0f172a' }}>
                  {callExam?.student_name ?? 'વિદ્યાર્થી'}
                </Text>
                <View style={{
                  marginTop: 4, backgroundColor: 'rgba(5,150,105,0.09)',
                  borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3,
                  alignSelf: 'flex-start', borderWidth: 1, borderColor: 'rgba(5,150,105,0.22)',
                }}>
                  <Text style={{ fontFamily: 'Roboto', color: '#059669', fontSize: 10, fontWeight: '800' }}>CANDIDATE STUDENT</Text>
                </View>
              </View>
            </View>

            {/* Phone number display */}
            {showMaskedNumber ? (
              <View style={{
                backgroundColor: '#fff',
                borderRadius: 14, paddingVertical: 14, paddingHorizontal: 18,
                flexDirection: 'row', alignItems: 'center', gap: 12,
                borderWidth: 1, borderColor: 'rgba(5,150,105,0.22)',
              }}>
                <Feather name="phone" size={18} color="#059669" />
                <Text style={{ fontFamily: 'Roboto', fontSize: 20, fontWeight: '900', color: '#0f172a', letterSpacing: 1.5 }}>
                  {callExam?.phone || '9876543210'}
                </Text>
              </View>
            ) : (
              <TouchableOpacity
                onPress={() => setShowMaskedNumber(true)}
                style={{
                  backgroundColor: '#fff',
                  borderRadius: 14, paddingVertical: 14, paddingHorizontal: 18,
                  flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
                  borderWidth: 1, borderColor: 'rgba(5,150,105,0.22)',
                  borderStyle: 'dashed'
                }}
              >
                <Feather name="eye" size={16} color="#059669" />
                <Text style={{ fontFamily: 'Roboto', fontSize: 14, fontWeight: '800', color: '#059669' }}>{t('view_number')}</Text>
              </TouchableOpacity>
            )}

            {/* Exam context */}
            <Text style={{ fontFamily: 'Roboto', fontSize: 11, color: '#64748b', marginTop: 10, textAlign: 'center' }}>
              વિષય: <Text style={{ fontWeight: '700', color: '#0f172a' }}>{callExam?.subject}</Text> પરીક્ષાના વિદ્યાર્થી
            </Text>
          </View>

          {/* Dial Now CTA */}
          <TouchableOpacity
            onPress={async () => {
              // Open the phone dialer; show an error if the device cannot place calls.
              const url = `tel:${callExam?.phone || '9876543210'}`;
              try {
                const supported = await Linking.canOpenURL(url);
                if (supported) {
                  await Linking.openURL(url);
                } else {
                  Alert.alert(t('error'), 'આ ઉપકરણથી કૉલ કરવો શક્ય નથી.');
                }
              } catch {
                Alert.alert(t('error'), 'કૉલ શરૂ કરવામાં ભૂલ આવી.');
              }
            }}
            style={{
              backgroundColor: '#059669',
              borderRadius: 18, paddingVertical: 16, marginTop: 16,
              flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
              shadowColor: '#059669', shadowOffset: { width: 0, height: 10 },
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
            <Text style={{ fontFamily: 'Roboto', color: '#64748b', fontSize: 14, fontWeight: '600' }}>{t('cancel')}</Text>
          </TouchableOpacity>
        </View>
      </Modal>

      {/* RATE STUDENT MODAL */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={ratingModalVisible}
        onRequestClose={() => setRatingModalVisible(false)}
      >
        <View style={{ flex: 1, backgroundColor: 'rgba(15,23,42,0.6)', justifyContent: 'center', alignItems: 'center', paddingHorizontal: 20 }}>
          <View style={{ backgroundColor: '#f8fafc', width: '100%', maxWidth: 340, borderRadius: 28, padding: 24, shadowColor: '#64748b', shadowOffset: { width: 0, height: 20 }, shadowOpacity: 0.08, shadowRadius: 12, elevation: 3, borderWidth: 1, borderColor: '#e2e8f0' }}>
            <View style={{ alignItems: 'center', marginBottom: 16 }}>
              <View style={{ width: 48, height: 48, borderRadius: 16, backgroundColor: 'rgba(37,99,235,0.09)', alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
                <Feather name="star" size={24} color="#2563eb" />
              </View>
              <Text style={{ fontFamily: 'Roboto', fontSize: 18, fontWeight: '900', color: '#0f172a', textAlign: 'center' }}>Rate Candidate Student</Text>
              <Text style={{ fontFamily: 'Roboto', fontSize: 11, color: '#64748b', textAlign: 'center', marginTop: 4 }}>
                Please provide feedback for student {ratingTarget?.examDetails?.student_name}.
              </Text>
            </View>

            {/* Stars selection */}
            <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 8, marginBottom: 20 }}>
              {[1, 2, 3, 4, 5].map((star) => (
                <TouchableOpacity
                  key={star}
                  onPress={() => setSelectedRating(star)}
                  style={{ padding: 4 }}
                >
                  <Ionicons
                    name={star <= selectedRating ? "star" : "star-outline"}
                    size={32}
                    color={star <= selectedRating ? "#eab308" : "#cbd5e1"}
                  />
                </TouchableOpacity>
              ))}
            </View>

            {/* Remark input */}
            <View style={{ marginBottom: 20 }}>
              <Text style={{ fontFamily: 'Roboto', fontSize: 11, fontWeight: '700', color: '#475569', marginBottom: 6, marginLeft: 2 }}>Write a remark (optional)</Text>
              <TextInput
                value={remark}
                onChangeText={setRemark}
                placeholder="e.g. Cooperative, punctual and shared requirements clearly."
                placeholderTextColor="#94a3b8"
                multiline={true}
                numberOfLines={3}
                style={{ backgroundColor: '#f8fafc', borderWidth: 1.5, borderColor: '#e2e8f0', borderRadius: 14, paddingHorizontal: 14, paddingVertical: 10, fontSize: 13, color: '#0f172a', height: 72, textAlignVertical: 'top' }}
              />
            </View>

            {/* Actions */}
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <TouchableOpacity
                onPress={() => setRatingModalVisible(false)}
                style={{ flex: 1, backgroundColor: '#f1f5f9', paddingVertical: 12, borderRadius: 14, alignItems: 'center', justifyContent: 'center' }}
              >
                <Text style={{ fontFamily: 'Roboto', color: '#475569', fontWeight: '800', fontSize: 13 }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={submitStudentRating}
                disabled={submittingRating}
                style={{ flex: 1, backgroundColor: '#2563eb', paddingVertical: 12, borderRadius: 14, alignItems: 'center', justifyContent: 'center' }}
              >
                {submittingRating ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={{ fontFamily: 'Roboto', color: '#fff', fontWeight: '800', fontSize: 13 }}>Submit Rating</Text>
                )}
              </TouchableOpacity>
            </View>

          </View>
        </View>
      </Modal>
    </View>
  );
}
