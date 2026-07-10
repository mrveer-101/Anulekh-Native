import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, KeyboardAvoidingView, Platform, ActivityIndicator, Alert, Linking, Modal, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { router, useLocalSearchParams } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { supabase } from '../../core/supabase';
import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system';
import { useLanguage } from '../../core/translation';

interface Message {
  id: number;
  request_id: number;
  sender_id: string;
  message: string;
  created_at: string;
}

import { VoiceMessageBubble } from '../../../components/voice_msg/VoiceMessageBubble';

export default function ChatRoomScreen() {
  const { t } = useLanguage();
  const params = useLocalSearchParams<{ requestId: string }>();
  const scrollViewRef = useRef<ScrollView>(null);
  
  const [loading, setLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const [exam, setExam] = useState<any>(null);
  const [otherPartyName, setOtherPartyName] = useState('User');
  const [otherPartyRole, setOtherPartyRole] = useState('');
  
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');

  // Voice recording state
  const [recording, setRecording] = useState<Audio.Recording | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recordDuration, setRecordDuration] = useState(0);
  const recordInterval = useRef<any>(null);

  // Bottom Options and Modals State
  const [otherPartyPhone, setOtherPartyPhone] = useState('');
  const [otherProfileData, setOtherProfileData] = useState<any>(null);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const [isDeclarationOpen, setIsDeclarationOpen] = useState(false);
  const [isAttachmentModalOpen, setIsAttachmentModalOpen] = useState(false);

  useEffect(() => {
    const initializeChat = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
          router.replace('/auth/login');
          return;
        }
        setCurrentUser(session.user);

        const { data: profileData } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', session.user.id)
          .single();
        setProfile(profileData);

        const { data: examData } = await supabase
          .from('exam_requests')
          .select('*')
          .eq('id', params.requestId)
          .single();
        setExam(examData);

        if (examData) {
          const isStudent = session.user.id === examData.student_id;
          
          if (isStudent) {
            setOtherPartyName(examData.scribe_id ? 'સ્ક્રાઇબ' : 'સ્વયંસેવક');
            setOtherPartyRole(t('volunteer_scribe'));
            
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
            setOtherPartyName(examData.student_name);
            setOtherPartyRole(t('candidate_student'));
            
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

  useEffect(() => {
    if (!params.requestId) return;
    loadMessages();
    const interval = setInterval(loadMessages, 2000);
    return () => clearInterval(interval);
  }, [params.requestId]);

  useEffect(() => {
    setTimeout(() => {
      scrollViewRef.current?.scrollToEnd({ animated: true });
    }, 100);
  }, [messages]);

  const handleSendMessage = async () => {
    if (!newMessage.trim() || !currentUser || !exam) return;

    const msgText = newMessage.trim();
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

  const sendMockAttachment = async (type: 'image' | 'pdf', name: string) => {
    if (!currentUser || !exam) return;
    setIsAttachmentModalOpen(false);

    const attachmentMessage = `[file/${type};name=${name};base64]mock_data`;

    try {
      const { error } = await supabase
        .from('chat_messages')
        .insert({
          request_id: exam.id,
          sender_id: currentUser.id,
          message: attachmentMessage,
          created_at: new Date().toISOString()
        });

      if (error) throw error;
      loadMessages();
    } catch (e) {
      console.error('Error sending attachment:', e);
    }
  };

  const startRecording = async () => {
    try {
      const permission = await Audio.requestPermissionsAsync();
      if (permission.status !== 'granted') {
        Alert.alert(t('error'), 'કૃપા કરીને અવાજ રેકોર્ડ કરવા માટે માઇક્રોફોનની પરવાનગી આપો.');
        return;
      }

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      const newRecording = new Audio.Recording();
      await newRecording.prepareToRecordAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
      await newRecording.startAsync();
      
      setRecording(newRecording);
      setIsRecording(true);
      setRecordDuration(0);

      recordInterval.current = setInterval(() => {
        setRecordDuration(prev => prev + 1);
      }, 1000);
    } catch (err) {
      console.error('Failed to start recording:', err);
      Alert.alert(t('error'), 'રેકોર્ડિંગ શરૂ કરવામાં સમસ્યા આવી.');
    }
  };

  const stopAndSendRecording = async () => {
    if (!recording) return;

    clearInterval(recordInterval.current);
    setIsRecording(false);
    
    try {
      await recording.stopAndUnloadAsync();
      const uri = recording.getURI();
      setRecording(null);

      if (!uri) return;

      let base64Data = '';
      if (Platform.OS === 'web') {
        const response = await fetch(uri);
        const blob = await response.blob();
        base64Data = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onloadend = () => {
            const result = reader.result as string;
            const base64 = result.split(',')[1];
            resolve(base64);
          };
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        });
      } else {
        base64Data = await FileSystem.readAsStringAsync(uri, {
          encoding: FileSystem.EncodingType.Base64,
        });
      }

      const audioMessage = `[audio/m4a;base64]${base64Data}`;

      const { error } = await supabase
        .from('chat_messages')
        .insert({
          request_id: exam.id,
          sender_id: currentUser.id,
          message: audioMessage,
          created_at: new Date().toISOString()
        });

      if (error) throw error;
      loadMessages();
    } catch (err) {
      console.error('Failed to stop and send recording:', err);
      Alert.alert(t('error'), 'રેકોર્ડિંગ મોકલવામાં સમસ્યા આવી.');
    }
  };

  const cancelRecording = async () => {
    if (!recording) return;

    clearInterval(recordInterval.current);
    setIsRecording(false);
    setRecordDuration(0);

    try {
      await recording.stopAndUnloadAsync();
      setRecording(null);
    } catch (err) {
      console.error('Failed to cancel recording:', err);
    }
  };

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

  const isStudent = profile?.role === 'student';
  const themeColor = isStudent ? '#2563eb' : '#059669';
  const headerBg = isStudent ? '#2563eb' : '#059669';
  const bubbleBg = isStudent ? '#2563eb' : '#059669';
  const bubbleBgLight = isStudent ? 'rgba(37,99,235,0.08)' : 'rgba(5,150,105,0.08)';

  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace(isStudent ? '/console/student' : '/console/scribe');
    }
  };

  const TABS = isStudent ? [
    { id: 'home',     icon: 'home' as const,     label: 'Home'     },
    { id: 'requests', icon: 'list' as const,     label: 'Requests' },
    { id: 'plan',     icon: 'calendar' as const, label: 'Plan'     },
    { id: 'settings', icon: 'user' as const,     label: 'Account'  },
  ] : [
    { id: 'home',        icon: 'home' as const,     label: 'Home'    },
    { id: 'commitments', icon: 'list' as const,     label: 'Applied' },
    { id: 'plan',        icon: 'calendar' as const, label: 'Plan'    },
    { id: 'settings',    icon: 'user' as const,     label: 'Account' },
  ];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#f1f5f9' }}>
      <StatusBar style="light" />
      
      <View style={{ paddingHorizontal: 16, paddingVertical: 14, backgroundColor: headerBg, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4, elevation: 3 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, paddingRight: 8 }}>
          <TouchableOpacity 
            onPress={handleBack} 
            style={{ marginRight: 10, padding: 4 }}
          >
            <Feather name="arrow-left" size={22} color="white" />
          </TouchableOpacity>

          <View style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center', marginRight: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' }}>
            <Text style={{ fontFamily: 'Roboto', color: 'white', fontWeight: '900', fontSize: 15 }}>
              {otherPartyName.charAt(0).toUpperCase()}
            </Text>
          </View>

          <View style={{ flex: 1 }}>
            <Text style={{ fontFamily: 'Roboto', color: 'white', fontWeight: '900', fontSize: 15 }} numberOfLines={1}>
              {otherPartyName}
            </Text>
            <Text style={{ fontFamily: 'Roboto', color: 'rgba(255,255,255,0.7)', fontSize: 9, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 2 }}>
              {otherPartyRole} • ઓનલાઇન
            </Text>
          </View>
        </View>

        <View style={{ backgroundColor: 'rgba(255,255,255,0.15)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' }}>
          <Text style={{ fontFamily: 'Roboto', color: 'white', fontSize: 9, fontWeight: '800' }} numberOfLines={1}>
            {t('exam_level')}: {exam?.subject || 'Exam'}
          </Text>
        </View>
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      >
        <ScrollView
          ref={scrollViewRef}
          style={{ flex: 1, paddingHorizontal: 16, paddingVertical: 12 }}
          contentContainerStyle={{ paddingBottom: 16 }}
        >
          {messages.length === 0 ? (
            <View style={{ justifyContent: 'center', paddingVertical: 10, marginTop: 40, alignItems: 'center' }}>
              <View style={{ backgroundColor: 'rgba(255,255,255,0.8)', borderWidth: 1, borderColor: '#e2e8f0', paddingHorizontal: 16, paddingVertical: 14, borderRadius: 20, maxWidth: 280, shadowColor: '#000', shadowOpacity: 0.02, shadowRadius: 3, elevation: 1 }}>
                <Text style={{ fontFamily: 'Roboto', color: '#64748b', fontSize: 12, textAlign: 'center', lineHeight: 18, fontWeight: '600' }}>
                  {t('start_chat_desc')}
                </Text>
              </View>
            </View>
          ) : (
            messages.map((msg) => {
              const isMine = msg.sender_id === currentUser.id;
              const formattedTime = new Date(msg.created_at).toLocaleTimeString('en-IN', {
                hour: '2-digit',
                minute: '2-digit',
                hour12: true
              });

              const isVoice = msg.message.startsWith('[audio/m4a;base64]');
              const base64Audio = isVoice ? msg.message.substring('[audio/m4a;base64]'.length) : '';

              const isImage = msg.message.startsWith('[file/image;');
              const isPdf = msg.message.startsWith('[file/pdf;');

              let imageName = '';
              let imageUrl = '';
              if (isImage) {
                const parts = msg.message.split(';base64]');
                const meta = parts[0];
                imageName = meta.replace('[file/image;name=', '');
                imageUrl = 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=500&auto=format&fit=crop&q=60';
              }

              let pdfName = '';
              if (isPdf) {
                const parts = msg.message.split(';base64]');
                const meta = parts[0];
                pdfName = meta.replace('[file/pdf;name=', '');
              }

              return (
                <View
                  key={msg.id}
                  style={{ flexDirection: 'row', marginBottom: 12, justifyContent: isMine ? 'flex-end' : 'flex-start' }}
                >
                  <View
                    style={{
                      maxWidth: '78%', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 20, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 3, elevation: 1, borderWidth: 1,
                      backgroundColor: isMine ? bubbleBg : '#fff',
                      borderColor: isMine ? 'transparent' : '#f1f5f9',
                      borderTopRightRadius: isMine ? 0 : 20,
                      borderTopLeftRadius: isMine ? 20 : 0,
                    }}
                  >
                    {isVoice ? (
                      <VoiceMessageBubble 
                        messageId={msg.id} 
                        base64Audio={base64Audio} 
                        isMine={isMine} 
                        themeColor={themeColor} 
                        formattedTime={formattedTime} 
                      />
                    ) : isImage ? (
                      <View style={{ width: 190, gap: 6 }}>
                        <Image 
                          source={{ uri: imageUrl }} 
                          style={{ width: '100%', height: 120, borderRadius: 12, backgroundColor: '#f8fafc' }} 
                        />
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 2 }}>
                          <Feather name="image" size={12} color={isMine ? 'rgba(255,255,255,0.8)' : '#64748b'} />
                          <Text style={{ fontFamily: 'Roboto', fontSize: 11, fontWeight: '700', color: isMine ? '#fff' : '#1e293b' }} numberOfLines={1}>
                            {imageName}
                          </Text>
                        </View>
                      </View>
                    ) : isPdf ? (
                      <View style={{ width: 190, gap: 8 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: isMine ? 'rgba(255,255,255,0.1)' : '#f8fafc', padding: 10, borderRadius: 12 }}>
                          <Feather name="file-text" size={24} color={isMine ? '#fff' : '#ef4444'} />
                          <View style={{ flex: 1 }}>
                            <Text style={{ fontFamily: 'Roboto', fontSize: 11, fontWeight: '800', color: isMine ? '#fff' : '#1e293b' }} numberOfLines={1}>
                              {pdfName}
                            </Text>
                            <Text style={{ fontFamily: 'Roboto', fontSize: 9, color: isMine ? 'rgba(255,255,255,0.7)' : '#64748b', marginTop: 1 }}>
                              PDF • 1.2 MB
                            </Text>
                          </View>
                        </View>
                        <TouchableOpacity 
                          onPress={() => Alert.alert(t('download') || 'Download', `Downloading ${pdfName}...`)}
                          style={{ backgroundColor: isMine ? 'rgba(255,255,255,0.2)' : '#f1f5f9', paddingVertical: 8, borderRadius: 10, alignItems: 'center' }}
                        >
                          <Text style={{ fontFamily: 'Roboto', fontSize: 10, fontWeight: '800', color: isMine ? '#fff' : '#475569' }}>
                            {t('download') || 'ડાઉનલોડ'}
                          </Text>
                        </TouchableOpacity>
                      </View>
                    ) : (
                      <Text style={{ fontFamily: 'Roboto', fontSize: 13, lineHeight: 18, fontWeight: '500', color: isMine ? '#fff' : '#1e293b' }}>
                        {msg.message}
                      </Text>
                    )}
                    <Text style={{ fontFamily: 'Roboto', fontSize: 8, textAlign: 'right', marginTop: 6, fontWeight: '700', textTransform: 'uppercase', color: isMine ? 'rgba(255,255,255,0.6)' : '#94a3b8' }}>
                      {formattedTime}
                    </Text>
                  </View>
                </View>
              );
            })
          )}
        </ScrollView>

        <View style={{ backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#e2e8f0', paddingBottom: Platform.OS === 'ios' ? 4 : 8, shadowColor: '#000', shadowOffset: { width: 0, height: -3 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 4 }}>
          {/* 1. INPUT ROW */}
          <View style={{ paddingHorizontal: 16, paddingVertical: 12, flexDirection: 'row', alignItems: 'center' }}>
            {isRecording ? (
              <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#f8fafc', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: '#e2e8f0' }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#ef4444' }} />
                  <Text style={{ fontFamily: 'Roboto', color: '#64748b', fontSize: 12, fontWeight: '600' }}>
                    {t('recording')} {formatRecordTime(recordDuration)}
                  </Text>
                </View>
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <TouchableOpacity onPress={cancelRecording} style={{ padding: 4 }}>
                    <Feather name="trash-2" size={18} color="#ef4444" />
                  </TouchableOpacity>
                  <TouchableOpacity onPress={stopAndSendRecording} style={{ padding: 4 }}>
                    <Feather name="check-circle" size={18} color="#059669" />
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                {/* Attachment Button */}
                <TouchableOpacity
                  onPress={() => setIsAttachmentModalOpen(true)}
                  style={{ width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: '#f1f5f9' }}
                >
                  <Feather name="paperclip" size={17} color="#475569" />
                </TouchableOpacity>

                {/* Text Input */}
                <TextInput
                  value={newMessage}
                  onChangeText={setNewMessage}
                  placeholder={t('type_message')}
                  placeholderTextColor="#94a3b8"
                  style={{ flex: 1, fontFamily: 'Roboto', backgroundColor: '#f8fafc', borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8, fontSize: 13, color: '#1e293b', maxHeight: 80 }}
                  multiline={true}
                />

                {/* Voice Record Button */}
                <TouchableOpacity
                  onPress={startRecording}
                  style={{ width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: '#f1f5f9' }}
                >
                  <Feather name="mic" size={16} color="#475569" />
                </TouchableOpacity>

                {/* Send Button */}
                <TouchableOpacity
                  onPress={handleSendMessage}
                  disabled={newMessage.trim() === ''}
                  style={{ 
                    width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', 
                    backgroundColor: newMessage.trim() === '' ? '#cbd5e1' : themeColor,
                    shadowColor: themeColor, shadowOffset: { width: 0, height: 3 }, shadowOpacity: newMessage.trim() === '' ? 0 : 0.2, shadowRadius: 4, elevation: newMessage.trim() === '' ? 0 : 2 
                  }}
                >
                  <Feather name="send" size={15} color="white" />
                </TouchableOpacity>
              </View>
            )}
          </View>

          {/* 2. DIVIDER */}
          <View style={{ height: 1, backgroundColor: '#f1f5f9', marginHorizontal: 16 }} />

          {/* 3. OPTIONS BAR */}
          <View style={{ flexDirection: 'row', paddingHorizontal: 16, paddingVertical: 10, gap: 10, justifyContent: 'space-around' }}>
            <TouchableOpacity 
              onPress={() => {
                if (otherPartyPhone) {
                  Linking.openURL(`tel:${otherPartyPhone}`).catch(() => {
                    Alert.alert(t('error'), 'આ ઉપકરણ પર કૉલ શરૂ કરી શકાયો નથી.');
                  });
                } else {
                  Alert.alert(t('error'), 'કૉલ કરવા માટે ફોન નંબર ઉપલબ્ધ નથી.');
                }
              }}
              style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 8, borderRadius: 10, backgroundColor: isStudent ? 'rgba(5,150,105,0.08)' : 'rgba(37,99,235,0.08)', borderWidth: 1, borderColor: isStudent ? 'rgba(5,150,105,0.18)' : 'rgba(37,99,235,0.18)' }}
            >
              <Feather name="phone" size={14} color={isStudent ? '#059669' : '#2563eb'} />
              <Text style={{ fontFamily: 'Roboto', fontSize: 12, fontWeight: '700', color: isStudent ? '#059669' : '#2563eb' }}>{t('call')}</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              onPress={() => setIsDetailsOpen(true)}
              style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 8, borderRadius: 10, backgroundColor: isStudent ? 'rgba(37,99,235,0.08)' : 'rgba(5,150,105,0.08)', borderWidth: 1, borderColor: isStudent ? 'rgba(37,99,235,0.18)' : 'rgba(5,150,105,0.18)' }}
            >
              <Feather name="info" size={14} color={isStudent ? '#2563eb' : '#059669'} />
              <Text style={{ fontFamily: 'Roboto', fontSize: 12, fontWeight: '700', color: isStudent ? '#2563eb' : '#059669' }}>{t('exam_details')}</Text>
            </TouchableOpacity>

            {exam?.scribe_id ? (
              <TouchableOpacity 
                onPress={() => setIsDeclarationOpen(true)}
                style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 8, borderRadius: 10, backgroundColor: 'rgba(234,88,12,0.08)', borderWidth: 1, borderColor: 'rgba(234,88,12,0.18)' }}
              >
                <Feather name="file-text" size={14} color="#ea580c" />
                <Text style={{ fontFamily: 'Roboto', fontSize: 11, fontWeight: '700', color: '#ea580c' }} numberOfLines={1}>{t('view_declaration')}</Text>
              </TouchableOpacity>
            ) : null}
          </View>
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

      {/* ── DECLARATION MODAL ── */}
      <Modal animationType="fade" transparent visible={isDeclarationOpen} onRequestClose={() => setIsDeclarationOpen(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(15,23,42,0.35)', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <View style={{ backgroundColor: '#fff', width: '100%', maxWidth: 360, borderRadius: 28, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(0,0,0,0.05)', shadowColor: '#000', shadowOffset: { width: 0, height: 20 }, shadowOpacity: 0.15, shadowRadius: 30, elevation: 15 }}>
            <View style={{ paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#f1f5f9', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Text style={{ fontFamily: 'Roboto', fontSize: 13, fontWeight: '800', color: '#0f172a', textTransform: 'uppercase' }}>{t('scribe_declaration')}</Text>
              <TouchableOpacity onPress={() => setIsDeclarationOpen(false)} style={{ padding: 4 }}>
                <Feather name="x" size={18} color="#64748b" />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ maxHeight: 380 }} contentContainerStyle={{ padding: 20, gap: 14 }}>
              <View style={{ alignItems: 'center', marginBottom: 6 }}>
                <Text style={{ fontFamily: 'Roboto', fontWeight: '900', fontSize: 20, color: themeColor }}>Anulekh Portal</Text>
                <Text style={{ fontFamily: 'Roboto', fontSize: 9, color: '#64748b', textTransform: 'uppercase', letterSpacing: 1.5, marginTop: 2 }}>{t('official_cert_letter')}</Text>
              </View>

              <View style={{ backgroundColor: '#f8fafc', padding: 12, borderRadius: 16, borderWidth: 1, borderColor: '#e2e8f0', gap: 4 }}>
                <Text style={{ fontFamily: 'Roboto', fontSize: 9, fontWeight: '800', color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 }}>{t('exam_details')}</Text>
                <Text style={{ fontFamily: 'Roboto', fontSize: 12, color: '#334155', fontWeight: '700' }}>{t('candidate_student')}: {exam?.subject}</Text>
                <Text style={{ fontFamily: 'Roboto', fontSize: 11, color: '#475569' }}>{t('exam_level')}: {exam?.exam_type}</Text>
                <Text style={{ fontFamily: 'Roboto', fontSize: 11, color: '#475569' }}>{t('exam_date')}: {exam?.exam_date}</Text>
                <Text style={{ fontFamily: 'Roboto', fontSize: 11, color: '#475569' }}>{t('exam_venue')}: {exam?.exam_venue}</Text>
              </View>

              <View style={{ gap: 10 }}>
                <View>
                  <Text style={{ fontFamily: 'Roboto', fontSize: 9, fontWeight: '800', color: '#64748b', textTransform: 'uppercase', marginBottom: 2 }}>{t('candidate_student')}</Text>
                  <Text style={{ fontFamily: 'Roboto', fontSize: 12, color: '#0f172a', fontWeight: '800' }}>{isStudent ? profile?.full_name : otherProfileData?.full_name}</Text>
                  <Text style={{ fontFamily: 'Roboto', fontSize: 10, color: '#64748b', marginTop: 1 }}>ધોરણ: {exam?.education_grade || 'ચકાસાયેલ'}</Text>
                </View>

                <View style={{ height: 1, backgroundColor: '#f1f5f9' }} />

                <View>
                  <Text style={{ fontFamily: 'Roboto', fontSize: 9, fontWeight: '800', color: '#64748b', textTransform: 'uppercase', marginBottom: 2 }}>{t('volunteer_scribe')}</Text>
                  <Text style={{ fontFamily: 'Roboto', fontSize: 12, color: '#0f172a', fontWeight: '800' }}>{isStudent ? otherProfileData?.full_name : profile?.full_name}</Text>
                  <Text style={{ fontFamily: 'Roboto', fontSize: 10, color: '#64748b', marginTop: 1 }}>વ્યવસાય: {isStudent ? (otherProfileData?.occupation || 'વિદ્યાર્થી લખિયો') : (profile?.occupation || 'વિદ્યાર્થી લખિયો')}</Text>
                </View>
              </View>

              <View style={{ backgroundColor: isStudent ? 'rgba(37,99,235,0.05)' : 'rgba(5,150,105,0.05)', borderWidth: 1, borderColor: isStudent ? 'rgba(37,99,235,0.18)' : 'rgba(5,150,105,0.18)', padding: 12, borderRadius: 16, marginTop: 4 }}>
                <Text style={{ fontFamily: 'Roboto', fontSize: 10, color: themeColor, lineHeight: 16, fontStyle: 'italic', textAlign: 'center' }}>
                  {t('declaration_agreement_text')}
                </Text>
              </View>

              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 4 }}>
                <View>
                  <Text style={{ fontFamily: 'Roboto', fontSize: 8, fontWeight: '800', color: '#64748b', textTransform: 'uppercase' }}>{t('status')}</Text>
                  <Text style={{ fontFamily: 'Roboto', fontSize: 10, color: '#059669', fontWeight: '800', marginTop: 2 }}>✓ ચકાસાયેલ લખિયો</Text>
                </View>
                <View style={{ alignItems: 'flex-end', marginLeft: 'auto' }}>
                  <Text style={{ fontFamily: 'Roboto', fontSize: 8, fontWeight: '800', color: '#64748b', textTransform: 'uppercase' }}>{t('official_stamp')}</Text>
                  <Text style={{ fontFamily: 'Roboto', fontSize: 9, color: '#0f172a', fontWeight: '800', marginTop: 2 }}>ANULEKH ONLINE</Text>
                </View>
              </View>
            </ScrollView>

            <View style={{ padding: 16, backgroundColor: '#f8fafc', borderTopWidth: 1, borderTopColor: '#f1f5f9', flexDirection: 'row', gap: 8 }}>
              <TouchableOpacity onPress={() => setIsDeclarationOpen(false)} style={{ flex: 1, backgroundColor: '#e2e8f0', paddingVertical: 11, borderRadius: 12, alignItems: 'center' }}>
                <Text style={{ fontFamily: 'Roboto', color: '#475569', fontWeight: '700', fontSize: 13 }}>{t('close')}</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => Alert.alert(t('download'), t('download_declaration'))} style={{ flex: 1, backgroundColor: themeColor, paddingVertical: 11, borderRadius: 12, alignItems: 'center', shadowColor: themeColor, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 8, elevation: 3 }}>
                <Text style={{ fontFamily: 'Roboto', color: 'white', fontWeight: '800', fontSize: 13 }}>{t('download')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
      {/* ── DEFAULT BOTTOM NAV BAR ── */}
      <SafeAreaView edges={['bottom']} style={{
        backgroundColor: 'rgba(255,255,255,0.95)',
        borderTopLeftRadius: 20,
        borderTopRightRadius: 20,
        shadowColor: '#000', shadowOffset: { width: 0, height: -4 },
        shadowOpacity: 0.07, shadowRadius: 12, elevation: 5,
        borderTopWidth: 1, borderTopColor: 'rgba(0,0,0,0.07)'
      }}>
        <View style={{
          flexDirection: 'row',
          paddingVertical: 8,
          paddingHorizontal: 8,
          gap: 4,
        }}>
          {TABS.map((tab) => {
            return (
              <TouchableOpacity
                key={tab.id}
                onPress={() => {
                  router.replace({
                    pathname: isStudent ? '/console/student' : '/console/scribe',
                    params: { tab: tab.id }
                  });
                }}
                style={{
                  flex: 1, alignItems: 'center', paddingVertical: 9,
                  borderRadius: 20,
                  backgroundColor: 'transparent',
                }}
              >
                <Feather name={tab.icon} size={20} color={'#94a3b8'} />
                <Text style={{
                  fontSize: 10, fontWeight: '500',
                  marginTop: 4, color: '#94a3b8',
                }}>
                  {tab.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </SafeAreaView>

      {/* ── ATTACHMENT CHOICE MODAL ── */}
      <Modal animationType="slide" transparent visible={isAttachmentModalOpen} onRequestClose={() => setIsAttachmentModalOpen(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(15,23,42,0.3)', justifyContent: 'flex-end' }}>
          <View style={{ backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, shadowColor: '#000', shadowOffset: { width: 0, height: -10 }, shadowOpacity: 0.1, shadowRadius: 10, elevation: 10 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
              <Text style={{ fontFamily: 'Roboto', fontSize: 16, fontWeight: '800', color: '#0f172a' }}>દસ્તાવેજ મોકલો (Send Attachment)</Text>
              <TouchableOpacity onPress={() => setIsAttachmentModalOpen(false)} style={{ padding: 4 }}>
                <Feather name="x" size={20} color="#64748b" />
              </TouchableOpacity>
            </View>

            <View style={{ flexDirection: 'row', gap: 16, marginBottom: 24 }}>
              <TouchableOpacity 
                onPress={() => sendMockAttachment('image', 'admit_card_receipt.png')}
                style={{ flex: 1, backgroundColor: '#f8fafc', borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 16, padding: 16, alignItems: 'center', gap: 8 }}
              >
                <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(37,99,235,0.08)', alignItems: 'center', justifyContent: 'center' }}>
                  <Feather name="image" size={20} color="#2563eb" />
                </View>
                <Text style={{ fontFamily: 'Roboto', fontSize: 12, fontWeight: '700', color: '#1e293b' }}>ફોટો મોકલો</Text>
                <Text style={{ fontFamily: 'Roboto', fontSize: 9, color: '#64748b' }}>Image/Photo</Text>
              </TouchableOpacity>

              <TouchableOpacity 
                onPress={() => sendMockAttachment('pdf', 'hall_ticket_admit.pdf')}
                style={{ flex: 1, backgroundColor: '#f8fafc', borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 16, padding: 16, alignItems: 'center', gap: 8 }}
              >
                <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(239,68,68,0.08)', alignItems: 'center', justifyContent: 'center' }}>
                  <Feather name="file-text" size={20} color="#ef4444" />
                </View>
                <Text style={{ fontFamily: 'Roboto', fontSize: 12, fontWeight: '700', color: '#1e293b' }}>PDF દસ્તાવેજ</Text>
                <Text style={{ fontFamily: 'Roboto', fontSize: 9, color: '#64748b' }}>PDF Document</Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity 
              onPress={() => setIsAttachmentModalOpen(false)}
              style={{ backgroundColor: '#f1f5f9', paddingVertical: 12, borderRadius: 12, alignItems: 'center' }}
            >
              <Text style={{ fontFamily: 'Roboto', color: '#475569', fontWeight: '800', fontSize: 13 }}>રદ કરો (Cancel)</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}
