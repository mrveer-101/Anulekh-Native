import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, ActivityIndicator, Alert, Modal, FlatList } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { router, useLocalSearchParams } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { supabase } from '@/app/core/supabase';

const EXAM_TYPES = ['School', 'College', 'Competitive'];
const EXAM_LANGUAGES = ['English', 'Hindi', 'Gujarati'];

// Sub-topics database based on Exam Type
const SUB_TOPICS: { [key: string]: string[] } = {
  School: ['Class 10 Board Exam', 'Class 12 Board Exam', 'Half Yearly Exam', 'Final Term Exam', 'Unit Test / Monthly Assessment'],
  College: ['Semester End Exam', 'Mid-Term Assessment', 'Practical Lab Exam', 'Backlog / KT Exam', 'Viva Voce'],
  Competitive: ['UPSC Civil Services', 'JEE Main & Advanced', 'NEET UG Exam', 'IBPS PO / Clerk', 'SSC CGL', 'CAT Admission Exam']
};

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
  const params = useLocalSearchParams<{ id?: string }>();
  const isEditing = !!params.id;
  
  const [loading, setLoading] = useState(false);
  const [profile, setProfile] = useState<any>(null);
  
  // Form State
  const [subject, setSubject] = useState('');
  const [educationGrade, setEducationGrade] = useState('');
  const [examType, setExamType] = useState('College');
  const [subTopic, setSubTopic] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [isSubTopicOpen, setIsSubTopicOpen] = useState(false);
  const [examLanguages, setExamLanguages] = useState<string[]>(['English']);
  const [admitCardImage, setAdmitCardImage] = useState<string | null>(null);

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
            setEducationGrade(examData.education_grade || '');
            setExamDate(examData.exam_date || '');
            setExamVenue(examData.exam_venue || '');
            setAdmitCardImage(examData.admit_card_proof || null);
            
            // Parse Exam Type and Subtopic
            const fullType = examData.exam_type || 'College';
            const match = fullType.match(/^([^(]+)(?:\(([^)]+)\))?/);
            if (match) {
              const type = match[1].trim();
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
    setExamDate(`${dateStr} | ${timeStr}`);
    setShowDatePicker(false);
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

  const handleSimulateAdmitCardUpload = () => {
    setAdmitCardImage('hall_ticket_admit_card.jpg');
    Alert.alert('Upload Simulated', 'Your Admit Card image "hall_ticket_admit_card.jpg" has been prepared for upload.');
  };

  const handleSubmit = async () => {
    if (!profile) {
      Alert.alert('Error', 'Your profile details could not be loaded. Please try again.');
      return;
    }

    const finalSubTopic = subTopic || searchQuery;

    if (!subject.trim() || !educationGrade.trim() || !examDate.trim() || !examVenue.trim() || !finalSubTopic.trim() || !admitCardImage || examLanguages.length === 0) {
      Alert.alert('Missing Fields', 'Please fill in all fields (including the Admit Card) and select at least one language.');
      return;
    }

    setLoading(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        throw new Error("You must be logged in to create a request.");
      }

      const requestPayload = {
        student_id: session.user.id,
        student_name: profile.official_name || profile.full_name,
        dob: profile.dob,
        education_grade: educationGrade.trim(),
        phone: profile.phone,
        emergency_phone: profile.emergency_phone,
        exam_type: `${examType} (${finalSubTopic})`,
        exam_language: examLanguages.join(', '),
        id_proof: profile.aadhar_number || 'Aadhar Verified',
        subject: subject.trim(),
        exam_date: examDate.trim(),
        exam_venue: examVenue.trim(),
        admit_card_proof: admitCardImage,
        status: 'pending'
      };

      if (isEditing) {
        const { error } = await supabase
          .from('exam_requests')
          .update(requestPayload)
          .eq('id', params.id);

        if (error) throw error;
        Alert.alert('Success', 'Your scribe request has been updated successfully!');
      } else {
        const { error } = await supabase
          .from('exam_requests')
          .insert(requestPayload);

        if (error) throw error;
        Alert.alert('Success', 'Your scribe request has been posted successfully!');
      }

      router.back();
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to save request.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-slate-50">
      <StatusBar style="dark" />
      
      {/* Header */}
      <View className="bg-white px-6 py-4 border-b border-slate-100 flex-row items-center shadow-sm">
        <TouchableOpacity 
          onPress={() => router.back()} 
          className="mr-4 p-2 -ml-2 rounded-lg active:bg-slate-50"
        >
          <Feather name="arrow-left" size={24} color="#334155" />
        </TouchableOpacity>
        <Text className="text-xl font-black text-slate-800">
          {isEditing ? 'Edit Scribe Request' : 'Request a Scribe'}
        </Text>
      </View>

      <ScrollView className="flex-1 px-6 py-3" contentContainerStyle={{ paddingBottom: 20 }} keyboardShouldPersistTaps="handled">
        <View className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100 space-y-4">
          
          {/* Section: Academic & Exam Details */}
          <View>
            <Text className="text-xs font-bold text-slate-800 mb-2.5 uppercase tracking-wider">Exam Details</Text>
            
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

              <View>
                <Text className="text-[10px] font-semibold text-slate-500 mb-1 ml-1">Education Grade/Degree *</Text>
                <TextInput 
                  value={educationGrade}
                  onChangeText={setEducationGrade}
                  placeholder="e.g. B.A. 2nd Year, Class 12 Board"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-800 focus:border-blue-500 focus:bg-white transition-all"
                />
              </View>

              {/* Date & Time Picker Trigger */}
              <View>
                <Text className="text-[10px] font-semibold text-slate-500 mb-1 ml-1">Exam Date & Time *</Text>
                <TouchableOpacity 
                  onPress={() => setShowDatePicker(true)}
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
                  <TouchableOpacity 
                    onPress={() => setShowMapPicker(true)}
                    className="p-2 bg-blue-50 rounded-lg active:bg-blue-100"
                  >
                    <Feather name="map" size={16} color="#2563eb" />
                  </TouchableOpacity>
                </View>
              </View>

              {/* Admit Card Image Upload */}
              <View className="pt-1">
                <Text className="text-[10px] font-semibold text-slate-500 mb-1 ml-1">Upload Admit Card / Hall Ticket *</Text>
                <TouchableOpacity 
                  onPress={handleSimulateAdmitCardUpload}
                  className={`w-full border-2 border-dashed rounded-xl p-4 items-center justify-center ${
                    admitCardImage ? 'border-blue-300 bg-blue-50/20' : 'border-slate-200 bg-slate-50'
                  }`}
                >
                  {admitCardImage ? (
                    <View className="items-center">
                      <Feather name="image" size={24} color="#2563eb" />
                      <Text className="text-xs font-semibold text-slate-800 mt-1">{admitCardImage}</Text>
                      <Text className="text-[10px] text-slate-400 mt-0.5">Tap to change image</Text>
                    </View>
                  ) : (
                    <View className="items-center">
                      <Feather name="upload-cloud" size={24} color="#94a3b8" />
                      <Text className="text-xs font-semibold text-slate-600 mt-1">Select Admit Card Image</Text>
                      <Text className="text-[10px] text-slate-400 mt-0.5">PNG, JPG, or JPEG up to 5MB</Text>
                    </View>
                  )}
                </TouchableOpacity>
              </View>

            </View>
          </View>

          <View className="h-px bg-slate-100 w-full my-1" />

          {/* Section: Category & Languages */}
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

          {/* Submit Button */}
          <TouchableOpacity 
            onPress={handleSubmit}
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
                      setExamVenue(loc.name + ', ' + loc.address);
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

    </SafeAreaView>
  );
}
