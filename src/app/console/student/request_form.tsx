import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, ActivityIndicator, Alert, Modal, FlatList, Platform, Animated, Image, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Location from 'expo-location';
import { StatusBar } from 'expo-status-bar';
import { router, useLocalSearchParams } from 'expo-router';
import { Feather, Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import { supabase } from '@/core/supabase';
import ConsoleStudentPC from '@/components/pc_view/ConsoleStudentPC';

const API_URL = process.env.EXPO_PUBLIC_API_URL || 'https://anulekh-axum.onrender.com';

const EXAM_TYPES = ['School', 'University', 'Competitive', 'Government'];
const EXAM_LANGUAGES = ['English', 'Hindi', 'Gujarati'];

// Sub-topics database based on Exam Type
const SUB_TOPICS: { [key: string]: string[] } = {
  School: ['Class 10 Board Exam', 'Class 12 Board Exam', 'Half Yearly Exam', 'Final Term Exam', 'Unit Test / Monthly Assessment'],
  University: ['Semester End Exam', 'Mid-Term Assessment', 'Practical Lab Exam', 'Backlog / KT Exam', 'Viva Voce'],
  Competitive: ['UPSC Civil Services', 'JEE Main & Advanced', 'NEET UG Exam', 'IBPS PO / Clerk', 'SSC CGL', 'CAT Admission Exam'],
  Government: ['GPSC (Gujarat Public Service Commission)', 'State PSC', 'Recruitment Board Exam', 'Departmental Exam', 'Other Government Exam'],
};

// Old requests stored "College" before it was renamed to "University" — treat them as equivalent everywhere.
const normalizeExamTypeLabel = (type: string) => (type === 'College' ? 'University' : type);

const YEARS = Array.from({ length: 5 }, (_, i) => (new Date().getFullYear() + i).toString()); // Next 5 years
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

// Mock map locations for the Map Picker
const MOCK_LOCATIONS = [
  { id: '1', name: 'St. Xavier\'s College', address: 'Mahapalika Marg, Dhobi Talao, Chhatrapati Shivaji Terminus Area, Fort, Mumbai, Maharashtra 400001' },
  { id: '2', name: 'Mumbai University (Kalina Campus)', address: 'Vidya Nagari, Kalina, Santacruz East, Mumbai, Maharashtra 400098' },
  { id: '3', name: 'National Library of India', address: 'Belvedere Rd, Block A, Alipore, Kolkata, West Bengal 700027' },
  { id: '4', name: 'Delhi Public School (R.K. Puram)', address: 'Kaifi Azmi Marg, Sector 12, Rama Krishna Puram, New Delhi, Delhi 110022' },
  { id: '5', name: 'Vyas Education Library', address: 'University Road, Jagnath Plot, Rajkot, Gujarat 360001' }
];

export default function ScribeRequestForm() {
  const { width: windowWidth } = useWindowDimensions();
  const isDesktop = windowWidth >= 768;

  const params = useLocalSearchParams<{ id?: string }>();
  const isEditing = !!params.id;

  // Entry choice: ask the student whether to fill manually or auto-fill from an admit card.
  // Editing an existing request skips straight to the form.
  const [entryMode, setEntryMode] = useState<'choice' | 'form'>(isEditing ? 'form' : 'choice');

  const [loading, setLoading] = useState(false);
  const [profile, setProfile] = useState<any>(null);

  // Form State
  const [subject, setSubject] = useState('');
  const [examType, setExamType] = useState('University');
  const [subTopic, setSubTopic] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [isSubTopicOpen, setIsSubTopicOpen] = useState(false);
  const [examLanguages, setExamLanguages] = useState<string[]>(['English']);
  const [admitCardImage, setAdmitCardImage] = useState<string | null>(null);
  const [admitCardFileName, setAdmitCardFileName] = useState<string | null>(null);
  const [isParsingHallTicket, setIsParsingHallTicket] = useState(false);

  // Date & Time Picker State
  const [examDate, setExamDate] = useState('');
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(new Date().getMonth());
  const [calendarYear, setCalendarYear] = useState(new Date().getFullYear());
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const [selectedHour, setSelectedHour] = useState('10');
  const [selectedMinute, setSelectedMinute] = useState('00');
  const [selectedAmPm, setSelectedAmPm] = useState('AM');

  // Map Picker State
  const [showMapPicker, setShowMapPicker] = useState(false);
  const [examVenue, setExamVenue] = useState('');
  const [isLocating, setIsLocating] = useState(false);

  // Bulk Exam Creation: additional subjects sharing the same profile/type/language.
  // Each entry becomes its own exam_requests row on submit so scribes can apply per-exam.
  const [extraSubjects, setExtraSubjects] = useState<{ subject: string; examDate: string; examVenue: string }[]>([]);
  // Tracks which extra-subject row the Date/Map pickers are editing (-1 = the primary subject above)
  const [activeExtraIndex, setActiveExtraIndex] = useState(-1);

  // Pre-Booking: reserve a scribe before the official hall ticket is published.
  const [isPreBooking, setIsPreBooking] = useState(false);

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
            setAdmitCardImage(examData.admit_card_proof || null);
            setIsPreBooking(examData.is_prebooking === 'yes');

            // Parse Exam Type and Subtopic
            const fullType = examData.exam_type || 'University';
            const match = fullType.match(/^([^(]+)(?:\(([^)]+)\))?/);
            if (match) {
              const type = normalizeExamTypeLabel(match[1].trim());
              const sub = match[2] ? match[2].trim() : '';
              setExamType(type);
              setSubTopic(sub);
              setSearchQuery(sub);
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
  const getDaysInMonth = (month: number, year: number) => {
    return new Date(year, month + 1, 0).getDate();
  };

  const getFirstDayOfMonth = (month: number, year: number) => {
    return new Date(year, month, 1).getDay();
  };

  const handleConfirmDateTime = () => {
    if (!selectedDay) {
      Alert.alert('Selection Required', 'Please select a day on the calendar.');
      return;
    }
    const formattedDay = selectedDay < 10 ? `0${selectedDay}` : selectedDay;
    const formattedMonth = calendarMonth + 1 < 10 ? `0${calendarMonth + 1}` : calendarMonth + 1;
    const dateStr = `${formattedDay}/${formattedMonth}/${calendarYear}`;
    const timeStr = `${selectedHour}:${selectedMinute} ${selectedAmPm}`;
    const value = `${dateStr} | ${timeStr}`;
    if (activeExtraIndex === -1) {
      setExamDate(value);
    } else {
      updateExtraSubject(activeExtraIndex, 'examDate', value);
    }
    setShowDatePicker(false);
  };

  // Bulk Exam helpers
  const addExtraSubject = () => {
    setExtraSubjects([...extraSubjects, { subject: '', examDate: '', examVenue: '' }]);
  };

  const updateExtraSubject = (index: number, field: 'subject' | 'examDate' | 'examVenue', value: string) => {
    setExtraSubjects(prev => prev.map((row, i) => (i === index ? { ...row, [field]: value } : row)));
  };

  const removeExtraSubject = (index: number) => {
    setExtraSubjects(prev => prev.filter((_, i) => i !== index));
  };

  const handleGetCurrentLocation = async (extraIndex: number = -1) => {
    setIsLocating(true);
    setActiveExtraIndex(extraIndex);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Denied', 'Permission to access location was denied. Please enter address manually.');
        return;
      }

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
        
        if (extraIndex === -1) {
          setExamVenue(addressString);
        } else {
          updateExtraSubject(extraIndex, 'examVenue', addressString);
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

  const renderCalendarDays = () => {
    const daysInMonth = getDaysInMonth(calendarMonth, calendarYear);
    const firstDay = getFirstDayOfMonth(calendarMonth, calendarYear);
    const totalSlots = [];

    for (let i = 0; i < firstDay; i++) {
      totalSlots.push(<View key={`empty-${i}`} className="w-[14%] h-8 items-center justify-center" />);
    }

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

  // Filter sub-topics based on search query
  const getFilteredSubTopics = () => {
    const list = SUB_TOPICS[examType] || [];
    if (!searchQuery.trim()) return list;
    return list.filter(item => item.toLowerCase().includes(searchQuery.toLowerCase()));
  };

  // Reads a picked file's URI into a base64 string, on both web and native.
  const readFileAsBase64 = async (uri: string): Promise<string> => {
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
    return await FileSystem.readAsStringAsync(uri, {
      encoding: FileSystem.EncodingType.Base64,
    });
  };

  // Sends the picked hall ticket to the backend, which asks Gemini to extract exam details,
  // fills the form, then submits the request immediately — no manual review step.
  const analyzeHallTicket = async (uri: string, mimeType: string, fileName: string) => {
    setIsParsingHallTicket(true);
    try {
      const fileBase64 = await readFileAsBase64(uri);

      const res = await fetch(`${API_URL}/api/ai/parse-hall-ticket`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ file_base64: fileBase64, mime_type: mimeType }),
      });

      const result = await res.json();
      if (!res.ok) {
        throw new Error(result.error || 'Failed to analyze hall ticket.');
      }

      setAdmitCardImage(fileName);
      setAdmitCardFileName(fileName);

      const filledSubject = result.subject || '';
      const filledVenue = result.exam_venue || '';
      const filledType = (result.exam_type && EXAM_TYPES.includes(result.exam_type)) ? result.exam_type : examType;
      const filledSubTopic = result.exam_sub_topic || '';
      const filledDate = result.exam_date
        ? `${result.exam_date} | ${result.exam_time ? result.exam_time : '10:00 AM'}`
        : '';

      if (filledSubject) setSubject(filledSubject);
      if (filledVenue) setExamVenue(filledVenue);
      setExamType(filledType);
      if (filledSubTopic) {
        setSubTopic(filledSubTopic);
        setSearchQuery(filledSubTopic);
      }
      if (filledDate) setExamDate(filledDate);

      // Not everything could be read confidently — fall back to manual review instead of
      // submitting an incomplete request.
      if (!filledSubject || !filledVenue || !filledSubTopic || !filledDate) {
        Alert.alert('Hall Ticket Partially Read', 'We couldn\'t confidently read every field. Please review and complete the form before submitting.');
        return;
      }

      await handleSubmit({
        subject: filledSubject,
        examVenue: filledVenue,
        examType: filledType,
        subTopic: filledSubTopic,
        examDate: filledDate,
        admitCardImage: fileName,
      });
    } catch (err: any) {
      setAdmitCardImage(fileName);
      setAdmitCardFileName(fileName);
      Alert.alert('Auto-Fill Failed', err.message || 'Could not read details from this file. Your hall ticket was still attached — please fill the fields manually.');
    } finally {
      setIsParsingHallTicket(false);
    }
  };

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

    const asset = result.assets[0];
    const mimeType = asset.mimeType || 'image/jpeg';
    const fileName = asset.fileName || `hall_ticket_${Date.now()}.jpg`;
    await analyzeHallTicket(asset.uri, mimeType, fileName);
  };

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
  const startAutoFillEntry = () => {
    setEntryMode('form');
    handlePickAdmitCard();
  };

  // Accepts optional overrides so a caller (e.g. the AI auto-fill flow) can submit immediately
  // with freshly-parsed values instead of waiting a render cycle for state to catch up.
  const handleSubmit = async (overrides?: {
    subject: string;
    examVenue: string;
    examType: string;
    subTopic: string;
    examDate: string;
    admitCardImage: string;
  }) => {
    if (!profile) {
      Alert.alert('Error', 'Your profile details could not be loaded. Please try again.');
      return;
    }

    const finalSubject = overrides?.subject ?? subject;
    const finalVenue = overrides?.examVenue ?? examVenue;
    const finalExamType = overrides?.examType ?? examType;
    const finalSubTopic = overrides?.subTopic ?? (subTopic || searchQuery);
    const finalExamDate = overrides?.examDate ?? examDate;
    const finalAdmitCard = overrides?.admitCardImage ?? admitCardImage;

    // Admit card upload is optional
    const admitCardMissing = false;

    if (!finalSubject.trim() || !finalExamDate.trim() || !finalVenue.trim() || !finalSubTopic.trim() || examLanguages.length === 0) {
      Alert.alert(
        'Missing Fields',
        'Please fill in all exam fields and select at least one language.'
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
      const { data: { session } } = await supabase.auth.getSession();

      if (!session) {
        throw new Error("You must be logged in to create a request.");
      }

      // Fields shared by every exam in this submission.
      const sharedPayload = {
        student_id: session.user.id,
        student_name: profile.official_name || profile.full_name,
        dob: profile.dob,
        phone: profile.phone,
        emergency_phone: profile.emergency_phone,
        exam_type: `${finalExamType} (${finalSubTopic})`,
        exam_language: examLanguages.join(', '),
        id_proof: profile.aadhar_number || 'Aadhar Verified',
        admit_card_proof: finalAdmitCard,
        is_prebooking: isPreBooking ? 'yes' : 'no',
        status: 'pending'
      };

      const requestPayload = {
        ...sharedPayload,
        subject: finalSubject.trim(),
        exam_date: finalExamDate.trim(),
        exam_venue: finalVenue.trim(),
      };

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
          })),
        ];

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

  // Entry-choice screen: ask whether to fill the request manually or auto-fill from an admit card.
  if (entryMode === 'choice') {
    if (isDesktop) {
      return (
        <ConsoleStudentPC activeTab="requests">
          <View style={{ maxWidth: 880, width: '100%', alignSelf: 'center', backgroundColor: '#ffffff', borderRadius: 24, padding: 36, borderWidth: 1, borderColor: '#e2e8f0', shadowColor: '#000', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.05, shadowRadius: 16, elevation: 4 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 28 }}>
              <View>
                <Text style={{ fontSize: 22, fontWeight: '800', color: '#0f172a' }}>Select Request Type</Text>
                <Text style={{ fontSize: 14, fontWeight: '500', color: '#64748b', marginTop: 4 }}>Choose whether you need help for an assignment or an upcoming exam.</Text>
              </View>
              <TouchableOpacity
                onPress={() => router.replace('/console/student' as any)}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#f1f5f9', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 12, cursor: 'pointer' as any }}
              >
                <Feather name="x" size={18} color="#64748b" />
                <Text style={{ fontSize: 14, fontWeight: '700', color: '#475569' }}>Cancel</Text>
              </TouchableOpacity>
            </View>

            {/* Request Assignment Block */}
            <View style={{ marginBottom: 24 }}>
              <TouchableOpacity
                onPress={() => router.push('/console/student/assignment_form' as any)}
                activeOpacity={0.85}
                style={{ backgroundColor: '#6366f1', borderRadius: 20, padding: 24, flexDirection: 'row', alignItems: 'center', cursor: 'pointer' as any }}
              >
                <View style={{ width: 54, height: 54, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center', marginRight: 18 }}>
                  <Feather name="file-text" size={26} color="#ffffff" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: '#ffffff', fontWeight: '800', fontSize: 18 }}>Request Assignment</Text>
                  <Text style={{ color: '#e0e7ff', fontSize: 13, marginTop: 4 }}>Get assistance for academic assignment completion</Text>
                </View>
                <Feather name="chevron-right" size={24} color="#ffffff" />
              </TouchableOpacity>
            </View>

            {/* Exam Request Section */}
            <View>
              <Text style={{ fontSize: 18, fontWeight: '800', color: '#0f172a', marginBottom: 16 }}>Exam Scribe Request</Text>

              <TouchableOpacity
                onPress={startAutoFillEntry}
                activeOpacity={0.85}
                style={{ backgroundColor: '#2563eb', borderRadius: 20, padding: 24, flexDirection: 'row', alignItems: 'center', marginBottom: 16, cursor: 'pointer' as any }}
              >
                <View style={{ width: 54, height: 54, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center', marginRight: 18 }}>
                  <Feather name="upload-cloud" size={26} color="#ffffff" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: '#ffffff', fontWeight: '800', fontSize: 18 }}>Auto-Fill (ADMIT Card)</Text>
                  <Text style={{ color: '#dbeafe', fontSize: 13, marginTop: 4 }}>Upload a photo or PDF admit card — details filled automatically via AI</Text>
                </View>
                <Feather name="chevron-right" size={24} color="#ffffff" />
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => setEntryMode('form')}
                activeOpacity={0.85}
                style={{ backgroundColor: '#ffffff', borderWidth: 1.5, borderColor: '#cbd5e1', borderRadius: 20, padding: 24, flexDirection: 'row', alignItems: 'center', cursor: 'pointer' as any }}
              >
                <View style={{ width: 54, height: 54, borderRadius: 16, backgroundColor: '#f1f5f9', alignItems: 'center', justifyContent: 'center', marginRight: 18 }}>
                  <Feather name="edit-3" size={26} color="#334155" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: '#0f172a', fontWeight: '800', fontSize: 18 }}>Manual Fill Form</Text>
                  <Text style={{ color: '#64748b', fontSize: 13, marginTop: 4 }}>Enter exam details, date, time, and venue step by step</Text>
                </View>
                <Feather name="chevron-right" size={24} color="#334155" />
              </TouchableOpacity>
            </View>
          </View>
        </ConsoleStudentPC>
      );
    }

    return (
      <View style={{ flex: 1, backgroundColor: '#f9fafb', height: Platform.OS === 'web' ? '100vh' as any : '100%', maxHeight: Platform.OS === 'web' ? '100vh' as any : undefined, overflow: 'hidden' }}>
        <StatusBar style="dark" />
        
        {/* Page Header (with back button) */}
        <SafeAreaView edges={['top']} style={{ backgroundColor: '#ffffff', borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.07)', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 3 }}>
          <View style={{ paddingHorizontal: 24, paddingVertical: 14, flexDirection: 'row', alignItems: 'center' }}>
            <TouchableOpacity
              onPress={() => {
                if (router.canGoBack()) router.back();
                else router.replace('/console/student' as any);
              }}
              style={{ marginRight: 16, padding: 8, marginLeft: -8, borderRadius: 10 }}
            >
              <Feather name="arrow-left" size={24} color="#334155" />
            </TouchableOpacity>
            <Text style={{ fontFamily: 'Roboto', fontSize: 20, fontWeight: '700', color: '#1e293b' }}>Request a Scribe</Text>
          </View>
        </SafeAreaView>

        <ScrollView className="flex-1 px-6 pt-6 pb-8" contentContainerStyle={{ paddingBottom: 40 }}>
          <Text className="text-xl font-bold text-slate-800 mb-6" style={{ fontFamily: 'Roboto' }}>Select Request Type</Text>

          {/* Request Assignment Block */}
          <View className="mb-8">
            <TouchableOpacity
              onPress={() => router.push('/console/student/assignment_form' as any)}
              activeOpacity={0.85}
              className="w-full bg-indigo-500 rounded-2xl p-5 flex-row items-center shadow-md shadow-indigo-500/30"
            >
              <View className="w-12 h-12 rounded-xl bg-white/20 items-center justify-center mr-4">
                <Feather name="file-text" size={22} color="#fff" />
              </View>
              <View className="flex-1">
                <Text className="text-white font-bold text-base" style={{ fontFamily: 'Roboto' }}>Request Assignment</Text>
                <Text className="text-indigo-100 text-xs mt-0.5" style={{ fontFamily: 'Roboto' }}>Get help with your assignments</Text>
              </View>
              <Feather name="chevron-right" size={20} color="#fff" />
            </TouchableOpacity>
          </View>

          {/* Exam Request Block */}
          <View>
            <Text className="text-lg font-bold text-slate-800 mb-4" style={{ fontFamily: 'Roboto' }}>Exam Request</Text>

            <TouchableOpacity
              onPress={startAutoFillEntry}
              activeOpacity={0.85}
              className="w-full bg-blue-500 rounded-2xl p-5 flex-row items-center mb-4 shadow-md shadow-blue-500/30"
            >
              <View className="w-12 h-12 rounded-xl bg-white/20 items-center justify-center mr-4">
                <Feather name="upload-cloud" size={22} color="#fff" />
              </View>
              <View className="flex-1">
                <Text className="text-white font-bold text-base" style={{ fontFamily: 'Roboto' }}>Auto-Fill (ADMIT Card)</Text>
                <Text className="text-blue-100 text-xs mt-0.5" style={{ fontFamily: 'Roboto' }}>Upload a photo or PDF — details filled automatically</Text>
              </View>
              <Feather name="chevron-right" size={20} color="#fff" />
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => setEntryMode('form')}
              activeOpacity={0.85}
              className="w-full bg-white border border-slate-200 rounded-2xl p-5 flex-row items-center shadow-sm"
            >
              <View className="w-12 h-12 rounded-xl bg-slate-100 items-center justify-center mr-4">
                <Feather name="edit-3" size={22} color="#334155" />
              </View>
              <View className="flex-1">
                <Text className="text-slate-800 font-bold text-base" style={{ fontFamily: 'Roboto' }}>Manual Fill Form</Text>
                <Text className="text-slate-400 text-xs mt-0.5" style={{ fontFamily: 'Roboto' }}>Enter exam details yourself, step by step</Text>
              </View>
              <Feather name="chevron-right" size={20} color="#334155" />
            </TouchableOpacity>
          </View>
        </ScrollView>

        {/* Replicated Bottom Nav Bar */}
        <SafeAreaView edges={['bottom']} style={{
          backgroundColor: 'rgba(255,255,255,0.82)',
          borderTopLeftRadius: 20,
          borderTopRightRadius: 20,
          shadowColor: '#000', shadowOffset: { width: 0, height: -4 },
          shadowOpacity: 0.07, shadowRadius: 12, elevation: 5,
        }}>
          <View style={{
            flexDirection: 'row',
            paddingVertical: 8,
            paddingHorizontal: 8,
            gap: 4,
            borderTopWidth: 1,
            borderTopColor: 'rgba(0,0,0,0.07)',
            borderTopLeftRadius: 20,
            borderTopRightRadius: 20,
          }}>
            {[
              { id: 'home',     iconActive: 'home',          iconInactive: 'home',          label: 'Home' },
              { id: 'requests', iconActive: 'document-text',  iconInactive: 'document-text',  label: 'Requests' },
              { id: 'plan',     iconActive: 'calendar',       iconInactive: 'calendar',       label: 'Plan' },
              { id: 'settings', iconActive: 'person',        iconInactive: 'person',        label: 'Account' },
            ].map((tab) => {
              const active = tab.id === 'requests';
              return (
                <TouchableOpacity
                  key={tab.id}
                  onPress={() => {
                    router.replace(`/console/student?tab=${tab.id}`);
                  }}
                  style={{
                    flex: 1, alignItems: 'center', paddingVertical: 9,
                    borderRadius: 20,
                    backgroundColor: active ? 'rgba(37,99,235,0.09)' : 'transparent',
                  }}
                >
                  <Ionicons name={(active ? tab.iconActive : tab.iconInactive) as any} size={24} color={active ? '#2563eb' : '#94a3b8'} />
                  <Text style={{
                    fontFamily: 'Roboto',
                    fontSize: 11, fontWeight: active ? '800' : '600',
                    marginTop: 3, color: active ? '#2563eb' : '#94a3b8',
                  }}>
                    {tab.label}
                  </Text>
                  {active && (
                    <View style={{
                      position: 'absolute', bottom: 2,
                      width: 4, height: 4, borderRadius: 2, backgroundColor: '#2563eb',
                    }} />
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        </SafeAreaView>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#f9fafb', height: Platform.OS === 'web' ? '100vh' as any : '100%', maxHeight: Platform.OS === 'web' ? '100vh' as any : undefined, overflow: 'hidden' }}>
      <StatusBar style="dark" />

      {/* Page Header (with back button) */}
      <SafeAreaView edges={['top']} style={{ backgroundColor: '#ffffff', borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.07)', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 3 }}>
        <View style={{ paddingHorizontal: 24, paddingVertical: 14, flexDirection: 'row', alignItems: 'center' }}>
          <TouchableOpacity
            onPress={() => {
              if (!isEditing) { setEntryMode('choice'); return; }
              if (router.canGoBack()) router.back();
              else router.replace('/console/student' as any);
            }}
            style={{ marginRight: 16, padding: 8, marginLeft: -8, borderRadius: 10 }}
          >
            <Feather name="arrow-left" size={24} color="#334155" />
          </TouchableOpacity>
          <Text style={{ fontSize: 20, fontWeight: '900', color: '#1e293b' }}>
            {isEditing ? 'Edit Scribe Request' : 'Request a Scribe'}
          </Text>
        </View>
      </SafeAreaView>

      <ScrollView className="flex-1 px-6 py-3" contentContainerStyle={{ paddingBottom: 20 }} keyboardShouldPersistTaps="handled">
        <View className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100 space-y-4">
          
          {/* Section: Exam Classification (top) */}
          <View>
            <Text className="text-xs font-bold text-slate-800 mb-2.5 uppercase tracking-wider">Exam Classification</Text>

            <View className="space-y-3">
              {/* 1. Exam Type Segments */}
              <View>
                <Text className="text-[10px] font-semibold text-slate-500 mb-1.5 ml-1">Exam Type *</Text>
                <View className="flex-row bg-slate-100 p-1 rounded-xl">
                  {EXAM_TYPES.map((type) => {
                    const isSelected = examType === type;
                    return (
                      <TouchableOpacity
                        key={type}
                        onPress={() => {
                          setExamType(type);
                          setSubTopic('');
                          setSearchQuery('');
                        }}
                        className={`flex-1 py-2 rounded-lg items-center ${
                          isSelected ? 'bg-white shadow-sm' : ''
                        }`}
                      >
                        <Text className={`text-xs font-semibold ${isSelected ? 'text-blue-600' : 'text-slate-600'}`}>
                          {type}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>

              {/* 2. Searchable Sub-topic Dropdown */}
              <View className="z-50">
                <Text className="text-[10px] font-semibold text-slate-500 mb-1 ml-1">Exam Sub-topic / Board / Course *</Text>
                <View className="w-full relative">
                  <View className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-1 flex-row items-center justify-between">
                    <TextInput
                      value={searchQuery}
                      onChangeText={(text) => {
                        setSearchQuery(text);
                        setSubTopic('');
                        setIsSubTopicOpen(true);
                      }}
                      onFocus={() => setIsSubTopicOpen(true)}
                      placeholder={`Search or type a sub-topic (e.g. ${SUB_TOPICS[examType][0]})`}
                      className="flex-1 text-sm text-slate-800 py-1.5"
                    />
                    <TouchableOpacity onPress={() => setIsSubTopicOpen(!isSubTopicOpen)}>
                      <Feather name={isSubTopicOpen ? "chevron-up" : "chevron-down"} size={16} color="#64748b" />
                    </TouchableOpacity>
                  </View>

                  {/* Dropdown suggestions */}
                  {isSubTopicOpen && (
                    <View className="mt-1.5 bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                      {getFilteredSubTopics().length === 0 ? (
                        <TouchableOpacity
                          onPress={() => {
                            if (searchQuery.trim()) {
                              setSubTopic(searchQuery);
                              setIsSubTopicOpen(false);
                            }
                          }}
                          className="p-3 bg-slate-50"
                        >
                          <Text className="text-xs text-slate-500 italic">
                            {searchQuery.trim() ? `No matches. Tap to use "${searchQuery}"` : 'Type to search...'}
                          </Text>
                        </TouchableOpacity>
                      ) : (
                        getFilteredSubTopics().map((item) => (
                          <TouchableOpacity
                            key={item}
                            onPress={() => {
                              setSubTopic(item);
                              setSearchQuery(item);
                              setIsSubTopicOpen(false);
                            }}
                            className={`p-3 border-b border-slate-100 active:bg-slate-555 active:bg-slate-50 ${
                              subTopic === item ? 'bg-blue-50' : ''
                            }`}
                          >
                            <View className="flex-row items-center justify-between">
                              <Text className={`text-xs font-semibold ${subTopic === item ? 'text-blue-600' : 'text-slate-700'}`}>
                                {item}
                              </Text>
                              {subTopic === item && <Feather name="check" size={12} color="#2563eb" />}
                            </View>
                          </TouchableOpacity>
                        ))
                      )}
                    </View>
                  )}
                </View>
              </View>

              {/* Language Selection */}
              <View>
                <Text className="text-[10px] font-semibold text-slate-500 mb-1.5 ml-1">Language of Examination *</Text>
                <View className="flex-row flex-wrap gap-1.5">
                  {EXAM_LANGUAGES.map((lang) => {
                    const isSelected = examLanguages.includes(lang);
                    return (
                      <TouchableOpacity
                        key={lang}
                        onPress={() => {
                          if (isSelected) {
                            setExamLanguages(examLanguages.filter(l => l !== lang));
                          } else {
                            setExamLanguages([...examLanguages, lang]);
                          }
                        }}
                        className={`px-3.5 py-1.5 rounded-full border flex-row items-center ${
                          isSelected
                            ? 'bg-blue-500 border-blue-500 shadow-sm shadow-blue-500/30'
                            : 'bg-slate-50 border-slate-200'
                        }`}
                      >
                        <Text className={`font-semibold text-xs ${isSelected ? 'text-white' : 'text-slate-600'}`}>
                          {lang}
                        </Text>
                        {isSelected && <Feather name="check" size={12} color="white" className="ml-1" />}
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            </View>
          </View>

          <View className="h-px bg-slate-100 w-full my-1" />

          {/* Section: Exam Details (middle) — includes Admit Card Upload */}
          <View>
            <Text className="text-xs font-bold text-slate-800 mb-2.5 uppercase tracking-wider">Exam Details</Text>

            {/* Pre-Booking toggle (create mode only) */}
            {!isEditing && (
              <TouchableOpacity
                onPress={() => setIsPreBooking(!isPreBooking)}
                activeOpacity={0.8}
                className={`flex-row items-center justify-between px-3 py-2.5 mb-3 rounded-xl border ${
                  isPreBooking ? 'bg-blue-50 border-blue-500' : 'bg-slate-50 border-slate-200'
                }`}
              >
                <View className="flex-row items-center flex-1 pr-3">
                  <Feather name="clock" size={16} color={isPreBooking ? '#2563eb' : '#94a3b8'} />
                  <View className="ml-2.5 flex-1">
                    <Text className={`text-xs font-bold ${isPreBooking ? 'text-blue-700' : 'text-slate-700'}`}>Pre-Book a Scribe</Text>
                    <Text className="text-[9px] text-slate-400 mt-0.5">Reserve early, before your hall ticket is published. Admit card optional.</Text>
                  </View>
                </View>
                <View className={`w-9 h-5 rounded-full justify-center px-0.5 ${isPreBooking ? 'bg-blue-500 items-end' : 'bg-slate-300 items-start'}`}>
                  <View className="w-4 h-4 rounded-full bg-white" />
                </View>
              </TouchableOpacity>
            )}

            <View className="space-y-3">
              <View>
                <Text className="text-[10px] font-semibold text-slate-500 mb-1 ml-1">Subject / Paper Name *</Text>
                <TextInput
                  value={subject}
                  onChangeText={setSubject}
                  placeholder="e.g. Mathematics-II"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-800 focus:border-blue-500 focus:bg-white transition-all"
                />
              </View>


              {/* Date & Time Picker Trigger */}
              <View>
                <Text className="text-[10px] font-semibold text-slate-500 mb-1 ml-1">Exam Date & Time *</Text>
                <TouchableOpacity
                  onPress={() => { setActiveExtraIndex(-1); setShowDatePicker(true); }}
                  activeOpacity={0.8}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 flex-row items-center justify-between active:border-blue-500"
                >
                  <Text className={`text-sm ${examDate ? 'text-slate-800 font-semibold' : 'text-slate-400'}`}>
                    {examDate || 'Select Date & Time'}
                  </Text>
                  <Feather name="calendar" size={16} color="#2563eb" />
                </TouchableOpacity>
              </View>

              {/* Venue & Map Trigger */}
              <View>
                <Text className="text-[10px] font-semibold text-slate-500 mb-1 ml-1">Exam Venue & Address *</Text>
                <View className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 flex-row items-center justify-between focus-within:border-blue-500 focus-within:bg-white">
                  <TextInput
                    value={examVenue}
                    onChangeText={setExamVenue}
                    placeholder="Enter exam venue address"
                    multiline={true}
                    numberOfLines={2}
                    className="flex-1 text-sm text-slate-800 mr-2 py-1"
                  />
                  <View className="flex-row gap-2">
                    <TouchableOpacity
                      onPress={() => handleGetCurrentLocation(-1)}
                      disabled={isLocating}
                      className="p-2 bg-blue-50 rounded-lg active:bg-blue-100 items-center justify-center"
                    >
                      {isLocating && activeExtraIndex === -1 ? (
                        <ActivityIndicator size="small" color="#2563eb" style={{ width: 16, height: 16 }} />
                      ) : (
                        <Feather name="navigation" size={16} color="#2563eb" />
                      )}
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => { setActiveExtraIndex(-1); setShowMapPicker(true); }}
                      className="p-2 bg-blue-50 rounded-lg active:bg-blue-100"
                    >
                      <Feather name="map" size={16} color="#2563eb" />
                    </TouchableOpacity>
                  </View>
                </View>
              </View>

              {/* Admit Card Upload + AI Auto-Fill */}
              <View className="pt-1">
                <Text className="text-[10px] font-semibold text-slate-500 mb-1 ml-1">
                  Upload Admit Card / Hall Ticket (Optional)
                </Text>
                <TouchableOpacity
                  onPress={handlePickAdmitCard}
                  disabled={isParsingHallTicket}
                  className={`w-full border-2 border-dashed rounded-xl p-4 items-center justify-center ${
                    admitCardImage ? 'border-blue-300 bg-blue-50/20' : 'border-slate-200 bg-slate-50'
                  }`}
                >
                  {admitCardImage ? (
                    <View className="items-center">
                      <Feather name={admitCardFileName?.toLowerCase().endsWith('.pdf') ? 'file-text' : 'image'} size={24} color="#2563eb" />
                      <Text className="text-xs font-semibold text-slate-800 mt-1">{admitCardImage}</Text>
                      <Text className="text-[10px] text-slate-400 mt-0.5">Tap to change file</Text>
                    </View>
                  ) : (
                    <View className="items-center">
                      <Feather name="upload-cloud" size={24} color="#94a3b8" />
                      <Text className="text-xs font-semibold text-slate-600 mt-1">Upload Hall Ticket (Photo or PDF)</Text>
                      <Text className="text-[10px] text-slate-400 mt-0.5">We'll auto-fill subject, date & venue for you</Text>
                    </View>
                  )}
                </TouchableOpacity>
              </View>

            </View>
          </View>

          {/* Section: Additional Subjects (Bulk Exam Creation) — create mode only */}
          {!isEditing && (
            <>
              <View className="h-px bg-slate-100 w-full my-1" />
              <View>
                <View className="flex-row items-center justify-between mb-1">
                  <Text className="text-xs font-bold text-slate-800 uppercase tracking-wider">Additional Exams</Text>
                  {extraSubjects.length > 0 && (
                    <View className="bg-blue-50 px-2 py-0.5 rounded-full">
                      <Text className="text-[9px] font-bold text-blue-600">{extraSubjects.length + 1} total</Text>
                    </View>
                  )}
                </View>
                <Text className="text-[10px] text-slate-400 mb-2.5 ml-0.5">
                  Sitting multiple papers? Add them here — each becomes a separate request scribes can apply to.
                </Text>

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
                          {row.examDate || 'Select Date & Time'}
                        </Text>
                        <Feather name="calendar" size={16} color="#2563eb" />
                      </TouchableOpacity>

                      <View className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 flex-row items-center justify-between">
                        <TextInput
                          value={row.examVenue}
                          onChangeText={(text) => updateExtraSubject(index, 'examVenue', text)}
                          placeholder="Exam venue address"
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
                            onPress={() => { setActiveExtraIndex(index); setShowMapPicker(true); }}
                            className="p-2 bg-blue-50 rounded-lg active:bg-blue-100"
                          >
                            <Feather name="map" size={16} color="#2563eb" />
                          </TouchableOpacity>
                        </View>
                      </View>
                    </View>
                  </View>
                ))}

                <TouchableOpacity
                  onPress={addExtraSubject}
                  className="w-full border-2 border-dashed border-blue-200 bg-blue-50/40 rounded-xl py-2.5 flex-row items-center justify-center active:bg-blue-50"
                >
                  <Feather name="plus" size={16} color="#2563eb" />
                  <Text className="text-blue-600 font-bold text-xs ml-1.5">Add another subject</Text>
                </TouchableOpacity>
              </View>
            </>
          )}

          {/* Submit Button */}
          <TouchableOpacity
            onPress={() => handleSubmit()}
            disabled={loading}
            className="w-full bg-blue-500 active:bg-blue-600 py-3 mt-2 rounded-xl items-center justify-center shadow-md shadow-blue-500/30"
          >
            {loading ? (
              <ActivityIndicator color="white" size="small" />
            ) : (
              <Text className="text-white font-bold text-sm">
                {isEditing ? 'Update Request' : 'Generate Request'}
              </Text>
            )}
          </TouchableOpacity>

        </View>
      </ScrollView>

      {/* 1. DATE & TIME PICKER MODAL */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={showDatePicker}
        onRequestClose={() => setShowDatePicker(false)}
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

      {/* 2. MAP PICKER MODAL (Simulated) */}
      <Modal
        animationType="fade"
        transparent={true}
        visible={showMapPicker}
        onRequestClose={() => setShowMapPicker(false)}
      >
        <View className="flex-1 bg-slate-950/60 justify-center items-center px-6">
          <View className="bg-white w-full max-w-sm rounded-3xl overflow-hidden shadow-2xl border border-slate-100">
            
            {/* Map Header */}
            <View className="px-5 py-4 border-b border-slate-100 flex-row items-center justify-between bg-white">
              <Text className="text-sm font-bold text-slate-800">Select Exam Venue</Text>
              <TouchableOpacity onPress={() => setShowMapPicker(false)} className="p-1">
                <Feather name="x" size={18} color="#64748b" />
              </TouchableOpacity>
            </View>

            {/* Simulated Interactive Map UI */}
            <View className="h-60 bg-sky-100 items-center justify-center relative">
              
              {/* Vector Grid/Roads Simulator */}
              <View className="absolute inset-0 opacity-20 bg-slate-955/10" style={{ borderWidth: 1, borderColor: '#64748b' }}>
                <View className="w-full h-0.5 bg-slate-500 absolute top-20" />
                <View className="w-full h-0.5 bg-slate-500 absolute top-40" />
                <View className="h-full w-0.5 bg-slate-500 absolute left-28" />
                <View className="h-full w-0.5 bg-slate-500 absolute left-56" />
              </View>

              {/* Pulse circle in center */}
              <View className="w-12 h-12 rounded-full bg-blue-500/20 items-center justify-center animate-ping">
                <View className="w-4 h-4 rounded-full bg-blue-600 border-2 border-white shadow-md" />
              </View>

              <Text className="absolute bottom-3 bg-slate-900/80 text-white text-[9px] font-bold px-3 py-1.5 rounded-full tracking-wider">
                📍 Tap a location pin below to select
              </Text>
            </View>

            {/* List of nearby institutions */}
            <View className="p-4 bg-slate-50">
              <Text className="text-[10px] font-bold text-slate-400 uppercase mb-2 tracking-wider">Nearby Exam Centers</Text>
              
              <ScrollView className="max-h-48">
                {MOCK_LOCATIONS.map((loc) => (
                  <TouchableOpacity
                    key={loc.id}
                    onPress={() => {
                      const value = loc.name + ', ' + loc.address;
                      if (activeExtraIndex === -1) {
                        setExamVenue(value);
                      } else {
                        updateExtraSubject(activeExtraIndex, 'examVenue', value);
                      }
                      setShowMapPicker(false);
                    }}
                    className="flex-row items-start p-2.5 mb-2 bg-white rounded-xl border border-slate-100 active:bg-blue-50/20"
                  >
                    <Feather name="map-pin" size={14} color="#2563eb" className="mr-2.5 mt-0.5" />
                    <View className="flex-1">
                      <Text className="text-xs font-bold text-slate-800">{loc.name}</Text>
                      <Text className="text-[10px] text-slate-400 mt-0.5" numberOfLines={2}>{loc.address}</Text>
                    </View>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>

          </View>
        </View>
      </Modal>

      {/* 3. FULL-SCREEN OVERLAY: Hall Ticket Analysis in progress */}
      <Modal
        animationType="fade"
        transparent={true}
        visible={isParsingHallTicket}
        onRequestClose={() => {}}
      >
        <View className="flex-1 bg-slate-950/80 items-center justify-center px-10">
          <HallTicketScanningAnimation />
          <Text className="text-white font-black text-lg mt-6 text-center">Reading your hall ticket…</Text>
          <Text className="text-slate-300 text-xs mt-2 text-center leading-5">
            We're extracting the subject, date, venue and classification automatically. This usually takes a few seconds.
          </Text>
        </View>
      </Modal>

      {/* Replicated Bottom Nav Bar */}
      <SafeAreaView edges={['bottom']} style={{
        backgroundColor: 'rgba(255,255,255,0.82)',
        borderTopLeftRadius: 20,
        borderTopRightRadius: 20,
        shadowColor: '#000', shadowOffset: { width: 0, height: -4 },
        shadowOpacity: 0.07, shadowRadius: 12, elevation: 5,
      }}>
        <View style={{
          flexDirection: 'row',
          paddingVertical: 8,
          paddingHorizontal: 8,
          gap: 4,
          borderTopWidth: 1,
          borderTopColor: 'rgba(0,0,0,0.07)',
          borderTopLeftRadius: 20,
          borderTopRightRadius: 20,
        }}>
          {[
            { id: 'home',     iconActive: 'home',          iconInactive: 'home',          label: 'Home' },
            { id: 'requests', iconActive: 'document-text',  iconInactive: 'document-text',  label: 'Requests' },
            { id: 'plan',     iconActive: 'calendar',       iconInactive: 'calendar',       label: 'Plan' },
            { id: 'settings', iconActive: 'person',        iconInactive: 'person',        label: 'Account' },
          ].map((tab) => {
            const active = tab.id === 'requests';
            return (
              <TouchableOpacity
                key={tab.id}
                onPress={() => {
                  router.replace(`/console/student?tab=${tab.id}`);
                }}
                style={{
                  flex: 1, alignItems: 'center', paddingVertical: 9,
                  borderRadius: 20,
                  backgroundColor: active ? 'rgba(37,99,235,0.09)' : 'transparent',
                }}
              >
                <Ionicons name={(active ? tab.iconActive : tab.iconInactive) as any} size={24} color={active ? '#2563eb' : '#94a3b8'} />
                <Text style={{
                  fontFamily: 'Roboto',
                  fontSize: 11, fontWeight: active ? '800' : '600',
                  marginTop: 3, color: active ? '#2563eb' : '#94a3b8',
                }}>
                  {tab.label}
                </Text>
                {active && (
                  <View style={{
                    position: 'absolute', bottom: 2,
                    width: 4, height: 4, borderRadius: 2, backgroundColor: '#2563eb',
                  }} />
                )}
              </TouchableOpacity>
            );
          })}
        </View>
      </SafeAreaView>
    </View>
  );
}

// Full-screen scanning animation shown while the hall ticket is being analyzed:
// a pulsing document icon with an animated scan-line sweep.
function HallTicketScanningAnimation() {
  const pulseAnim = React.useRef(new Animated.Value(0.85)).current;
  const scanAnim = React.useRef(new Animated.Value(0)).current;

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
