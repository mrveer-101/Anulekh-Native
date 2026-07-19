import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, ScrollView, ActivityIndicator, RefreshControl, TouchableOpacity, TextInput, Alert } from 'react-native';
import { Feather, Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { supabase } from '../app/core/supabase';
import { useLanguage } from '../app/core/translation';
import { parseExamDate } from '../app/core/examDate';

interface ExamRequest {
  id: number;
  subject: string;
  exam_type: string;
  exam_date: string;
  exam_venue: string;
  exam_language: string;
  student_name: string;
  education_grade: string;
  is_prebooking?: string;
  is_emergency?: string;
  private_scribe_id?: string;
}

// Helper to parse search queries for date matching
function parseSearchQueryForDates(query: string): { start: Date | null; end: Date | null; cleanQuery: string } {
  const lowerQuery = query.toLowerCase().trim();
  if (!lowerQuery) {
    return { start: null, end: null, cleanQuery: "" };
  }

  // Months mapping for text parsing
  const months: { [key: string]: number } = {
    jan: 0, january: 0,
    feb: 1, february: 1,
    mar: 2, march: 2,
    apr: 3, april: 3,
    may: 4,
    jun: 5, june: 5,
    jul: 6, july: 6,
    aug: 7, august: 7,
    sep: 8, september: 8,
    oct: 9, october: 9,
    nov: 10, november: 10,
    dec: 11, december: 11
  };

  // Helper to parse a single date string from natural text
  const parseNaturalDate = (str: string): Date | null => {
    str = str.trim();
    if (!str) return null;
    
    // Match DD/MM/YYYY
    const dmy = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (dmy) {
      return new Date(parseInt(dmy[3], 10), parseInt(dmy[2], 10) - 1, parseInt(dmy[1], 10));
    }
    
    // Match YYYY-MM-DD
    const ymd = str.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (ymd) {
      return new Date(parseInt(ymd[1], 10), parseInt(ymd[2], 10) - 1, parseInt(ymd[3], 10));
    }
    
    // Match patterns like "17 july", "17 july 2026", "july 17", "july 17 2026"
    const words = str.split(/\s+/);
    let day: number | null = null;
    let month: number | null = null;
    let year: number = new Date().getFullYear(); // default to current year
    
    for (const w of words) {
      const cleanW = w.replace(/,$/, '').trim();
      if (/^\d{4}$/.test(cleanW)) {
        year = parseInt(cleanW, 10);
      } else if (/^\d{1,2}(st|nd|rd|th)?$/.test(cleanW)) {
        day = parseInt(cleanW, 10);
      } else if (months[cleanW] !== undefined) {
        month = months[cleanW];
      }
    }
    
    if (day !== null && month !== null) {
      return new Date(year, month, day);
    }
    return null;
  };

  // Check for "from <date> to <date>" or "<date> to <date>" or "<date> - <date>"
  const rangePattern = /(?:from\s+)?(.+?)\s+(?:to|-)\s+(.+)/i;
  const matchRange = lowerQuery.match(rangePattern);
  if (matchRange) {
    const start = parseNaturalDate(matchRange[1]);
    const end = parseNaturalDate(matchRange[2]);
    if (start || end) {
      const cleanQuery = query.replace(new RegExp(matchRange[0], 'i'), '').trim();
      return { start, end, cleanQuery };
    }
  }

  // Check if there is an "on <date>", "for <date>", "at <date>"
  const onMatch = lowerQuery.match(/(.+?)\s+(?:on|for|at)\s+(.+)/i);
  if (onMatch) {
    const possibleDate = parseNaturalDate(onMatch[2]);
    if (possibleDate) {
      const cleanQuery = query.replace(new RegExp(onMatch[0].substring(onMatch[1].length), 'i'), '').trim();
      return { start: possibleDate, end: possibleDate, cleanQuery };
    }
  }

  // Check if the entire query is a single date
  const singleDate = parseNaturalDate(lowerQuery);
  if (singleDate) {
    return { start: singleDate, end: singleDate, cleanQuery: "" };
  }

  return { start: null, end: null, cleanQuery: query };
}

export default function ScribeExploreView() {
  const { t } = useLanguage();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeSegment, setActiveSegment] = useState<'exams' | 'assignments'>('exams');
  const [availableExams, setAvailableExams] = useState<ExamRequest[]>([]);
  const [availableAssignments, setAvailableAssignments] = useState<any[]>([]);
  const [appMap, setAppMap] = useState<Map<string, string>>(new Map());
  const [scribeProfile, setScribeProfile] = useState<any>(null);
  
  // Search & Filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedLanguage, setSelectedLanguage] = useState('All');
  const [selectedType, setSelectedType] = useState('All');
  const [selectedSlot, setSelectedSlot] = useState('All');
  const [selectedDay, setSelectedDay] = useState('All');
  const [showFilters, setShowFilters] = useState(false);

  // Date-range filter (DD/MM/YYYY text inputs, inclusive on both ends)
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  useFocusEffect(
    useCallback(() => {
      fetchSession();
    }, [])
  );

  const fetchSession = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      // 1. Fetch Scribe Profile to check location
      const { data: profile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', session.user.id)
        .single();
      setScribeProfile(profile);

      // 2. Fetch Scribe's Applications/Invitations to build appMap and filter rejections
      const { data: myApps } = await supabase
        .from('scribe_applications')
        .select('*')
        .eq('scribe_id', session.user.id);

      const mapping = new Map<string, string>();
      const rejectedExams = new Set<number>();
      const rejectedAssignments = new Set<number>();

      (myApps || []).forEach((app: any) => {
        const typeStr = app.type || 'exam';
        mapping.set(`${app.request_id}_${typeStr}`, app.status);
        if (app.status === 'rejected') {
          if (typeStr === 'assignment') {
            rejectedAssignments.add(app.request_id);
          } else {
            rejectedExams.add(app.request_id);
          }
        }
      });
      setAppMap(mapping);

      // 3. Fetch Available Exams
      const { data: exams, error: examsErr } = await supabase
        .from('exam_requests')
        .select('*')
        .eq('status', 'pending')
        .order('created_at', { ascending: false });

      if (examsErr) throw examsErr;

      // 4. Fetch Available Assignments
      const { data: assignments, error: assignmentsErr } = await supabase
        .from('assignment_requests')
        .select('*')
        .eq('status', 'pending')
        .order('created_at', { ascending: false });

      if (assignmentsErr) throw assignmentsErr;

      // 5. Fetch all student reviews to calculate average ratings for prioritization
      const { data: studentReviews } = await supabase
        .from('student_reviews')
        .select('student_id, rating_overall');

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

      // 6. Fetch past matches to boost previously worked student requests
      const { data: pastMatches } = await supabase
        .from('exam_requests')
        .select('student_id')
        .eq('scribe_id', session.user.id);

      const pastStudentsSet = new Set((pastMatches || []).map((pm: any) => pm.student_id));

      // Filter and prioritize Exams
      const visibleExams = (exams || [])
        .filter((exam: any) => {
          if (rejectedExams.has(exam.id)) return false;
          if (exam.private_scribe_id && exam.private_scribe_id !== session.user.id) return false;
          return true;
        })
        .sort((a: any, b: any) => {
          const aEmergency = a.is_emergency === 'yes' ? 1 : 0;
          const bEmergency = b.is_emergency === 'yes' ? 1 : 0;
          if (aEmergency !== bEmergency) return bEmergency - aEmergency;

          const aPrivate = a.private_scribe_id === session.user.id ? 1 : 0;
          const bPrivate = b.private_scribe_id === session.user.id ? 1 : 0;
          if (aPrivate !== bPrivate) return bPrivate - aPrivate;

          const aPast = pastStudentsSet.has(a.student_id) ? 1 : 0;
          const bPast = pastStudentsSet.has(b.student_id) ? 1 : 0;
          if (aPast !== bPast) return bPast - aPast;

          const ratingA = getStudentAvgRating(a.student_id);
          const ratingB = getStudentAvgRating(b.student_id);
          return ratingB - ratingA;
        });

      // Filter and prioritize Assignments
      const visibleAssignments = (assignments || [])
        .filter((assign: any) => !rejectedAssignments.has(assign.id))
        .sort((a: any, b: any) => {
          const aPast = pastStudentsSet.has(a.student_id) ? 1 : 0;
          const bPast = pastStudentsSet.has(b.student_id) ? 1 : 0;
          if (aPast !== bPast) return bPast - aPast;

          const ratingA = getStudentAvgRating(a.student_id);
          const ratingB = getStudentAvgRating(b.student_id);
          return ratingB - ratingA;
        });

      setAvailableExams(visibleExams);
      setAvailableAssignments(visibleAssignments);
    } catch (error: any) {
      console.error('Error fetching scribe explore data:', error.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    fetchSession();
  };

  const isVerified = scribeProfile?.verification_status === 'approved';

  // Derive the time-of-day slot from a free-text exam_date like "24/07/2026 | 12:00 PM".
  // Returns 'Morning' | 'Afternoon' | 'Evening' or null when no time can be parsed.
  const getExamSlot = (examDate: string): 'Morning' | 'Afternoon' | 'Evening' | null => {
    if (!examDate) return null;
    const m = examDate.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
    if (!m) return null;
    let hour = parseInt(m[1], 10);
    const ampm = m[3].toUpperCase();
    if (ampm === 'PM' && hour !== 12) hour += 12;
    if (ampm === 'AM' && hour === 12) hour = 0;
    if (hour >= 5 && hour < 12) return 'Morning';
    if (hour >= 12 && hour < 17) return 'Afternoon';
    return 'Evening';
  };

  // Derive the weekday from the DD/MM/YYYY portion of a free-text exam_date.
  // Returns 'Mon'..'Sun' or null when the date can't be parsed.
  const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const getExamDay = (examDate: string): string | null => {
    if (!examDate) return null;
    const m = examDate.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (!m) return null;
    const day = parseInt(m[1], 10);
    const month = parseInt(m[2], 10) - 1;
    const year = parseInt(m[3], 10);
    const d = new Date(year, month, day);
    if (isNaN(d.getTime())) return null;
    return WEEKDAY_LABELS[d.getDay()];
  };

  const LANGUAGE_OPTIONS = ['All', 'English', 'Hindi', 'Gujarati'];
  const TYPE_OPTIONS = ['All', 'School', 'University', 'Competitive', 'Government'];
  const SLOT_OPTIONS = ['All', 'Morning', 'Afternoon', 'Evening'];
  const DAY_OPTIONS = ['All', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  // Parses a DD/MM/YYYY filter input into a Date at local midnight, or null when incomplete/invalid.
  const parseFilterDate = (value: string): Date | null => {
    const m = value.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (!m) return null;
    const day = parseInt(m[1], 10);
    const month = parseInt(m[2], 10) - 1;
    const year = parseInt(m[3], 10);
    const d = new Date(year, month, day);
    return isNaN(d.getTime()) ? null : d;
  };

  // Count of non-default (active) filters, shown on the collapsed filter bar.
  const activeFilterCount = [selectedLanguage, selectedType, selectedSlot, selectedDay]
    .filter(v => v !== 'All').length + (dateFrom.trim() ? 1 : 0) + (dateTo.trim() ? 1 : 0);

  const clearFilters = () => {
    setSelectedLanguage('All');
    setSelectedType('All');
    setSelectedSlot('All');
    setSelectedDay('All');
    setDateFrom('');
    setDateTo('');
  };

  // Apply search query and filters
  const filteredExams = availableExams.filter(exam => {
    // 1. Parse search query for potential date range/matching
    const dateParsed = parseSearchQueryForDates(searchQuery);
    
    // If we have parsed dates from search query, use them as extra date range constraints.
    // Otherwise fallback to filterDate controls.
    const fromDate = dateParsed.start || parseFilterDate(dateFrom);
    const toDate = dateParsed.end || parseFilterDate(dateTo);
    const actualSearchQuery = dateParsed.cleanQuery;

    const matchesSearch =
      !actualSearchQuery.trim() ||
      (exam.subject || '').toLowerCase().includes(actualSearchQuery.toLowerCase()) ||
      (exam.exam_venue || '').toLowerCase().includes(actualSearchQuery.toLowerCase()) ||
      (exam.exam_date || '').toLowerCase().includes(actualSearchQuery.toLowerCase());

    // exam_language may be a comma list (e.g. "English, Hindi") — match by substring.
    const matchesLanguage = selectedLanguage === 'All' ||
      (exam.exam_language || '').toLowerCase().includes(selectedLanguage.toLowerCase());

    // exam_type is stored like "University (Semester End Exam)" — match by prefix.
    // Older requests were saved under the previous label "College" — treat that as "University" too.
    const examTypePrefix = (exam.exam_type || '').trim().toLowerCase();
    const matchesType = selectedType === 'All' ||
      examTypePrefix.startsWith(selectedType.toLowerCase()) ||
      (selectedType === 'University' && examTypePrefix.startsWith('college'));

    // Time slot / day are derived from the free-text date; if unparseable, don't exclude.
    const slot = getExamSlot(exam.exam_date);
    const matchesSlot = selectedSlot === 'All' || slot === null || slot === selectedSlot;

    const day = getExamDay(exam.exam_date);
    const matchesDay = selectedDay === 'All' || day === null || day === selectedDay;

    // Date range (From/To, inclusive). If the exam date can't be parsed, don't exclude it.
    const examDay = parseExamDate(exam.exam_date);
    const matchesDateRange = (() => {
      if (!examDay) return true;
      if (fromDate && examDay < fromDate) return false;
      if (toDate) {
        const toEndOfDay = new Date(toDate.getFullYear(), toDate.getMonth(), toDate.getDate(), 23, 59, 59);
        if (examDay > toEndOfDay) return false;
      }
      return true;
    })();

    return matchesSearch && matchesLanguage && matchesType && matchesSlot && matchesDay && matchesDateRange;
  });

  // Segment by location (Nearby vs All Other)
  const scribeLocation = (scribeProfile?.location || '').trim().toLowerCase();
  
  const nearbyExams = filteredExams.filter(exam => {
    if (!scribeLocation) return false;
    const venue = (exam.exam_venue || '').toLowerCase();
    return venue.includes(scribeLocation);
  });

  const otherExams = filteredExams.filter(exam => {
    if (!scribeLocation) return true;
    const venue = (exam.exam_venue || '').toLowerCase();
    return !venue.includes(scribeLocation);
  });

  // Renders one labelled filter section as a wrapped row of selectable chips.
  const renderFilterSection = (
    label: string,
    options: string[],
    selected: string,
    onSelect: (value: string) => void
  ) => (
    <View style={{ marginBottom: 14 }}>
      <Text style={{ fontFamily: 'Roboto', fontSize: 11, fontWeight: '800', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>{label}</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
        {options.map((opt) => {
          const active = selected === opt;
          return (
            <TouchableOpacity
              key={opt}
              onPress={() => onSelect(opt)}
              style={{
                paddingHorizontal: 12,
                paddingVertical: 6,
                borderRadius: 10,
                backgroundColor: active ? '#059669' : '#f1f5f9',
                borderWidth: 1,
                borderColor: active ? '#059669' : '#e2e8f0'
              }}
            >
              <Text style={{ fontFamily: 'Roboto', fontSize: 11, fontWeight: '700', color: active ? '#ffffff' : '#475569' }}>
                {opt}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );

  const renderExamCard = (exam: ExamRequest) => {
    const examStatus = appMap.get(`${exam.id}_exam`);
    return (
      <TouchableOpacity 
        key={exam.id} 
        onPress={() => {
          if (isVerified) {
            router.push(`/console/scribe/apply?id=${exam.id}&type=exam` as any);
          } else {
            Alert.alert(t('error'), 'અરજી કરવા માટે કૃપા કરીને પહેલા તમારી ચકાસણી પૂર્ણ કરો.');
          }
        }}
        activeOpacity={0.9}
        style={{ 
          backgroundColor: '#f8fafc', 
          padding: 18, 
          borderRadius: 24, 
          borderWidth: 1, 
          borderColor: '#e2e8f0', 
          shadowColor: '#64748b', 
          shadowOffset: { width: 0, height: 4 }, 
          shadowOpacity: 0.08, 
          shadowRadius: 12, 
          elevation: 3, 
          marginBottom: 12 
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <View style={{ flex: 1, paddingRight: 8 }}>
            <Text style={{ fontFamily: 'Roboto', fontSize: 15, fontWeight: '900', color: '#0f172a' }}>{exam.subject}</Text>
            <Text style={{ fontFamily: 'Roboto', fontSize: 10, color: '#64748b', marginTop: 1 }}>{t('exam_level')}: {exam.exam_type}</Text>
          </View>
          <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            {exam.is_emergency === 'yes' && (
              <View style={{ paddingVertical: 4, paddingHorizontal: 10, borderRadius: 20, backgroundColor: '#fee2e2', borderWidth: 1, borderColor: '#fca5a5' }}>
                <Text style={{ fontFamily: 'Roboto', fontSize: 9, fontWeight: '900', color: '#b91c1c' }}>🚨 EMERGENCY SOS</Text>
              </View>
            )}
            {!!exam.private_scribe_id && (
              <View style={{ paddingVertical: 4, paddingHorizontal: 10, borderRadius: 20, backgroundColor: 'rgba(219,39,119,0.08)', borderWidth: 1, borderColor: 'rgba(219,39,119,0.2)' }}>
                <Text style={{ fontFamily: 'Roboto', fontSize: 9, fontWeight: '800', color: '#db2777' }}>💌 PRIVATE INVITE</Text>
              </View>
            )}
            {(() => {
              const tomorrow = new Date();
              tomorrow.setDate(tomorrow.getDate() + 1);
              const tomorrowStr = tomorrow.toISOString().split('T')[0];
              const examDateOnly = exam.exam_date ? exam.exam_date.split('|')[0].trim() : '';
              if (examDateOnly === tomorrowStr) {
                return (
                  <View style={{ paddingVertical: 4, paddingHorizontal: 10, borderRadius: 20, backgroundColor: 'rgba(239,68,68,0.08)', borderWidth: 1, borderColor: 'rgba(239,68,68,0.2)' }}>
                    <Text style={{ fontFamily: 'Roboto', fontSize: 9, fontWeight: '800', color: '#ef4444' }}>⚠️ URGENT</Text>
                  </View>
                );
              }
              return null;
            })()}
            {exam.is_prebooking === 'yes' && (
              <View style={{ paddingVertical: 4, paddingHorizontal: 10, borderRadius: 20, backgroundColor: 'rgba(37,99,235,0.08)', borderWidth: 1, borderColor: 'rgba(37,99,235,0.2)' }}>
                <Text style={{ fontFamily: 'Roboto', fontSize: 9, fontWeight: '800', color: '#2563eb' }}>PRE-BOOK</Text>
              </View>
            )}
            {(() => {
              if (examStatus === 'pending') {
                return (
                  <View style={{ paddingVertical: 4, paddingHorizontal: 10, borderRadius: 20, backgroundColor: 'rgba(245,158,11,0.08)', borderWidth: 1, borderColor: 'rgba(245,158,11,0.2)' }}>
                    <Text style={{ fontFamily: 'Roboto', fontSize: 9, fontWeight: '800', color: '#d97706' }}>APPLIED</Text>
                  </View>
                );
              }
              if (examStatus === 'invited') {
                return (
                  <View style={{ paddingVertical: 4, paddingHorizontal: 10, borderRadius: 20, backgroundColor: 'rgba(219,39,119,0.08)', borderWidth: 1, borderColor: 'rgba(219,39,119,0.2)' }}>
                    <Text style={{ fontFamily: 'Roboto', fontSize: 9, fontWeight: '800', color: '#db2777' }}>INVITED</Text>
                  </View>
                );
              }
              return (
                <View style={{ paddingVertical: 4, paddingHorizontal: 10, borderRadius: 20, backgroundColor: 'rgba(22,163,74,0.08)', borderWidth: 1, borderColor: 'rgba(22,163,74,0.2)' }}>
                  <Text style={{ fontFamily: 'Roboto', fontSize: 9, fontWeight: '800', color: '#16a34a' }}>PENDING</Text>
                </View>
              );
            })()}
          </View>
        </View>

        <View style={{ borderTopWidth: 1, borderTopColor: '#f1f5f9', paddingTop: 10, marginBottom: 4, gap: 6 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Feather name="user" size={12} color="#64748b" style={{ marginRight: 8 }} />
            <Text style={{ fontFamily: 'Roboto', color: '#475569', fontSize: 12 }}>
              {t('candidate_student')}: <Text style={{ fontWeight: '700', color: '#0f172a' }}>{exam.student_name} ({exam.education_grade})</Text>
            </Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Feather name="calendar" size={12} color="#64748b" style={{ marginRight: 8 }} />
            <Text style={{ fontFamily: 'Roboto', color: '#475569', fontSize: 12 }}>
              {t('exam_date')}: {exam.exam_date}
            </Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Feather name="map-pin" size={12} color="#64748b" style={{ marginRight: 8 }} />
            <Text style={{ fontFamily: 'Roboto', color: '#475569', fontSize: 12 }} numberOfLines={1}>
              {t('exam_venue')}: {exam.exam_venue}
            </Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Feather name="globe" size={12} color="#64748b" style={{ marginRight: 8 }} />
            <Text style={{ fontFamily: 'Roboto', color: '#475569', fontSize: 12 }}>
              {t('exam_language')}: {exam.exam_language}
            </Text>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  const renderAssignmentCard = (assign: any) => {
    const assignStatus = appMap.get(`${assign.id}_assignment`);
    return (
      <TouchableOpacity 
        key={assign.id} 
        onPress={() => {
          if (isVerified) {
            router.push(`/console/scribe/apply?id=${assign.id}&type=assignment` as any);
          } else {
            Alert.alert(t('error'), 'અરજી કરવા માટે કૃપા કરીને પહેલા તમારી ચકાસણી પૂર્ણ કરો.');
          }
        }}
        activeOpacity={0.9}
        style={{ 
          backgroundColor: '#f8fafc', 
          padding: 18, 
          borderRadius: 24, 
          borderWidth: 1, 
          borderColor: '#e2e8f0', 
          shadowColor: '#64748b', 
          shadowOffset: { width: 0, height: 4 }, 
          shadowOpacity: 0.08, 
          shadowRadius: 12, 
          elevation: 3, 
          marginBottom: 12 
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <View style={{ flex: 1, paddingRight: 8 }}>
            <Text style={{ fontFamily: 'Roboto', fontSize: 15, fontWeight: '900', color: '#0f172a' }}>{assign.subject}</Text>
            <Text style={{ fontFamily: 'Roboto', fontSize: 10, color: '#64748b', marginTop: 1 }}>Level: {assign.academic_level}</Text>
          </View>
          <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            {assignStatus === 'pending' && (
              <View style={{ paddingVertical: 4, paddingHorizontal: 10, borderRadius: 20, backgroundColor: 'rgba(245,158,11,0.08)', borderWidth: 1, borderColor: 'rgba(245,158,11,0.2)' }}>
                <Text style={{ fontFamily: 'Roboto', fontSize: 9, fontWeight: '800', color: '#d97706' }}>APPLIED</Text>
              </View>
            )}
            {assignStatus === 'invited' && (
              <View style={{ paddingVertical: 4, paddingHorizontal: 10, borderRadius: 20, backgroundColor: 'rgba(219,39,119,0.08)', borderWidth: 1, borderColor: 'rgba(219,39,119,0.2)' }}>
                <Text style={{ fontFamily: 'Roboto', fontSize: 9, fontWeight: '800', color: '#db2777' }}>INVITED</Text>
              </View>
            )}
            {!assignStatus && (
              <View style={{ paddingVertical: 4, paddingHorizontal: 10, borderRadius: 20, backgroundColor: 'rgba(22,163,74,0.08)', borderWidth: 1, borderColor: 'rgba(22,163,74,0.2)' }}>
                <Text style={{ fontFamily: 'Roboto', fontSize: 9, fontWeight: '800', color: '#16a34a' }}>OPEN</Text>
              </View>
            )}
          </View>
        </View>

        <View style={{ borderTopWidth: 1, borderTopColor: '#f1f5f9', paddingTop: 10, marginBottom: 4, gap: 6 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Feather name="file-text" size={12} color="#64748b" style={{ marginRight: 8 }} />
            <Text style={{ fontFamily: 'Roboto', color: '#475569', fontSize: 12 }}>
              Title: <Text style={{ fontWeight: '700', color: '#0f172a' }}>{assign.assignment_title}</Text>
            </Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Feather name="clock" size={12} color="#64748b" style={{ marginRight: 8 }} />
            <Text style={{ fontFamily: 'Roboto', color: '#475569', fontSize: 12 }}>
              Deadline: <Text style={{ fontWeight: '700', color: '#b45309' }}>{assign.deadline}</Text>
            </Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Feather name="user" size={12} color="#64748b" style={{ marginRight: 8 }} />
            <Text style={{ fontFamily: 'Roboto', color: '#475569', fontSize: 12 }}>
              Student: <Text style={{ fontWeight: '700', color: '#0f172a' }}>{assign.student_name}</Text>
            </Text>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  const filteredAssignments = availableAssignments.filter(assign => {
    const matchesSearch =
      !searchQuery.trim() ||
      (assign.subject || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (assign.assignment_title || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (assign.description || '').toLowerCase().includes(searchQuery.toLowerCase());
    return matchesSearch;
  });

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f9fafb' }}>
        <ActivityIndicator size="large" color="#16a34a" />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#f9fafb' }}>
      
      {/* Segment Switcher */}
      <View style={{ flexDirection: 'row', backgroundColor: '#e2e8f0', marginHorizontal: 24, marginTop: 16, padding: 3, borderRadius: 12 }}>
        <TouchableOpacity
          onPress={() => setActiveSegment('exams')}
          style={{ flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: 'center', backgroundColor: activeSegment === 'exams' ? '#fff' : 'transparent', shadowColor: activeSegment === 'exams' ? '#000' : undefined, shadowOpacity: activeSegment === 'exams' ? 0.05 : 0, elevation: activeSegment === 'exams' ? 2 : 0 }}
        >
          <Text style={{ fontFamily: 'Roboto', fontSize: 12, fontWeight: '900', color: activeSegment === 'exams' ? '#16a34a' : '#64748b' }}>Exam Matching</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => setActiveSegment('assignments')}
          style={{ flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: 'center', backgroundColor: activeSegment === 'assignments' ? '#fff' : 'transparent', shadowColor: activeSegment === 'assignments' ? '#000' : undefined, shadowOpacity: activeSegment === 'assignments' ? 0.05 : 0, elevation: activeSegment === 'assignments' ? 2 : 0 }}
        >
          <Text style={{ fontFamily: 'Roboto', fontSize: 12, fontWeight: '900', color: activeSegment === 'assignments' ? '#16a34a' : '#64748b' }}>Assignment Writing</Text>
        </TouchableOpacity>
      </View>

      {/* Search Header Bar */}
      <View style={{ paddingHorizontal: 24, paddingTop: 12, paddingBottom: 10, gap: 10 }}>
        
        {/* Search Input */}
        <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 16, borderWidth: 1.5, borderColor: 'rgba(0,0,0,0.06)', paddingHorizontal: 12, height: 46 }}>
          <Feather name="search" size={16} color="#94a3b8" style={{ marginRight: 8 }} />
          <TextInput
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder={activeSegment === 'exams' ? "Search subject or venue..." : "Search subject or title..."}
            placeholderTextColor="#94a3b8"
            style={{ flex: 1, fontSize: 13, color: '#0f172a', fontWeight: '600' }}
          />
          {searchQuery ? (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <Feather name="x" size={16} color="#94a3b8" />
            </TouchableOpacity>
          ) : null}
        </View>

        {/* Collapsible Filter Block (Exams Only) */}
        {activeSegment === 'exams' && (
          <View style={{ backgroundColor: '#fff', borderRadius: 16, borderWidth: 1.5, borderColor: 'rgba(0,0,0,0.06)', overflow: 'hidden' }}>
            {/* Toggle bar */}
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={() => setShowFilters(!showFilters)}
              style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 12 }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Feather name="sliders" size={15} color="#16a34a" />
                <Text style={{ fontSize: 13, fontWeight: '800', color: '#0f172a' }}>Filters</Text>
                {activeFilterCount > 0 && (
                  <View style={{ minWidth: 18, height: 18, borderRadius: 9, backgroundColor: '#16a34a', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5 }}>
                    <Text style={{ fontSize: 10, fontWeight: '800', color: '#fff' }}>{activeFilterCount}</Text>
                  </View>
                )}
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                {activeFilterCount > 0 && (
                  <TouchableOpacity onPress={clearFilters} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <Text style={{ fontSize: 11, fontWeight: '700', color: '#dc2626' }}>Clear all</Text>
                  </TouchableOpacity>
                )}
                <Feather name={showFilters ? 'chevron-up' : 'chevron-down'} size={18} color="#64748b" />
              </View>
            </TouchableOpacity>

            {/* Expandable sections */}
            {showFilters && (
              <View style={{ paddingHorizontal: 14, paddingBottom: 14, paddingTop: 2, borderTopWidth: 1, borderTopColor: '#f1f5f9', gap: 12 }}>
                {renderFilterSection('Language', LANGUAGE_OPTIONS, selectedLanguage, setSelectedLanguage)}
                {renderFilterSection('Exam Type', TYPE_OPTIONS, selectedType, setSelectedType)}
                {renderFilterSection('Time Slot', SLOT_OPTIONS, selectedSlot, setSelectedSlot)}
                {renderFilterSection('Day', DAY_OPTIONS, selectedDay, setSelectedDay)}

                {/* Exam Date Range */}
                <View>
                  <Text style={{ fontSize: 10, fontWeight: '800', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 7 }}>
                    Exam Date Range
                  </Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: '#f8fafc', borderRadius: 10, borderWidth: 1, borderColor: 'rgba(0,0,0,0.06)', paddingHorizontal: 10, height: 38 }}>
                      <TextInput
                        value={dateFrom}
                        onChangeText={setDateFrom}
                        placeholder="From DD/MM/YYYY"
                        placeholderTextColor="#94a3b8"
                        keyboardType="numbers-and-punctuation"
                        style={{ flex: 1, fontSize: 11, color: '#0f172a', fontWeight: '600' }}
                      />
                    </View>
                    <Text style={{ fontSize: 11, color: '#94a3b8', fontWeight: '700' }}>–</Text>
                    <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: '#f8fafc', borderRadius: 10, borderWidth: 1, borderColor: 'rgba(0,0,0,0.06)', paddingHorizontal: 10, height: 38 }}>
                      <TextInput
                        value={dateTo}
                        onChangeText={setDateTo}
                        placeholder="To DD/MM/YYYY"
                        placeholderTextColor="#94a3b8"
                        keyboardType="numbers-and-punctuation"
                        style={{ flex: 1, fontSize: 11, color: '#0f172a', fontWeight: '600' }}
                      />
                    </View>
                  </View>
                </View>
              </View>
            )}
          </View>
        )}
      </View>

      {/* Main Opportunities List */}
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 10, paddingBottom: 40 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#16a34a']} />
        }
      >
        
        {/* Scribe's Preferred Availability Windows */}
        {activeSegment === 'exams' && scribeProfile?.availability_slots ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6, backgroundColor: '#f8fafc', borderRadius: 16, borderWidth: 1, borderColor: '#e2e8f0', paddingHorizontal: 12, paddingVertical: 10, marginBottom: 14 }}>
            <Feather name="clock" size={13} color="#16a34a" style={{ marginRight: 2 }} />
            <Text style={{ fontSize: 10, fontWeight: '800', color: '#475569', textTransform: 'uppercase', letterSpacing: 0.3, marginRight: 4 }}>
              Your Slots:
            </Text>
            {String(scribeProfile.availability_slots).split(',').map((slot: string) => slot.trim()).filter(Boolean).map((slot: string) => (
              <View key={slot} style={{ paddingVertical: 3, paddingHorizontal: 9, borderRadius: 12, backgroundColor: 'rgba(22,163,74,0.08)', borderWidth: 1, borderColor: 'rgba(22,163,74,0.18)' }}>
                <Text style={{ fontSize: 10, fontWeight: '700', color: '#16a34a' }}>{slot}</Text>
              </View>
            ))}
          </View>
        ) : null}

        {activeSegment === 'exams' ? (
          <>
            {/* Nearby Opportunities Segment */}
            {!!scribeLocation && nearbyExams.length > 0 && (
              <View style={{ marginBottom: 18 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 }}>
                  <Ionicons name="location" size={15} color="#16a34a" />
                  <Text style={{ fontFamily: 'Roboto', color: '#16a34a', fontWeight: '900', fontSize: 13, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                    Opportunities Near You ({scribeProfile?.location})
                  </Text>
                </View>
                {nearbyExams.map(renderExamCard)}
              </View>
            )}

            {/* Other / General Opportunities Segment */}
            <View>
              <Text style={{ fontFamily: 'Roboto', color: '#475569', fontWeight: '800', fontSize: 13, marginBottom: 10 }}>
                {scribeLocation && nearbyExams.length > 0 ? 'All Other Opportunities' : t('available_opportunities')}
              </Text>
              
              {filteredExams.length === 0 ? (
                <View style={{ backgroundColor: '#f8fafc', padding: 32, borderRadius: 24, borderWidth: 1, borderColor: '#e2e8f0', alignItems: 'center', justifyContent: 'center' }}>
                  <Feather name="search" size={26} color="#94a3b8" />
                  <Text style={{ fontFamily: 'Roboto', fontSize: 15, fontWeight: '900', color: '#0f172a', marginTop: 10 }}>No matching exams</Text>
                  <Text style={{ fontFamily: 'Roboto', fontSize: 11, color: '#64748b', marginTop: 4, textAlign: 'center', lineHeight: 16 }}>
                    Try adjusting your search query or filter selections.
                  </Text>
                </View>
              ) : (
                (scribeLocation && nearbyExams.length > 0 ? otherExams : filteredExams).map(renderExamCard)
              )}
            </View>
          </>
        ) : (
          <View>
            <Text style={{ fontFamily: 'Roboto', color: '#475569', fontWeight: '800', fontSize: 13, marginBottom: 10 }}>
              Available Assignments
            </Text>
            
            {filteredAssignments.length === 0 ? (
              <View style={{ backgroundColor: '#f8fafc', padding: 32, borderRadius: 24, borderWidth: 1, borderColor: '#e2e8f0', alignItems: 'center', justifyContent: 'center' }}>
                <Feather name="search" size={26} color="#94a3b8" />
                <Text style={{ fontFamily: 'Roboto', fontSize: 15, fontWeight: '900', color: '#0f172a', marginTop: 10 }}>No matching assignments</Text>
                <Text style={{ fontFamily: 'Roboto', fontSize: 11, color: '#64748b', marginTop: 4, textAlign: 'center', lineHeight: 16 }}>
                  Try adjusting your search query.
                </Text>
              </View>
            ) : (
              filteredAssignments.map(renderAssignmentCard)
            )}
          </View>
        )}

      </ScrollView>

    </View>
  );
}
