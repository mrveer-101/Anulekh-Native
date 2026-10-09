/**
 * Contact Support screen — route `/console/common/support`, shared by both roles.
 *
 * Opened from the "support" entry on the student home (components/student/StudentHomeView.tsx)
 * and scribe home (components/scribe/ScribeHomeView.tsx) dashboards. Lets the signed-in user
 * file a helpdesk ticket for the admin team.
 *
 * Data:
 * - auth session (user id + email); redirects to `/auth/login` when signed out,
 * - the user's `profiles` row (role and phone) via the `supabase` shim (Rust/Axum backend).
 * The role only changes the accent colour (blue = student, emerald = scribe) and the fallback
 * route used by the back button.
 *
 * Submitting POSTs the ticket directly (plain `fetch`, not the shim) to the backend's
 * `/api/support/create`, which inserts a 'pending' row into `support_tickets`.
 * The optional screenshot is picked with the file picker and uploaded straight to **private**
 * storage (`kind: ticket`); the ticket stores `r2p:<key>`, which only an admin can open.
 */
import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput, ActivityIndicator, Alert, Modal, FlatList, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { router } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { supabase } from '@/core/supabase';
import { storageService } from '@/services/storageService';

/** Categories offered in the issue-type picker; the chosen string is sent as `issue_type`. */
const ISSUE_TYPES = [
  'App bug / Crash',
  'Verification issue',
  'Exam request problem',
  'Scribe matching help',
  'Other / Suggestions'
];

/**
 * Support ticket screen (default export for expo-router). Takes no props.
 * Shows a spinner until the user's details load, then the read-only identity fields, the issue
 * form and a bottom-sheet modal for picking the issue category.
 */
export default function SupportScreen() {
  // Signed-in user's details, shown read-only and sent with the ticket.
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [role, setRole] = useState<'student' | 'scribe'>('student');
  
  // Ticket Form State
  const [issueType, setIssueType] = useState('Select Issue Type');
  const [description, setDescription] = useState('');
  const [referenceImage, setReferenceImage] = useState<string | null>(null);
  // Local preview of the picked screenshot (the saved value is a private key) and upload state.
  const [previewUri, setPreviewUri] = useState<string | null>(null);
  const [previewName, setPreviewName] = useState('');
  const [attaching, setAttaching] = useState(false);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [sending, setSending] = useState(false);

  // Load the user's details once on mount.
  useEffect(() => {
    fetchUserData();
  }, []);

  /**
   * Reads the auth session (redirecting to login if absent), then the user's `profiles` row to
   * fill role and phone. Errors are logged and the form still renders with what was loaded.
   */
  const fetchUserData = async () => {
    try {
      // 1. Session: user id and email; signed-out users are sent to the login screen.
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.replace('/auth/login');
        return;
      }

      setUserId(session.user.id);
      setEmail(session.user.email || '');

      // 2. Profile row: role (for theming / back navigation) and phone number.
      const { data: profile, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', session.user.id)
        .single();

      if (error) throw error;
      if (profile) {
        setRole(profile.role || 'student');
        setPhone(profile.phone || '');
      }
    } catch (error) {
      console.error('Error fetching user profile for support:', error);
    } finally {
      setLoading(false);
    }
  };

  /** "Attach screenshot": pick a JPG/PNG and upload it to private storage (only admins can open it). */
  const handleAttachScreenshot = async () => {
    if (attaching) return;
    setAttaching(true);
    const res = await storageService.pickAndUpload('ticket', { allowPdf: false });
    setAttaching(false);
    if (!res) return; // cancelled
    if (res.error || !res.value) {
      Alert.alert('Upload failed', res.error || 'Please try again.');
      return;
    }
    setReferenceImage(res.value);
    setPreviewUri(res.uri);
    setPreviewName(res.name);
  };

  /** Clears the attached reference image. */
  const handleRemoveAttachment = () => {
    setReferenceImage(null);
    setPreviewUri(null);
  };

  /**
   * Validates the form and submits the ticket to `POST /api/support/create` (backend inserts into
   * `support_tickets`). On success shows a confirmation alert whose OK button resets the form and
   * navigates back; on failure shows an error alert. `sending` disables the button meanwhile.
   */
  const handleSubmitTicket = async () => {
    // Validation: an issue category and a non-empty description are required.
    if (issueType === 'Select Issue Type') {
      Alert.alert('Required Field', 'Please select the type of issue you are facing.');
      return;
    }
    if (!description.trim()) {
      Alert.alert('Required Field', 'Please describe your issue in the text area.');
      return;
    }

    setSending(true);

    try {
      // Direct call to the Axum backend (EXPO_PUBLIC_API_URL, else the hosted server).
      const API_URL = process.env.EXPO_PUBLIC_API_URL || 'https://anulekh-axum.onrender.com';
      const res = await fetch(`${API_URL}/api/support/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: userId,
          email,
          phone,
          issue_type: issueType,
          description: description.trim(),
          reference_image: referenceImage
        })
      });

      if (!res.ok) {
        throw new Error('Failed to submit ticket to admin server.');
      }

      Alert.alert(
        'Ticket Created',
        'Your support ticket has been submitted successfully. Our admin team will inspect and resolve this shortly!',
        [
          {
            text: 'OK',
            onPress: () => {
              // Clear form
              setIssueType('Select Issue Type');
              setDescription('');
              setReferenceImage(null);
              // Navigate back
              handleBack();
            }
          }
        ]
      );
    } catch (error: any) {
      Alert.alert('Submission Error', error.message || 'Unable to reach support server.');
    } finally {
      setSending(false);
    }
  };

  /**
   * Goes back in history, or — when the screen was opened directly with no history — replaces
   * the route with the user's own console home.
   */
  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace(isStudent ? '/console/student' : '/console/scribe');
    }
  };

  // Role-based accent colours (NativeWind classes): blue for students, emerald for scribes.
  const isStudent = role === 'student';
  const themeColorClass = isStudent ? 'bg-blue-600 active:bg-blue-700' : 'bg-emerald-600 active:bg-emerald-700';
  const themeTextClass = isStudent ? 'text-blue-600' : 'text-emerald-600';
  const themeBgClass = isStudent ? 'bg-blue-50' : 'bg-emerald-50';
  const themeBorderClass = isStudent ? 'focus:border-blue-500' : 'focus:border-emerald-500';

  // Spinner while the user's details load.
  if (loading) {
    return (
      <SafeAreaView className="flex-1 bg-slate-50 justify-center items-center">
        <ActivityIndicator size="large" color={isStudent ? '#2563eb' : '#059669'} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-slate-50">
      <StatusBar style="dark" />
      
      {/* Header */}
      <View className="bg-white px-6 py-4 border-b border-slate-100 flex-row items-center justify-between shadow-sm">
        <View className="flex-row items-center">
          <TouchableOpacity 
            onPress={handleBack} 
            className="mr-4 p-2 -ml-2 rounded-lg active:bg-slate-50"
          >
            <Feather name="arrow-left" size={24} color="#334155" />
          </TouchableOpacity>
          <Text className="text-xl font-black text-slate-800">Contact Support</Text>
        </View>
      </View>

      <ScrollView className="flex-1 px-6 py-6" contentContainerStyle={{ paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
        
        {/* Support Card Information */}
        <View className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm mb-6 flex-row items-center space-x-4">
          <View className={`w-12 h-12 rounded-2xl ${themeBgClass} items-center justify-center`}>
            <Feather name="life-buoy" size={24} color={isStudent ? '#2563eb' : '#059669'} />
          </View>
          <View className="flex-1">
            <Text className="font-black text-slate-800 text-base">Helpdesk Ticket Form</Text>
            <Text className="text-slate-400 text-xs mt-0.5">Please specify your issue category and details below.</Text>
          </View>
        </View>

        {/* 1-Slide Ticket Creation Form */}
        <View className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm space-y-4">
          
          {/* User ID (Prefilled & Readonly) */}
          <View>
            <Text className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">User ID (Auto-filled)</Text>
            <View className="w-full bg-slate-100 border border-slate-200 rounded-xl px-4 py-3">
              <Text className="text-slate-500 font-semibold text-sm">{userId}</Text>
            </View>
          </View>

          {/* Email (Prefilled & Readonly) */}
          <View>
            <Text className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">Email Address (Auto-filled)</Text>
            <View className="w-full bg-slate-100 border border-slate-200 rounded-xl px-4 py-3">
              <Text className="text-slate-500 font-semibold text-sm">{email}</Text>
            </View>
          </View>

          {/* Phone Number (Prefilled & Readonly) */}
          <View>
            <Text className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">Phone Number (Auto-filled)</Text>
            <View className="w-full bg-slate-100 border border-slate-200 rounded-xl px-4 py-3">
              <Text className="text-slate-500 font-semibold text-sm">{phone || 'Not Specified'}</Text>
            </View>
          </View>

          {/* Issue Type Selector */}
          <View>
            <Text className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">Type of Issue</Text>
            <TouchableOpacity 
              onPress={() => setIsDropdownOpen(true)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3.5 flex-row justify-between items-center"
            >
              <Text className={`font-semibold text-sm ${issueType === 'Select Issue Type' ? 'text-slate-400' : 'text-slate-800'}`}>
                {issueType}
              </Text>
              <Feather name="chevron-down" size={18} color="#64748b" />
            </TouchableOpacity>
          </View>

          {/* Description Text Area */}
          <View>
            <Text className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">Describe your Issue</Text>
            <TextInput 
              value={description}
              onChangeText={setDescription}
              multiline
              numberOfLines={5}
              placeholder="Provide a detailed description of the error, bug or matching issue..."
              textAlignVertical="top"
              className={`w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-slate-800 h-32 focus:bg-white ${themeBorderClass}`}
            />
          </View>

          {/* Reference Image upload (Optional) */}
          <View>
            <Text className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">Reference Screenshot (Optional)</Text>
            {/* Attached: thumbnail + remove button; otherwise the attach button */}
            {referenceImage ? (
              <View className="border border-slate-200 rounded-xl p-3 bg-slate-50 flex-row items-center justify-between">
                <View className="flex-row items-center space-x-3">
                  <View className="w-12 h-12 bg-slate-200 rounded-lg overflow-hidden border border-slate-300">
                    {!!previewUri && <Image source={{ uri: previewUri }} className="w-full h-full" resizeMode="cover" />}
                  </View>
                  <Text className="text-xs font-bold text-slate-600" numberOfLines={1}>{previewName || 'Screenshot'}</Text>
                </View>
                <TouchableOpacity onPress={handleRemoveAttachment} className="p-2 rounded-full bg-rose-50 active:bg-rose-100">
                  <Feather name="trash-2" size={16} color="#ef4444" />
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity 
                onPress={handleAttachScreenshot}
                className="w-full border border-slate-200 rounded-xl p-4 bg-slate-50 flex-row justify-center items-center space-x-2 border-dashed"
              >
                <Feather name="image" size={18} color={isStudent ? '#2563eb' : '#059669'} />
                <Text className={`font-bold text-xs ${themeTextClass}`}>{attaching ? 'Uploading…' : 'Attach Screenshot / Photo'}</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Submit Button */}
          <View className="pt-2">
            <TouchableOpacity 
              onPress={handleSubmitTicket}
              disabled={sending}
              className={`w-full ${themeColorClass} py-4 rounded-xl items-center justify-center shadow-lg flex-row space-x-2`}
            >
              {sending ? (
                <ActivityIndicator color="white" />
              ) : (
                <>
                  <Feather name="send" size={16} color="white" />
                  <Text className="text-white font-black text-base">Submit Support Ticket</Text>
                </>
              )}
            </TouchableOpacity>
          </View>

        </View>

      </ScrollView>

      {/* CUSTOM ISSUE TYPE DROPDOWN MODAL */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={isDropdownOpen}
        onRequestClose={() => setIsDropdownOpen(false)}
      >
        <View className="flex-1 bg-slate-950/50 justify-end">
          <View className="bg-white rounded-t-3xl p-6 shadow-2xl">
            <View className="flex-row justify-between items-center mb-4 pb-2 border-b border-slate-100">
              <Text className="text-base font-black text-slate-800">Select Issue Category</Text>
              <TouchableOpacity onPress={() => setIsDropdownOpen(false)} className="p-2">
                <Feather name="x" size={20} color="#64748b" />
              </TouchableOpacity>
            </View>

            {/* Category list; tapping one selects it and closes the sheet */}
            <FlatList
              data={ISSUE_TYPES}
              keyExtractor={(item) => item}
              renderItem={({ item }) => (
                <TouchableOpacity
                  onPress={() => {
                    setIssueType(item);
                    setIsDropdownOpen(false);
                  }}
                  className="py-4 border-b border-slate-50 flex-row items-center justify-between"
                >
                  <Text className={`font-semibold text-sm ${issueType === item ? themeTextClass : 'text-slate-700'}`}>
                    {item}
                  </Text>
                  {issueType === item && <Feather name="check" size={18} color={isStudent ? '#2563eb' : '#059669'} />}
                </TouchableOpacity>
              )}
              contentContainerStyle={{ paddingBottom: 20 }}
            />
          </View>
        </View>
      </Modal>

    </SafeAreaView>
  );
}
