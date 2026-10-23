import React, { useState, useCallback, useEffect } from 'react';
import { View, Text, ScrollView, ActivityIndicator, RefreshControl, TouchableOpacity, TextInput, Alert, Platform, Modal } from 'react-native';
import { Feather, Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { supabase } from '@/core/supabase';
import { useLanguage } from '@/core/translation';
import { parseExamDate } from '@/core/examDate';
import DateRangeCalendarModal from '@/components/modals/DateRangeCalendarModal';
import Animated, { FadeInDown, useReducedMotion } from 'react-native-reanimated';
import { gradient, SCRIBE_THEME as THEME } from '@/core/portalTheme';
import { DesktopGrid, useInDesktopShell } from '@/components/ui/DesktopShell';
import { useTabActive } from '@/components/ui/TabPane';
import { readScreenCache, writeScreenCache } from '@/core/screenCache';
import { openGoogleMaps } from '@/core/maps';

// Hides the browser's default focus ring on web; the search box's border shows focus instead.
const WEB_NO_OUTLINE = (Platform.OS === 'web' ? { outlineStyle: 'none' } : {}) as object;

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
  google_maps_url?: string;
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

/** Everything the Search tab shows, cached so the next visit paints instantly (see core/screenCache). */
interface ExploreSnapshot {
  profile: any;
  appMapEntries: [string, string][];   // Map isn't JSON-serialisable, so entries are stored
  exams: ExamRequest[];
  assignments: any[];
}

export default function ScribeExploreView() {
  // Inside the desktop console: no own page background, wider layout (see ui/DesktopShell).
  const inShell = useInDesktopShell();
  const { t } = useLanguage();
  // True while this tab is visible (TabPane keep-alive) — data refreshes only then.
  const isActive = useTabActive();
  // Blocks and cards rise in one after another (off with Reduce Motion).
  const reduceMotion = useReducedMotion();
  const rise = (index: number) => (reduceMotion ? undefined : FadeInDown.delay(Math.min(index, 6) * 70).duration(420));
  const [searchFocused, setSearchFocused] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeSegment, setActiveSegment] = useState<'exams' | 'assignments'>('exams');
  const [availableExams, setAvailableExams] = useState<ExamRequest[]>([]);
  const [availableAssignments, setAvailableAssignments] = useState<any[]>([]);
  const [appMap, setAppMap] = useState<Map<string, string>>(new Map());
  const [scribeProfile, setScribeProfile] = useState<any>(null);
  
  // Search & Filter state (multi-select arrays)
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedLanguages, setSelectedLanguages] = useState<string[]>([]);
  const [selectedTypes, setSelectedTypes] = useState<string[]>([]);
  const [selectedSlots, setSelectedSlots] = useState<string[]>([]);
  const [selectedDays, setSelectedDays] = useState<string[]>([]);
  const [sosOnly, setSosOnly] = useState(false);
  const [showSosInfoModal, setShowSosInfoModal] = useState(false);
  const [showFilters, setShowFilters] = useState(false);

  // Date-range filter (DD/MM/YYYY text inputs, inclusive on both ends)
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  // Assignment-specific filters (multi-select)
  const [selectedAssignmentLevels, setSelectedAssignmentLevels] = useState<string[]>([]);
  const [deadlineFrom, setDeadlineFrom] = useState('');
  const [deadlineTo, setDeadlineTo] = useState('');

  // Which date range picker is currently open: 'exam' | 'deadline' | null
  const [showDateRangeModal, setShowDateRangeModal] = useState<null | 'exam' | 'deadline'>(null);

  /** Formats a compact display string for the single-row date range filter pill. */
  const formatRangeLabel = (fromStr: string, toStr: string) => {
    if (!fromStr && !toStr) return 'All Dates';
    const parse = (s: string) => {
      const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
      if (!m) return null;
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      return `${parseInt(m[1], 10)} ${months[parseInt(m[2], 10) - 1]}`;
    };
    const f = parse(fromStr);
    const t = parse(toStr);
    if (f && t) {
      if (f === t) return f;
      return `${f} – ${t}`;
    }
    if (f) return `From ${f}`;
    if (t) return `To ${t}`;
    return fromStr || toStr;
  };

  // Active dropdown modal picker state (for single-row concise multi-select filters)
  const [activeDropdown, setActiveDropdown] = useState<{
    title: string;
    icon?: keyof typeof Feather.glyphMap;
    options: string[];
    selected: string[];
    onSelect: (val: string[]) => void;
  } | null>(null);

  const [expandedExamIds, setExpandedExamIds] = useState<Set<number>>(new Set());
  const [expandedAssignmentIds, setExpandedAssignmentIds] = useState<Set<number>>(new Set());

  const toggleExamCard = (id: number) => {
    setExpandedExamIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleAssignmentCard = (id: number) => {
    setExpandedAssignmentIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  // Preload explore opportunities in background immediately on mount
  useEffect(() => {
    fetchSession();
  }, []);

  // Refresh whenever the console is focused and this tab is visible
  useFocusEffect(
    useCallback(() => {
      if (!isActive) return;
      fetchSession();
    }, [isActive])
  );

  /** Puts a snapshot (cached or freshly fetched) on screen. */
  const applySnapshot = (snap: ExploreSnapshot) => {
    setScribeProfile(snap.profile);
    setAppMap(new Map(snap.appMapEntries));
    setAvailableExams(snap.exams);
    setAvailableAssignments(snap.assignments);
  };

  /**
   * Loads the Search tab: shows the cached snapshot instantly, then fetches all six data sets in
   * parallel (each depends only on the scribe's id), ranks the results and caches them.
   */
  const fetchSession = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const userId = session.user.id;

      const cached = await readScreenCache<ExploreSnapshot>('scribe_explore', userId);
      if (cached) {
        applySnapshot(cached);
        setLoading(false);
      }

      const [
        { data: profile },                           // scribe profile (location for "near you")
        { data: myApps },                            // this scribe's applications/invitations
        { data: exams, error: examsErr },            // open exam requests
        { data: assignments, error: assignmentsErr },// open assignment requests
        { data: studentReviews },                    // ratings used to prioritise students
        { data: pastMatches },                       // students this scribe worked with before
      ] = await Promise.all([
        supabase.from('profiles').select('*').eq('id', userId).single(),
        supabase.from('scribe_applications').select('*').eq('scribe_id', userId),
        supabase.from('exam_requests').select('*').eq('status', 'pending').order('created_at', { ascending: false }),
        supabase.from('assignment_requests').select('*').eq('status', 'pending').order('created_at', { ascending: false }),
        supabase.from('student_reviews').select('student_id, rating_overall'),
        supabase.from('exam_requests').select('student_id').eq('scribe_id', userId),
      ]);
      if (examsErr) throw examsErr;
      if (assignmentsErr) throw assignmentsErr;

      // Application status per request ("123_exam" → "pending" | "invited" | ...) and rejections to hide
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

      // Average rating per student (no reviews → maximum, so new students aren't buried)
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

      // Exams: SOS → private invite for this scribe → past student → student rating
      const visibleExams = (exams || [])
        .filter((exam: any) => {
          if (rejectedExams.has(exam.id)) return false;
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

      // Assignments: past student → student rating
      const visibleAssignments = (assignments || [])
        .filter((assign: any) => !rejectedAssignments.has(assign.id))
        .sort((a: any, b: any) => {
          const aPast = pastStudentsSet.has(a.student_id) ? 1 : 0;
          const bPast = pastStudentsSet.has(b.student_id) ? 1 : 0;
          if (aPast !== bPast) return bPast - aPast;
          return getStudentAvgRating(b.student_id) - getStudentAvgRating(a.student_id);
        });

      const snapshot: ExploreSnapshot = {
        profile,
        appMapEntries: Array.from(mapping.entries()),
        exams: visibleExams,
        assignments: visibleAssignments,
      };
      applySnapshot(snapshot);
      writeScreenCache('scribe_explore', userId, snapshot);
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

  const LANGUAGE_OPTIONS = ['English', 'Hindi', 'Gujarati'];
  const TYPE_OPTIONS = ['School', 'University', 'Competitive', 'Government'];
  const SLOT_OPTIONS = ['Morning', 'Afternoon', 'Evening'];
  const DAY_OPTIONS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const ASSIGNMENT_LEVEL_OPTIONS = ['School', 'University', 'Competitive'];

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
  const activeFilterCount =
    (selectedLanguages.length > 0 ? 1 : 0) +
    (selectedTypes.length > 0 ? 1 : 0) +
    (selectedSlots.length > 0 ? 1 : 0) +
    (selectedDays.length > 0 ? 1 : 0) +
    (dateFrom.trim() ? 1 : 0) +
    (dateTo.trim() ? 1 : 0) +
    (sosOnly ? 1 : 0);

  const activeAssignmentFilterCount =
    (selectedAssignmentLevels.length > 0 ? 1 : 0) +
    (deadlineFrom.trim() ? 1 : 0) +
    (deadlineTo.trim() ? 1 : 0);

  const clearFilters = () => {
    setSelectedLanguages([]);
    setSelectedTypes([]);
    setSelectedSlots([]);
    setSelectedDays([]);
    setDateFrom('');
    setDateTo('');
    setSosOnly(false);
  };

  const clearAssignmentFilters = () => {
    setSelectedAssignmentLevels([]);
    setDeadlineFrom('');
    setDeadlineTo('');
  };

  // Apply search query and filters
  const filteredExams = availableExams.filter(exam => {
    // 0. SOS Emergency filter
    if (sosOnly && exam.is_emergency !== 'yes') {
      return false;
    }

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

    // exam_language may be a comma list (e.g. "English, Hindi") — match by any selected language.
    const matchesLanguage = selectedLanguages.length === 0 ||
      selectedLanguages.some(lang => (exam.exam_language || '').toLowerCase().includes(lang.toLowerCase()));

    // exam_type is stored like "University (Semester End Exam)" — match by prefix for any selected type.
    const examTypePrefix = (exam.exam_type || '').trim().toLowerCase();
    const matchesType = selectedTypes.length === 0 ||
      selectedTypes.some(type => {
        const tLower = type.toLowerCase();
        return examTypePrefix.startsWith(tLower) || (type === 'University' && examTypePrefix.startsWith('college'));
      });

    // Time slot / day are derived from the free-text date; if unparseable, don't exclude.
    const slot = getExamSlot(exam.exam_date);
    const matchesSlot = selectedSlots.length === 0 || slot === null || selectedSlots.includes(slot);

    const day = getExamDay(exam.exam_date);
    const matchesDay = selectedDays.length === 0 || day === null || selectedDays.includes(day);

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

  const DAY_LABELS: Record<string, string> = {
    Mon: 'Monday',
    Tue: 'Tuesday',
    Wed: 'Wednesday',
    Thu: 'Thursday',
    Fri: 'Friday',
    Sat: 'Saturday',
    Sun: 'Sunday',
  };

  // Renders one concise filter field as a single row with a dropdown selector button on the right.
  const renderDropdownRow = (
    label: string,
    iconName: keyof typeof Feather.glyphMap,
    options: string[],
    selected: string[],
    onSelect: (value: string[]) => void
  ) => {
    const isFiltered = selected.length > 0;
    const displayValue = (() => {
      if (selected.length === 0) return t('filter_all');
      if (selected.length === 1) return DAY_LABELS[selected[0]] || selected[0];
      if (selected.length === 2) {
        const first = DAY_LABELS[selected[0]] || selected[0];
        const second = DAY_LABELS[selected[1]] || selected[1];
        const combined = `${first}, ${second}`;
        if (combined.length <= 16) return combined;
      }
      return `${selected.length} Selected`;
    })();

    return (
      <View
        key={label}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingVertical: 10,
          minHeight: 44,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}>
          <View
            style={{
              width: 28,
              height: 28,
              borderRadius: 8,
              backgroundColor: isFiltered ? '#dcfce7' : '#f1f5f9',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Feather name={iconName} size={14} color={isFiltered ? '#16a34a' : '#64748b'} />
          </View>
          <Text
            style={{
              fontFamily: 'Roboto',
              fontSize: 13,
              fontWeight: '700',
              color: isFiltered ? '#0f172a' : '#334155',
            }}
          >
            {label}
          </Text>
        </View>

        <TouchableOpacity
          testID={`filter-dropdown-${label.toLowerCase().replace(/\s+/g, '-')}`}
          activeOpacity={0.7}
          onPress={() => setActiveDropdown({
            title: label,
            icon: iconName,
            options,
            selected,
            onSelect,
          })}
          accessibilityRole="button"
          accessibilityLabel={`${label}: ${displayValue}`}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 8,
            paddingHorizontal: 12,
            paddingVertical: 7,
            borderRadius: 10,
            backgroundColor: isFiltered ? '#f0fdf4' : '#f8fafc',
            borderWidth: 1.5,
            borderColor: isFiltered ? '#16a34a' : '#e2e8f0',
            minWidth: 110,
          }}
        >
          <Text
            numberOfLines={1}
            style={{
              fontFamily: 'Roboto',
              fontSize: 12,
              fontWeight: isFiltered ? '800' : '600',
              color: isFiltered ? '#15803d' : '#475569',
              maxWidth: 130,
            }}
          >
            {displayValue}
          </Text>
          <Feather name="chevron-down" size={14} color={isFiltered ? '#16a34a' : '#94a3b8'} />
        </TouchableOpacity>
      </View>
    );
  };

  const renderExamCard = (exam: ExamRequest, index = 0) => {
    const examStatus = appMap.get(`${exam.id}_exam`);
    const isExpanded = expandedExamIds.has(exam.id);
    const isEmergency = exam.is_emergency === 'yes';
    const isVerified = scribeProfile?.verification_status === 'approved';

    return (
      <Animated.View
        key={exam.id}
        entering={rise(index + 3)}
        style={{
          backgroundColor: isEmergency ? '#fffdfd' : '#ffffff',
          borderRadius: 20,
          borderWidth: 1.5,
          borderColor: isEmergency ? '#fca5a5' : (exam.private_scribe_id ? '#fbcfe8' : '#e2e8f0'),
          shadowColor: '#0f172a', 
          shadowOffset: { width: 0, height: 4 }, 
          shadowOpacity: 0.05, 
          shadowRadius: 12, 
          elevation: 2, 
          marginBottom: 12,
          overflow: 'hidden'
        }}
      >
        {/* Top Banner for Private Invitations */}
        {!!exam.private_scribe_id && (
          <View style={{ backgroundColor: '#fdf2f8', paddingVertical: 6, paddingHorizontal: 14, borderBottomWidth: 1, borderBottomColor: '#fbcfe8', flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Feather name="lock" size={12} color="#db2777" />
            <Text style={{ fontFamily: 'Roboto', fontSize: 11, fontWeight: '900', color: '#db2777', textTransform: 'uppercase', letterSpacing: 0.5 }}>
              {t('private_invitation_banner')}
            </Text>
          </View>
        )}
        {/* ── Collapsed Header Row ── */}
        <TouchableOpacity
          onPress={() => toggleExamCard(exam.id)}
          activeOpacity={0.8}
          style={{
            flexDirection: 'row', alignItems: 'center',
            paddingHorizontal: 16, paddingVertical: 14, gap: 12,
          }}
        >
          {/* Subject icon */}
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
              color={isEmergency ? '#dc2626' : '#2563eb'}
            />
          </View>

          {/* Subject Name */}
          <View style={{ flex: 1 }}>
            <Text style={{ fontFamily: 'Roboto', fontSize: 15, fontWeight: '800', color: '#0f172a', letterSpacing: -0.2 }} numberOfLines={1}>
              {exam.subject || t('exams')}
            </Text>
          </View>

          {/* Badges container */}
          <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end', alignItems: 'center' }}>
            {isEmergency && (
              <View style={{ paddingVertical: 3.5, paddingHorizontal: 9, borderRadius: 999, backgroundColor: '#fef2f2', borderWidth: 1, borderColor: '#fca5a5' }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                  <Ionicons name="flash" size={9} color="#dc2626" />
                  <Text style={{ fontFamily: 'Roboto', fontSize: 9, fontWeight: '900', color: '#dc2626', letterSpacing: 0.4 }}>{t('status_sos')}</Text>
                </View>
              </View>
            )}
            {!!exam.private_scribe_id && (
              <View style={{ paddingVertical: 3.5, paddingHorizontal: 9, borderRadius: 999, backgroundColor: '#fdf2f8', borderWidth: 1, borderColor: '#fbcfe8' }}>
                <Text style={{ fontFamily: 'Roboto', fontSize: 9, fontWeight: '800', color: '#db2777', letterSpacing: 0.4 }}>{t('status_invited').toUpperCase()}</Text>
              </View>
            )}
            {(() => {
              if (examStatus === 'pending') {
                return (
                  <View style={{ paddingVertical: 3.5, paddingHorizontal: 9, borderRadius: 999, backgroundColor: '#fffbeb', borderWidth: 1, borderColor: '#fde68a' }}>
                    <Text style={{ fontFamily: 'Roboto', fontSize: 9, fontWeight: '800', color: '#d97706', letterSpacing: 0.4 }}>{t('status_pending').toUpperCase()}</Text>
                  </View>
                );
              }
              if (examStatus === 'invited') {
                return (
                  <View style={{ paddingVertical: 3.5, paddingHorizontal: 9, borderRadius: 999, backgroundColor: '#fdf2f8', borderWidth: 1, borderColor: '#fbcfe8' }}>
                    <Text style={{ fontFamily: 'Roboto', fontSize: 9, fontWeight: '800', color: '#db2777', letterSpacing: 0.4 }}>{t('status_invited').toUpperCase()}</Text>
                  </View>
                );
              }
              return null;
            })()}

            {/* Circular Chevron Button */}
            <View style={{
              width: 28, height: 28, borderRadius: 14,
              backgroundColor: '#f8fafc',
              alignItems: 'center', justifyContent: 'center',
              borderWidth: 1, borderColor: '#f1f5f9',
              marginLeft: 2
            }}>
              <Feather
                name={isExpanded ? 'chevron-up' : 'chevron-down'}
                size={15} color="#64748b"
              />
            </View>
          </View>
        </TouchableOpacity>

        {/* ── Expanded Detail Panel ── */}
        {isExpanded && (
          <View style={{ borderTopWidth: 1, borderTopColor: '#f1f5f9', paddingHorizontal: 16, paddingTop: 12, paddingBottom: 14, gap: 12 }}>
            <View style={{ gap: 6 }}>
              {/* 1. Level of exam */}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Feather name="award" size={12} color="#64748b" style={{ width: 14 }} />
                <Text style={{ fontFamily: 'Roboto', fontSize: 12, fontWeight: '600', color: '#475569' }}>
                  {t('exam_level')}: {exam.exam_type}
                </Text>
              </View>

              {/* 2. Date and time */}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Feather name="calendar" size={12} color="#64748b" style={{ width: 14 }} />
                <Text style={{ fontFamily: 'Roboto', fontSize: 12, fontWeight: '600', color: '#475569' }}>
                  {t('date_time')}: {exam.exam_date}
                </Text>
              </View>

              {/* 3. Location */}
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1, marginRight: 8 }}>
                  <Feather name="map-pin" size={12} color="#64748b" style={{ width: 14 }} />
                  <Text style={{ fontFamily: 'Roboto', fontSize: 12, fontWeight: '600', color: '#475569' }} numberOfLines={1}>
                    {t('location')}: {exam.exam_venue}
                  </Text>
                </View>
                {exam.exam_venue ? (
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

              {/* 4. Student profile */}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Feather name="user" size={12} color="#64748b" style={{ width: 14 }} />
                <Text style={{ fontFamily: 'Roboto', color: '#475569', fontSize: 12, fontWeight: '600' }}>
                  {t('student_prefix')}{exam.student_name} ({exam.education_grade})
                </Text>
              </View>

              {/* 5. Language */}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Feather name="globe" size={12} color="#64748b" style={{ width: 14 }} />
                <Text style={{ fontFamily: 'Roboto', color: '#475569', fontSize: 12, fontWeight: '600' }}>
                  {t('language')}: {exam.exam_language}
                </Text>
              </View>
            </View>

            {/* Apply Action Button */}
            <TouchableOpacity 
              onPress={() => {
                if (isVerified) {
                  router.push(`/console/scribe/apply?id=${exam.id}&type=exam` as any);
                } else {
                  Alert.alert(t('error'), t('verify_first_error'));
                }
              }}
              style={{
                width: '100%',
                backgroundColor: THEME.solid,
                ...gradient(THEME.buttonGradient),
                paddingVertical: 12,
                borderRadius: 12,
                alignItems: 'center',
                justifyContent: 'center',
                flexDirection: 'row',
                gap: 6,
                shadowColor: THEME.shadow,
                shadowOffset: { width: 0, height: 4 },
                shadowOpacity: 0.2,
                shadowRadius: 8,
                elevation: 2,
              }}
            >
              <Feather name="file-text" size={13} color="#ffffff" />
              <Text style={{ fontFamily: 'Roboto', color: '#ffffff', fontWeight: '800', fontSize: 12.5 }}>{t('view_details_apply')}</Text>
            </TouchableOpacity>
          </View>
        )}
      </Animated.View>
    );
  };

  const renderAssignmentCard = (assign: any, index = 0) => {
    const assignStatus = appMap.get(`${assign.id}_assignment`);
    const isExpanded = expandedAssignmentIds.has(assign.id);
    const isVerified = scribeProfile?.verification_status === 'approved';

    return (
      <Animated.View
        key={assign.id}
        entering={rise(index + 3)}
        style={{
          backgroundColor: '#ffffff',
          borderRadius: 20,
          borderWidth: 1.5,
          borderColor: '#e2e8f0',
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
          onPress={() => toggleAssignmentCard(assign.id)}
          activeOpacity={0.8}
          style={{
            flexDirection: 'row', alignItems: 'center',
            paddingHorizontal: 16, paddingVertical: 14, gap: 12,
          }}
        >
          {/* Assignment icon */}
          <View style={{
            width: 42, height: 42, borderRadius: 13,
            backgroundColor: '#fff7ed',
            alignItems: 'center', justifyContent: 'center',
            borderWidth: 1,
            borderColor: '#ffedd5',
          }}>
            <Feather name="file-text" size={17} color="#ea580c" />
          </View>

          {/* Subject Name */}
          <View style={{ flex: 1 }}>
            <Text style={{ fontFamily: 'Roboto', fontSize: 15, fontWeight: '800', color: '#0f172a', letterSpacing: -0.2 }} numberOfLines={1}>
              {assign.subject || t('assignments')}
            </Text>
          </View>

          {/* Badges container */}
          <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end', alignItems: 'center' }}>
            {assignStatus === 'pending' && (
              <View style={{ paddingVertical: 3.5, paddingHorizontal: 9, borderRadius: 999, backgroundColor: '#fffbeb', borderWidth: 1, borderColor: '#fde68a' }}>
                <Text style={{ fontFamily: 'Roboto', fontSize: 9, fontWeight: '800', color: '#d97706', letterSpacing: 0.4 }}>{t('status_pending').toUpperCase()}</Text>
              </View>
            )}
            {assignStatus === 'invited' && (
              <View style={{ paddingVertical: 3.5, paddingHorizontal: 9, borderRadius: 999, backgroundColor: '#fdf2f8', borderWidth: 1, borderColor: '#fbcfe8' }}>
                <Text style={{ fontFamily: 'Roboto', fontSize: 9, fontWeight: '800', color: '#db2777', letterSpacing: 0.4 }}>{t('status_invited').toUpperCase()}</Text>
              </View>
            )}

            {/* Circular Chevron Button */}
            <View style={{
              width: 28, height: 28, borderRadius: 14,
              backgroundColor: '#f8fafc',
              alignItems: 'center', justifyContent: 'center',
              borderWidth: 1, borderColor: '#f1f5f9',
              marginLeft: 2
            }}>
              <Feather
                name={isExpanded ? 'chevron-up' : 'chevron-down'}
                size={15} color="#64748b"
              />
            </View>
          </View>
        </TouchableOpacity>

        {/* ── Expanded Detail Panel ── */}
        {isExpanded && (
          <View style={{ borderTopWidth: 1, borderTopColor: '#f1f5f9', paddingHorizontal: 16, paddingTop: 12, paddingBottom: 14, gap: 12 }}>
            <View style={{ gap: 6 }}>
              {/* 1. Title */}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Feather name="file-text" size={12} color="#64748b" style={{ width: 14 }} />
                <Text style={{ fontFamily: 'Roboto', fontSize: 12, fontWeight: '600', color: '#475569' }}>
                  {t('title')}: {assign.assignment_title}
                </Text>
              </View>

              {/* 2. Level */}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Feather name="award" size={12} color="#64748b" style={{ width: 14 }} />
                <Text style={{ fontFamily: 'Roboto', fontSize: 12, fontWeight: '600', color: '#475569' }}>
                  {t('academic_level')}: {assign.academic_level}
                </Text>
              </View>

              {/* 3. Deadline */}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Feather name="clock" size={12} color="#64748b" style={{ width: 14 }} />
                <Text style={{ fontFamily: 'Roboto', fontSize: 12, fontWeight: '600', color: '#475569' }}>
                  {t('deadline_prefix')}{assign.deadline}
                </Text>
              </View>

              {/* 4. Student */}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Feather name="user" size={12} color="#64748b" style={{ width: 14 }} />
                <Text style={{ fontFamily: 'Roboto', color: '#475569', fontSize: 12, fontWeight: '600' }}>
                  {t('student_prefix')}{assign.student_name}
                </Text>
              </View>
            </View>

            {/* Apply Action Button */}
            <TouchableOpacity 
              onPress={() => {
                if (isVerified) {
                  router.push(`/console/scribe/apply?id=${assign.id}&type=assignment` as any);
                } else {
                  Alert.alert(t('error'), t('verify_first_error'));
                }
              }}
              style={{
                width: '100%',
                backgroundColor: THEME.solid,
                ...gradient(THEME.buttonGradient),
                paddingVertical: 12,
                borderRadius: 12,
                alignItems: 'center',
                justifyContent: 'center',
                flexDirection: 'row',
                gap: 6,
                shadowColor: THEME.shadow,
                shadowOffset: { width: 0, height: 4 },
                shadowOpacity: 0.2,
                shadowRadius: 8,
                elevation: 2,
              }}
            >
              <Feather name="file-text" size={13} color="#ffffff" />
              <Text style={{ fontFamily: 'Roboto', color: '#ffffff', fontWeight: '800', fontSize: 12.5 }}>{t('view_details_apply')}</Text>
            </TouchableOpacity>
          </View>
        )}
      </Animated.View>
    );
  };

  const filteredAssignments = availableAssignments.filter(assign => {
    const matchesSearch =
      !searchQuery.trim() ||
      (assign.subject || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (assign.assignment_title || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (assign.description || '').toLowerCase().includes(searchQuery.toLowerCase());

    // academic_level is stored like "School" / "University (Semester End Exam)" — match by prefix for any selected level.
    const levelPrefix = (assign.academic_level || '').trim().toLowerCase();
    const matchesLevel = selectedAssignmentLevels.length === 0 ||
      selectedAssignmentLevels.some(lvl => {
        const lLower = lvl.toLowerCase();
        return levelPrefix.startsWith(lLower) || (lvl === 'University' && levelPrefix.startsWith('college'));
      });

    // Deadline range (From/To, inclusive). If the deadline can't be parsed, don't exclude it.
    const fromDate = parseFilterDate(deadlineFrom);
    const toDate = parseFilterDate(deadlineTo);
    const deadlineDay = parseExamDate(assign.deadline);
    const matchesDeadlineRange = (() => {
      if (!deadlineDay) return true;
      if (fromDate && deadlineDay < fromDate) return false;
      if (toDate) {
        const toEndOfDay = new Date(toDate.getFullYear(), toDate.getMonth(), toDate.getDate(), 23, 59, 59);
        if (deadlineDay > toEndOfDay) return false;
      }
      return true;
    })();

    return matchesSearch && matchesLevel && matchesDeadlineRange;
  });

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f9fafb' }}>
        <ActivityIndicator size="large" color="#16a34a" />
      </View>
    );
  }

  return (
    <View style={inShell ? { flex: 1 } : [{ flex: 1, backgroundColor: THEME.page }, gradient(THEME.pageGradient)]}>
      {/* Soft colour orb for depth behind the cards */}
      {!inShell && <View pointerEvents="none" style={{ position: 'absolute', top: -70, right: -80, width: 240, height: 240, borderRadius: 120, backgroundColor: THEME.orb }} />}

      {/* Segment Switcher: Available Exams vs Available Assignments */}
      <Animated.View entering={rise(0)} style={{ flexDirection: 'row', backgroundColor: '#ffffff', marginHorizontal: inShell ? 0 : 24, marginTop: 16, padding: 4, borderRadius: 16, borderWidth: 1.5, borderColor: THEME.cardBorder, shadowColor: THEME.shadow, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.08, shadowRadius: 10, elevation: 3 }}>
        <TouchableOpacity
          onPress={() => setActiveSegment('exams')}
          style={{
            flex: 1, paddingVertical: 12, borderRadius: 12, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6,
            backgroundColor: activeSegment === 'exams' ? THEME.solid : 'transparent',
            ...(activeSegment === 'exams' ? gradient(THEME.buttonGradient) : {}),
            shadowColor: activeSegment === 'exams' ? THEME.shadow : undefined, shadowOpacity: activeSegment === 'exams' ? 0.2 : 0, shadowRadius: 8, elevation: activeSegment === 'exams' ? 3 : 0
          }}
          activeOpacity={0.85}
        >
          <Feather name="book-open" size={14} color={activeSegment === 'exams' ? '#ffffff' : '#64748b'} />
          <Text style={{ fontFamily: 'Roboto', fontSize: 13, fontWeight: '900', color: activeSegment === 'exams' ? '#ffffff' : '#64748b' }}>
            {t('available_exams_count', { count: filteredExams.length })}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => setActiveSegment('assignments')}
          style={{
            flex: 1, paddingVertical: 12, borderRadius: 12, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6,
            backgroundColor: activeSegment === 'assignments' ? THEME.solid : 'transparent',
            ...(activeSegment === 'assignments' ? gradient(THEME.buttonGradient) : {}),
            shadowColor: activeSegment === 'assignments' ? THEME.shadow : undefined, shadowOpacity: activeSegment === 'assignments' ? 0.2 : 0, shadowRadius: 8, elevation: activeSegment === 'assignments' ? 3 : 0
          }}
          activeOpacity={0.85}
        >
          <Feather name="file-text" size={14} color={activeSegment === 'assignments' ? '#ffffff' : '#64748b'} />
          <Text style={{ fontFamily: 'Roboto', fontSize: 13, fontWeight: '900', color: activeSegment === 'assignments' ? '#ffffff' : '#64748b' }}>
            {t('assignments_count', { count: filteredAssignments.length })}
          </Text>
        </TouchableOpacity>
      </Animated.View>

      {/* Search Header Bar */}
      {/* Search Header Bar — Unified Search Input and Filter Button */}
      <Animated.View entering={rise(1)} style={{ paddingHorizontal: inShell ? 0 : 24, paddingTop: 14, paddingBottom: 10, gap: 10 }}>
        
        {/* Unified Search & Filter Bar */}
        <View style={{
          flexDirection: 'row',
          alignItems: 'center',
          backgroundColor: '#fff',
          borderRadius: 16,
          borderWidth: 1.5,
          borderColor: searchFocused ? THEME.primary : THEME.cardBorder,
          paddingLeft: 14,
          paddingRight: 8,
          height: 48,
          shadowColor: THEME.shadow,
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.06,
          shadowRadius: 10,
          elevation: 2,
        }}>
          {/* 1. Left: Search Box Input */}
          <TextInput
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder={activeSegment === 'exams' ? t('search_exam_placeholder') : t('search_assign_placeholder')}
            placeholderTextColor="#94a3b8"
            onFocus={() => setSearchFocused(true)}
            onBlur={() => setSearchFocused(false)}
            accessibilityLabel={activeSegment === 'exams' ? 'Search exams by subject or venue' : 'Search assignments by subject or title'}
            style={{ flex: 1, fontSize: 13.5, color: '#0f172a', fontWeight: '600', paddingVertical: 0, ...WEB_NO_OUTLINE }}
          />

          {/* Clear 'x' button if query is typed */}
          {searchQuery ? (
            <TouchableOpacity
              onPress={() => setSearchQuery('')}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              style={{ padding: 4, marginRight: 2 }}
              accessibilityLabel="Clear search"
            >
              <Feather name="x" size={16} color="#94a3b8" />
            </TouchableOpacity>
          ) : null}

          {/* 2. Magnifying glass icon */}
          <View style={{ paddingHorizontal: 4, justifyContent: 'center', alignItems: 'center' }}>
            <Feather
              name="search"
              size={17}
              color={searchFocused ? THEME.accentText : '#94a3b8'}
            />
          </View>

          {/* 3. Vertical Separator */}
          <View
            style={{
              width: 1.5,
              height: 22,
              backgroundColor: '#e2e8f0',
              marginHorizontal: 8,
            }}
          />

          {/* 4. Right: Filter Icon Button */}
          <TouchableOpacity
            testID="filters-toggle-button"
            activeOpacity={0.7}
            onPress={() => setShowFilters(!showFilters)}
            accessibilityRole="button"
            accessibilityLabel="Toggle filter options"
            accessibilityState={{ expanded: showFilters }}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              paddingVertical: 6,
              paddingHorizontal: 8,
              borderRadius: 10,
              backgroundColor: showFilters ? THEME.soft : 'transparent',
            }}
          >
            <Feather
              name="sliders"
              size={17}
              color={showFilters ? THEME.accentText : (activeSegment === 'exams' ? activeFilterCount : activeAssignmentFilterCount) > 0 ? THEME.solid : '#64748b'}
            />
            {(activeSegment === 'exams' ? activeFilterCount : activeAssignmentFilterCount) > 0 && (
              <View
                style={{
                  minWidth: 18,
                  height: 18,
                  borderRadius: 9,
                  backgroundColor: THEME.solid,
                  alignItems: 'center',
                  justifyContent: 'center',
                  paddingHorizontal: 4,
                  marginLeft: 5,
                }}
              >
                <Text style={{ fontSize: 10, fontWeight: '800', color: '#fff' }}>
                  {activeSegment === 'exams' ? activeFilterCount : activeAssignmentFilterCount}
                </Text>
              </View>
            )}
          </TouchableOpacity>
        </View>
      </Animated.View>

      {/* Main Opportunities List & Scrollable Filters */}
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: inShell ? 0 : 24, paddingTop: 10, paddingBottom: 100 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#16a34a']} />
        }
      >
        {/* Expandable Filter Block (Shown when opened via filter button in search bar) */}
        {showFilters && (
          <View style={{ backgroundColor: '#fff', borderRadius: 18, borderWidth: 1.5, borderColor: THEME.cardBorder, overflow: 'hidden', marginBottom: 14 }}>
            {/* Filter Header with count, Clear All and collapse icon */}
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                paddingHorizontal: 14,
                paddingVertical: 12,
                borderBottomWidth: 1,
                borderBottomColor: '#f1f5f9',
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <View style={{ width: 28, height: 28, borderRadius: 9, backgroundColor: THEME.soft, borderWidth: 1, borderColor: THEME.softBorder, alignItems: 'center', justifyContent: 'center' }}>
                  <Feather name="sliders" size={14} color={THEME.accentText} />
                </View>
                <Text style={{ fontSize: 13.5, fontWeight: '800', color: '#0f172a' }}>{t('filters')}</Text>
                {(activeSegment === 'exams' ? activeFilterCount : activeAssignmentFilterCount) > 0 && (
                  <View style={{ minWidth: 18, height: 18, borderRadius: 9, backgroundColor: THEME.solid, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5 }}>
                    <Text style={{ fontSize: 10, fontWeight: '800', color: '#fff' }}>{activeSegment === 'exams' ? activeFilterCount : activeAssignmentFilterCount}</Text>
                  </View>
                )}
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                {(activeSegment === 'exams' ? activeFilterCount : activeAssignmentFilterCount) > 0 && (
                  <TouchableOpacity onPress={activeSegment === 'exams' ? clearFilters : clearAssignmentFilters} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <Text style={{ fontSize: 11, fontWeight: '700', color: '#dc2626' }}>{t('clear_all')}</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity onPress={() => setShowFilters(false)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Feather name="chevron-up" size={18} color="#64748b" />
                </TouchableOpacity>
              </View>
            </View>

            {/* Expandable sections */}
            {activeSegment === 'exams' && (
              <View style={{ paddingHorizontal: 14, paddingBottom: 14, paddingTop: 10, gap: 12 }}>
              {/* SOS Scribe Only Row */}
              <View style={{
                backgroundColor: sosOnly ? '#fef2f2' : '#f8fafc',
                borderWidth: 1.5,
                borderColor: sosOnly ? '#fca5a5' : '#e2e8f0',
                borderRadius: 14,
                paddingHorizontal: 12,
                paddingVertical: 10,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}>
                  <View style={{
                    width: 28,
                    height: 28,
                    borderRadius: 8,
                    backgroundColor: sosOnly ? '#fee2e2' : 'rgba(239,68,68,0.1)',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}>
                    <Ionicons name="flash" size={15} color="#ef4444" />
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Text style={{ fontFamily: 'Roboto', fontSize: 13, fontWeight: '800', color: sosOnly ? '#991b1b' : '#0f172a' }}>
                      SOS Scribe
                    </Text>
                    <TouchableOpacity
                      testID="sos-info-button"
                      activeOpacity={0.7}
                      onPress={() => setShowSosInfoModal(true)}
                      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                      style={{
                        width: 20,
                        height: 20,
                        borderRadius: 10,
                        backgroundColor: sosOnly ? '#fee2e2' : '#e2e8f0',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <Feather name="help-circle" size={13} color={sosOnly ? '#dc2626' : '#64748b'} />
                    </TouchableOpacity>
                  </View>
                </View>

                <TouchableOpacity
                  testID="sos-toggle-switch"
                  activeOpacity={0.8}
                  onPress={() => setSosOnly(!sosOnly)}
                  accessibilityRole="switch"
                  accessibilityLabel="Filter by SOS Scribe"
                  aria-checked={sosOnly}
                  style={{
                    width: 44,
                    height: 24,
                    borderRadius: 12,
                    backgroundColor: sosOnly ? '#ef4444' : '#cbd5e1',
                    padding: 3,
                    justifyContent: 'center',
                    alignItems: sosOnly ? 'flex-end' : 'flex-start',
                    marginLeft: 10,
                  }}
                >
                  <View style={{
                    width: 18,
                    height: 18,
                    borderRadius: 9,
                    backgroundColor: '#ffffff',
                    shadowColor: '#000',
                    shadowOffset: { width: 0, height: 1 },
                    shadowOpacity: 0.2,
                    shadowRadius: 2,
                    elevation: 2,
                  }} />
                </TouchableOpacity>
              </View>

              {/* Single-row Dropdown Filters */}
              <View style={{ backgroundColor: '#ffffff', borderRadius: 14, borderWidth: 1.5, borderColor: '#f1f5f9', paddingHorizontal: 12 }}>
                {renderDropdownRow(t('filter_language'), 'globe', LANGUAGE_OPTIONS, selectedLanguages, setSelectedLanguages)}
                <View style={{ height: 1, backgroundColor: '#f1f5f9' }} />
                {renderDropdownRow(t('filter_exam_type'), 'book-open', TYPE_OPTIONS, selectedTypes, setSelectedTypes)}
                <View style={{ height: 1, backgroundColor: '#f1f5f9' }} />
                {renderDropdownRow(t('filter_time_slot'), 'clock', SLOT_OPTIONS, selectedSlots, setSelectedSlots)}
                <View style={{ height: 1, backgroundColor: '#f1f5f9' }} />
                {renderDropdownRow(t('filter_day'), 'calendar', DAY_OPTIONS, selectedDays, setSelectedDays)}
                <View style={{ height: 1, backgroundColor: '#f1f5f9' }} />

                {/* Single-row Exam Date Range */}
                <View style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  paddingVertical: 10,
                  minHeight: 44,
                }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}>
                    <View style={{
                      width: 28,
                      height: 28,
                      borderRadius: 8,
                      backgroundColor: (dateFrom || dateTo) ? '#dcfce7' : '#f1f5f9',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}>
                      <Feather name="calendar" size={14} color={(dateFrom || dateTo) ? '#16a34a' : '#64748b'} />
                    </View>
                    <Text style={{ fontFamily: 'Roboto', fontSize: 13, fontWeight: '700', color: (dateFrom || dateTo) ? '#0f172a' : '#334155' }}>
                      {t('exam_date_range')}
                    </Text>
                  </View>

                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <TouchableOpacity
                      testID="exam-date-range-button"
                      activeOpacity={0.7}
                      onPress={() => setShowDateRangeModal('exam')}
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 6,
                        paddingHorizontal: 11,
                        paddingVertical: 6,
                        borderRadius: 10,
                        backgroundColor: (dateFrom || dateTo) ? '#f0fdf4' : '#f8fafc',
                        borderWidth: 1.5,
                        borderColor: (dateFrom || dateTo) ? '#16a34a' : '#e2e8f0',
                      }}
                    >
                      {(dateFrom || dateTo) ? (
                        <>
                          <View style={{ width: 7, height: 7, borderRadius: 3.5, backgroundColor: '#16a34a' }} />
                          <Text style={{ fontFamily: 'Roboto', fontSize: 12, fontWeight: '800', color: '#15803d' }}>
                            {formatRangeLabel(dateFrom, dateTo)}
                          </Text>
                          {dateTo ? (
                            <View style={{ width: 7, height: 7, borderRadius: 3.5, backgroundColor: '#ea580c' }} />
                          ) : null}
                        </>
                      ) : (
                        <>
                          <Feather name="calendar" size={12} color="#94a3b8" />
                          <Text style={{ fontFamily: 'Roboto', fontSize: 12, fontWeight: '600', color: '#64748b' }}>
                            All Dates
                          </Text>
                        </>
                      )}
                      <Feather name="chevron-down" size={13} color={(dateFrom || dateTo) ? '#16a34a' : '#94a3b8'} />
                    </TouchableOpacity>

                    {(dateFrom || dateTo) ? (
                      <TouchableOpacity
                        onPress={() => { setDateFrom(''); setDateTo(''); }}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        style={{ padding: 2 }}
                      >
                        <Feather name="x-circle" size={15} color="#dc2626" />
                      </TouchableOpacity>
                    ) : null}
                  </View>
                </View>
              </View>
            </View>
          )}

          {activeSegment === 'assignments' && (
            <View style={{ paddingHorizontal: 14, paddingBottom: 14, paddingTop: 10, gap: 10 }}>
              <View style={{ backgroundColor: '#ffffff', borderRadius: 14, borderWidth: 1.5, borderColor: '#f1f5f9', paddingHorizontal: 12 }}>
                {renderDropdownRow(t('filter_academic_level'), 'award', ASSIGNMENT_LEVEL_OPTIONS, selectedAssignmentLevels, setSelectedAssignmentLevels)}
                <View style={{ height: 1, backgroundColor: '#f1f5f9' }} />

                {/* Single-row Deadline Range */}
                <View style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  paddingVertical: 10,
                  minHeight: 44,
                }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}>
                    <View style={{
                      width: 28,
                      height: 28,
                      borderRadius: 8,
                      backgroundColor: (deadlineFrom || deadlineTo) ? '#dcfce7' : '#f1f5f9',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}>
                      <Feather name="calendar" size={14} color={(deadlineFrom || deadlineTo) ? '#16a34a' : '#64748b'} />
                    </View>
                    <Text style={{ fontFamily: 'Roboto', fontSize: 13, fontWeight: '700', color: (deadlineFrom || deadlineTo) ? '#0f172a' : '#334155' }}>
                      {t('deadline_range')}
                    </Text>
                  </View>

                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <TouchableOpacity
                      testID="deadline-range-button"
                      activeOpacity={0.7}
                      onPress={() => setShowDateRangeModal('deadline')}
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 6,
                        paddingHorizontal: 11,
                        paddingVertical: 6,
                        borderRadius: 10,
                        backgroundColor: (deadlineFrom || deadlineTo) ? '#f0fdf4' : '#f8fafc',
                        borderWidth: 1.5,
                        borderColor: (deadlineFrom || deadlineTo) ? '#16a34a' : '#e2e8f0',
                      }}
                    >
                      {(deadlineFrom || deadlineTo) ? (
                        <>
                          <View style={{ width: 7, height: 7, borderRadius: 3.5, backgroundColor: '#16a34a' }} />
                          <Text style={{ fontFamily: 'Roboto', fontSize: 12, fontWeight: '800', color: '#15803d' }}>
                            {formatRangeLabel(deadlineFrom, deadlineTo)}
                          </Text>
                          {deadlineTo ? (
                            <View style={{ width: 7, height: 7, borderRadius: 3.5, backgroundColor: '#ea580c' }} />
                          ) : null}
                        </>
                      ) : (
                        <>
                          <Feather name="calendar" size={12} color="#94a3b8" />
                          <Text style={{ fontFamily: 'Roboto', fontSize: 12, fontWeight: '600', color: '#64748b' }}>
                            All Dates
                          </Text>
                        </>
                      )}
                      <Feather name="chevron-down" size={13} color={(deadlineFrom || deadlineTo) ? '#16a34a' : '#94a3b8'} />
                    </TouchableOpacity>

                    {(deadlineFrom || deadlineTo) ? (
                      <TouchableOpacity
                        onPress={() => { setDeadlineFrom(''); setDeadlineTo(''); }}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        style={{ padding: 2 }}
                      >
                        <Feather name="x-circle" size={15} color="#dc2626" />
                      </TouchableOpacity>
                    ) : null}
                  </View>
                </View>
              </View>
            </View>
          )}
        </View>
        )}

        {activeSegment === 'exams' ? (
          <>
            {/* Nearby Opportunities Segment */}
            {!!scribeLocation && nearbyExams.length > 0 && (
              <View style={{ marginBottom: 18 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 }}>
                  <Ionicons name="location" size={15} color="#16a34a" />
                  <Text style={{ fontFamily: 'Roboto', color: '#16a34a', fontWeight: '900', fontSize: 13, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                    {t('opportunities_near_you', { location: scribeProfile?.location })}
                  </Text>
                </View>
                <DesktopGrid>{nearbyExams.map(renderExamCard)}</DesktopGrid>
              </View>
            )}

            {/* Other / General Opportunities Segment */}
            <View>
              <Text style={{ fontFamily: 'Roboto', color: '#475569', fontWeight: '800', fontSize: 13, marginBottom: 10 }}>
                {scribeLocation && nearbyExams.length > 0 ? t('all_other_opportunities') : t('available_opportunities')}
              </Text>
              
              {filteredExams.length === 0 ? (
                <View style={{ backgroundColor: '#ffffff', padding: 32, borderRadius: 24, borderWidth: 1.5, borderColor: THEME.cardBorder, shadowColor: THEME.shadow, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.06, shadowRadius: 16, elevation: 3, alignItems: 'center', justifyContent: 'center' }}>
                  <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: THEME.soft, ...gradient(THEME.heroGradient), borderWidth: 1, borderColor: THEME.softBorder, alignItems: 'center', justifyContent: 'center' }}>
                    <Feather name="search" size={24} color={THEME.accentText} />
                  </View>
                  <Text style={{ fontFamily: 'Roboto', fontSize: 15, fontWeight: '900', color: '#0f172a', marginTop: 10 }}>{t('no_matching_exams')}</Text>
                  <Text style={{ fontFamily: 'Roboto', fontSize: 11, color: '#64748b', marginTop: 4, textAlign: 'center', lineHeight: 16 }}>
                    {t('adjust_search_desc')}
                  </Text>
                </View>
              ) : (
                <DesktopGrid>{(scribeLocation && nearbyExams.length > 0 ? otherExams : filteredExams).map(renderExamCard)}</DesktopGrid>
              )}
            </View>
          </>
        ) : (
          <View>
            <Text style={{ fontFamily: 'Roboto', color: '#475569', fontWeight: '800', fontSize: 13, marginBottom: 10 }}>
              {t('available_assignments')}
            </Text>
            
            {filteredAssignments.length === 0 ? (
              <View style={{ backgroundColor: '#ffffff', padding: 32, borderRadius: 24, borderWidth: 1.5, borderColor: THEME.cardBorder, shadowColor: THEME.shadow, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.06, shadowRadius: 16, elevation: 3, alignItems: 'center', justifyContent: 'center' }}>
                <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: THEME.soft, ...gradient(THEME.heroGradient), borderWidth: 1, borderColor: THEME.softBorder, alignItems: 'center', justifyContent: 'center' }}>
                  <Feather name="search" size={24} color={THEME.accentText} />
                </View>
                <Text style={{ fontFamily: 'Roboto', fontSize: 15, fontWeight: '900', color: '#0f172a', marginTop: 10 }}>{t('no_matching_assignments')}</Text>
                <Text style={{ fontFamily: 'Roboto', fontSize: 11, color: '#64748b', marginTop: 4, textAlign: 'center', lineHeight: 16 }}>
                  {t('adjust_search_desc')}
                </Text>
              </View>
            ) : (
              <DesktopGrid>{filteredAssignments.map(renderAssignmentCard)}</DesktopGrid>
            )}
          </View>
        )}

      </ScrollView>

      <DateRangeCalendarModal
        visible={showDateRangeModal !== null}
        onClose={() => setShowDateRangeModal(null)}
        title={showDateRangeModal === 'exam' ? 'Exam Date Range' : 'Deadline Date Range'}
        startDate={showDateRangeModal === 'exam' ? dateFrom : deadlineFrom}
        endDate={showDateRangeModal === 'exam' ? dateTo : deadlineTo}
        onApply={(start, end) => {
          if (showDateRangeModal === 'exam') {
            setDateFrom(start);
            setDateTo(end);
          } else if (showDateRangeModal === 'deadline') {
            setDeadlineFrom(start);
            setDeadlineTo(end);
          }
        }}
      />

      {/* Dropdown Multi-Select Modal */}
      <Modal
        animationType="fade"
        transparent
        visible={activeDropdown !== null}
        onRequestClose={() => setActiveDropdown(null)}
      >
        <TouchableOpacity
          activeOpacity={1}
          onPress={() => setActiveDropdown(null)}
          style={{
            flex: 1,
            backgroundColor: 'rgba(15,23,42,0.45)',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 24,
          }}
        >
          <TouchableOpacity
            activeOpacity={1}
            onPress={() => {}}
            style={{
              width: '100%',
              maxWidth: 350,
              backgroundColor: '#ffffff',
              borderRadius: 22,
              padding: 18,
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 10 },
              shadowOpacity: 0.15,
              shadowRadius: 24,
              elevation: 8,
            }}
          >
            {/* Modal Header */}
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                paddingBottom: 12,
                borderBottomWidth: 1,
                borderBottomColor: '#f1f5f9',
                marginBottom: 10,
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                {activeDropdown?.icon && (
                  <View
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: 8,
                      backgroundColor: '#dcfce7',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Feather name={activeDropdown.icon} size={14} color="#16a34a" />
                  </View>
                )}
                <View>
                  <Text style={{ fontFamily: 'Roboto', fontSize: 14.5, fontWeight: '800', color: '#0f172a' }}>
                    {activeDropdown?.title}
                  </Text>
                  <Text style={{ fontFamily: 'Roboto', fontSize: 11, color: '#64748b', fontWeight: '500' }}>
                    {(activeDropdown?.selected.length || 0) === 0
                      ? 'All selected (no filter)'
                      : `${activeDropdown?.selected.length} selected`}
                  </Text>
                </View>
              </View>
              <TouchableOpacity
                onPress={() => setActiveDropdown(null)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 14,
                  backgroundColor: '#f1f5f9',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Feather name="x" size={15} color="#64748b" />
              </TouchableOpacity>
            </View>

            {/* Options List with Checkboxes */}
            <ScrollView style={{ maxHeight: 280 }} showsVerticalScrollIndicator={false}>
              <View style={{ gap: 6 }}>
                {/* 'All' Option */}
                {(() => {
                  const isAllChecked = (activeDropdown?.selected.length || 0) === 0;
                  return (
                    <TouchableOpacity
                      testID="filter-option-all"
                      activeOpacity={0.7}
                      onPress={() => {
                        if (activeDropdown) {
                          activeDropdown.onSelect([]);
                          setActiveDropdown(prev => prev ? { ...prev, selected: [] } : null);
                        }
                      }}
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        paddingHorizontal: 12,
                        paddingVertical: 10,
                        borderRadius: 12,
                        backgroundColor: isAllChecked ? '#f0fdf4' : '#ffffff',
                        borderWidth: 1.5,
                        borderColor: isAllChecked ? '#16a34a' : '#f1f5f9',
                      }}
                    >
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                        <View
                          style={{
                            width: 20,
                            height: 20,
                            borderRadius: 6,
                            backgroundColor: isAllChecked ? '#16a34a' : '#ffffff',
                            borderWidth: 1.5,
                            borderColor: isAllChecked ? '#16a34a' : '#cbd5e1',
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                        >
                          {isAllChecked && <Feather name="check" size={13} color="#ffffff" />}
                        </View>
                        <Text
                          style={{
                            fontFamily: 'Roboto',
                            fontSize: 13.5,
                            fontWeight: isAllChecked ? '800' : '600',
                            color: isAllChecked ? '#15803d' : '#334155',
                          }}
                        >
                          {t('filter_all')}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  );
                })()}

                {/* Specific Options */}
                {activeDropdown?.options.map((opt) => {
                  const isChecked = activeDropdown.selected.includes(opt);
                  const labelText = DAY_LABELS[opt] || opt;

                  return (
                    <TouchableOpacity
                      key={opt}
                      testID={`filter-option-${opt.toLowerCase()}`}
                      activeOpacity={0.7}
                      onPress={() => {
                        if (!activeDropdown) return;
                        const next = isChecked
                          ? activeDropdown.selected.filter(s => s !== opt)
                          : [...activeDropdown.selected, opt];
                        activeDropdown.onSelect(next);
                        setActiveDropdown(prev => prev ? { ...prev, selected: next } : null);
                      }}
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        paddingHorizontal: 12,
                        paddingVertical: 10,
                        borderRadius: 12,
                        backgroundColor: isChecked ? '#f0fdf4' : '#ffffff',
                        borderWidth: 1.5,
                        borderColor: isChecked ? '#16a34a' : '#f1f5f9',
                      }}
                    >
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                        <View
                          style={{
                            width: 20,
                            height: 20,
                            borderRadius: 6,
                            backgroundColor: isChecked ? '#16a34a' : '#ffffff',
                            borderWidth: 1.5,
                            borderColor: isChecked ? '#16a34a' : '#cbd5e1',
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                        >
                          {isChecked && <Feather name="check" size={13} color="#ffffff" />}
                        </View>
                        <Text
                          style={{
                            fontFamily: 'Roboto',
                            fontSize: 13.5,
                            fontWeight: isChecked ? '800' : '600',
                            color: isChecked ? '#15803d' : '#334155',
                          }}
                        >
                          {labelText}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </ScrollView>

            {/* Modal Actions Footer */}
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                paddingTop: 12,
                marginTop: 8,
                borderTopWidth: 1,
                borderTopColor: '#f1f5f9',
              }}
            >
              <TouchableOpacity
                onPress={() => {
                  if (activeDropdown) {
                    activeDropdown.onSelect([]);
                    setActiveDropdown(prev => prev ? { ...prev, selected: [] } : null);
                  }
                }}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                style={{ paddingVertical: 6, paddingHorizontal: 4 }}
              >
                <Text style={{ fontFamily: 'Roboto', fontSize: 12.5, fontWeight: '700', color: '#dc2626' }}>
                  Reset to All
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                testID="filter-done-button"
                activeOpacity={0.8}
                onPress={() => setActiveDropdown(null)}
                style={{
                  backgroundColor: '#16a34a',
                  paddingHorizontal: 20,
                  paddingVertical: 7,
                  borderRadius: 10,
                }}
              >
                <Text style={{ fontFamily: 'Roboto', fontSize: 13, fontWeight: '800', color: '#ffffff' }}>
                  Done
                </Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* SOS Info Modal */}
      <Modal
        animationType="fade"
        transparent
        visible={showSosInfoModal}
        onRequestClose={() => setShowSosInfoModal(false)}
      >
        <TouchableOpacity
          activeOpacity={1}
          onPress={() => setShowSosInfoModal(false)}
          style={{
            flex: 1,
            backgroundColor: 'rgba(15,23,42,0.45)',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 24,
          }}
        >
          <TouchableOpacity
            activeOpacity={1}
            onPress={() => {}}
            style={{
              width: '100%',
              maxWidth: 360,
              backgroundColor: '#ffffff',
              borderRadius: 22,
              padding: 20,
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 10 },
              shadowOpacity: 0.15,
              shadowRadius: 24,
              elevation: 8,
            }}
          >
            {/* Modal Header */}
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                paddingBottom: 12,
                borderBottomWidth: 1,
                borderBottomColor: '#f1f5f9',
                marginBottom: 12,
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}>
                <View
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 9,
                    backgroundColor: '#fee2e2',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Ionicons name="flash" size={17} color="#ef4444" />
                </View>
                <Text style={{ fontFamily: 'Roboto', fontSize: 15, fontWeight: '800', color: '#0f172a' }}>
                  What is SOS System?
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => setShowSosInfoModal(false)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 14,
                  backgroundColor: '#f1f5f9',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Feather name="x" size={15} color="#64748b" />
              </TouchableOpacity>
            </View>

            {/* Modal Body */}
            <Text style={{ fontFamily: 'Roboto', fontSize: 13, color: '#334155', lineHeight: 20, marginBottom: 12 }}>
              The <Text style={{ fontWeight: '800', color: '#dc2626' }}>SOS Emergency System</Text> is designed for urgent exam requests where students need a scribe immediately (within 24–48 hours) due to unforeseen cancellations or emergency situations.
            </Text>

            <View style={{ backgroundColor: '#fef2f2', borderRadius: 12, borderWidth: 1, borderColor: '#fecaca', padding: 12, marginBottom: 16, gap: 5 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Feather name="alert-triangle" size={13} color="#dc2626" />
                <Text style={{ fontFamily: 'Roboto', fontSize: 12, fontWeight: '800', color: '#991b1b' }}>Urgent Priority Standby</Text>
              </View>
              <Text style={{ fontFamily: 'Roboto', fontSize: 11.5, color: '#7f1d1d', lineHeight: 16 }}>
                Enabling this filter shows only emergency requests that need an immediate scribe commitment.
              </Text>
            </View>

            {/* Got It Button */}
            <TouchableOpacity
              testID="sos-info-understood-button"
              activeOpacity={0.8}
              onPress={() => setShowSosInfoModal(false)}
              style={{
                backgroundColor: '#16a34a',
                borderRadius: 12,
                paddingVertical: 10,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Text style={{ fontFamily: 'Roboto', fontSize: 13.5, fontWeight: '800', color: '#ffffff' }}>
                Understood
              </Text>
            </TouchableOpacity>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

    </View>
  );
}
