/**
 * StudentRequestsView — the "Requests" tab of the student portal.
 *
 * Rendered by app/console/student/index.tsx inside `<TabPane active={activeTab === 'requests'}>`, the
 * keep-alive tab body from components/ui/TabPane.tsx (the view stays mounted when hidden and uses
 * `useTabActive()` to refresh only while visible). It has three sub-tabs:
 *   - Exams: the student's exam scribe requests, with applicant counts, SOS, call/chat with the
 *     matched scribe, declaration letter, rating/completion, un-match and delete;
 *   - Assignments: the student's assignment writer requests (invite, edit, complete, call, chat, delete);
 *   - Past Scribes: every scribe ever matched to one of the student's exams, with a profile/review
 *     modal and a "private invite" flow.
 * Navigates to /console/student/request_form, /console/student/assignment_form,
 * /console/student/view_applications and /console/common/chat, and opens ScribesDirectoryModal.
 *
 * Data: `supabase` is the custom shim in core/supabase.ts that sends each query to the Rust/Axum
 * backend (`POST /api/query`); it is not real Supabase.
 *   Reads:  `profiles`, `exam_requests`, `assignment_requests`, `scribe_applications`, `scribe_reviews`.
 *   Writes: `exam_requests` (auto/manual SOS, completion, un-match, private invite, delete),
 *           `assignment_requests` (complete, delete), `scribe_applications` (reject on un-match, delete),
 *           `scribe_reviews` (rating insert) and `notifications` (SOS broadcast, cancel/un-match notices).
 *
 * Loading uses the stale-while-revalidate snapshot cache in core/screenCache.ts (cached snapshot shown
 * instantly, fresh data fetched in parallel, then saved back), and scribe profiles are resolved in one
 * de-duplicated batch with `getProfilesByIds` from core/profileLookup.ts.
 *
 * Styling is inline (no StyleSheet). The page gradient, colour orb, top panel and empty-state colours
 * come from STUDENT_THEME and `gradient()` in core/portalTheme.ts; cards use fixed status colours.
 */
import React, { useState, useCallback } from 'react';
import { View, Text, FlatList, ActivityIndicator, RefreshControl, TouchableOpacity, Alert, Modal, ScrollView, Linking, TextInput } from 'react-native';
import { Feather, Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { supabase } from '@/core/supabase';
import { useLanguage } from '@/core/translation';
import { hoursUntilExam } from '@/core/examDate';
import ScribesDirectoryModal from './ScribesDirectoryModal';
import Animated, { FadeInDown, useReducedMotion } from 'react-native-reanimated';
import { gradient, STUDENT_THEME as THEME } from '@/core/portalTheme';
import { DesktopCell, desktopRowStyle, useDesktopColumns, useInDesktopShell } from '@/components/ui/DesktopShell';
import PastScribesList from '@/components/student/PastScribesList';
import { useTabActive } from '@/components/ui/TabPane';
import { readScreenCache, writeScreenCache } from '@/core/screenCache';
import { getProfilesByIds } from '@/core/profileLookup';

/**
 * One `exam_requests` row as this screen uses it, plus two fields added client-side in fetchRequests:
 * `applicationCount` (number of `scribe_applications` rows for the request) and `scribeProfile` (the
 * matched scribe's `profiles` row). `is_emergency` is the string 'yes' once an SOS has been raised, and
 * `private_scribe_id` is set when the student has privately invited a scribe.
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
  subject?: string;
  exam_date?: string;
  exam_venue?: string;
  applicationCount?: number;
  scribe_id?: string;
  is_emergency?: string;
  private_scribe_id?: string;
  scribeProfile?: {
    full_name: string;
    phone: string;
    education_level: string;
    occupation: string;
  };
}

/** Everything the Requests tab shows, cached so the next visit paints instantly (see core/screenCache). */
interface StudentRequestsSnapshot {
  profile: any;
  requests: any[];
  assignments: any[];
  pastScribes: any[];
}

/**
 * Requests tab of the student portal. Takes no props: the signed-in student comes from the session.
 * Owns the list data, the sub-tab selection, the expanded-card map and the state of its five modals
 * (declaration, call sheet, rating, private invite, scribe profile) plus ScribesDirectoryModal.
 */
export default function StudentRequestsView() {
  // Inside the desktop console: no own page background, wider layout (see ui/DesktopShell).
  const inShell = useInDesktopShell();
  // Card columns for the request lists (1 on phones, 2 on wide desktop screens).
  const columns = useDesktopColumns();
  const { t } = useLanguage();
  // True while this tab is visible (TabPane keep-alive) — data refreshes only then.
  const isActive = useTabActive();
  // Panel and cards rise in one after another (off with Reduce Motion).
  const reduceMotion = useReducedMotion();
  const rise = (index: number) => (reduceMotion ? undefined : FadeInDown.delay(Math.min(index, 6) * 70).duration(420));
  // List data and loading flags (filled from the cached snapshot first, then from the backend).
  const [requests, setRequests] = useState<ExamRequest[]>([]);
  const [assignmentRequests, setAssignmentRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [studentProfile, setStudentProfile] = useState<any>(null);

  // Tab view control
  const [activeTab, setActiveTab] = useState<'requests' | 'assignments' | 'past_scribes'>('requests');
  // Scribe directory modal; preSelectedScribeReq tells it which request an invite is for.
  const [showScribeDirectory, setShowScribeDirectory] = useState(false);
  const [preSelectedScribeReq, setPreSelectedScribeReq] = useState<{ id: number; type: 'exam' | 'assignment'; subject: string } | undefined>(undefined);

  // Past scribes and private invites states
  const [pastScribes, setPastScribes] = useState<any[]>([]);
  const [inviteModalVisible, setInviteModalVisible] = useState(false);
  const [inviteTargetScribe, setInviteTargetScribe] = useState<any>(null);
  const [submittingInvite, setSubmittingInvite] = useState(false);

  // Scribe detailed profile modal states
  const [profileModalVisible, setProfileModalVisible] = useState(false);
  const [viewingScribe, setViewingScribe] = useState<any>(null);
  const [viewingReviews, setViewingReviews] = useState<any[]>([]);
  const [loadingReviews, setLoadingReviews] = useState(false);

  // Declaration Modal State
  const [selectedExam, setSelectedExam] = useState<any>(null);
  const [isDeclarationOpen, setIsDeclarationOpen] = useState(false);

  // Rating Modal State
  const [ratingExam, setRatingExam] = useState<any>(null);
  const [isRatingOpen, setIsRatingOpen] = useState(false);
  const [ratingPunctuality, setRatingPunctuality] = useState(5);
  const [ratingCommunication, setRatingCommunication] = useState(5);
  const [ratingSpeed, setRatingSpeed] = useState(5);
  const [ratingBehavior, setRatingBehavior] = useState(5);
  const [ratingOverall, setRatingOverall] = useState(5);
  const [remark, setRemark] = useState('');
  const [submittingRating, setSubmittingRating] = useState(false);

  // Call Modal State
  const [callExam, setCallExam] = useState<any>(null);
  const [isCallOpen, setIsCallOpen] = useState(false);
  const [showMaskedNumber, setShowMaskedNumber] = useState(false);

  // Expanded Cards State
  const [expandedCards, setExpandedCards] = useState<Record<string, boolean>>({});
  // Keys are request ids, or "past_<scribeId>" for past-scribe cards.
  const toggleCard = (id: string | number) => {
    setExpandedCards(prev => ({ ...prev, [id]: !prev[id] }));
  };

  /** Puts a snapshot (cached or freshly fetched) on screen. */
  const applySnapshot = (snap: StudentRequestsSnapshot) => {
    setStudentProfile(snap.profile);
    setRequests(snap.requests);
    setAssignmentRequests(snap.assignments);
    setPastScribes(snap.pastScribes);
  };

  /**
   * Loads the Requests tab.
   * 1. Shows the last cached snapshot instantly.
   * 2. Fetches profile, exam requests, assignment requests and past matches in parallel.
   * 3. Auto-SOS: pending exams within 24 h are escalated to emergency (updates sent in parallel).
   * 4. Fetches every needed scribe profile in one de-duplicated batch, plus applicant counts in parallel.
   */
  const fetchRequests = async () => {
    try {
      // No session (signed out): nothing to load.
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setLoading(false);
        return;
      }
      const userId = session.user.id;

      // Stale-while-revalidate: paint the last cached snapshot right away so repeat visits show no spinner.
      const cached = await readScreenCache<StudentRequestsSnapshot>('student_requests', userId);
      if (cached) {
        applySnapshot(cached);
        setLoading(false);
      }

      // 1. Everything that depends only on the student's id, in parallel
      const [
        { data: profile },
        { data, error },
        { data: assignmentData, error: assignmentError },
        { data: pastExams },
      ] = await Promise.all([
        supabase.from('profiles').select('*').eq('id', userId).single(),
        supabase.from('exam_requests').select('*').eq('student_id', userId).order('created_at', { ascending: false }),
        supabase.from('assignment_requests').select('*').eq('student_id', userId).order('created_at', { ascending: false }),
        supabase.from('exam_requests').select('scribe_id').eq('student_id', userId).neq('scribe_id', null),
      ]);
      // Only the two request lists are required; a missing profile or past-match result is tolerated.
      if (error) throw new Error(error.message || error.details || error.hint || 'Failed to load exam requests.');
      if (assignmentError) throw new Error(assignmentError.message || assignmentError.details || assignmentError.hint || 'Failed to load assignment requests.');

      // 2. Auto-SOS: a still-pending request within 24 h of its exam is escalated to an emergency
      const autoSos = (data || []).filter((req: any) => {
        if (req.status !== 'pending' || req.is_emergency === 'yes' || !req.exam_date) return false;
        const h = hoursUntilExam(req.exam_date);
        return h !== null && h <= 24 && h > 0;
      });
      autoSos.forEach((req: any) => { req.is_emergency = 'yes'; });
      await Promise.all(autoSos.map((req: any) =>
        supabase.from('exam_requests').update({ is_emergency: 'yes' }).eq('id', req.id)
      ));

      // 3. Scribe profiles (matched assignments, matched exams, past scribes) in one batch + applicant counts
      const pastScribeIds = Array.from(new Set((pastExams || []).map((e: any) => e.scribe_id)));
      const [scribes, applicantResults] = await Promise.all([
        getProfilesByIds([
          ...(assignmentData || []).filter((a: any) => a.status === 'matched').map((a: any) => a.scribe_id),
          ...(data || []).filter((e: any) => e.status === 'matched').map((e: any) => e.scribe_id),
          ...pastScribeIds,
        ]),
        Promise.all((data || []).map((exam: any) =>
          supabase.from('scribe_applications').select('id').eq('request_id', exam.id)
        )),
      ]);

      // Attach matched scribe profiles and applicant counts (applicantResults is index-aligned with data).
      const enrichedAssignments = (assignmentData || []).map((assign: any) => ({
        ...assign,
        scribeProfile: (assign.status === 'matched' && assign.scribe_id && scribes.get(assign.scribe_id)) || undefined,
      }));
      const enrichedRequests = (data || []).map((exam: any, i: number) => ({
        ...exam,
        applicationCount: applicantResults[i]?.data ? applicantResults[i].data.length : 0,
        scribeProfile: (exam.status === 'matched' && exam.scribe_id && scribes.get(exam.scribe_id)) || undefined,
      }));

      // Show the fresh data and save it as the snapshot for the next visit.
      const snapshot: StudentRequestsSnapshot = {
        profile,
        requests: enrichedRequests,
        assignments: enrichedAssignments,
        pastScribes: pastScribeIds.map((id) => scribes.get(id as string)).filter(Boolean),
      };
      applySnapshot(snapshot);
      writeScreenCache('student_requests', userId, snapshot);
    } catch (error: any) {
      // Errors are only logged; whatever is already on screen (e.g. the cached snapshot) stays.
      const msg = error?.message ?? error?.details ?? error?.hint ?? (typeof error === 'string' ? error : JSON.stringify(error));
      console.warn('Error fetching requests:', msg);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  // Refresh whenever the console is focused *and* this tab is visible: switching back to the tab flips
  // isActive and triggers a quiet background refresh, while hidden tabs don't fetch at all.
  useFocusEffect(
    useCallback(() => {
      if (!isActive) return;
      fetchRequests();
    }, [isActive])
  );
  /** Pull-to-refresh handler for the Exams / Assignments lists. */
  const onRefresh = () => {
    setRefreshing(true);
    fetchRequests();
  };

  /** Opens the rating modal for a matched exam with every score reset to 5 and an empty remark. */
  const openRatingModal = (exam: any) => {
    setRatingExam(exam);
    setRatingPunctuality(5);
    setRatingCommunication(5);
    setRatingSpeed(5);
    setRatingBehavior(5);
    setRatingOverall(5);
    setRemark('');
    setIsRatingOpen(true);
  };

  /**
   * Submits the rating modal: inserts a `scribe_reviews` row for the matched scribe, then marks the
   * exam request `completed` and reloads the tab.
   */
  const submitRating = async () => {
    if (!ratingExam) return;
    setSubmittingRating(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("No active session.");

      // 1. Insert review into scribe_reviews
      const { error: reviewError } = await supabase.from('scribe_reviews').insert({
        request_id: ratingExam.id,
        student_id: session.user.id,
        scribe_id: ratingExam.scribe_id,
        rating_punctuality: ratingPunctuality,
        rating_communication: ratingCommunication,
        rating_speed: ratingSpeed,
        rating_behavior: ratingBehavior,
        rating_overall: ratingOverall,
        remark: remark.trim(),
      });
      if (reviewError) throw reviewError;

      // 2. Update status to completed in exam_requests
      const { error: requestUpdateError } = await supabase
        .from('exam_requests')
        .update({ status: 'completed' })
        .eq('id', ratingExam.id);
      if (requestUpdateError) throw requestUpdateError;

      Alert.alert("Success", "Exam request marked as completed and review submitted successfully!");
      setIsRatingOpen(false);
      fetchRequests();
    } catch (err: any) {
      Alert.alert("Error", err.message || "Failed to submit rating.");
    } finally {
      setSubmittingRating(false);
    }
  };

  /**
   * Opens the call bottom sheet for a matched exam. Scribe contact details unlock only on the exam day
   * (the date part of `exam_date`, before any "|", must equal today's UTC date).
   */
  const openCallSheet = (exam: any) => {
    if (!exam || !exam.exam_date) {
      Alert.alert("Calling Unavailable", "Calling is only permitted on the day of the exam.");
      return;
    }
    
    // Check if the exam date is today
    const dateStr = exam.exam_date.split('|')[0].trim(); // Get YYYY-MM-DD
    const todayStr = new Date().toISOString().split('T')[0];
    
    if (dateStr !== todayStr) {
      Alert.alert("Contact Info Locked 🔒", `Scribe contact details are protected and will unlock on the exam day (${dateStr}).`);
      return;
    }

    setCallExam(exam);
    setShowMaskedNumber(false);
    setIsCallOpen(true);
  };

  /** Closes the call bottom sheet. */
  const closeCallSheet = () => setIsCallOpen(false);

  /**
   * Opens the scribe profile modal for a past scribe and loads all of their `scribe_reviews` rows.
   * @param scribe The scribe's `profiles` row (an entry of pastScribes).
   */
  const handleOpenScribeProfile = async (scribe: any) => {
    setViewingScribe({ scribe_name: scribe.full_name || scribe.official_name, profile: scribe });
    setProfileModalVisible(true);
    setLoadingReviews(true);
    // Reviews are fetched each time the modal opens; any failure just shows an empty list.
    try {
      const { data, error } = await supabase
        .from('scribe_reviews')
        .select('*')
        .eq('scribe_id', scribe.id);
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

  /** Opens the private-invite modal targeting the given past scribe. */
  const openInviteModal = (scribe: any) => {
    setInviteTargetScribe(scribe);
    setInviteModalVisible(true);
  };

  /**
   * Privately invites the selected past scribe to one of the student's pending exam requests by setting
   * `exam_requests.private_scribe_id`, then reloads the tab.
   * @param examId Id of the exam request picked in the invite modal.
   */
  const sendPrivateInvitation = async (examId: number) => {
    // Ignore repeat taps while an invite is already being sent.
    if (!inviteTargetScribe || submittingInvite) return;
    setSubmittingInvite(true);
    try {
      const { error } = await supabase
        .from('exam_requests')
        .update({ private_scribe_id: inviteTargetScribe.id })
        .eq('id', examId);
      
      if (error) throw error;
      
      Alert.alert("Success", `Invitation sent privately to ${inviteTargetScribe.full_name || inviteTargetScribe.official_name}!`);
      setInviteModalVisible(false);
      fetchRequests();
    } catch (e: any) {
      Alert.alert("Error", e.message || "Failed to send invitation.");
    } finally {
      setSubmittingInvite(false);
    }
  };

  /**
   * Renders one assignment request card (Assignments sub-tab). Collapsed, it shows subject, level,
   * status and deadline; expanded, it adds the instructions, the assigned writer and the actions:
   * matched -> Mark Completed / Call Writer / Chat; otherwise -> Find & Invite Writers / Edit / Delete.
   * @param item  An enriched `assignment_requests` row.
   * @param index Position in the list, used to stagger the entry animation.
   */
  const renderAssignmentCard = (item: any, index = 0) => {
    const isMatched = item.status === 'matched';
    const isExpanded = expandedCards[item.id] || false;

    // Badge text and colours for each status.
    const statusLabel = (() => {
      switch (item.status.toLowerCase()) {
        case 'pending': return 'NOT ASSIGNED';
        case 'matched': return 'ASSIGNED';
        case 'completed': return 'COMPLETED';
        case 'cancelled': return 'CANCELLED';
        default: return item.status.toUpperCase();
      }
    })();

    const statusColor = (() => {
      switch (item.status.toLowerCase()) {
        case 'pending': return { text: '#475569', border: '#cbd5e1', bg: '#fff' };
        case 'matched': return { text: '#059669', border: '#6ee7b7', bg: '#f0fdf4' };
        case 'completed': return { text: '#10b981', border: '#a7f3d0', bg: '#ecfdf5' };
        case 'cancelled': return { text: '#ef4444', border: '#fca5a5', bg: '#fff7f7' };
        default: return { text: '#2563eb', border: '#bfdbfe', bg: '#eff6ff' };
      }
    })();

    // Confirms, then deletes the assignment request and reloads.
    const handleDelete = () => {
      Alert.alert(
        'Delete Assignment Request',
        'Are you sure you want to delete this assignment request? This action cannot be undone.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Delete', style: 'destructive',
            onPress: async () => {
              await supabase.from('assignment_requests').delete().eq('id', item.id);
              fetchRequests();
            }
          }
        ]
      );
    };

    // Confirms, then sets the assignment's status to 'completed' and reloads.
    const handleMarkCompleted = async () => {
      Alert.alert(
        'Mark as Completed',
        'Are you sure you want to mark this assignment as completed?',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Confirm',
            onPress: async () => {
              try {
                await supabase
                  .from('assignment_requests')
                  .update({ status: 'completed' })
                  .eq('id', item.id);
                fetchRequests();
              } catch (e: any) {
                Alert.alert('Error', e.message || 'Failed to update request');
              }
            }
          }
        ]
      );
    };

    return (
      <Animated.View entering={rise(index + 1)} style={{
        backgroundColor: '#ffffff',
        borderRadius: 24,
        borderWidth: 1.5,
        borderColor: isMatched ? '#a7f3d0' : '#bfdbfe',
        shadowColor: isMatched ? '#059669' : '#2563eb',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.12,
        shadowRadius: 16,
        elevation: 4,
        marginBottom: 16,
        padding: 18,
      }}>
        {/* Status accent strip (matches the status badge colour) */}
        <View style={{ position: 'absolute', left: 0, top: 18, bottom: 18, width: 4, borderTopRightRadius: 4, borderBottomRightRadius: 4, backgroundColor: statusColor.text }} />

        {/* Header Row: Subject & Level Subtitle on Left, Status Badge on Right */}
        <TouchableOpacity onPress={() => toggleCard(item.id)} activeOpacity={0.85} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
          <View style={{ flex: 1, marginRight: 10 }}>
            <Text style={{ fontFamily: 'Roboto', fontSize: 16, fontWeight: '900', color: '#0f172a', letterSpacing: -0.3 }}>
              {item.subject}
            </Text>
            <Text style={{ fontFamily: 'Roboto', fontSize: 11, color: '#64748b', marginTop: 2 }}>
              Level: {item.academic_level || 'General'} | {item.assignment_title}
            </Text>
          </View>

          {/* Status Badge */}
          <View style={{
            paddingVertical: 5, paddingHorizontal: 11,
            borderRadius: 20,
            borderWidth: 1,
            borderColor: statusColor.border,
            backgroundColor: statusColor.bg,
          }}>
            <Text style={{ fontFamily: 'Roboto', fontSize: 9.5, fontWeight: '800', color: statusColor.text, letterSpacing: 0.3 }}>
              {statusLabel}
            </Text>
          </View>
        </TouchableOpacity>

        {/* Summary Row: Deadline on Left, "Details v" Pill Button on Right */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#f1f5f9' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
            <Feather name="clock" size={13} color="#f97316" style={{ marginRight: 6 }} />
            <Text style={{ fontFamily: 'Roboto', color: '#334155', fontSize: 12, fontWeight: '700' }}>
              Deadline: {item.deadline}
            </Text>
          </View>

          {/* Details Pill Button — Blue Accent */}
          <TouchableOpacity
            onPress={() => toggleCard(item.id)}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              backgroundColor: isExpanded ? '#1d4ed8' : '#2563eb',
              borderWidth: 1.5,
              borderColor: '#2563eb',
              paddingHorizontal: 12,
              paddingVertical: 5,
              borderRadius: 12,
              gap: 5,
              shadowColor: '#2563eb',
              shadowOffset: { width: 0, height: 3 },
              shadowOpacity: 0.2,
              shadowRadius: 6,
              elevation: 3
            }}
          >
            <Text style={{ fontFamily: 'Roboto', fontSize: 11.5, fontWeight: '900', color: '#ffffff' }}>
              {isExpanded ? 'Collapse' : 'Details'}
            </Text>
            <Feather name={isExpanded ? "chevron-up" : "chevron-down"} size={14} color="#ffffff" />
          </TouchableOpacity>
        </View>

        {/* ── EXPANDED CONTENT VIEW (Only visible when Details is clicked) ── */}
        {isExpanded && (
          <View style={{ marginTop: 14, paddingTop: 14, borderTopWidth: 1, borderTopColor: '#f1f5f9' }}>
            {/* Instructions bubble section if description exists */}
            {item.description ? (
              <View style={{
                backgroundColor: '#f8fafc',
                borderWidth: 1,
                borderColor: '#e2e8f0',
                borderRadius: 14,
                padding: 12,
                marginBottom: 14,
              }}>
                <Text style={{ fontFamily: 'Roboto', fontSize: 9, color: '#64748b', fontWeight: '800', textTransform: 'uppercase', marginBottom: 4 }}>Instructions</Text>
                <Text style={{ fontFamily: 'Roboto', color: '#475569', fontSize: 12, lineHeight: 17 }}>
                  {item.description}
                </Text>
              </View>
            ) : null}

            {/* Writer Info if assigned */}
            {isMatched && item.scribeProfile ? (
              <View style={{
                marginBottom: 14, backgroundColor: 'rgba(5,150,105,0.07)',
                borderRadius: 14, padding: 12,
                borderWidth: 1, borderColor: 'rgba(5,150,105,0.2)',
                flexDirection: 'row', alignItems: 'center', gap: 10,
              }}>
                <View style={{
                  width: 36, height: 36, borderRadius: 10,
                  backgroundColor: 'rgba(5,150,105,0.12)',
                  alignItems: 'center', justifyContent: 'center',
                }}>
                  <Text style={{ fontFamily: 'Roboto', fontSize: 16, fontWeight: '900', color: '#059669' }}>
                    {item.scribeProfile.full_name?.charAt(0)?.toUpperCase() ?? 'W'}
                  </Text>
                </View>
                <View>
                  <Text style={{ fontFamily: 'Roboto', fontSize: 13, fontWeight: '900', color: '#047857' }}>
                    {item.scribeProfile.full_name}
                  </Text>
                  <Text style={{ fontFamily: 'Roboto', fontSize: 11, color: '#064e3b' }}>Assignment Writer · Assigned</Text>
                </View>
              </View>
            ) : null}

            {/* Action Row */}
            {isMatched ? (
              <View style={{ gap: 10 }}>
                {/* Mark Completed + Call Writer side by side */}
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <TouchableOpacity
                    onPress={handleMarkCompleted}
                    style={{
                      flex: 1, backgroundColor: '#10b981',
                      borderRadius: 12, paddingVertical: 11,
                      flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
                      shadowColor: '#10b981', shadowOffset: { width: 0, height: 4 },
                      shadowOpacity: 0.15, shadowRadius: 8, elevation: 3,
                    }}
                    activeOpacity={0.85}
                  >
                    <Feather name="check-circle" size={14} color="#fff" />
                    <Text style={{ fontFamily: 'Roboto', fontSize: 13, fontWeight: '800', color: '#fff' }}>
                      Mark Completed
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    onPress={() => {
                      if (item.scribeProfile?.phone) {
                        Linking.openURL(`tel:${item.scribeProfile.phone}`);
                      } else {
                        Alert.alert('Unavailable', 'Phone number not available');
                      }
                    }}
                    style={{
                      flex: 1, backgroundColor: '#2563eb',
                      borderRadius: 12, paddingVertical: 11,
                      flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
                      shadowColor: '#2563eb', shadowOffset: { width: 0, height: 4 },
                      shadowOpacity: 0.15, shadowRadius: 8, elevation: 3,
                    }}
                    activeOpacity={0.85}
                  >
                    <Feather name="phone-call" size={14} color="#fff" />
                    <Text style={{ fontFamily: 'Roboto', fontSize: 13, fontWeight: '800', color: '#fff' }}>
                      Call Writer
                    </Text>
                  </TouchableOpacity>
                </View>

                {/* Opens the shared chat screen for this assignment */}
                <TouchableOpacity
                  onPress={() => router.push(`/console/common/chat?requestId=${item.id}&type=assignment` as any)}
                  style={{
                    width: '100%', paddingVertical: 11,
                    borderRadius: 12, borderWidth: 1.5,
                    borderColor: '#bfdbfe',
                    backgroundColor: '#eff6ff',
                    alignItems: 'center', justifyContent: 'center',
                  }}
                  activeOpacity={0.7}
                >
                  <Text style={{ fontFamily: 'Roboto', fontSize: 13, fontWeight: '800', color: '#2563eb' }}>Chat with Writer</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={{ gap: 10 }}>
                {/* Find & Invite Writers button — full width */}
                <TouchableOpacity
                  onPress={() => {
                    setPreSelectedScribeReq({ id: item.id, type: 'assignment', subject: item.subject });
                    setShowScribeDirectory(true);
                  }}
                  style={{
                    width: '100%', paddingVertical: 11,
                    borderRadius: 12,
                    backgroundColor: '#4f46e5',
                    alignItems: 'center', justifyContent: 'center',
                    flexDirection: 'row', gap: 6,
                    shadowColor: '#4f46e5', shadowOffset: { width: 0, height: 4 },
                    shadowOpacity: 0.15, shadowRadius: 8, elevation: 3,
                  }}
                  activeOpacity={0.85}
                >
                  <Feather name="search" size={14} color="#fff" />
                  <Text style={{ fontFamily: 'Roboto', fontSize: 13, fontWeight: '800', color: '#fff' }}>
                    Find & Invite Writers
                  </Text>
                </TouchableOpacity>

                {/* Edit (reopens assignment_form with this id) + Delete */}
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <TouchableOpacity
                    onPress={() => {
                      router.push(`/console/student/assignment_form?id=${item.id}` as any);
                    }}
                    style={{
                      flex: 1, paddingVertical: 11,
                      borderRadius: 12, borderWidth: 1.5,
                      borderColor: '#2563eb',
                      backgroundColor: '#fff',
                      alignItems: 'center', justifyContent: 'center',
                    }}
                    activeOpacity={0.7}
                  >
                    <Text style={{ fontFamily: 'Roboto', fontSize: 13, fontWeight: '800', color: '#2563eb' }}>
                      Edit Details
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    onPress={handleDelete}
                    style={{
                      flex: 1, paddingVertical: 11,
                      borderRadius: 12, borderWidth: 1.5,
                      borderColor: '#fca5a5',
                      backgroundColor: '#fff7f7',
                      alignItems: 'center', justifyContent: 'center',
                    }}
                    activeOpacity={0.7}
                  >
                    <Text style={{ fontFamily: 'Roboto', fontSize: 13, fontWeight: '800', color: '#ef4444' }}>
                      Delete
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </View>
        )}
      </Animated.View>
    );
  };

  // First load with no cached snapshot: full-screen spinner.
  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', paddingVertical: 10, backgroundColor: '#f9fafb' }}>
        <ActivityIndicator size="large" color="#2563eb" />
      </View>
    );
  }

  // Layout: themed gradient page -> top action/sub-tab panel -> list for the selected sub-tab -> modals.
  return (
    <View style={inShell ? { flex: 1 } : [{ flex: 1, backgroundColor: THEME.page }, gradient(THEME.pageGradient)]}>
      {/* Soft colour orb for depth behind the cards */}
      {!inShell && <View pointerEvents="none" style={{ position: 'absolute', top: -70, right: -80, width: 240, height: 240, borderRadius: 120, backgroundColor: THEME.orb }} />}

      {/* Top Filter & Action Panel */}
      <Animated.View entering={rise(0)} style={{
        backgroundColor: '#ffffff',
        marginHorizontal: inShell ? 0 : 24,
        marginTop: 16,
        marginBottom: 12,
        borderRadius: 24,
        borderWidth: 1.5,
        borderColor: THEME.cardBorder,
        padding: 16,
        shadowColor: THEME.shadow,
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.1,
        shadowRadius: 14,
        elevation: 4,
      }}>
        {/* Row 1: 2 equal-width 50/50 action buttons */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 }}>
          {/* Find Scribes: opens the scribe directory without a pre-selected request */}
          <TouchableOpacity
            onPress={() => setShowScribeDirectory(true)}
            style={{
              flex: 1,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              borderWidth: 1.5,
              borderColor: '#2563eb',
              paddingVertical: 10,
              borderRadius: 14,
              backgroundColor: '#ffffff'
            }}
          >
            <Feather name="search" size={14} color="#2563eb" />
            <Text style={{ fontFamily: 'Roboto', fontSize: 12.5, fontWeight: '800', color: '#2563eb' }}>Find Scribes</Text>
          </TouchableOpacity>

          {/* New Request: asks whether to create an exam scribe or an assignment writer request */}
          <TouchableOpacity
            onPress={() => {
              Alert.alert(
                'Select Request Type',
                'What type of request would you like to create?',
                [
                  { text: 'Cancel', style: 'cancel' },
                  { text: 'Exam Scribe', onPress: () => router.push('/console/student/request_form' as any) },
                  { text: 'Assignment Writer', onPress: () => router.push('/console/student/assignment_form' as any) }
                ]
              );
            }}
            style={{ 
              flex: 1,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              backgroundColor: '#2563eb',
              ...gradient(THEME.buttonGradient),
              paddingVertical: 10, 
              borderRadius: 14,
              shadowColor: '#2563eb', 
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: 0.25,
              shadowRadius: 8,
              elevation: 3 
            }}
          >
            <Feather name="plus" size={14} color="#fff" />
            <Text style={{ fontFamily: 'Roboto', fontSize: 12.5, fontWeight: '800', color: '#fff' }}>New Request</Text>
          </TouchableOpacity>
        </View>

        {/* Tab Switcher Slider */}
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {[
            { 
              key: 'requests', 
              label: 'Exams', 
              activeBg: '#2563eb', 
              activeBorder: '#2563eb', 
              inactiveBg: '#eff6ff', 
              inactiveBorder: '#bfdbfe', 
              inactiveText: '#2563eb' 
            },
            { 
              key: 'assignments', 
              label: 'Assignments', 
              activeBg: '#f97316', 
              activeBorder: '#f97316', 
              inactiveBg: '#fff7ed', 
              inactiveBorder: '#fed7aa', 
              inactiveText: '#ea580c' 
            },
            { 
              key: 'past_scribes', 
              label: 'Past Scribes', 
              activeBg: '#16a34a', 
              activeBorder: '#16a34a', 
              inactiveBg: '#f0fdf4', 
              inactiveBorder: '#bbf7d0', 
              inactiveText: '#16a34a' 
            },
          ].map((tab) => {
            // This local isActive is the sub-tab highlight, not the TabPane flag from useTabActive().
            const isActive = activeTab === tab.key;
            return (
              <TouchableOpacity
                key={tab.key}
                onPress={() => setActiveTab(tab.key as any)}
                style={{
                  flex: 1,
                  paddingVertical: 9,
                  borderRadius: 14,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: isActive ? tab.activeBg : tab.inactiveBg,
                  borderWidth: 1.5,
                  borderColor: isActive ? tab.activeBorder : tab.inactiveBorder,
                  shadowColor: isActive ? tab.activeBg : 'transparent',
                  shadowOffset: { width: 0, height: 4 },
                  shadowOpacity: isActive ? 0.35 : 0,
                  shadowRadius: 8,
                  elevation: isActive ? 4 : 0
                }}
              >
                <Text style={{
                  fontFamily: 'Roboto',
                  fontSize: 11.5,
                  fontWeight: '900',
                  color: isActive ? '#ffffff' : tab.inactiveText
                }}>
                  {tab.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </Animated.View>

      {/* Exams and Assignments share one FlatList (pull-to-refresh, empty state, per-type card renderer);
          the Past Scribes sub-tab renders a search bar and its own list in the else branch. */}
      {activeTab === 'requests' || activeTab === 'assignments' ? (
      <FlatList
        // Desktop: cards in columns (the key remounts the list when the column count changes).
        key={`cols-${columns}`}
        numColumns={columns}
        columnWrapperStyle={desktopRowStyle(columns)}
        style={{ flex: 1 }}
        data={activeTab === 'requests' ? requests : assignmentRequests}
        keyExtractor={(item) => item.id.toString()}
        contentContainerStyle={{ padding: inShell ? 0 : 24, paddingTop: 8, paddingBottom: 40 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#2563eb']} />
        }
        ListEmptyComponent={
          <View style={{ backgroundColor: '#ffffff', padding: 32, borderRadius: 24, borderWidth: 1.5, borderColor: THEME.cardBorder, shadowColor: THEME.shadow, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.06, shadowRadius: 16, elevation: 3, alignItems: 'center', justifyContent: 'center', marginTop: 8 }}>
            <View style={{ width: 68, height: 68, borderRadius: 34, backgroundColor: THEME.soft, ...gradient(THEME.heroGradient), borderWidth: 1, borderColor: THEME.softBorder, alignItems: 'center', justifyContent: 'center' }}>
              <Feather name="inbox" size={28} color={THEME.accentText} />
            </View>
            <Text style={{ fontFamily: 'Roboto', fontSize: 16, fontWeight: '900', color: '#0f172a', marginTop: 12 }}>
              {activeTab === 'requests' ? t('no_requests_found') : 'No assignments found'}
            </Text>
            <Text style={{ fontFamily: 'Roboto', fontSize: 12, color: '#64748b', marginTop: 4, textAlign: 'center' }}>
              {activeTab === 'requests' ? t('no_requests_desc') : 'Request a helper to write or complete assignments for you.'}
            </Text>
            <TouchableOpacity
              onPress={() => {
                if (activeTab === 'requests') {
                  router.push('/console/student/request_form' as any);
                } else {
                  router.push('/console/student/assignment_form' as any);
                }
              }}
              style={{ marginTop: 16, backgroundColor: '#2563eb', ...gradient(THEME.buttonGradient), flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 11, paddingHorizontal: 20, borderRadius: 12, shadowColor: THEME.shadow, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 8, elevation: 3 }}
            >
              <Feather name="plus" size={14} color="#ffffff" />
              <Text style={{ fontFamily: 'Roboto', color: '#fff', fontWeight: '800', fontSize: 12.5 }}>
                {activeTab === 'requests' ? 'Create Request' : 'Create Assignment'}
              </Text>
            </TouchableOpacity>
          </View>
        }
        renderItem={(info) => <DesktopCell columns={columns}>{(({ item, index }) => {
          // Assignments use their own card renderer; everything below builds the exam card.
          if (activeTab === 'assignments') {
            return renderAssignmentCard(item, index);
          }
          // Derived flags: hasApps = still pending with at least one applicant; isEmergency = SOS raised.
          const hasApps = item.status === 'pending' && (item.applicationCount || 0) > 0;
          const isEmergency = item.is_emergency === 'yes';
          const isMatched = item.status === 'matched';

          // Badge text and colours per status (an SOS overrides the status label).
          const statusLabel = (() => {
            if (isEmergency) return 'EMERGENCY SOS';
            switch (item.status.toLowerCase()) {
              case 'pending': return 'NOT ASSIGNED';
              case 'matched': return 'ASSIGNED';
              case 'completed': return 'COMPLETED';
              case 'cancelled': return 'CANCELLED';
              default: return item.status.toUpperCase();
            }
          })();

          const statusColor = (() => {
            if (isEmergency) {
              return { text: '#dc2626', border: '#fca5a5', bg: '#fef2f2' };
            }
            switch (item.status.toLowerCase()) {
              case 'pending': return { text: '#2563eb', border: '#bfdbfe', bg: '#eff6ff' };
              case 'matched': return { text: '#059669', border: '#a7f3d0', bg: '#f0fdf4' };
              case 'completed': return { text: '#10b981', border: '#a7f3d0', bg: '#ecfdf5' };
              case 'cancelled': return { text: '#ef4444', border: '#fca5a5', bg: '#fff7f7' };
              default: return { text: '#2563eb', border: '#bfdbfe', bg: '#eff6ff' };
            }
          })();

          // Exam-day check (date part of exam_date vs today's UTC date); gates the SOS button.
          const isToday = item.exam_date && item.exam_date.split('|')[0].trim() === new Date().toISOString().split('T')[0];
          
          // Manual SOS: flag the request as an emergency and send a `notifications` row to every scribe
          // who opted into urgent calls (`profiles.urgent_calls = 'yes'`).
          const handleSOS = async () => {
            if (item.is_emergency === 'yes') {
              Alert.alert("SOS Already Sent", "You have already notified emergency scribes for this request.");
              return;
            }
            
            Alert.alert(
              'Trigger Emergency SOS',
              'This will notify all available emergency scribes immediately. Are you sure?',
              [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Confirm SOS', style: 'destructive',
                  onPress: async () => {
                    try {
                      // Update request
                      await supabase.from('exam_requests').update({ is_emergency: 'yes' }).eq('id', item.id);
                      
                      // Get emergency scribes
                      const { data: scribes } = await supabase.from('profiles').select('id').eq('role', 'scribe').eq('urgent_calls', 'yes');
                      
                      if (scribes && scribes.length > 0) {
                        const notifications = scribes.map((s: any) => ({
                          user_id: s.id,
                          title: '🚨 Emergency Scribe Needed!',
                          message: `[Emergency Request] A student needs an emergency scribe for "${item.subject}" TODAY at ${item.exam_venue}! Open the app to accept immediately.`,
                          is_read: 0,
                          created_at: new Date().toISOString()
                        }));
                        await supabase.from('notifications').insert(notifications);
                      }
                      
                      Alert.alert("SOS Alert Sent!", "All registered emergency scribes have been notified.");
                      fetchRequests();
                    } catch (e: any) {
                      Alert.alert("Error", e.message || "Failed to trigger SOS");
                    }
                  }
                }
              ]
            );
          };

          // Cancel & delete: notify the matched scribe (if any), delete the request, then its applications.
          const handleDelete = () => {
            Alert.alert(
              'Cancel & Delete Exam Request',
              'Are you sure you want to cancel and delete this exam request? This action cannot be undone.',
              [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Delete Request', style: 'destructive',
                  onPress: async () => {
                    if (item.scribe_id) {
                      await supabase.from('notifications').insert({
                        user_id: item.scribe_id,
                        title: 'Request Cancelled',
                        message: `The student has cancelled their exam request for "${item.subject || item.exam_type}".`,
                        is_read: 0,
                        created_at: new Date().toISOString()
                      });
                    }
                    await supabase.from('exam_requests').delete().eq('id', item.id);
                    await supabase.from('scribe_applications').delete().eq('request_id', item.id);
                    fetchRequests();
                  }
                }
              ]
            );
          };

          // Un-match: reset the request to pending with no scribe, reject that scribe's application and
          // notify them, so other scribes can apply again.
          const handleUnmatchScribe = () => {
            Alert.alert(
              'Un-match Scribe',
              `Are you sure you want to un-match ${item.scribeProfile?.full_name || 'this scribe'}? The request will return to pending status so other scribes can apply.`,
              [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Un-match Scribe',
                  style: 'destructive',
                  onPress: async () => {
                    const oldScribeId = item.scribe_id;
                    await supabase
                      .from('exam_requests')
                      .update({ status: 'pending', scribe_id: null })
                      .eq('id', item.id);

                    if (oldScribeId) {
                      await supabase
                        .from('scribe_applications')
                        .update({ status: 'rejected' })
                        .eq('request_id', item.id)
                        .eq('scribe_id', oldScribeId);

                      await supabase.from('notifications').insert({
                        user_id: oldScribeId,
                        title: 'Match Cancelled',
                        message: `The student has un-matched you for "${item.subject || item.exam_type}". The request is now open for new applications.`,
                        is_read: 0,
                        created_at: new Date().toISOString()
                      });
                    }
                    Alert.alert('Scribe Un-matched', 'The request has been reset to pending.');
                    fetchRequests();
                  }
                }
              ]
            );
          };

          const isExpanded = expandedCards[item.id] || false;

          // Card Border & Shadow Colors based on status
          let cardBorderColor = '#bfdbfe';
          let cardShadowColor = '#2563eb';
          let cardBorderWidth = 1.5;
          let cardShadowOpacity = 0.12;

          if (isEmergency) {
            cardBorderColor = '#fca5a5';
            cardShadowColor = '#dc2626';
            cardBorderWidth = 2;
            cardShadowOpacity = 0.15;
          } else if (isMatched) {
            cardBorderColor = '#a7f3d0';
            cardShadowColor = '#059669';
            cardBorderWidth = 1.5;
            cardShadowOpacity = 0.12;
          } else {
            // Not Assigned / Pending
            cardBorderColor = '#bfdbfe';
            cardShadowColor = '#2563eb';
            cardBorderWidth = 1.5;
            cardShadowOpacity = 0.12;
          }

          return (
            <Animated.View entering={rise(index + 1)} style={{
              backgroundColor: '#fff',
              borderRadius: 24,
              borderWidth: cardBorderWidth,
              borderColor: cardBorderColor,
              shadowColor: cardShadowColor,
              shadowOffset: { width: 0, height: 6 },
              shadowOpacity: cardShadowOpacity,
              shadowRadius: 16,
              elevation: 4,
              marginBottom: 16,
              overflow: 'hidden',
            }}>

              {/* Status accent strip (matches the status badge colour) */}
              <View style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 4, zIndex: 1, backgroundColor: statusColor.text }} />

              {/* ── Top section: Title & Subtitle on Left, Status Badge on Right ── */}
              <TouchableOpacity onPress={() => toggleCard(item.id)} activeOpacity={0.85} style={{ padding: 18, paddingBottom: 14 }}>
                <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                  <View style={{ flex: 1, marginRight: 10 }}>
                    <Text style={{ fontFamily: 'Roboto', fontSize: 16, fontWeight: '900', color: '#0f172a', letterSpacing: -0.3 }}>
                      {item.subject || 'Exam'}
                    </Text>
                    <Text style={{ fontFamily: 'Roboto', fontSize: 11, color: '#64748b', marginTop: 3 }}>
                      Level: {item.exam_type || 'General'} {item.created_at ? `| Confirmed ${new Date(item.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}` : ''}
                    </Text>
                  </View>

                  {/* Status Badge */}
                  <View style={{
                    paddingVertical: 5, paddingHorizontal: 11, borderRadius: 20,
                    backgroundColor: statusColor.bg,
                    borderWidth: 1, borderColor: statusColor.border
                  }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      {isEmergency && <Feather name="alert-triangle" size={10} color={statusColor.text} />}
                      <Text style={{ fontFamily: 'Roboto', color: statusColor.text, fontSize: 9.5, fontWeight: '800', letterSpacing: 0.3 }}>
                        {statusLabel}
                      </Text>
                    </View>
                  </View>
                </View>

                {/* ── Summary Row: Divider + Date on Left + "Details v" Pill Button on Right ── */}
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#f1f5f9' }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, gap: 10 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                      <Feather name="calendar" size={13} color="#f97316" style={{ marginRight: 6 }} />
                      <Text style={{ fontFamily: 'Roboto', fontSize: 12, fontWeight: '700', color: '#334155' }}>
                        {item.exam_date ? item.exam_date.split(' ')[0] : t('date_not_specified')}
                      </Text>
                    </View>

                    {/* Applications Badge */}
                    {hasApps && (
                      <TouchableOpacity
                        onPress={() => router.push(`/console/student/view_applications?id=${item.id}` as any)}
                        style={{ backgroundColor: '#eff6ff', borderWidth: 1, borderColor: '#bfdbfe', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3 }}
                      >
                        <Text style={{ fontFamily: 'Roboto', fontSize: 10, fontWeight: '800', color: '#2563eb' }}>
                          {item.applicationCount} {item.applicationCount === 1 ? 'Applicant' : 'Applicants'}
                        </Text>
                      </TouchableOpacity>
                    )}
                  </View>

                  {/* "Details v" Pill Button */}
                  <View style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    backgroundColor: isExpanded ? 'rgba(37,99,235,0.14)' : THEME.soft,
                    borderWidth: 1,
                    borderColor: isExpanded ? 'rgba(37,99,235,0.3)' : THEME.softBorder,
                    paddingHorizontal: 11,
                    paddingVertical: 5,
                    borderRadius: 12,
                    gap: 5
                  }}>
                    <Text style={{ fontFamily: 'Roboto', fontSize: 11.5, fontWeight: '800', color: THEME.accentText }}>
                      {isExpanded ? 'Collapse' : 'Details'}
                    </Text>
                    <Feather name={isExpanded ? "chevron-up" : "chevron-down"} size={14} color={THEME.accentText} />
                  </View>
                </View>
              </TouchableOpacity>

              {/* ── Expanded Content ── */}
              {isExpanded && (
                <View>
                  {/* ── Divider ── */}
                  <View style={{ height: 1, backgroundColor: '#f1f5f9', marginHorizontal: 18 }} />

              {/* ── Exam Center block ── */}
              <View style={{ paddingHorizontal: 18, paddingVertical: 14 }}>
                <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
                  <Feather name="map-pin" size={18} color="#ef4444" style={{ marginTop: 1 }} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontFamily: 'Roboto', fontSize: 14, fontWeight: '900', color: '#0f172a' }}>
                      Exam Center
                    </Text>
                    <Text style={{ fontFamily: 'Roboto', fontSize: 12, color: '#64748b', marginTop: 2 }} numberOfLines={2}>
                      {item.exam_venue || t('venue_not_specified')}
                    </Text>
                  </View>
                </View>

                {/* Matched Scribe block */}
                {isMatched && item.scribeProfile && (
                  <View style={{
                    marginTop: 10, backgroundColor: 'rgba(5,150,105,0.07)',
                    borderRadius: 14, padding: 12,
                    borderWidth: 1, borderColor: 'rgba(5,150,105,0.2)',
                    flexDirection: 'row', alignItems: 'center', gap: 10,
                  }}>
                    <View style={{
                      width: 36, height: 36, borderRadius: 10,
                      backgroundColor: 'rgba(5,150,105,0.12)',
                      alignItems: 'center', justifyContent: 'center',
                    }}>
                      <Text style={{ fontFamily: 'Roboto', fontSize: 16, fontWeight: '900', color: '#059669' }}>
                        {item.scribeProfile.full_name?.charAt(0)?.toUpperCase() ?? 'S'}
                      </Text>
                    </View>
                    <View>
                      <Text style={{ fontFamily: 'Roboto', fontSize: 13, fontWeight: '900', color: '#047857' }}>
                        {item.scribeProfile.full_name}
                      </Text>
                      <Text style={{ fontFamily: 'Roboto', fontSize: 11, color: '#064e3b' }}>Volunteer Scribe · Assigned</Text>
                    </View>
                  </View>
                )}
              </View>

              {/* ── Action Buttons ── */}
              <View style={{ paddingHorizontal: 18, paddingBottom: 18, gap: 10 }}>

                {/* View Scribes — only when pending */}
                {item.status === 'pending' && (
                  <>
                    {/* SOS button, shown only on the exam day */}
                    {isToday && (
                      <TouchableOpacity
                        onPress={handleSOS}
                        style={{
                          backgroundColor: item.is_emergency === 'yes' ? '#fca5a5' : '#ef4444',
                          borderRadius: 14, paddingVertical: 14,
                          flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
                          shadowColor: '#ef4444', shadowOffset: { width: 0, height: 6 },
                          shadowOpacity: 0.25, shadowRadius: 12, elevation: 5,
                        }}
                        activeOpacity={0.85}
                      >
                        <Feather name="alert-triangle" size={18} color="#fff" />
                        <Text style={{ fontFamily: 'Roboto', fontSize: 15, fontWeight: '900', color: '#fff', letterSpacing: 0.2 }}>
                          {item.is_emergency === 'yes' ? 'SOS Triggered' : '🚨 Call SOS Emergency Scribe'}
                        </Text>
                      </TouchableOpacity>
                    )}
                    {/* Find & Invite Scribes directly to this exam */}
                    <TouchableOpacity
                      onPress={() => {
                        setPreSelectedScribeReq({ id: item.id, type: 'exam', subject: item.subject });
                        setShowScribeDirectory(true);
                      }}
                      style={{
                        backgroundColor: '#2563eb',
                        borderRadius: 14, paddingVertical: 12,
                        flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
                        shadowColor: '#2563eb', shadowOffset: { width: 0, height: 4 },
                        shadowOpacity: 0.18, shadowRadius: 10, elevation: 4,
                      }}
                      activeOpacity={0.85}
                    >
                      <Feather name="search" size={16} color="#fff" />
                      <Text style={{ fontFamily: 'Roboto', fontSize: 14, fontWeight: '900', color: '#fff' }}>
                        Find & Invite Scribes
                      </Text>
                    </TouchableOpacity>
                    {/* Opens the applicants list for this request */}
                    <TouchableOpacity
                      onPress={() => router.push(`/console/student/view_applications?id=${item.id}` as any)}
                      style={{
                        backgroundColor: '#eff6ff',
                        borderRadius: 14, paddingVertical: 12,
                        flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
                        borderWidth: 1.5, borderColor: '#bfdbfe',
                      }}
                      activeOpacity={0.85}
                    >
                      <Feather name="users" size={16} color="#2563eb" />
                      <Text style={{ fontFamily: 'Roboto', fontSize: 14, fontWeight: '900', color: '#2563eb', letterSpacing: 0.2 }}>
                        View Applications ({item.applicationCount ?? 0})
                      </Text>
                    </TouchableOpacity>
                  </>
                )}

                {/* Matched actions (2x2 Compact Grid) */}
                {isMatched ? (
                  <View style={{ gap: 10, marginTop: 4 }}>
                    {/* Row 1: Call Scribe + Chat */}
                    <View style={{ flexDirection: 'row', gap: 10 }}>
                      <TouchableOpacity
                        onPress={() => openCallSheet(item)}
                        style={{
                          flex: 1, backgroundColor: '#2563eb',
                          borderRadius: 12, paddingVertical: 11,
                          flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
                          shadowColor: '#2563eb', shadowOffset: { width: 0, height: 4 },
                          shadowOpacity: 0.15, shadowRadius: 8, elevation: 3,
                        }}
                        activeOpacity={0.85}
                      >
                        <Feather name="phone-call" size={15} color="#fff" />
                        <Text style={{ fontFamily: 'Roboto', fontSize: 13, fontWeight: '800', color: '#fff' }}>
                          Call Scribe
                        </Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        onPress={() => router.push(`/console/common/chat?requestId=${item.id}` as any)}
                        style={{
                          flex: 1, paddingVertical: 11,
                          borderRadius: 12, borderWidth: 1.5,
                          borderColor: '#bfdbfe',
                          backgroundColor: '#eff6ff',
                          flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
                        }}
                        activeOpacity={0.7}
                      >
                        <Feather name="message-square" size={15} color="#2563eb" />
                        <Text style={{ fontFamily: 'Roboto', fontSize: 13, fontWeight: '800', color: '#2563eb' }}>
                          Chat
                        </Text>
                      </TouchableOpacity>
                    </View>

                    {/* Row 2: Mark Completed + View Details */}
                    <View style={{ flexDirection: 'row', gap: 10 }}>
                      <TouchableOpacity
                        onPress={() => openRatingModal(item)}
                        style={{
                          flex: 1, backgroundColor: '#10b981',
                          borderRadius: 12, paddingVertical: 11,
                          flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
                          shadowColor: '#10b981', shadowOffset: { width: 0, height: 4 },
                          shadowOpacity: 0.15, shadowRadius: 8, elevation: 3,
                        }}
                        activeOpacity={0.85}
                      >
                        <Feather name="check-circle" size={15} color="#fff" />
                        <Text style={{ fontFamily: 'Roboto', fontSize: 13, fontWeight: '800', color: '#fff' }}>
                          Mark Completed
                        </Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        onPress={() => {
                          setSelectedExam(item);
                          setIsDeclarationOpen(true);
                        }}
                        style={{
                          flex: 1, paddingVertical: 11,
                          borderRadius: 12, borderWidth: 1.5,
                          borderColor: '#2563eb',
                          alignItems: 'center', justifyContent: 'center',
                        }}
                        activeOpacity={0.7}
                      >
                        <Text style={{ fontFamily: 'Roboto', fontSize: 13, fontWeight: '800', color: '#2563eb' }}>
                          View Details
                        </Text>
                      </TouchableOpacity>
                    </View>

                    {/* Row 3: Un-match Scribe + Cancel Request */}
                    <View style={{ flexDirection: 'row', gap: 10, marginTop: 4 }}>
                      <TouchableOpacity
                        onPress={handleUnmatchScribe}
                        style={{
                          flex: 1, paddingVertical: 10,
                          borderRadius: 12, borderWidth: 1.5,
                          borderColor: '#f97316', backgroundColor: '#fff7ed',
                          alignItems: 'center', justifyContent: 'center',
                        }}
                        activeOpacity={0.7}
                      >
                        <Text style={{ fontFamily: 'Roboto', fontSize: 12, fontWeight: '800', color: '#ea580c' }}>
                          Un-match Scribe
                        </Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        onPress={handleDelete}
                        style={{
                          flex: 1, paddingVertical: 10,
                          borderRadius: 12, borderWidth: 1.5,
                          borderColor: '#fca5a5', backgroundColor: '#fff7f7',
                          alignItems: 'center', justifyContent: 'center',
                        }}
                        activeOpacity={0.7}
                      >
                        <Text style={{ fontFamily: 'Roboto', fontSize: 12, fontWeight: '800', color: '#ef4444' }}>
                          Cancel Request
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ) : (
                  /* Original Unmatched Flow */
                  <View style={{ gap: 10 }}>
                    {/* Bottom row: View Details + Delete */}
                    <View style={{ flexDirection: 'row', gap: 10 }}>
                      {/* View Details */}
                      <TouchableOpacity
                        onPress={() => {
                          router.push(`/console/student/request_form?id=${item.id}` as any);
                        }}
                        style={{
                          flex: 1, paddingVertical: 13,
                          borderRadius: 14, borderWidth: 1.5,
                          borderColor: '#2563eb',
                          alignItems: 'center', justifyContent: 'center',
                        }}
                        activeOpacity={0.7}
                      >
                        <Text style={{ fontFamily: 'Roboto', fontSize: 13, fontWeight: '800', color: '#2563eb' }}>
                          View Details
                        </Text>
                      </TouchableOpacity>

                      {/* Delete Exam */}
                      <TouchableOpacity
                        onPress={handleDelete}
                        style={{
                          flex: 1, paddingVertical: 13,
                          borderRadius: 14, borderWidth: 1.5,
                          borderColor: '#fca5a5',
                          backgroundColor: '#fff7f7',
                          alignItems: 'center', justifyContent: 'center',
                        }}
                        activeOpacity={0.7}
                      >
                        <Text style={{ fontFamily: 'Roboto', fontSize: 13, fontWeight: '800', color: '#ef4444' }}>
                          Delete Exam
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                )}
              </View>
                </View>
              )}
            </Animated.View>
          );
        })(info)}</DesktopCell>}
      />
      ) : (
        // Past Scribes sub-tab: search + one card per scribe (components/student/PastScribesList)
        <PastScribesList scribes={pastScribes} onViewProfile={handleOpenScribeProfile} onInvite={openInviteModal} />
      )}

      {/* FORMAL SCRIBE DECLARATION MODAL */}
      {/* Opened by "View Details" on a matched exam: a declaration letter naming the student and scribe.
          The Download button only shows an alert for now. */}
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
              <Text style={{ fontFamily: 'Roboto', fontSize: 13, fontWeight: '800', color: '#0f172a', textTransform: 'uppercase' }}>{t('scribe_declaration')}</Text>
              <TouchableOpacity onPress={() => setIsDeclarationOpen(false)} style={{ padding: 4 }}>
                <Feather name="x" size={18} color="#64748b" />
              </TouchableOpacity>
            </View>

            {/* Declaration Content */}
            <ScrollView style={{ maxHeight: 380 }} contentContainerStyle={{ padding: 20, gap: 14 }}>
              <View style={{ alignItems: 'center', marginBottom: 6 }}>
                <Text style={{ fontFamily: 'Roboto', fontWeight: '900', fontSize: 20, color: '#2563eb' }}>Anulekh Portal</Text>
                <Text style={{ fontFamily: 'Roboto', fontSize: 9, color: '#64748b', textTransform: 'uppercase', letterSpacing: 1.5, marginTop: 2 }}>{t('official_cert_letter')}</Text>
              </View>

              {/* 1. Exam Details */}
              <View style={{ backgroundColor: '#f8fafc', padding: 12, borderRadius: 16, borderWidth: 1, borderColor: '#e2e8f0', gap: 4 }}>
                <Text style={{ fontFamily: 'Roboto', fontSize: 9, fontWeight: '800', color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 }}>{t('exam_details')}</Text>
                <Text style={{ fontFamily: 'Roboto', fontSize: 12, color: '#334155', fontWeight: '700' }}>વિષય: {selectedExam?.subject}</Text>
                <Text style={{ fontFamily: 'Roboto', fontSize: 11, color: '#475569' }}>{t('exam_level')}: {selectedExam?.exam_type}</Text>
                <Text style={{ fontFamily: 'Roboto', fontSize: 11, color: '#475569' }}>તારીખ: {selectedExam?.exam_date}</Text>
                <Text style={{ fontFamily: 'Roboto', fontSize: 11, color: '#475569' }}>સ્થળ: {selectedExam?.exam_venue}</Text>
              </View>

              {/* 2. Candidate & Scribe Details */}
              <View style={{ gap: 10 }}>
                <View>
                  <Text style={{ fontFamily: 'Roboto', fontSize: 9, fontWeight: '800', color: '#64748b', textTransform: 'uppercase', marginBottom: 2 }}>{t('candidate_student')}</Text>
                  <Text style={{ fontFamily: 'Roboto', fontSize: 12, color: '#0f172a', fontWeight: '800' }}>{studentProfile?.full_name}</Text>
                  <Text style={{ fontFamily: 'Roboto', fontSize: 10, color: '#64748b', marginTop: 1 }}>ધોરણ: {selectedExam?.education_grade}</Text>
                  <Text style={{ fontFamily: 'Roboto', fontSize: 10, color: '#64748b' }}>આધાર ID: ચકાસાયેલ</Text>
                </View>

                <View style={{ height: 1, backgroundColor: '#f1f5f9' }} />

                <View>
                  <Text style={{ fontFamily: 'Roboto', fontSize: 9, fontWeight: '800', color: '#64748b', textTransform: 'uppercase', marginBottom: 2 }}>{t('volunteer_scribe')}</Text>
                  <Text style={{ fontFamily: 'Roboto', fontSize: 12, color: '#0f172a', fontWeight: '800' }}>{selectedExam?.scribeProfile?.full_name || t('volunteer_scribe')}</Text>
                  <Text style={{ fontFamily: 'Roboto', fontSize: 10, color: '#64748b', marginTop: 1 }}>{t('occupation_label')}{selectedExam?.scribeProfile?.occupation || t('student_scribe_fallback')}</Text>
                </View>
              </View>

              {/* 3. Formal Declaration Text */}
              <View style={{ backgroundColor: 'rgba(37,99,235,0.05)', borderWidth: 1, borderColor: 'rgba(37,99,235,0.18)', padding: 12, borderRadius: 16, marginTop: 4 }}>
                <Text style={{ fontFamily: 'Roboto', fontSize: 10, color: '#1d4ed8', lineHeight: 16, fontStyle: 'italic', textAlign: 'center' }}>
                  {t('declaration_agreement_text')}
                </Text>
              </View>

              {/* 4. Verification Stamp */}
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 4 }}>
                <View>
                  <Text style={{ fontFamily: 'Roboto', fontSize: 8, fontWeight: '800', color: '#64748b', textTransform: 'uppercase' }}>{t('status')}</Text>
                  <Text style={{ fontFamily: 'Roboto', fontSize: 10, color: '#059669', fontWeight: '800', marginTop: 2 }}>{t('verified_scribe_badge')}</Text>
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
                style={{ flex: 1, backgroundColor: '#2563eb', paddingVertical: 11, borderRadius: 12, alignItems: 'center', shadowColor: '#2563eb', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 8, elevation: 3 }}
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
      {/* Opened by openCallSheet on the exam day; the number stays hidden until "View number" is tapped */}
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
                backgroundColor: 'rgba(37,99,235,0.09)', borderWidth: 1, borderColor: 'rgba(37,99,235,0.22)',
                alignItems: 'center', justifyContent: 'center',
              }}>
                <Feather name="phone" size={16} color="#2563eb" />
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
            backgroundColor: 'rgba(37,99,235,0.09)', borderWidth: 1, borderColor: 'rgba(37,99,235,0.22)',
            borderRadius: 20, padding: 20,
          }}>
            {/* Avatar + name */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 16 }}>
              <View style={{
                width: 54, height: 54, borderRadius: 16,
                backgroundColor: 'rgba(37,99,235,0.15)',
                borderWidth: 2, borderColor: 'rgba(37,99,235,0.22)',
                alignItems: 'center', justifyContent: 'center',
              }}>
                <Text style={{ fontFamily: 'Roboto', fontSize: 22, fontWeight: '900', color: '#2563eb' }}>
                  {callExam?.scribeProfile?.full_name?.charAt(0)?.toUpperCase() ?? 'S'}
                </Text>
              </View>
              <View>
                <Text style={{ fontFamily: 'Roboto', fontSize: 17, fontWeight: '900', color: '#0f172a' }}>
                  {callExam?.scribeProfile?.full_name ?? 'લખિયો'}
                </Text>
                <View style={{
                  marginTop: 4, backgroundColor: 'rgba(37,99,235,0.09)',
                  borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3,
                  alignSelf: 'flex-start', borderWidth: 1, borderColor: 'rgba(37,99,235,0.22)',
                }}>
                  <Text style={{ fontFamily: 'Roboto', color: '#2563eb', fontSize: 10, fontWeight: '800' }}>VOLUNTEER SCRIBE</Text>
                </View>
              </View>
            </View>

            {/* Phone number display */}
            {showMaskedNumber ? (
              <View style={{
                backgroundColor: '#fff',
                borderRadius: 14, paddingVertical: 14, paddingHorizontal: 18,
                flexDirection: 'row', alignItems: 'center', gap: 12,
                borderWidth: 1, borderColor: 'rgba(37,99,235,0.22)',
              }}>
                <Feather name="phone" size={18} color="#2563eb" />
                {/* Falls back to a placeholder number when the scribe has no phone on file */}
                <Text style={{ fontFamily: 'Roboto', fontSize: 20, fontWeight: '900', color: '#0f172a', letterSpacing: 1.5 }}>
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
                  borderWidth: 1, borderColor: 'rgba(37,99,235,0.22)',
                  borderStyle: 'dashed'
                }}
              >
                <Feather name="eye" size={16} color="#2563eb" />
                <Text style={{ fontFamily: 'Roboto', fontSize: 14, fontWeight: '800', color: '#2563eb' }}>{t('view_number')}</Text>
              </TouchableOpacity>
            )}

            {/* Exam context */}
            <Text style={{ fontFamily: 'Roboto', fontSize: 11, color: '#64748b', marginTop: 10, textAlign: 'center' }}>
              વિષય: <Text style={{ fontWeight: '700', color: '#0f172a' }}>{callExam?.subject}</Text> પરીક્ષાના સ્વયંસેવક
            </Text>
          </View>

          {/* Dial Now CTA */}
          <TouchableOpacity
            onPress={async () => {
              const url = `tel:${callExam?.scribeProfile?.phone || '9876543210'}`;
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
              backgroundColor: '#2563eb',
              borderRadius: 18, paddingVertical: 16, marginTop: 16,
              flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
              shadowColor: '#2563eb', shadowOffset: { width: 0, height: 10 },
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

      {/* ═══════════════════════════════════════════════════
          RATING / FEEDBACK MODAL
      ═══════════════════════════════════════════════════ */}
      {/* Five 1-5 star scores plus a remark; submitting calls submitRating (review + mark completed) */}
      <Modal
        animationType="slide"
        transparent
        visible={isRatingOpen}
        onRequestClose={() => setIsRatingOpen(false)}
      >
        <View style={{ flex: 1, backgroundColor: 'rgba(15,23,42,0.5)', justifyContent: 'center', alignItems: 'center', paddingHorizontal: 20 }}>
          <View style={{ backgroundColor: '#fff', width: '100%', maxWidth: 380, borderRadius: 28, padding: 24, shadowColor: '#000', shadowOffset: { width: 0, height: 20 }, shadowOpacity: 0.15, shadowRadius: 30, elevation: 15 }}>
            {/* Title + close */}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <Text style={{ fontFamily: 'Roboto', fontSize: 18, fontWeight: '900', color: '#0f172a' }}>Rate your Scribe</Text>
              <TouchableOpacity onPress={() => setIsRatingOpen(false)} style={{ padding: 4 }}>
                <Feather name="x" size={20} color="#64748b" />
              </TouchableOpacity>
            </View>

            {/* Scrollable star rows and remark box */}
            <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 400 }} contentContainerStyle={{ paddingBottom: 10 }}>
              
              <Text style={{ fontFamily: 'Roboto', fontSize: 12, color: '#64748b', marginBottom: 12 }}>
                Please provide feedback for <Text style={{ fontWeight: '700', color: '#0f172a' }}>{ratingExam?.scribeProfile?.full_name || 'Volunteer Scribe'}</Text> across 5 fields.
              </Text>

              {/* 1. Punctuality */}
              <View style={{ marginVertical: 6 }}>
                <Text style={{ fontFamily: 'Roboto', fontSize: 11, fontWeight: '800', color: '#475569', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>1. Punctuality (Time Management)</Text>
                <View style={{ flexDirection: 'row', gap: 6 }}>
                  {[1, 2, 3, 4, 5].map((star) => (
                    <TouchableOpacity key={star} onPress={() => setRatingPunctuality(star)}>
                      <Ionicons name={star <= ratingPunctuality ? 'star' : 'star-outline'} size={24} color={star <= ratingPunctuality ? '#eab308' : '#cbd5e1'} />
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {/* 2. Communication */}
              <View style={{ marginVertical: 6 }}>
                <Text style={{ fontFamily: 'Roboto', fontSize: 11, fontWeight: '800', color: '#475569', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>2. Communication (Interaction)</Text>
                <View style={{ flexDirection: 'row', gap: 6 }}>
                  {[1, 2, 3, 4, 5].map((star) => (
                    <TouchableOpacity key={star} onPress={() => setRatingCommunication(star)}>
                      <Ionicons name={star <= ratingCommunication ? 'star' : 'star-outline'} size={24} color={star <= ratingCommunication ? '#eab308' : '#cbd5e1'} />
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {/* 3. Writing Speed */}
              <View style={{ marginVertical: 6 }}>
                <Text style={{ fontFamily: 'Roboto', fontSize: 11, fontWeight: '800', color: '#475569', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>3. Scribing Speed & Accuracy</Text>
                <View style={{ flexDirection: 'row', gap: 6 }}>
                  {[1, 2, 3, 4, 5].map((star) => (
                    <TouchableOpacity key={star} onPress={() => setRatingSpeed(star)}>
                      <Ionicons name={star <= ratingSpeed ? 'star' : 'star-outline'} size={24} color={star <= ratingSpeed ? '#eab308' : '#cbd5e1'} />
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {/* 4. Behavior */}
              <View style={{ marginVertical: 6 }}>
                <Text style={{ fontFamily: 'Roboto', fontSize: 11, fontWeight: '800', color: '#475569', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>4. Conduct & Behavior</Text>
                <View style={{ flexDirection: 'row', gap: 6 }}>
                  {[1, 2, 3, 4, 5].map((star) => (
                    <TouchableOpacity key={star} onPress={() => setRatingBehavior(star)}>
                      <Ionicons name={star <= ratingBehavior ? 'star' : 'star-outline'} size={24} color={star <= ratingBehavior ? '#eab308' : '#cbd5e1'} />
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {/* 5. Overall */}
              <View style={{ marginVertical: 6 }}>
                <Text style={{ fontFamily: 'Roboto', fontSize: 11, fontWeight: '800', color: '#475569', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>5. Overall Experience</Text>
                <View style={{ flexDirection: 'row', gap: 6 }}>
                  {[1, 2, 3, 4, 5].map((star) => (
                    <TouchableOpacity key={star} onPress={() => setRatingOverall(star)}>
                      <Ionicons name={star <= ratingOverall ? 'star' : 'star-outline'} size={24} color={star <= ratingOverall ? '#eab308' : '#cbd5e1'} />
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {/* Remark */}
              <View style={{ marginVertical: 8 }}>
                <Text style={{ fontFamily: 'Roboto', fontSize: 11, fontWeight: '800', color: '#475569', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>Remarks & Feedback</Text>
                <TextInput
                  value={remark}
                  onChangeText={setRemark}
                  placeholder="Write a brief review about your experience with this scribe..."
                  multiline
                  numberOfLines={4}
                  style={{
                    width: '100%',
                    backgroundColor: '#f8fafc',
                    borderWidth: 1.5,
                    borderColor: '#e2e8f0',
                    borderRadius: 14,
                    paddingHorizontal: 12,
                    paddingVertical: 10,
                    fontSize: 13,
                    color: '#0f172a',
                    minHeight: 80,
                    textAlignVertical: 'top'
                  }}
                />
              </View>
            </ScrollView>

            {/* Submit button (spinner while saving) */}
            <View style={{ marginTop: 14 }}>
              <TouchableOpacity
                onPress={submitRating}
                disabled={submittingRating}
                style={{
                  backgroundColor: '#10b981',
                  borderRadius: 16,
                  paddingVertical: 14,
                  alignItems: 'center',
                  justifyContent: 'center',
                  shadowColor: '#10b981',
                  shadowOffset: { width: 0, height: 6 },
                  shadowOpacity: 0.2,
                  shadowRadius: 10,
                  elevation: 4
                }}
              >
                {submittingRating ? (
                  <ActivityIndicator color="white" size="small" />
                ) : (
                  <Text style={{ fontFamily: 'Roboto', fontSize: 14, fontWeight: '900', color: '#fff' }}>Submit & Mark Complete</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* PRIVATE INVITATION MODAL */}
      {/* Lists the student's pending exam requests without a private invite; tapping one sends the invite */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={inviteModalVisible}
        onRequestClose={() => setInviteModalVisible(false)}
      >
        <View style={{ flex: 1, backgroundColor: 'rgba(15,23,42,0.6)', justifyContent: 'center', alignItems: 'center', paddingHorizontal: 20 }}>
          <View style={{ backgroundColor: '#fff', width: '100%', maxWidth: 350, borderRadius: 28, padding: 24, shadowColor: '#000', shadowOffset: { width: 0, height: 20 }, shadowOpacity: 0.15, shadowRadius: 30, elevation: 15, borderWidth: 1, borderColor: 'rgba(0,0,0,0.05)' }}>
            
            {/* Icon, title and the target scribe's name */}
            <View style={{ alignItems: 'center', marginBottom: 16 }}>
              <View style={{ width: 48, height: 48, borderRadius: 16, backgroundColor: 'rgba(37,99,235,0.09)', alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
                <Feather name="mail" size={22} color="#2563eb" />
              </View>
              <Text style={{ fontFamily: 'Roboto', fontSize: 18, fontWeight: '900', color: '#0f172a', textAlign: 'center' }}>Invite Privately</Text>
              <Text style={{ fontFamily: 'Roboto', fontSize: 12, color: '#64748b', textAlign: 'center', marginTop: 4 }}>
                Select an exam request to invite <Text style={{ fontWeight: '700', color: '#0f172a' }}>{inviteTargetScribe?.full_name || inviteTargetScribe?.official_name}</Text> privately:
              </Text>
            </View>

            {/* Eligible requests, or a notice when there are none */}
            <ScrollView style={{ maxHeight: 200 }} contentContainerStyle={{ gap: 8 }} showsVerticalScrollIndicator={false}>
              {requests.filter(r => r.status === 'pending' && !r.private_scribe_id).length === 0 ? (
                <Text style={{ fontFamily: 'Roboto', fontSize: 11, color: '#94a3b8', fontStyle: 'italic', textAlign: 'center', paddingVertical: 12 }}>
                  No pending/prebooked requests available for invitation.
                </Text>
              ) : (
                requests
                  .filter(r => r.status === 'pending' && !r.private_scribe_id)
                  .map((r) => (
                    <TouchableOpacity
                      key={r.id}
                      onPress={() => sendPrivateInvitation(r.id)}
                      style={{ backgroundColor: '#f8fafc', padding: 12, borderRadius: 14, borderWidth: 1, borderColor: '#e2e8f0' }}
                    >
                      <Text style={{ fontFamily: 'Roboto', fontSize: 12, fontWeight: '800', color: '#334155' }}>{r.subject}</Text>
                      <Text style={{ fontFamily: 'Roboto', fontSize: 10, color: '#64748b', marginTop: 2 }}>{r.exam_date} · {r.exam_type}</Text>
                    </TouchableOpacity>
                  ))
              )}
            </ScrollView>

            {/* Cancel */}
            <TouchableOpacity
              onPress={() => setInviteModalVisible(false)}
              style={{ marginTop: 16, width: '100%', backgroundColor: '#f1f5f9', paddingVertical: 12, borderRadius: 14, alignItems: 'center', justifyContent: 'center' }}
            >
              <Text style={{ fontFamily: 'Roboto', color: '#475569', fontWeight: '800', fontSize: 13 }}>Cancel</Text>
            </TouchableOpacity>

          </View>
        </View>
      </Modal>

      {/* SCRIBE ACCOUNT PROFILE MODAL */}
      {/* Opened from "View Profile" on a past scribe card; reviews are loaded by handleOpenScribeProfile */}
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
                      // `languages` may arrive as an array, a JSON-encoded array string, or plain text.
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

      {/* Scribes Directory Search Modal */}
      {/* preSelectedRequest pre-fills the invite target when opened from a specific request card */}
      <ScribesDirectoryModal
        visible={showScribeDirectory}
        onClose={() => {
          setShowScribeDirectory(false);
          setPreSelectedScribeReq(undefined);
        }}
        studentId={studentProfile?.id || ''}
        preSelectedRequest={preSelectedScribeReq}
      />

    </View>
  );
}
