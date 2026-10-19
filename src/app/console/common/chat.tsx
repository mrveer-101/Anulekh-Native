/**
 * Chat room between a student and their scribe for one request.
 * Route: `/console/common/chat?requestId=<exam_requests.id>` (callers may also pass `type`, which
 * this screen currently ignores). Opened from the student/scribe Home, Requests, Plan and
 * Commitments views.
 *
 * Data (via the `supabase` shim, which calls the Rust/Axum backend rather than real Supabase):
 *   - reads `profiles` (current user and the other party) and the request from `exam_requests`
 *     (assignment requests are not looked up here);
 *   - reads/writes `chat_messages` for the request. There is no realtime socket: messages are
 *     re-fetched every 2 seconds by polling.
 *   - photos, PDFs and voice notes go straight to storage via `storageService.uploadFile` (kinds
 *     chat_image / chat_pdf / voice); only after a successful upload is the message saved with its
 *     `media_url`, `file_key`, `mime_type` and `size_bytes` (`sendMedia`). A banner shows progress / Retry.
 *
 * Notable behaviour:
 *   - Theme follows the viewer's role: Telegram-style blue for students, WhatsApp-style green for scribes.
 *   - Calling is time-restricted (see the comment near `canCall`): the phone icon only appears on the
 *     exam day and is locked once the exam is over.
 *   - The header's document icon (shown once a scribe is assigned) opens the scribe declaration letter.
 *   - Voice notes are recorded with expo-audio (m4a on phones, the browser's format on web).
 *   - Messages also understand an older inline format (`[audio/m4a;base64]...`, `[file/image;name=...;base64]...`,
 *     `[file/pdf;name=...;base64]...`) for rows that predate `message_type` / `media_url`.
 *   - Bottom tab bar is hidden to provide a focused, full-screen conversation view with a floating input bar.
 */
import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, KeyboardAvoidingView, Platform, ActivityIndicator, Alert, Linking, Modal, Image, LayoutAnimation, UIManager } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { router, useLocalSearchParams } from 'expo-router';
import { Feather, Ionicons } from '@expo/vector-icons';
import { supabase } from '@/core/supabase';
import { useLanguage } from '@/core/translation';
import { isExamToday, isExamPast } from '@/core/examDate';

import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { storageService, UploadKind } from '@/services/storageService';
import { RecordingPresets, requestRecordingPermissionsAsync, setAudioModeAsync, useAudioRecorder } from 'expo-audio';
import { ChatDoodlePattern } from '@/components/ui/ChatDoodlePattern';

/**
 * A row of the `chat_messages` table.
 * - `message` is the text, or the file name / "🎤 Voice Note" label for media messages
 *   (or a legacy inline-encoded payload, see the file header).
 * - `message_type` + `media_url` / `media_duration` describe media; `is_voice` / `voice_url` /
 *   `voice_duration` are older voice-specific columns that are still written and read as fallbacks.
 */
interface Message {
  id: number;
  request_id: number;
  sender_id: string;
  message: string;
  created_at: string;
  message_type?: 'text' | 'voice' | 'image' | 'pdf';
  media_url?: string;
  media_duration?: number;
  is_voice?: boolean;
  voice_url?: string;
  voice_duration?: number;
}

import { VoiceMessageBubble } from '../../../components/voice_msg/VoiceMessageBubble';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

/**
 * Chat room screen for a single exam request (see the file header for routing, data and behaviour).
 * Takes no props; reads `requestId` from the route.
 */
export default function ChatRoomScreen() {
  const insets = useSafeAreaInsets();
  // `t` translates UI strings into the user's chosen language.
  const { t } = useLanguage();
  const params = useLocalSearchParams<{ requestId: string }>();
  const scrollViewRef = useRef<ScrollView>(null);
  
  // Who is chatting about what: signed-in user + profile, the exam request, and the other party's display info.
  const [loading, setLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const [exam, setExam] = useState<any>(null);
  const [otherPartyName, setOtherPartyName] = useState('User');
  const [otherPartyRole, setOtherPartyRole] = useState('');
  // Passive online/offline status (defaults to offline without active polling)
  const [isOtherPartyOnline, setIsOtherPartyOnline] = useState<boolean>(false);
  
  // Message list (refreshed by polling) and the text currently in the composer.
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [isInputFocused, setIsInputFocused] = useState(false);
  const isTypingOrSelected = isInputFocused || newMessage.length > 0;

  const handleFocus = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setIsInputFocused(true);
  };

  const handleBlur = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setIsInputFocused(false);
  };

  const handleTextChange = (text: string) => {
    const wasEmpty = newMessage.length === 0;
    const isNowEmpty = text.length === 0;
    if (wasEmpty !== isNowEmpty && !isInputFocused) {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    }
    setNewMessage(text);
  };

  // Voice notes: expo-audio recorder (AAC .m4a on phones, webm/mp4 on web) + an elapsed-seconds timer.
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const [isRecording, setIsRecording] = useState(false);
  const [recordDuration, setRecordDuration] = useState(0);
  const recordInterval = useRef<any>(null);

  // Bottom Options and Modals State
  const [otherPartyPhone, setOtherPartyPhone] = useState('');
  const [otherProfileData, setOtherProfileData] = useState<any>(null);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const [isDeclarationOpen, setIsDeclarationOpen] = useState(false);
  const [isAttachmentModalOpen, setIsAttachmentModalOpen] = useState(false);
  // File being sent, shown above the composer: progress, or an error with Retry.
  const [upload, setUpload] = useState<{ label: string; progress: number; error: string | null; retry: () => void } | null>(null);

  // One-time setup per request: who am I, which request is this, and who is on the other side.
  useEffect(() => {
    /**
     * Loads the session, the user's `profiles` row and the `exam_requests` row, then works out the
     * other participant: for the student it is the assigned scribe (if any); for the scribe it is
     * the student. The other party's profile supplies the display name, phone (for calling) and
     * the details shown on the declaration letter. Redirects to `/auth/login` if signed out.
     */
    const initializeChat = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
          router.replace('/auth/login');
          return;
        }
        setCurrentUser(session.user);

        // Current user's profile (its `role` drives the theme and the bottom tab bar).
        const { data: profileData } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', session.user.id)
          .single();
        setProfile(profileData);

        // The request this chat belongs to.
        const { data: examData } = await supabase
          .from('exam_requests')
          .select('*')
          .eq('id', params.requestId)
          .single();
        setExam(examData);

        // Resolve the other participant. The viewer is "the student" if they own the request.
        if (examData) {
          const isStudent = session.user.id === examData.student_id;
          
          if (isStudent) {
            // Placeholder name until (and unless) the assigned scribe's profile loads.
            setOtherPartyName(examData.scribe_id ? 'Scribe' : 'Volunteer');
            setOtherPartyRole('Volunteer');
            
            if (examData.scribe_id) {
              const { data: scribeProfile } = await supabase
                .from('profiles')
                .select('*')
                .eq('id', examData.scribe_id)
                .single();
              if (scribeProfile) {
                setOtherPartyName(scribeProfile.official_name || scribeProfile.full_name);
                setOtherPartyPhone(scribeProfile.phone || '');
                setOtherProfileData(scribeProfile);
              }
            }
          } else {
            // Scribe viewing: the name comes straight from the request; the profile is only for phone/details.
            setOtherPartyName(examData.student_name);
            setOtherPartyRole('Student');
            
            const { data: studentProfile } = await supabase
              .from('profiles')
              .select('*')
              .eq('id', examData.student_id)
              .single();
            if (studentProfile) {
              setOtherPartyPhone(studentProfile.phone || '');
              setOtherProfileData(studentProfile);
            }
          }
        }
      } catch (err) {
        console.error('Error initializing chat:', err);
      } finally {
        setLoading(false);
      }
    };

    initializeChat();
  }, [params.requestId]);

  /** Fetches every `chat_messages` row for this request, oldest first, and replaces `messages`. Errors are logged only. */
  const loadMessages = async () => {
    if (!params.requestId) return;
    try {
      const { data } = await supabase
        .from('chat_messages')
        .select('*')
        .eq('request_id', params.requestId)
        .order('created_at', { ascending: true });
      
      if (data) {
        setMessages(data);
      }
    } catch (e) {
      console.error('Error loading messages:', e);
    }
  };

  // Poll for new messages every 2 s while the screen is mounted (no push/realtime channel exists).
  useEffect(() => {
    if (!params.requestId) return;
    loadMessages();
    const interval = setInterval(loadMessages, 2000);
    return () => clearInterval(interval);
  }, [params.requestId]);

  // Keep the newest message in view. Because each poll sets a new array, this also fires every 2 s.
  useEffect(() => {
    setTimeout(() => {
      scrollViewRef.current?.scrollToEnd({ animated: true });
    }, 100);
  }, [messages]);

  /**
   * Sends the composer text as a plain text message: clears the input immediately (optimistic),
   * inserts into `chat_messages`, then reloads. On failure the text is not restored.
   */
  const handleSendMessage = async () => {
    if (!newMessage.trim() || !currentUser || !exam) return;

    const msgText = newMessage.trim();
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setNewMessage('');

    try {
      const { error } = await supabase
        .from('chat_messages')
        .insert({
          request_id: exam.id,
          sender_id: currentUser.id,
          message: msgText,
          created_at: new Date().toISOString()
        });

      if (error) throw error;
      loadMessages();
    } catch (e) {
      console.error('Error sending message:', e);
    }
  };

  /** A photo, PDF or voice note to upload and send as one chat message. */
  type MediaItem = {
    uri: string;
    kind: UploadKind;
    contentType: string;
    messageType: 'image' | 'pdf' | 'voice';
    label: string;
    duration?: number;
  };

  /**
   * Uploads one file straight to storage (progress shown above the composer). Only when the upload
   * succeeded is the chat message saved, with the file's URL, key, type and size. On failure nothing
   * is saved and the banner offers Retry (each attempt gets a fresh upload link).
   */
  const sendMedia = async (item: MediaItem) => {
    if (!currentUser || !exam) return;
    const retry = () => sendMedia(item);
    setUpload({ label: item.label, progress: 0, error: null, retry });

    const res = await storageService.uploadFile(item.uri, {
      kind: item.kind,
      contentType: item.contentType,
      onProgress: (p) => setUpload((u) => (u ? { ...u, progress: p } : u)),
    });
    if (res.error || !res.publicUrl) {
      setUpload({ label: item.label, progress: 0, error: res.error || 'Upload failed.', retry });
      return;
    }

    const { error } = await supabase.from('chat_messages').insert({
      request_id: exam.id,
      sender_id: currentUser.id,
      message: item.label,
      message_type: item.messageType,
      media_url: res.publicUrl,
      file_key: res.fileKey,
      mime_type: res.mimeType,
      size_bytes: res.sizeBytes,
      media_duration: item.duration ?? 0,
      created_at: new Date().toISOString(),
    });
    if (error) {
      setUpload({ label: item.label, progress: 1, error: 'The file was uploaded but the message could not be saved.', retry });
      return;
    }
    setUpload(null);
    loadMessages();
  };

  /**
   * Image type from the file: phones use the file extension (the picker re-encodes to JPEG),
   * web uses the browser-reported type.
   */
  const imageType = (uri: string, reported?: string | null) => {
    if (Platform.OS === 'web' && reported) return reported;
    const ext = uri.split('?')[0].split('.').pop()?.toLowerCase();
    return ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg';
  };

  /** "Upload Photo": pick from the library, then send it as an 'image' message. */
  const handlePickAndSendImage = async () => {
    if (!currentUser || !exam) return;
    setIsAttachmentModalOpen(false);
    try {
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8 });
      if (result.canceled || !result.assets?.length) return;
      const asset = result.assets[0];
      await sendMedia({
        uri: asset.uri,
        kind: 'chat_image',
        contentType: imageType(asset.uri, asset.mimeType),
        messageType: 'image',
        label: asset.fileName || 'Photo',
      });
    } catch (err: any) {
      console.error('Error picking image:', err);
    }
  };

  /** "Upload PDF/Document": pick a PDF or image, then send it as a 'pdf' or 'image' message. */
  const handlePickAndSendDocument = async () => {
    if (!currentUser || !exam) return;
    setIsAttachmentModalOpen(false);
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: ['application/pdf', 'image/*'], copyToCacheDirectory: true });
      if (result.canceled || !result.assets?.length) return;
      const asset = result.assets[0];
      const isImg = !!asset.mimeType?.startsWith('image/');
      await sendMedia({
        uri: asset.uri,
        kind: isImg ? 'chat_image' : 'chat_pdf',
        contentType: isImg ? imageType(asset.uri, asset.mimeType) : 'application/pdf',
        messageType: isImg ? 'image' : 'pdf',
        label: asset.name || (isImg ? 'Photo.jpg' : 'Document.pdf'),
      });
    } catch (err: any) {
      console.error('Error picking document:', err);
    }
  };

  /** Voice note type from the recorded file (phones: .m4a; web: empty → the browser's own type). */
  const voiceType = (uri: string) => {
    const ext = uri.split('?')[0].split('.').pop()?.toLowerCase();
    if (ext === 'm4a' || ext === 'mp4') return 'audio/mp4';
    if (ext === 'webm') return 'audio/webm';
    if (ext === 'ogg') return 'audio/ogg';
    return '';
  };

  /** Mic button: asks for microphone access, then starts recording and the on-screen timer. */
  const startRecording = async () => {
    try {
      const permission = await requestRecordingPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Microphone needed', 'Allow microphone access to send voice notes.');
        return;
      }
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
      setIsRecording(true);
      setRecordDuration(0);
      recordInterval.current = setInterval(() => setRecordDuration((s) => s + 1), 1000);
    } catch (e) {
      console.error('Could not start recording:', e);
      Alert.alert('Recording failed', 'Could not start the microphone.');
    }
  };

  /** Stops the recorder and the timer; returns the recorded file's URI (or null). */
  const stopRecorder = async () => {
    clearInterval(recordInterval.current);
    setIsRecording(false);
    setRecordDuration(0);
    try {
      await recorder.stop();
    } catch {}
    setAudioModeAsync({ allowsRecording: false }).catch(() => {});
    return recorder.uri;
  };

  /** Tick button: stops recording and sends the note (upload first, then the message). */
  const stopAndSendRecording = async () => {
    const duration = recordDuration;
    const uri = await stopRecorder();
    if (!uri || duration < 1) return;
    await sendMedia({ uri, kind: 'voice', contentType: voiceType(uri), messageType: 'voice', label: 'Voice note', duration });
  };

  /** Trash button: stops recording and throws the note away. */
  const cancelRecording = async () => {
    await stopRecorder();
  };

  /** Formats a second count as `m:ss` for the recording timer. */
  const formatRecordTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" color="#2563eb" />
      </View>
    );
  }

  // Role of the viewer (from their profile) picks the colour theme and which portal's tabs to show.
  const isStudent = profile?.role === 'student';

  // Time-Restricted Calling: the call button only works on the day of the exam and
  // is disabled once the exam has ended. Fails open if the date can't be parsed.
  const examToday = isExamToday(exam?.exam_date);
  const examEnded = isExamPast(exam?.exam_date);
  const canCall = examToday && !examEnded;

  // Exact Brand Palette from Reference (Bright Blue & Orange Chat UI):
  // Bright White: #FFFFFF, Vibrant Blue: #1676D2, Bright Orange: #F07820, Cool White: #F3F8FC
  const themeColor = isStudent ? '#1676D2' : '#00a884'; // Vibrant Blue for student, WhatsApp Green for scribe
  const accentOrange = '#F07820'; // Bright Orange
  const screenBg = isStudent ? '#F3F8FC' : '#efeae2'; // Cool White
  const headerBg = isStudent ? '#FFFFFF' : '#00a884';
  const bubbleBg = isStudent ? '#1676D2' : '#00a884';
  const bubbleBgLight = isStudent ? 'rgba(22,118,210,0.08)' : 'rgba(0,168,132,0.08)';

  /** Header back arrow: pop the stack, or (deep link / web refresh) fall back to the user's portal home. */
  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace(isStudent ? '/console/student' : '/console/scribe');
    }
  };

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={{ flex: 1, backgroundColor: screenBg }}>
      <StatusBar style={isStudent ? 'dark' : 'light'} />
      
      {/* ── TOP FLOATING HEADER CARD ── */}
      <View style={{
        marginHorizontal: 14,
        marginTop: Platform.OS === 'ios' ? 4 : 8,
        marginBottom: 6,
        backgroundColor: headerBg,
        borderRadius: 24,
        paddingHorizontal: 14,
        paddingVertical: 12,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        shadowColor: '#0f172a',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.05,
        shadowRadius: 10,
        elevation: 3,
        borderWidth: 1,
        borderColor: isStudent ? '#E2E8F0' : 'transparent',
      }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, paddingRight: 8 }}>
          <TouchableOpacity 
            onPress={handleBack} 
            style={{ marginRight: 8, padding: 4 }}
          >
            <Feather name="arrow-left" size={22} color={isStudent ? '#1676D2' : 'white'} />
          </TouchableOpacity>

          <View style={{
            width: 44, height: 44, borderRadius: 22,
            backgroundColor: isStudent ? '#E3F2FD' : 'rgba(255,255,255,0.2)',
            alignItems: 'center', justifyContent: 'center',
            marginRight: 10, borderWidth: 1,
            borderColor: isStudent ? 'rgba(22,118,210,0.15)' : 'rgba(255,255,255,0.1)'
          }}>
            <Text style={{ fontFamily: 'Roboto', color: isStudent ? '#1676D2' : 'white', fontWeight: '900', fontSize: 18, textAlign: 'center', textAlignVertical: 'center', includeFontPadding: false }}>
              {otherPartyName.charAt(0).toUpperCase()}
            </Text>
          </View>

          <View style={{ flex: 1, justifyContent: 'center' }}>
            <Text style={{ fontFamily: 'Roboto', color: isStudent ? '#0F172A' : 'white', fontWeight: '800', fontSize: 16, lineHeight: 20 }} numberOfLines={1}>
              {otherPartyName}
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 2 }}>
              <View style={{
                width: 6,
                height: 6,
                borderRadius: 3,
                backgroundColor: isOtherPartyOnline
                  ? (isStudent ? '#16A34A' : '#4ADE80')
                  : (isStudent ? '#94A3B8' : 'rgba(255,255,255,0.55)'),
                marginRight: 5,
              }} />
              <Text style={{
                fontFamily: 'Roboto',
                color: isStudent
                  ? (isOtherPartyOnline ? '#16A34A' : '#64748B')
                  : (isOtherPartyOnline ? '#DCFCE7' : 'rgba(255,255,255,0.75)'),
                fontSize: 11,
                fontWeight: '700',
              }}>
                {(otherPartyRole ? (otherPartyRole.charAt(0).toUpperCase() + otherPartyRole.slice(1).toLowerCase()) : (isStudent ? 'Volunteer' : 'Student'))} • {isOtherPartyOnline ? 'Online' : 'Offline'}
              </Text>
            </View>
          </View>
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          {/* Call Icon Button — only available on the day of the exam (hidden otherwise) */}
          {examToday ? (
            canCall ? (
              <TouchableOpacity
                onPress={() => {
                  if (otherPartyPhone) {
                    Linking.openURL(`tel:${otherPartyPhone}`).catch(() => {
                      Alert.alert(t('error'), t('call_not_supported'));
                    });
                  } else {
                    Alert.alert(t('error'), t('phone_not_available'));
                  }
                }}
                style={{
                  width: 40, height: 40, borderRadius: 14,
                  backgroundColor: isStudent ? '#E3F2FD' : 'rgba(255,255,255,0.2)',
                  borderWidth: 1, borderColor: isStudent ? 'rgba(22,118,210,0.15)' : 'transparent',
                  alignItems: 'center', justifyContent: 'center'
                }}
              >
                <Feather name="phone" size={18} color={isStudent ? '#1676D2' : 'white'} />
              </TouchableOpacity>
            ) : (
              // Exam day but already ended → locked
              <TouchableOpacity
                onPress={() => Alert.alert('Calling Locked', 'Calling is disabled now that the exam has ended.')}
                style={{
                  width: 40, height: 40, borderRadius: 14,
                  backgroundColor: isStudent ? '#F1F5F9' : 'rgba(255,255,255,0.1)',
                  alignItems: 'center', justifyContent: 'center', opacity: 0.6
                }}
              >
                <Feather name="phone-off" size={18} color={isStudent ? '#94A3B8' : 'white'} />
              </TouchableOpacity>
            )
          ) : null}

          {/* Docs Icon Button (View Declaration) */}
          {exam?.scribe_id ? (
            <TouchableOpacity 
              onPress={() => setIsDeclarationOpen(true)}
              activeOpacity={0.75}
              accessibilityRole="button"
              accessibilityLabel="View Scribe Declaration Letter"
              style={{
                width: 40,
                height: 40,
                borderRadius: 14,
                backgroundColor: isStudent ? '#EFF6FF' : 'rgba(255,255,255,0.2)',
                borderWidth: 1.5,
                borderColor: isStudent ? '#DBEAFE' : 'rgba(255,255,255,0.3)',
                alignItems: 'center',
                justifyContent: 'center',
                shadowColor: '#0F172A',
                shadowOffset: { width: 0, height: 2 },
                shadowOpacity: isStudent ? 0.05 : 0,
                shadowRadius: 4,
                elevation: isStudent ? 2 : 0,
              }}
            >
              <Ionicons name="document-text" size={19} color={isStudent ? '#1D4ED8' : 'white'} />
            </TouchableOpacity>
          ) : null}
        </View>
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      >
        {/* Chat Wallpaper Decorative Background */}
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: screenBg,
            zIndex: 0,
          }}
        >
          <ChatDoodlePattern opacity={0.045} color="#000000" />
        </View>

        <ScrollView
          ref={scrollViewRef}
          style={{ flex: 1, backgroundColor: 'transparent' }}
          contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 10, paddingBottom: 24 }}
        >
          {/* Centered Date Pill ("TODAY") from reference */}
          <View style={{ alignItems: 'center', marginVertical: 10 }}>
            <View style={{
              backgroundColor: '#FFFFFF',
              paddingHorizontal: 16,
              paddingVertical: 4.5,
              borderRadius: 999,
              borderWidth: 1,
              borderColor: '#E2E8F0',
              shadowColor: '#0f172a',
              shadowOffset: { width: 0, height: 1 },
              shadowOpacity: 0.03,
              shadowRadius: 3,
              elevation: 1,
            }}>
              <Text style={{ fontFamily: 'Roboto', fontSize: 10, fontWeight: '800', color: '#64748B', letterSpacing: 0.8 }}>
                TODAY
              </Text>
            </View>
          </View>

          {messages.length === 0 ? (
            <View style={{ justifyContent: 'center', paddingVertical: 10, marginTop: 40, alignItems: 'center' }}>
              <View style={{ backgroundColor: 'rgba(255,255,255,0.9)', borderWidth: 1, borderColor: '#E2E8F0', paddingHorizontal: 18, paddingVertical: 14, borderRadius: 20, maxWidth: 280, shadowColor: '#0f172a', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.03, shadowRadius: 4, elevation: 1 }}>
                <Text style={{ fontFamily: 'Roboto', color: '#64748B', fontSize: 12.5, textAlign: 'center', lineHeight: 18, fontWeight: '600' }}>
                  {t('start_chat_desc')}
                </Text>
              </View>
            </View>
          ) : (
            messages.map((msg, index) => {
              const isMine = msg.sender_id === currentUser.id;
              const formattedTime = new Date(msg.created_at).toLocaleTimeString('en-IN', {
                hour: '2-digit',
                minute: '2-digit',
                hour12: true
              });

              const isVoice = msg.message_type === 'voice' || msg.is_voice || msg.message.startsWith('[audio/m4a;base64]');
              const voiceUrl = msg.media_url || msg.voice_url;
              const base64Audio = msg.message.startsWith('[audio/m4a;base64]') ? msg.message.substring('[audio/m4a;base64]'.length) : '';

              const isImage = msg.message_type === 'image' || msg.message.startsWith('[file/image;');
              let imageName = msg.message;
              let imageUrl = msg.media_url || '';
              if (msg.message.startsWith('[file/image;')) {
                const parts = msg.message.split(';base64]');
                imageName = parts[0].replace('[file/image;name=', '');
                if (!imageUrl) {
                  imageUrl = 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=500&auto=format&fit=crop&q=60';
                }
              }

              const isPdf = msg.message_type === 'pdf' || msg.message.startsWith('[file/pdf;');
              let pdfName = msg.message;
              let pdfUrl = msg.media_url || '';
              if (msg.message.startsWith('[file/pdf;')) {
                const parts = msg.message.split(';base64]');
                pdfName = parts[0].replace('[file/pdf;name=', '');
              }

              return (
                <View key={msg.id}>
                  <View
                    style={{ flexDirection: 'row', marginBottom: 10, justifyContent: isMine ? 'flex-end' : 'flex-start' }}
                  >
                    <View
                      style={{
                        maxWidth: '78%', paddingHorizontal: 13, paddingVertical: 8, borderRadius: 18,
                        shadowColor: isMine ? (isStudent ? '#1D4ED8' : bubbleBg) : '#0f172a',
                        shadowOffset: { width: 0, height: 1 },
                        shadowOpacity: isMine ? 0.12 : 0.04,
                        shadowRadius: 3,
                        elevation: 1,
                        borderWidth: isMine ? 0 : 1,
                        backgroundColor: isMine ? (isStudent ? '#1D4ED8' : bubbleBg) : '#FFFFFF',
                        borderColor: isMine ? 'transparent' : '#E2E8F0',
                        borderTopRightRadius: isMine ? 4 : 18,
                        borderTopLeftRadius: isMine ? 18 : 4,
                      }}
                    >
                      {isVoice ? (
                        <VoiceMessageBubble 
                          messageId={msg.id} 
                          audioUrl={voiceUrl}
                          base64Audio={base64Audio} 
                          duration={msg.media_duration || msg.voice_duration}
                          isMine={isMine} 
                          themeColor={themeColor} 
                          formattedTime={formattedTime} 
                        />
                      ) : isImage ? (
                        <View style={{ width: 200, gap: 6 }}>
                          <Image 
                            source={{ uri: imageUrl }} 
                            style={{ width: '100%', height: 130, borderRadius: 12, backgroundColor: '#f8fafc' }} 
                          />
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 2 }}>
                            <Feather name="image" size={12} color={isMine ? 'rgba(255,255,255,0.8)' : '#64748b'} />
                            <Text style={{ fontFamily: 'Roboto', fontSize: 11, fontWeight: '700', color: isMine ? '#fff' : '#1e293b' }} numberOfLines={1}>
                              {imageName}
                            </Text>
                          </View>
                        </View>
                      ) : isPdf ? (
                        <View style={{ width: 200, gap: 8 }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: isMine ? 'rgba(255,255,255,0.12)' : '#f8fafc', padding: 10, borderRadius: 12 }}>
                            <Feather name="file-text" size={24} color={isMine ? '#fff' : '#ef4444'} />
                            <View style={{ flex: 1 }}>
                              <Text style={{ fontFamily: 'Roboto', fontSize: 11, fontWeight: '800', color: isMine ? '#fff' : '#1e293b' }} numberOfLines={1}>
                                {pdfName}
                              </Text>
                              <Text style={{ fontFamily: 'Roboto', fontSize: 9, color: isMine ? 'rgba(255,255,255,0.7)' : '#64748b', marginTop: 1 }}>
                                Document
                              </Text>
                            </View>
                          </View>
                          <TouchableOpacity 
                            onPress={() => {
                              if (pdfUrl) {
                                Linking.openURL(pdfUrl).catch(() => Alert.alert('Error', 'Cannot open document'));
                              } else {
                                Alert.alert(t('download') || 'Download', `Downloading ${pdfName}...`);
                              }
                            }}
                            style={{ backgroundColor: isMine ? 'rgba(255,255,255,0.2)' : '#f1f5f9', paddingVertical: 8, borderRadius: 10, alignItems: 'center' }}
                          >
                            <Text style={{ fontFamily: 'Roboto', fontSize: 10, fontWeight: '800', color: isMine ? '#fff' : '#475569' }}>
                              {t('download')}
                            </Text>
                          </TouchableOpacity>
                        </View>
                      ) : (
                        <View style={{ minWidth: 64 }}>
                          <View style={{
                            flexDirection: 'row',
                            flexWrap: 'wrap',
                            alignItems: 'flex-end',
                            justifyContent: isMine ? 'flex-end' : 'flex-start',
                            rowGap: 2,
                          }}>
                            <Text style={{
                              fontFamily: 'Roboto',
                              fontSize: 14.5,
                              lineHeight: 20,
                              fontWeight: '400',
                              color: isMine ? '#FFFFFF' : '#0F172A',
                              marginRight: 8,
                              flexShrink: 1,
                            }}>
                              {msg.message}
                            </Text>

                            <View style={{
                              flexDirection: 'row',
                              alignItems: 'center',
                              alignSelf: 'flex-end',
                              marginLeft: 'auto',
                              gap: 3,
                              paddingBottom: 1,
                            }}>
                              <Text style={{
                                fontFamily: 'Roboto',
                                fontSize: 9.5,
                                fontWeight: '600',
                                color: isMine ? 'rgba(255,255,255,0.75)' : '#94A3B8',
                              }}>
                                {formattedTime}
                              </Text>
                              {isMine && (
                                <Ionicons
                                  name="checkmark-done"
                                  size={14}
                                  color="#93C5FD"
                                  style={{ marginLeft: 1 }}
                                />
                              )}
                            </View>
                          </View>
                        </View>
                      )}

                      {/* Timestamp & Read Status for Image & PDF */}
                      {(isImage || isPdf) && (
                        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: isMine ? 'flex-end' : 'flex-start', marginTop: 4, gap: 3 }}>
                          <Text style={{ fontFamily: 'Roboto', fontSize: 9.5, fontWeight: '600', color: isMine ? 'rgba(255,255,255,0.75)' : '#94A3B8' }}>
                            {formattedTime}
                          </Text>
                          {isMine && (
                            <Ionicons
                              name="checkmark-done"
                              size={14}
                              color="#93C5FD"
                              style={{ marginLeft: 1 }}
                            />
                          )}
                        </View>
                      )}
                    </View>
                  </View>
                </View>
              );
            })
          )}
        </ScrollView>

        {/* Floating Chat Input Block (Exact reference from Image 1 & 2) */}
        <View style={{
          marginHorizontal: 14,
          marginBottom: Math.max(insets.bottom, 12) + 4,
          backgroundColor: '#FFFFFF',
          borderRadius: 26,
          borderWidth: 1,
          borderColor: '#E2E8F0',
          shadowColor: '#0f172a',
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.06,
          shadowRadius: 10,
          elevation: 3,
          paddingHorizontal: 8,
          paddingVertical: 6,
        }}>
          {/* Upload status: progress while a file is being sent, or the error with Retry */}
          {upload && (
            <View
              accessibilityLiveRegion="polite"
              style={{ marginBottom: 6, padding: 10, borderRadius: 16, flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: upload.error ? '#fef2f2' : '#F3F8FC', borderWidth: 1, borderColor: upload.error ? '#fecaca' : '#E2E8F0' }}
            >
              <Feather name={upload.error ? 'alert-circle' : 'upload-cloud'} size={16} color={upload.error ? '#dc2626' : themeColor} />
              <View style={{ flex: 1 }}>
                <Text numberOfLines={1} style={{ fontFamily: 'Roboto', fontSize: 12, fontWeight: '700', color: '#0F172A' }}>
                  {upload.error ? `Couldn't send ${upload.label}` : `Sending ${upload.label}… ${Math.round(upload.progress * 100)}%`}
                </Text>
                {upload.error ? (
                  <Text numberOfLines={2} style={{ fontFamily: 'Roboto', fontSize: 11, color: '#b91c1c', marginTop: 2 }}>{upload.error}</Text>
                ) : (
                  <View style={{ height: 4, borderRadius: 2, backgroundColor: '#E2E8F0', marginTop: 6, overflow: 'hidden' }}>
                    <View style={{ height: '100%', width: `${Math.round(upload.progress * 100)}%`, backgroundColor: themeColor }} />
                  </View>
                )}
              </View>
              {upload.error && (
                <>
                  <TouchableOpacity onPress={upload.retry} accessibilityRole="button" accessibilityLabel="Retry upload" style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10, backgroundColor: themeColor }}>
                    <Text style={{ fontFamily: 'Roboto', color: '#fff', fontSize: 12, fontWeight: '800' }}>Retry</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => setUpload(null)} accessibilityRole="button" accessibilityLabel="Dismiss" style={{ padding: 4 }}>
                    <Feather name="x" size={16} color="#64748B" />
                  </TouchableOpacity>
                </>
              )}
            </View>
          )}

          {/* 1. INPUT ROW */}
          {isRecording ? (
            <View style={{ height: 40, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 6, width: '100%' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#EF4444' }} />
                <Text style={{ fontFamily: 'Roboto', color: '#64748B', fontSize: 13, fontWeight: '600' }}>
                  {t('recording')} {formatRecordTime(recordDuration)}
                </Text>
              </View>
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <TouchableOpacity onPress={cancelRecording} style={{ padding: 6, borderRadius: 16, backgroundColor: '#FEF2F2' }}>
                  <Feather name="trash-2" size={18} color="#EF4444" />
                </TouchableOpacity>
                <TouchableOpacity onPress={stopAndSendRecording} style={{ padding: 6, borderRadius: 16, backgroundColor: themeColor }}>
                  <Feather name="check" size={18} color="#FFFFFF" />
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, width: '100%' }}>
              {/* Attachment Button: Hidden when typing or input is selected */}
              {!isTypingOrSelected && (
                <TouchableOpacity
                  onPress={() => setIsAttachmentModalOpen(true)}
                  accessibilityRole="button"
                  accessibilityLabel="Attach file"
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 20,
                    flexShrink: 0,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: isStudent ? '#EBF3FE' : '#f8fafc',
                  }}
                >
                  <Feather
                    name="paperclip"
                    size={19}
                    color={themeColor}
                    style={{
                      textAlign: 'center',
                      textAlignVertical: 'center',
                      includeFontPadding: false,
                    }}
                  />
                </TouchableOpacity>
              )}

              {/* Text Message Input */}
              <TextInput
                value={newMessage}
                onChangeText={handleTextChange}
                onFocus={handleFocus}
                onBlur={handleBlur}
                placeholder={t('type_message')}
                placeholderTextColor="#94A3B8"
                style={{
                  flex: 1,
                  minWidth: 0,
                  fontFamily: 'Roboto',
                  height: 40,
                  fontSize: 13.5,
                  color: '#0F172A',
                  backgroundColor: isStudent ? '#F3F6FA' : '#f8fafc',
                  borderRadius: 14,
                  paddingHorizontal: 12,
                  paddingVertical: 0,
                  textAlignVertical: 'center',
                  borderWidth: 0,
                  ...(Platform.OS === 'web' ? { outlineStyle: 'none' } : {}),
                } as any}
                multiline={false}
              />

              {/* Voice Record Button: Hidden when typing or input is selected */}
              {!isTypingOrSelected && (
                <TouchableOpacity
                  onPress={startRecording}
                  accessibilityRole="button"
                  accessibilityLabel="Record voice message"
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 20,
                    flexShrink: 0,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: isStudent ? '#FFF0E6' : '#f8fafc',
                  }}
                >
                  <Feather
                    name="mic"
                    size={19}
                    color={isStudent ? '#F07820' : themeColor}
                    style={{
                      textAlign: 'center',
                      textAlignVertical: 'center',
                      includeFontPadding: false,
                    }}
                  />
                </TouchableOpacity>
              )}

              {/* Send Button */}
              <TouchableOpacity
                onPress={handleSendMessage}
                disabled={newMessage.trim() === ''}
                accessibilityRole="button"
                accessibilityLabel="Send message"
                style={{ 
                  width: 40,
                  height: 40,
                  borderRadius: 20,
                  flexShrink: 0,
                  alignItems: 'center',
                  justifyContent: 'center', 
                  backgroundColor: isStudent ? '#1676D2' : themeColor,
                }}
              >
                <Feather
                  name="send"
                  size={18}
                  color="#FFFFFF"
                  style={{
                    marginLeft: 2,
                    marginTop: -1,
                    textAlign: 'center',
                    textAlignVertical: 'center',
                    includeFontPadding: false,
                  }}
                />
              </TouchableOpacity>
            </View>
          )}
        </View>
      </KeyboardAvoidingView>

      {/* ── EXAMS DETAIL MODAL ── */}
      <Modal animationType="fade" transparent visible={isDetailsOpen} onRequestClose={() => setIsDetailsOpen(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(15,23,42,0.35)', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <View style={{ backgroundColor: '#fff', width: '100%', maxWidth: 360, borderRadius: 28, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(0,0,0,0.05)', shadowColor: '#000', shadowOffset: { width: 0, height: 20 }, shadowOpacity: 0.15, shadowRadius: 30, elevation: 15 }}>
            <View style={{ paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#f1f5f9', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Text style={{ fontFamily: 'Roboto', fontSize: 13, fontWeight: '800', color: '#0f172a', textTransform: 'uppercase' }}>{t('exam_details')}</Text>
              <TouchableOpacity onPress={() => setIsDetailsOpen(false)} style={{ padding: 4 }}>
                <Feather name="x" size={18} color="#64748b" />
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={{ padding: 20, gap: 14 }}>
              <View style={{ backgroundColor: bubbleBgLight, padding: 16, borderRadius: 16, borderWidth: 1, borderColor: isStudent ? 'rgba(37,99,235,0.18)' : 'rgba(5,150,105,0.18)', gap: 10 }}>
                <View>
                  <Text style={{ fontFamily: 'Roboto', fontSize: 9, fontWeight: '800', color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5 }}>{t('exam_level')}</Text>
                  <Text style={{ fontFamily: 'Roboto', fontSize: 15, fontWeight: '800', color: '#0f172a', marginTop: 2 }}>{exam?.subject}</Text>
                  <Text style={{ fontFamily: 'Roboto', fontSize: 12, color: '#64748b', marginTop: 1 }}>{exam?.exam_type}</Text>
                </View>

                <View style={{ height: 1, backgroundColor: isStudent ? 'rgba(37,99,235,0.1)' : 'rgba(5,150,105,0.1)' }} />

                <View>
                  <Text style={{ fontFamily: 'Roboto', fontSize: 9, fontWeight: '800', color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5 }}>{t('exam_date')}</Text>
                  <Text style={{ fontFamily: 'Roboto', fontSize: 13, fontWeight: '700', color: '#0f172a', marginTop: 2 }}>{exam?.exam_date || t('date_not_specified')}</Text>
                </View>

                <View style={{ height: 1, backgroundColor: isStudent ? 'rgba(37,99,235,0.1)' : 'rgba(5,150,105,0.1)' }} />

                <View>
                  <Text style={{ fontFamily: 'Roboto', fontSize: 9, fontWeight: '800', color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5 }}>{t('exam_venue')}</Text>
                  <Text style={{ fontFamily: 'Roboto', fontSize: 13, fontWeight: '700', color: '#0f172a', marginTop: 2 }}>{exam?.exam_venue || t('venue_not_specified')}</Text>
                </View>

                <View style={{ height: 1, backgroundColor: isStudent ? 'rgba(37,99,235,0.1)' : 'rgba(5,150,105,0.1)' }} />

                <View>
                  <Text style={{ fontFamily: 'Roboto', fontSize: 9, fontWeight: '800', color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5 }}>{t('exam_language')}</Text>
                  <Text style={{ fontFamily: 'Roboto', fontSize: 13, fontWeight: '700', color: '#0f172a', marginTop: 2 }}>{exam?.exam_language}</Text>
                </View>
              </View>
            </ScrollView>

            <View style={{ padding: 16, backgroundColor: '#f8fafc', borderTopWidth: 1, borderTopColor: '#f1f5f9' }}>
              <TouchableOpacity onPress={() => setIsDetailsOpen(false)} style={{ backgroundColor: themeColor, paddingVertical: 12, borderRadius: 12, alignItems: 'center' }}>
                <Text style={{ fontFamily: 'Roboto', color: 'white', fontWeight: '800', fontSize: 14 }}>{t('close')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── DECLARATION MODAL (Compact Official Certified Frame — No Scroll Needed) ── */}
      <Modal animationType="fade" transparent visible={isDeclarationOpen} onRequestClose={() => setIsDeclarationOpen(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(15,23,42,0.45)', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <View style={{
            backgroundColor: '#FFFFFF',
            width: '100%',
            maxWidth: 390,
            borderRadius: 20,
            overflow: 'hidden',
            borderWidth: 1,
            borderColor: '#E2E8F0',
            shadowColor: '#0F172A',
            shadowOffset: { width: 0, height: 12 },
            shadowOpacity: 0.14,
            shadowRadius: 24,
            elevation: 10,
          }}>
            {/* Header */}
            <View style={{
              paddingHorizontal: 16,
              paddingVertical: 10,
              borderBottomWidth: 1,
              borderBottomColor: '#F1F5F9',
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              backgroundColor: '#FFFFFF',
            }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <View style={{
                  width: 30,
                  height: 30,
                  borderRadius: 10,
                  backgroundColor: isStudent ? '#EFF6FF' : '#F0FDF4',
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderWidth: 1,
                  borderColor: isStudent ? '#DBEAFE' : '#DCFCE7',
                }}>
                  <Ionicons name="document-text" size={16} color={isStudent ? '#1D4ED8' : '#16A34A'} />
                </View>
                <View>
                  <Text style={{ fontFamily: 'Roboto', fontSize: 8.5, fontWeight: '800', color: '#64748B', textTransform: 'uppercase', letterSpacing: 0.8 }}>
                    Anulekh Certification
                  </Text>
                  <Text style={{ fontFamily: 'Roboto', fontSize: 13.5, fontWeight: '800', color: '#0F172A', letterSpacing: -0.2 }}>
                    {t('scribe_declaration')}
                  </Text>
                </View>
              </View>

              <TouchableOpacity
                onPress={() => setIsDeclarationOpen(false)}
                activeOpacity={0.7}
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 14,
                  backgroundColor: '#F1F5F9',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Feather name="x" size={15} color="#64748B" />
              </TouchableOpacity>
            </View>

            {/* Document Content - Compact Fitted Frame (No Scroll Needed) */}
            <View style={{ paddingHorizontal: 16, paddingVertical: 12, gap: 8 }}>
              {/* Letterhead & Reference Header */}
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Text style={{ fontFamily: 'Roboto', fontWeight: '900', fontSize: 14, color: isStudent ? '#1D4ED8' : '#16A34A' }}>
                    Anulekh Portal
                  </Text>
                  <Text style={{ fontFamily: 'Roboto', fontSize: 8.5, color: '#64748B', fontWeight: '700', textTransform: 'uppercase' }}>
                    • {t('official_cert_letter')}
                  </Text>
                </View>
                <View style={{ backgroundColor: '#F1F5F9', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 5 }}>
                  <Text style={{ fontFamily: 'Roboto', fontSize: 8.5, fontWeight: '700', color: '#475569' }}>
                    REF #ANU-DECL-{exam?.id || '2026'}
                  </Text>
                </View>
              </View>

              {/* Exam Details Card */}
              <View style={{
                backgroundColor: '#F8FAFC',
                padding: 10,
                borderRadius: 12,
                borderWidth: 1,
                borderColor: '#E2E8F0',
                gap: 3,
              }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                    <Ionicons name="school" size={12} color={isStudent ? '#1D4ED8' : '#16A34A'} />
                    <Text style={{ fontFamily: 'Roboto', fontSize: 8.5, fontWeight: '800', color: '#64748B', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                      {t('exam_details')}
                    </Text>
                  </View>
                  <Text style={{ fontFamily: 'Roboto', fontSize: 9.5, color: '#64748B', fontWeight: '600' }}>
                    {exam?.exam_type || 'Standard Examination'}
                  </Text>
                </View>

                <Text style={{ fontFamily: 'Roboto', fontSize: 13, color: '#0F172A', fontWeight: '800' }} numberOfLines={1}>
                  {exam?.subject || 'Exam Request'}
                </Text>

                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 1 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, flex: 1 }}>
                    <Feather name="calendar" size={11} color="#64748B" />
                    <Text style={{ fontFamily: 'Roboto', fontSize: 10, color: '#475569' }} numberOfLines={1}>
                      {exam?.exam_date || 'Scheduled Date'}
                    </Text>
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, flex: 1, justifyContent: 'flex-end' }}>
                    <Feather name="map-pin" size={11} color="#64748B" />
                    <Text style={{ fontFamily: 'Roboto', fontSize: 10, color: '#475569' }} numberOfLines={1}>
                      {exam?.exam_venue || 'Designated Center'}
                    </Text>
                  </View>
                </View>
              </View>

              {/* Parties Section (Side-by-side columns: Student & Scribe) */}
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {/* Candidate / Student */}
                <View style={{
                  flex: 1,
                  backgroundColor: '#FFFFFF',
                  borderWidth: 1,
                  borderColor: '#E2E8F0',
                  borderRadius: 12,
                  padding: 8,
                }}>
                  <Text style={{ fontFamily: 'Roboto', fontSize: 8, fontWeight: '800', color: '#64748B', textTransform: 'uppercase', letterSpacing: 0.4 }}>
                    {t('candidate_student')}
                  </Text>
                  <Text style={{ fontFamily: 'Roboto', fontSize: 12, color: '#0F172A', fontWeight: '800', marginTop: 2 }} numberOfLines={1}>
                    {isStudent ? profile?.full_name : otherProfileData?.full_name}
                  </Text>
                  <Text style={{ fontFamily: 'Roboto', fontSize: 9.5, color: '#64748B', marginTop: 1 }} numberOfLines={1}>
                    Grade: {exam?.education_grade || t('status_verified_label')}
                  </Text>
                </View>

                {/* Volunteer / Scribe */}
                <View style={{
                  flex: 1,
                  backgroundColor: '#FFFFFF',
                  borderWidth: 1,
                  borderColor: '#E2E8F0',
                  borderRadius: 12,
                  padding: 8,
                }}>
                  <Text style={{ fontFamily: 'Roboto', fontSize: 8, fontWeight: '800', color: '#64748B', textTransform: 'uppercase', letterSpacing: 0.4 }}>
                    {t('volunteer_scribe')}
                  </Text>
                  <Text style={{ fontFamily: 'Roboto', fontSize: 12, color: '#0F172A', fontWeight: '800', marginTop: 2 }} numberOfLines={1}>
                    {isStudent ? otherProfileData?.full_name : profile?.full_name}
                  </Text>
                  <Text style={{ fontFamily: 'Roboto', fontSize: 9.5, color: '#64748B', marginTop: 1 }} numberOfLines={1}>
                    {t('occupation_label')}{isStudent ? (otherProfileData?.occupation || t('student_scribe_fallback')) : (profile?.occupation || t('student_scribe_fallback'))}
                  </Text>
                </View>
              </View>

              {/* Legal Declaration / Undertaking */}
              <View style={{
                backgroundColor: isStudent ? 'rgba(29, 78, 216, 0.05)' : 'rgba(22, 163, 74, 0.05)',
                borderWidth: 1,
                borderColor: isStudent ? 'rgba(29, 78, 216, 0.15)' : 'rgba(22, 163, 74, 0.15)',
                paddingHorizontal: 10,
                paddingVertical: 7,
                borderRadius: 12,
              }}>
                <Text style={{
                  fontFamily: 'Roboto',
                  fontSize: 9.5,
                  color: isStudent ? '#1D4ED8' : '#16A34A',
                  lineHeight: 14,
                  fontStyle: 'italic',
                  textAlign: 'center',
                  fontWeight: '500',
                }}>
                  {t('declaration_agreement_text')}
                </Text>
              </View>

              {/* Official Seal / Audit Stamp */}
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 2 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                  <Ionicons name="shield-checkmark" size={13} color="#10B981" />
                  <Text style={{ fontFamily: 'Roboto', fontSize: 9.5, color: '#059669', fontWeight: '800' }}>
                    {t('verified_scribe_profile')}
                  </Text>
                </View>
                <Text style={{ fontFamily: 'Roboto', fontSize: 8, color: '#64748B', fontWeight: '800', letterSpacing: 0.5 }}>
                  ANULEKH ONLINE AUDITED
                </Text>
              </View>
            </View>

            {/* Footer Buttons */}
            <View style={{
              paddingHorizontal: 14,
              paddingVertical: 10,
              backgroundColor: '#F8FAFC',
              borderTopWidth: 1,
              borderTopColor: '#F1F5F9',
              flexDirection: 'row',
              gap: 10,
            }}>
              <TouchableOpacity
                onPress={() => setIsDeclarationOpen(false)}
                activeOpacity={0.7}
                style={{
                  flex: 1,
                  backgroundColor: '#FFFFFF',
                  borderWidth: 1.5,
                  borderColor: '#E2E8F0',
                  paddingVertical: 9,
                  borderRadius: 12,
                  alignItems: 'center',
                }}
              >
                <Text style={{ fontFamily: 'Roboto', color: '#475569', fontWeight: '700', fontSize: 12.5 }}>
                  {t('close')}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => Alert.alert(t('download'), t('download_declaration'))}
                activeOpacity={0.8}
                style={{
                  flex: 1.3,
                  backgroundColor: isStudent ? '#1D4ED8' : '#16A34A',
                  paddingVertical: 9,
                  borderRadius: 12,
                  alignItems: 'center',
                  flexDirection: 'row',
                  justifyContent: 'center',
                  gap: 6,
                  shadowColor: '#0F172A',
                  shadowOffset: { width: 0, height: 2 },
                  shadowOpacity: 0.1,
                  shadowRadius: 6,
                  elevation: 2,
                }}
              >
                <Feather name="download" size={14} color="#FFFFFF" />
                <Text style={{ fontFamily: 'Roboto', color: '#FFFFFF', fontWeight: '800', fontSize: 12.5 }}>
                  {t('download')}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>


      {/* ── ATTACHMENT CHOICE MODAL ── */}
      <Modal animationType="slide" transparent visible={isAttachmentModalOpen} onRequestClose={() => setIsAttachmentModalOpen(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(15,23,42,0.3)', justifyContent: 'flex-end' }}>
          <View style={{ backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, shadowColor: '#000', shadowOffset: { width: 0, height: -10 }, shadowOpacity: 0.1, shadowRadius: 10, elevation: 10 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
              <Text style={{ fontFamily: 'Roboto', fontSize: 16, fontWeight: '800', color: '#0f172a' }}>{t('send_attachment')}</Text>
              <TouchableOpacity onPress={() => setIsAttachmentModalOpen(false)} style={{ padding: 4 }}>
                <Feather name="x" size={20} color="#64748b" />
              </TouchableOpacity>
            </View>

            <View style={{ flexDirection: 'row', gap: 16, marginBottom: 24 }}>
              <TouchableOpacity 
                onPress={handlePickAndSendImage}
                style={{ flex: 1, backgroundColor: '#f8fafc', borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 16, padding: 16, alignItems: 'center', gap: 8 }}
              >
                <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(37,99,235,0.08)', alignItems: 'center', justifyContent: 'center' }}>
                  <Feather name="image" size={20} color="#2563eb" />
                </View>
                <Text style={{ fontFamily: 'Roboto', fontSize: 12, fontWeight: '700', color: '#1e293b' }}>{t('select_photo')}</Text>
                <Text style={{ fontFamily: 'Roboto', fontSize: 9, color: '#64748b' }}>Photo / Image</Text>
              </TouchableOpacity>

              <TouchableOpacity 
                onPress={handlePickAndSendDocument}
                style={{ flex: 1, backgroundColor: '#f8fafc', borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 16, padding: 16, alignItems: 'center', gap: 8 }}
              >
                <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(239,68,68,0.08)', alignItems: 'center', justifyContent: 'center' }}>
                  <Feather name="file-text" size={20} color="#ef4444" />
                </View>
                <Text style={{ fontFamily: 'Roboto', fontSize: 12, fontWeight: '700', color: '#1e293b' }}>{t('select_document')}</Text>
                <Text style={{ fontFamily: 'Roboto', fontSize: 9, color: '#64748b' }}>PDF / Document</Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity 
              onPress={() => setIsAttachmentModalOpen(false)}
              style={{ backgroundColor: '#f1f5f9', paddingVertical: 12, borderRadius: 12, alignItems: 'center' }}
            >
              <Text style={{ fontFamily: 'Roboto', color: '#475569', fontWeight: '800', fontSize: 13 }}>{t('cancel')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}
