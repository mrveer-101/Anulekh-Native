/**
 * StudentPlanView — the "Plan" tab of the student portal.
 *
 * Rendered inside a keep-alive <TabPane> by the student console on phones
 * (app/console/student/index.tsx) and on desktop (components/pc_view/ConsoleStudentPC.tsx).
 * Lists the student's confirmed plans — matched or completed exam and assignment requests, plus
 * pending SOS (emergency) requests — with a month calendar that marks exam days, All / Upcoming /
 * Completed filters, expandable plan cards (call, chat, declaration, SOS applications), and two
 * modals: the scribe declaration certificate and the "call your scribe" bottom sheet.
 *
 * Data (read-only): `profiles` (own row, plus matched scribes via core/profileLookup
 * `getProfilesByIds`), `exam_requests` and `assignment_requests`. Queries go through the `supabase`
 * object from core/supabase.ts, a custom shim that sends `POST /api/query` to the Rust/Axum backend
 * (not real Supabase). Navigates to view_applications and common/chat.
 */
import React, { useState, useCallback, useEffect } from 'react';
import { View, Text, FlatList, ActivityIndicator, RefreshControl, TouchableOpacity, Alert, Modal, Linking, ScrollView, useWindowDimensions } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { supabase } from '@/core/supabase';
import { useLanguage } from '@/core/translation';
import { parseExamDate, isExamPast, isWithin24HoursOfExam } from '@/core/examDate';
import { schedule24HourExamReminder } from '@/core/notificationWatcher';
import Animated, { FadeInDown, useReducedMotion } from 'react-native-reanimated';
import { gradient, STUDENT_THEME as THEME } from '@/core/portalTheme';
import { useInDesktopShell } from '@/components/ui/DesktopShell';
import { useTabActive } from '@/components/ui/TabPane';
import { readScreenCache, writeScreenCache } from '@/core/screenCache';
import { getProfilesByIds } from '@/core/profileLookup';
import { CallSheetModal } from '@/components/common/modals/CallSheetModal';
import { RatingModal } from '@/components/common/modals/RatingModal';
import { StudentRequestCard } from '@/components/student/StudentRequestCard';
import { CallRestrictionBanner } from '@/components/common/CallRestrictionBanner';

/**
 * One plan row: an `exam_requests` or `assignment_requests` row, tagged with `requestType` (which table
 * it came from) and, once matched, the scribe's profile attached as `scribeProfile`.
 */
interface ExamRequest {
  id: number;
  subject: string;
  exam_type: string;
  exam_date: string;
  exam_venue: string;
  exam_language: string;
  student_name: string;
  education_grade: string;
  created_at: string;
  scribe_id?: string;
  status?: string;
  is_emergency?: string;
  private_scribe_id?: string;
  requestType?: 'exam' | 'assignment';
  scribeProfile?: {
    full_name: string;
    phone: string;
    education_level: string;
    occupation: string;
  };
}

/** Everything the Plan tab shows, cached so the next visit paints instantly (see core/screenCache). */
interface StudentPlanSnapshot {
  profile: any;
  plans: any[];
}

/**
 * Student portal Plan tab.
 *
 * Follows the stale-while-revalidate pattern of core/screenCache: the cached `StudentPlanSnapshot`
 * is painted first, then fresh data replaces it and is cached again. It refreshes only while its tab
 * is visible (`useTabActive` + `useFocusEffect`), and on pull-to-refresh in the phone layout.
 */
export default function StudentPlanView() {
  // Inside the desktop console: no own page background, wider layout (see ui/DesktopShell).
  const inShell = useInDesktopShell();
  const { t } = useLanguage();
  // True while this tab is visible (TabPane keep-alive) — data refreshes only then.
  const isActive = useTabActive();
  // Loaded plans, first-load spinner, pull-to-refresh flag and the student's own profile (shown
  // as the candidate on the declaration).
  const [plans, setPlans] = useState<ExamRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [studentProfile, setStudentProfile] = useState<any>(null);

  // Custom Calendar & Filter States
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<'all' | 'upcoming' | 'completed'>('all');
  const [isCalendarCollapsed, setIsCalendarCollapsed] = useState(false);
  // Expanded cards are keyed "<requestType>-<id>" because exam and assignment ids can collide.
  const [expandedPlanIds, setExpandedPlanIds] = useState<Set<string>>(new Set());

  // Rating Modal State
  const [ratingExam, setRatingExam] = useState<any>(null);
  const [isRatingOpen, setIsRatingOpen] = useState(false);

  // Call Modal State
  const [callExam, setCallExam] = useState<any>(null);
  const [isCallOpen, setIsCallOpen] = useState(false);
  const [callBannerVisible, setCallBannerVisible] = useState(false);

  /** Puts a snapshot (cached or freshly fetched) on screen. */
  const applySnapshot = (snap: StudentPlanSnapshot) => {
    setStudentProfile(snap.profile);
    setPlans(snap.plans);
  };

  /**
   * Loads the Plan tab: cached snapshot first, then profile + exam + assignment requests in parallel,
   * then the matched scribes' profiles in one de-duplicated batch.
   */
  const fetchPlans = async () => {
    try {
      // Nothing to load without a signed-in session.
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const userId = session.user.id;

      // Stale-while-revalidate: paint the last cached snapshot straight away (no spinner) while fresh
      // data loads below.
      const cached = await readScreenCache<StudentPlanSnapshot>('student_plan', userId);
      if (cached) {
        applySnapshot(cached);
        setLoading(false);
      }

      // Profile, exam requests and assignment requests in parallel (requests newest first).
      const [{ data: profile }, { data: examData }, { data: asgData }] = await Promise.all([
        supabase.from('profiles').select('*').eq('id', userId).single(),
        supabase.from('exam_requests').select('*').eq('student_id', userId).order('created_at', { ascending: false }),
        supabase.from('assignment_requests').select('*').eq('student_id', userId).order('created_at', { ascending: false }),
      ]);

      // Tag each row with its source table so exams and assignments can share one list.
      const taggedExams = (examData || []).map((e: any) => ({ ...e, requestType: 'exam' }));
      const taggedAsgs = (asgData || []).map((a: any) => ({ ...a, requestType: 'assignment' }));

      // Plans = matched, completed and pending-SOS requests, with the matched scribe's profile attached
      const activePlans = [...taggedExams, ...taggedAsgs].filter((item: any) => {
        return item.status === 'matched' || item.status === 'completed' || (item.status === 'pending' && item.is_emergency === 'yes');
      });
      const scribes = await getProfilesByIds(activePlans.map((item: any) => item.scribe_id));
      const enriched = activePlans.map((item: any) => ({
        ...item,
        scribeProfile: (item.scribe_id && scribes.get(item.scribe_id)) || undefined,
      }));

      // Build the fresh snapshot, put it on screen and cache it for the next visit.
      const snapshot: StudentPlanSnapshot = { profile, plans: enriched };
      applySnapshot(snapshot);
      writeScreenCache('student_plan', userId, snapshot);

      // Auto-schedule 24-hour native phone reminders for upcoming exams
      activePlans.forEach((plan: any) => {
        schedule24HourExamReminder(plan);
      });
    // Errors are only logged; whatever is on screen (e.g. the cached snapshot) stays.
    } catch (error: any) {
      console.error('Error fetching student plans:', error.message);
    } finally {
      // Clear both the first-load spinner and the pull-to-refresh indicator.
      setLoading(false);
      setRefreshing(false);
    }
  };

  // Preload schedule in background immediately on mount so Schedule tab opens instantly
  useEffect(() => {
    fetchPlans();
  }, []);

  // Refresh whenever the console is focused *and* this tab is visible
  useFocusEffect(
    useCallback(() => {
      if (!isActive) return;
      fetchPlans();
    }, [isActive])
  );
  /** Pull-to-refresh handler (phone layout): shows the refresh spinner and reloads. */
  const onRefresh = () => {
    setRefreshing(true);
    fetchPlans();
  };

  /** Formats a timestamp as e.g. "05 Oct 2026" (en-IN); used for the request's creation date. */
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  };

  /**
   * Opens the call bottom sheet for a plan's scribe.
   * Opens the call bottom sheet for an exam's scribe. Scribe contact details unlock within 24 hours of the exam.
   * If the exam is more than 24 hours away, displays the floating notification banner.
   */
  const openCallSheet = (exam: any) => {
    if (!exam || !exam.exam_date) {
      setCallBannerVisible(true);
      return;
    }
    
    // Check if within 24 hours of the scheduled exam
    if (!isWithin24HoursOfExam(exam.exam_date)) {
      setCallBannerVisible(true);
      return;
    }

    setCallExam(exam);
    setIsCallOpen(true);
  };

  /** Moves the calendar by `offset` months (-1 = previous, +1 = next). */
  const changeMonth = (offset: number) => {
    const next = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + offset, 1);
    setCurrentMonth(next);
  };

  /**
   * Builds the cells of a month grid (Sunday-first): leading nulls up to the weekday of the 1st,
   * then one local-midnight Date per day of the month.
   */
  const getDaysInMonth = (date: Date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const firstDay = new Date(year, month, 1).getDay();
    const totalDays = new Date(year, month + 1, 0).getDate();
    const days = [];
    for (let i = 0; i < firstDay; i++) {
      days.push(null);
    }
    for (let i = 1; i <= totalDays; i++) {
      days.push(new Date(year, month, i));
    }
    return days;
  };

  /** True if any plan's exam (exam_date parsed by core/examDate) falls on this calendar day. */
  const hasPlanOnDate = (day: Date) => {
    if (!day) return false;
    return plans.some(p => {
      const d = parseExamDate(p.exam_date);
      if (!d) return false;
      return d.getFullYear() === day.getFullYear() && d.getMonth() === day.getMonth() && d.getDate() === day.getDate();
    });
  };

  /** All plans whose exam falls on this calendar day (used to colour SOS days red). */
  const getPlansOnDate = (day: Date) => {
    if (!day) return [];
    return plans.filter(p => {
      const d = parseExamDate(p.exam_date);
      if (!d) return false;
      return d.getFullYear() === day.getFullYear() && d.getMonth() === day.getMonth() && d.getDate() === day.getDate();
    });
  };

  // Sort and filter logic
  // Soonest exam first; plans whose exam_date cannot be parsed go last.
  const sortedPlans = [...plans].sort((a, b) => {
    const dA = parseExamDate(a.exam_date)?.getTime() || 9999999999999;
    const dB = parseExamDate(b.exam_date)?.getTime() || 9999999999999;
    return dA - dB;
  });

  // A selected calendar day (local "YYYY-MM-DD") narrows the list to plans on that day.
  let filteredPlans = sortedPlans;
  if (selectedDate) {
    filteredPlans = filteredPlans.filter(p => {
      const d = parseExamDate(p.exam_date);
      if (!d) return false;
      const dateString = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      return dateString === selectedDate;
    });
  }

  /** A plan counts as completed when marked 'completed' or once its exam date/time has passed. */
  const checkIsCompleted = (item: ExamRequest) => {
    if (item.status === 'completed') return true;
    return isExamPast(item.exam_date);
  };

  // Then apply the All / Upcoming / Completed filter.
  filteredPlans = filteredPlans.filter(p => {
    const isCompleted = checkIsCompleted(p);
    if (activeFilter === 'upcoming') {
      return !isCompleted;
    }
    if (activeFilter === 'completed') {
      return isCompleted;
    }
    return true;
  });

  // Wide screens (>= 768 px) show the list and the calendar side by side.
  const { width } = useWindowDimensions();
  const isDesktop = width >= 768;
  // Blocks and plan cards rise in one after another (off with Reduce Motion).
  const reduceMotion = useReducedMotion();
  const rise = (index: number) => (reduceMotion ? undefined : FadeInDown.delay(Math.min(index, 6) * 70).duration(420));

  /**
   * Month calendar card styled cleanly to match the modern rounded aesthetic from reference design.
   */
  /**
   * Month calendar card styled cleanly to match the modern rounded aesthetic from reference design.
   */
  const renderCalendarBlock = () => (
    <View style={{
      backgroundColor: '#ffffff',
      paddingVertical: 12,
      paddingHorizontal: 12,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: '#f1f5f9',
      shadowColor: '#0f172a',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.04,
      shadowRadius: 10,
      elevation: 2,
      marginBottom: 12
    }}>
      {/* Header: Month Selector with Interactive Expand/Collapse Button (No Arrow) */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: isCalendarCollapsed ? 0 : 10 }}>
        {/* Previous month */}
        <TouchableOpacity 
          onPress={() => changeMonth(-1)} 
          activeOpacity={0.7}
          style={{
            width: 32,
            height: 32,
            borderRadius: 16,
            backgroundColor: '#f0f6ff',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Feather name="chevron-left" size={16} color="#2563eb" />
        </TouchableOpacity>
        
        {/* Month title button (No arrow, click to open/toggle calendar) */}
        <TouchableOpacity 
          onPress={() => setIsCalendarCollapsed(!isCalendarCollapsed)}
          activeOpacity={0.7}
          style={{
            paddingHorizontal: 14,
            paddingVertical: 5,
            backgroundColor: '#f0f6ff',
            borderRadius: 16,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text style={{ fontFamily: 'Roboto', fontSize: 13, fontWeight: '700', color: '#1d4ed8' }}>
            {currentMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
          </Text>
        </TouchableOpacity>

        {/* Next month */}
        <TouchableOpacity 
          onPress={() => changeMonth(1)} 
          activeOpacity={0.7}
          style={{
            width: 32,
            height: 32,
            borderRadius: 16,
            backgroundColor: '#f0f6ff',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Feather name="chevron-right" size={16} color="#2563eb" />
        </TouchableOpacity>
      </View>

      {/* Weekday row and day grid are hidden while the calendar is collapsed */}
      {!isCalendarCollapsed && (
        <>
          {/* Weekdays Row */}
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
            {['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'].map((day, idx) => (
              <View key={idx} style={{ width: '14.28%', alignItems: 'center' }}>
                <Text style={{ fontFamily: 'Roboto', fontSize: 10, fontWeight: '700', color: '#64748b', letterSpacing: 0.2 }}>{day}</Text>
              </View>
            ))}
          </View>

          {/* Days Grid */}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', rowGap: 2 }}>
            {getDaysInMonth(currentMonth).map((day, idx) => {
              // Blank cells before the 1st of the month.
              if (!day) {
                return <View key={`empty-${idx}`} style={{ width: '14.28%', height: 32 }} />;
              }
              // Local "YYYY-MM-DD" key, the same format stored in selectedDate.
              const dateString = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`;
              const isSelected = selectedDate === dateString;
              const hasPlan = hasPlanOnDate(day);
              const today = new Date();
              const todayString = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
              const isToday = dateString === todayString;

              // If a date is explicitly selected, or if no date is selected and this is today
              const isSolidActive = isSelected || (!selectedDate && isToday);

              let circleBg = 'transparent';
              let numColor = '#1e293b';
              let dotColor = '#94a3b8';
              let showDot = false;

              if (isSolidActive) {
                circleBg = '#2563eb';
                numColor = '#ffffff';
              } else if (hasPlan) {
                const plansOnDay = getPlansOnDate(day);
                const hasEmergency = plansOnDay.some(p => p.is_emergency === 'yes');
                const hasConfirmed = plansOnDay.some(p => p.status === 'confirmed' || p.status === 'assigned');
                showDot = true;
                if (hasEmergency) {
                  circleBg = '#fee2e2';
                  numColor = '#dc2626';
                  dotColor = '#dc2626';
                } else if (hasConfirmed) {
                  circleBg = '#dcfce7';
                  numColor = '#16a34a';
                  dotColor = '#16a34a';
                } else {
                  circleBg = '#fef3c7';
                  numColor = '#d97706';
                  dotColor = '#d97706';
                }
              } else if (isToday) {
                circleBg = '#eff6ff';
                numColor = '#2563eb';
              }

              // Tapping selects the day as a list filter; tapping the selected day clears it.
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
                  activeOpacity={0.7}
                  style={{
                    width: '14.28%',
                    height: 32,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <View style={{
                    width: 28,
                    height: 28,
                    borderRadius: 14,
                    backgroundColor: circleBg,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}>
                    <Text style={{
                      fontFamily: 'Roboto',
                      fontSize: 12,
                      fontWeight: isSolidActive || hasPlan ? '700' : '500',
                      color: numColor,
                    }}>
                      {day.getDate()}
                    </Text>
                    {showDot && !isSolidActive && (
                      <View style={{
                        width: 3,
                        height: 3,
                        borderRadius: 1.5,
                        backgroundColor: dotColor,
                        position: 'absolute',
                        bottom: 2,
                      }} />
                    )}
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Status Legend */}
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 14, marginTop: 10 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
              <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: '#86efac' }} />
              <Text style={{ fontFamily: 'Roboto', fontSize: 10, fontWeight: '600', color: '#64748b' }}>Matched</Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
              <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: '#fed7aa' }} />
              <Text style={{ fontFamily: 'Roboto', fontSize: 10, fontWeight: '600', color: '#64748b' }}>Pending</Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
              <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: '#fca5a5' }} />
              <Text style={{ fontFamily: 'Roboto', fontSize: 10, fontWeight: '600', color: '#64748b' }}>SOS</Text>
            </View>
          </View>

          {/* Selected Date Filter Badge / Reset */}
          {selectedDate && (
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 10, paddingTop: 8, borderTopWidth: 1, borderColor: '#f1f5f9' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                <Feather name="calendar" size={12} color="#2563eb" />
                <Text style={{ fontFamily: 'Roboto', fontSize: 10, fontWeight: '800', color: '#2563eb' }}>
                  Filtered by date: {selectedDate}
                </Text>
              </View>
              <TouchableOpacity onPress={() => setSelectedDate(null)} style={{ backgroundColor: '#eff6ff', paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6 }}>
                <Text style={{ fontFamily: 'Roboto', fontSize: 9, fontWeight: '800', color: '#2563eb' }}>Clear Date</Text>
              </TouchableOpacity>
            </View>
          )}
        </>
      )}
    </View>
  );

  /**
   * Segmented All / Upcoming / Completed filter. The `isActive` inside means "this filter is
   * selected" and shadows the tab-visibility flag of the same name.
   */
  const renderFilterBlock = () => (
    <View style={{
      flexDirection: 'row',
      backgroundColor: '#ffffff',
      padding: 4,
      borderRadius: 16,
      borderWidth: 1.5,
      borderColor: THEME.cardBorder,
      shadowColor: THEME.shadow,
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.08,
      shadowRadius: 8,
      elevation: 2,
      marginBottom: 12,
      gap: 4
    }}>
      {(['all', 'upcoming', 'completed'] as const).map((filter) => {
        const isActive = activeFilter === filter;
        const filterLabel = filter === 'all' ? 'All' : filter === 'upcoming' ? 'Upcoming' : 'Completed';
        return (
          <TouchableOpacity
            key={filter}
            onPress={() => setActiveFilter(filter)}
            style={{
              flex: 1,
              paddingVertical: 7,
              borderRadius: 12,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: isActive ? '#2563eb' : 'transparent',
              ...(isActive ? gradient(THEME.buttonGradient) : {}),
              shadowColor: isActive ? '#2563eb' : 'transparent',
              shadowOffset: { width: 0, height: 2 },
              shadowOpacity: isActive ? 0.35 : 0,
              shadowRadius: 6,
              elevation: isActive ? 3 : 0
            }}
          >
            <Text style={{
              fontFamily: 'Roboto',
              fontSize: 12,
              fontWeight: '700',
              color: isActive ? '#ffffff' : '#64748b',
            }}>
              {filterLabel}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );

  /** Card shown when no plans match the current filters. */
  const renderEmptyState = () => (
    <View style={{ backgroundColor: '#ffffff', padding: 32, borderRadius: 24, borderWidth: 1.5, borderColor: THEME.cardBorder, shadowColor: THEME.shadow, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.06, shadowRadius: 16, elevation: 3, alignItems: 'center', justifyContent: 'center', marginTop: 8 }}>
      <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: 'rgba(37,99,235,0.08)', ...gradient(THEME.heroGradient), alignItems: 'center', justifyContent: 'center', marginBottom: 16, borderWidth: 1, borderColor: 'rgba(37,99,235,0.18)' }}>
        <Feather name="calendar" size={26} color="#2563eb" />
      </View>
      <Text style={{ fontFamily: 'Roboto', fontSize: 16, fontWeight: '900', color: '#0f172a' }}>{t('no_confirmed_plans')}</Text>
      <Text style={{ fontFamily: 'Roboto', fontSize: 12, color: '#64748b', marginTop: 6, textAlign: 'center', lineHeight: 18, paddingHorizontal: 16 }}>
        {t('scribe_confirmed_plans_desc')}
      </Text>
    </View>
  );

  /** Opens the rating & review modal to mark a plan complete. */
  const openRatingModal = (exam: any) => {
    setRatingExam(exam);
    setIsRatingOpen(true);
  };


  /** Allows changing the scribe/helper on a matched request. */
  const handleUnmatchScribe = (item: any) => {
    const isAssignment = item.requestType === 'assignment';
    Alert.alert(
      'Change Scribe',
      `Are you sure you want to change ${item.scribeProfile?.full_name || 'this helper'}? The request will return to pending status so other helpers can apply.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Change Scribe',
          style: 'destructive',
          onPress: async () => {
            const oldScribeId = item.scribe_id;
            const table = isAssignment ? 'assignment_requests' : 'exam_requests';
            await supabase
              .from(table)
              .update({ status: 'pending', scribe_id: null })
              .eq('id', item.id);

            if (oldScribeId) {
              if (!isAssignment) {
                await supabase
                  .from('scribe_applications')
                  .update({ status: 'rejected' })
                  .eq('request_id', item.id)
                  .eq('scribe_id', oldScribeId);
              }

              await supabase.from('notifications').insert({
                user_id: oldScribeId,
                title: 'Match Cancelled',
                message: `The student has changed the scribe for "${item.subject || item.exam_type}". The request is now open for new applications.`,
                is_read: 0,
                created_at: new Date().toISOString()
              });
            }
            Alert.alert('Scribe Changed', 'The request has been reset to pending.');
            fetchPlans();
          }
        }
      ]
    );
  };

  /** Deletes/cancels a request. */
  const handleDelete = (item: any) => {
    const isAssignment = item.requestType === 'assignment';
    Alert.alert(
      'Cancel & Delete Request',
      'Are you sure you want to cancel and delete this request? This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete Request', style: 'destructive',
          onPress: async () => {
            if (item.scribe_id) {
              await supabase.from('notifications').insert({
                user_id: item.scribe_id,
                title: 'Request Cancelled',
                message: `The student has cancelled their request for "${item.subject || item.exam_type}".`,
                is_read: 0,
                created_at: new Date().toISOString()
              });
            }
            const table = isAssignment ? 'assignment_requests' : 'exam_requests';
            await supabase.from(table).delete().eq('id', item.id);
            if (!isAssignment) {
              await supabase.from('scribe_applications').delete().eq('request_id', item.id);
            }
            fetchPlans();
          }
        }
      ]
    );
  };

  /**
   * One plan card: uses the unified StudentRequestCard component.
   */
  const renderPlanCard = (item: ExamRequest, index = 0) => {
    const itemKey = `${item.requestType || 'exam'}-${item.id}`;
    const isExpanded = expandedPlanIds.has(itemKey);

    const toggleExpand = () => {
      setExpandedPlanIds(prev => {
        const next = new Set(prev);
        if (next.has(itemKey)) next.delete(itemKey);
        else next.add(itemKey);
        return next;
      });
    };

    return (
      <StudentRequestCard
        key={itemKey}
        item={item}
        index={index}
        isExpanded={isExpanded}
        onToggleExpand={toggleExpand}
        onCall={openCallSheet}
        onChat={(target) => router.push(`/console/common/chat?requestId=${target.id}&type=${target.requestType || 'exam'}` as any)}
        onMarkCompleted={openRatingModal}
        onChangeScribe={handleUnmatchScribe}
        onCancelRequest={handleDelete}
        onEditRequest={(target) => router.push(((target.requestType === 'assignment' || target.is_assignment) ? `/console/student/assignment_form?id=${target.id}` : `/console/student/request_form?id=${target.id}`) as any)}
        onViewApplications={(target) => router.push(`/console/student/view_applications?id=${target.id}&examId=${target.id}` as any)}
      />
    );
  };

  // First load with no cached snapshot yet: full-screen spinner.
  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', paddingVertical: 10, backgroundColor: '#f9fafb' }}>
        <ActivityIndicator size="large" color="#2563eb" />
      </View>
    );
  }

  // Page: themed gradient background (STUDENT_THEME + gradient() from core/portalTheme) with a
  // decorative orb, the plan list / calendar, and the two modals. All styling is inline.
  return (
    <View style={inShell ? { flex: 1 } : [{ flex: 1, backgroundColor: THEME.page }, gradient(THEME.pageGradient)]}>
      {/* Soft colour orb for depth behind the cards */}
      {!inShell && <View pointerEvents="none" style={{ position: 'absolute', top: -70, right: -80, width: 240, height: 240, borderRadius: 120, backgroundColor: THEME.orb }} />}
      {/* Desktop: two columns in a ScrollView (no pull-to-refresh). Phone: a FlatList with the
          calendar and filters as its header, plus pull-to-refresh */}
      {isDesktop ? (
        <ScrollView contentContainerStyle={{ padding: inShell ? 0 : 24, paddingBottom: 40 }}>
          <View style={{ flexDirection: 'row', gap: 24, alignItems: 'flex-start' }}>
            {/* Left 50%: Filter Block + List of Plans */}
            <View style={{ flex: 1 }}>
              {renderFilterBlock()}
              {filteredPlans.length === 0 ? (
                renderEmptyState()
              ) : (
                filteredPlans.map((item, i) => renderPlanCard(item, i))
              )}
            </View>

            {/* Right 50%: Calendar Block */}
            <View style={{ flex: 1 }}>
              {renderCalendarBlock()}
            </View>
          </View>
        </ScrollView>
      ) : (
        <FlatList
          style={{ flex: 1 }}
          data={filteredPlans}
          keyExtractor={(item) => `${item.requestType || 'exam'}-${item.id}`}
          contentContainerStyle={{ paddingHorizontal: 12, paddingTop: 12, paddingBottom: 100 }}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#2563eb']} />
          }
          ListHeaderComponent={
            <Animated.View entering={rise(0)} style={{ marginBottom: 8 }}>
              {renderCalendarBlock()}
              {renderFilterBlock()}
            </Animated.View>
          }
          ListEmptyComponent={renderEmptyState()}
          renderItem={({ item, index }) => renderPlanCard(item, index)}
        />
      )}

      {/* RATING & COMPLETION MODAL */}
      <RatingModal
        visible={isRatingOpen}
        onClose={() => setIsRatingOpen(false)}
        exam={ratingExam}
        onSuccess={fetchPlans}
      />

      {/* CALL RESTRICTION BANNER (Auto-dismisses with spring animation) */}
      <CallRestrictionBanner
        visible={callBannerVisible}
        onDismiss={() => setCallBannerVisible(false)}
      />

      {/* CALL BOTTOM SHEET MODAL */}
      <CallSheetModal
        visible={isCallOpen}
        onClose={() => setIsCallOpen(false)}
        exam={callExam}
        accentColor="#059669"
      />
    </View>
  );
}
