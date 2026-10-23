/**
 * Exam scribe request form. Route: `/console/student/request_form` (optional `?id=<exam_requests id>`).
 *
 * Students open it from the student console (StudentHomeView, StudentRequestsView, my_requests and the
 * desktop console). StudentRequestsView passes `?id=` to edit an existing
 * request. A new request first shows an entry-choice screen:
 *   - "Request Assignment" -> `/console/student/assignment_form`;
 *   - "Auto-Fill (ADMIT Card)" -> pick a photo/PDF hall ticket, send it to the backend
 *     `POST {API_URL}/api/ai/parse-hall-ticket` (Gemini extracts subject, date, venue, exam type),
 *     fill the form and submit straight away if every field was read;
 *   - "Manual Fill Form" -> the form itself.
 * The form collects exam type + sub-topic, languages, subject, date/time (custom calendar modal), venue
 * (typed, GPS reverse-geocode via expo-location, or a simulated map picker with mock locations), an
 * optional admit card, a pre-booking flag and extra subjects (bulk creation, create mode only).
 *
 * Data: reads the student's `profiles` row and, when editing, the `exam_requests` row; on submit it
 * updates that row or inserts one `exam_requests` row per subject (status 'pending'), then returns to
 * the console's Requests tab. All DB access goes through the `supabase` shim (core/supabase.ts), a custom
 * client for the Rust/Axum backend's `POST /api/query`, not real Supabase.
 *
 * Notes: the admit card is saved only as the picked file NAME in `admit_card_proof`; the file is sent to
 * the AI parser but not stored. Page frame, header, section cards, submit button, tab bar and the
 * request-type chooser come from components/student/RequestKit (shared with assignment_form). On
 * desktop the root layout shows this page in the centred DesktopPageFrame. Field styling uses
 * NativeWind `className` utilities.
 */
import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, ActivityIndicator, Alert, Modal, Platform, Animated } from 'react-native';
import * as Location from 'expo-location';
import { router, useLocalSearchParams } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
// SDK 56: readAsStringAsync lives in the "legacy" entry (the main entry throws on phones).
import * as FileSystem from 'expo-file-system/legacy';
import { supabase } from '@/core/supabase';
import { FormSection, RequestHeader, RequestPage, RequestTabBar, RequestTypeChooser, SubmitButton } from '@/components/student/RequestKit';
import VoiceExamWizard from '@/components/student/VoiceExamWizard';
import { announceForAccessibility } from '@/core/a11y';
import { useLanguage } from '@/core/translation';
import {
  searchCollegesAndPlaces,
  getGoogleMapsUrl,
  openGoogleMaps,
  PlaceSearchResult,
  POPULAR_EXAM_CENTERS,
} from '@/core/maps';

/** Base URL of the Rust/Axum backend; used here only for the hall-ticket AI parser endpoint. */
const API_URL = process.env.EXPO_PUBLIC_API_URL || 'https://anulekh-axum.onrender.com';

/** Exam categories shown in the "Exam Category" dropdown. */
const EXAM_CATEGORIES = ['College Exam', 'Government Exam', 'Competitive Exam', 'School Exam'];
/** Languages the student can pick (multi-select); saved comma-joined in `exam_language`. */
const EXAM_LANGUAGES = ['English', 'Hindi', 'Gujarati'];

// Exam Types database based on Exam Category
/** Suggested exam types per exam category for the searchable dropdown; custom typed values are also accepted. */
const EXAM_TYPE_OPTIONS: { [key: string]: string[] } = {
  'College Exam': [
    'Semester End Exam',
    'Mid-Term Assessment',
    'Practical Lab Exam',
    'Backlog / KT Exam',
    'Viva Voce / Oral Exam',
    'Final Year Degree Exam',
    'Diploma / Polytechnic Exam',
    'Internal Unit Assessment',
  ],
  'Government Exam': [
    'GPSC (Gujarat Public Service Commission)',
    'UPSC Civil Services / IAS / IPS',
    'State PSC (Public Service Commission)',
    'Staff Selection Commission (SSC)',
    'Railway Recruitment Board (RRB)',
    'Banking / IBPS / SBI Recruitment',
    'Police / Defense Recruitment',
    'Departmental Promotion Exam',
    'Other Government Exam',
  ],
  'Competitive Exam': [
    'JEE Main & Advanced (Engineering)',
    'NEET UG / PG (Medical)',
    'UPSC Civil Services',
    'CAT / MBA Entrance Exam',
    'GATE / PSU Entrance',
    'IBPS PO / Clerk / Banking Exam',
    'SSC CGL / CHSL',
    'CLAT (Law Entrance)',
    'UGC NET / CSIR NET',
    'Other Competitive Exam',
  ],
  'School Exam': [
    'Class 10 Board Exam (CBSE / State)',
    'Class 12 Board Exam (CBSE / State)',
    'Class 9 / 11 Annual Exam',
    'Half Yearly / Mid-Term Exam',
    'Final Term Exam',
    'Unit Test / Monthly Assessment',
    'Pre-Board Exam',
  ],
};

// Aliases for legacy data
EXAM_TYPE_OPTIONS['University'] = EXAM_TYPE_OPTIONS['College Exam'];
EXAM_TYPE_OPTIONS['College'] = EXAM_TYPE_OPTIONS['College Exam'];
EXAM_TYPE_OPTIONS['Government'] = EXAM_TYPE_OPTIONS['Government Exam'];
EXAM_TYPE_OPTIONS['Govt'] = EXAM_TYPE_OPTIONS['Government Exam'];
EXAM_TYPE_OPTIONS['Competitive'] = EXAM_TYPE_OPTIONS['Competitive Exam'];
EXAM_TYPE_OPTIONS['School'] = EXAM_TYPE_OPTIONS['School Exam'];

/**
 * Normalizes category label to one of the 4 standard categories.
 */
const normalizeExamCategory = (type: string) => {
  const clean = (type || '').trim();
  const lower = clean.toLowerCase();
  if (lower.startsWith('college') || lower.startsWith('university')) return 'College Exam';
  if (lower.startsWith('government') || lower.startsWith('govt')) return 'Government Exam';
  if (lower.startsWith('competitive')) return 'Competitive Exam';
  if (lower.startsWith('school')) return 'School Exam';
  return 'College Exam';
};

/** Month names and two-letter weekday headers for the custom calendar modal. */
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

// Curated institutions and live search are loaded from @/core/maps

/**
 * Request-a-scribe screen (default export for the route).
 *
 * Shows the entry-choice screen while `entryMode === 'choice'`; otherwise the request form plus its
 * date/time picker, venue picker and "reading hall ticket" overlay modals.
 */
export default function ScribeRequestForm() {
  const { t } = useLanguage();

  // Edit mode is driven by the `id` query param (set by StudentRequestsView).
  const params = useLocalSearchParams<{ id?: string; mode?: string; voice?: string }>();
  const isEditing = !!params.id;

  const isVoiceRequested = params.mode === 'voice' || params.voice === 'true';

  // Entry choice: ask the student whether to fill manually, auto-fill from an admit card, or use voice.
  // Editing an existing request skips straight to the form.
  const [entryMode, setEntryMode] = useState<'choice' | 'form' | 'voice'>(
    isEditing ? 'form' : (isVoiceRequested ? 'voice' : (params.mode === 'form' ? 'form' : 'choice'))
  );

  useEffect(() => {
    if (isVoiceRequested) {
      setEntryMode('voice');
    } else if (params.mode === 'form') {
      setEntryMode('form');
    }
  }, [params.mode, params.voice]);

  // Submit spinner and the logged-in student's profile (its fields are copied into each request).
  const [loading, setLoading] = useState(false);
  const [profile, setProfile] = useState<any>(null);

  // Form State
  const [subject, setSubject] = useState('');
  const [examCategory, setExamCategory] = useState('College Exam');
  const [examType, setExamType] = useState(''); // Specific exam type (optional)
  const [examLanguages, setExamLanguages] = useState<string[]>(['English']);

  // Floating dropdown modal picker state for Exam Classification ('category' | 'type' | 'language' | null)
  const [activePicker, setActivePicker] = useState<null | 'category' | 'type' | 'language'>(null);
  const [examTypeSearch, setExamTypeSearch] = useState('');
  // Admit card reference saved with the request, the file name shown in the UI, and the AI-parse overlay flag.
  const [admitCardImage, setAdmitCardImage] = useState<string | null>(null);
  const [admitCardFileName, setAdmitCardFileName] = useState<string | null>(null);
  const [isParsingHallTicket, setIsParsingHallTicket] = useState(false);

  // Date & Time Picker State
  const [examDate, setExamDate] = useState('');
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(new Date().getMonth());
  const [calendarYear, setCalendarYear] = useState(new Date().getFullYear());
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  // Time parts edited in the picker (12-hour clock).
  const [selectedHour, setSelectedHour] = useState('10');
  const [selectedMinute, setSelectedMinute] = useState('00');
  const [selectedAmPm, setSelectedAmPm] = useState('AM');

  // Map Picker State & Google Maps Place Search
  const [showMapPicker, setShowMapPicker] = useState(false);
  const [examVenue, setExamVenue] = useState('');
  const [googleMapsUrl, setGoogleMapsUrl] = useState('');
  const [venueSearchQuery, setVenueSearchQuery] = useState('');
  const [venueSearchResults, setVenueSearchResults] = useState<PlaceSearchResult[]>(POPULAR_EXAM_CENTERS);
  const [isSearchingVenues, setIsSearchingVenues] = useState(false);
  const [isLocating, setIsLocating] = useState(false);

  // Bulk Exam Creation: additional subjects sharing the same profile/type/language.
  // Each entry becomes its own exam_requests row on submit so scribes can apply per-exam.
  const [extraSubjects, setExtraSubjects] = useState<{ subject: string; examDate: string; examVenue: string; google_maps_url?: string }[]>([]);
  // Tracks which extra-subject row the Date/Map pickers are editing (-1 = the primary subject above)
  const [activeExtraIndex, setActiveExtraIndex] = useState(-1);

  // Fetch student profile + existing request if editing
  useEffect(() => {
    const fetchData = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return;

        // 1. Fetch Profile
        const { data: profileData } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', session.user.id)
          .single();
        
        if (profileData) {
          setProfile(profileData);
        }

        // 2. Fetch Request details if in edit mode
        if (isEditing && params.id) {
          const { data: examData } = await supabase
            .from('exam_requests')
            .select('*')
            .eq('id', params.id)
            .single();

          if (examData) {
            setSubject(examData.subject || '');
            setExamDate(examData.exam_date || '');
            setExamVenue(examData.exam_venue || '');
            setGoogleMapsUrl(examData.google_maps_url || '');
            // Parse Exam Category and specific Exam Type
            const fullType = examData.exam_type || 'College Exam';
            const match = fullType.match(/^([^(]+)(?:\(([^)]+)\))?/);
            if (match) {
              const cat = normalizeExamCategory(match[1].trim());
              const type = match[2] ? match[2].trim() : '';
              setExamCategory(cat);
              setExamType(type);
              setExamTypeSearch(type);
            } else {
              setExamCategory(normalizeExamCategory(fullType));
              setExamType('');
              setExamTypeSearch('');
            }

            if (examData.exam_language) {
              setExamLanguages(examData.exam_language.split(', '));
            }
          }
        }
      } catch (err) {
        console.error('Error loading data for request form:', err);
      }
    };
    fetchData();
  }, [params.id]);

  // Calendar Helpers
  /** Number of days in a month (0-based month): day 0 of the next month is this month's last day. */
  const getDaysInMonth = (month: number, year: number) => {
    return new Date(year, month + 1, 0).getDate();
  };

  /** Weekday index (0 = Sunday) of the month's 1st day, used to pad the calendar grid. */
  const getFirstDayOfMonth = (month: number, year: number) => {
    return new Date(year, month, 1).getDay();
  };

  /**
   * Confirms the date/time modal: formats the choice as "DD/MM/YYYY | HH:MM AM" and writes it to the
   * primary exam or to the extra-subject row in `activeExtraIndex`. Requires a selected day.
   */
  const handleConfirmDateTime = () => {
    if (!selectedDay) {
      Alert.alert('Selection Required', 'Please select a day on the calendar.');
      return;
    }
    // Zero-pad day and month; this string is what gets saved in exam_requests.exam_date.
    const formattedDay = selectedDay < 10 ? `0${selectedDay}` : selectedDay;
    const formattedMonth = calendarMonth + 1 < 10 ? `0${calendarMonth + 1}` : calendarMonth + 1;
    const dateStr = `${formattedDay}/${formattedMonth}/${calendarYear}`;
    const timeStr = `${selectedHour}:${selectedMinute} ${selectedAmPm}`;
    const value = `${dateStr} | ${timeStr}`;
    // Write to whichever exam opened the picker.
    if (activeExtraIndex === -1) {
      setExamDate(value);
    } else {
      updateExtraSubject(activeExtraIndex, 'examDate', value);
    }
    setShowDatePicker(false);
  };

  // Bulk Exam helpers
  /** Appends an empty extra-exam row. */
  const addExtraSubject = () => {
    setExtraSubjects([...extraSubjects, { subject: '', examDate: '', examVenue: '' }]);
  };

  /** Sets one field of the extra-exam row at `index`. */
  const updateExtraSubject = (index: number, field: 'subject' | 'examDate' | 'examVenue' | 'google_maps_url', value: string) => {
    setExtraSubjects(prev => prev.map((row, i) => (i === index ? { ...row, [field]: value } : row)));
  };

  /** Removes the extra-exam row at `index`. */
  const removeExtraSubject = (index: number) => {
    setExtraSubjects(prev => prev.filter((_, i) => i !== index));
  };

  /** Real-time place / college search via OpenStreetMap & Google Maps directory */
  const handleSearchVenue = async (text: string) => {
    setVenueSearchQuery(text);
    if (!text.trim()) {
      setVenueSearchResults(POPULAR_EXAM_CENTERS);
      return;
    }
    setIsSearchingVenues(true);
    try {
      const results = await searchCollegesAndPlaces(text);
      setVenueSearchResults(results);
    } catch {
      // Keep existing results on search network error
    } finally {
      setIsSearchingVenues(false);
    }
  };

  /** Selects a real college/exam center from Google Maps search results */
  const handleSelectVenue = (place: PlaceSearchResult) => {
    const formattedVenue = `${place.name}, ${place.address}`;
    const mapsLink = place.mapsUrl || getGoogleMapsUrl(formattedVenue, place.lat, place.lon);

    if (activeExtraIndex === -1) {
      setExamVenue(formattedVenue);
      setGoogleMapsUrl(mapsLink);
    } else {
      updateExtraSubject(activeExtraIndex, 'examVenue', formattedVenue);
      updateExtraSubject(activeExtraIndex, 'google_maps_url', mapsLink);
    }
    setShowMapPicker(false);
    announceForAccessibility(`Exam center selected: ${place.name}`);
  };

  /** Selects a typed custom venue address and generates a universal Google Maps navigation link */
  const handleSelectCustomVenue = (customText: string) => {
    const trimmed = customText.trim();
    if (!trimmed) return;
    const mapsLink = getGoogleMapsUrl(trimmed);
    if (activeExtraIndex === -1) {
      setExamVenue(trimmed);
      setGoogleMapsUrl(mapsLink);
    } else {
      updateExtraSubject(activeExtraIndex, 'examVenue', trimmed);
      updateExtraSubject(activeExtraIndex, 'google_maps_url', mapsLink);
    }
    setShowMapPicker(false);
    announceForAccessibility(`Custom venue selected: ${trimmed}`);
  };

  /**
   * Fills a venue from the device's GPS position (expo-location + reverse geocoding).
   *
   * @param extraIndex -1 for the primary exam, otherwise the extra-subject row to fill. It is also stored
   *                   in `activeExtraIndex` so only that row's locate button shows a spinner.
   */
  const handleGetCurrentLocation = async (extraIndex: number = -1) => {
    setIsLocating(true);
    setActiveExtraIndex(extraIndex);
    try {
      // Ask for foreground location permission; the student types the address if it is denied.
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Denied', 'Permission to access location was denied. Please enter address manually.');
        return;
      }

      // Get the current coordinates, then turn them into a street address.
      const locationData = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });

      const { latitude, longitude } = locationData.coords;
      const geocode = await Location.reverseGeocodeAsync({ latitude, longitude });

      if (geocode && geocode.length > 0) {
        const addressObj = geocode[0];
        // Build a readable address string
        const parts = [
          addressObj.name,
          addressObj.street,
          addressObj.district,
          addressObj.city,
          addressObj.subregion,
          addressObj.region,
          addressObj.postalCode
        ].filter(p => !!p && p !== 'undefined' && p !== 'Unnamed Road');

        const addressString = parts.join(', ');
        const mapsUrl = getGoogleMapsUrl(addressString, latitude, longitude);
        
        // Write into the primary venue or the extra-exam row.
        if (extraIndex === -1) {
          setExamVenue(addressString);
          setGoogleMapsUrl(mapsUrl);
        } else {
          updateExtraSubject(extraIndex, 'examVenue', addressString);
          updateExtraSubject(extraIndex, 'google_maps_url', mapsUrl);
        }
      } else {
        Alert.alert('Error', 'Unable to resolve your geocoded address.');
      }
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to get your current location.');
    } finally {
      setIsLocating(false);
    }
  };

  /** Moves the calendar one month back or forward (wrapping the year) and clears the selected day. */
  const changeMonth = (direction: 'next' | 'prev') => {
    if (direction === 'prev') {
      if (calendarMonth === 0) {
        setCalendarMonth(11);
        setCalendarYear(calendarYear - 1);
      } else {
        setCalendarMonth(calendarMonth - 1);
      }
    } else {
      if (calendarMonth === 11) {
        setCalendarMonth(0);
        setCalendarYear(calendarYear + 1);
      } else {
        setCalendarMonth(calendarMonth + 1);
      }
    }
    setSelectedDay(null);
  };

  /**
   * Builds the calendar grid for the shown month: blank cells up to the first weekday, then one
   * tappable cell per day (the selected day is highlighted).
   * @returns Array of cell elements rendered inside the date picker modal.
   */
  const renderCalendarDays = () => {
    const daysInMonth = getDaysInMonth(calendarMonth, calendarYear);
    const firstDay = getFirstDayOfMonth(calendarMonth, calendarYear);
    const totalSlots = [];

    // Leading blanks so day 1 lands under the right weekday.
    for (let i = 0; i < firstDay; i++) {
      totalSlots.push(<View key={`empty-${i}`} className="w-[14%] h-8 items-center justify-center" />);
    }

    // One button per day of the month.
    for (let day = 1; day <= daysInMonth; day++) {
      const isSelected = selectedDay === day;
      totalSlots.push(
        <TouchableOpacity 
          key={`day-${day}`}
          onPress={() => setSelectedDay(day)}
          className={`w-[14%] h-8 items-center justify-center rounded-full ${
            isSelected ? 'bg-blue-500' : 'active:bg-blue-550 active:bg-blue-100'
          }`}
        >
          <Text className={`text-xs font-semibold ${isSelected ? 'text-white' : 'text-slate-800'}`}>{day}</Text>
        </TouchableOpacity>
      );
    }

    return totalSlots;
  };

  // Filter specific exam types based on examCategory and search query
  /** @returns Exam types of the current exam category matching search text, or all of them. */
  const getFilteredExamTypes = () => {
    const list = EXAM_TYPE_OPTIONS[examCategory] || EXAM_TYPE_OPTIONS[normalizeExamCategory(examCategory)] || [];
    const query = examTypeSearch.trim();
    if (!query) return list;
    return list.filter(item => item.toLowerCase().includes(query.toLowerCase()));
  };

  // Reads a picked file's URI into a base64 string, on both web and native.
  /**
   * @param uri File URI from the image or document picker.
   * @returns The file contents as base64, without the `data:...;base64,` prefix.
   */
  const readFileAsBase64 = async (uri: string): Promise<string> => {
    // Web: the URI is a blob URL, so read it with FileReader and strip the data-URL prefix.
    if (Platform.OS === 'web') {
      const response = await fetch(uri);
      const blob = await response.blob();
      return await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          const result = reader.result as string;
          resolve(result.split(',')[1]);
        };
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
    }
    // Native: read the file straight from disk.
    return await FileSystem.readAsStringAsync(uri, {
      encoding: FileSystem.EncodingType.Base64,
    });
  };

  // Sends the picked hall ticket to the backend, which asks Gemini to extract exam details,
  // fills the form, then submits the request immediately — no manual review step.
  /**
   * @param uri      Picked file URI.
   * @param mimeType File type sent to the backend (e.g. image/jpeg, application/pdf).
   * @param fileName Saved as the admit card reference and shown in the upload box.
   */
  const analyzeHallTicket = async (uri: string, mimeType: string, fileName: string) => {
    // Shows the full-screen scanning overlay until the analysis finishes.
    setIsParsingHallTicket(true);
    try {
      const fileBase64 = await readFileAsBase64(uri);

      // POST the file to the backend AI parser.
      const res = await fetch(`${API_URL}/api/ai/parse-hall-ticket`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ file_base64: fileBase64, mime_type: mimeType }),
      });

      const result = await res.json();
      if (!res.ok) {
        throw new Error(result.error || 'Failed to analyze hall ticket.');
      }

      // Attach the file name as the admit card reference.
      setAdmitCardImage(fileName);
      setAdmitCardFileName(fileName);

      // Parsed values; an unknown category keeps the current selection and a missing time defaults to 10:00 AM.
      const filledSubject = result.subject || '';
      const filledVenue = result.exam_venue || '';
      const filledCategory = result.exam_type ? normalizeExamCategory(result.exam_type) : examCategory;
      const filledExamType = result.exam_sub_topic || '';
      const filledDate = result.exam_date
        ? `${result.exam_date} | ${result.exam_time ? result.exam_time : '10:00 AM'}`
        : '';

      // Copy whatever was read into the form.
      if (filledSubject) setSubject(filledSubject);
      if (filledVenue) setExamVenue(filledVenue);
      setExamCategory(filledCategory);
      if (filledExamType) {
        setExamType(filledExamType);
        setExamTypeSearch(filledExamType);
      }
      if (filledDate) setExamDate(filledDate);

      // Exam type is optional. Subject, venue, and date are required for confident auto-submit.
      if (!filledSubject || !filledVenue || !filledDate) {
        Alert.alert('Hall Ticket Partially Read', 'We couldn\'t confidently read every field. Please review and complete the form before submitting.');
        return;
      }

      // Everything was read: submit now, passing the values directly because state updates are not applied yet.
      await handleSubmit({
        subject: filledSubject,
        examVenue: filledVenue,
        examCategory: filledCategory,
        examType: filledExamType,
        examDate: filledDate,
        admitCardImage: fileName,
      });
    } catch (err: any) {
      // On failure keep the file attached so the student can finish the form by hand.
      setAdmitCardImage(fileName);
      setAdmitCardFileName(fileName);
      Alert.alert('Auto-Fill Failed', err.message || 'Could not read details from this file. Your hall ticket was still attached — please fill the fields manually.');
    } finally {
      setIsParsingHallTicket(false);
    }
  };

  /** Asks whether to upload the hall ticket as a photo or a PDF, then opens the matching picker. */
  const handlePickAdmitCard = () => {
    Alert.alert(
      'Upload Hall Ticket',
      'Choose how you want to upload your admit card.',
      [
        { text: 'Choose Photo', onPress: pickAdmitCardImage },
        { text: 'Choose PDF', onPress: pickAdmitCardPdf },
        { text: 'Cancel', style: 'cancel' },
      ]
    );
  };

  /** Picks a hall ticket image from the photo library (after asking permission) and sends it for analysis. */
  const pickAdmitCardImage = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permission Required', 'Please allow photo library access to upload your hall ticket.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
      base64: false,
    });

    if (result.canceled || !result.assets?.[0]) return;

    // Fall back to a generic type and a timestamped name when the picker provides none.
    const asset = result.assets[0];
    const mimeType = asset.mimeType || 'image/jpeg';
    const fileName = asset.fileName || `hall_ticket_${Date.now()}.jpg`;
    await analyzeHallTicket(asset.uri, mimeType, fileName);
  };

  /** Picks a hall ticket PDF with the document picker and sends it for analysis. */
  const pickAdmitCardPdf = async () => {
    const result = await DocumentPicker.getDocumentAsync({
      type: 'application/pdf',
      copyToCacheDirectory: true,
    });

    if (result.canceled || !result.assets?.[0]) return;

    const asset = result.assets[0];
    const mimeType = asset.mimeType || 'application/pdf';
    const fileName = asset.name || `hall_ticket_${Date.now()}.pdf`;
    await analyzeHallTicket(asset.uri, mimeType, fileName);
  };

  // Entry-choice screen: "Auto-Fill from Admit Card" jumps straight to the picker,
  // then lands on the (now pre-filled) form once analysis completes.
  /** Switches to the form view and opens the hall-ticket picker. */
  const startAutoFillEntry = () => {
    setEntryMode('form');
    handlePickAdmitCard();
  };

  // Accepts optional overrides so a caller (e.g. the AI auto-fill flow) can submit immediately
  // with freshly-parsed values instead of waiting a render cycle for state to catch up.
  /**
   * Validates the form and saves the request(s) to `exam_requests`.
   *
   * Edit mode updates row `params.id`; create mode inserts the primary exam plus one row per extra subject.
   * On success it shows an alert and replaces the route with the student console's Requests tab.
   *
   * @param overrides Freshly parsed values to use in place of the form state (from the auto-fill flow).
   */
  const handleSubmit = async (overrides?: {
    subject: string;
    examVenue: string;
    examCategory?: string;
    examType?: string;
    examDate: string;
    admitCardImage: string;
  }) => {
    // The profile supplies the student's name, DOB, phones and Aadhaar for the payload.
    if (!profile) {
      Alert.alert('Error', 'Your profile details could not be loaded. Please try again.');
      return;
    }

    // Use each override when given, otherwise the form state (typed custom exam type counts too).
    const finalSubject = overrides?.subject ?? subject;
    const finalVenue = overrides?.examVenue ?? examVenue;
    const finalExamCategory = overrides?.examCategory ?? examCategory;
    const finalExamType = overrides?.examType !== undefined ? overrides.examType : (examType || examTypeSearch);
    const finalExamDate = overrides?.examDate ?? examDate;
    const finalAdmitCard = overrides?.admitCardImage ?? admitCardImage;

    // Hall ticket / admit card is compulsory
    if (!finalAdmitCard || !finalAdmitCard.trim()) {
      Alert.alert(
        'Hall Ticket Required',
        'Please upload your admit card or hall ticket to submit your exam request.'
      );
      return;
    }

    // Required fields: subject, exam date, venue, and at least one language. Specific exam type is optional!
    if (!finalSubject.trim() || !finalExamDate.trim() || !finalVenue.trim() || examLanguages.length === 0) {
      Alert.alert(
        'Missing Fields',
        'Please fill in all required exam fields and select at least one language.'
      );
      return;
    }

    // Validate any additional subjects (Bulk Exam Creation). Only in create mode.
    if (!isEditing && extraSubjects.length > 0) {
      const incomplete = extraSubjects.some(
        row => !row.subject.trim() || !row.examDate.trim() || !row.examVenue.trim()
      );
      if (incomplete) {
        Alert.alert('Missing Fields', 'Please complete the subject, date, and venue for every additional exam you added.');
        return;
      }
    }

    setLoading(true);

    try {
      // The session gives the student id stored on each request.
      const { data: { session } } = await supabase.auth.getSession();

      if (!session) {
        throw new Error("You must be logged in to create a request.");
      }

      // If specific exam type is provided (or typed custom), store as: "Category (Exam Type)".
      // If omitted, store simply as "Category" (e.g. "College Exam", "Government Exam", "Competitive Exam").
      const formattedExamType = finalExamType?.trim()
        ? `${finalExamCategory} (${finalExamType.trim()})`
        : finalExamCategory;

      // Fields shared by every exam in this submission.
      const sharedPayload = {
        student_id: session.user.id,
        student_name: profile.official_name || profile.full_name,
        dob: profile.dob,
        phone: profile.phone,
        emergency_phone: profile.emergency_phone,
        exam_type: formattedExamType,
        exam_language: examLanguages.join(', '),
        id_proof: profile.aadhar_number || 'Aadhar Verified',
        admit_card_proof: finalAdmitCard,
        status: 'pending'
      };

      // The primary exam's full row.
      const requestPayload = {
        ...sharedPayload,
        subject: finalSubject.trim(),
        exam_date: finalExamDate.trim(),
        exam_venue: finalVenue.trim(),
        google_maps_url: googleMapsUrl || getGoogleMapsUrl(finalVenue),
      };

      // Edit: update the existing row in place.
      if (isEditing) {
        const { error } = await supabase
          .from('exam_requests')
          .update(requestPayload)
          .eq('id', params.id);

        if (error) throw error;
        Alert.alert('Success', 'Your scribe request has been updated successfully!');
      } else {
        // Split the primary subject plus every additional subject into individual requests.
        const allRows = [
          requestPayload,
          ...extraSubjects.map(row => ({
            ...sharedPayload,
            subject: row.subject.trim(),
            exam_date: row.examDate.trim(),
            exam_venue: row.examVenue.trim(),
            google_maps_url: row.google_maps_url || getGoogleMapsUrl(row.examVenue),
          })),
        ];

        // Insert one row at a time; the first error stops the loop and is shown to the student.
        for (const row of allRows) {
          const { error } = await supabase.from('exam_requests').insert(row);
          if (error) throw error;
        }

        Alert.alert(
          'Success',
          allRows.length > 1
            ? `${allRows.length} scribe requests have been posted successfully!`
            : 'Your scribe request has been posted successfully!'
        );
      }

      // Land on the student's Requests tab so the new/updated request is immediately visible.
      // router.back() can throw GO_BACK errors when this screen was reached without history
      // (e.g. straight from the auto-fill flow), so always replace instead.
      router.replace({ pathname: '/console/student' as any, params: { tab: 'requests' } });
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to save request.');
    } finally {
      setLoading(false);
    }
  };

  /** Back from the chooser (or while editing): previous screen, or the console if there is none. */
  const leavePage = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/console/student' as any);
  };

  // Voice Assistant Mode: hands-free conversational exam request creator
  if (entryMode === 'voice') {
    return (
      <VoiceExamWizard
        profile={profile}
        onCancel={() => setEntryMode('choice')}
        onSuccess={() => {
          Alert.alert(t('success'), 'Exam request created successfully via Voice Assistant!');
          router.replace('/console/student/' as any);
        }}
      />
    );
  }

  // Entry-choice screen: Exam (voice / scan admit card / fill manually) or Assignment.
  if (entryMode === 'choice') {
    return (
      <RequestPage>
        <RequestHeader title={t('new_request')} subtitle={t('chooser_subtitle')} onBack={leavePage} />
        <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 70 }}>
          <RequestTypeChooser
            onVoice={() => {
              setEntryMode('voice');
              announceForAccessibility('Voice assistant request wizard opened');
            }}
            onAutoFill={startAutoFillEntry}
            onManual={() => {
              setEntryMode('form');
              announceForAccessibility('Manual scribe request form opened');
            }}
            onAssignment={() => router.push('/console/student/assignment_form' as any)}
          />
        </ScrollView>
        <RequestTabBar />
      </RequestPage>
    );
  }

  // Form view (manual entry, after auto-fill, or editing).
  return (
    <RequestPage>
      {/* Back: a new request returns to the chooser; editing leaves the page */}
      <RequestHeader
        title={isEditing ? t('edit_exam_request') : t('new_request')}
        subtitle={isEditing ? undefined : t('fill_exam_details')}
        onBack={() => (isEditing ? leavePage() : setEntryMode('choice'))}
      />

      {/* Scrollable form: one card per section */}
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 18, paddingBottom: 110 }} keyboardShouldPersistTaps="handled">
        <View style={{ gap: 14 }}>
          
          {/* Section: Exam Classification */}
          <FormSection icon="layers" title={t('exam_classification')}>

            <View style={{ gap: 12 }}>
              {/* 1. Exam Category Dropdown Field Box */}
              <View>
                <Text style={{ fontSize: 11, fontWeight: '700', color: '#64748b', marginBottom: 6, marginLeft: 2 }}>
                  {t('exam_category')} *
                </Text>
                <TouchableOpacity
                  testID="field-exam-category"
                  activeOpacity={0.7}
                  onPress={() => setActivePicker('category')}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    backgroundColor: '#f8fafc',
                    borderWidth: 1.5,
                    borderColor: examCategory ? '#2563eb' : '#e2e8f0',
                    borderRadius: 14,
                    paddingHorizontal: 14,
                    height: 48,
                  }}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
                    <View
                      style={{
                        width: 28,
                        height: 28,
                        borderRadius: 8,
                        backgroundColor: '#eff6ff',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <Feather name="book-open" size={15} color="#2563eb" />
                    </View>
                    <Text style={{ fontFamily: 'Roboto', fontSize: 13.5, fontWeight: examCategory ? '700' : '500', color: examCategory ? '#0f172a' : '#94a3b8' }}>
                      {examCategory || 'Select Exam Category'}
                    </Text>
                  </View>
                  <Feather name="chevron-down" size={16} color="#64748b" />
                </TouchableOpacity>
              </View>

              {/* 2. Exam Type (Specific / Optional) Dropdown Field Box */}
              <View>
                <Text style={{ fontSize: 11, fontWeight: '700', color: '#64748b', marginBottom: 6, marginLeft: 2 }}>
                  {t('exam_type')} (Optional)
                </Text>
                <TouchableOpacity
                  testID="field-exam-type"
                  activeOpacity={0.7}
                  onPress={() => {
                    setExamTypeSearch(examType);
                    setActivePicker('type');
                  }}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    backgroundColor: '#f8fafc',
                    borderWidth: 1.5,
                    borderColor: examType ? '#2563eb' : '#e2e8f0',
                    borderRadius: 14,
                    paddingHorizontal: 14,
                    height: 48,
                  }}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1, marginRight: 8 }}>
                    <View
                      style={{
                        width: 28,
                        height: 28,
                        borderRadius: 8,
                        backgroundColor: '#eff6ff',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <Feather name="layers" size={15} color="#2563eb" />
                    </View>
                    <Text
                      numberOfLines={1}
                      style={{
                        fontFamily: 'Roboto',
                        fontSize: 13.5,
                        fontWeight: examType ? '700' : '500',
                        color: examType ? '#0f172a' : '#94a3b8',
                        flex: 1,
                      }}
                    >
                      {examType || `Select or type exam (e.g. ${EXAM_TYPE_OPTIONS[examCategory]?.[0] || 'Optional'})`}
                    </Text>
                  </View>
                  <Feather name="chevron-down" size={16} color="#64748b" />
                </TouchableOpacity>
              </View>

              {/* 3. Language Selection Dropdown Field Box */}
              <View>
                <Text style={{ fontSize: 11, fontWeight: '700', color: '#64748b', marginBottom: 6, marginLeft: 2 }}>
                  {t('exam_language_req')} *
                </Text>
                <TouchableOpacity
                  testID="field-exam-language"
                  activeOpacity={0.7}
                  onPress={() => setActivePicker('language')}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    backgroundColor: '#f8fafc',
                    borderWidth: 1.5,
                    borderColor: examLanguages.length > 0 ? '#2563eb' : '#e2e8f0',
                    borderRadius: 14,
                    paddingHorizontal: 14,
                    height: 48,
                  }}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1, marginRight: 8 }}>
                    <View
                      style={{
                        width: 28,
                        height: 28,
                        borderRadius: 8,
                        backgroundColor: '#eff6ff',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <Feather name="globe" size={15} color="#2563eb" />
                    </View>
                    <Text
                      numberOfLines={1}
                      style={{
                        fontFamily: 'Roboto',
                        fontSize: 13.5,
                        fontWeight: examLanguages.length > 0 ? '700' : '500',
                        color: examLanguages.length > 0 ? '#0f172a' : '#94a3b8',
                        flex: 1,
                      }}
                    >
                      {examLanguages.length > 0 ? examLanguages.join(', ') : 'Select Language(s)'}
                    </Text>
                  </View>
                  <Feather name="chevron-down" size={16} color="#64748b" />
                </TouchableOpacity>
              </View>
            </View>
          </FormSection>

          {/* Section: Exam Details — includes Admit Card Upload */}
          <FormSection icon="file-text" title={t('exam_details')}>

            <View className="space-y-3">
              {/* Subject / paper name */}
              <View>
                <Text className="text-[10px] font-semibold text-slate-500 mb-1 ml-1">{t('subject_paper_name')} *</Text>
                <TextInput
                  value={subject}
                  onChangeText={setSubject}
                  placeholder="e.g. Mathematics-II"
                  accessible={true}
                  accessibilityLabel="Subject or Paper Name"
                  accessibilityHint="Enter exam subject name, for example Mathematics"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-800 focus:border-blue-500 focus:bg-white transition-all"
                />
              </View>


              {/* Date & Time Picker Trigger */}
              <View>
                <Text className="text-[10px] font-semibold text-slate-500 mb-1 ml-1">{t('exam_date_time')} *</Text>
                <TouchableOpacity
                  onPress={() => { setActiveExtraIndex(-1); setShowDatePicker(true); }}
                  activeOpacity={0.8}
                  accessible={true}
                  accessibilityRole="button"
                  accessibilityLabel={`Exam Date and Time: ${examDate || 'Not selected'}`}
                  accessibilityHint="Opens calendar and time picker dialog"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 flex-row items-center justify-between active:border-blue-500"
                >
                  <Text className={`text-sm ${examDate ? 'text-slate-800 font-semibold' : 'text-slate-400'}`}>
                    {examDate || t('select_date')}
                  </Text>
                  <Feather name="calendar" size={16} color="#2563eb" importantForAccessibility="no" accessibilityElementsHidden={true} />
                </TouchableOpacity>
              </View>

              {/* Venue & Map Trigger */}
              <View>
                <Text className="text-[10px] font-semibold text-slate-500 mb-1 ml-1">{t('exam_venue_address')} *</Text>
                <View className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 flex-row items-center justify-between focus-within:border-blue-500 focus-within:bg-white">
                  <TextInput
                    value={examVenue}
                    onChangeText={(val) => {
                      setExamVenue(val);
                      if (!googleMapsUrl || !val.includes(examVenue.slice(0, 10))) {
                        setGoogleMapsUrl(getGoogleMapsUrl(val));
                      }
                    }}
                    placeholder="Enter exam venue or search college..."
                    multiline={true}
                    numberOfLines={2}
                    accessible={true}
                    accessibilityLabel="Exam Venue and Address"
                    accessibilityHint="Enter examination center location address"
                    className="flex-1 text-sm text-slate-800 mr-2 py-1"
                  />
                  {/* GPS auto-detect and Google Maps place search modal buttons */}
                  <View className="flex-row gap-2">
                    <TouchableOpacity
                      onPress={() => handleGetCurrentLocation(-1)}
                      disabled={isLocating}
                      accessible={true}
                      accessibilityRole="button"
                      accessibilityLabel="Detect Current Location"
                      accessibilityHint="Fills venue with your current GPS location"
                      className="p-2 bg-blue-50 rounded-lg active:bg-blue-100 items-center justify-center"
                    >
                      {isLocating && activeExtraIndex === -1 ? (
                        <ActivityIndicator size="small" color="#2563eb" style={{ width: 16, height: 16 }} />
                      ) : (
                        <Feather name="navigation" size={16} color="#2563eb" importantForAccessibility="no" accessibilityElementsHidden={true} />
                      )}
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => {
                        setActiveExtraIndex(-1);
                        setVenueSearchQuery(examVenue);
                        setShowMapPicker(true);
                      }}
                      accessible={true}
                      accessibilityRole="button"
                      accessibilityLabel="Search College / Center on Google Maps"
                      accessibilityHint="Opens Google Maps place search to select institution"
                      className="p-2 bg-blue-50 rounded-lg active:bg-blue-100"
                    >
                      <Feather name="map-pin" size={16} color="#2563eb" importantForAccessibility="no" accessibilityElementsHidden={true} />
                    </TouchableOpacity>
                  </View>
                </View>

                {/* Google Maps link badge & preview */}
                {examVenue ? (
                  <View className="mt-2 flex-row items-center justify-between bg-emerald-50 border border-emerald-200 px-3 py-2 rounded-xl">
                    <View className="flex-row items-center gap-2 flex-1 mr-2">
                      <View className="w-5 h-5 rounded-full bg-emerald-500/20 items-center justify-center">
                        <Feather name="map-pin" size={11} color="#059669" />
                      </View>
                      <Text className="text-xs font-semibold text-emerald-950 flex-1" numberOfLines={1}>
                        Google Maps link attached for scribe
                      </Text>
                    </View>
                    <TouchableOpacity
                      onPress={() => openGoogleMaps(googleMapsUrl || examVenue)}
                      className="flex-row items-center gap-1 bg-white border border-emerald-300 px-2.5 py-1 rounded-lg shadow-sm"
                    >
                      <Feather name="navigation" size={11} color="#059669" />
                      <Text className="text-[11px] font-bold text-emerald-700">Open ↗</Text>
                    </TouchableOpacity>
                  </View>
                ) : null}
              </View>

              {/* Admit Card Upload + AI Auto-Fill */}
              <View className="pt-1">
                <View className="flex-row items-center justify-between mb-1 ml-1">
                  <Text className="text-[10px] font-semibold text-slate-500">
                    {t('upload_admit_card_optional')}
                  </Text>
                  <View className="bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
                    <Text className="text-[9px] font-bold text-amber-700 uppercase tracking-wide">Compulsory</Text>
                  </View>
                </View>
                <TouchableOpacity
                  testID="btn-upload-hall-ticket"
                  onPress={handlePickAdmitCard}
                  disabled={isParsingHallTicket}
                  accessible={true}
                  accessibilityRole="button"
                  accessibilityLabel={admitCardFileName ? `Hall Ticket uploaded: ${admitCardFileName}` : "Upload Admit Card or Hall Ticket (Compulsory)"}
                  accessibilityHint="Select a photo or PDF of your hall ticket"
                  className={`w-full border-2 border-dashed rounded-xl p-4 items-center justify-center ${
                    admitCardImage
                      ? 'border-emerald-300 bg-emerald-50/40'
                      : 'border-slate-200 bg-slate-50/60 active:border-blue-400'
                  }`}
                >
                  {/* Shows the attached file name once picked, otherwise the upload prompt */}
                  {admitCardImage ? (
                    <View className="items-center">
                      <Feather
                        name={admitCardFileName?.toLowerCase().endsWith('.pdf') ? 'file-text' : 'image'}
                        size={24}
                        color="#059669"
                        importantForAccessibility="no" accessibilityElementsHidden={true}
                      />
                      <Text className="text-xs font-semibold text-slate-800 mt-1">{admitCardFileName || admitCardImage}</Text>
                      <Text className="text-[10px] text-emerald-600 font-bold mt-0.5">{t('tap_to_change_file')}</Text>
                    </View>
                  ) : (
                    <View className="items-center">
                      <Feather name="upload-cloud" size={24} color="#94a3b8" importantForAccessibility="no" accessibilityElementsHidden={true} />
                      <Text className="text-xs font-semibold text-slate-600 mt-1">{t('upload_hall_ticket_prompt')}</Text>
                      <Text className="text-[10px] text-slate-400 mt-0.5">{t('autofill_hint')}</Text>
                    </View>
                  )}
                </TouchableOpacity>
              </View>

            </View>
          </FormSection>

          {/* Section: Additional Subjects (Bulk Exam Creation) — create mode only */}
          {!isEditing && (
            <FormSection
              icon="copy"
              title={t('additional_exams')}
              right={extraSubjects.length > 0 ? (
                <View className="bg-blue-50 px-2 py-0.5 rounded-full">
                  <Text className="text-[9px] font-bold text-blue-600">{extraSubjects.length + 1} total</Text>
                </View>
              ) : undefined}
            >
              <Text className="text-[10px] text-slate-400 mb-2.5 ml-0.5">
                {t('additional_exams_desc')}
              </Text>

              {/* One card per extra exam: subject, date/time and venue (same pickers, targeted via activeExtraIndex) */}
              {extraSubjects.map((row, index) => (
                <View key={index} className="bg-slate-50 border border-slate-200 rounded-2xl p-3 mb-2.5">
                  <View className="flex-row items-center justify-between mb-2">
                    <Text className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Exam #{index + 2}</Text>
                    <TouchableOpacity onPress={() => removeExtraSubject(index)} className="p-1">
                      <Feather name="trash-2" size={14} color="#ef4444" />
                    </TouchableOpacity>
                  </View>

                  <View className="space-y-2">
                    <TextInput
                      value={row.subject}
                      onChangeText={(text) => updateExtraSubject(index, 'subject', text)}
                      placeholder="Subject / Paper Name"
                      className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-800"
                    />

                    <TouchableOpacity
                      onPress={() => { setActiveExtraIndex(index); setShowDatePicker(true); }}
                      activeOpacity={0.8}
                      className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2.5 flex-row items-center justify-between"
                    >
                      <Text className={`text-sm ${row.examDate ? 'text-slate-800 font-semibold' : 'text-slate-400'}`}>
                        {row.examDate || t('select_date')}
                      </Text>
                      <Feather name="calendar" size={16} color="#2563eb" />
                    </TouchableOpacity>

                    <View className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 flex-row items-center justify-between">
                      <TextInput
                        value={row.examVenue}
                        onChangeText={(text) => {
                          updateExtraSubject(index, 'examVenue', text);
                          updateExtraSubject(index, 'google_maps_url', getGoogleMapsUrl(text));
                        }}
                        placeholder="Exam venue or college name..."
                        multiline={true}
                        numberOfLines={2}
                        className="flex-1 text-sm text-slate-800 mr-2 py-1"
                      />
                      <View className="flex-row gap-2">
                        <TouchableOpacity
                          onPress={() => handleGetCurrentLocation(index)}
                          disabled={isLocating}
                          className="p-2 bg-blue-50 rounded-lg active:bg-blue-100 items-center justify-center"
                        >
                          {isLocating && activeExtraIndex === index ? (
                            <ActivityIndicator size="small" color="#2563eb" style={{ width: 16, height: 16 }} />
                          ) : (
                            <Feather name="navigation" size={16} color="#2563eb" />
                          )}
                        </TouchableOpacity>
                        <TouchableOpacity
                          onPress={() => {
                            setActiveExtraIndex(index);
                            setVenueSearchQuery(row.examVenue);
                            setShowMapPicker(true);
                          }}
                          className="p-2 bg-blue-50 rounded-lg active:bg-blue-100"
                        >
                          <Feather name="map-pin" size={16} color="#2563eb" />
                        </TouchableOpacity>
                      </View>
                    </View>

                    {/* Google Maps link preview for extra subject */}
                    {row.examVenue ? (
                      <View className="mt-1 flex-row items-center justify-between bg-emerald-50/80 border border-emerald-200 px-2.5 py-1.5 rounded-lg">
                        <Text className="text-[11px] font-semibold text-emerald-950 flex-1" numberOfLines={1}>
                          📍 Maps link attached
                        </Text>
                        <TouchableOpacity
                          onPress={() => openGoogleMaps(row.google_maps_url || row.examVenue)}
                          className="flex-row items-center gap-1 bg-white border border-emerald-300 px-2 py-0.5 rounded shadow-sm"
                        >
                          <Feather name="navigation" size={10} color="#059669" />
                          <Text className="text-[10px] font-bold text-emerald-700">Open ↗</Text>
                        </TouchableOpacity>
                      </View>
                    ) : null}
                  </View>
                </View>
              ))}

              {/* Add another extra exam row */}
              <TouchableOpacity
                onPress={addExtraSubject}
                className="w-full border-2 border-dashed border-blue-200 bg-blue-50/40 rounded-xl py-2.5 flex-row items-center justify-center active:bg-blue-50"
              >
                <Feather name="plus" size={16} color="#2563eb" />
                <Text className="text-blue-600 font-bold text-xs ml-1.5">{t('add_another_exam')}</Text>
              </TouchableOpacity>
            </FormSection>
          )}

          {/* Submit Button */}
          <SubmitButton label={isEditing ? t('save_changes') : (extraSubjects.length > 0 ? t('post_n_requests', { count: extraSubjects.length + 1 }) : t('post_scribe_request'))} onPress={() => handleSubmit()} loading={loading} />

        </View>
      </ScrollView>

      {/* 1. DATE & TIME PICKER MODAL */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={showDatePicker}
        onRequestClose={() => setShowDatePicker(false)}
        accessibilityViewIsModal={true}
      >
        <View className="flex-1 bg-slate-950/50 justify-center items-center px-6">
          <View className="bg-white w-full max-w-sm rounded-3xl p-5 border border-slate-100 shadow-2xl">
            
            <Text className="text-sm font-bold text-slate-800 mb-3.5 uppercase tracking-wider">Select Date & Time</Text>
            
            {/* Calendar Month Navigation */}
            <View className="flex-row items-center justify-between mb-3">
              <TouchableOpacity onPress={() => changeMonth('prev')} className="p-1.5 bg-slate-50 rounded-lg">
                <Feather name="chevron-left" size={14} color="#334155" />
              </TouchableOpacity>
              <Text className="text-xs font-bold text-slate-800">{MONTHS[calendarMonth]} {calendarYear}</Text>
              <TouchableOpacity onPress={() => changeMonth('next')} className="p-1.5 bg-slate-50 rounded-lg">
                <Feather name="chevron-right" size={14} color="#334155" />
              </TouchableOpacity>
            </View>

            {/* Weekdays Header */}
            <View className="flex-row flex-wrap mb-1">
              {WEEKDAYS.map((day) => (
                <View key={day} className="w-[14.28%] items-center py-1">
                  <Text className="text-[9px] font-bold text-slate-400 uppercase">{day}</Text>
                </View>
              ))}
            </View>

            {/* Calendar Days Grid */}
            <View className="flex-row flex-wrap mb-4 border-b border-slate-100 pb-3">
              {renderCalendarDays()}
            </View>

            {/* Time Picker Controls */}
            <Text className="text-[10px] font-bold text-slate-400 uppercase mb-2 tracking-wider">Set Exam Time</Text>
            <View className="flex-row items-center justify-between mb-5 bg-slate-50 p-2.5 rounded-2xl border border-slate-100">
              {/* Hour Input */}
              <View className="items-center flex-1">
                <TextInput 
                  value={selectedHour}
                  onChangeText={(text) => {
                    // Accept only 1-12 (or empty while typing).
                    const h = parseInt(text);
                    if (!text || (h >= 1 && h <= 12)) setSelectedHour(text);
                  }}
                  keyboardType="numeric"
                  maxLength={2}
                  className="bg-white border border-slate-200 rounded-lg w-10 py-1 text-center font-bold text-slate-800 text-sm"
                />
                <Text className="text-[8px] font-bold text-slate-400 mt-1 uppercase">Hour</Text>
              </View>

              <Text className="text-lg font-black text-slate-400 mb-3">:</Text>

              {/* Minute Input */}
              <View className="items-center flex-1">
                <TextInput 
                  value={selectedMinute}
                  onChangeText={(text) => {
                    // Accept only 0-59 (or empty while typing).
                    const m = parseInt(text);
                    if (!text || (m >= 0 && m <= 59)) setSelectedMinute(text);
                  }}
                  keyboardType="numeric"
                  maxLength={2}
                  className="bg-white border border-slate-200 rounded-lg w-10 py-1 text-center font-bold text-slate-800 text-sm"
                />
                <Text className="text-[8px] font-bold text-slate-400 mt-1 uppercase">Min</Text>
              </View>

              {/* AM / PM Segmented Toggle */}
              <View className="flex-row bg-slate-200/60 p-0.5 rounded-lg ml-2">
                <TouchableOpacity 
                  onPress={() => setSelectedAmPm('AM')}
                  className={`px-2.5 py-1 rounded-md ${selectedAmPm === 'AM' ? 'bg-blue-500' : ''}`}
                >
                  <Text className={`text-[9px] font-bold ${selectedAmPm === 'AM' ? 'text-white' : 'text-slate-600'}`}>AM</Text>
                </TouchableOpacity>
                <TouchableOpacity 
                  onPress={() => setSelectedAmPm('PM')}
                  className={`px-2.5 py-1 rounded-md ${selectedAmPm === 'PM' ? 'bg-blue-500' : ''}`}
                >
                  <Text className={`text-[9px] font-bold ${selectedAmPm === 'PM' ? 'text-white' : 'text-slate-600'}`}>PM</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Action Buttons */}
            <View className="flex-row space-x-2.5">
              <TouchableOpacity 
                onPress={() => setShowDatePicker(false)}
                className="flex-1 bg-slate-100 py-2.5 rounded-xl items-center justify-center border border-slate-200"
              >
                <Text className="text-slate-600 font-bold text-xs">Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                onPress={handleConfirmDateTime}
                className="flex-1 bg-blue-500 py-2.5 rounded-xl items-center justify-center shadow-md shadow-blue-500/25"
              >
                <Text className="text-white font-bold text-xs">Confirm</Text>
              </TouchableOpacity>
            </View>

          </View>
        </View>
      </Modal>

      {/* 2. GOOGLE MAPS VENUE & COLLEGE SEARCH MODAL */}
      <Modal
        animationType="fade"
        transparent={true}
        visible={showMapPicker}
        onRequestClose={() => setShowMapPicker(false)}
        accessibilityViewIsModal={true}
      >
        <View className="flex-1 bg-slate-950/60 justify-center items-center px-4 py-8">
          <View className="bg-white w-full max-w-md rounded-3xl overflow-hidden shadow-2xl border border-slate-100 flex-1 max-h-[580px]">
            
            {/* Modal Header */}
            <View className="px-5 py-4 border-b border-slate-100 flex-row items-center justify-between bg-white">
              <View className="flex-row items-center gap-2.5">
                <View className="w-8 h-8 rounded-xl bg-blue-500/10 items-center justify-center">
                  <Feather name="map-pin" size={16} color="#2563eb" />
                </View>
                <View>
                  <Text
                    accessible={true}
                    accessibilityRole="header"
                    className="text-sm font-bold text-slate-800"
                  >
                    Find College on Google Maps
                  </Text>
                  <Text className="text-[10px] text-slate-400">
                    Search colleges, universities & exam venues
                  </Text>
                </View>
              </View>
              <TouchableOpacity
                onPress={() => setShowMapPicker(false)}
                accessible={true}
                accessibilityRole="button"
                accessibilityLabel="Close Venue Search"
                className="w-8 h-8 rounded-full bg-slate-100 items-center justify-center active:bg-slate-200"
              >
                <Feather name="x" size={16} color="#64748b" />
              </TouchableOpacity>
            </View>

            {/* Search Input Bar */}
            <View className="p-4 bg-slate-50 border-b border-slate-100">
              <View className="bg-white border border-slate-200 rounded-xl px-3 py-2 flex-row items-center">
                <Feather name="search" size={15} color="#64748b" style={{ marginRight: 8 }} />
                <TextInput
                  value={venueSearchQuery}
                  onChangeText={handleSearchVenue}
                  placeholder="Type college name, university, city..."
                  className="flex-1 text-xs text-slate-800 py-1"
                  autoFocus={true}
                  returnKeyType="search"
                />
                {venueSearchQuery ? (
                  <TouchableOpacity onPress={() => handleSearchVenue('')} className="p-1">
                    <Feather name="x" size={14} color="#94a3b8" />
                  </TouchableOpacity>
                ) : null}
              </View>

              {/* GPS Quick Action */}
              <TouchableOpacity
                onPress={() => {
                  handleGetCurrentLocation(activeExtraIndex);
                  setShowMapPicker(false);
                }}
                disabled={isLocating}
                className="mt-2.5 flex-row items-center justify-center gap-2 bg-blue-50/80 border border-blue-200/80 rounded-xl py-2 active:bg-blue-100"
              >
                {isLocating ? (
                  <ActivityIndicator size="small" color="#2563eb" style={{ width: 14, height: 14 }} />
                ) : (
                  <Feather name="crosshair" size={13} color="#2563eb" />
                )}
                <Text className="text-xs font-bold text-blue-700">
                  Use My Current GPS Location
                </Text>
              </TouchableOpacity>
            </View>

            {/* Live Search Status or Custom Choice */}
            {isSearchingVenues && (
              <View className="py-3 px-4 bg-blue-50/40 flex-row items-center justify-center gap-2 border-b border-blue-100">
                <ActivityIndicator size="small" color="#2563eb" />
                <Text className="text-[11px] font-semibold text-blue-600">
                  Searching Google Maps directory...
                </Text>
              </View>
            )}

            {/* Custom Venue Option if student typed text */}
            {venueSearchQuery.trim().length > 2 && (
              <TouchableOpacity
                onPress={() => handleSelectCustomVenue(venueSearchQuery)}
                className="mx-4 my-2.5 p-3 rounded-2xl bg-amber-50/60 border border-amber-200/80 flex-row items-center justify-between active:bg-amber-100/60"
              >
                <View className="flex-1 mr-2">
                  <Text className="text-[10px] font-bold text-amber-800 uppercase tracking-wider">
                    Use Custom Location
                  </Text>
                  <Text className="text-xs font-bold text-slate-800 mt-0.5" numberOfLines={1}>
                    "{venueSearchQuery}"
                  </Text>
                  <Text className="text-[10px] text-slate-500 mt-0.5">
                    Will link to a universal Google Maps search for this venue
                  </Text>
                </View>
                <View className="bg-amber-500 px-2.5 py-1.5 rounded-lg">
                  <Text className="text-[10px] font-bold text-white">Select</Text>
                </View>
              </TouchableOpacity>
            )}

            {/* Results / Suggestions List */}
            <View className="flex-1 px-4 py-2">
              <Text className="text-[10px] font-bold text-slate-400 uppercase mb-2 tracking-wider">
                {venueSearchQuery.trim() ? 'Search Results' : 'Suggested Exam Centers & Colleges'}
              </Text>
              
              <ScrollView className="flex-1">
                {venueSearchResults.map((loc) => (
                  <TouchableOpacity
                    key={loc.id}
                    onPress={() => handleSelectVenue(loc)}
                    accessible={true}
                    accessibilityRole="button"
                    accessibilityLabel={`${loc.name}, ${loc.address}`}
                    className="p-3 mb-2 bg-white rounded-2xl border border-slate-200/80 active:border-blue-500 active:bg-blue-50/20 shadow-sm"
                  >
                    <View className="flex-row items-start justify-between">
                      <View className="flex-1 mr-2">
                        <View className="flex-row items-center gap-1.5 mb-1">
                          <Feather name="map-pin" size={13} color="#2563eb" />
                          <Text className="text-xs font-bold text-slate-800 flex-1" numberOfLines={1}>
                            {loc.name}
                          </Text>
                        </View>
                        <Text className="text-[11px] text-slate-500 mt-0.5 line-clamp-2" numberOfLines={2}>
                          {loc.address}
                        </Text>
                      </View>
                      {loc.category && (
                        <View className="bg-blue-50 px-2 py-0.5 rounded-md self-start border border-blue-100">
                          <Text className="text-[9px] font-bold text-blue-600">{loc.category}</Text>
                        </View>
                      )}
                    </View>

                    <View className="flex-row items-center justify-between mt-2.5 pt-2 border-t border-slate-100">
                      <TouchableOpacity
                        onPress={() => openGoogleMaps(loc.mapsUrl || loc.name + ', ' + loc.address)}
                        className="flex-row items-center gap-1"
                      >
                        <Feather name="navigation" size={11} color="#059669" />
                        <Text className="text-[10px] font-bold text-emerald-700">Preview on Maps ↗</Text>
                      </TouchableOpacity>

                      <View className="bg-blue-600 px-3 py-1 rounded-lg">
                        <Text className="text-[10px] font-bold text-white">Select Center</Text>
                      </View>
                    </View>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>

          </View>
        </View>
      </Modal>

      {/* 3. FULL-SCREEN OVERLAY: Hall Ticket Analysis in progress */}
      {/* Cannot be dismissed by the user (empty onRequestClose); it closes when the analysis finishes */}
      <Modal
        animationType="fade"
        transparent={true}
        visible={isParsingHallTicket}
        onRequestClose={() => {}}
        accessibilityViewIsModal={true}
      >
        <View className="flex-1 bg-slate-950/80 items-center justify-center px-10">
          <HallTicketScanningAnimation />
          <Text className="text-white font-black text-lg mt-6 text-center">Reading your hall ticket…</Text>
          <Text className="text-slate-300 text-xs mt-2 text-center leading-5">
            We're extracting the subject, date, venue and classification automatically. This usually takes a few seconds.
          </Text>
        </View>
      </Modal>

      {/* 4. Dropdown Picker Modal for Exam Classification (Type, Sub-topic, Language) */}
      <Modal
        animationType="fade"
        transparent
        visible={activePicker !== null}
        onRequestClose={() => setActivePicker(null)}
      >
        <TouchableOpacity
          activeOpacity={1}
          onPress={() => setActivePicker(null)}
          style={{
            flex: 1,
            backgroundColor: 'rgba(15,23,42,0.45)',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 20,
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
              padding: 18,
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 10 },
              shadowOpacity: 0.15,
              shadowRadius: 24,
              elevation: 8,
            }}
          >
            {/* Header */}
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
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <View
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 10,
                    backgroundColor: '#eff6ff',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Feather
                    name={
                      activePicker === 'category'
                        ? 'book-open'
                        : activePicker === 'type'
                        ? 'layers'
                        : 'globe'
                    }
                    size={16}
                    color="#2563eb"
                  />
                </View>
                <View>
                  <Text style={{ fontFamily: 'Roboto', fontSize: 15, fontWeight: '800', color: '#0f172a' }}>
                    {activePicker === 'category'
                      ? t('exam_category')
                      : activePicker === 'type'
                      ? `${t('exam_type')} (Optional)`
                      : t('exam_language_req')}
                  </Text>
                  <Text style={{ fontFamily: 'Roboto', fontSize: 11, color: '#64748b', fontWeight: '500' }}>
                    {activePicker === 'category'
                      ? 'Choose broad category (College, Govt, etc.)'
                      : activePicker === 'type'
                      ? `Select or type your specific ${examCategory} name`
                      : `${examLanguages.length} selected`}
                  </Text>
                </View>
              </View>

              <TouchableOpacity
                testID="btn-close-picker-modal"
                onPress={() => setActivePicker(null)}
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

            {/* Picker Body: Exam Category */}
            {activePicker === 'category' && (
              <ScrollView style={{ maxHeight: 300 }} showsVerticalScrollIndicator={false}>
                <View style={{ gap: 8 }}>
                  {EXAM_CATEGORIES.map((cat) => {
                    const isSelected = examCategory === cat;
                    const subtitles: { [k: string]: string } = {
                      'College Exam': 'Degree, Semester, KT, Diploma, University exams',
                      'Government Exam': 'GPSC, State PSC, SSC, UPSC, Departmental exams',
                      'Competitive Exam': 'JEE, NEET, CAT, Banking, Entrance tests',
                      'School Exam': '10th/12th Board, Term Exam, School tests',
                    };
                    return (
                      <TouchableOpacity
                        key={cat}
                        testID={`picker-option-category-${cat.toLowerCase().replace(/\s+/g, '-')}`}
                        activeOpacity={0.7}
                        onPress={() => {
                          setExamCategory(cat);
                          setExamType('');
                          setExamTypeSearch('');
                          setActivePicker(null);
                        }}
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          paddingHorizontal: 14,
                          paddingVertical: 12,
                          borderRadius: 14,
                          backgroundColor: isSelected ? '#eff6ff' : '#f8fafc',
                          borderWidth: 1.5,
                          borderColor: isSelected ? '#2563eb' : '#e2e8f0',
                        }}
                      >
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1, marginRight: 8 }}>
                          <View
                            style={{
                              width: 18,
                              height: 18,
                              borderRadius: 9,
                              borderWidth: 2,
                              borderColor: isSelected ? '#2563eb' : '#cbd5e1',
                              alignItems: 'center',
                              justifyContent: 'center',
                              backgroundColor: '#ffffff',
                            }}
                          >
                            {isSelected && (
                              <View
                                style={{
                                  width: 8,
                                  height: 8,
                                  borderRadius: 4,
                                  backgroundColor: '#2563eb',
                                }}
                              />
                            )}
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text
                              style={{
                                fontFamily: 'Roboto',
                                fontSize: 13.5,
                                fontWeight: isSelected ? '700' : '600',
                                color: isSelected ? '#1d4ed8' : '#334155',
                              }}
                            >
                              {cat}
                            </Text>
                            <Text style={{ fontFamily: 'Roboto', fontSize: 10.5, color: '#64748b', marginTop: 1 }}>
                              {subtitles[cat] || ''}
                            </Text>
                          </View>
                        </View>
                        {isSelected && <Feather name="check" size={16} color="#2563eb" />}
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </ScrollView>
            )}

            {/* Picker Body: Specific Exam Type */}
            {activePicker === 'type' && (
              <View>
                {/* Search / Type Custom Input */}
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    backgroundColor: '#f8fafc',
                    borderWidth: 1.5,
                    borderColor: '#2563eb',
                    borderRadius: 12,
                    paddingHorizontal: 10,
                    marginBottom: 10,
                    height: 42,
                  }}
                >
                  <Feather name="edit-3" size={15} color="#2563eb" />
                  <TextInput
                    testID="input-exam-type-search"
                    value={examTypeSearch}
                    onChangeText={setExamTypeSearch}
                    placeholder={`Type custom exam name or search...`}
                    placeholderTextColor="#94a3b8"
                    returnKeyType="done"
                    onSubmitEditing={() => {
                      const val = examTypeSearch.trim();
                      if (val) {
                        setExamType(val);
                        setActivePicker(null);
                      }
                    }}
                    style={{
                      flex: 1,
                      marginLeft: 8,
                      fontSize: 13,
                      fontWeight: '600',
                      color: '#0f172a',
                      paddingVertical: 0,
                    }}
                  />
                  {examTypeSearch.length > 0 && (
                    <TouchableOpacity onPress={() => setExamTypeSearch('')}>
                      <Feather name="x-circle" size={15} color="#94a3b8" />
                    </TouchableOpacity>
                  )}
                </View>

                {/* Specific exams list */}
                <ScrollView style={{ maxHeight: 260 }} showsVerticalScrollIndicator={false}>
                  <View style={{ gap: 6 }}>
                    {/* 1. Custom Typed Option Button if text entered */}
                    {examTypeSearch.trim().length > 0 && (
                      <TouchableOpacity
                        testID="picker-option-type-custom"
                        activeOpacity={0.7}
                        onPress={() => {
                          const customVal = examTypeSearch.trim();
                          setExamType(customVal);
                          setActivePicker(null);
                        }}
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          gap: 8,
                          paddingHorizontal: 12,
                          paddingVertical: 10,
                          borderRadius: 12,
                          backgroundColor: '#eff6ff',
                          borderWidth: 1.5,
                          borderColor: '#3b82f6',
                          borderStyle: 'dashed',
                          marginBottom: 4,
                        }}
                      >
                        <Feather name="plus-circle" size={15} color="#2563eb" />
                        <Text
                          style={{
                            fontFamily: 'Roboto',
                            fontSize: 13,
                            fontWeight: '700',
                            color: '#1d4ed8',
                            flex: 1,
                          }}
                          numberOfLines={1}
                        >
                          Use typed name: "{examTypeSearch.trim()}"
                        </Text>
                      </TouchableOpacity>
                    )}

                    {/* 2. Clear / None Option (Leave as Just Category) */}
                    <TouchableOpacity
                      testID="picker-option-type-none"
                      activeOpacity={0.7}
                      onPress={() => {
                        setExamType('');
                        setExamTypeSearch('');
                        setActivePicker(null);
                      }}
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        paddingHorizontal: 12,
                        paddingVertical: 10,
                        borderRadius: 12,
                        backgroundColor: !examType ? '#eff6ff' : '#f8fafc',
                        borderWidth: 1.5,
                        borderColor: !examType ? '#2563eb' : '#e2e8f0',
                      }}
                    >
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <Feather name="check-circle" size={14} color={!examType ? '#2563eb' : '#94a3b8'} />
                        <Text
                          style={{
                            fontFamily: 'Roboto',
                            fontSize: 13,
                            fontWeight: !examType ? '700' : '500',
                            color: !examType ? '#1d4ed8' : '#64748b',
                          }}
                        >
                          None (Just {examCategory})
                        </Text>
                      </View>
                      {!examType && <Feather name="check" size={15} color="#2563eb" />}
                    </TouchableOpacity>

                    {/* 3. Category Specific Exam Types */}
                    {getFilteredExamTypes().map((item) => {
                      const isSelected = examType === item;
                      return (
                        <TouchableOpacity
                          key={item}
                          testID={`picker-option-type-${item.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase()}`}
                          activeOpacity={0.7}
                          onPress={() => {
                            setExamType(item);
                            setExamTypeSearch(item);
                            setActivePicker(null);
                          }}
                          style={{
                            flexDirection: 'row',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            paddingHorizontal: 12,
                            paddingVertical: 10,
                            borderRadius: 12,
                            backgroundColor: isSelected ? '#eff6ff' : '#f8fafc',
                            borderWidth: 1.5,
                            borderColor: isSelected ? '#2563eb' : '#e2e8f0',
                          }}
                        >
                          <Text
                            style={{
                              fontFamily: 'Roboto',
                              fontSize: 13,
                              fontWeight: isSelected ? '700' : '500',
                              color: isSelected ? '#1d4ed8' : '#334155',
                              flex: 1,
                              marginRight: 8,
                            }}
                          >
                            {item}
                          </Text>
                          {isSelected && <Feather name="check" size={15} color="#2563eb" />}
                        </TouchableOpacity>
                      );
                    })}

                    {getFilteredExamTypes().length === 0 && examTypeSearch.trim().length === 0 && (
                      <View style={{ paddingVertical: 16, alignItems: 'center' }}>
                        <Text style={{ fontSize: 12, color: '#94a3b8' }}>No options listed for this category. Type any name above.</Text>
                      </View>
                    )}
                  </View>
                </ScrollView>
              </View>
            )}

            {/* Picker Body: Exam Language (Multi-Select) */}
            {activePicker === 'language' && (
              <View>
                <ScrollView style={{ maxHeight: 260 }} showsVerticalScrollIndicator={false}>
                  <View style={{ gap: 8 }}>
                    {EXAM_LANGUAGES.map((lang) => {
                      const isChecked = examLanguages.includes(lang);
                      return (
                        <TouchableOpacity
                          key={lang}
                          testID={`picker-option-language-${lang.toLowerCase()}`}
                          activeOpacity={0.7}
                          onPress={() => {
                            if (isChecked) {
                              if (examLanguages.length > 1) {
                                setExamLanguages(examLanguages.filter((l) => l !== lang));
                              } else {
                                Alert.alert('Required', 'Please keep at least one language selected.');
                              }
                            } else {
                              setExamLanguages([...examLanguages, lang]);
                            }
                          }}
                          style={{
                            flexDirection: 'row',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            paddingHorizontal: 14,
                            paddingVertical: 12,
                            borderRadius: 14,
                            backgroundColor: isChecked ? '#eff6ff' : '#ffffff',
                            borderWidth: 1.5,
                            borderColor: isChecked ? '#2563eb' : '#e2e8f0',
                          }}
                        >
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                            <View
                              style={{
                                width: 20,
                                height: 20,
                                borderRadius: 6,
                                borderWidth: 1.5,
                                borderColor: isChecked ? '#2563eb' : '#cbd5e1',
                                backgroundColor: isChecked ? '#2563eb' : '#ffffff',
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
                                fontWeight: isChecked ? '700' : '500',
                                color: isChecked ? '#0f172a' : '#475569',
                              }}
                            >
                              {lang}
                            </Text>
                          </View>
                          {isChecked && (
                            <View
                              style={{
                                backgroundColor: '#dbeafe',
                                paddingHorizontal: 8,
                                paddingVertical: 2,
                                borderRadius: 6,
                              }}
                            >
                              <Text style={{ fontSize: 10.5, fontWeight: '700', color: '#1d4ed8' }}>
                                Selected
                              </Text>
                            </View>
                          )}
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </ScrollView>

                {/* Footer Buttons for Language */}
                <View
                  style={{
                    flexDirection: 'row',
                    gap: 10,
                    marginTop: 14,
                    paddingTop: 12,
                    borderTopWidth: 1,
                    borderTopColor: '#f1f5f9',
                  }}
                >
                  <TouchableOpacity
                    testID="picker-language-reset"
                    activeOpacity={0.7}
                    onPress={() => setExamLanguages(['English'])}
                    style={{
                      flex: 1,
                      paddingVertical: 10,
                      borderRadius: 12,
                      backgroundColor: '#f1f5f9',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Text style={{ fontFamily: 'Roboto', fontSize: 13, fontWeight: '600', color: '#475569' }}>
                      Reset
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    testID="picker-language-done"
                    activeOpacity={0.7}
                    onPress={() => setActivePicker(null)}
                    style={{
                      flex: 1.5,
                      paddingVertical: 10,
                      borderRadius: 12,
                      backgroundColor: '#2563eb',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Text style={{ fontFamily: 'Roboto', fontSize: 13, fontWeight: '700', color: '#ffffff' }}>
                      Done
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* Student console tab bar (phones; hidden in the desktop frame) */}
      <RequestTabBar />
    </RequestPage>
  );
}

// Full-screen scanning animation shown while the hall ticket is being analyzed:
// a pulsing document icon with an animated scan-line sweep.
/**
 * Pulsing document icon with a looping scan line, shown in the "Reading your hall ticket" overlay.
 * Both animation loops start on mount and stop on unmount.
 */
function HallTicketScanningAnimation() {
  // Animated values: icon scale (0.85-1) and scan-line progress (0-1).
  const pulseAnim = React.useRef(new Animated.Value(0.85)).current;
  const scanAnim = React.useRef(new Animated.Value(0)).current;

  // Start the pulse and scan loops; stop them when the overlay closes.
  useEffect(() => {
    const pulseLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 0.85, duration: 700, useNativeDriver: true }),
      ])
    );
    const scanLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(scanAnim, { toValue: 1, duration: 1400, useNativeDriver: true }),
        Animated.timing(scanAnim, { toValue: 0, duration: 0, useNativeDriver: true }),
      ])
    );
    pulseLoop.start();
    scanLoop.start();
    return () => {
      pulseLoop.stop();
      scanLoop.stop();
    };
  }, []);

  // Map scan progress to a vertical sweep across the 100px tile.
  const scanTranslateY = scanAnim.interpolate({ inputRange: [0, 1], outputRange: [-46, 46] });

  return (
    <Animated.View
      style={{
        width: 100, height: 100, borderRadius: 28,
        backgroundColor: 'rgba(37,99,235,0.15)', borderWidth: 1.5, borderColor: 'rgba(59,130,246,0.4)',
        alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
        transform: [{ scale: pulseAnim }],
      }}
    >
      {/* Document icon with the moving scan line on top */}
      <Feather name="file-text" size={44} color="#60a5fa" />
      <Animated.View
        style={{
          position: 'absolute', left: 0, right: 0, height: 2,
          backgroundColor: '#93c5fd', shadowColor: '#60a5fa', shadowOpacity: 0.8, shadowRadius: 6,
          transform: [{ translateY: scanTranslateY }],
        }}
      />
    </Animated.View>
  );
}
