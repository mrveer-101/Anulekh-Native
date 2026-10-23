/**
 * ScribePlanView — the scribe's "Plan & Schedule" tab.
 *
 * Rendered inside the desktop scribe console (components/pc_view/ConsoleScribePC.tsx, 'plan'
 * tab, wrapped in a keep-alive TabPane). Shows the scribe's confirmed work as a month calendar
 * plus a filterable list of cards.
 *
 * Data (via the `supabase` shim, which calls the Rust/Axum backend), loaded once on mount and on
 * pull-to-refresh:
 * - the scribe's own `profiles` row (shown in the declaration letter),
 * - `exam_requests` with status 'matched' and scribe_id = this scribe,
 * - `assignment_requests` with status 'matched' and scribe_id = this scribe, mapped into the same
 *   card shape as exams (deadline -> exam_date, description -> exam_venue, `is_assignment: true`).
 *
 * Behaviour:
 * - Tapping a calendar day filters the list to that date (tap again to clear); days with a plan
 *   are highlighted orange. The All / Upcoming / Completed filter is date-based only
 *   ("Completed" = date before today), not based on the request status.
 * - Exam cards offer Call (bottom sheet with the student's number and a `tel:` dial button),
 *   Chat (navigates to `/console/common/chat?requestId=..&type=exam|assignment`) and a formal
 *   scribe declaration modal. Assignment cards only offer Chat.
 * - Text goes through `t()` from the translation context; some fallback strings are hard-coded
 *   in Gujarati.
 */
import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, ActivityIndicator, RefreshControl, TouchableOpacity, Alert, Modal, Linking } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { supabase } from '@/core/supabase';
import { useLanguage } from '@/core/translation';
import { CallSheetModal } from '@/components/common/modals/CallSheetModal';
import { DeclarationModal } from '@/components/common/modals/DeclarationModal';
import { isWithin24HoursOfExam } from '@/core/examDate';
import { openGoogleMaps } from '@/core/maps';
import { CallRestrictionBanner } from '@/components/common/CallRestrictionBanner';

/**
 * Scribe Plan & Schedule tab (see file header). Takes no props; reads the signed-in scribe from
 * the auth session.
 */
export default function ScribePlanView() {
  const { t } = useLanguage();
  // Loaded data: combined exam + assignment plans and the scribe's profile.
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [plans, setPlans] = useState<any[]>([]);
  const [scribeProfile, setScribeProfile] = useState<any>(null);

  // Custom Calendar & Filter States
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<'all' | 'upcoming' | 'completed'>('all');
  const [isCalendarCollapsed, setIsCalendarCollapsed] = useState(false);

  // Declaration Modal State
  const [selectedExam, setSelectedExam] = useState<any>(null);
  const [isDeclarationOpen, setIsDeclarationOpen] = useState(false);

  // Call Modal State
  const [callExam, setCallExam] = useState<any>(null);
  const [isCallOpen, setIsCallOpen] = useState(false);
  const [callBannerVisible, setCallBannerVisible] = useState(false);

  // Load plans once on mount (refreshing is manual via pull-to-refresh).
  useEffect(() => {
    fetchPlans();
  }, []);

  /**
   * Loads the scribe's profile and all matched exam and assignment requests assigned to them,
   * normalises assignments into the exam card shape and stores the merged list in `plans`.
   * Reads `profiles`, `exam_requests`, `assignment_requests`. Errors are logged only; the
   * spinner and refresh indicator are always cleared. Does nothing when signed out.
   */
  const fetchPlans = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      // Fetch Scribe Profile
      const { data: profile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', session.user.id)
        .single();
      setScribeProfile(profile);

      // Fetch only MATCHED exam requests, assignment requests, and rejected apps to exclude
      const [
        { data: exams, error: examsErr },
        { data: assignments, error: assignmentsErr },
        { data: rejectedApps }
      ] = await Promise.all([
        supabase.from('exam_requests').select('*').eq('status', 'matched').eq('scribe_id', session.user.id),
        supabase.from('assignment_requests').select('*').eq('status', 'matched').eq('scribe_id', session.user.id),
        supabase.from('scribe_applications').select('request_id').eq('scribe_id', session.user.id).eq('status', 'rejected')
      ]);

      if (examsErr) throw examsErr;
      if (assignmentsErr) throw assignmentsErr;

      const rejectedIds = new Set((rejectedApps || []).map((a: any) => a.request_id));

      // Reshape assignments to reuse the exam card UI: deadline acts as the date and the
      // description is shown in the "venue" slot as instructions.
      const mappedAssignments = (assignments || [])
        .filter((assign: any) => !rejectedIds.has(assign.id))
        .map((assign: any) => ({
          id: assign.id,
          subject: assign.subject || 'Assignment',
          exam_type: 'Assignment: ' + assign.academic_level,
          exam_date: assign.deadline,
          exam_venue: assign.description || 'No instructions provided.',
          exam_language: 'Written',
          student_name: assign.student_name || 'Student',
          education_grade: assign.academic_level,
          status: assign.status,
          is_assignment: true
        }));

      const validExams = (exams || []).filter((e: any) => !rejectedIds.has(e.id));
      const allPlans = [...validExams, ...mappedAssignments];
      setPlans(allPlans);
    } catch (error: any) {
      console.error('Error fetching scribe plans:', error.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  /** Pull-to-refresh handler: shows the refresh spinner and reloads plans. */
  const onRefresh = () => {
    setRefreshing(true);
    fetchPlans();
  };

  const openCallSheet = (exam: any) => {
    if (!exam || !exam.exam_date) {
      setCallBannerVisible(true);
      return;
    }
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
   * Builds the calendar grid for `date`'s month.
   * @returns leading `null` placeholders for the weekdays before the 1st (week starts Sunday),
   *   followed by a Date for every day of the month.
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

  /**
   * True when any plan's `exam_date` starts with this day's local `YYYY-MM-DD` string
   * (dates are stored as text, optionally followed by a time).
   */
  const hasPlanOnDate = (day: Date) => {
    if (!day) return false;
    const year = day.getFullYear();
    const month = String(day.getMonth() + 1).padStart(2, '0');
    const date = String(day.getDate()).padStart(2, '0');
    const dateStr = `${year}-${month}-${date}`;
    return plans.some(p => p.exam_date && p.exam_date.startsWith(dateStr));
  };

  // Sort and filter logic
  // Earliest date first; plans without a date sort to the end.
  const sortedPlans = [...plans].sort((a, b) => {
    const dateA = a.exam_date ? a.exam_date.split(' ')[0] : '9999-12-31';
    const dateB = b.exam_date ? b.exam_date.split(' ')[0] : '9999-12-31';
    return dateA.localeCompare(dateB);
  });

  // Narrow to the tapped calendar day, if any.
  let filteredPlans = sortedPlans;
  if (selectedDate) {
    filteredPlans = filteredPlans.filter(p => p.exam_date && p.exam_date.startsWith(selectedDate));
  }

  /**
   * True when the date part of `dateStr` is today or later (compared at UTC midnight).
   * Plans with no date count as upcoming.
   */
  const checkUpcoming = (dateStr: string) => {
    if (!dateStr) return true;
    const cleanDate = dateStr.split(' ')[0];
    const examTime = new Date(cleanDate).getTime();
    const todayTime = new Date(new Date().toISOString().split('T')[0]).getTime();
    return examTime >= todayTime;
  };

  // Apply the All / Upcoming / Completed segment (date-based, see checkUpcoming).
  filteredPlans = filteredPlans.filter(p => {
    if (activeFilter === 'upcoming') {
      return checkUpcoming(p.exam_date);
    }
    if (activeFilter === 'completed') {
      return !checkUpcoming(p.exam_date);
    }
    return true;
  });

  // First load: full-area spinner.
  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', paddingVertical: 10, backgroundColor: '#f9fafb' }}>
        <ActivityIndicator size="large" color="#059669" />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#f9fafb' }}>
      <ScrollView 
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 100 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#059669']} />
        }
      >
        {/* ── CALENDAR BLOCK ── */}
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
                backgroundColor: '#f0fdf4',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Feather name="chevron-left" size={16} color="#16a34a" />
            </TouchableOpacity>
            
            {/* Month title button (No arrow, click to open/toggle calendar) */}
            <TouchableOpacity 
              onPress={() => setIsCalendarCollapsed(!isCalendarCollapsed)}
              activeOpacity={0.7}
              style={{
                paddingHorizontal: 14,
                paddingVertical: 5,
                backgroundColor: '#f0fdf4',
                borderRadius: 16,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Text style={{ fontFamily: 'Roboto', fontSize: 13, fontWeight: '700', color: '#15803d' }}>
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
                backgroundColor: '#f0fdf4',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Feather name="chevron-right" size={16} color="#16a34a" />
            </TouchableOpacity>
          </View>

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
                  if (!day) {
                    return <View key={`empty-${idx}`} style={{ width: '14.28%', height: 32 }} />;
                  }
                  const dateString = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`;
                  const isSelected = selectedDate === dateString;
                  const hasPlan = hasPlanOnDate(day);
                  const today = new Date();
                  const todayString = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
                  const isToday = dateString === todayString;

                  const isSolidActive = isSelected || (!selectedDate && isToday);

                  let circleBg = 'transparent';
                  let numColor = '#1e293b';
                  let dotColor = '#94a3b8';
                  let showDot = false;

                  if (isSolidActive) {
                    circleBg = '#16a34a';
                    numColor = '#ffffff';
                  } else if (hasPlan) {
                    circleBg = '#fef3c7';
                    numColor = '#d97706';
                    dotColor = '#d97706';
                    showDot = true;
                  } else if (isToday) {
                    circleBg = '#f0fdf4';
                    numColor = '#16a34a';
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
                  <Text style={{ fontFamily: 'Roboto', fontSize: 10, fontWeight: '600', color: '#64748b' }}>Confirmed</Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                  <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: '#fed7aa' }} />
                  <Text style={{ fontFamily: 'Roboto', fontSize: 10, fontWeight: '600', color: '#64748b' }}>Scheduled</Text>
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

        {/* ── FILTER SELECTION BLOCK (Slider Track) ── */}
        <View style={{
          flexDirection: 'row',
          backgroundColor: '#f1f5f9',
          padding: 4,
          borderRadius: 16,
          borderWidth: 1.5,
          borderColor: '#cbd5e1',
          shadowColor: '#475569',
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
                  backgroundColor: isActive ? '#059669' : 'transparent',
                  shadowColor: isActive ? '#059669' : 'transparent',
                  shadowOffset: { width: 0, height: 2 },
                  shadowOpacity: isActive ? 0.35 : 0,
                  shadowRadius: 6,
                  elevation: isActive ? 3 : 0
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
                  {filterLabel}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* ── PLAN CARDS (or empty state when nothing matches the filters) ── */}
        {filteredPlans.length === 0 ? (
          <View style={{ backgroundColor: '#ffffff', padding: 32, borderRadius: 24, borderWidth: 1.5, borderColor: '#e2e8f0', shadowColor: '#64748b', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.06, shadowRadius: 16, elevation: 3, alignItems: 'center', justifyContent: 'center', marginTop: 8 }}>
            <View style={{ width: 60, height: 60, borderRadius: 30, backgroundColor: 'rgba(5,150,105,0.08)', alignItems: 'center', justifyContent: 'center', marginBottom: 16, borderWidth: 1, borderColor: 'rgba(5,150,105,0.18)' }}>
              <Feather name="calendar" size={26} color="#059669" />
            </View>
            <Text style={{ fontFamily: 'Roboto', fontSize: 16, fontWeight: '900', color: '#0f172a' }}>{t('no_confirmed_plans')}</Text>
            <Text style={{ fontFamily: 'Roboto', fontSize: 12, color: '#64748b', marginTop: 6, textAlign: 'center', lineHeight: 18, paddingHorizontal: 16 }}>
              {t('scribe_no_plans_desc')}
            </Text>
          </View>
        ) : (
          filteredPlans.map((exam) => (
            <View key={exam.id} style={{ backgroundColor: '#ffffff', padding: 18, borderRadius: 24, borderWidth: 1.5, borderColor: '#e2e8f0', shadowColor: '#64748b', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.06, shadowRadius: 16, elevation: 3, marginBottom: 14 }}>
              {/* Card title: subject, level and "matched" status pill */}
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <View style={{ flex: 1, marginRight: 8 }}>
                  <Text style={{ fontFamily: 'Roboto', fontSize: 15, fontWeight: '900', color: '#0f172a' }}>{exam.subject || t('exams')}</Text>
                  <Text style={{ fontFamily: 'Roboto', fontSize: 10, color: '#64748b', marginTop: 1 }}>{t('exam_level')}: {exam.exam_type}</Text>
                </View>
                <View style={{ paddingVertical: 4, paddingHorizontal: 10, borderRadius: 20, backgroundColor: 'rgba(5,150,105,0.08)', borderWidth: 1, borderColor: 'rgba(5,150,105,0.2)' }}>
                  <Text style={{ fontFamily: 'Roboto', color: '#059669', fontSize: 9, fontWeight: '800' }}>{t('status_matched')}</Text>
                </View>
              </View>

              {/* Details: student, date/deadline, venue/instructions, language (exams only) */}
              <View style={{ borderTopWidth: 1, borderTopColor: '#f1f5f9', paddingTop: 10, marginBottom: 12, gap: 6 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Feather name="user" size={12} color="#059669" style={{ marginRight: 8 }} />
                  <Text style={{ fontFamily: 'Roboto', color: '#475569', fontSize: 12 }}>
                    {t('candidate_student')}: <Text style={{ fontWeight: '700', color: '#0f172a' }}>{exam.student_name} {exam.is_assignment ? '' : `(${exam.education_grade})`}</Text>
                  </Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Feather name="calendar" size={12} color="#64748b" style={{ marginRight: 8 }} />
                  <Text style={{ fontFamily: 'Roboto', color: '#475569', fontSize: 12 }}>
                    {exam.is_assignment ? 'Deadline' : t('exam_date')}: {exam.exam_date || t('date_not_specified')}
                  </Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, marginRight: 8 }}>
                    <Feather name={exam.is_assignment ? 'info' : 'map-pin'} size={12} color="#64748b" style={{ marginRight: 8 }} />
                    <Text style={{ fontFamily: 'Roboto', color: '#475569', fontSize: 12 }} numberOfLines={1}>
                      {exam.is_assignment ? 'Instructions' : t('exam_venue')}: {exam.exam_venue || t('venue_not_specified')}
                    </Text>
                  </View>
                  {!exam.is_assignment && exam.exam_venue ? (
                    <TouchableOpacity
                      onPress={() => openGoogleMaps(exam.google_maps_url || exam.exam_venue)}
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 3,
                        backgroundColor: '#eff6ff',
                        paddingHorizontal: 7,
                        paddingVertical: 2.5,
                        borderRadius: 6,
                        borderWidth: 1,
                        borderColor: '#bfdbfe',
                      }}
                    >
                      <Feather name="navigation" size={10} color="#2563eb" />
                      <Text style={{ fontFamily: 'Roboto', fontSize: 10, fontWeight: '700', color: '#2563eb' }}>
                        Maps ↗
                      </Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
                {!exam.is_assignment && (
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <Feather name="globe" size={12} color="#64748b" style={{ marginRight: 8 }} />
                    <Text style={{ fontFamily: 'Roboto', color: '#475569', fontSize: 12 }}>
                      {t('exam_language')}: {exam.exam_language}
                    </Text>
                  </View>
                )}
              </View>

              {/* Matched Coordination Controls */}
              <View style={{ gap: 8, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#f1f5f9' }}>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  {/* Chat Button: 67% left, blue background, white icon and text */}
                  <TouchableOpacity 
                    onPress={() => router.push(`/console/common/chat?requestId=${exam.id}&type=${exam.is_assignment ? 'assignment' : 'exam'}` as any)}
                    style={{
                      flex: 2,
                      backgroundColor: '#2563eb',
                      paddingVertical: 11,
                      borderRadius: 12,
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexDirection: 'row',
                      gap: 6,
                      shadowColor: '#2563eb',
                      shadowOffset: { width: 0, height: 4 },
                      shadowOpacity: 0.18,
                      shadowRadius: 6,
                      elevation: 2,
                    }}
                    activeOpacity={0.85}
                  >
                    <Feather name="message-square" size={13} color="#ffffff" />
                    <Text style={{ fontFamily: 'Roboto', color: '#ffffff', fontWeight: '800', fontSize: 12 }}>
                      {t('chat')}
                    </Text>
                  </TouchableOpacity>

                  {/* Call Button: 33% end of row */}
                  {!exam.is_assignment && (
                    <TouchableOpacity 
                      onPress={() => openCallSheet(exam)}
                      style={{
                        flex: 1,
                        backgroundColor: '#eff6ff',
                        borderWidth: 1.5,
                        borderColor: '#bfdbfe',
                        paddingVertical: 11,
                        borderRadius: 12,
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexDirection: 'row',
                        gap: 6,
                      }}
                      activeOpacity={0.85}
                    >
                      <Feather name="phone" size={13} color="#2563eb" />
                      <Text style={{ fontFamily: 'Roboto', color: '#2563eb', fontWeight: '800', fontSize: 12 }}>
                        {t('call')}
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>

                {/* View Declaration Button */}
                {!exam.is_assignment && (
                  <TouchableOpacity 
                    onPress={() => {
                      setSelectedExam(exam);
                      setIsDeclarationOpen(true);
                    }}
                    style={{ width: '100%', backgroundColor: '#059669', paddingVertical: 10, borderRadius: 12, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6, shadowColor: '#059669', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.1, shadowRadius: 6, elevation: 2 }}
                  >
                    <Feather name="file-text" size={12} color="white" />
                    <Text style={{ fontFamily: 'Roboto', color: 'white', fontWeight: '800', fontSize: 12 }}>{t('view_declaration')}</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          ))
        )}
      </ScrollView>

      {/* CALL RESTRICTION BANNER (Auto-dismisses with spring animation) */}
      <CallRestrictionBanner
        visible={callBannerVisible}
        onDismiss={() => setCallBannerVisible(false)}
      />

      {/* SCRIBE DECLARATION MODAL */}
      <DeclarationModal
        visible={isDeclarationOpen}
        onClose={() => setIsDeclarationOpen(false)}
        exam={selectedExam}
        studentName={selectedExam?.student_name}
        scribeName={scribeProfile?.full_name}
        scribeOccupation={scribeProfile?.occupation}
        accentColor="#059669"
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
