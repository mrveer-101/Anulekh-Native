import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput, ActivityIndicator, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { router } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { supabase } from '../../core/supabase';

interface FAQItem {
  question: string;
  answer: string;
}

const FAQ_DATA: FAQItem[] = [
  {
    question: "How do I request a scribe?",
    answer: "Go to your dashboard, click on the '+ Request' button under Active Requests, fill out the exam details (Type of exam, languages, date of birth, grade, and Aadhar Card number), and click 'Generate Request'."
  },
  {
    question: "Is an Aadhar Card mandatory?",
    answer: "Yes, to ensure the security and authenticity of both students and scribes, a valid Aadhar Card number is required to submit a request."
  },
  {
    question: "How long does it take to find a scribe?",
    answer: "Once you generate a request, it becomes visible to all eligible volunteer scribes in your area. Scribes will review and accept the request based on language match and location. You will see the status change to 'Matched' on your dashboard as soon as someone accepts."
  },
  {
    question: "Can I choose multiple languages for my exam?",
    answer: "Yes! In the scribe request form, you can select one or more languages (English, Hindi, Gujarati) if your exam contains bilingual or trilingual sections."
  },
  {
    question: "How can I cancel a request?",
    answer: "Currently, you can view your active requests in the 'My Requests' tab in the sidebar. To cancel or modify a request, please contact our helpdesk directly."
  }
];

export default function SupportScreen() {
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState<'student' | 'scribe'>('student');
  const [openFaqIndex, setOpenFaqIndex] = useState<number | null>(null);
  
  // Feedback Form State
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    fetchUserRole();
  }, []);

  const fetchUserRole = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.replace('/auth/login');
        return;
      }

      const { data: profile, error } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', session.user.id)
        .single();

      if (error) throw error;
      if (profile) {
        setRole(profile.role || 'student');
      }
    } catch (error) {
      console.error('Error fetching user role for support:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSendFeedback = async () => {
    if (!message.trim()) {
      Alert.alert('Empty Message', 'Please write something before sending.');
      return;
    }

    setSending(true);
    // Simulate sending feedback
    setTimeout(() => {
      setSending(false);
      setMessage('');
      Alert.alert('Message Sent', 'Thank you for contacting us! Our team will get back to you shortly.');
    }, 1500);
  };

  const toggleFaq = (index: number) => {
    setOpenFaqIndex(openFaqIndex === index ? null : index);
  };

  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace(isStudent ? '/console/student' : '/console/scribe');
    }
  };

  const isStudent = role === 'student';
  const themeColorClass = isStudent ? 'bg-blue-500 active:bg-blue-600' : 'bg-emerald-500 active:bg-emerald-600';
  const themeTextClass = isStudent ? 'text-blue-600' : 'text-emerald-600';
  const themeBgClass = isStudent ? 'bg-blue-50' : 'bg-emerald-50';

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
          <Text className="text-xl font-black text-slate-800">Help & Support</Text>
        </View>
      </View>

      <ScrollView className="flex-1 px-6 py-6" contentContainerStyle={{ paddingBottom: 40 }}>
        
        {/* Contact Cards */}
        <View className="flex-row gap-4 mb-6">
          <View className="flex-1 bg-white p-5 rounded-2xl border border-slate-100 shadow-sm items-center">
            <View className={`w-10 h-10 rounded-full ${themeBgClass} items-center justify-center mb-3`}>
              <Feather name="mail" size={20} color={isStudent ? '#2563eb' : '#059669'} />
            </View>
            <Text className="font-bold text-slate-800">Email Us</Text>
            <Text className="text-slate-400 text-xs mt-1 text-center">support@anulekh.org</Text>
          </View>

          <View className="flex-1 bg-white p-5 rounded-2xl border border-slate-100 shadow-sm items-center">
            <View className={`w-10 h-10 rounded-full ${themeBgClass} items-center justify-center mb-3`}>
              <Feather name="phone" size={20} color={isStudent ? '#2563eb' : '#059669'} />
            </View>
            <Text className="font-bold text-slate-800">Call Support</Text>
            <Text className="text-slate-400 text-xs mt-1 text-center">+91 1800-123-456</Text>
          </View>
        </View>

        {/* FAQs */}
        <View className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm mb-6">
          <Text className="text-sm font-bold text-slate-800 uppercase tracking-wider mb-4">Frequently Asked Questions</Text>
          
          <View className="space-y-3">
            {FAQ_DATA.map((faq, index) => {
              const isOpen = openFaqIndex === index;
              return (
                <View key={index} className="border-b border-slate-100 pb-3 last:border-b-0 last:pb-0">
                  <TouchableOpacity 
                    onPress={() => toggleFaq(index)}
                    className="flex-row items-center justify-between py-2"
                  >
                    <Text className="text-base font-semibold text-slate-800 flex-1 pr-4">{faq.question}</Text>
                    <Feather name={isOpen ? "chevron-up" : "chevron-down"} size={20} color="#94a3b8" />
                  </TouchableOpacity>
                  
                  {isOpen && (
                    <Text className="text-slate-500 text-sm mt-2 leading-relaxed">
                      {faq.answer}
                    </Text>
                  )}
                </View>
              );
            })}
          </View>
        </View>

        {/* Contact Form */}
        <View className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
          <Text className="text-sm font-bold text-slate-800 uppercase tracking-wider mb-1">Send us a Message</Text>
          <Text className="text-slate-400 text-xs mb-4">Have an issue or suggestion? Drop us a line below.</Text>
          
          <TextInput 
            value={message}
            onChangeText={setMessage}
            multiline
            numberOfLines={4}
            placeholder="Type your query or feedback here..."
            textAlignVertical="top"
            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3.5 text-slate-800 focus:border-blue-500 focus:bg-white h-32 mb-4"
          />

          <TouchableOpacity 
            onPress={handleSendFeedback}
            disabled={sending}
            className={`w-full ${themeColorClass} py-4 rounded-xl items-center justify-center shadow-lg`}
          >
            {sending ? (
              <ActivityIndicator color="white" />
            ) : (
              <Text className="text-white font-bold text-base">Send Message</Text>
            )}
          </TouchableOpacity>
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}
