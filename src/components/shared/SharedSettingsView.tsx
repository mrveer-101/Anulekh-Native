/**
 * SharedSettingsView — the "Account" (settings) tab shared by the student and scribe portals.
 *
 * Rendered inside `<TabPane active={activeTab === 'settings'}>` (keep-alive tab body, see
 * components/ui/TabPane.tsx) by app/console/student/index.tsx, app/console/scribe/index.tsx and their
 * desktop counterparts components/pc_view/ConsoleStudentPC.tsx and ConsoleScribePC.tsx. The colour theme
 * follows the account's role (STUDENT_THEME or SCRIBE_THEME from core/portalTheme.ts).
 *
 * Sections: profile header with a device-local photo, editable "Basic Information" (with scribe-only
 * languages / availability / first-time options), app language picker, a demo card for test push
 * notifications, and Save / Sign Out / Delete Account buttons.
 *
 * Data: `supabase` is the custom shim in core/supabase.ts that sends queries to the Rust/Axum backend
 * (`POST /api/query`); it is not real Supabase. Reads and updates the user's `profiles` row; account
 * deletion calls the backend directly at `POST /api/auth/delete-account`. The profile photo and the
 * welcome flags live only in AsyncStorage.
 */
import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, ActivityIndicator, Alert, Image, Pressable, Switch } from 'react-native';
import { Feather, FontAwesome5, Ionicons } from '@expo/vector-icons';
import Animated, { FadeInDown, useReducedMotion } from 'react-native-reanimated';
import { router } from 'expo-router';
import { supabase } from '@/core/supabase';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useLanguage, LanguageType } from '@/core/translation';
import * as ImagePicker from 'expo-image-picker';
import { triggerTestNotification } from '@/core/notifications';
import { haptic, HapticKind, loadHapticsEnabled, setHapticsEnabled } from '@/core/haptics';
import { announceForAccessibility } from '@/core/a11y';
import { gradient, portalCardStyle, PortalTheme, SCRIBE_THEME, STUDENT_THEME } from '@/core/portalTheme';
import { useInDesktopShell } from '@/components/ui/DesktopShell';

// ---- Shared style helper and small presentational components used by the cards below ----

/** Union of valid Feather icon names, used to type the icon props below. */
type FeatherName = React.ComponentProps<typeof Feather>['name'];

/** The three test-notification tiles: short label on screen, full description for screen readers. */
const NOTIF_TESTS: {
  type: 'match' | 'sos' | 'reminder'; label: string; icon: FeatherName; haptic: HapticKind;
  color: string; bg: string; border: string; a11yLabel: string; a11yHint: string;
}[] = [
  { type: 'match', label: 'Match', icon: 'check-circle', haptic: 'success', color: '#15803d', bg: 'rgba(22,163,74,0.07)', border: 'rgba(22,163,74,0.22)', a11yLabel: 'Test Scribe Matched Alert', a11yHint: 'Sends a test notification simulating scribe match confirmation' },
  { type: 'sos', label: 'SOS', icon: 'alert-triangle', haptic: 'error', color: '#dc2626', bg: 'rgba(220,38,38,0.06)', border: 'rgba(220,38,38,0.22)', a11yLabel: 'Test Emergency SOS Alert', a11yHint: 'Sends high-priority emergency SOS broadcast alert' },
  { type: 'reminder', label: 'Reminder', icon: 'clock', haptic: 'warning', color: '#c2410c', bg: 'rgba(234,88,12,0.06)', border: 'rgba(234,88,12,0.22)', a11yLabel: 'Test Exam Reminder', a11yHint: 'Sends scheduled exam day reminder' },
];

/**
 * Shared TextInput style for the form fields.
 * @param editable false gives the greyed read-only variant (phone, email).
 */
const inputStyle = (editable = true) => ({
  backgroundColor: editable ? '#f8fafc' : '#f1f5f9',
  borderWidth: 1.5,
  borderColor: '#e2e8f0',
  borderRadius: 14,
  paddingHorizontal: 14,
  paddingVertical: 11,
  fontSize: 13.5,
  color: editable ? '#0f172a' : '#475569',
  fontWeight: '600' as const,
});

/** Card title row: tinted icon badge + uppercase title, with an optional element on the right. */
function SectionHeader({ theme, icon, title, right }: { theme: PortalTheme; icon: FeatherName; title: string; right?: React.ReactNode }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
        <View style={{
          width: 30, height: 30, borderRadius: 10,
          backgroundColor: theme.soft, borderWidth: 1, borderColor: theme.softBorder,
          alignItems: 'center', justifyContent: 'center',
        }}>
          <Feather name={icon} size={15} color={theme.accentText} importantForAccessibility="no" accessibilityElementsHidden={true} />
        </View>
        <Text
          accessible={true}
          accessibilityRole="header"
          style={{ fontSize: 12.5, fontWeight: '800', color: '#334155', textTransform: 'uppercase', letterSpacing: 0.6, flexShrink: 1 }}
        >
          {title}
        </Text>
      </View>
      {right}
    </View>
  );
}

/** Small label above an input, with a tinted icon. */
function FieldLabel({ theme, label, icon, ionicon }: { theme: PortalTheme; label: string; icon?: FeatherName; ionicon?: React.ComponentProps<typeof Ionicons>['name'] }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
      {ionicon
        ? <Ionicons name={ionicon} size={13} color={theme.accentText} style={{ marginRight: 6 }} />
        : <Feather name={icon} size={13} color={theme.accentText} style={{ marginRight: 6 }} />}
      <Text style={{ fontSize: 11.5, fontWeight: '700', color: '#475569' }}>{label}</Text>
    </View>
  );
}

/** Selectable pill used for scribe languages, availability slots and yes/no choices. */
function Chip({ theme, label, selected, onPress }: { theme: PortalTheme; label: string; selected: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.8}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      aria-selected={selected}
      style={{
        paddingHorizontal: 14, paddingVertical: 7, borderRadius: 999,
        backgroundColor: selected ? theme.solid : '#ffffff',
        borderWidth: 1.5, borderColor: selected ? theme.solid : '#e2e8f0',
      }}
    >
      <Text style={{ fontSize: 12, fontWeight: '700', color: selected ? '#ffffff' : '#475569' }}>{label}</Text>
    </TouchableOpacity>
  );
}

/**
 * Account tab for both portals. Takes no props: the user comes from the session and the role from
 * their `profiles` row (which also picks the colour theme and shows the scribe-only options).
 */
export default function SharedSettingsView() {
  // Inside the desktop console: no own page background, wider layout (see ui/DesktopShell).
  const inShell = useInDesktopShell();
  // Translation: current language, language switcher and the t() string lookup.
  const { lang, changeLanguage, t } = useLanguage();
  // Session user and the always-visible header / basic fields.
  const [user, setUser] = useState<any>(null);
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [profilePhoto, setProfilePhoto] = useState<string | null>(null);

  // Expanded Detail fields
  const [isExpanded, setIsExpanded] = useState(false);
  const [dob, setDob] = useState('');
  // gender is local only: it is neither loaded from nor saved to the profile.
  const [gender, setGender] = useState('male');
  const [location, setLocation] = useState('');
  const [occupation, setOccupation] = useState('');
  const [educationLevel, setEducationLevel] = useState('');
  const [aadharNumber, setAadharNumber] = useState('');
  const [certificationProof, setCertificationProof] = useState('');
  const [aadharImageProof, setAadharImageProof] = useState('');

  // Scribe Specific Settings states
  const [role, setRole] = useState<'student' | 'scribe' | ''>('');
  const [firstTime, setFirstTime] = useState(false);
  const [selectedLanguages, setSelectedLanguages] = useState<string[]>([]);
  const [availabilitySlots, setAvailabilitySlots] = useState<string[]>([]);

  // Loading/saving flags, language dropdown and test-notification status.
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [isLangDropdownOpen, setIsLangDropdownOpen] = useState(false);
  const [notifTriggering, setNotifTriggering] = useState(false);
  const [notifStatusText, setNotifStatusText] = useState<string | null>(null);
  // Haptic feedback setting (core/haptics), shown as a switch in the Notifications card.
  const [hapticsOn, setHapticsOn] = useState(true);

  // Visual theme follows the account's role; cards rise in one after another (off with Reduce Motion).
  const theme = role === 'scribe' ? SCRIBE_THEME : STUDENT_THEME;
  const reduceMotion = useReducedMotion();
  const rise = (index: number) => (reduceMotion ? undefined : FadeInDown.delay(index * 70).duration(420));

  /**
   * Fires a demo local notification (core/notifications `triggerTestNotification`) and shows the
   * result, or the error, in a status line that clears itself after 5 seconds.
   * @param type Which demo notification to send.
   */
  const handleSendTestNotification = async (type: 'match' | 'sos' | 'reminder') => {
    // Each kind has its own feel: success (match), error buzz (SOS), warning nudge (reminder).
    haptic(NOTIF_TESTS.find((n) => n.type === type)?.haptic);
    setNotifTriggering(true);
    setNotifStatusText('Sending…');
    try {
      const summary = await triggerTestNotification(type);
      // Show just the notification title (the summary is "title: body").
      setNotifStatusText(`Sent · ${summary.split(':')[0]}`);
    } catch (err: any) {
      setNotifStatusText(`Notification error: ${err?.message || err}`);
    } finally {
      setNotifTriggering(false);
      setTimeout(() => {
        setNotifStatusText(null);
      }, 5000);
    }
  };

  // Load once on mount. The keep-alive TabPane keeps this view mounted, so revisiting the tab does not refetch.
  useEffect(() => {
    fetchUserData();
    loadHapticsEnabled().then(setHapticsOn);
  }, []);

  /** Haptic switch: saves the choice and gives a light tap when turned on. */
  const toggleHaptics = async (on: boolean) => {
    setHapticsOn(on);
    await setHapticsEnabled(on);
    if (on) haptic('tap');
  };

  /**
   * Loads the signed-in user's `profiles` row into the form, or redirects to /auth/login when there is
   * no session. The profile photo comes from AsyncStorage (`profile_photo_<userId>`), not the backend.
   */
  const fetchUserData = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.replace('/auth/login');
        return;
      }
      setUser(session.user);
      setEmail(session.user.email || '');

      // The photo is device-local only (see handleSelectPhoto).
      const localPhoto = await AsyncStorage.getItem(`profile_photo_${session.user.id}`);
      if (localPhoto) {
        setProfilePhoto(localPhoto);
      }

      // The user's profile row from the backend.
      const { data: profile, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', session.user.id)
        .single();

      if (error) throw error;
      if (profile) {
        setFullName(profile.full_name || '');
        setPhone(profile.phone || '');
        setRole(profile.role || '');

        // Populate extra details
        // Missing values fall back to demo placeholders, which are saved back if the user taps Save.
        setDob(profile.dob || '2005-02-03');
        setLocation(profile.location || 'Ahmedabad, Gujarat');
        setOccupation(profile.occupation || 'Working Professional');
        setEducationLevel(profile.education_level || 'Undergraduate - Completed');
        setAadharNumber(profile.aadhar_number || '8102917340');
        setCertificationProof(profile.certification_proof || 'educational_certificate.pdf');
        setAadharImageProof(profile.aadhar_image_proof || 'government_id_proof.jpg');

        // Scribe specific fields
        setFirstTime(profile.first_time === 'yes');
        // languages is stored as a JSON array string; a plain non-JSON string is treated as one language.
        try {
          const parsedLangs = typeof profile.languages === 'string' ? JSON.parse(profile.languages) : (profile.languages || []);
          setSelectedLanguages(Array.isArray(parsedLangs) ? parsedLangs : []);
        } catch {
          setSelectedLanguages(typeof profile.languages === 'string' ? [profile.languages] : []);
        }
        // availability_slots is stored as a comma-separated string.
        const slotsStr = profile.availability_slots || '';
        setAvailabilitySlots(slotsStr.split(',').map((s: string) => s.trim()).filter(Boolean));
      }
    } catch (error) {
      console.warn('Error fetching user data in Settings:', error);
    } finally {
      setLoading(false);
    }
  };
  /**
   * Reads a local image URI and returns it as a base64 `data:` URI.
   * @param uri File/blob URI returned by expo-image-picker.
   */
  const toDataUri = async (uri: string): Promise<string> => {
    const response = await fetch(uri);
    const blob = await response.blob();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  };

  /**
   * Lets the user pick a square photo from the library, converts it to a data URI and stores it in
   * AsyncStorage under `profile_photo_<userId>`. It is shown in the header but never sent to the backend.
   */
  const handleSelectPhoto = async () => {
    try {
      // Photo-library permission is required before opening the picker.
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Required', 'Please allow photo library access to upload a profile photo.');
        return;
      }
      // Square crop at reduced quality keeps the stored data URI small.
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.6,
      });
      if (result.canceled || !result.assets?.length) return;
      const asset = result.assets[0];
      // Show it immediately and remember it on this device.
      const dataUri = await toDataUri(asset.uri);
      setProfilePhoto(dataUri);
      if (user) {
        await AsyncStorage.setItem(`profile_photo_${user.id}`, dataUri);
      }
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to select image.');
    }
  };

  /**
   * Validates name and phone, then updates the user's `profiles` row with the editable fields.
   * Scribes also save `first_time` ('yes'/'no'), `languages` (JSON array string) and
   * `availability_slots` (comma-separated). Gender is not saved.
   */
  const handleSaveSettings = async () => {
    // Name and phone are required.
    if (!fullName.trim() || !phone.trim()) {
      Alert.alert(t('error'), t('enter_name') + ' & ' + t('enter_phone'));
      return;
    }

    setUpdating(true);
    try {
      // Fields common to both roles.
      const updateData: any = {
        full_name: fullName.trim(),
        phone: phone.trim(),
        dob: dob.trim(),
        location: location.trim(),
        occupation: occupation.trim(),
        education_level: educationLevel.trim(),
        aadhar_number: aadharNumber.trim(),
      };

      // Scribe-only fields, serialised in the formats the profiles table stores.
      if (role === 'scribe') {
        updateData.first_time = firstTime ? 'yes' : 'no';
        updateData.languages = JSON.stringify(selectedLanguages);
        updateData.availability_slots = availabilitySlots.join(', ');
      }

      const { error } = await supabase
        .from('profiles')
        .update(updateData)
        .eq('id', user.id);

      if (error) throw error;
      Alert.alert(t('success'), t('save_success_desc'));
    } catch (error: any) {
      Alert.alert(t('error'), error.message || 'Error updating profile.');
    } finally {
      setUpdating(false);
    }
  };

  /**
   * Confirms, clears the one-time welcome flags, signs out (the shim removes the local session and wipes
   * the screen caches) and returns to /landing.
   */
  const handleSignOut = () => {
    Alert.alert('Sign Out', 'Are you sure you want to log out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out',
        style: 'destructive',
        onPress: async () => {
          await AsyncStorage.removeItem('welcome_toast_shown');
          await AsyncStorage.removeItem('scribe_welcome_shown');
          await supabase.auth.signOut();
          router.replace('/landing');
        }
      }
    ]);
  };

  /**
   * Confirms, then asks the backend to delete the account (`POST /api/auth/delete-account` with
   * `{ user_id }`), clears all AsyncStorage, signs out and returns to /landing.
   */
  const handleDeleteAccount = () => {
    Alert.alert(
      'Delete Account Permanently',
      'Are you sure you want to permanently delete your Anulekh account? All your profile data, exam requests, and chat history will be permanently wiped. This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete Permanently',
          style: 'destructive',
          onPress: async () => {
            try {
              if (user?.id) {
                // The shim has no apiHost field, so this resolves to the Render backend URL.
                // The response is not checked: local data is cleared either way.
                await fetch(`${supabase.auth ? (supabase as any).apiHost || 'https://anulekh-axum.onrender.com' : 'https://anulekh-axum.onrender.com'}/api/auth/delete-account`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ user_id: user.id })
                });
              }
              await AsyncStorage.clear();
              await supabase.auth.signOut();
              Alert.alert('Account Deleted', 'Your account has been deleted successfully.');
              router.replace('/landing');
            } catch (e: any) {
              Alert.alert('Error', e?.message || 'Failed to delete account. Please try again.');
            }
          }
        }
      ]
    );
  };

  // Spinner until the profile has loaded.
  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', paddingVertical: 40, backgroundColor: '#f0f4ff' }}>
        <ActivityIndicator size="large" color="#2563eb" />
      </View>
    );
  }

  // The status line turns red when the last test notification failed.
  const notifIsError = !!notifStatusText && notifStatusText.startsWith('Notification error');

  // Layout: themed gradient page -> header card -> Basic Information -> Language -> Notifications demo -> actions.
  return (
    <View style={inShell ? { flex: 1 } : [{ flex: 1, backgroundColor: theme.page }, gradient(theme.pageGradient)]}>
      {/* Soft colour orb for depth behind the cards */}
      {!inShell && <View pointerEvents="none" style={{ position: 'absolute', top: -70, right: -80, width: 240, height: 240, borderRadius: 120, backgroundColor: theme.orb }} />}

    {/* Scrollable column of cards; each card rises in with rise(index) */}
    <ScrollView style={{ flex: 1, paddingHorizontal: inShell ? 0 : 20 }} contentContainerStyle={{ paddingBottom: 40 }} showsVerticalScrollIndicator={false}>

      {/* Profile Header Card (soft gradient banner) */}
      <Animated.View entering={rise(0)} style={[{
        backgroundColor: theme.hero,
        borderRadius: 24,
        padding: 16,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        borderWidth: 1,
        borderColor: theme.softBorder,
        shadowColor: theme.shadow,
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.12,
        shadowRadius: 18,
        elevation: 4,
        marginTop: 12,
        marginBottom: 16,
      }, gradient(theme.heroGradient)]}>
        {/* Profile Photo Avatar (Left Corner) */}
        <TouchableOpacity onPress={handleSelectPhoto} activeOpacity={0.8}>
          <View style={{
            width: 62,
            height: 62,
            borderRadius: 20,
            backgroundColor: '#ffffff',
            borderWidth: 2.5,
            borderColor: '#ffffff',
            alignItems: 'center',
            justifyContent: 'center',
            overflow: 'hidden',
            shadowColor: theme.shadow,
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.15,
            shadowRadius: 10,
            elevation: 3,
          }}>
            {profilePhoto ? (
              <Image source={{ uri: profilePhoto }} style={{ width: '100%', height: '100%' }} />
            ) : (
              <Text style={{ fontSize: 25, fontWeight: '900', color: theme.accentText }}>
                {fullName ? fullName.charAt(0).toUpperCase() : 'U'}
              </Text>
            )}
          </View>
        </TouchableOpacity>

        {/* User Info (In Between / Middle) */}
        <View style={{ flex: 1, marginLeft: 14, marginRight: 10, justifyContent: 'center' }}>
          <Text style={{ fontSize: 18, fontWeight: '900', color: '#0f172a', letterSpacing: -0.3 }} numberOfLines={1}>
            {fullName || 'User'}
          </Text>
          <Text style={{ fontSize: 12, fontWeight: '500', color: '#475569', marginTop: 3 }} numberOfLines={1}>
            {email}
          </Text>
          {!!role && (
            <View style={{
              flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start',
              marginTop: 8, paddingHorizontal: 9, paddingVertical: 4, borderRadius: 999,
              backgroundColor: '#ffffff', borderWidth: 1, borderColor: theme.softBorder,
            }}>
              <FontAwesome5 name={theme.roleIcon} size={10} color={theme.accentText} importantForAccessibility="no" accessibilityElementsHidden={true} />
              <Text style={{ fontSize: 10.5, fontWeight: '800', color: theme.accentText, letterSpacing: 0.3 }}>{theme.roleLabel}</Text>
            </View>
          )}
        </View>

        {/* Upload Photo Button (Right Corner) */}
        <TouchableOpacity
          onPress={handleSelectPhoto}
          activeOpacity={0.8}
          style={{
            backgroundColor: '#ffffff',
            borderWidth: 1,
            borderColor: theme.softBorder,
            paddingHorizontal: 12,
            paddingVertical: 9,
            borderRadius: 14,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Feather name="camera" size={16} color={theme.accentText} style={{ marginBottom: 2 }} />
          <Text style={{ fontSize: 9, fontWeight: '800', color: theme.accentText, textTransform: 'uppercase', letterSpacing: 0.5 }}>
            Upload
          </Text>
        </TouchableOpacity>
      </Animated.View>

      {/* Editable Account Information Card */}
      <Animated.View entering={rise(1)} style={portalCardStyle(theme)}>
        {/* Title row; the Details pill toggles the extra fields below */}
        <SectionHeader
          theme={theme}
          icon="user"
          title="Basic Information"
          right={
            <TouchableOpacity
              onPress={() => setIsExpanded(!isExpanded)}
              accessibilityRole="button"
              accessibilityLabel={isExpanded ? 'Collapse details' : 'Show all details'}
              style={{
                flexDirection: 'row', alignItems: 'center', gap: 4,
                paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999,
                backgroundColor: theme.soft, borderWidth: 1, borderColor: theme.softBorder,
              }}
            >
              <Text style={{ fontSize: 11.5, fontWeight: '800', color: theme.accentText }}>
                {isExpanded ? 'Collapse' : 'Details'}
              </Text>
              <Feather name={isExpanded ? 'chevron-up' : 'chevron-down'} size={13} color={theme.accentText} />
            </TouchableOpacity>
          }
        />

        {/* Form fields: name is editable, phone is read-only */}
        <View style={{ gap: 14 }}>
          {/* Full Name */}
          <View>
            <FieldLabel theme={theme} icon="user" label="Full Name" />
            <TextInput
              value={fullName}
              onChangeText={setFullName}
              placeholder="Your Name"
              placeholderTextColor="#94a3b8"
              style={inputStyle()}
            />
          </View>

          {/* Phone Number */}
          <View>
            <FieldLabel theme={theme} icon="phone" label="Mobile Number" />
            <TextInput
              value={phone}
              editable={false}
              style={inputStyle(false)}
            />
          </View>

          {/* Expanded Fields */}
          {isExpanded && (
            <Animated.View
              entering={reduceMotion ? undefined : FadeInDown.duration(260)}
              style={{ gap: 14, paddingTop: 14, borderTopWidth: 1, borderTopColor: '#eef2f7', marginTop: 4 }}
            >

              {/* Email Address */}
              <View>
                <FieldLabel theme={theme} icon="mail" label="Email Address" />
                <TextInput
                  value={email}
                  editable={false}
                  style={inputStyle(false)}
                />
              </View>

              {/* Date of Birth */}
              <View>
                <FieldLabel theme={theme} icon="calendar" label="Date of Birth" />
                <TextInput
                  value={dob}
                  onChangeText={setDob}
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor="#94a3b8"
                  style={inputStyle()}
                />
              </View>

              {/* Gender */}
              <View>
                <FieldLabel theme={theme} ionicon="transgender-outline" label="Gender" />
                <TextInput
                  value={gender}
                  onChangeText={setGender}
                  placeholder="Gender"
                  placeholderTextColor="#94a3b8"
                  style={inputStyle()}
                />
              </View>

              {/* City / Location */}
              <View>
                <FieldLabel theme={theme} icon="map-pin" label="City / State" />
                <TextInput
                  value={location}
                  onChangeText={setLocation}
                  placeholder="City, State"
                  placeholderTextColor="#94a3b8"
                  style={inputStyle()}
                />
              </View>

              {/* Highest Qualification Level */}
              <View>
                <FieldLabel theme={theme} icon="book-open" label="Highest Qualification Level" />
                <TextInput
                  value={educationLevel}
                  onChangeText={setEducationLevel}
                  placeholder="e.g. Undergraduate"
                  placeholderTextColor="#94a3b8"
                  style={inputStyle()}
                />
              </View>

              {/* Current Status / Occupation */}
              <View>
                <FieldLabel theme={theme} icon="briefcase" label="Current Status / Occupation" />
                <TextInput
                  value={occupation}
                  onChangeText={setOccupation}
                  placeholder="e.g. Working Professional"
                  placeholderTextColor="#94a3b8"
                  style={inputStyle()}
                />
              </View>

              {/* Government ID / Aadhar Number */}
              <View>
                <FieldLabel theme={theme} icon="shield" label="Aadhar / Government ID Number" />
                <TextInput
                  value={aadharNumber}
                  onChangeText={setAadharNumber}
                  placeholder="Government ID / Aadhar Number"
                  placeholderTextColor="#94a3b8"
                  style={inputStyle()}
                />
              </View>

              {/* Verification Proof Documents (Read Only Row style) */}
              <View style={{ borderTopWidth: 1, borderTopColor: '#eef2f7', paddingTop: 14, gap: 10 }}>
                <Text style={{ fontSize: 11.5, fontWeight: '800', color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 }}>Verification Documents</Text>

                {/* Shows the stored file names only; "View" is a simulated preview */}
                {[aadharImageProof || 'government_id_proof.jpg', certificationProof || 'educational_certificate.pdf'].map((fileName) => (
                  <View key={fileName} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: theme.soft, padding: 12, borderRadius: 14, borderWidth: 1, borderColor: theme.softBorder }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, marginRight: 8 }}>
                      <View style={{ width: 30, height: 30, borderRadius: 9, backgroundColor: '#ffffff', alignItems: 'center', justifyContent: 'center', marginRight: 10 }}>
                        <Feather name="file-text" size={15} color={theme.accentText} />
                      </View>
                      <Text style={{ fontSize: 12.5, fontWeight: '700', color: '#334155', flexShrink: 1 }} numberOfLines={1}>
                        {fileName}
                      </Text>
                    </View>
                    <TouchableOpacity
                      onPress={() => Alert.alert('Preview', 'Simulated document viewer opening.')}
                      accessibilityRole="button"
                      accessibilityLabel={`View ${fileName}`}
                      style={{ backgroundColor: theme.solid, paddingHorizontal: 14, paddingVertical: 6, borderRadius: 10 }}
                    >
                      <Text style={{ fontSize: 11.5, fontWeight: '800', color: '#ffffff' }}>View</Text>
                    </TouchableOpacity>
                  </View>
                ))}
              </View>

              {/* Scribe Specific Profile Details */}
              {role === 'scribe' && (
                <View style={{ borderTopWidth: 1, borderTopColor: '#eef2f7', paddingTop: 14, gap: 14 }}>
                  <Text style={{ fontSize: 11.5, fontWeight: '800', color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5 }}>Scribe Configuration</Text>

                  {/* First Time Scribe Switcher Option */}
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#f8fafc', padding: 12, borderRadius: 14, borderWidth: 1, borderColor: '#e2e8f0' }}>
                    <Text style={{ fontSize: 12.5, fontWeight: '700', color: '#334155' }}>First Time Scribe?</Text>
                    <View style={{ flexDirection: 'row', gap: 6 }}>
                      <Chip theme={theme} label="Yes" selected={firstTime} onPress={() => setFirstTime(true)} />
                      <Chip theme={theme} label="No" selected={!firstTime} onPress={() => setFirstTime(false)} />
                    </View>
                  </View>

                  {/* Languages Selector */}
                  <View>
                    <FieldLabel theme={theme} icon="globe" label="Preferred Scribe Languages" />
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                      {/* Tapping a chip toggles that language in selectedLanguages */}
                      {['English', 'Hindi', 'Gujarati'].map(langOption => {
                        const isSelected = selectedLanguages.includes(langOption);
                        return (
                          <Chip
                            key={langOption}
                            theme={theme}
                            label={langOption}
                            selected={isSelected}
                            onPress={() => {
                              if (isSelected) {
                                setSelectedLanguages(selectedLanguages.filter(l => l !== langOption));
                              } else {
                                setSelectedLanguages([...selectedLanguages, langOption]);
                              }
                            }}
                          />
                        );
                      })}
                    </View>
                  </View>

                  {/* Availability Slots */}
                  <View style={{ marginTop: 2 }}>
                    <FieldLabel theme={theme} icon="clock" label="Availability Slots" />
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                      {/* Tapping a chip toggles that slot in availabilitySlots */}
                      {['Morning', 'Afternoon', 'Evening'].map(slotOption => {
                        const isSelected = availabilitySlots.includes(slotOption);
                        return (
                          <Chip
                            key={slotOption}
                            theme={theme}
                            label={slotOption}
                            selected={isSelected}
                            onPress={() => {
                              if (isSelected) {
                                setAvailabilitySlots(availabilitySlots.filter(s => s !== slotOption));
                              } else {
                                setAvailabilitySlots([...availabilitySlots, slotOption]);
                              }
                            }}
                          />
                        );
                      })}
                    </View>
                  </View>
                </View>
              )}

            </Animated.View>
          )}

        </View>
      </Animated.View>

      {/* App Settings Card (Language Toggle Display) */}
      <Animated.View entering={rise(2)} style={portalCardStyle(theme)}>
        <SectionHeader theme={theme} icon="globe" title={t('language_display')} />
        <Text style={{ fontSize: 11.5, color: '#64748b', marginBottom: 12, marginTop: -6 }}>{t('select_language_desc')}</Text>

        {/* Dropdown trigger showing the current language */}
        <TouchableOpacity
          onPress={() => {
            setIsLangDropdownOpen(!isLangDropdownOpen);
            announceForAccessibility(!isLangDropdownOpen ? 'Language selection menu opened' : 'Language menu closed');
          }}
          accessible={true}
          accessibilityRole="button"
          accessibilityLabel={`App Language: ${lang}`}
          accessibilityHint="Double tap to open language selection menu"
          style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#f8fafc', borderWidth: 1.5, borderColor: isLangDropdownOpen ? theme.primary : '#e2e8f0', borderRadius: 14, paddingHorizontal: 14, paddingVertical: 11 }}
        >
          <Text style={{ fontSize: 13.5, fontWeight: '700', color: '#334155' }}>{lang}</Text>
          <Feather name={isLangDropdownOpen ? "chevron-up" : "chevron-down"} size={16} color={isLangDropdownOpen ? theme.accentText : '#64748b'} importantForAccessibility="no" accessibilityElementsHidden={true} />
        </TouchableOpacity>

        {/* Language options; choosing one calls changeLanguage (core/translation) and closes the list */}
        {isLangDropdownOpen && (
          <View style={{ marginTop: 8, backgroundColor: '#ffffff', borderWidth: 1.5, borderColor: theme.softBorder, borderRadius: 14, shadowColor: theme.shadow, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.08, shadowRadius: 10, elevation: 3, overflow: 'hidden' }}>
            {(['English', 'Hindi', 'Gujarati'] as LanguageType[]).map((l) => (
              <TouchableOpacity
                key={l}
                onPress={async () => {
                  await changeLanguage(l);
                  setIsLangDropdownOpen(false);
                  announceForAccessibility(`Language changed to ${l}`);
                }}
                accessible={true}
                accessibilityRole="button"
                accessibilityLabel={`${l} language`}
                style={{ paddingVertical: 12, paddingHorizontal: 14, borderBottomWidth: 1, borderBottomColor: '#f1f5f9', backgroundColor: lang === l ? theme.soft : '#ffffff' }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Text style={{ fontSize: 13.5, fontWeight: '700', color: lang === l ? theme.accentText : '#334155' }}>
                    {l}
                  </Text>
                  {lang === l && <Feather name="check-circle" size={16} color={theme.accentText} importantForAccessibility="no" accessibilityElementsHidden={true} />}
                </View>
              </TouchableOpacity>
            ))}
          </View>
        )}

      </Animated.View>

      {/* Notification settings card: haptic feedback switch */}
      <Animated.View entering={rise(3)} style={portalCardStyle(theme)}>
        <SectionHeader theme={theme} icon="bell" title="Notifications" />

        {/* Haptic feedback on/off (saved on the device, see core/haptics) */}
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 4 }}>
          <View style={{ width: 36, height: 36, borderRadius: 11, backgroundColor: theme.soft, alignItems: 'center', justifyContent: 'center', marginRight: 12 }}>
            <Feather name="smartphone" size={17} color={theme.accentText} importantForAccessibility="no" accessibilityElementsHidden={true} />
          </View>
          <Text style={{ flex: 1, fontSize: 13.5, fontWeight: '800', color: '#0f172a' }}>Haptic feedback</Text>
          <Switch
            value={hapticsOn}
            onValueChange={toggleHaptics}
            trackColor={{ false: '#cbd5e1', true: theme.primary }}
            thumbColor="#ffffff"
            {...({ activeThumbColor: '#ffffff' } as object)} // web-only prop: keep the knob white when on
            accessibilityLabel="Haptic feedback"
          />
        </View>
      </Animated.View>

      {/* Test alerts card: three round icon buttons in one row, a one-word label under each.
          Each plays its own haptic, then sends a demo notification. */}
      <Animated.View entering={rise(3)} style={portalCardStyle(theme)}>
        <SectionHeader
          theme={theme}
          icon="send"
          title="Test Alerts"
          right={
            <View style={{ backgroundColor: theme.soft, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, borderWidth: 1, borderColor: theme.softBorder }}>
              <Text style={{ fontSize: 10, fontWeight: '800', color: theme.accentText }}>TEST</Text>
            </View>
          }
        />

        <View style={{ flexDirection: 'row', justifyContent: 'space-around' }}>
          {NOTIF_TESTS.map((n) => (
            <Pressable
              key={n.type}
              onPress={() => handleSendTestNotification(n.type)}
              disabled={notifTriggering}
              accessibilityRole="button"
              accessibilityLabel={n.a11yLabel}
              accessibilityHint={n.a11yHint}
              style={({ pressed }) => ({
                alignItems: 'center',
                gap: 8,
                minWidth: 72,
                opacity: notifTriggering ? 0.6 : 1,
                transform: [{ scale: pressed ? 0.92 : 1 }],
              })}
            >
              <View style={{ width: 58, height: 58, borderRadius: 29, backgroundColor: n.bg, borderWidth: 1.5, borderColor: n.border, alignItems: 'center', justifyContent: 'center' }}>
                <Feather name={n.icon} size={22} color={n.color} importantForAccessibility="no" accessibilityElementsHidden={true} />
              </View>
              <Text style={{ fontSize: 12, fontWeight: '800', color: '#334155' }}>{n.label}</Text>
            </Pressable>
          ))}
        </View>

        {/* Status line for the last test notification (auto-clears after 5 s) */}
        {notifStatusText && (
          <View
            accessible={true}
            accessibilityRole="alert"
            style={{
              marginTop: 12, padding: 11, borderRadius: 12, flexDirection: 'row', alignItems: 'center', gap: 8,
              backgroundColor: notifIsError ? '#fef2f2' : theme.soft,
              borderWidth: 1, borderColor: notifIsError ? '#fecaca' : theme.softBorder,
            }}
          >
            <Feather
              name={notifIsError ? 'alert-circle' : notifTriggering ? 'loader' : 'check-circle'}
              size={15}
              color={notifIsError ? '#dc2626' : theme.accentText}
              importantForAccessibility="no"
              accessibilityElementsHidden={true}
            />
            <Text numberOfLines={1} style={{ fontSize: 12, color: '#334155', fontWeight: '600', flex: 1 }}>{notifStatusText}</Text>
          </View>
        )}
      </Animated.View>

      {/* Save, Sign Out and Delete Account share one entry animation */}
      <Animated.View entering={rise(4)}>
      {/* Primary Action Button (Save changes) */}
      <TouchableOpacity
        onPress={handleSaveSettings}
        disabled={updating}
        accessible={true}
        accessibilityRole="button"
        accessibilityLabel={updating ? "Saving settings, please wait" : "Save Settings"}
        accessibilityState={{ busy: updating, disabled: updating }}
        activeOpacity={0.85}
        style={[{ backgroundColor: theme.solid, paddingVertical: 15, borderRadius: 16, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8, shadowColor: theme.shadow, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.25, shadowRadius: 14, elevation: 5, marginBottom: 12 }, gradient(theme.buttonGradient)]}
      >
        {updating ? (
          <ActivityIndicator size="small" color="#ffffff" />
        ) : (
          <>
            <Feather name="check" size={16} color="#ffffff" importantForAccessibility="no" accessibilityElementsHidden={true} />
            <Text style={{ color: '#ffffff', fontWeight: '800', fontSize: 14.5 }}>{t('save_settings')}</Text>
          </>
        )}
      </TouchableOpacity>

      {/* Secondary Action Button (Log Out) */}
      <TouchableOpacity
        onPress={handleSignOut}
        accessible={true}
        accessibilityRole="button"
        accessibilityLabel="Sign Out of Anulekh account"
        style={{
          width: '100%',
          backgroundColor: '#fef2f2',
          borderWidth: 1.5,
          borderColor: '#fecaca',
          paddingVertical: 14,
          borderRadius: 16,
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'row',
          marginBottom: 10
        }}
        activeOpacity={0.85}
      >
        <Feather name="log-out" size={16} color="#b91c1c" style={{ marginRight: 8 }} importantForAccessibility="no" accessibilityElementsHidden={true} />
        <Text style={{ color: '#b91c1c', fontWeight: '900', fontSize: 14, letterSpacing: 0.3 }}>{t('sign_out')}</Text>
      </TouchableOpacity>

      {/* Delete Account (Apple App Store Guideline 5.1.1 compliant) */}
      <TouchableOpacity
        onPress={handleDeleteAccount}
        accessible={true}
        accessibilityRole="button"
        accessibilityLabel="Permanently Delete Account"
        style={{
          width: '100%',
          backgroundColor: 'transparent',
          borderWidth: 1,
          borderColor: '#fca5a5',
          borderStyle: 'dashed',
          paddingVertical: 13,
          borderRadius: 16,
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'row',
          marginBottom: 20
        }}
        activeOpacity={0.7}
      >
        <Feather name="trash-2" size={15} color="#dc2626" style={{ marginRight: 8 }} importantForAccessibility="no" accessibilityElementsHidden={true} />
        <Text style={{ color: '#dc2626', fontWeight: '700', fontSize: 13 }}>Delete Account Permanently</Text>
      </TouchableOpacity>
      </Animated.View>

    </ScrollView>
    </View>
  );
}
