/**
 * SharedSettingsView — the "Account" (settings) tab shared by the student and scribe portals.
 *
 * Rendered inside `<TabPane active={activeTab === 'settings'}>` (keep-alive tab body, see
 * components/ui/TabPane.tsx) by app/console/student/index.tsx, app/console/scribe/index.tsx and their
 * desktop counterparts components/pc_view/ConsoleStudentPC.tsx and ConsoleScribePC.tsx. The colour theme
 * follows the account's role (STUDENT_THEME or SCRIBE_THEME from core/portalTheme.ts).
 *
 * Sections: profile header with the profile photo (uploaded to storage, `profiles.avatar_url`), editable "Basic Information" (with scribe-only
 * languages / availability / first-time options), app language picker, a demo card for test push
 * notifications, and Save / Sign Out / Delete Account buttons.
 *
 * Data: `supabase` is the custom shim in core/supabase.ts that sends queries to the Rust/Axum backend
 * (`POST /api/query`); it is not real Supabase. Reads and updates the user's `profiles` row; account
 * deletion calls the backend directly at `POST /api/auth/delete-account`. The welcome flags live only
 * in AsyncStorage; the photo URL is cached there too (`profile_photo_<userId>`).
 */
import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, ActivityIndicator, Alert, Image, Pressable, Switch, Modal } from 'react-native';
import { Feather, FontAwesome5, Ionicons } from '@expo/vector-icons';
import Animated, { FadeInDown, useReducedMotion } from 'react-native-reanimated';
import { router } from 'expo-router';
import { supabase, API_URL } from '@/core/supabase';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useLanguage, LanguageType } from '@/core/translation';
import * as ImagePicker from 'expo-image-picker';
import { triggerTestNotification } from '@/core/notifications';
import { fileLabel, storageService } from '@/services/storageService';
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
 * - When in locked view mode: has the default slight grey shade (#f8fafc), text #475569.
 * - When in edit mode: editable fields transform to a clean white shade (#ffffff) with crisp border and subtle elevation.
 * - Always-locked fields (like verified phone) remain grey (#f1f5f9).
 */
const inputStyle = (isFieldEditable = true, inEditMode = false) => {
  const isCurrentlyEditing = isFieldEditable && inEditMode;
  return {
    backgroundColor: isCurrentlyEditing ? '#ffffff' : (isFieldEditable ? '#f8fafc' : '#f1f5f9'),
    borderWidth: 1.5,
    borderColor: isCurrentlyEditing ? '#cbd5e1' : '#e2e8f0',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 11,
    fontSize: 13.5,
    color: isCurrentlyEditing ? '#0f172a' : '#475569',
    fontWeight: '600' as const,
    ...(isCurrentlyEditing ? {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.05,
      shadowRadius: 3,
      elevation: 1,
    } : {}),
  };
};

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
  const scrollViewRef = useRef<ScrollView>(null);
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
  // Edit mode toggle: when false (view mode), details are locked with slight grey shade.
  // When true (edit mode), editable fields turn to white shade (#ffffff) with active styling.
  const [isEditing, setIsEditing] = useState(false);
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

  // DUMMY TOGGLE: Visual mockup toggle representing master push notification switch.
  // By default ON (true). Toggling this updates the UI switch state only and does NOT
  // turn off backend notifications, socket events, or native push listeners.
  const [allowNotifications, setAllowNotifications] = useState(true);

  // Sub-tab selection inside the Notification Settings card: 'settings' (Preferences) vs 'test' (Test Alerts)
  const [notifSubTab, setNotifSubTab] = useState<'settings' | 'test'>('settings');

  // ── 7-Day Account Deletion Hold & 2-Step Verification States (KISS Framework) ──
  interface DeletionHoldInfo {
    scheduledAt: string;
    deleteAt: string;
    daysLeft: number;
    hoursLeft: number;
  }
  const [deletionHold, setDeletionHold] = useState<DeletionHoldInfo | null>(null);

  // 2-Step verification modal states
  const [deleteModalVisible, setDeleteModalVisible] = useState(false);
  const [deleteStep, setDeleteStep] = useState<1 | 2>(1);
  const [verifyPassword, setVerifyPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [verifyError, setVerifyError] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);

  // ── Change / Forgot Password Modal States ──
  const [passwordModalVisible, setPasswordModalVisible] = useState(false);
  const [forgotOtp, setForgotOtp] = useState('');
  const [forgotNewPass, setForgotNewPass] = useState('');
  const [forgotConfirmPass, setForgotConfirmPass] = useState('');
  const [forgotStep, setForgotStep] = useState<1 | 2>(1);
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotError, setForgotError] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);

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
   * no session. The profile photo comes from the cache, then from `profiles.avatar_url`.
   */
  const fetchUserData = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.replace('/auth/login');
        return;
      }
      setUser(session.user);
      const rawEmail = session.user.email || '';
      const isSynthetic =
        rawEmail.toLowerCase().includes('@anulekh.app') ||
        rawEmail.toLowerCase().includes('@anulekh.internal') ||
        rawEmail.toLowerCase().startsWith('phone_') ||
        rawEmail.toLowerCase().startsWith('user_');
      setEmail(isSynthetic ? '' : rawEmail);

      // Check any active 7-day deletion hold for this account
      checkDeletionHold(session.user.id);

      // Cached photo first (instant), then the saved avatar_url from the profile below.
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
        // Profile photo saved in storage: show it on every device and refresh the local cache.
        if (profile.avatar_url) {
          setProfilePhoto(profile.avatar_url);
          AsyncStorage.setItem(`profile_photo_${session.user.id}`, profile.avatar_url).catch(() => {});
        }
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
   * Lets the user pick a square photo, uploads it straight to storage (kind `avatar`) and saves the
   * public URL in `profiles.avatar_url`, so it shows on every device. The URL is also cached in
   * AsyncStorage (`profile_photo_<userId>`), which the console headers read.
   */
  const handleSelectPhoto = async () => {
    if (!user) return;
    try {
      // Photo-library permission is required before opening the picker.
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Required', 'Please allow photo library access to upload a profile photo.');
        return;
      }
      // Square crop at reduced quality keeps the photo small.
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.6,
      });
      if (result.canceled || !result.assets?.length) return;
      const asset = result.assets[0];

      // Show it immediately, then upload and save.
      setProfilePhoto(asset.uri);
      const isPng = asset.uri.toLowerCase().endsWith('.png') || asset.mimeType === 'image/png';
      const res = await storageService.uploadFile(asset.uri, { kind: 'avatar', contentType: isPng ? 'image/png' : 'image/jpeg' });
      if (!res.publicUrl) {
        Alert.alert('Upload failed', res.error || 'Could not upload the photo.');
        return;
      }
      const { error } = await supabase.from('profiles').update({ avatar_url: res.publicUrl }).eq('id', user.id);
      if (error) throw error;
      setProfilePhoto(res.publicUrl);
      await AsyncStorage.setItem(`profile_photo_${user.id}`, res.publicUrl);
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to update the photo.');
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

      // Keep local session email in sync if updated
      if (email.trim() && user?.email !== email.trim()) {
        try {
          const val = await AsyncStorage.getItem('local_db_session');
          if (val) {
            const parsed = JSON.parse(val);
            if (parsed?.user) {
              parsed.user.email = email.trim();
              await AsyncStorage.setItem('local_db_session', JSON.stringify(parsed));
              setUser(parsed.user);
            }
          }
        } catch (_) {}
      }

      // Lock back into view mode on successful save
      setIsEditing(false);

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

  // =========================================================================
  // ── ACCOUNT DELETION HOLD (7 DAYS) & 2-STEP PASSWORD VERIFICATION (KISS) ──
  // =========================================================================

  /**
   * Loads and calculates any pending 7-day account deletion hold from AsyncStorage.
   * If the 7 days have already expired, triggers permanent account deletion.
   */
  const checkDeletionHold = async (userId: string) => {
    try {
      const raw = await AsyncStorage.getItem(`account_deletion_hold_${userId}`);
      if (!raw) {
        setDeletionHold(null);
        return;
      }
      const data = JSON.parse(raw);
      const now = Date.now();
      const deleteTime = new Date(data.deleteAt).getTime();
      const diffMs = deleteTime - now;

      // If the 7-day grace period has elapsed: execute permanent purge
      if (diffMs <= 0) {
        await fetch(`${API_URL}/api/auth/delete-account`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ user_id: userId })
        });
        await AsyncStorage.removeItem(`account_deletion_hold_${userId}`);
        await AsyncStorage.clear();
        await supabase.auth.signOut();
        router.replace('/landing');
        return;
      }

      // Calculate days and hours remaining
      const daysLeft = Math.floor(diffMs / (24 * 60 * 60 * 1000));
      const hoursLeft = Math.floor((diffMs % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
      setDeletionHold({
        scheduledAt: data.scheduledAt,
        deleteAt: data.deleteAt,
        daysLeft: Math.max(0, daysLeft),
        hoursLeft: Math.max(0, hoursLeft),
      });
    } catch (err) {
      console.warn('Error checking account deletion hold:', err);
    }
  };

  /**
   * Opens the 2-step account deletion verification modal starting at Step 1.
   */
  const handleOpenDeleteModal = () => {
    setDeleteStep(1);
    setVerifyPassword('');
    setVerifyError('');
    setDeleteModalVisible(true);
  };

  /**
   * Verifies user password against the auth service via /api/auth/signin.
   * Returns true if credentials are valid, false otherwise.
   */
  const verifyUserPassword = async (passwordToVerify: string): Promise<boolean> => {
    try {
      const loginIdentifier = user?.email || user?.phone || email || phone;
      const res = await fetch(`${API_URL}/api/auth/signin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          identifier: loginIdentifier,
          email: user?.email || email,
          phone: user?.phone || phone,
          password: passwordToVerify,
        }),
      });
      if (!res.ok) return false;
      const data = await res.json().catch(() => ({}));
      return !!data.user;
    } catch {
      return false;
    }
  };

  /**
   * Step 2 confirmation handler: verifies password, activates 7-day deletion hold,
   * stores timestamps in AsyncStorage, and updates UI status.
   */
  const handleConfirmScheduleDelete = async () => {
    if (!verifyPassword.trim()) {
      setVerifyError(t('enter_password'));
      return;
    }
    setIsVerifying(true);
    setVerifyError('');

    try {
      const isValid = await verifyUserPassword(verifyPassword.trim());
      if (!isValid) {
        setVerifyError(t('incorrect_password'));
        setIsVerifying(false);
        return;
      }

      // Valid password! Schedule deletion 7 days into the future
      const now = new Date();
      const deleteDate = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
      const holdPayload = {
        scheduledAt: now.toISOString(),
        deleteAt: deleteDate.toISOString()
      };

      if (user?.id) {
        await AsyncStorage.setItem(`account_deletion_hold_${user.id}`, JSON.stringify(holdPayload));
      }

      setDeletionHold({
        scheduledAt: holdPayload.scheduledAt,
        deleteAt: holdPayload.deleteAt,
        daysLeft: 7,
        hoursLeft: 0
      });

      setDeleteModalVisible(false);
      setVerifyPassword('');
      setDeleteStep(1);

      Alert.alert(
        t('status_hold_deletion'),
        t('hold_warning_text'),
        [{ text: 'OK' }]
      );
    } catch (err: any) {
      setVerifyError(err?.message || 'Verification failed. Please try again.');
    } finally {
      setIsVerifying(false);
    }
  };

  /**
   * Recovery Handler: Cancels the pending deletion hold immediately,
   * restores the account to full Active status, and clears the timer.
   */
  const handleCancelDeletion = async () => {
    try {
      if (user?.id) {
        await AsyncStorage.removeItem(`account_deletion_hold_${user.id}`);
      }
      setDeletionHold(null);
      Alert.alert(t('success'), t('account_recovered_success'));
    } catch (err) {
      Alert.alert(t('error'), 'Could not recover account. Please try again.');
    }
  };

  /**
   * Sends a 6-digit OTP to the user's email for password change/recovery.
   */
  const handleSendPasswordOtp = async () => {
    const targetEmail = (email || user?.email || '').trim();
    if (!targetEmail) {
      setForgotError('No email registered with this account.');
      return;
    }
    if (targetEmail.toLowerCase().endsWith('@anulekh.app')) {
      setForgotError('Password reset via OTP is only available for accounts registered with a real email address. For phone accounts, please contact support.');
      return;
    }
    setForgotLoading(true);
    setForgotError('');
    try {
      const res = await fetch(`${API_URL}/api/auth/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: targetEmail }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || data.error || 'Failed to send OTP.');
      setForgotStep(2);
      Alert.alert(t('success'), `Verification code sent to ${targetEmail}`);
    } catch (err: any) {
      setForgotError(err?.message || 'Failed to send verification code.');
    } finally {
      setForgotLoading(false);
    }
  };

  /**
   * Resets password using the received OTP via /api/auth/reset-password.
   */
  const handleResetPasswordWithOtp = async () => {
    if (!forgotOtp.trim()) {
      setForgotError(t('otp_code') + ' is required.');
      return;
    }
    if (forgotNewPass.length < 6) {
      setForgotError(t('new_password') + ' must be at least 6 characters.');
      return;
    }
    if (forgotNewPass !== forgotConfirmPass) {
      setForgotError('Passwords do not match.');
      return;
    }
    setForgotLoading(true);
    setForgotError('');
    try {
      const targetEmail = (email || user?.email || '').trim();
      const res = await fetch(`${API_URL}/api/auth/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: targetEmail,
          otp: forgotOtp.trim(),
          new_password: forgotNewPass,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || data.error || 'Failed to update password.');

      Alert.alert(t('success'), t('password_updated_success'));
      setPasswordModalVisible(false);
      setForgotStep(1);
      setForgotOtp('');
      setForgotNewPass('');
      setForgotConfirmPass('');
    } catch (err: any) {
      setForgotError(err?.message || 'Failed to update password. Please try again.');
    } finally {
      setForgotLoading(false);
    }
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
    <ScrollView ref={scrollViewRef} style={{ flex: 1, paddingHorizontal: inShell ? 0 : 20 }} contentContainerStyle={{ paddingBottom: 100 }} showsVerticalScrollIndicator={false}>

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
          {!!role && (
            <View style={{
              flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start',
              marginTop: 6, paddingHorizontal: 9, paddingVertical: 4, borderRadius: 999,
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
            {t('upload')}
          </Text>
        </TouchableOpacity>
      </Animated.View>

      {/* Editable Account Information Card (restored at top under profile photo & name) */}
      <Animated.View entering={rise(1)} style={portalCardStyle(theme)}>
        {/* Title row; Edit button + Details/Collapse pill */}
        <SectionHeader
          theme={theme}
          icon="user"
          title={t('basic_information')}
          right={
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              {/* Edit Mode Toggle Button */}
              <TouchableOpacity
                onPress={() => {
                  const next = !isEditing;
                  setIsEditing(next);
                  if (next) setIsExpanded(true);
                  haptic('tap');
                }}
                accessibilityRole="button"
                accessibilityLabel={isEditing ? t('editing_btn') : t('edit_btn')}
                style={{
                  flexDirection: 'row', alignItems: 'center', gap: 4,
                  paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999,
                  backgroundColor: isEditing ? theme.solid : theme.soft,
                  borderWidth: 1, borderColor: isEditing ? theme.solid : theme.softBorder,
                }}
              >
                <Feather name={isEditing ? 'check' : 'edit-2'} size={12} color={isEditing ? '#ffffff' : theme.accentText} />
                <Text style={{ fontSize: 11.5, fontWeight: '800', color: isEditing ? '#ffffff' : theme.accentText }}>
                  {isEditing ? t('editing_btn') : t('edit_btn')}
                </Text>
              </TouchableOpacity>

              {/* Details / Collapse pill */}
              <TouchableOpacity
                onPress={() => setIsExpanded(!isExpanded)}
                accessibilityRole="button"
                accessibilityLabel={isExpanded ? t('collapse') : t('details')}
                style={{
                  flexDirection: 'row', alignItems: 'center', gap: 4,
                  paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999,
                  backgroundColor: theme.soft, borderWidth: 1, borderColor: theme.softBorder,
                }}
              >
                <Text style={{ fontSize: 11.5, fontWeight: '800', color: theme.accentText }}>
                  {isExpanded ? t('collapse') : t('details')}
                </Text>
                <Feather name={isExpanded ? 'chevron-up' : 'chevron-down'} size={13} color={theme.accentText} />
              </TouchableOpacity>
            </View>
          }
        />

        {/* Edit mode active hint banner */}
        {isEditing && (
          <View style={{
            flexDirection: 'row', alignItems: 'center', gap: 6,
            backgroundColor: theme.soft, paddingHorizontal: 12, paddingVertical: 7,
            borderRadius: 12, borderWidth: 1, borderColor: theme.softBorder,
            marginBottom: 10,
          }}>
            <Feather name="edit-3" size={13} color={theme.accentText} />
            <Text style={{ fontSize: 11.5, fontWeight: '700', color: theme.accentText, flex: 1 }}>
              {t('edit_mode_active')}
            </Text>
          </View>
        )}

        {/* Form fields: Normal locked view has slight grey shade; edit mode gives pure white shade */}
        <View style={{ gap: 14 }}>
          {/* Full Name */}
          <View>
            <FieldLabel theme={theme} icon="user" label={t('full_name')} />
            <TextInput
              value={fullName}
              onChangeText={setFullName}
              editable={isEditing}
              placeholder={t('your_name')}
              placeholderTextColor="#94a3b8"
              style={inputStyle(true, isEditing)}
            />
          </View>

          {/* Mobile / Phone Number - STRICTLY NON-EDITABLE */}
          <View>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 5 }}>
              <FieldLabel theme={theme} icon="phone" label={t('mobile_number')} />
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#f1f5f9', paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6, borderWidth: 1, borderColor: '#e2e8f0' }}>
                <Feather name="lock" size={9} color="#64748b" />
                <Text style={{ fontSize: 9.5, fontWeight: '700', color: '#64748b' }}>Verified</Text>
              </View>
            </View>
            <TextInput
              value={phone}
              editable={false}
              style={[inputStyle(false, false), { backgroundColor: '#f1f5f9', color: '#64748b' }]}
            />
            <Text style={{ fontSize: 10.5, color: '#94a3b8', marginTop: 3 }}>
              {t('phone_non_editable')}
            </Text>
          </View>

          {/* Expanded Fields */}
          {isExpanded && (
            <Animated.View
              entering={reduceMotion ? undefined : FadeInDown.duration(260)}
              style={{ gap: 14, paddingTop: 14, borderTopWidth: 1, borderTopColor: '#eef2f7', marginTop: 4 }}
            >
              {/* Email Address - Primary Read-Only */}
              <View>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 5 }}>
                  <FieldLabel theme={theme} icon="mail" label={t('email_address_readonly')} />
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#f1f5f9', paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6, borderWidth: 1, borderColor: '#e2e8f0' }}>
                    <Feather name="lock" size={9} color="#64748b" />
                    <Text style={{ fontSize: 9.5, fontWeight: '700', color: '#64748b' }}>Primary</Text>
                  </View>
                </View>
                <TextInput
                  value={email}
                  placeholder="Not provided"
                  placeholderTextColor="#94a3b8"
                  editable={false}
                  style={[inputStyle(false, false), { backgroundColor: '#f1f5f9', color: email ? '#0f172a' : '#64748b' }]}
                />
              </View>

              {/* Date of Birth */}
              <View>
                <FieldLabel theme={theme} icon="calendar" label={t('dob')} />
                <TextInput
                  value={dob}
                  onChangeText={setDob}
                  editable={isEditing}
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor="#94a3b8"
                  style={inputStyle(true, isEditing)}
                />
              </View>

              {/* Gender */}
              <View>
                <FieldLabel theme={theme} ionicon="transgender-outline" label={t('gender')} />
                <TextInput
                  value={gender}
                  onChangeText={setGender}
                  editable={isEditing}
                  placeholder={t('gender')}
                  placeholderTextColor="#94a3b8"
                  style={inputStyle(true, isEditing)}
                />
              </View>

              {/* City / Location */}
              <View>
                <FieldLabel theme={theme} icon="map-pin" label={t('city_state')} />
                <TextInput
                  value={location}
                  onChangeText={setLocation}
                  editable={isEditing}
                  placeholder={t('city_state')}
                  placeholderTextColor="#94a3b8"
                  style={inputStyle(true, isEditing)}
                />
              </View>

              {/* Highest Qualification Level */}
              <View>
                <FieldLabel theme={theme} icon="book-open" label={t('highest_qualification')} />
                <TextInput
                  value={educationLevel}
                  onChangeText={setEducationLevel}
                  editable={isEditing}
                  placeholder={t('highest_qualification')}
                  placeholderTextColor="#94a3b8"
                  style={inputStyle(true, isEditing)}
                />
              </View>

              {/* Current Status / Occupation */}
              <View>
                <FieldLabel theme={theme} icon="briefcase" label={t('current_status_occupation')} />
                <TextInput
                  value={occupation}
                  onChangeText={setOccupation}
                  editable={isEditing}
                  placeholder={t('current_status_occupation')}
                  placeholderTextColor="#94a3b8"
                  style={inputStyle(true, isEditing)}
                />
              </View>

              {/* Government ID / Aadhar Number */}
              <View>
                <FieldLabel theme={theme} icon="shield" label={t('aadhar_gov_id')} />
                <TextInput
                  value={aadharNumber}
                  onChangeText={setAadharNumber}
                  editable={isEditing}
                  placeholder={t('aadhar_gov_id')}
                  placeholderTextColor="#94a3b8"
                  style={inputStyle(true, isEditing)}
                />
              </View>

              {/* Verification Proof Documents Preview */}
              <View style={{ borderTopWidth: 1, borderTopColor: '#eef2f7', paddingTop: 14, gap: 10 }}>
                <Text style={{ fontSize: 11.5, fontWeight: '800', color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 }}>
                  {t('verification_documents')}
                </Text>
                {[fileLabel(aadharImageProof || 'government_id_proof.jpg'), fileLabel(certificationProof || 'educational_certificate.pdf')].map((fileName, i) => (
                  <View key={i} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: theme.soft, padding: 12, borderRadius: 14, borderWidth: 1, borderColor: theme.softBorder }}>
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
                      <Text style={{ fontSize: 11.5, fontWeight: '800', color: '#ffffff' }}>{t('view')}</Text>
                    </TouchableOpacity>
                  </View>
                ))}
              </View>

              {/* Scribe Specific Configuration */}
              {role === 'scribe' && (
                <View style={{ borderTopWidth: 1, borderTopColor: '#eef2f7', paddingTop: 14, gap: 14 }}>
                  <Text style={{ fontSize: 11.5, fontWeight: '800', color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                    {t('scribe_config')}
                  </Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#f8fafc', padding: 12, borderRadius: 14, borderWidth: 1, borderColor: '#e2e8f0' }}>
                    <Text style={{ fontSize: 12.5, fontWeight: '700', color: '#334155' }}>{t('first_time_scribe')}</Text>
                    <View style={{ flexDirection: 'row', gap: 6 }}>
                      <Chip theme={theme} label={t('yes')} selected={firstTime} onPress={() => setFirstTime(true)} />
                      <Chip theme={theme} label={t('no')} selected={!firstTime} onPress={() => setFirstTime(false)} />
                    </View>
                  </View>
                  <View>
                    <FieldLabel theme={theme} icon="globe" label={t('preferred_scribe_languages')} />
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 }}>
                      {['English', 'Hindi', 'Gujarati'].map(langOpt => {
                        const isSel = selectedLanguages.includes(langOpt);
                        return (
                          <Chip
                            key={langOpt}
                            theme={theme}
                            label={langOpt}
                            selected={isSel}
                            onPress={() => setSelectedLanguages(isSel ? selectedLanguages.filter(l => l !== langOpt) : [...selectedLanguages, langOpt])}
                          />
                        );
                      })}
                    </View>
                  </View>
                  <View style={{ marginTop: 2 }}>
                    <FieldLabel theme={theme} icon="clock" label={t('availability_slots')} />
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 }}>
                      {[
                        { key: 'Morning', label: t('slot_morning') },
                        { key: 'Afternoon', label: t('slot_afternoon') },
                        { key: 'Evening', label: t('slot_evening') }
                      ].map(slotOpt => {
                        const isSel = availabilitySlots.includes(slotOpt.key);
                        return (
                          <Chip
                            key={slotOpt.key}
                            theme={theme}
                            label={slotOpt.label}
                            selected={isSel}
                            onPress={() => setAvailabilitySlots(isSel ? availabilitySlots.filter(s => s !== slotOpt.key) : [...availabilitySlots, slotOpt.key])}
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

      {/* Notification settings card: sub-tabs for Preferences (with master switch & haptics) and Test Alerts */}
      <Animated.View entering={rise(3)} style={portalCardStyle(theme)}>
        <SectionHeader
          theme={theme}
          icon="bell"
          title={t('notifications_settings')}
          right={
            <View style={{ backgroundColor: theme.soft, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, borderWidth: 1, borderColor: theme.softBorder }}>
              <Text style={{ fontSize: 10, fontWeight: '800', color: theme.accentText }}>
                {notifSubTab === 'test' ? 'TEST ALERTS' : 'PUSH'}
              </Text>
            </View>
          }
        />

        {/* Sub-tab navigation: switch between Settings/Preferences and Test Alerts */}
        <View style={{
          flexDirection: 'row',
          backgroundColor: '#f1f5f9',
          padding: 3,
          borderRadius: 12,
          marginBottom: 14,
        }}>
          <TouchableOpacity
            onPress={() => setNotifSubTab('settings')}
            style={{
              flex: 1,
              paddingVertical: 7,
              borderRadius: 9,
              alignItems: 'center',
              backgroundColor: notifSubTab === 'settings' ? '#ffffff' : 'transparent',
              shadowColor: notifSubTab === 'settings' ? '#000' : 'transparent',
              shadowOffset: { width: 0, height: 1 },
              shadowOpacity: notifSubTab === 'settings' ? 0.08 : 0,
              shadowRadius: 2,
              elevation: notifSubTab === 'settings' ? 1 : 0,
            }}
          >
            <Text style={{
              fontSize: 12,
              fontWeight: '800',
              color: notifSubTab === 'settings' ? theme.solid : '#64748b',
            }}>
              {t('preferences')}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => setNotifSubTab('test')}
            style={{
              flex: 1,
              paddingVertical: 7,
              borderRadius: 9,
              alignItems: 'center',
              backgroundColor: notifSubTab === 'test' ? '#ffffff' : 'transparent',
              shadowColor: notifSubTab === 'test' ? '#000' : 'transparent',
              shadowOffset: { width: 0, height: 1 },
              shadowOpacity: notifSubTab === 'test' ? 0.08 : 0,
              shadowRadius: 2,
              elevation: notifSubTab === 'test' ? 1 : 0,
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Text style={{
                fontSize: 12,
                fontWeight: '800',
                color: notifSubTab === 'test' ? theme.solid : '#64748b',
              }}>
                {t('test_alerts')}
              </Text>
              <View style={{
                backgroundColor: notifSubTab === 'test' ? theme.soft : '#e2e8f0',
                paddingHorizontal: 6,
                paddingVertical: 1.5,
                borderRadius: 6,
              }}>
                <Text style={{ fontSize: 9, fontWeight: '800', color: notifSubTab === 'test' ? theme.accentText : '#64748b' }}>
                  3
                </Text>
              </View>
            </View>
          </TouchableOpacity>
        </View>

        {notifSubTab === 'settings' ? (
          <View>
            {/* DUMMY TOGGLE: Master Push Notifications on/off toggle.
                - Default state: ON (true).
                - Dummy behavior: Updates local UI state so the user sees immediate visual feedback.
                - It does NOT turn off real push notifications or disable backend event dispatching,
                  ensuring background delivery and real-time updates are never accidentally broken. */}
            <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 6, justifyContent: 'space-between' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, paddingRight: 12 }}>
                <View style={{ width: 36, height: 36, borderRadius: 11, backgroundColor: theme.soft, alignItems: 'center', justifyContent: 'center', marginRight: 12 }}>
                  <Feather name="bell" size={17} color={theme.accentText} importantForAccessibility="no" accessibilityElementsHidden={true} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 13.5, fontWeight: '800', color: '#0f172a' }}>{t('app_notifications')}</Text>
                  <Text style={{ fontSize: 11, color: '#64748b', marginTop: 1 }}>{t('app_notifications_desc')}</Text>
                </View>
              </View>
              <Switch
                value={allowNotifications}
                onValueChange={setAllowNotifications}
                trackColor={{ false: '#cbd5e1', true: theme.primary }}
                thumbColor="#ffffff"
                {...({ activeThumbColor: '#ffffff' } as object)}
                accessibilityLabel={t('app_notifications')}
              />
            </View>

            <View style={{ height: 1, backgroundColor: '#f1f5f9', marginVertical: 6 }} />

            {/* Haptic feedback on/off (saved on the device, see core/haptics) */}
            <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 6, justifyContent: 'space-between' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, paddingRight: 12 }}>
                <View style={{ width: 36, height: 36, borderRadius: 11, backgroundColor: theme.soft, alignItems: 'center', justifyContent: 'center', marginRight: 12 }}>
                  <Feather name="smartphone" size={17} color={theme.accentText} importantForAccessibility="no" accessibilityElementsHidden={true} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 13.5, fontWeight: '800', color: '#0f172a' }}>{t('haptic_feedback')}</Text>
                </View>
              </View>
              <Switch
                value={hapticsOn}
                onValueChange={toggleHaptics}
                trackColor={{ false: '#cbd5e1', true: theme.primary }}
                thumbColor="#ffffff"
                {...({ activeThumbColor: '#ffffff' } as object)}
                accessibilityLabel={t('haptic_feedback')}
              />
            </View>
          </View>
        ) : (
          <View style={{ paddingTop: 4 }}>
            {/* Test alerts sub-tab: three round test buttons (Match, SOS, Reminder) shifted cleanly here */}
            <Text style={{ fontSize: 11.5, color: '#64748b', marginBottom: 14 }}>
              {lang === 'Hindi'
                ? 'अपने डिवाइस पर सूचनाएं कैसे दिखाई देती हैं, यह जांचने के लिए नीचे दिए गए अलर्ट बटन दबाएं:'
                : lang === 'Gujarati'
                ? 'તમારા ઉપકરણ પર સૂચનાઓ કેવી રીતે દેખાય છે તે ચકાસવા માટે નીચેના ચેતવણી બટનો દબાવો:'
                : 'Tap any alert button below to test how live notifications appear on your device:'}
            </Text>

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
                  <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: n.bg, borderWidth: 1.5, borderColor: n.border, alignItems: 'center', justifyContent: 'center' }}>
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
                  marginTop: 14, padding: 11, borderRadius: 12, flexDirection: 'row', alignItems: 'center', gap: 8,
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
          </View>
        )}
      </Animated.View>

      {/* ── ACCOUNT SETTINGS BLOCK (KISS Framework: Clear, modular account actions) ── */}
      <Animated.View entering={rise(4)} style={[portalCardStyle(theme), { marginBottom: 20 }]}>
        <SectionHeader theme={theme} icon="shield" title={t('account_settings')} />

        {/* Account Status Badge Row */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 4, marginBottom: 14 }}>
          <Text style={{ fontSize: 13, fontWeight: '700', color: '#475569' }}>{t('account_status')}</Text>
          {deletionHold ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#fef3c7', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, borderWidth: 1, borderColor: '#fde68a' }}>
              <Feather name="alert-triangle" size={12} color="#b45309" />
              <Text style={{ fontSize: 11, fontWeight: '800', color: '#b45309' }}>{t('status_hold_deletion')}</Text>
            </View>
          ) : (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#ecfdf5', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, borderWidth: 1, borderColor: '#a7f3d0' }}>
              <Feather name="check-circle" size={12} color="#059669" />
              <Text style={{ fontSize: 11, fontWeight: '800', color: '#059669' }}>{t('status_active')}</Text>
            </View>
          )}
        </View>

        {/* ── 1. EDIT ACCOUNT DETAILS BUTTON (Activates edit mode & smoothly scrolls to top details card) ── */}
        <TouchableOpacity
          onPress={() => {
            setIsEditing(true);
            setIsExpanded(true);
            haptic('tap');
            scrollViewRef.current?.scrollTo({ y: inShell ? 80 : 100, animated: true });
          }}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel={t('edit_account_details')}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            backgroundColor: isEditing ? theme.soft : '#f8fafc',
            borderWidth: 1.5,
            borderColor: isEditing ? theme.solid : '#e2e8f0',
            paddingVertical: 12,
            paddingHorizontal: 14,
            borderRadius: 14,
            marginBottom: 12,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1, marginRight: 8 }}>
            <View style={{ width: 34, height: 34, borderRadius: 10, backgroundColor: isEditing ? theme.solid : theme.soft, alignItems: 'center', justifyContent: 'center' }}>
              <Feather name="user-check" size={16} color={isEditing ? '#ffffff' : theme.accentText} />
            </View>
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text style={{ fontSize: 13, fontWeight: '800', color: '#0f172a' }}>
                  {t('edit_account_details')}
                </Text>
                {isEditing && (
                  <View style={{ backgroundColor: theme.solid, paddingHorizontal: 6, paddingVertical: 1.5, borderRadius: 6 }}>
                    <Text style={{ fontSize: 9, fontWeight: '800', color: '#ffffff' }}>EDITING</Text>
                  </View>
                )}
              </View>
              <Text style={{ fontSize: 10.5, color: '#64748b', marginTop: 1 }} numberOfLines={1}>
                {lang === 'Hindi'
                  ? 'नाम, ईमेल, शैक्षणिक विवरण और अन्य जानकारी अपडेट करें'
                  : lang === 'Gujarati'
                  ? 'નામ, ઈમેલ, શૈક્ષણિક વિગતો અને અન્ય માહિતી અપડેટ કરો'
                  : 'Update name, email, education & qualifications'}
              </Text>
            </View>
          </View>
          <Feather name="chevron-right" size={16} color={isEditing ? theme.accentText : '#94a3b8'} />
        </TouchableOpacity>

        {/* ── 2. CHANGE / FORGOT PASSWORD BUTTON ── */}
        <TouchableOpacity
          onPress={() => {
            setPasswordModalVisible(true);
            setForgotStep(1);
            setForgotError('');
          }}
          activeOpacity={0.8}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            backgroundColor: '#f8fafc',
            borderWidth: 1.5,
            borderColor: '#e2e8f0',
            paddingVertical: 12,
            paddingHorizontal: 14,
            borderRadius: 14,
            marginBottom: 12,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <View style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: theme.soft, alignItems: 'center', justifyContent: 'center' }}>
              <Feather name="key" size={15} color={theme.accentText} />
            </View>
            <Text style={{ fontSize: 13, fontWeight: '800', color: '#0f172a' }}>
              {t('change_forgot_password')}
            </Text>
          </View>
          <Feather name="chevron-right" size={16} color="#94a3b8" />
        </TouchableOpacity>

        {/* ── 3. DELETE ACCOUNT PERMANENTLY (IN AMBER) ── */}
        {deletionHold ? (
          <View style={{ backgroundColor: '#fffbeb', borderWidth: 1.5, borderColor: '#fde68a', borderRadius: 16, padding: 14 }}>
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
              <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: '#fef3c7', alignItems: 'center', justifyContent: 'center' }}>
                <Feather name="clock" size={18} color="#d97706" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 13, fontWeight: '800', color: '#92400e', marginBottom: 3 }}>
                  {deletionHold.daysLeft > 0 
                    ? `${deletionHold.daysLeft} ${t('days_left')}`
                    : `${deletionHold.hoursLeft} ${t('hours_left')}`}
                </Text>
                <Text style={{ fontSize: 11, color: '#78350f', lineHeight: 16, marginBottom: 10 }}>
                  {t('hold_warning_text')}
                </Text>

                <TouchableOpacity
                  onPress={handleCancelDeletion}
                  activeOpacity={0.85}
                  style={{
                    backgroundColor: '#d97706',
                    paddingVertical: 10,
                    paddingHorizontal: 14,
                    borderRadius: 12,
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexDirection: 'row',
                    gap: 6,
                  }}
                >
                  <Feather name="rotate-ccw" size={14} color="#ffffff" />
                  <Text style={{ color: '#ffffff', fontWeight: '800', fontSize: 12.5 }}>
                    {t('cancel_and_recover')}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        ) : (
          /* Normal Active Status: Amber Delete Account Button */
          <TouchableOpacity
            onPress={handleOpenDeleteModal}
            accessible={true}
            accessibilityRole="button"
            accessibilityLabel={t('delete_account_permanently')}
            style={{
              width: '100%',
              backgroundColor: '#fffbeb',
              borderWidth: 1.5,
              borderColor: '#fde68a',
              paddingVertical: 12,
              borderRadius: 14,
              alignItems: 'center',
              justifyContent: 'center',
              flexDirection: 'row',
            }}
            activeOpacity={0.8}
          >
            <Feather name="trash-2" size={15} color="#b45309" style={{ marginRight: 8 }} />
            <Text style={{ color: '#b45309', fontWeight: '800', fontSize: 13 }}>
              {t('delete_account_permanently')}
            </Text>
          </TouchableOpacity>
        )}
      </Animated.View>

      {/* ── OUTSIDE OF ACCOUNT SETTINGS BLOCK: SAVE CHANGES (AT BOTTOM) & LOGOUT (IN ROSE) ── */}
      <Animated.View entering={rise(5)} style={{ gap: 10, marginBottom: 36 }}>
        {/* Primary Save Changes Button (at bottom most) */}
        <TouchableOpacity
          onPress={handleSaveSettings}
          disabled={updating}
          accessible={true}
          accessibilityRole="button"
          accessibilityLabel={updating ? "Saving settings, please wait" : t('save_settings')}
          accessibilityState={{ busy: updating, disabled: updating }}
          activeOpacity={0.85}
          style={[{ backgroundColor: theme.solid, paddingVertical: 15, borderRadius: 16, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8, shadowColor: theme.shadow, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.25, shadowRadius: 14, elevation: 5 }, gradient(theme.buttonGradient)]}
        >
          {updating ? (
            <ActivityIndicator size="small" color="#ffffff" />
          ) : (
            <>
              <Feather name="check" size={16} color="#ffffff" />
              <Text style={{ color: '#ffffff', fontWeight: '800', fontSize: 14.5 }}>{t('save_settings')}</Text>
            </>
          )}
        </TouchableOpacity>

        {/* Log Out Button (Outside of block, in ROSE color, below Save button) */}
        <TouchableOpacity
          onPress={handleSignOut}
          accessible={true}
          accessibilityRole="button"
          accessibilityLabel={t('log_out')}
          style={{
            width: '100%',
            backgroundColor: '#fff1f2',
            borderWidth: 1.5,
            borderColor: '#fecdd3',
            paddingVertical: 14,
            borderRadius: 16,
            alignItems: 'center',
            justifyContent: 'center',
            flexDirection: 'row',
          }}
          activeOpacity={0.85}
        >
          <Feather name="log-out" size={16} color="#e11d48" style={{ marginRight: 8 }} />
          <Text style={{ color: '#e11d48', fontWeight: '800', fontSize: 14 }}>{t('log_out')}</Text>
        </TouchableOpacity>
      </Animated.View>

    </ScrollView>

    {/* ── 2-STEP ACCOUNT DELETION VERIFICATION MODAL ── */}
    <Modal
      visible={deleteModalVisible}
      transparent={true}
      animationType="fade"
      onRequestClose={() => {
        if (!isVerifying) setDeleteModalVisible(false);
      }}
    >
      <View style={{
        flex: 1,
        backgroundColor: 'rgba(15, 23, 42, 0.65)',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20,
      }}>
        <View style={{
          backgroundColor: '#ffffff',
          borderRadius: 24,
          width: '100%',
          maxWidth: 420,
          padding: 22,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 10 },
          shadowOpacity: 0.25,
          shadowRadius: 20,
          elevation: 10,
        }}>
          {deleteStep === 1 ? (
            /* ── STEP 1: IMPACT EXPLANATION & 7-DAY HOLD NOTICE ── */
            <View>
              <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: '#fef2f2', alignItems: 'center', justifyContent: 'center', marginBottom: 14 }}>
                <Feather name="alert-triangle" size={24} color="#dc2626" />
              </View>

              <Text style={{ fontSize: 17, fontWeight: '900', color: '#0f172a', marginBottom: 8 }}>
                {t('delete_modal_title')}
              </Text>

              <Text style={{ fontSize: 12.5, color: '#475569', lineHeight: 18, marginBottom: 20 }}>
                {t('delete_step1_desc')}
              </Text>

              <View style={{ gap: 10 }}>
                <TouchableOpacity
                  onPress={() => setDeleteStep(2)}
                  activeOpacity={0.85}
                  style={{
                    backgroundColor: '#dc2626',
                    paddingVertical: 13,
                    borderRadius: 14,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Text style={{ color: '#ffffff', fontWeight: '800', fontSize: 13.5 }}>
                    {t('delete_step1_btn')}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => setDeleteModalVisible(false)}
                  activeOpacity={0.85}
                  style={{
                    backgroundColor: '#f1f5f9',
                    paddingVertical: 12,
                    borderRadius: 14,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Text style={{ color: '#475569', fontWeight: '700', fontSize: 13 }}>
                    {t('cancel_action')}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            /* ── STEP 2: PASSWORD VERIFICATION ── */
            <View>
              <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: '#fef2f2', alignItems: 'center', justifyContent: 'center', marginBottom: 14 }}>
                <Feather name="lock" size={22} color="#dc2626" />
              </View>

              <Text style={{ fontSize: 17, fontWeight: '900', color: '#0f172a', marginBottom: 6 }}>
                {t('delete_step2_title')}
              </Text>

              <Text style={{ fontSize: 12, color: '#64748b', lineHeight: 17, marginBottom: 16 }}>
                {t('delete_step2_desc')}
              </Text>

              {/* Secure Password Input */}
              <View style={{
                flexDirection: 'row',
                alignItems: 'center',
                backgroundColor: '#f8fafc',
                borderWidth: 1.5,
                borderColor: verifyError ? '#f87171' : '#e2e8f0',
                borderRadius: 14,
                paddingHorizontal: 14,
                paddingVertical: 10,
                marginBottom: 8,
              }}>
                <Feather name="key" size={16} color="#94a3b8" style={{ marginRight: 10 }} />
                <TextInput
                  value={verifyPassword}
                  onChangeText={(text) => {
                    setVerifyPassword(text);
                    if (verifyError) setVerifyError('');
                  }}
                  placeholder={t('enter_password')}
                  placeholderTextColor="#94a3b8"
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                  style={{ flex: 1, fontSize: 13, color: '#0f172a' }}
                />
                <TouchableOpacity
                  onPress={() => setShowPassword(!showPassword)}
                  style={{ padding: 4 }}
                >
                  <Feather name={showPassword ? 'eye-off' : 'eye'} size={16} color="#64748b" />
                </TouchableOpacity>
              </View>

              {verifyError ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 14 }}>
                  <Feather name="alert-circle" size={13} color="#dc2626" />
                  <Text style={{ fontSize: 11.5, color: '#dc2626', fontWeight: '600' }}>
                    {verifyError}
                  </Text>
                </View>
              ) : (
                <View style={{ height: 10 }} />
              )}

              <View style={{ gap: 10, marginTop: 4 }}>
                <TouchableOpacity
                  onPress={handleConfirmScheduleDelete}
                  disabled={isVerifying}
                  activeOpacity={0.85}
                  style={{
                    backgroundColor: '#dc2626',
                    paddingVertical: 13,
                    borderRadius: 14,
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexDirection: 'row',
                    gap: 8,
                    opacity: isVerifying ? 0.7 : 1,
                  }}
                >
                  {isVerifying ? (
                    <ActivityIndicator size="small" color="#ffffff" />
                  ) : (
                    <>
                      <Feather name="trash-2" size={15} color="#ffffff" />
                      <Text style={{ color: '#ffffff', fontWeight: '800', fontSize: 13.5 }}>
                        {t('confirm_and_schedule_delete')}
                      </Text>
                    </>
                  )}
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => {
                    if (!isVerifying) {
                      setDeleteModalVisible(false);
                      setDeleteStep(1);
                      setVerifyPassword('');
                      setVerifyError('');
                    }
                  }}
                  disabled={isVerifying}
                  activeOpacity={0.85}
                  style={{
                    backgroundColor: '#f1f5f9',
                    paddingVertical: 12,
                    borderRadius: 14,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Text style={{ color: '#475569', fontWeight: '700', fontSize: 13 }}>
                    {t('cancel_action')}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>
      </View>
    </Modal>

    {/* ── CHANGE / FORGOT PASSWORD MODAL ── */}
    <Modal
      visible={passwordModalVisible}
      transparent={true}
      animationType="fade"
      onRequestClose={() => {
        if (!forgotLoading) setPasswordModalVisible(false);
      }}
    >
      <View style={{
        flex: 1,
        backgroundColor: 'rgba(15, 23, 42, 0.65)',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20,
      }}>
        <View style={{
          backgroundColor: '#ffffff',
          borderRadius: 24,
          width: '100%',
          maxWidth: 420,
          padding: 22,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 10 },
          shadowOpacity: 0.25,
          shadowRadius: 20,
          elevation: 10,
        }}>
          {forgotStep === 1 ? (
            /* ── STEP 1: SEND VERIFICATION CODE ── */
            <View>
              <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: theme.soft, alignItems: 'center', justifyContent: 'center', marginBottom: 14 }}>
                <Feather name="key" size={22} color={theme.accentText} />
              </View>

              <Text style={{ fontSize: 17, fontWeight: '900', color: '#0f172a', marginBottom: 6 }}>
                {t('change_forgot_password')}
              </Text>

              <Text style={{ fontSize: 12, color: '#64748b', lineHeight: 17, marginBottom: 16 }}>
                {lang === 'Hindi'
                  ? `हम आपके पंजीकृत ईमेल (${email || user?.email || ''}) पर 6-अंकीय सत्यापन कोड भेजेंगे:`
                  : lang === 'Gujarati'
                  ? `અમે તમારા રજિસ્ટર્ડ ઈમેલ (${email || user?.email || ''}) પર 6-અંકનો ચકાસણી કોડ મોકલીશું:`
                  : `We will send a 6-digit verification code to your registered email (${email || user?.email || ''}):`}
              </Text>

              {forgotError ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 14 }}>
                  <Feather name="alert-circle" size={13} color="#dc2626" />
                  <Text style={{ fontSize: 11.5, color: '#dc2626', fontWeight: '600' }}>
                    {forgotError}
                  </Text>
                </View>
              ) : null}

              <View style={{ gap: 10 }}>
                <TouchableOpacity
                  onPress={handleSendPasswordOtp}
                  disabled={forgotLoading}
                  activeOpacity={0.85}
                  style={{
                    backgroundColor: theme.solid,
                    paddingVertical: 13,
                    borderRadius: 14,
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexDirection: 'row',
                    gap: 8,
                    opacity: forgotLoading ? 0.7 : 1,
                  }}
                >
                  {forgotLoading ? (
                    <ActivityIndicator size="small" color="#ffffff" />
                  ) : (
                    <>
                      <Feather name="send" size={15} color="#ffffff" />
                      <Text style={{ color: '#ffffff', fontWeight: '800', fontSize: 13.5 }}>
                        {t('send_otp')}
                      </Text>
                    </>
                  )}
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => {
                    if (!forgotLoading) {
                      setPasswordModalVisible(false);
                      setForgotError('');
                    }
                  }}
                  disabled={forgotLoading}
                  activeOpacity={0.85}
                  style={{
                    backgroundColor: '#f1f5f9',
                    paddingVertical: 12,
                    borderRadius: 14,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Text style={{ color: '#475569', fontWeight: '700', fontSize: 13 }}>
                    {t('cancel_action')}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            /* ── STEP 2: ENTER OTP & NEW PASSWORD ── */
            <View>
              <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: theme.soft, alignItems: 'center', justifyContent: 'center', marginBottom: 14 }}>
                <Feather name="lock" size={22} color={theme.accentText} />
              </View>

              <Text style={{ fontSize: 17, fontWeight: '900', color: '#0f172a', marginBottom: 6 }}>
                {t('update_password')}
              </Text>

              <Text style={{ fontSize: 12, color: '#64748b', lineHeight: 17, marginBottom: 16 }}>
                {lang === 'Hindi'
                  ? 'कृपया ईमेल पर भेजा गया 6-अंकीय कोड और नया पासवर्ड दर्ज करें:'
                  : lang === 'Gujarati'
                  ? 'કૃપા કરીને ઈમેલ પર મોકલેલો 6-અંકનો કોડ અને નવો પાસવર્ડ દાખલ કરો:'
                  : 'Enter the 6-digit code sent to your email and your new password:'}
              </Text>

              {/* OTP Input */}
              <View style={{ marginBottom: 12 }}>
                <Text style={{ fontSize: 11, fontWeight: '700', color: '#64748b', marginBottom: 4 }}>
                  {t('otp_code')}
                </Text>
                <TextInput
                  value={forgotOtp}
                  onChangeText={setForgotOtp}
                  placeholder="6-digit OTP"
                  placeholderTextColor="#94a3b8"
                  keyboardType="number-pad"
                  maxLength={6}
                  style={inputStyle()}
                />
              </View>

              {/* New Password Input */}
              <View style={{ marginBottom: 12 }}>
                <Text style={{ fontSize: 11, fontWeight: '700', color: '#64748b', marginBottom: 4 }}>
                  {t('new_password')}
                </Text>
                <View style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  backgroundColor: '#f8fafc',
                  borderWidth: 1,
                  borderColor: '#e2e8f0',
                  borderRadius: 12,
                  paddingHorizontal: 12,
                  paddingVertical: 10,
                }}>
                  <TextInput
                    value={forgotNewPass}
                    onChangeText={setForgotNewPass}
                    placeholder="Min 6 characters"
                    placeholderTextColor="#94a3b8"
                    secureTextEntry={!showNewPassword}
                    autoCapitalize="none"
                    style={{ flex: 1, fontSize: 13, color: '#0f172a' }}
                  />
                  <TouchableOpacity onPress={() => setShowNewPassword(!showNewPassword)}>
                    <Feather name={showNewPassword ? 'eye-off' : 'eye'} size={16} color="#64748b" />
                  </TouchableOpacity>
                </View>
              </View>

              {/* Confirm Password Input */}
              <View style={{ marginBottom: 12 }}>
                <Text style={{ fontSize: 11, fontWeight: '700', color: '#64748b', marginBottom: 4 }}>
                  {t('confirm_new_password')}
                </Text>
                <TextInput
                  value={forgotConfirmPass}
                  onChangeText={setForgotConfirmPass}
                  placeholder="Re-enter new password"
                  placeholderTextColor="#94a3b8"
                  secureTextEntry={!showNewPassword}
                  autoCapitalize="none"
                  style={inputStyle()}
                />
              </View>

              {forgotError ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 14 }}>
                  <Feather name="alert-circle" size={13} color="#dc2626" />
                  <Text style={{ fontSize: 11.5, color: '#dc2626', fontWeight: '600' }}>
                    {forgotError}
                  </Text>
                </View>
              ) : null}

              <View style={{ gap: 10, marginTop: 4 }}>
                <TouchableOpacity
                  onPress={handleResetPasswordWithOtp}
                  disabled={forgotLoading}
                  activeOpacity={0.85}
                  style={{
                    backgroundColor: theme.solid,
                    paddingVertical: 13,
                    borderRadius: 14,
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexDirection: 'row',
                    gap: 8,
                    opacity: forgotLoading ? 0.7 : 1,
                  }}
                >
                  {forgotLoading ? (
                    <ActivityIndicator size="small" color="#ffffff" />
                  ) : (
                    <>
                      <Feather name="check" size={15} color="#ffffff" />
                      <Text style={{ color: '#ffffff', fontWeight: '800', fontSize: 13.5 }}>
                        {t('update_password')}
                      </Text>
                    </>
                  )}
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => {
                    if (!forgotLoading) {
                      setPasswordModalVisible(false);
                      setForgotStep(1);
                      setForgotError('');
                    }
                  }}
                  disabled={forgotLoading}
                  activeOpacity={0.85}
                  style={{
                    backgroundColor: '#f1f5f9',
                    paddingVertical: 12,
                    borderRadius: 14,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Text style={{ color: '#475569', fontWeight: '700', fontSize: 13 }}>
                    {t('cancel_action')}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>
      </View>
    </Modal>
    </View>
  );
}
