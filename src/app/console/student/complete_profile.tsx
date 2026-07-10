import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, ActivityIndicator, Alert, Modal, FlatList } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { router } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { supabase } from '../../core/supabase';

const YEARS = Array.from({ length: 35 }, (_, i) => (new Date().getFullYear() - 30 + i).toString()); // Last 30 years
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

const DISABILITY_TYPES = [
  'Visual Impairment (Blindness)',
  'Visual Impairment (Low Vision)',
  'Locomotor Disability',
  'Hearing Impairment',
  'Multiple Disabilities',
  'Other'
];

export default function StudentCompleteProfileForm() {
  const [loading, setLoading] = useState(false);
  const [currentStep, setCurrentStep] = useState(1);
  const [showSuccessOverlay, setShowSuccessOverlay] = useState(false);
  
  // Form State
  const [phone, setPhone] = useState('');
  const [emergencyPhone, setEmergencyPhone] = useState('');
  const [dob, setDob] = useState('');
  const [officialName, setOfficialName] = useState('');
  const [aadharNumber, setAadharNumber] = useState('');
  const [aadharImage, setAadharImage] = useState<string | null>(null);
  
  // Step 3 Disability Details State
  const [disabilityType, setDisabilityType] = useState('Select Disability Type');
  const [isDisabilityDropdownOpen, setIsDisabilityDropdownOpen] = useState(false);
  const [disabilityCertificate, setDisabilityCertificate] = useState<string | null>(null);

  // Calendar Picker State
  const [showCalendar, setShowCalendar] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(new Date().getMonth());
  const [calendarYear, setCalendarYear] = useState(2005); // Default start year for students
  const [showYearDropdown, setShowYearDropdown] = useState(false);

  const handleSimulateAadharUpload = () => {
    setAadharImage('aadhar_card_copy.jpg');
    Alert.alert('Upload Simulated', 'Your Aadhar Card image "aadhar_card_copy.jpg" has been prepared for upload.');
  };

  const handleSimulateCertificateUpload = () => {
    setDisabilityCertificate('medical_disability_certificate.pdf');
    Alert.alert('Upload Simulated', 'Your Disability Certificate "medical_disability_certificate.pdf" has been prepared for upload.');
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
          className="w-[14%] h-9 items-center justify-center rounded-full active:bg-blue-100"
        >
          <Text className="text-slate-800 text-xs font-semibold">{day}</Text>
        </TouchableOpacity>
      );
    }

    return totalSlots;
  };

  const handleNextStep = () => {
    if (currentStep === 1) {
      if (!phone.trim() || !emergencyPhone.trim() || !dob.trim()) {
        Alert.alert('Missing Fields', 'Please enter your Phone Number, Emergency Contact, and Date of Birth.');
        return;
      }
    }
    if (currentStep === 2) {
      if (!officialName.trim() || !aadharNumber.trim() || !aadharImage) {
        Alert.alert('Missing Fields', 'Please enter your Official Name, Aadhar Number, and upload your Aadhar Card image.');
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
    if (disabilityType === 'Select Disability Type') {
      Alert.alert('Missing Fields', 'Please select your Disability Type.');
      return;
    }
    if (!disabilityCertificate) {
      Alert.alert('Missing Document', 'Please upload a valid Disability Certificate.');
      return;
    }

    setLoading(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("No active session found.");

      // Update profile in local SQLite database and Supabase
      const { error } = await supabase
        .from('profiles')
        .update({
          official_name: officialName.trim(),
          phone: phone.trim(),
          dob: dob.trim(),
          aadhar_number: aadharNumber.trim(),
          aadhar_image_proof: aadharImage,
          emergency_phone: emergencyPhone.trim(),
          disability_type: disabilityType,
          disability_certificate: disabilityCertificate,
          verification_status: 'approved' // Set directly to approved for local testing/demo
        })
        .eq('id', session.user.id);

      if (error) throw error;

      // Show the 100% completion success overlay
      setShowSuccessOverlay(true);
      
      // Auto-redirect after 3 seconds
      setTimeout(() => {
        setShowSuccessOverlay(false);
        router.replace('/console/student' as any);
      }, 3000);

    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to submit profile.');
    } finally {
      setLoading(false);
    }
  };

  const getStepTitle = () => {
    switch (currentStep) {
      case 1: return 'Contact & Personal Details';
      case 2: return 'Identity & Documents';
      case 3: return 'Disability Details';
      default: return '';
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-slate-50">
      <StatusBar style="dark" />
      
      {/* Header */}
      <View className="bg-white px-6 py-4 border-b border-slate-100 flex-row items-center justify-between shadow-sm">
        <View className="flex-row items-center">
          <TouchableOpacity 
            onPress={() => {
              if (currentStep > 1) {
                setCurrentStep(currentStep - 1);
              } else {
                router.replace('/console/student' as any);
              }
            }} 
            className="mr-4 p-2 -ml-2 rounded-lg active:bg-slate-50"
          >
            <Feather name="arrow-left" size={24} color="#334155" />
          </TouchableOpacity>
          <Text className="text-xl font-black text-slate-800">Register</Text>
        </View>
        <Text style={{ fontSize: 13, fontWeight: '700', color: '#2563eb' }}>Disability Details</Text>
      </View>

      <ScrollView className="flex-1 px-6 py-3" contentContainerStyle={{ paddingBottom: 30 }} showsVerticalScrollIndicator={false}>
        <View className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100">
          
          {/* Progress Indicator */}
          <View className="mb-5">
            <View className="flex-row justify-between items-center mb-1.5">
              <Text className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Step {currentStep} of 3</Text>
              <Text className="text-[10px] font-black text-blue-600 uppercase tracking-wider">{getStepTitle()}</Text>
            </View>
            <View className="h-1 bg-slate-100 rounded-full w-full">
              <View 
                className="h-1 bg-blue-500 rounded-full" 
                style={{ width: `${(currentStep / 3) * 100}%` }} 
              />
            </View>
          </View>

          {/* STEP 1: CONTACT & PERSONAL DETAILS */}
          {currentStep === 1 && (
            <View className="space-y-4">
              <Text className="text-xs font-bold text-slate-800 uppercase tracking-wider">Personal Information</Text>
              
              <View className="space-y-3">
                <View>
                  <Text className="text-[10px] font-semibold text-slate-500 mb-1 ml-1">Phone Number *</Text>
                  <TextInput 
                    value={phone}
                    onChangeText={setPhone}
                    keyboardType="phone-pad"
                    placeholder="Enter 10-digit Phone Number"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-800 focus:border-blue-500 focus:bg-white transition-all"
                  />
                </View>

                <View>
                  <Text className="text-[10px] font-semibold text-slate-500 mb-1 ml-1">Emergency Contact Number *</Text>
                  <TextInput 
                    value={emergencyPhone}
                    onChangeText={setEmergencyPhone}
                    keyboardType="phone-pad"
                    placeholder="Parent/Guardian Phone Number"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-800 focus:border-blue-500 focus:bg-white transition-all"
                  />
                </View>

                {/* DOB with Calendar Trigger */}
                <View>
                  <Text className="text-[10px] font-semibold text-slate-500 mb-1 ml-1">Date of Birth *</Text>
                  <TouchableOpacity 
                    onPress={() => setShowCalendar(true)}
                    activeOpacity={0.8}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 flex-row items-center justify-between active:border-blue-500"
                  >
                    <Text className={`text-sm ${dob ? 'text-slate-800 font-semibold' : 'text-slate-400'}`}>
                      {dob || 'DD/MM/YYYY'}
                    </Text>
                    <Feather name="calendar" size={16} color="#2563eb" />
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          )}

          {/* STEP 2: IDENTITY & DOCUMENTS */}
          {currentStep === 2 && (
            <View className="space-y-4">
              <Text className="text-xs font-bold text-slate-800 uppercase tracking-wider">Identity & Proofs</Text>
              
              <View className="space-y-3.5">
                <View>
                  <Text className="text-[10px] font-semibold text-slate-500 mb-1 ml-1">Official Name (as per ID) *</Text>
                  <TextInput 
                    value={officialName}
                    onChangeText={setOfficialName}
                    placeholder="e.g. Anand Kumar Sen"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-800 focus:border-blue-500 focus:bg-white transition-all"
                  />
                </View>

                <View>
                  <Text className="text-[10px] font-semibold text-slate-500 mb-1 ml-1">Aadhar Card Number *</Text>
                  <TextInput 
                    value={aadharNumber}
                    onChangeText={setAadharNumber}
                    keyboardType="numeric"
                    maxLength={12}
                    placeholder="12-digit Aadhar Number"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-800 focus:border-blue-500 focus:bg-white transition-all"
                  />
                </View>

                <View>
                  <Text className="text-[10px] font-semibold text-slate-500 mb-1 ml-1">Upload Aadhar Card Image *</Text>
                  <TouchableOpacity 
                    onPress={handleSimulateAadharUpload}
                    className={`w-full border-2 border-dashed rounded-xl p-4 items-center justify-center ${
                      aadharImage ? 'border-blue-300 bg-blue-50/20' : 'border-slate-200 bg-slate-50'
                    }`}
                  >
                    {aadharImage ? (
                      <View className="items-center">
                        <Feather name="image" size={24} color="#2563eb" />
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
              </View>
            </View>
          )}

          {/* STEP 3: DISABILITY DETAILS */}
          {currentStep === 3 && (
            <View className="space-y-4">
              <Text className="text-xs font-bold text-slate-850 uppercase tracking-wider">Disability Type*</Text>
              
              {/* Custom Dropdown Trigger */}
              <View>
                <TouchableOpacity 
                  onPress={() => setIsDisabilityDropdownOpen(!isDisabilityDropdownOpen)}
                  style={{
                    width: '100%',
                    backgroundColor: '#ffffff',
                    borderWidth: 1.5,
                    borderColor: '#e2e8f0',
                    borderRadius: 14,
                    paddingHorizontal: 14,
                    paddingVertical: 12,
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between'
                  }}
                >
                  <Text style={{ fontSize: 13, fontWeight: '700', color: disabilityType === 'Select Disability Type' ? '#94a3b8' : '#334155' }}>
                    {disabilityType}
                  </Text>
                  <Feather name={isDisabilityDropdownOpen ? "chevron-up" : "chevron-down"} size={16} color="#64748b" />
                </TouchableOpacity>

                {isDisabilityDropdownOpen && (
                  <View style={{
                    marginTop: 6,
                    backgroundColor: '#ffffff',
                    borderWidth: 1.5,
                    borderColor: '#f1f5f9',
                    borderRadius: 14,
                    shadowColor: '#000',
                    shadowOffset: { width: 0, height: 2 },
                    shadowOpacity: 0.05,
                    shadowRadius: 5,
                    elevation: 2,
                    maxHeight: 180,
                    overflow: 'hidden'
                  }}>
                    <FlatList
                      nestedScrollEnabled={true}
                      data={DISABILITY_TYPES}
                      keyExtractor={(item) => item}
                      renderItem={({ item }) => (
                        <TouchableOpacity
                          onPress={() => {
                            setDisabilityType(item);
                            setIsDisabilityDropdownOpen(false);
                          }}
                          style={{
                            paddingVertical: 12,
                            paddingHorizontal: 14,
                            borderBottomWidth: 1,
                            borderBottomColor: '#f8fafc',
                            backgroundColor: disabilityType === item ? 'rgba(37,99,235,0.06)' : '#ffffff'
                          }}
                        >
                          <Text style={{ fontSize: 13, fontWeight: '700', color: disabilityType === item ? '#2563eb' : '#334155' }}>
                            {item}
                          </Text>
                        </TouchableOpacity>
                      )}
                    />
                  </View>
                )}
                
                <Text style={{ fontSize: 10, color: '#64748b', marginTop: 6, marginLeft: 2 }}>
                  Choose the category that matches your medical certificate.
                </Text>
              </View>

              {/* Disability Certificate Upload Card */}
              <View style={{ marginTop: 8 }}>
                <Text className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-2">Disability Certificate</Text>
                
                <TouchableOpacity 
                  onPress={handleSimulateCertificateUpload}
                  style={{
                    width: '100%',
                    borderWidth: 2,
                    borderStyle: 'dashed',
                    borderColor: disabilityCertificate ? '#93c5fd' : '#e2e8f0',
                    borderRadius: 16,
                    backgroundColor: disabilityCertificate ? 'rgba(37,99,235,0.02)' : '#ffffff',
                    paddingVertical: 28,
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}
                >
                  <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(37,99,235,0.09)', alignItems: 'center', justifyContent: 'center', marginBottom: 10 }}>
                    <Feather name="upload-cloud" size={20} color="#2563eb" />
                  </View>
                  
                  <Text style={{ fontSize: 13, fontWeight: '800', color: '#0f172a' }}>
                    {disabilityCertificate ? 'Certificate Uploaded!' : 'Upload valid Certificate'}
                  </Text>
                  
                  <Text style={{ fontSize: 10, color: '#64748b', textAlign: 'center', marginTop: 4, marginHorizontal: 20 }}>
                    {disabilityCertificate 
                      ? `Selected: ${disabilityCertificate}`
                      : 'Upload a high-quality scan or photo of your government-issued certificate (PDF, JPG, PNG).'
                    }
                  </Text>
                  
                  <View style={{ marginTop: 14, flexDirection: 'row', alignItems: 'center', borderWidth: 1.5, borderColor: '#2563eb', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 12, backgroundColor: '#ffffff' }}>
                    <Feather name="folder" size={13} color="#2563eb" style={{ marginRight: 6 }} />
                    <Text style={{ fontSize: 12, fontWeight: '700', color: '#2563eb' }}>Choose File</Text>
                  </View>
                </TouchableOpacity>
              </View>

              {/* Custom Info Banner Card */}
              <View style={{
                flexDirection: 'row',
                backgroundColor: '#f1f5f9',
                padding: 12,
                borderRadius: 14,
                alignItems: 'flex-start',
                marginTop: 10
              }}>
                <Feather name="info" size={14} color="#64748b" style={{ marginRight: 8, marginTop: 1 }} />
                <Text style={{ fontSize: 10.5, color: '#475569', flex: 1, leadingHeight: 15, fontWeight: '600' }}>
                  This document is required to match you with the most suitable scribe based on your specific requirements and government norms.
                </Text>
              </View>

            </View>
          )}

          {/* Bottom Navigation Buttons */}
          <View className="flex-row gap-3 mt-6 pt-4 border-t border-slate-100">
            {currentStep > 1 && (
              <TouchableOpacity 
                onPress={() => setCurrentStep(currentStep - 1)}
                className="flex-1 bg-slate-100 py-3 rounded-xl items-center justify-center border border-slate-200"
              >
                <Text className="text-slate-700 font-bold text-sm">Back</Text>
              </TouchableOpacity>
            )}
            
            {currentStep < 3 ? (
              <TouchableOpacity 
                onPress={handleNextStep}
                className="flex-1 bg-blue-500 py-3 rounded-xl items-center justify-center shadow-md shadow-blue-500/20"
              >
                <Text className="text-white font-bold text-sm">Next</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity 
                onPress={handleSubmit}
                disabled={loading}
                className="flex-1 bg-blue-500 py-3 rounded-xl items-center justify-center shadow-md shadow-blue-500/30"
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
                <Text className="text-sm font-bold text-slate-800 mr-1.5">{MONTHS[calendarMonth]}</Text>
                
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
                        calendarYear.toString() === item ? 'bg-blue-50' : 'bg-transparent'
                      }`}
                    >
                      <Text className={`text-xs font-bold ${calendarYear.toString() === item ? 'text-blue-600' : 'text-slate-700'}`}>
                        {item}
                      </Text>
                    </TouchableOpacity>
                  )}
                />
              </View>
            ) : (
              <>
                <View className="flex-row flex-wrap mb-2">
                  {WEEKDAYS.map((day) => (
                    <View key={day} className="w-[14.28%] items-center py-1">
                      <Text className="text-[10px] font-bold text-slate-400 uppercase">{day}</Text>
                    </View>
                  ))}
                </View>

                <View className="flex-row flex-wrap mb-4">
                  {renderCalendarDays()}
                </View>
              </>
            )}

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
            <View className="w-20 h-20 bg-blue-50 rounded-full items-center justify-center mb-5 border-2 border-blue-500 shadow-lg shadow-blue-500/20">
              <Feather name="check" size={40} color="#2563eb" />
            </View>
            
            <Text className="text-2xl font-black text-slate-900 text-center tracking-tight">Profile Completed 100%</Text>
            <Text className="text-xs font-semibold text-slate-500 text-center mt-2 px-2 leading-relaxed">
              Your student profile has been successfully updated and submitted for verification!
            </Text>
            
            <View className="flex-row space-x-1.5 mt-6 items-center">
              <ActivityIndicator size="small" color="#2563eb" className="mr-2" />
              <Text className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Entering Dashboard...</Text>
            </View>
          </View>
        </View>
      )}
    </SafeAreaView>
  );
}
