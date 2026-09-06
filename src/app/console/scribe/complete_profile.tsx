import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, ActivityIndicator, Alert, Modal, FlatList } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { router } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { supabase } from '@/core/supabase';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';

const YEARS = Array.from({ length: 35 }, (_, i) => (new Date().getFullYear() - 30 + i).toString()); // Last 30 years
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const EDUCATION_LEVELS = ['Secondary School (10th)', 'Higher Secondary (12th)', 'Undergraduate (Bachelor)', 'Postgraduate (Master)'];
const LANGUAGES = ['English', 'Hindi', 'Gujarati'];
const AVAILABILITY_SLOTS = [
  { key: 'Morning', label: 'Morning', time: '8 AM – 12 PM', icon: 'sunrise' as const },
  { key: 'Afternoon', label: 'Afternoon', time: '12 PM – 4 PM', icon: 'sun' as const },
  { key: 'Evening', label: 'Evening', time: '4 PM – 8 PM', icon: 'sunset' as const },
];

export default function CompleteProfileForm() {
  const [loading, setLoading] = useState(false);
  const [currentStep, setCurrentStep] = useState(1);
  const [showSuccessOverlay, setShowSuccessOverlay] = useState(false);
  
  // Form State
  const [officialName, setOfficialName] = useState('');
  const [phone, setPhone] = useState('');
  const [dob, setDob] = useState('');
  const [occupation, setOccupation] = useState('');
  const [location, setLocation] = useState('');
  const [locating, setLocating] = useState(false);

  const handleAutoDetectLocation = async () => {
    setLocating(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Required', 'Please allow location permission to auto-detect your City, State.');
        setLocating(false);
        return;
      }

      const currentLocation = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });

      const { latitude, longitude } = currentLocation.coords;

      let city = '';
      let state = '';

      // 1. Try native expo-location reverse geocoding (strict City priority)
      try {
        const reverseGeocode = await Location.reverseGeocodeAsync({ latitude, longitude });
        if (reverseGeocode && reverseGeocode.length > 0) {
          const place = reverseGeocode[0];
          // Strictly prioritize main City / District / Subregion (ignoring sub-area/suburb like Tragad)
          city = place.city || place.subregion || place.district || '';
          state = place.region || '';
        }
      } catch (err) {
        console.log('Native reverseGeocode fallback to Nominatim OSM:', err);
      }

      // 2. Fallback to OpenStreetMap Nominatim API (strict City priority, ignoring suburb/area)
      if (!city || !state) {
        try {
          const osmRes = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}`);
          if (osmRes.ok) {
            const osmData = await osmRes.json();
            const addr = osmData.address || {};
            // Strictly pick City / Town / Municipality / District (ignoring suburb/neighbourhood like Tragad)
            city = addr.city || addr.town || addr.municipality || addr.county || addr.district || addr.state_district || '';
            state = addr.state || '';
          }
        } catch (osmErr) {
          console.log('OSM Nominatim fetch error:', osmErr);
        }
      }

      // Formulate final "City, State" string
      if (city && state) {
        setLocation(`${city}, ${state}`);
      } else if (city) {
        setLocation(city);
      } else if (state) {
        setLocation(state);
      } else {
        setLocation(`Ahmedabad, Gujarat`);
      }
    } catch (e: any) {
      Alert.alert('Location Detection', e.message || 'Could not auto-detect location. Please type your City, State.');
    } finally {
      setLocating(false);
    }
  };
  const [aadharNumber, setAadharNumber] = useState('');
  const [educationLevel, setEducationLevel] = useState('Higher Secondary (12th)');
  const [isEduDropdownOpen, setIsEduDropdownOpen] = useState(false);
  const [selectedLanguages, setSelectedLanguages] = useState<string[]>([]);
  const [availabilitySlots, setAvailabilitySlots] = useState<string[]>([]);
  const [uploadedFile, setUploadedFile] = useState<string | null>(null);
  const [aadharImage, setAadharImage] = useState<string | null>(null);
  
  const [urgentCalls, setUrgentCalls] = useState(false);
  const [firstTime, setFirstTime] = useState(true);

  // Calendar Picker State
  const [showCalendar, setShowCalendar] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(new Date().getMonth());
  const [calendarYear, setCalendarYear] = useState(2003); // Default start year for volunteers
  const [showYearDropdown, setShowYearDropdown] = useState(false);

  const handleSimulateUpload = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/pdf', 'image/*'],
        copyToCacheDirectory: true
      });
      if (result.canceled || !result.assets?.length) return;
      const asset = result.assets[0];
      const filename = asset.name || 'highest_qualification_marksheet.pdf';
      setUploadedFile(filename);
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to select file.');
    }
  };

  const handleSimulateAadharUpload = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Required', 'Please allow access to your photo library to select an image.');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        quality: 0.8,
      });
      if (result.canceled || !result.assets?.length) return;
      const asset = result.assets[0];
      const filename = asset.fileName || asset.uri.split('/').pop() || 'aadhar_card_copy.jpg';
      setAadharImage(filename);
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to select image.');
    }
  };

  const toggleLanguage = (lang: string) => {
    if (selectedLanguages.includes(lang)) {
      setSelectedLanguages(selectedLanguages.filter(l => l !== lang));
    } else {
      setSelectedLanguages([...selectedLanguages, lang]);
    }
  };

  const toggleSlot = (slot: string) => {
    if (availabilitySlots.includes(slot)) {
      setAvailabilitySlots(availabilitySlots.filter(s => s !== slot));
    } else {
      setAvailabilitySlots([...availabilitySlots, slot]);
    }
  };

  // Calendar Helper functions
  const getDaysInMonth = (month: number, year: number) => {
    return new Date(year, month + 1, 0).getDate();
  };

  const getFirstDayOfMonth = (month: number, year: number) => {
    return new Date(year, month, 1).getDay();
  };

  const handleSelectDay = (day: number) => {
    const formattedDay = day < 10 ? `0${day}` : day;
    const formattedMonth = calendarMonth + 1 < 10 ? `0${calendarMonth + 1}` : calendarMonth + 1;
    setDob(`${formattedDay}/${formattedMonth}/${calendarYear}`);
    setShowCalendar(false);
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
  };

  const renderCalendarDays = () => {
    const daysInMonth = getDaysInMonth(calendarMonth, calendarYear);
    const firstDay = getFirstDayOfMonth(calendarMonth, calendarYear);
    const totalSlots = [];

    // Empty slots for days before the 1st
    for (let i = 0; i < firstDay; i++) {
      totalSlots.push(<View key={`empty-${i}`} className="w-[14%] h-9 items-center justify-center" />);
    }

    // Days of the month
    for (let day = 1; day <= daysInMonth; day++) {
      totalSlots.push(
        <TouchableOpacity 
          key={`day-${day}`}
          onPress={() => handleSelectDay(day)}
          className="w-[14%] h-9 items-center justify-center rounded-full active:bg-emerald-100"
        >
          <Text className="text-slate-800 text-xs font-semibold">{day}</Text>
        </TouchableOpacity>
      );
    }

    return totalSlots;
  };

  const handleNextStep = () => {
    if (currentStep === 1) {
      if (!officialName.trim() || !dob.trim() || !occupation.trim() || !location.trim()) {
        Alert.alert('Missing Fields', 'Please enter your Name, Date of Birth, Occupation, and Location.');
        return;
      }
    } else if (currentStep === 2) {
      if (!aadharNumber.trim() || !aadharImage) {
        Alert.alert('Missing Fields', 'Please enter your Aadhar number and upload Aadhar image.');
        return;
      }
      if (aadharNumber.trim().length !== 12 || isNaN(Number(aadharNumber.trim()))) {
        Alert.alert('Invalid ID', 'Please enter a valid 12-digit Aadhar Card number.');
        return;
      }
    }
    setCurrentStep(currentStep + 1);
  };

  const handleSubmit = async () => {
    if (selectedLanguages.length === 0) {
      Alert.alert('Missing Fields', 'Please select at least one language you can scribe in.');
      return;
    }

    if (availabilitySlots.length === 0) {
      Alert.alert('Missing Fields', 'Please select at least one availability window (Morning, Afternoon, or Evening).');
      return;
    }

    setLoading(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("No active session found.");

      const profilePayload = {
        official_name: officialName.trim(),
        aadhar_number: aadharNumber.trim(),
        dob: dob.trim(),
        occupation: occupation.trim(),
        location: location.trim(),
        urgent_calls: urgentCalls ? 'yes' : 'no',
        first_time: firstTime ? 'yes' : 'no',
        education_level: educationLevel,
        certification_proof: uploadedFile,
        aadhar_image_proof: aadharImage,
        languages: selectedLanguages,
        availability_slots: availabilitySlots.join(', '),
        verification_status: 'approved',
      };

      // Check if profile exists, if not insert, else update
      const { data: existingProfile } = await supabase
        .from('profiles')
        .select('id')
        .eq('id', session.user.id)
        .single();

      if (!existingProfile) {
        await supabase.from('profiles').insert({
          id: session.user.id,
          role: 'scribe',
          full_name: officialName.trim(),
          ...profilePayload,
        });
      } else {
        const { error } = await supabase
          .from('profiles')
          .update(profilePayload)
          .eq('id', session.user.id);
        if (error) throw error;
      }

      // Show the 100% completion success overlay
      setShowSuccessOverlay(true);
      
      // Auto-redirect after 3 seconds
      setTimeout(() => {
        setShowSuccessOverlay(false);
        router.replace('/console/scribe' as any);
      }, 3000);

    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to submit profile.');
    } finally {
      setLoading(false);
    }
  };

  const getStepTitle = () => {
    switch (currentStep) {
      case 1: return 'Personal Details';
      case 2: return 'Identity & Proofs';
      case 3: return 'Preferences';
      default: return '';
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-slate-50">
      <StatusBar style="dark" />
      
      {/* Header */}
      <View className="bg-white px-6 py-4 border-b border-slate-100 flex-row items-center justify-between shadow-sm">
        <View className="flex-row items-center">
          {currentStep > 1 && (
            <TouchableOpacity 
              onPress={() => setCurrentStep(currentStep - 1)} 
              accessible={true}
              accessibilityRole="button"
              accessibilityLabel="Back to Previous Step"
              className="mr-3 p-1.5 -ml-1 rounded-lg active:bg-slate-50"
            >
              <Feather name="arrow-left" size={22} color="#334155" />
            </TouchableOpacity>
          )}
          <Text className="text-xl font-black text-slate-800">Verify Scribe Profile</Text>
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Text style={{ fontSize: 13, fontWeight: '700', color: '#16a34a' }}>
            Step {currentStep} of 3
          </Text>
          <TouchableOpacity
            onPress={async () => {
              await supabase.auth.signOut();
              router.replace('/landing' as any);
            }}
            accessible={true}
            accessibilityRole="button"
            accessibilityLabel="Log out of account"
            accessibilityHint="Exits the verification form and logs out"
            style={{
              flexDirection: 'row', alignItems: 'center', gap: 4,
              backgroundColor: '#fee2e2', paddingVertical: 5, paddingHorizontal: 10,
              borderRadius: 8, borderWidth: 1, borderColor: '#fca5a5'
            }}
          >
            <Feather name="log-out" size={12} color="#dc2626" />
            <Text style={{ fontSize: 11, fontWeight: '700', color: '#dc2626' }}>Log Out</Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView className="flex-1 px-6 py-3" contentContainerStyle={{ paddingBottom: 20 }}>
        <View className="bg-white p-5 rounded-3xl border border-slate-200 shadow-md">
          
          {/* Progress Indicator */}
          <View className="mb-5">
            <View className="flex-row justify-between items-center mb-1.5">
              <Text className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Step {currentStep} of 3</Text>
              <Text className="text-[10px] font-black text-emerald-600 uppercase tracking-wider">{getStepTitle()}</Text>
            </View>
            <View className="h-1 bg-slate-100 rounded-full w-full">
              <View 
                className="h-1 bg-emerald-500 rounded-full" 
                style={{ width: `${(currentStep / 3) * 100}%` }} 
              />
            </View>
          </View>

          {/* STEP 1: PERSONAL DETAILS */}
          {currentStep === 1 && (
            <View className="space-y-4">
              <Text className="text-xs font-bold text-slate-800 uppercase tracking-wider">Personal Information</Text>
              
              <View className="space-y-3">
                 <View>
                  <Text className="text-[10px] font-semibold text-slate-500 mb-1 ml-1">Official Name (as per ID) *</Text>
                  <TextInput 
                    value={officialName}
                    onChangeText={setOfficialName}
                    placeholder="e.g. Rahul Ramesh Sharma"
                    className="w-full bg-white border border-slate-200 shadow-sm rounded-xl px-3 py-2.5 text-sm text-slate-800 focus:border-emerald-500 transition-all"
                  />
                </View>
 
                {/* DOB with Calendar Trigger */}
                <View>
                  <Text className="text-[10px] font-semibold text-slate-500 mb-1 ml-1">Date of Birth *</Text>
                  <TouchableOpacity 
                    onPress={() => setShowCalendar(true)}
                    activeOpacity={0.8}
                    className="w-full bg-white border border-slate-200 shadow-sm rounded-xl px-3 py-2.5 flex-row items-center justify-between active:border-emerald-500"
                  >
                    <Text className={`text-sm ${dob ? 'text-slate-800 font-semibold' : 'text-slate-400'}`}>
                      {dob || 'DD/MM/YYYY'}
                    </Text>
                    <Feather name="calendar" size={16} color="#059669" />
                  </TouchableOpacity>
                </View>
 
                <View>
                  <Text className="text-[10px] font-semibold text-slate-500 mb-1 ml-1">Occupation *</Text>
                  <TextInput 
                    value={occupation}
                    onChangeText={setOccupation}
                    placeholder="e.g. Student, Software Engineer"
                    className="w-full bg-white border border-slate-200 shadow-sm rounded-xl px-3 py-2.5 text-sm text-slate-800 focus:border-emerald-500 transition-all"
                  />
                </View>
 
                <View>
                  <View className="flex-row items-center justify-between mb-1 ml-1">
                    <Text className="text-[10px] font-semibold text-slate-500">Location (City / Area) *</Text>
                    <TouchableOpacity 
                      onPress={handleAutoDetectLocation}
                      disabled={locating}
                      activeOpacity={0.7}
                      className="flex-row items-center gap-1 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-md active:bg-emerald-100"
                    >
                      {locating ? (
                        <ActivityIndicator size="small" color="#059669" />
                      ) : (
                        <>
                          <Feather name="navigation" size={10} color="#059669" />
                          <Text className="text-[10px] font-bold text-emerald-700">Auto-Detect</Text>
                        </>
                      )}
                    </TouchableOpacity>
                  </View>
                  <TextInput 
                    value={location}
                    onChangeText={setLocation}
                    placeholder="e.g. Andheri, Mumbai"
                    className="w-full bg-white border border-slate-200 shadow-sm rounded-xl px-3 py-2.5 text-sm text-slate-800 focus:border-emerald-500 transition-all"
                  />
                </View>
              </View>
            </View>
          )}

          {/* STEP 2: IDENTITY & EDUCATION PROOFS */}
          {currentStep === 2 && (
            <View className="space-y-4">
              <Text className="text-xs font-bold text-slate-800 uppercase tracking-wider">Verification Documents</Text>
              
              <View className="space-y-3.5">
                {/* Aadhar Input */}
                <View>
                  <Text className="text-[10px] font-semibold text-slate-500 mb-1 ml-1">Aadhar Card Number *</Text>
                  <TextInput 
                    value={aadharNumber}
                    onChangeText={setAadharNumber}
                    keyboardType="numeric"
                    maxLength={12}
                    placeholder="12-digit Aadhar Number"
                    className="w-full bg-white border border-slate-200 shadow-sm rounded-xl px-3 py-2.5 text-sm text-slate-800 focus:border-emerald-500 transition-all"
                  />
                </View>

                {/* Aadhar Upload */}
                <View>
                  <Text className="text-[10px] font-semibold text-slate-500 mb-1 ml-1">Upload Aadhar Card Image *</Text>
                  <TouchableOpacity 
                    onPress={handleSimulateAadharUpload}
                    className={`w-full border-2 border-dashed shadow-sm rounded-xl p-4 items-center justify-center ${
                      aadharImage ? 'border-emerald-300 bg-emerald-50/20' : 'border-slate-300 bg-white'
                    }`}
                  >
                    {aadharImage ? (
                      <View className="items-center">
                        <Feather name="image" size={24} color="#059669" />
                        <Text className="text-xs font-semibold text-slate-800 mt-1">{aadharImage}</Text>
                        <Text className="text-[10px] text-slate-400 mt-0.5">Tap to change image</Text>
                      </View>
                    ) : (
                      <View className="items-center">
                        <Feather name="upload-cloud" size={24} color="#94a3b8" />
                        <Text className="text-xs font-semibold text-slate-600 mt-1">Select Aadhar Card Image</Text>
                        <Text className="text-[10px] text-slate-400 mt-0.5">PNG, JPG, or JPEG up to 5MB</Text>
                      </View>
                    )}
                  </TouchableOpacity>
                </View>

                {/* Education Dropdown */}
                <View>
                  <Text className="text-[10px] font-semibold text-slate-500 mb-1 ml-1">Highest Education Level (Optional)</Text>
                  <View className="w-full">
                    <TouchableOpacity 
                      onPress={() => setIsEduDropdownOpen(!isEduDropdownOpen)}
                      className={`w-full bg-white border border-slate-200 shadow-sm px-3 py-2.5 flex-row items-center justify-between transition-all ${
                        isEduDropdownOpen ? 'rounded-t-xl border-b-0' : 'rounded-xl'
                      }`}
                    >
                      <Text className="text-slate-800 text-sm font-semibold">{educationLevel}</Text>
                      <Feather name={isEduDropdownOpen ? "chevron-up" : "chevron-down"} size={16} color="#64748b" />
                    </TouchableOpacity>

                    {isEduDropdownOpen && (
                      <View className="w-full bg-white border border-slate-200 rounded-b-xl overflow-hidden shadow-sm">
                        {EDUCATION_LEVELS.map((level, index) => (
                          <TouchableOpacity
                            key={level}
                            onPress={() => {
                              setEducationLevel(level);
                              setIsEduDropdownOpen(false);
                            }}
                            className={`px-3 py-2.5 border-b border-slate-100 ${
                              educationLevel === level ? 'bg-emerald-50' : 'bg-white active:bg-slate-50'
                            } ${index === EDUCATION_LEVELS.length - 1 ? 'border-b-0' : ''}`}
                          >
                            <View className="flex-row items-center justify-between">
                              <Text className={`text-sm font-semibold ${educationLevel === level ? 'text-emerald-600' : 'text-slate-700'}`}>
                                {level}
                              </Text>
                              {educationLevel === level && <Feather name="check" size={14} color="#059669" />}
                            </View>
                          </TouchableOpacity>
                        ))}
                      </View>
                    )}
                  </View>
                </View>

                {/* Certificate Upload */}
                <View>
                  <Text className="text-[10px] font-semibold text-slate-500 mb-1 ml-1">Upload Certificate Proof (Optional)</Text>
                  <TouchableOpacity 
                    onPress={handleSimulateUpload}
                    className={`w-full border-2 border-dashed shadow-sm rounded-xl p-4 items-center justify-center ${
                      uploadedFile ? 'border-emerald-300 bg-emerald-50/20' : 'border-slate-300 bg-white'
                    }`}
                  >
                    {uploadedFile ? (
                      <View className="items-center">
                        <Feather name="file-text" size={24} color="#059669" />
                        <Text className="text-xs font-semibold text-slate-800 mt-1">{uploadedFile}</Text>
                        <Text className="text-[10px] text-slate-400 mt-0.5">Tap to change file</Text>
                      </View>
                    ) : (
                      <View className="items-center">
                        <Feather name="upload-cloud" size={24} color="#94a3b8" />
                        <Text className="text-xs font-semibold text-slate-600 mt-1">Select Certificate File</Text>
                        <Text className="text-[10px] text-slate-400 mt-0.5">PDF, PNG, or JPG up to 5MB</Text>
                      </View>
                    )}
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          )}

          {/* STEP 3: PREFERENCES & LANGUAGES */}
          {currentStep === 3 && (
            <View className="space-y-4">
              {/* Languages */}
              <View>
                <Text className="text-xs font-bold text-slate-800 mb-2 uppercase tracking-wider">Communication</Text>
                <Text className="text-[10px] font-semibold text-slate-500 mb-1.5 ml-1">Preferred Languages to Scribe *</Text>
                <View className="flex-row flex-wrap gap-1.5">
                  {LANGUAGES.map((lang) => {
                    const isSelected = selectedLanguages.includes(lang);
                    return (
                      <TouchableOpacity 
                        key={lang}
                        onPress={() => toggleLanguage(lang)}
                        className={`px-3.5 py-1.5 rounded-full border flex-row items-center ${
                          isSelected 
                            ? 'bg-emerald-500 border-emerald-500 shadow-sm shadow-emerald-500/30' 
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

              <View className="h-px bg-slate-100 w-full my-1" />

              {/* Availability Windows */}
              <View>
                <Text className="text-xs font-bold text-slate-800 mb-2 uppercase tracking-wider">Availability</Text>
                <Text className="text-[10px] font-semibold text-slate-500 mb-2 ml-1">Preferred Daily Time Slots *</Text>
                <View className="gap-2">
                  {AVAILABILITY_SLOTS.map((slot) => {
                    const isSelected = availabilitySlots.includes(slot.key);
                    return (
                      <TouchableOpacity
                        key={slot.key}
                        onPress={() => toggleSlot(slot.key)}
                        className={`flex-row items-center justify-between px-3.5 py-2.5 rounded-xl border ${
                          isSelected
                            ? 'bg-emerald-50 border-emerald-500'
                            : 'bg-slate-50 border-slate-200'
                        }`}
                      >
                        <View className="flex-row items-center">
                          <Feather name={slot.icon} size={16} color={isSelected ? '#059669' : '#94a3b8'} />
                          <View className="ml-3">
                            <Text className={`text-xs font-bold ${isSelected ? 'text-emerald-700' : 'text-slate-700'}`}>{slot.label}</Text>
                            <Text className="text-[9px] text-slate-400 mt-0.5">{slot.time}</Text>
                          </View>
                        </View>
                        <View className={`w-5 h-5 rounded-full items-center justify-center border ${
                          isSelected ? 'bg-emerald-500 border-emerald-500' : 'border-slate-300'
                        }`}>
                          {isSelected && <Feather name="check" size={12} color="white" />}
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>

              <View className="h-px bg-slate-100 w-full my-1" />

              {/* Preferences */}
              <View>
                <Text className="text-xs font-bold text-slate-800 mb-2 uppercase tracking-wider">Preferences & History</Text>
                
                <View className="space-y-3.5">
                  <View className="flex-row items-center justify-between">
                    <View className="flex-1 pr-4">
                      <Text className="text-xs font-semibold text-slate-800">Available for Urgent Calls?</Text>
                      <Text className="text-slate-400 text-[9px] mt-0.5">Can we contact you for last-minute exam requests?</Text>
                    </View>
                    <View className="flex-row bg-slate-100 rounded-lg p-0.5">
                      <TouchableOpacity 
                        onPress={() => setUrgentCalls(true)}
                        className={`px-3.5 py-1 rounded-md ${urgentCalls ? 'bg-emerald-500' : ''}`}
                      >
                        <Text className={`text-[9px] font-bold ${urgentCalls ? 'text-white' : 'text-slate-600'}`}>Yes</Text>
                      </TouchableOpacity>
                      <TouchableOpacity 
                        onPress={() => setUrgentCalls(false)}
                        className={`px-3.5 py-1 rounded-md ${!urgentCalls ? 'bg-slate-200' : ''}`}
                      >
                        <Text className={`text-[9px] font-bold ${!urgentCalls ? 'text-slate-700' : 'text-slate-500'}`}>No</Text>
                      </TouchableOpacity>
                    </View>
                  </View>

                  <View className="h-px bg-slate-50 w-full" />

                  <View className="flex-row items-center justify-between">
                    <View className="flex-1 pr-4">
                      <Text className="text-xs font-semibold text-slate-800">First Time as Scribe?</Text>
                      <Text className="text-slate-400 text-[9px] mt-0.5">Is this your first time volunteering as a scribe?</Text>
                    </View>
                    <View className="flex-row bg-slate-100 rounded-lg p-0.5">
                      <TouchableOpacity 
                        onPress={() => setFirstTime(true)}
                        className={`px-3.5 py-1 rounded-md ${firstTime ? 'bg-emerald-500' : ''}`}
                      >
                        <Text className={`text-[9px] font-bold ${firstTime ? 'text-white' : 'text-slate-600'}`}>Yes</Text>
                      </TouchableOpacity>
                      <TouchableOpacity 
                        onPress={() => setFirstTime(false)}
                        className={`px-3.5 py-1 rounded-md ${!firstTime ? 'bg-slate-200' : ''}`}
                      >
                        <Text className={`text-[9px] font-bold ${!firstTime ? 'text-slate-700' : 'text-slate-500'}`}>No</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
              </View>
            </View>
          )}

          {/* Bottom Navigation Buttons */}
          <View className="flex-row gap-3 mt-6 pt-4 border-t border-slate-100">
            {currentStep > 1 && (
              <TouchableOpacity 
                onPress={() => setCurrentStep(currentStep - 1)}
                className="flex-1 bg-slate-100 py-2.5 rounded-xl items-center justify-center border border-slate-200"
              >
                <Text className="text-slate-700 font-bold text-sm">Back</Text>
              </TouchableOpacity>
            )}
            
            {currentStep < 3 ? (
              <TouchableOpacity 
                onPress={handleNextStep}
                className="flex-1 bg-emerald-500 py-2.5 rounded-xl items-center justify-center shadow-md shadow-emerald-500/20"
              >
                <Text className="text-white font-bold text-sm">Next</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity 
                onPress={handleSubmit}
                disabled={loading}
                className="flex-1 bg-emerald-500 py-2.5 rounded-xl items-center justify-center shadow-md shadow-emerald-500/30"
              >
                {loading ? (
                  <ActivityIndicator color="white" size="small" />
                ) : (
                  <Text className="text-white font-bold text-sm">Submit Profile</Text>
                )}
              </TouchableOpacity>
            )}
          </View>

        </View>
      </ScrollView>

      {/* CUSTOM CALENDAR MODAL */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={showCalendar}
        onRequestClose={() => setShowCalendar(false)}
      >
        <View className="flex-1 bg-slate-950/50 justify-center items-center px-6">
          <View className="bg-white w-full max-w-sm rounded-3xl p-5 border border-slate-100 shadow-2xl">
            
            {/* Calendar Header */}
            <View className="flex-row items-center justify-between mb-4">
              <TouchableOpacity onPress={() => changeMonth('prev')} className="p-2 bg-slate-50 rounded-xl">
                <Feather name="chevron-left" size={16} color="#334155" />
              </TouchableOpacity>
              
              <View className="flex-row items-center">
                {/* Month Name */}
                <Text className="text-sm font-bold text-slate-800 mr-1.5">{MONTHS[calendarMonth]}</Text>
                
                {/* Year Dropdown Trigger */}
                <TouchableOpacity 
                  onPress={() => setShowYearDropdown(!showYearDropdown)}
                  className="bg-slate-50 border border-slate-200 px-2.5 py-1 rounded-lg flex-row items-center"
                >
                  <Text className="text-xs font-bold text-slate-700 mr-1">{calendarYear}</Text>
                  <Feather name={showYearDropdown ? "chevron-up" : "chevron-down"} size={10} color="#64748b" />
                </TouchableOpacity>
              </View>

              <TouchableOpacity onPress={() => changeMonth('next')} className="p-2 bg-slate-50 rounded-xl">
                <Feather name="chevron-right" size={16} color="#334155" />
              </TouchableOpacity>
            </View>

            {/* Year Selector Dropdown */}
            {showYearDropdown ? (
              <View className="h-48 mb-4 border border-slate-100 rounded-2xl overflow-hidden bg-slate-50">
                <FlatList
                  data={YEARS}
                  keyExtractor={(item) => item}
                  renderItem={({ item }) => (
                    <TouchableOpacity
                      onPress={() => {
                        setCalendarYear(parseInt(item));
                        setShowYearDropdown(false);
                      }}
                      className={`py-3 items-center border-b border-slate-100 ${
                        calendarYear.toString() === item ? 'bg-emerald-50' : 'bg-transparent'
                      }`}
                    >
                      <Text className={`text-xs font-bold ${calendarYear.toString() === item ? 'text-emerald-600' : 'text-slate-700'}`}>
                        {item}
                      </Text>
                    </TouchableOpacity>
                  )}
                />
              </View>
            ) : (
              <>
                {/* Weekdays Header */}
                <View className="flex-row flex-wrap mb-2">
                  {WEEKDAYS.map((day) => (
                    <View key={day} className="w-[14.28%] items-center py-1">
                      <Text className="text-[10px] font-bold text-slate-400 uppercase">{day}</Text>
                    </View>
                  ))}
                </View>

                {/* Calendar Days Grid */}
                <View className="flex-row flex-wrap mb-4">
                  {renderCalendarDays()}
                </View>
              </>
            )}

            {/* Cancel Button */}
            <TouchableOpacity 
              onPress={() => {
                setShowCalendar(false);
                setShowYearDropdown(false);
              }}
              className="w-full bg-slate-100 py-3 rounded-2xl items-center justify-center"
            >
              <Text className="text-slate-600 font-bold text-xs">Cancel</Text>
            </TouchableOpacity>

          </View>
        </View>
      </Modal>

      {/* 100% PROFILE COMPLETION SUCCESS OVERLAY */}
      {showSuccessOverlay && (
        <View className="absolute inset-0 bg-slate-950/80 items-center justify-center z-50">
          <View className="bg-white/95 p-8 rounded-3xl items-center border border-slate-200/50 shadow-2xl w-80">
            {/* Pulsing Success Icon */}
            <View className="w-20 h-20 bg-emerald-50 rounded-full items-center justify-center mb-5 border-2 border-emerald-500 shadow-lg shadow-emerald-500/20">
              <Feather name="check" size={40} color="#059669" />
            </View>
            
            <Text className="text-2xl font-black text-slate-900 text-center tracking-tight">Profile Completed 100%</Text>
            <Text className="text-xs font-semibold text-slate-500 text-center mt-2 px-2 leading-relaxed">
              Your volunteer scribe profile has been successfully updated and submitted for verification!
            </Text>
            
            {/* Loading Indicator */}
            <View className="flex-row space-x-1.5 mt-6 items-center">
              <ActivityIndicator size="small" color="#059669" className="mr-2" />
              <Text className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Entering Dashboard...</Text>
            </View>
          </View>
        </View>
      )}
    </SafeAreaView>
  );
}
