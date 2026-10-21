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
import React, { useState, useCallback } from 'react';
import { View, Text, FlatList, ActivityIndicator, RefreshControl, TouchableOpacity, Alert, Modal, Linking, ScrollView, useWindowDimensions } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { supabase } from '@/core/supabase';
import { useLanguage } from '@/core/translation';
import { parseExamDate, isExamPast } from '@/core/examDate';
import Animated, { FadeInDown, useReducedMotion } from 'react-native-reanimated';
import { gradient, STUDENT_THEME as THEME } from '@/core/portalTheme';
import { useInDesktopShell } from '@/components/ui/DesktopShell';
import { useTabActive } from '@/components/ui/TabPane';
import { readScreenCache, writeScreenCache } from '@/core/screenCache';
import { getProfilesByIds } from '@/core/profileLookup';
import { CallSheetModal } from '@/components/common/modals/CallSheetModal';
import { DeclarationModal } from '@/components/common/modals/DeclarationModal';

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

  // Declaration Modal State
  const [selectedExam, setSelectedExam] = useState<any>(null);
  const [isDeclarationOpen, setIsDeclarationOpen] = useState(false);

  // Call Modal State
  const [callExam, setCallExam] = useState<any>(null);
  const [isCallOpen, setIsCallOpen] = useState(false);

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
    // Errors are only logged; whatever is on screen (e.g. the cached snapshot) stays.
    } catch (error: any) {
      console.error('Error fetching student plans:', error.message);
    } finally {
      // Clear both the first-load spinner and the pull-to-refresh indicator.
      setLoading(false);
      setRefreshing(false);
    }
  };

  // Refresh whenever the console is focused *and* this tab is visible: switching back to the tab flips
  // isActive and triggers a quiet background refresh, while hidden tabs don't fetch at all.
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

  /**
   * One plan card: header with subject and status pill, a summary bar (scribe, exam date, Details
   * button) and, when expanded, the full details and actions.
   * @param item  The plan (exam or assignment request).
   * @param index Position in the list, used to stagger the rise-in animation.
   */
  const renderPlanCard = (item: ExamRequest, index = 0) => {
    const itemKey = `${item.requestType || 'exam'}-${item.id}`;
    const isEmergency = item.is_emergency === 'yes';
    const isConfirmed = item.status === 'matched' || !!item.scribe_id;
    const isExpanded = expandedPlanIds.has(itemKey);

    // Expand / collapse this card (state lives in expandedPlanIds, keyed by itemKey).
    const toggleExpand = () => {
      setExpandedPlanIds(prev => {
        const next = new Set(prev);
        if (next.has(itemKey)) next.delete(itemKey);
        else next.add(itemKey);
        return next;
      });
    };

    // Clean modern borders and subtle elevation
    let borderColor = isEmergency ? '#fca5a5' : isConfirmed ? '#a7f3d0' : '#e2e8f0';

    return (
      <Animated.View key={itemKey} entering={rise(index + 2)} style={{
        backgroundColor: isEmergency ? '#fffdfd' : '#ffffff',
        padding: 16,
        borderRadius: 20,
        borderWidth: 1.5,
        borderColor,
        shadowColor: '#0f172a',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.05,
        shadowRadius: 12,
        elevation: 2,
        marginBottom: 12
      }}>
        {/* Card Header */}
        <TouchableOpacity onPress={toggleExpand} activeOpacity={0.85} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <View style={{ flex: 1, marginRight: 8 }}>
            {/* Subject, falling back to "પરીક્ષા" (Gujarati for "exam") */}
            <Text style={{ fontFamily: 'Roboto', fontSize: 16, fontWeight: '800', color: '#0f172a', letterSpacing: -0.2 }}>{item.subject || t('exams')}</Text>
            <Text style={{ fontFamily: 'Roboto', fontSize: 11, color: '#64748b', marginTop: 2 }}>
              Level: {item.exam_type} | Confirmed {formatDate(item.created_at)}
            </Text>
          </View>
          
          {/* Status pill */}
          <View style={{
            paddingVertical: 3.5, paddingHorizontal: 9, borderRadius: 999,
            backgroundColor: isEmergency ? '#fef2f2' : '#f0fdf4',
            borderWidth: 1,
            borderColor: isEmergency ? '#fca5a5' : '#bbf7d0'
          }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Feather name={isEmergency ? 'alert-triangle' : 'check-circle'} size={10} color={isEmergency ? '#dc2626' : '#16a34a'} />
              <Text style={{ fontFamily: 'Roboto', color: isEmergency ? '#dc2626' : '#16a34a', fontSize: 9.5, fontWeight: '800', letterSpacing: 0.4 }}>
                {isEmergency ? 'EMERGENCY SOS' : t('status_matched')}
              </Text>
            </View>
          </View>
        </TouchableOpacity>

        {/* Collapsed Preview Summary Bar */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#f1f5f9' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, gap: 12 }}>
            {/* Scribe name (not shown for SOS requests) */}
            {!isEmergency && item.scribeProfile?.full_name && (
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Feather name="user" size={12} color="#059669" style={{ marginRight: 5 }} />
                <Text style={{ fontFamily: 'Roboto', fontSize: 12, fontWeight: '700', color: '#0f172a' }}>
                  {item.scribeProfile.full_name}
                </Text>
              </View>
            )}
            {/* Exam date: only the first space-separated part of exam_date */}
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Feather name="calendar" size={12} color="#f97316" style={{ marginRight: 5 }} />
              <Text style={{ fontFamily: 'Roboto', fontSize: 11.5, color: '#475569', fontWeight: '600' }}>
                {item.exam_date ? item.exam_date.split(' ')[0] : 'Scheduled'}
              </Text>
            </View>
          </View>

          {/* Details Expand/Collapse Button */}
          <TouchableOpacity
            onPress={toggleExpand}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              backgroundColor: isExpanded ? 'rgba(37,99,235,0.08)' : '#f8fafc',
              borderWidth: 1,
              borderColor: isExpanded ? 'rgba(37,99,235,0.2)' : '#e2e8f0',
              paddingHorizontal: 10,
              paddingVertical: 4,
              borderRadius: 10,
              gap: 4
            }}
          >
            <Text style={{ fontFamily: 'Roboto', fontSize: 11, fontWeight: '800', color: isExpanded ? '#2563eb' : '#64748b' }}>
              {isExpanded ? 'Collapse' : 'Details'}
            </Text>
            <Feather name={isExpanded ? "chevron-up" : "chevron-down"} size={14} color={isExpanded ? "#2563eb" : "#64748b"} />
          </TouchableOpacity>
        </View>

        {/* Expanded Detailed View */}
        {isExpanded && (
          <View style={{ marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#f1f5f9' }}>
            {/* SOS warning banner */}
            {isEmergency && (
              <View style={{ 
                backgroundColor: '#fef2f2', 
                padding: 12, borderRadius: 14, 
                borderWidth: 1, borderColor: '#fca5a5', 
                flexDirection: 'row', alignItems: 'center', 
                gap: 8, marginBottom: 12 
              }}>
                <Feather name="alert-triangle" size={14} color="#dc2626" />
                <Text style={{ fontFamily: 'Roboto', color: '#b91c1c', fontSize: 11, fontWeight: '800', flex: 1 }}>
                  Scribe cancelled! Re-broadcasting emergency SOS.
                </Text>
              </View>
            )}

            {/* Detail rows: scribe, date, venue, language */}
            <View style={{ gap: 8, marginBottom: 14 }}>
              {!isEmergency && (
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Feather name="user" size={13} color="#059669" style={{ marginRight: 8 }} />
                  <Text style={{ fontFamily: 'Roboto', color: '#475569', fontSize: 12 }}>
                    {t('volunteer_scribe')}: <Text style={{ fontWeight: '700', color: '#0f172a' }}>{item.scribeProfile?.full_name}</Text>
                  </Text>
                </View>
              )}
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Feather name="calendar" size={13} color="#f97316" style={{ marginRight: 8 }} />
                <Text style={{ fontFamily: 'Roboto', color: '#475569', fontSize: 12 }}>
                  {t('exam_date')}: {item.exam_date || t('date_not_specified')}
                </Text>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Feather name="map-pin" size={13} color="#2563eb" style={{ marginRight: 8 }} />
                <Text style={{ fontFamily: 'Roboto', color: '#475569', fontSize: 12 }} numberOfLines={1}>
                  {t('exam_venue')}: {item.exam_venue || t('venue_not_specified')}
                </Text>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Feather name="globe" size={13} color="#64748b" style={{ marginRight: 8 }} />
                <Text style={{ fontFamily: 'Roboto', color: '#475569', fontSize: 12 }}>
                  {t('exam_language')}: {item.exam_language}
                </Text>
              </View>
            </View>

            {/* Controls */}
            <View style={{ gap: 8, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#f1f5f9' }}>
              {/* SOS plans link to the applications list; others get Call / Chat and the declaration */}
              {isEmergency ? (
                <TouchableOpacity
                  onPress={() => router.push(`/console/student/view_applications?id=${item.id}` as any)}
                  style={{ 
                    width: '100%', 
                    backgroundColor: '#dc2626', 
                    paddingVertical: 12, 
                    borderRadius: 14, 
                    alignItems: 'center', 
                    justifyContent: 'center',
                    flexDirection: 'row',
                    gap: 6
                  }}
                >
                  <Feather name="users" size={14} color="#ffffff" />
                  <Text style={{ color: '#ffffff', fontWeight: '800', fontSize: 12 }}>View SOS Applications</Text>
                </TouchableOpacity>
              ) : (
                <>
                  <View style={{ flexDirection: 'row', gap: 10 }}>
                    {/* Call (unlocks on exam day, see openCallSheet) */}
                    <TouchableOpacity
                      onPress={() => openCallSheet(item)}
                      style={{ 
                        flex: 1, 
                        backgroundColor: 'rgba(5,150,105,0.08)', 
                        borderWidth: 1, 
                        borderColor: 'rgba(5,150,105,0.2)', 
                        paddingVertical: 10, 
                        borderRadius: 14, 
                        alignItems: 'center', 
                        justifyContent: 'center', 
                        flexDirection: 'row', 
                        gap: 6 
                      }}
                    >
                      <Feather name="phone" size={14} color="#059669" />
                      <Text style={{ fontFamily: 'Roboto', color: '#059669', fontWeight: '800', fontSize: 12 }}>{t('call')}</Text>
                    </TouchableOpacity>

                    {/* Chat with the scribe (the chat route is always opened with type=exam) */}
                    <TouchableOpacity
                      onPress={() => {
                        router.push(`/console/common/chat?id=${item.id}&type=exam` as any);
                      }}
                      style={{ 
                        flex: 1, 
                        backgroundColor: 'rgba(37,99,235,0.08)', 
                        borderWidth: 1, 
                        borderColor: 'rgba(37,99,235,0.2)', 
                        paddingVertical: 10, 
                        borderRadius: 14, 
                        alignItems: 'center', 
                        justifyContent: 'center', 
                        flexDirection: 'row', 
                        gap: 6 
                      }}
                    >
                      <Feather name="message-square" size={14} color="#2563eb" />
                      <Text style={{ fontFamily: 'Roboto', color: '#2563eb', fontWeight: '800', fontSize: 12 }}>{t('chat')}</Text>
                    </TouchableOpacity>
                  </View>

                  {/* Opens the declaration certificate modal for this plan */}
                  <TouchableOpacity
                    onPress={() => {
                      setSelectedExam(item);
                      setIsDeclarationOpen(true);
                    }}
                    style={{
                      width: '100%',
                      backgroundColor: '#2563eb',
                      ...gradient(THEME.buttonGradient),
                      paddingVertical: 12,
                      borderRadius: 14,
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexDirection: 'row',
                      gap: 6,
                      shadowColor: '#2563eb',
                      shadowOffset: { width: 0, height: 4 },
                      shadowOpacity: 0.15,
                      shadowRadius: 8,
                      elevation: 2
                    }}
                  >
                    <Feather name="file-text" size={14} color="#ffffff" />
                    <Text style={{ color: '#ffffff', fontWeight: '800', fontSize: 12 }}>{t('view_declaration')}</Text>
                  </TouchableOpacity>
                </>
              )}
            </View>
          </View>
        )}
      </Animated.View>
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
          contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 100 }}
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

      {/* SCRIBE DECLARATION MODAL */}
      <DeclarationModal
        visible={isDeclarationOpen}
        onClose={() => setIsDeclarationOpen(false)}
        exam={selectedExam}
        studentName={studentProfile?.full_name}
        scribeName={selectedExam?.scribeProfile?.full_name}
        scribeOccupation={selectedExam?.scribeProfile?.occupation}
        accentColor="#2563eb"
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
