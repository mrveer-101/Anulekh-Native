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

export function UniversalVoiceAssistant() {
  const [visible, setVisible] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [assistantReply, setAssistantReply] = useState(
    'Tap the microphone or say a command: "Who applied?", "Accept scribe", or "Create request".'
  );

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
        setAssistantReply(
          initialPrompt ||
            'Listening... Ask "Who applied?", "Accept scribe", or "Message scribe".'
        );
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

  const handleFinalSpeech = async (spokenText: string) => {
    stopListeningSession();
    setIsProcessing(true);
    try {
      const result = await parseAndExecuteVoiceCommand(spokenText);
      setAssistantReply(result.spokenResponse || result.message);
      if (result.actionType === 'create_request') {
        // Close overlay so user is placed in request form wizard
        setTimeout(() => setVisible(false), 800);
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
          backgroundColor: 'rgba(15, 23, 42, 0.85)',
          justifyContent: 'center',
          alignItems: 'center',
          paddingHorizontal: 24,
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
            top: 54,
            right: 24,
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

        {/* Pulsing Voice Orb */}
        <View style={{ alignItems: 'center', justifyContent: 'center', marginVertical: 32 }}>
          {/* Outer Ripple Wave */}
          <Animated.View
            style={{
              position: 'absolute',
              width: 170,
              height: 170,
              borderRadius: 85,
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
                width: 96,
                height: 96,
                borderRadius: 48,
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
                  size={42}
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
            fontSize: 13,
            fontWeight: '700',
            textTransform: 'uppercase',
            letterSpacing: 1.2,
            marginBottom: 16,
          }}
        >
          {isProcessing ? 'Processing...' : isListening ? 'Listening to your voice...' : 'Tap Mic to Speak'}
        </Text>

        {/* Live User Transcript */}
        {transcript ? (
          <View
            style={{
              backgroundColor: 'rgba(255, 255, 255, 0.1)',
              borderRadius: 16,
              paddingHorizontal: 18,
              paddingVertical: 12,
              marginBottom: 16,
              maxWidth: '90%',
            }}
          >
            <Text
              style={{
                fontFamily: 'Roboto',
                color: '#ffffff',
                fontSize: 16,
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
            backgroundColor: 'rgba(30, 41, 59, 0.9)',
            borderWidth: 1,
            borderColor: 'rgba(255, 255, 255, 0.1)',
            borderRadius: 20,
            padding: 20,
            width: '100%',
            maxWidth: 360,
            marginBottom: 24,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
            <Ionicons name="sparkles" size={16} color="#60a5fa" style={{ marginRight: 6 }} />
            <Text style={{ fontFamily: 'Roboto', color: '#94a3b8', fontSize: 12, fontWeight: '700' }}>
              ANULEKH SIRI VOICE
            </Text>
          </View>
          <Text style={{ fontFamily: 'Roboto', color: '#f8fafc', fontSize: 14, lineHeight: 22 }}>
            {assistantReply}
          </Text>
        </View>

        {/* Quick Voice Command Chips */}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8 }}>
          {[
            { label: '📝 Create Request', cmd: 'create exam request' },
            { label: '👥 Who Applied?', cmd: 'who applied' },
            { label: '✅ Accept Scribe', cmd: 'accept scribe' },
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
                paddingVertical: 8,
              }}
            >
              <Text style={{ fontFamily: 'Roboto', color: '#e2e8f0', fontSize: 12, fontWeight: '600' }}>
                {item.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
    </Modal>
  );
}
