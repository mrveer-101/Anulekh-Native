import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
  Platform,
  Animated,
  Easing,
} from 'react-native';
import { Feather, Ionicons } from '@expo/vector-icons';
import * as Speech from 'expo-speech';
import * as Location from 'expo-location';
import { ExpoSpeechRecognitionModule, useSpeechRecognitionEvent } from 'expo-speech-recognition';
import { supabase } from '@/core/supabase';
import { announceForAccessibility } from '@/core/a11y';
import { useLanguage } from '@/core/translation';

interface VoiceExamWizardProps {
  profile: any;
  onCancel: () => void;
  onSuccess: () => void;
}

type WizardStep = 'subject' | 'type' | 'date' | 'time' | 'venue' | 'confirm';

const EXAM_TYPE_OPTIONS = ['University', 'School', 'Competitive', 'Government'];

export default function VoiceExamWizard({ profile, onCancel, onSuccess }: VoiceExamWizardProps) {
  const { t } = useLanguage();

  // Wizard conversational steps
  const [step, setStep] = useState<WizardStep>('subject');
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [voiceMuted, setVoiceMuted] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [isLocating, setIsLocating] = useState(false);

  // Collected fields
  const [subject, setSubject] = useState('');
  const [examType, setExamType] = useState('University');
  const [examDate, setExamDate] = useState('');
  const [examTime, setExamTime] = useState('10:00 AM');
  const [examVenue, setExamVenue] = useState('');

  // Active typed value (for manual override or editing current step)
  const [currentInput, setCurrentInput] = useState('');

  // Pulsing animation for microphone orb
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const waveAnim1 = useRef(new Animated.Value(0.4)).current;
  const waveAnim2 = useRef(new Animated.Value(0.7)).current;
  const waveAnim3 = useRef(new Animated.Value(0.3)).current;

  // Web Speech Recognition reference
  const recognitionRef = useRef<any>(null);

  // Active state ref to avoid stale closures during speech recognition event callbacks
  const stepRef = useRef<WizardStep>(step);
  stepRef.current = step;

  const handleVoiceInputRef = useRef<(raw: string) => void>(() => {});

  // Native Speech Recognition Event Hooks (Android & iOS)
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
      setCurrentInput(text);
    }
    if (event.isFinal && text.trim()) {
      handleVoiceInputRef.current(text);
    }
  });

  useSpeechRecognitionEvent('error', (event) => {
    // End listening state gracefully on silence or speech timeout
    setIsListening(false);
  });

  // Start continuous pulse animation
  useEffect(() => {
    const pulseLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.15,
          duration: 900,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: Platform.OS !== 'web',
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 900,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: Platform.OS !== 'web',
        }),
      ])
    );

    const waveLoop = Animated.loop(
      Animated.parallel([
        Animated.sequence([
          Animated.timing(waveAnim1, { toValue: 1, duration: 400, useNativeDriver: Platform.OS !== 'web' }),
          Animated.timing(waveAnim1, { toValue: 0.3, duration: 400, useNativeDriver: Platform.OS !== 'web' }),
        ]),
        Animated.sequence([
          Animated.timing(waveAnim2, { toValue: 0.2, duration: 550, useNativeDriver: Platform.OS !== 'web' }),
          Animated.timing(waveAnim2, { toValue: 0.95, duration: 550, useNativeDriver: Platform.OS !== 'web' }),
        ]),
        Animated.sequence([
          Animated.timing(waveAnim3, { toValue: 0.9, duration: 480, useNativeDriver: Platform.OS !== 'web' }),
          Animated.timing(waveAnim3, { toValue: 0.25, duration: 480, useNativeDriver: Platform.OS !== 'web' }),
        ]),
      ])
    );

    pulseLoop.start();
    waveLoop.start();

    return () => {
      pulseLoop.stop();
      waveLoop.stop();
    };
  }, []);

  // Stop speaking on native and web
  const stopSpeaking = () => {
    try {
      if (Speech && typeof Speech.stop === 'function') {
        Speech.stop();
      }
    } catch {}
    try {
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
    } catch {}
    setIsSpeaking(false);
  };

  // Text-To-Speech helper: uses native Android/iOS TTS via expo-speech, with web fallback
  const speakPrompt = (text: string, onEnd?: () => void) => {
    announceForAccessibility(text);

    if (voiceMuted) {
      if (onEnd) setTimeout(onEnd, 300);
      return;
    }

    try {
      stopSpeaking();
      setIsSpeaking(true);

      // 1. Native / universal TTS via expo-speech
      if (Speech && typeof Speech.speak === 'function') {
        Speech.speak(text, {
          language: 'en-IN',
          pitch: 1.05,
          rate: 1.0,
          onStart: () => setIsSpeaking(true),
          onDone: () => {
            setIsSpeaking(false);
            if (onEnd) onEnd();
          },
          onError: () => {
            setIsSpeaking(false);
            if (onEnd) onEnd();
          },
        });
        return;
      }

      // 2. Browser fallback via window.speechSynthesis
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.rate = 1.0;
        utterance.pitch = 1.05;
        utterance.lang = 'en-IN';
        utterance.onstart = () => setIsSpeaking(true);
        utterance.onend = () => {
          setIsSpeaking(false);
          if (onEnd) onEnd();
        };
        utterance.onerror = () => {
          setIsSpeaking(false);
          if (onEnd) onEnd();
        };
        window.speechSynthesis.speak(utterance);
        return;
      }

      if (onEnd) setTimeout(onEnd, 300);
    } catch {
      setIsSpeaking(false);
      if (onEnd) onEnd();
    }
  };

  // Start Speech Recognition (Native via expo-speech-recognition, with web fallback)
  const startListening = async () => {
    stopSpeaking();

    // 1. Native Android / iOS Speech Recognition via expo-speech-recognition
    try {
      const perms = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
      if (!perms.granted) {
        Alert.alert(
          'Microphone Permission Required',
          'Please allow microphone permission so Anulekh can listen to your exam booking details.'
        );
        return;
      }

      try {
        ExpoSpeechRecognitionModule.abort();
      } catch {}

      ExpoSpeechRecognitionModule.start({
        lang: 'en-IN',
        interimResults: true,
        continuous: false,
        androidIntent: 'android.speech.action.RECOGNIZE_SPEECH',
        addsPunctuation: false,
      });
      setIsListening(true);
      setTranscript('');
      return;
    } catch (nativeErr) {
      console.warn('Native speech recognition start failed:', nativeErr);
    }

    // 2. Web fallback (for browser testing / development)
    if (typeof window !== 'undefined') {
      const SpeechRecognition =
        (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

      if (SpeechRecognition) {
        try {
          if (recognitionRef.current) {
            try {
              recognitionRef.current.stop();
            } catch {}
          }

          const recognition = new SpeechRecognition();
          recognition.continuous = false;
          recognition.interimResults = true;
          recognition.lang = 'en-IN';

          recognition.onstart = () => {
            setIsListening(true);
            setTranscript('');
          };

          recognition.onresult = (event: any) => {
            let currentText = '';
            for (let i = event.resultIndex; i < event.results.length; i++) {
              currentText += event.results[i][0].transcript;
            }
            setTranscript(currentText);
            setCurrentInput(currentText);

            if (event.results[0]?.isFinal) {
              handleVoiceInputRef.current(currentText);
            }
          };

          recognition.onerror = () => {
            setIsListening(false);
          };

          recognition.onend = () => {
            setIsListening(false);
          };

          recognitionRef.current = recognition;
          recognition.start();
          return;
        } catch {}
      }
    }

    setIsListening(false);
  };

  const stopListening = () => {
    try {
      ExpoSpeechRecognitionModule.stop();
    } catch {}
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {}
    }
    setIsListening(false);
  };

  // Clean up speech and recognition on unmount
  useEffect(() => {
    return () => {
      stopSpeaking();
      stopListening();
      try {
        ExpoSpeechRecognitionModule.abort();
      } catch {}
    };
  }, []);

  // Smart Date Parser from spoken natural language
  const parseSpokenDate = (input: string): string => {
    const text = input.toLowerCase().trim();
    const today = new Date();

    if (text.includes('today')) {
      const d = String(today.getDate()).padStart(2, '0');
      const m = String(today.getMonth() + 1).padStart(2, '0');
      return `${d}/${m}/${today.getFullYear()}`;
    }

    if (text.includes('day after tomorrow')) {
      const target = new Date();
      target.setDate(today.getDate() + 2);
      const d = String(target.getDate()).padStart(2, '0');
      const m = String(target.getMonth() + 1).padStart(2, '0');
      return `${d}/${m}/${target.getFullYear()}`;
    }

    if (text.includes('tomorrow')) {
      const target = new Date();
      target.setDate(today.getDate() + 1);
      const d = String(target.getDate()).padStart(2, '0');
      const m = String(target.getMonth() + 1).padStart(2, '0');
      return `${d}/${m}/${target.getFullYear()}`;
    }

    // Try parsing date numbers like "25th October", "25 October 2026", "October 25"
    const months = [
      'january', 'february', 'march', 'april', 'may', 'june',
      'july', 'august', 'september', 'october', 'november', 'december'
    ];

    for (let i = 0; i < months.length; i++) {
      const monthName = months[i];
      if (text.includes(monthName)) {
        const dayMatch = text.match(/\b(\d{1,2})(st|nd|rd|th)?\b/);
        const day = dayMatch ? dayMatch[1] : '15';
        const yearMatch = text.match(/\b(202\d)\b/);
        const year = yearMatch ? yearMatch[1] : String(today.getFullYear());
        const d = String(day).padStart(2, '0');
        const m = String(i + 1).padStart(2, '0');
        return `${d}/${m}/${year}`;
      }
    }

    // Direct DD/MM/YYYY match
    const dateMatch = text.match(/\b(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})\b/);
    if (dateMatch) {
      const d = String(dateMatch[1]).padStart(2, '0');
      const m = String(dateMatch[2]).padStart(2, '0');
      let y = dateMatch[3];
      if (y.length === 2) y = '20' + y;
      return `${d}/${m}/${y}`;
    }

    // Default to tomorrow if not recognized
    const defaultDate = new Date();
    defaultDate.setDate(today.getDate() + 1);
    const d = String(defaultDate.getDate()).padStart(2, '0');
    const m = String(defaultDate.getMonth() + 1).padStart(2, '0');
    return `${d}/${m}/${defaultDate.getFullYear()}`;
  };

  // Smart Time Parser from spoken input
  const parseSpokenTime = (input: string): string => {
    const text = input.toLowerCase().trim();

    // Match 10 AM, 10:30 AM, 2 PM, 2:30 PM, etc.
    const timeMatch = text.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/);
    if (timeMatch) {
      let hour = parseInt(timeMatch[1], 10);
      const minute = timeMatch[2] ? timeMatch[2] : '00';
      let ampm = timeMatch[3] ? timeMatch[3].toUpperCase() : '';

      if (!ampm) {
        // If hour is 8, 9, 10, 11 -> AM; if 1, 2, 3, 4, 5, 6 -> PM
        ampm = (hour >= 8 && hour <= 11) ? 'AM' : 'PM';
      }

      return `${String(hour).padStart(2, '0')}:${minute} ${ampm}`;
    }

    if (text.includes('morning')) return '09:00 AM';
    if (text.includes('afternoon')) return '02:00 PM';
    if (text.includes('evening')) return '04:00 PM';

    return '10:00 AM';
  };

  // Handle Voice Input based on current step
  const handleVoiceInput = (raw: string) => {
    const cleaned = raw.trim();
    if (!cleaned) return;

    const currentStep = stepRef.current;

    if (currentStep === 'subject') {
      const cleanSubject = cleaned.replace(/^(my exam is|it is|subject is|subject|exam for)\s+/i, '');
      setSubject(cleanSubject);
      setCurrentInput('');
      setStep('type');
      return;
    }

    if (currentStep === 'type') {
      const lower = cleaned.toLowerCase();
      let matchedType = 'University';
      if (lower.includes('school') || lower.includes('10th') || lower.includes('12th')) matchedType = 'School';
      else if (lower.includes('competitive') || lower.includes('upsc') || lower.includes('jee') || lower.includes('neet')) matchedType = 'Competitive';
      else if (lower.includes('government') || lower.includes('gpsc') || lower.includes('ssc')) matchedType = 'Government';
      else if (lower.includes('university') || lower.includes('college') || lower.includes('degree')) matchedType = 'University';

      setExamType(matchedType);
      setCurrentInput('');
      setStep('date');
      return;
    }

    if (currentStep === 'date') {
      const parsedDate = parseSpokenDate(cleaned);
      setExamDate(parsedDate);
      setCurrentInput('');
      setStep('time');
      return;
    }

    if (currentStep === 'time') {
      const parsedTime = parseSpokenTime(cleaned);
      setExamTime(parsedTime);
      setCurrentInput('');
      setStep('venue');
      return;
    }

    if (currentStep === 'venue') {
      if (cleaned.toLowerCase().includes('current location') || cleaned.toLowerCase().includes('my location')) {
        handleGetGpsVenue();
        return;
      }
      const cleanVenue = cleaned.replace(/^(the venue is|at|venue|location)\s+/i, '');
      setExamVenue(cleanVenue);
      setCurrentInput('');
      setStep('confirm');
      return;
    }

    if (currentStep === 'confirm') {
      if (cleaned.toLowerCase().includes('yes') || cleaned.toLowerCase().includes('confirm') || cleaned.toLowerCase().includes('submit')) {
        submitVoiceRequest();
      }
    }
  };

  // Sync ref on each render
  handleVoiceInputRef.current = handleVoiceInput;

  // Execute step transitions with natural voice prompt
  useEffect(() => {
    stopListening();
    setCurrentInput('');

    if (step === 'subject') {
      speakPrompt(
        "Hello! Let's create your exam scribe request. What is the name of your exam or subject?",
        () => startListening()
      );
    } else if (step === 'type') {
      speakPrompt(
        `Got it, ${subject || 'exam'}. What type of exam is this? You can say School, University, Competitive, or Government.`,
        () => startListening()
      );
    } else if (step === 'date') {
      speakPrompt(
        "Which date is the exam on? You can say tomorrow, day after tomorrow, or a specific date.",
        () => startListening()
      );
    } else if (step === 'time') {
      speakPrompt(
        "What time does the exam start? For example, 10 AM or 2:30 PM.",
        () => startListening()
      );
    } else if (step === 'venue') {
      speakPrompt(
        "Where is the exam venue? Name your college or say current location to use your device GPS.",
        () => startListening()
      );
    } else if (step === 'confirm') {
      speakPrompt(
        `Please confirm your request: ${subject}, ${examType} exam, on ${examDate} at ${examTime} at ${examVenue || 'the venue'}. Say confirm, or tap Submit.`,
        () => startListening()
      );
    }
  }, [step]);

  // GPS auto-geocoding for venue
  const handleGetGpsVenue = async () => {
    setIsLocating(true);
    announceForAccessibility('Detecting your GPS location');
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Denied', 'Please allow location permission to use GPS, or type/speak your venue.');
        return;
      }

      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const geocoded = await Location.reverseGeocodeAsync({
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
      });

      if (geocoded && geocoded.length > 0) {
        const addr = geocoded[0];
        const parts = [addr.name, addr.street, addr.city, addr.region].filter(
          (p) => !!p && p !== 'Unnamed Road' && p !== 'undefined'
        );
        const resolved = parts.join(', ') || 'Current Device Location';
        setExamVenue(resolved);
        setCurrentInput(resolved);
        setStep('confirm');
      } else {
        setExamVenue('Current Device Location');
        setStep('confirm');
      }
    } catch (e: any) {
      Alert.alert('Location Error', e.message || 'Could not fetch GPS coordinates.');
    } finally {
      setIsLocating(false);
    }
  };

  // Final submission into database
  const submitVoiceRequest = async () => {
    if (!profile) {
      Alert.alert('Profile Error', 'Could not load your student profile. Please log in.');
      return;
    }

    if (!subject.trim()) {
      Alert.alert('Missing Field', 'Please provide an exam subject.');
      setStep('subject');
      return;
    }

    setSubmitting(true);
    stopListening();

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('You must be logged in to create a request.');

      const finalDate = examDate || parseSpokenDate('tomorrow');
      const finalTime = examTime || '10:00 AM';
      const finalVenue = examVenue.trim() || 'Venue to be confirmed';

      const payload = {
        student_id: session.user.id,
        student_name: profile.official_name || profile.full_name || 'Student',
        dob: profile.dob || '2000-01-01',
        phone: profile.phone || '',
        emergency_phone: profile.emergency_phone || null,
        exam_type: `${examType} (Voice Request)`,
        exam_language: 'English, Hindi',
        id_proof: profile.aadhar_number || 'Aadhar Verified',
        admit_card_proof: null,
        is_prebooking: 'no',
        status: 'pending',
        subject: subject.trim(),
        exam_date: `${finalDate} | ${finalTime}`,
        exam_venue: finalVenue,
      };

      const { error } = await supabase.from('exam_requests').insert(payload);
      if (error) throw error;

      speakPrompt('Success! Your exam scribe request has been created and is now active.', () => {
        onSuccess();
      });
    } catch (err: any) {
      Alert.alert('Submission Failed', err.message || 'Could not save exam request.');
      setSubmitting(false);
    }
  };

  // Advance manual button click
  const handleNextStep = () => {
    if (currentInput.trim()) {
      handleVoiceInput(currentInput.trim());
    } else if (step === 'date' && !examDate) {
      setExamDate(parseSpokenDate('tomorrow'));
      setStep('time');
    } else if (step === 'time' && !examTime) {
      setExamTime('10:00 AM');
      setStep('venue');
    } else if (step === 'venue' && !examVenue) {
      setExamVenue('College Campus / Exam Center');
      setStep('confirm');
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: '#0f172a' }}>
      {/* Header Bar */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: 18,
          paddingTop: Platform.OS === 'ios' ? 54 : 20,
          paddingBottom: 16,
          borderBottomWidth: 1,
          borderBottomColor: 'rgba(255,255,255,0.1)',
        }}
      >
        <TouchableOpacity
          onPress={() => {
            stopSpeaking();
            stopListening();
            onCancel();
          }}
          accessibilityRole="button"
          accessibilityLabel="Back, Exit Voice Assistant"
          style={{
            width: 40,
            height: 40,
            borderRadius: 20,
            backgroundColor: 'rgba(255,255,255,0.1)',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Feather name="arrow-left" size={20} color="#ffffff" />
        </TouchableOpacity>

        <View style={{ alignItems: 'center' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Ionicons name="sparkles" size={16} color="#60a5fa" />
            <Text style={{ fontFamily: 'Roboto', fontSize: 16, fontWeight: '800', color: '#ffffff', letterSpacing: 0.3 }}>
              Voice Exam Assistant
            </Text>
          </View>
          <Text style={{ fontFamily: 'Roboto', fontSize: 11, color: '#94a3b8', marginTop: 2 }}>
            Hands-Free Request Creator
          </Text>
        </View>

        <TouchableOpacity
          onPress={() => {
            if (!voiceMuted) {
              stopSpeaking();
            }
            setVoiceMuted(!voiceMuted);
          }}
          accessibilityRole="button"
          accessibilityLabel={voiceMuted ? 'Unmute voice' : 'Mute voice'}
          style={{
            width: 40,
            height: 40,
            borderRadius: 20,
            backgroundColor: voiceMuted ? 'rgba(239,68,68,0.2)' : 'rgba(255,255,255,0.1)',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Feather name={voiceMuted ? 'volume-x' : 'volume-2'} size={18} color={voiceMuted ? '#f87171' : '#ffffff'} />
        </TouchableOpacity>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 20, alignItems: 'center', paddingBottom: 40 }}
        keyboardShouldPersistTaps="handled"
      >
        {/* Step Indicator */}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            marginBottom: 24,
            width: '100%',
          }}
        >
          {(['subject', 'type', 'date', 'time', 'venue', 'confirm'] as WizardStep[]).map((s, idx) => {
            const steps: WizardStep[] = ['subject', 'type', 'date', 'time', 'venue', 'confirm'];
            const currentIdx = steps.indexOf(step);
            const isCompleted = idx < currentIdx;
            const isCurrent = idx === currentIdx;

            return (
              <View
                key={s}
                style={{
                  flex: 1,
                  height: 4,
                  borderRadius: 2,
                  backgroundColor: isCurrent ? '#3b82f6' : isCompleted ? '#10b981' : 'rgba(255,255,255,0.15)',
                }}
              />
            );
          })}
        </View>

        {/* AI Assistant Speech Bubble */}
        <View
          style={{
            width: '100%',
            backgroundColor: 'rgba(30,41,59,0.95)',
            borderRadius: 20,
            padding: 18,
            borderWidth: 1,
            borderColor: isSpeaking ? '#3b82f6' : 'rgba(255,255,255,0.1)',
            marginBottom: 26,
            shadowColor: '#3b82f6',
            shadowOffset: { width: 0, height: 6 },
            shadowOpacity: isSpeaking ? 0.3 : 0.05,
            shadowRadius: 16,
            elevation: 4,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <View
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 14,
                  backgroundColor: '#2563eb',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Ionicons name="mic" size={16} color="#ffffff" />
              </View>
              <Text style={{ fontFamily: 'Roboto', fontSize: 13, fontWeight: '700', color: '#93c5fd' }}>
                {isSpeaking ? 'Anulekh is speaking...' : isListening ? 'Anulekh is listening...' : 'Anulekh AI'}
              </Text>
            </View>

            <TouchableOpacity
              onPress={() => {
                if (step === 'subject') speakPrompt("What is the name of your exam or subject?", () => startListening());
                else if (step === 'type') speakPrompt("What type of exam is this? School, University, Competitive, or Government.", () => startListening());
                else if (step === 'date') speakPrompt("Which date is the exam on? You can say tomorrow, or a date like October 25th.", () => startListening());
                else if (step === 'time') speakPrompt("What time does the exam start? For example, 10 AM or 2:30 PM.", () => startListening());
                else if (step === 'venue') speakPrompt("Where is the exam venue? Name your college or say current location.", () => startListening());
                else if (step === 'confirm') speakPrompt(`Please confirm your request for ${subject} on ${examDate} at ${examTime}. Say confirm or tap submit.`, () => startListening());
              }}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.06)' }}
            >
              <Feather name="refresh-cw" size={12} color="#94a3b8" />
              <Text style={{ fontFamily: 'Roboto', fontSize: 11, color: '#94a3b8' }}>Replay</Text>
            </TouchableOpacity>
          </View>

          <Text
            style={{
              fontFamily: 'Roboto',
              fontSize: 17,
              fontWeight: '700',
              color: '#ffffff',
              lineHeight: 24,
            }}
          >
            {step === 'subject' && 'What is the name of your exam or subject?'}
            {step === 'type' && `What type of exam is ${subject || 'this'}?`}
            {step === 'date' && 'Which date is the exam scheduled for?'}
            {step === 'time' && 'What time does the exam start?'}
            {step === 'venue' && 'Where is your exam center or college?'}
            {step === 'confirm' && 'Ready to submit! Review your details below:'}
          </Text>

          {/* Subtext guidelines */}
          <Text style={{ fontFamily: 'Roboto', fontSize: 13, color: '#94a3b8', marginTop: 6 }}>
            {step === 'subject' && 'Speak clearly into your phone mic, e.g. "Mathematics", "Sociology", or "Physics"'}
            {step === 'type' && 'You can speak or tap: School, University, Competitive, or Government'}
            {step === 'date' && 'Say "Tomorrow", "Day after tomorrow", or a specific date like "25th October"'}
            {step === 'time' && 'Say "10 AM", "2:30 PM", or tap a quick time below'}
            {step === 'venue' && 'Say "Current location" for GPS or name your center'}
            {step === 'confirm' && 'Say "Confirm" or tap Create Request to activate it immediately'}
          </Text>
        </View>

        {/* Central Pulsing Mic Orb */}
        <View style={{ alignItems: 'center', justifyContent: 'center', marginVertical: 18, width: 180, height: 180 }}>
          {/* Animated glow rings */}
          <Animated.View
            style={{
              position: 'absolute',
              width: 170,
              height: 170,
              borderRadius: 85,
              backgroundColor: isListening ? 'rgba(59,130,246,0.18)' : 'rgba(37,99,235,0.08)',
              transform: [{ scale: isListening ? pulseAnim : 1 }],
            }}
          />
          <Animated.View
            style={{
              position: 'absolute',
              width: 140,
              height: 140,
              borderRadius: 70,
              backgroundColor: isListening ? 'rgba(96,165,250,0.22)' : 'rgba(37,99,235,0.12)',
              transform: [{ scale: isListening ? pulseAnim : 1 }],
            }}
          />

          <TouchableOpacity
            onPress={() => {
              if (isListening) stopListening();
              else startListening();
            }}
            accessibilityRole="button"
            accessibilityLabel={isListening ? 'Stop listening' : 'Start microphone listening'}
            style={{
              width: 96,
              height: 96,
              borderRadius: 48,
              backgroundColor: isListening ? '#2563eb' : '#1e293b',
              borderWidth: 3,
              borderColor: isListening ? '#60a5fa' : '#334155',
              alignItems: 'center',
              justifyContent: 'center',
              shadowColor: '#2563eb',
              shadowOffset: { width: 0, height: 8 },
              shadowOpacity: 0.5,
              shadowRadius: 20,
              elevation: 8,
            }}
          >
            <Ionicons name={isListening ? 'mic' : 'mic-outline'} size={44} color="#ffffff" />
          </TouchableOpacity>
        </View>

        {/* Live Audio Waveform & Transcript */}
        <View style={{ alignItems: 'center', marginBottom: 20, minHeight: 44, width: '100%' }}>
          {isListening && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 8 }}>
              <Animated.View style={{ width: 4, height: 16, backgroundColor: '#60a5fa', borderRadius: 2, transform: [{ scaleY: waveAnim1 }] }} />
              <Animated.View style={{ width: 4, height: 26, backgroundColor: '#3b82f6', borderRadius: 2, transform: [{ scaleY: waveAnim2 }] }} />
              <Animated.View style={{ width: 4, height: 18, backgroundColor: '#93c5fd', borderRadius: 2, transform: [{ scaleY: waveAnim3 }] }} />
              <Animated.View style={{ width: 4, height: 30, backgroundColor: '#2563eb', borderRadius: 2, transform: [{ scaleY: waveAnim1 }] }} />
              <Animated.View style={{ width: 4, height: 14, backgroundColor: '#60a5fa', borderRadius: 2, transform: [{ scaleY: waveAnim2 }] }} />
              <Text style={{ fontFamily: 'Roboto', fontSize: 12, color: '#93c5fd', marginLeft: 8, fontWeight: '700' }}>
                Listening to you...
              </Text>
            </View>
          )}

          {transcript ? (
            <View style={{ backgroundColor: 'rgba(255,255,255,0.08)', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 12 }}>
              <Text style={{ fontFamily: 'Roboto', fontSize: 14, color: '#e2e8f0', textAlign: 'center' }}>
                "{transcript}"
              </Text>
            </View>
          ) : (
            <Text style={{ fontFamily: 'Roboto', fontSize: 12, color: '#64748b' }}>
              {isListening ? 'Speak now into microphone' : 'Tap microphone to speak'}
            </Text>
          )}
        </View>

        {/* Quick Selection Chips (One-tap or spoken) */}
        {step === 'type' && (
          <View style={{ width: '100%', marginBottom: 18 }}>
            <Text style={{ fontFamily: 'Roboto', fontSize: 12, fontWeight: '700', color: '#94a3b8', marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.5 }}>
              Tap or Speak Exam Type
            </Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {EXAM_TYPE_OPTIONS.map((opt) => (
                <TouchableOpacity
                  key={opt}
                  onPress={() => {
                    setExamType(opt);
                    setStep('date');
                  }}
                  style={{
                    backgroundColor: examType === opt ? '#2563eb' : 'rgba(255,255,255,0.07)',
                    paddingVertical: 10,
                    paddingHorizontal: 16,
                    borderRadius: 12,
                    borderWidth: 1,
                    borderColor: examType === opt ? '#60a5fa' : 'rgba(255,255,255,0.12)',
                  }}
                >
                  <Text style={{ fontFamily: 'Roboto', fontSize: 13, fontWeight: '700', color: '#ffffff' }}>
                    {opt}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {step === 'date' && (
          <View style={{ width: '100%', marginBottom: 18 }}>
            <Text style={{ fontFamily: 'Roboto', fontSize: 12, fontWeight: '700', color: '#94a3b8', marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.5 }}>
              Quick Date Suggestions
            </Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {[
                { label: 'Tomorrow', val: parseSpokenDate('tomorrow') },
                { label: 'Day After Tomorrow', val: parseSpokenDate('day after tomorrow') },
                { label: 'Next Week', val: parseSpokenDate('in 7 days') },
              ].map((d) => (
                <TouchableOpacity
                  key={d.label}
                  onPress={() => {
                    setExamDate(d.val);
                    setStep('time');
                  }}
                  style={{
                    backgroundColor: examDate === d.val ? '#2563eb' : 'rgba(255,255,255,0.07)',
                    paddingVertical: 10,
                    paddingHorizontal: 16,
                    borderRadius: 12,
                    borderWidth: 1,
                    borderColor: examDate === d.val ? '#60a5fa' : 'rgba(255,255,255,0.12)',
                  }}
                >
                  <Text style={{ fontFamily: 'Roboto', fontSize: 13, fontWeight: '700', color: '#ffffff' }}>
                    {d.label} ({d.val})
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {step === 'time' && (
          <View style={{ width: '100%', marginBottom: 18 }}>
            <Text style={{ fontFamily: 'Roboto', fontSize: 12, fontWeight: '700', color: '#94a3b8', marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.5 }}>
              Quick Exam Time
            </Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {['09:00 AM', '10:00 AM', '11:00 AM', '02:00 PM', '03:00 PM'].map((tVal) => (
                <TouchableOpacity
                  key={tVal}
                  onPress={() => {
                    setExamTime(tVal);
                    setStep('venue');
                  }}
                  style={{
                    backgroundColor: examTime === tVal ? '#2563eb' : 'rgba(255,255,255,0.07)',
                    paddingVertical: 10,
                    paddingHorizontal: 16,
                    borderRadius: 12,
                    borderWidth: 1,
                    borderColor: examTime === tVal ? '#60a5fa' : 'rgba(255,255,255,0.12)',
                  }}
                >
                  <Text style={{ fontFamily: 'Roboto', fontSize: 13, fontWeight: '700', color: '#ffffff' }}>
                    {tVal}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {step === 'venue' && (
          <View style={{ width: '100%', marginBottom: 18 }}>
            <Text style={{ fontFamily: 'Roboto', fontSize: 12, fontWeight: '700', color: '#94a3b8', marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.5 }}>
              Venue Options
            </Text>
            <TouchableOpacity
              onPress={handleGetGpsVenue}
              disabled={isLocating}
              style={{
                backgroundColor: 'rgba(37,99,235,0.2)',
                borderWidth: 1.5,
                borderColor: '#3b82f6',
                borderRadius: 14,
                paddingVertical: 12,
                paddingHorizontal: 16,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                marginBottom: 10,
              }}
            >
              {isLocating ? (
                <ActivityIndicator color="#60a5fa" size="small" />
              ) : (
                <Feather name="map-pin" size={16} color="#60a5fa" />
              )}
              <Text style={{ fontFamily: 'Roboto', fontSize: 14, fontWeight: '800', color: '#93c5fd' }}>
                {isLocating ? 'Detecting GPS...' : '📍 Use My Current Location'}
              </Text>
            </TouchableOpacity>

            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {["College Campus Hall", "St. Xavier's College", "Government School Hall"].map((v) => (
                <TouchableOpacity
                  key={v}
                  onPress={() => {
                    setExamVenue(v);
                    setStep('confirm');
                  }}
                  style={{
                    backgroundColor: examVenue === v ? '#2563eb' : 'rgba(255,255,255,0.07)',
                    paddingVertical: 8,
                    paddingHorizontal: 14,
                    borderRadius: 10,
                    borderWidth: 1,
                    borderColor: examVenue === v ? '#60a5fa' : 'rgba(255,255,255,0.12)',
                  }}
                >
                  <Text style={{ fontFamily: 'Roboto', fontSize: 12, color: '#e2e8f0', fontWeight: '600' }}>
                    {v}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {/* Confirmation Summary Card */}
        {step === 'confirm' && (
          <View
            style={{
              width: '100%',
              backgroundColor: 'rgba(15,23,42,0.8)',
              borderRadius: 18,
              borderWidth: 1.5,
              borderColor: '#10b981',
              padding: 18,
              marginBottom: 20,
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 }}>
              <View style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: '#059669', alignItems: 'center', justifyContent: 'center' }}>
                <Feather name="check" size={16} color="#ffffff" />
              </View>
              <Text style={{ fontFamily: 'Roboto', fontSize: 15, fontWeight: '800', color: '#ffffff' }}>
                Active Request Summary
              </Text>
            </View>

            <View style={{ gap: 10 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.08)', paddingBottom: 8 }}>
                <Text style={{ fontFamily: 'Roboto', fontSize: 13, color: '#94a3b8' }}>Subject</Text>
                <Text style={{ fontFamily: 'Roboto', fontSize: 14, fontWeight: '800', color: '#ffffff' }}>{subject}</Text>
              </View>

              <View style={{ flexDirection: 'row', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.08)', paddingBottom: 8 }}>
                <Text style={{ fontFamily: 'Roboto', fontSize: 13, color: '#94a3b8' }}>Exam Type</Text>
                <Text style={{ fontFamily: 'Roboto', fontSize: 14, fontWeight: '700', color: '#93c5fd' }}>{examType}</Text>
              </View>

              <View style={{ flexDirection: 'row', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.08)', paddingBottom: 8 }}>
                <Text style={{ fontFamily: 'Roboto', fontSize: 13, color: '#94a3b8' }}>Date & Time</Text>
                <Text style={{ fontFamily: 'Roboto', fontSize: 14, fontWeight: '700', color: '#34d399' }}>{examDate} | {examTime}</Text>
              </View>

              <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingBottom: 4 }}>
                <Text style={{ fontFamily: 'Roboto', fontSize: 13, color: '#94a3b8' }}>Venue</Text>
                <Text style={{ fontFamily: 'Roboto', fontSize: 13, fontWeight: '600', color: '#e2e8f0', flex: 1, textAlign: 'right', marginLeft: 12 }}>
                  {examVenue || 'Campus Hall'}
                </Text>
              </View>
            </View>
          </View>
        )}

        {/* Manual Keyboard Input Fallback (so user is never stuck in noisy rooms) */}
        {step !== 'confirm' && (
          <View style={{ width: '100%', marginBottom: 14 }}>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                backgroundColor: 'rgba(30,41,59,0.9)',
                borderRadius: 14,
                borderWidth: 1,
                borderColor: 'rgba(255,255,255,0.15)',
                paddingHorizontal: 12,
              }}
            >
              <TextInput
                value={currentInput}
                onChangeText={setCurrentInput}
                placeholder={
                  step === 'subject'
                    ? 'Or type exam subject...'
                    : step === 'type'
                    ? 'Or type exam type...'
                    : step === 'date'
                    ? 'DD/MM/YYYY or "Tomorrow"'
                    : step === 'time'
                    ? 'HH:MM AM/PM'
                    : 'Enter venue or center...'
                }
                placeholderTextColor="#64748b"
                onSubmitEditing={handleNextStep}
                style={{
                  flex: 1,
                  height: 48,
                  color: '#ffffff',
                  fontFamily: 'Roboto',
                  fontSize: 14,
                }}
              />
              {currentInput ? (
                <TouchableOpacity
                  onPress={handleNextStep}
                  style={{
                    backgroundColor: '#2563eb',
                    paddingHorizontal: 14,
                    paddingVertical: 8,
                    borderRadius: 10,
                  }}
                >
                  <Text style={{ fontFamily: 'Roboto', fontSize: 12, fontWeight: '800', color: '#ffffff' }}>
                    Next
                  </Text>
                </TouchableOpacity>
              ) : null}
            </View>
          </View>
        )}

        {/* Action Button: Next or Submit */}
        {step === 'confirm' ? (
          <TouchableOpacity
            onPress={submitVoiceRequest}
            disabled={submitting}
            accessibilityRole="button"
            accessibilityLabel="Create & Activate Request"
            style={{
              width: '100%',
              backgroundColor: '#10b981',
              paddingVertical: 16,
              borderRadius: 16,
              alignItems: 'center',
              justifyContent: 'center',
              flexDirection: 'row',
              gap: 8,
              shadowColor: '#10b981',
              shadowOffset: { width: 0, height: 6 },
              shadowOpacity: 0.35,
              shadowRadius: 14,
              elevation: 5,
            }}
          >
            {submitting ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <>
                <Feather name="check-circle" size={18} color="#ffffff" />
                <Text style={{ fontFamily: 'Roboto', fontSize: 16, fontWeight: '900', color: '#ffffff', letterSpacing: 0.3 }}>
                  Create & Activate Request
                </Text>
              </>
            )}
          </TouchableOpacity>
        ) : (
          <View style={{ flexDirection: 'row', gap: 10, width: '100%' }}>
            {step !== 'subject' && (
              <TouchableOpacity
                onPress={() => {
                  const steps: WizardStep[] = ['subject', 'type', 'date', 'time', 'venue', 'confirm'];
                  const idx = steps.indexOf(step);
                  if (idx > 0) setStep(steps[idx - 1]);
                }}
                style={{
                  flex: 1,
                  backgroundColor: 'rgba(255,255,255,0.08)',
                  paddingVertical: 14,
                  borderRadius: 14,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Text style={{ fontFamily: 'Roboto', fontSize: 14, fontWeight: '700', color: '#94a3b8' }}>
                  Back
                </Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity
              onPress={handleNextStep}
              style={{
                flex: 2,
                backgroundColor: '#2563eb',
                paddingVertical: 14,
                borderRadius: 14,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Text style={{ fontFamily: 'Roboto', fontSize: 14, fontWeight: '800', color: '#ffffff' }}>
                {step === 'venue' ? 'Review Request' : 'Next Step'}
              </Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </View>
  );
}
