import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, ActivityIndicator, Alert, FlatList } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { router } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { supabase } from '@/core/supabase';
import { announceForAccessibility } from '@/core/a11y';

const DOCUMENT_TYPES = [
  'Aadhar Card',
  'PAN Card',
  'Voter ID',
  'Other'
];

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
  
  // Step 1 State: Document Dropdown, Image, Emergency Contact
  const [docType, setDocType] = useState('Aadhar Card');
  const [isDocDropdownOpen, setIsDocDropdownOpen] = useState(false);
  const [docImage, setDocImage] = useState<string | null>(null);
  const [emergencyPhone, setEmergencyPhone] = useState('');
  
  // Step 2 State: Disability Type Dropdown, Certificate
  const [disabilityType, setDisabilityType] = useState('Select Disability Type');
  const [isDisabilityDropdownOpen, setIsDisabilityDropdownOpen] = useState(false);
  const [disabilityCertificate, setDisabilityCertificate] = useState<string | null>(null);

  const handleSimulateDocUpload = () => {
    const filename = `${docType.toLowerCase().replace(/\s+/g, '_')}_document.jpg`;
    setDocImage(filename);
    Alert.alert('Upload Simulated', `Your ${docType} image "${filename}" has been prepared for upload.`);
  };

  const handleSimulateCertificateUpload = () => {
    setDisabilityCertificate('medical_disability_certificate.pdf');
    Alert.alert('Upload Simulated', 'Your Disability Certificate "medical_disability_certificate.pdf" has been prepared for upload.');
  };

  const handleNextStep = () => {
    if (currentStep === 1) {
      if (!docImage) {
        Alert.alert('Missing Document', `Please upload an image of your ${docType}.`);
        return;
      }
      if (!emergencyPhone.trim()) {
        Alert.alert('Missing Contact', 'Please enter your Emergency Contact Phone Number.');
        return;
      }
    }
    setCurrentStep(2);
  };

  const handleSubmit = async () => {
    if (disabilityType === 'Select Disability Type') {
      Alert.alert('Missing Disability Type', 'Please select your Disability Type from the options.');
      return;
    }
    if (!disabilityCertificate) {
      Alert.alert('Missing Certificate', 'Please upload a valid Disability Certificate.');
      return;
    }

    setLoading(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("No active session found.");

      // Update profile in local database and backend
      const { error } = await supabase
        .from('profiles')
        .update({
          aadhar_number: docType,
          aadhar_image_proof: docImage,
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
      case 1: return 'Document & Contact Details';
      case 2: return 'Disability Verification';
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
              accessibilityLabel="Back to Step 1"
              className="mr-3 p-1.5 -ml-1 rounded-lg active:bg-slate-50"
            >
              <Feather name="arrow-left" size={22} color="#334155" />
            </TouchableOpacity>
          )}
          <Text className="text-xl font-black text-slate-800">Verification Form</Text>
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Text style={{ fontSize: 13, fontWeight: '700', color: '#2563eb' }}>
            Step {currentStep} of 2
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

      <ScrollView className="flex-1 px-6 py-3" contentContainerStyle={{ paddingBottom: 30 }} showsVerticalScrollIndicator={false}>
        <View className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100">
          
          {/* Progress Indicator */}
          <View className="mb-5">
            <View className="flex-row justify-between items-center mb-1.5">
              <Text className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Step {currentStep} of 2</Text>
              <Text className="text-[10px] font-black text-blue-600 uppercase tracking-wider">{getStepTitle()}</Text>
            </View>
            <View className="h-1 bg-slate-100 rounded-full w-full">
              <View 
                className="h-1 bg-blue-500 rounded-full" 
                style={{ width: `${(currentStep / 2) * 100}%` }} 
              />
            </View>
          </View>

          {/* STEP 1: OFFICIAL DOCUMENT & EMERGENCY CONTACT */}
          {currentStep === 1 && (
            <View className="space-y-4">
              <Text className="text-xs font-bold text-slate-800 uppercase tracking-wider">Official Document & Emergency Phone</Text>
              
              <View className="space-y-4">

                {/* 1. Official Document Type Dropdown */}
                <View>
                  <Text className="text-[10px] font-semibold text-slate-500 mb-1 ml-1">Official Document Type *</Text>
                  <TouchableOpacity 
                    onPress={() => {
                      setIsDocDropdownOpen(!isDocDropdownOpen);
                      announceForAccessibility(!isDocDropdownOpen ? 'Document type options opened' : 'Document type options closed');
                    }}
                    accessible={true}
                    accessibilityRole="button"
                    accessibilityLabel={`Official Document Type: ${docType}`}
                    accessibilityHint="Double tap to change document type"
                    style={{
                      width: '100%',
                      backgroundColor: '#f8fafc',
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
                    <Text style={{ fontSize: 13, fontWeight: '700', color: '#334155' }}>
                      {docType}
                    </Text>
                    <Feather name={isDocDropdownOpen ? "chevron-up" : "chevron-down"} size={16} color="#64748b" importantForAccessibility="no" accessibilityElementsHidden={true} />
                  </TouchableOpacity>

                  {isDocDropdownOpen && (
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
                      overflow: 'hidden'
                    }}>
                      {DOCUMENT_TYPES.map((item) => (
                        <TouchableOpacity
                          key={item}
                          onPress={() => {
                            setDocType(item);
                            setIsDocDropdownOpen(false);
                            setDocImage(null); // Reset uploaded image when doc type changes
                            announceForAccessibility(`Selected document type: ${item}`);
                          }}
                          accessible={true}
                          accessibilityRole="button"
                          accessibilityLabel={item}
                          style={{
                            paddingVertical: 12,
                            paddingHorizontal: 14,
                            borderBottomWidth: 1,
                            borderBottomColor: '#f8fafc',
                            backgroundColor: docType === item ? 'rgba(37,99,235,0.06)' : '#ffffff'
                          }}
                        >
                          <Text style={{ fontSize: 13, fontWeight: '700', color: docType === item ? '#2563eb' : '#334155' }}>
                            {item}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}
                </View>

                {/* 2. Upload Image of Official Document */}
                <View>
                  <Text className="text-[10px] font-semibold text-slate-500 mb-1 ml-1">Upload {docType} Image *</Text>
                  <TouchableOpacity 
                    onPress={handleSimulateDocUpload}
                    accessible={true}
                    accessibilityRole="button"
                    accessibilityLabel={docImage ? `${docType} image uploaded: ${docImage}` : `Upload Image of ${docType}`}
                    accessibilityHint="Opens file selector to choose document image"
                    className={`w-full border-2 border-dashed rounded-xl p-4 items-center justify-center ${
                      docImage ? 'border-blue-300 bg-blue-50/20' : 'border-slate-200 bg-slate-50'
                    }`}
                  >
                    {docImage ? (
                      <View className="items-center">
                        <Feather name="image" size={24} color="#2563eb" importantForAccessibility="no" accessibilityElementsHidden={true} />
                        <Text className="text-xs font-semibold text-slate-800 mt-1">{docImage}</Text>
                        <Text className="text-[10px] text-blue-600 font-bold mt-0.5">Tap to change image</Text>
                      </View>
                    ) : (
                      <View className="items-center">
                        <Feather name="upload-cloud" size={24} color="#94a3b8" importantForAccessibility="no" accessibilityElementsHidden={true} />
                        <Text className="text-xs font-semibold text-slate-600 mt-1">Select Image of {docType}</Text>
                        <Text className="text-[10px] text-slate-400 mt-0.5">PNG, JPG, or JPEG up to 5MB</Text>
                      </View>
                    )}
                  </TouchableOpacity>
                </View>

                {/* 3. Emergency Contact Number */}
                <View>
                  <Text className="text-[10px] font-semibold text-slate-500 mb-1 ml-1">Emergency Phone Number *</Text>
                  <TextInput 
                    value={emergencyPhone}
                    onChangeText={setEmergencyPhone}
                    keyboardType="phone-pad"
                    placeholder="Parent/Guardian Phone Number"
                    accessible={true}
                    accessibilityLabel="Emergency Phone Number"
                    accessibilityHint="Enter parent or guardian phone number"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-800 focus:border-blue-500 focus:bg-white transition-all"
                  />
                </View>

              </View>
            </View>
          )}

          {/* STEP 2: DISABILITY DETAILS */}
          {currentStep === 2 && (
            <View className="space-y-4">
              <Text className="text-xs font-bold text-slate-800 uppercase tracking-wider">Disability Type & Certificate</Text>
              
              {/* Custom Dropdown Trigger */}
              <View>
                <Text className="text-[10px] font-semibold text-slate-500 mb-1 ml-1">Disability Type *</Text>
                <TouchableOpacity 
                  onPress={() => {
                    setIsDisabilityDropdownOpen(!isDisabilityDropdownOpen);
                    announceForAccessibility(!isDisabilityDropdownOpen ? 'Disability category options opened' : 'Disability category options closed');
                  }}
                  accessible={true}
                  accessibilityRole="button"
                  accessibilityLabel={`Disability Category: ${disabilityType}`}
                  accessibilityHint="Double tap to choose disability type such as Visual Impairment or Blindness"
                  style={{
                    width: '100%',
                    backgroundColor: '#f8fafc',
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
                  <Feather name={isDisabilityDropdownOpen ? "chevron-up" : "chevron-down"} size={16} color="#64748b" importantForAccessibility="no" accessibilityElementsHidden={true} />
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
                            announceForAccessibility(`Selected disability category: ${item}`);
                          }}
                          accessible={true}
                          accessibilityRole="button"
                          accessibilityLabel={item}
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
                <Text className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-2">Disability Certificate *</Text>
                
                <TouchableOpacity 
                  onPress={handleSimulateCertificateUpload}
                  accessible={true}
                  accessibilityRole="button"
                  accessibilityLabel={disabilityCertificate ? `Disability certificate uploaded: ${disabilityCertificate}` : "Upload valid Disability Certificate"}
                  accessibilityHint="Select scan or photo of your disability certificate"
                  style={{
                    width: '100%',
                    borderWidth: 2,
                    borderStyle: 'dashed',
                    borderColor: disabilityCertificate ? '#93c5fd' : '#e2e8f0',
                    borderRadius: 16,
                    backgroundColor: disabilityCertificate ? 'rgba(37,99,235,0.02)' : '#ffffff',
                    paddingVertical: 24,
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}
                >
                  <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(37,99,235,0.09)', alignItems: 'center', justifyContent: 'center', marginBottom: 10 }}>
                    <Feather name="upload-cloud" size={20} color="#2563eb" importantForAccessibility="no" accessibilityElementsHidden={true} />
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
                    <Feather name="folder" size={13} color="#2563eb" style={{ marginRight: 6 }} importantForAccessibility="no" accessibilityElementsHidden={true} />
                    <Text style={{ fontSize: 12, fontWeight: '700', color: '#2563eb' }}>Choose File</Text>
                  </View>
                </TouchableOpacity>
              </View>

              {/* Info Banner Card */}
              <View
                accessible={true}
                accessibilityLabel="Notice: This document is required to match you with the most suitable scribe based on your specific requirements and government norms."
                style={{
                  flexDirection: 'row',
                  backgroundColor: '#f1f5f9',
                  padding: 12,
                  borderRadius: 14,
                  alignItems: 'flex-start',
                  marginTop: 6
                }}
              >
                <Feather name="info" size={14} color="#64748b" style={{ marginRight: 8, marginTop: 1 }} importantForAccessibility="no" accessibilityElementsHidden={true} />
                <Text style={{ fontSize: 10.5, color: '#475569', flex: 1, lineHeight: 15, fontWeight: '600' }}>
                  This document is required to match you with the most suitable scribe based on your specific requirements and government norms.
                </Text>
              </View>

            </View>
          )}

          {/* Bottom Navigation Buttons */}
          <View className="flex-row gap-3 mt-6 pt-4 border-t border-slate-100">
            {currentStep > 1 && (
              <TouchableOpacity 
                onPress={() => {
                  setCurrentStep(currentStep - 1);
                  announceForAccessibility('Returned to Step 1: Official Document and Emergency Contact');
                }}
                accessible={true}
                accessibilityRole="button"
                accessibilityLabel="Back to Step 1"
                className="flex-1 bg-slate-100 py-3 rounded-xl items-center justify-center border border-slate-200"
              >
                <Text className="text-slate-700 font-bold text-sm">Back</Text>
              </TouchableOpacity>
            )}
            
            {currentStep < 2 ? (
              <TouchableOpacity 
                onPress={() => {
                  handleNextStep();
                  announceForAccessibility('Proceeding to Step 2: Disability Details');
                }}
                accessible={true}
                accessibilityRole="button"
                accessibilityLabel="Next: Proceed to Step 2 Disability Details"
                className="flex-1 bg-blue-500 py-3 rounded-xl items-center justify-center shadow-md shadow-blue-500/20"
              >
                <Text className="text-white font-bold text-sm">Next</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity 
                onPress={handleSubmit}
                disabled={loading}
                accessible={true}
                accessibilityRole="button"
                accessibilityLabel={loading ? "Submitting profile verification, please wait" : "Submit Profile for Verification"}
                accessibilityState={{ busy: loading, disabled: loading }}
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
