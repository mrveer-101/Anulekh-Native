/**
 * UniversalVoiceAssistant.tsx — Full Hands-Free Voice Assistant Modal
 *
 * Provides a glowing voice orb, continuous Speech Recognition, Siri-like Text-To-Speech,
 * and natural voice action execution for students.
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  Animated,
  Easing,
  Platform,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { Feather, Ionicons } from '@expo/vector-icons';
import {
  ExpoSpeechRecognitionModule,
  useSpeechRecognitionEvent,
} from 'expo-speech-recognition';
import {
  speakAloud,
  stopSpeech,
  parseAndExecuteVoiceCommand,
  voiceCreateRequest,
  voiceEditRequest,
  voiceDeleteRequest,
  voiceCheckScribeApplications,
} from '@/core/voiceAssistant';

// Global Event Bus for opening the voice assistant from any screen or deep link
type Listener = (open: boolean, initialPrompt?: string) => void;
const listeners = new Set<Listener>();

export function openVoiceAssistant(initialPrompt?: string) {
  listeners.forEach((fn) => fn(true, initialPrompt));
}

export function closeVoiceAssistant() {
  listeners.forEach((fn) => fn(false));
}

const DEFAULT_GREETING =
  'Hi! What would you like to do? You can Create Request, Edit Request, Delete Request, or Check Scribe Applications.';

export function UniversalVoiceAssistant() {
  const [visible, setVisible] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [assistantReply, setAssistantReply] = useState(DEFAULT_GREETING);

  // Pulsing animation for microphone orb
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const waveAnim1 = useRef(new Animated.Value(0.4)).current;
  const waveAnim2 = useRef(new Animated.Value(0.7)).current;

  // Speech Recognition Hooks
  useSpeechRecognitionEvent('start', () => {
    setIsListening(true);
    setTranscript('');
  });

  useSpeechRecognitionEvent('end', () => {
    setIsListening(false);
  });

  useSpeechRecognitionEvent('result', (event) => {
    const text = event.results?.[0]?.transcript || '';
    if (text) {
      setTranscript(text);
    }
    if (event.isFinal && text.trim()) {
      handleFinalSpeech(text.trim());
    }
  });

  useSpeechRecognitionEvent('error', () => {
    setIsListening(false);
  });

  // Register with Global Event Bus
  useEffect(() => {
    const listener: Listener = (open, initialPrompt) => {
      setVisible(open);
      if (open) {
        setTranscript('');
        const promptToUse = initialPrompt || DEFAULT_GREETING;
        setAssistantReply(promptToUse);
        speakAloud(promptToUse);
        startListeningSession();
      } else {
        stopListeningSession();
        stopSpeech();
      }
    };

    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);

  // Continuous Orb Pulsing
  useEffect(() => {
    if (!visible) return;

    const pulseLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: isListening ? 1.25 : 1.1,
          duration: 900,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 900,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    );

    const waveLoop1 = Animated.loop(
      Animated.sequence([
        Animated.timing(waveAnim1, {
          toValue: 1,
          duration: 1200,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(waveAnim1, {
          toValue: 0.3,
          duration: 1200,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    );

    pulseLoop.start();
    waveLoop1.start();

    return () => {
      pulseLoop.stop();
      waveLoop1.stop();
    };
  }, [visible, isListening]);

  const startListeningSession = async () => {
    try {
      stopSpeech();
      setIsListening(true);
      if (Platform.OS !== 'web') {
        const perms = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
        if (perms.granted) {
          ExpoSpeechRecognitionModule.start({
            lang: 'en-US',
            interimResults: true,
            continuous: false,
          });
        }
      }
    } catch (e) {
      console.warn('Could not start speech recognition:', e);
      setIsListening(false);
    }
  };

  const stopListeningSession = () => {
    try {
      if (Platform.OS !== 'web') {
        ExpoSpeechRecognitionModule.stop();
      }
      setIsListening(false);
    } catch (e) {
      // quiet
    }
  };

  const handleAction = async (action: 'create_request' | 'edit_request' | 'delete_request' | 'check_scribes') => {
    stopListeningSession();
    setIsProcessing(true);
    try {
      let result;
      if (action === 'create_request') {
        setTranscript('Create Request');
        result = await voiceCreateRequest();
      } else if (action === 'edit_request') {
        setTranscript('Edit Request');
        result = await voiceEditRequest();
      } else if (action === 'delete_request') {
        setTranscript('Delete Request');
        result = await voiceDeleteRequest();
      } else {
        setTranscript('Check Scribe Application');
        result = await voiceCheckScribeApplications();
      }
      setAssistantReply(result.spokenResponse || result.message);
      if (
        result.actionType === 'create_request' ||
        result.actionType === 'edit_request' ||
        result.actionType === 'delete_request'
      ) {
        setTimeout(() => setVisible(false), 900);
      }
    } catch (e: any) {
      setAssistantReply('Could not complete action. Please try again.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleFinalSpeech = async (spokenText: string) => {
    stopListeningSession();
    setIsProcessing(true);
    try {
      const result = await parseAndExecuteVoiceCommand(spokenText);
      setAssistantReply(result.spokenResponse || result.message);
      if (
        result.actionType === 'create_request' ||
        result.actionType === 'edit_request' ||
        result.actionType === 'delete_request'
      ) {
        // Close overlay so user is placed in target view
        setTimeout(() => setVisible(false), 900);
      }
    } catch (e: any) {
      setAssistantReply('Sorry, I could not understand that. Please try again.');
    } finally {
      setIsProcessing(false);
    }
  };

  if (!visible) return null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={() => setVisible(false)}>
      <View
        style={{
          flex: 1,
          backgroundColor: 'rgba(15, 23, 42, 0.88)',
        }}
      >
        {/* Close Button */}
        <TouchableOpacity
          onPress={() => {
            stopSpeech();
            stopListeningSession();
            setVisible(false);
          }}
          style={{
            position: 'absolute',
            top: 50,
            right: 20,
            zIndex: 10,
            width: 40,
            height: 40,
            borderRadius: 20,
            backgroundColor: 'rgba(255, 255, 255, 0.15)',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Feather name="x" size={20} color="#ffffff" />
        </TouchableOpacity>

        <ScrollView
          contentContainerStyle={{
            alignItems: 'center',
            justifyContent: 'center',
            paddingTop: 70,
            paddingBottom: 40,
            paddingHorizontal: 20,
          }}
          showsVerticalScrollIndicator={false}
          style={{ flex: 1 }}
        >
          {/* Pulsing Voice Orb */}
          <View style={{ alignItems: 'center', justifyContent: 'center', marginVertical: 24 }}>
            {/* Outer Ripple Wave */}
            <Animated.View
              style={{
                position: 'absolute',
                width: 160,
                height: 160,
                borderRadius: 80,
                backgroundColor: isListening ? 'rgba(59, 130, 246, 0.25)' : 'rgba(99, 102, 241, 0.15)',
                transform: [{ scale: waveAnim1 }],
              }}
            />

            {/* Core Interactive Mic Button */}
            <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
              <TouchableOpacity
                onPress={() => {
                  if (isListening) {
                    stopListeningSession();
                  } else {
                    startListeningSession();
                  }
                }}
                style={{
                  width: 90,
                  height: 90,
                  borderRadius: 45,
                  backgroundColor: isListening ? '#2563eb' : '#4f46e5',
                  alignItems: 'center',
                  justifyContent: 'center',
                  shadowColor: '#2563eb',
                  shadowOffset: { width: 0, height: 8 },
                  shadowOpacity: 0.5,
                  shadowRadius: 20,
                  elevation: 12,
                }}
              >
                {isProcessing ? (
                  <ActivityIndicator size="small" color="#ffffff" />
                ) : (
                  <Ionicons
                    name={isListening ? 'mic' : 'mic-outline'}
                    size={40}
                    color="#ffffff"
                  />
                )}
              </TouchableOpacity>
            </Animated.View>
          </View>

          {/* Status Indicator */}
          <Text
            style={{
              fontFamily: 'Roboto',
              color: isListening ? '#60a5fa' : '#94a3b8',
              fontSize: 12.5,
              fontWeight: '700',
              textTransform: 'uppercase',
              letterSpacing: 1.2,
              marginBottom: 14,
            }}
          >
            {isProcessing ? 'Processing...' : isListening ? 'Listening to your voice...' : 'Tap Mic to Speak'}
          </Text>

          {/* Live User Transcript */}
          {transcript ? (
            <View
              style={{
                backgroundColor: 'rgba(255, 255, 255, 0.12)',
                borderRadius: 16,
                paddingHorizontal: 18,
                paddingVertical: 10,
                marginBottom: 14,
                maxWidth: '92%',
              }}
            >
              <Text
                style={{
                  fontFamily: 'Roboto',
                  color: '#ffffff',
                  fontSize: 15,
                  fontWeight: '600',
                  textAlign: 'center',
                }}
              >
                "{transcript}"
              </Text>
            </View>
          ) : null}

          {/* Assistant Response Box */}
          <View
            style={{
              backgroundColor: 'rgba(30, 41, 59, 0.95)',
              borderWidth: 1.5,
              borderColor: 'rgba(255, 255, 255, 0.12)',
              borderRadius: 20,
              padding: 18,
              width: '100%',
              maxWidth: 380,
              marginBottom: 20,
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
              <Ionicons name="sparkles" size={16} color="#60a5fa" style={{ marginRight: 6 }} />
              <Text style={{ fontFamily: 'Roboto', color: '#94a3b8', fontSize: 12, fontWeight: '700' }}>
                ANULEKH AI VOICE ASSISTANT
              </Text>
            </View>
            <Text style={{ fontFamily: 'Roboto', color: '#f8fafc', fontSize: 14, lineHeight: 21 }}>
              {assistantReply}
            </Text>
          </View>

          {/* 4 Core Action Cards (Requested: Create Request, Edit Request, Delete Request, Check Scribe Application) */}
          <View style={{ width: '100%', maxWidth: 380, gap: 10, marginBottom: 18 }}>
            <Text
              style={{
                fontFamily: 'Roboto',
                color: '#cbd5e1',
                fontSize: 12,
                fontWeight: '800',
                textTransform: 'uppercase',
                letterSpacing: 0.8,
                textAlign: 'center',
                marginBottom: 2,
              }}
            >
              What would you like to do?
            </Text>

            {/* Row 1: Create Request + Edit Request */}
            <View style={{ flexDirection: 'row', gap: 10 }}>
              {/* Create Request */}
              <TouchableOpacity
                testID="voice-btn-create-request"
                onPress={() => handleAction('create_request')}
                style={{
                  flex: 1,
                  backgroundColor: 'rgba(37, 99, 235, 0.18)',
                  borderWidth: 1.5,
                  borderColor: '#3b82f6',
                  borderRadius: 16,
                  padding: 12,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 10,
                }}
                activeOpacity={0.75}
              >
                <View
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 18,
                    backgroundColor: 'rgba(59, 130, 246, 0.25)',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Feather name="plus-circle" size={18} color="#60a5fa" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text
                    style={{
                      fontFamily: 'Roboto',
                      color: '#ffffff',
                      fontSize: 13,
                      fontWeight: '800',
                    }}
                    numberOfLines={1}
                  >
                    Create Request
                  </Text>
                  <Text
                    style={{
                      fontFamily: 'Roboto',
                      color: '#93c5fd',
                      fontSize: 10.5,
                      fontWeight: '500',
                    }}
                    numberOfLines={1}
                  >
                    New exam scribe
                  </Text>
                </View>
              </TouchableOpacity>

              {/* Edit Request */}
              <TouchableOpacity
                testID="voice-btn-edit-request"
                onPress={() => handleAction('edit_request')}
                style={{
                  flex: 1,
                  backgroundColor: 'rgba(245, 158, 11, 0.18)',
                  borderWidth: 1.5,
                  borderColor: '#f59e0b',
                  borderRadius: 16,
                  padding: 12,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 10,
                }}
                activeOpacity={0.75}
              >
                <View
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 18,
                    backgroundColor: 'rgba(245, 158, 11, 0.25)',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Feather name="edit-2" size={17} color="#fbbf24" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text
                    style={{
                      fontFamily: 'Roboto',
                      color: '#ffffff',
                      fontSize: 13,
                      fontWeight: '800',
                    }}
                    numberOfLines={1}
                  >
                    Edit Request
                  </Text>
                  <Text
                    style={{
                      fontFamily: 'Roboto',
                      color: '#fcd34d',
                      fontSize: 10.5,
                      fontWeight: '500',
                    }}
                    numberOfLines={1}
                  >
                    Modify details
                  </Text>
                </View>
              </TouchableOpacity>
            </View>

            {/* Row 2: Delete Request + Check Scribe Application */}
            <View style={{ flexDirection: 'row', gap: 10 }}>
              {/* Delete Request */}
              <TouchableOpacity
                testID="voice-btn-delete-request"
                onPress={() => handleAction('delete_request')}
                style={{
                  flex: 1,
                  backgroundColor: 'rgba(239, 68, 68, 0.18)',
                  borderWidth: 1.5,
                  borderColor: '#ef4444',
                  borderRadius: 16,
                  padding: 12,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 10,
                }}
                activeOpacity={0.75}
              >
                <View
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 18,
                    backgroundColor: 'rgba(239, 68, 68, 0.25)',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Feather name="trash-2" size={17} color="#f87171" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text
                    style={{
                      fontFamily: 'Roboto',
                      color: '#ffffff',
                      fontSize: 13,
                      fontWeight: '800',
                    }}
                    numberOfLines={1}
                  >
                    Delete Request
                  </Text>
                  <Text
                    style={{
                      fontFamily: 'Roboto',
                      color: '#fca5a5',
                      fontSize: 10.5,
                      fontWeight: '500',
                    }}
                    numberOfLines={1}
                  >
                    Cancel a request
                  </Text>
                </View>
              </TouchableOpacity>

              {/* Check Scribe Application */}
              <TouchableOpacity
                testID="voice-btn-check-scribes"
                onPress={() => handleAction('check_scribes')}
                style={{
                  flex: 1,
                  backgroundColor: 'rgba(16, 185, 129, 0.18)',
                  borderWidth: 1.5,
                  borderColor: '#10b981',
                  borderRadius: 16,
                  padding: 12,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 10,
                }}
                activeOpacity={0.75}
              >
                <View
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 18,
                    backgroundColor: 'rgba(16, 185, 129, 0.25)',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Feather name="users" size={17} color="#34d399" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text
                    style={{
                      fontFamily: 'Roboto',
                      color: '#ffffff',
                      fontSize: 12,
                      fontWeight: '800',
                    }}
                    numberOfLines={1}
                  >
                    Check Scribe App
                  </Text>
                  <Text
                    style={{
                      fontFamily: 'Roboto',
                      color: '#6ee7b7',
                      fontSize: 10.5,
                      fontWeight: '500',
                    }}
                    numberOfLines={1}
                  >
                    View applicants
                  </Text>
                </View>
              </TouchableOpacity>
            </View>
          </View>

          {/* Quick Voice Prompt Hints */}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8 }}>
            {[
              { label: '💬 Message Scribe', cmd: 'message to my scribe I am here' },
              { label: '🚨 Trigger SOS', cmd: 'trigger sos' },
            ].map((item) => (
              <TouchableOpacity
                key={item.label}
                onPress={() => {
                  setTranscript(item.cmd);
                  handleFinalSpeech(item.cmd);
                }}
                style={{
                  backgroundColor: 'rgba(255, 255, 255, 0.08)',
                  borderWidth: 1,
                  borderColor: 'rgba(255, 255, 255, 0.15)',
                  borderRadius: 20,
                  paddingHorizontal: 14,
                  paddingVertical: 7,
                }}
              >
                <Text style={{ fontFamily: 'Roboto', color: '#cbd5e1', fontSize: 11.5, fontWeight: '600' }}>
                  {item.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}
