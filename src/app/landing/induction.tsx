import React, { useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { View, Text, TouchableOpacity, ScrollView, Image as RNImage } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { router } from 'expo-router';
import { Feather } from '@expo/vector-icons';

// Translation dictionary for English, Hindi, and Gujarati
const TRANSLATIONS: Record<string, {
  back: string;
  skip: string;
  next: string;
  selectLanguageTitle: string;
  selectLanguageSub: string;
  closeBtn: string;
  step4Title: string;
  step4Sub: string;
  studentBtn: string;
  scribeBtn: string;
  slides: Array<{ title: string; desc: string }>;
}> = {
  English: {
    back: 'Back',
    skip: 'Skip',
    next: 'Next',
    selectLanguageTitle: 'Select Language',
    selectLanguageSub: 'Choose your preferred language for the app',
    closeBtn: 'Close',
    step4Title: 'Choose Account Type',
    step4Sub: 'Select how you would like to participate in the Anulekh community.',
    studentBtn: 'I need a Scribe',
    scribeBtn: 'I want to Volunteer',
    slides: [
      {
        title: 'A Scribe for Every Voice',
        desc: 'Anulekh matches visually impaired students with volunteers, acting as a direct channel of writing for their voice.'
      },
      {
        title: 'Request Assistance',
        desc: 'Students can post an upcoming exam request specifying the venue, date, and language. We search for scribes within a 10km radius.'
      },
      {
        title: 'Lend Your Hands',
        desc: 'As a volunteer scribe, you get notified of local exam requests matching your language expertise. Help a student achieve educational equality.'
      }
    ]
  },
  Hindi: {
    back: 'पीछे',
    skip: 'छोड़ें',
    next: 'आगे',
    selectLanguageTitle: 'भाषा चुनें',
    selectLanguageSub: 'ऐप के लिए अपनी पसंदीदा भाषा चुनें',
    closeBtn: 'बंद करें',
    step4Title: 'खाते का प्रकार चुनें',
    step4Sub: 'चुनें कि आप अनुलेख समुदाय में कैसे भाग लेना चाहते हैं।',
    studentBtn: 'मुझे एक लेखक चाहिए',
    scribeBtn: 'मैं स्वयंसेवक बनना चाहता हूँ',
    slides: [
      {
        title: 'हर आवाज के लिए एक लेखक',
        desc: 'अनुलेख दृष्टिबाधित छात्रों को स्वयंसेवक लेखकों से मिलाता है, जो उनकी आवाज के लिए लेखन के सीधे माध्यम के रूप में कार्य करते हैं।'
      },
      {
        title: 'सहायता का अनुरोध करें',
        desc: 'छात्र परीक्षा स्थान, तिथि और भाषा निर्दिष्ट करते हुए आगामी परीक्षा अनुरोध पोस्ट कर सकते हैं। हम 10 किमी के दायरे में लेखकों की खोज करते हैं।'
      },
      {
        title: 'अपने हाथ बढ़ाएं',
        desc: 'एक स्वयंसेवक लेखक के रूप में, आपको अपनी भाषा विशेषज्ञता से मेल खाने वाले स्थानीय परीक्षा अनुरोधों की सूचना मिलती है। छात्र को शैक्षिक समानता प्राप्त करने में मदद करें।'
      }
    ]
  },
  Gujarati: {
    back: 'પાછા',
    skip: 'છોડી દો',
    next: 'આગળ',
    selectLanguageTitle: 'ભાષા પસંદ કરો',
    selectLanguageSub: 'એપ માટે તમારી પસંદગીની ભાષા પસંદ કરો',
    closeBtn: 'બંધ કરો',
    step4Title: 'ખાતાનો પ્રકાર પસંદ કરો',
    step4Sub: 'પસંદ કરો કે તમે અનુલેખ સમુદાયમાં કેવી રીતે ભાગ લેવા માંગો છો.',
    studentBtn: 'મારે એક લેખક જોઈએ છે',
    scribeBtn: 'હું સ્વયંસેવક બનવા માંગુ છું',
    slides: [
      {
        title: 'દરેક અવાજ માટે એક લેખક',
        desc: 'અનુલેખ દ્રષ્ટિહીન વિદ્યાર્થીઓને સ્વયંસેવક લેખકો સાથે જોડે છે, જે તેમના અવાજ માટે લખવાના સીધા માધ્યમ તરીકે કામ કરે છે।'
      },
      {
        title: 'સહાયતા માટે વિનંતી કરો',
        desc: 'વિદ્યાર્થીઓ પરીક્ષા સ્થળ, તારીખ અને ભાષા સ્પષ્ટ કરીને આગામી પરીક્ષા માટે વિનંતી મોકલી શકે છે. અમે 10 કિમીની ત્રિજ્યામાં લેખકોની શોધ કરીએ છીએ.'
      },
      {
        title: 'તમારો હાથ લંબાવો',
        desc: 'એક સ્વયંસેવક લેખક તરીકે, તમને તમારી ભાષા કુશળતા સાથે મેળ ખાતી સ્થાનિક પરીક્ષાની વિનંતીઓની સૂદના મળે છે. વિદ્યાર્થીને શૈક્ષણિક સમાનતા પ્રાપ્ત કરવામાં મદદ કરો.'
      }
    ]
  }
};

/**
 * OnboardingCarousel Component (Light Theme + Localized Demo + Floating Header Buttons)
 * 
 * An interactive, 4-step introduction carousel designed for the Anulekh application.
 * Features dynamic language translation, blue-500 branding accents, and floating shadow elements.
 */
export default function OnboardingCarousel() {
  // Onboarding slide index (0 to 3)
  const [currentStep, setCurrentStep] = useState(0);
  const totalSteps = 4;

  // Language selection states
  const [showLanguageModal, setShowLanguageModal] = useState(false);
  const [appLanguage, setAppLanguage] = useState<'English' | 'Hindi' | 'Gujarati'>('English');

  // Fetch active translation strings
  const t = TRANSLATIONS[appLanguage];

  // Handler to advance to the next slide
  const handleNext = () => {
    if (currentStep < totalSteps - 1) {
      setCurrentStep(currentStep + 1);
    }
  };

  // Handler to return to the previous slide
  const handleBack = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  // Routing actions for user roles — mark onboarding complete before navigating to registration
  const handleNavigateToStudent = async () => {
    await AsyncStorage.setItem('onboarding_complete', 'true');
    router.push('/auth/register?role=student');
  };

  const handleNavigateToScribe = async () => {
    await AsyncStorage.setItem('onboarding_complete', 'true');
    router.push('/auth/register?role=scribe');
  };

  return (
    <View style={{ flex: 1, backgroundColor: '#f0f4ff' }}>
      <StatusBar style="dark" />

      {/* Soft background pastel orbs */}
      <View style={{
        position: 'absolute', top: -100, left: -80,
        width: 320, height: 320, borderRadius: 160,
        backgroundColor: 'rgba(37,99,235,0.18)',
      }} />
      <View style={{
        position: 'absolute', bottom: -80, right: -60,
        width: 280, height: 280, borderRadius: 140,
        backgroundColor: 'rgba(16,185,129,0.12)',
      }} />

      <SafeAreaView style={{ flex: 1 }}>
      
      {/* 
        TOP HEADER BAR: Progress & Quick Actions
        Contains back button/language switcher, step dots, and skip button.
      */}
      <View 
        style={{
          paddingTop: Platform.OS === 'android' ? 20 : 8,
          paddingHorizontal: 24,
          paddingBottom: 14,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
        accessible={true}
        accessibilityLabel={`Onboarding Progress: Step ${currentStep + 1} of ${totalSteps}`}
      >
        {/* 
          LEFT SLOT: 
          - Slide 1: Renders the Language selection button with floating white bg + shadow.
          - Slides 2, 3, 4: Renders the Back button with floating white bg + shadow.
        */}
        {currentStep === 0 ? (
          <TouchableOpacity
            onPress={() => setShowLanguageModal(true)}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              paddingVertical: 8,
              paddingHorizontal: 14,
              backgroundColor: '#ffffff',
              borderWidth: 1.5,
              borderColor: '#e2e8f0',
              borderRadius: 12,
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 2 },
              shadowOpacity: 0.06,
              shadowRadius: 6,
              elevation: 2,
            }}
            accessible={true}
            accessibilityRole="button"
            accessibilityLabel={`Select Language. Current: ${appLanguage}. Button`}
            accessibilityHint="Opens language selection sheet"
          >
            <Text style={{ color: '#2563eb', fontWeight: '800', fontSize: 13 }}>
              🌐 {appLanguage === 'Hindi' ? 'हिन्दी' : appLanguage === 'Gujarati' ? 'ગુજરાતી' : 'EN'}
            </Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity 
            onPress={handleBack} 
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              paddingVertical: 8,
              paddingHorizontal: 14,
              backgroundColor: '#ffffff',
              borderWidth: 1.5,
              borderColor: '#e2e8f0',
              borderRadius: 12,
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 2 },
              shadowOpacity: 0.06,
              shadowRadius: 6,
              elevation: 2,
            }}
            accessible={true}
            accessibilityRole="button"
            accessibilityLabel={`${t.back}, button`}
            accessibilityHint="Goes back to the previous onboarding slide"
          >
            <Text style={{ color: '#2563eb', fontWeight: '800', fontSize: 13 }}>{t.back}</Text>
          </TouchableOpacity>
        )}

        {/* Progress indicators (Dots / Pills) */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          {Array.from({ length: totalSteps }).map((_, index) => (
            <View 
              key={index}
              style={{
                height: 8,
                borderRadius: 4,
                width: index === currentStep ? 32 : 8,
                backgroundColor: index === currentStep ? '#2563eb' : '#cbd5e1',
              }}
            />
          ))}
        </View>

        {/* 
          RIGHT SLOT: 
          - Slides 1, 2, 3: Renders the Skip button with floating white bg + shadow.
          - Slide 4: Renders an empty placeholder to keep the header aligned.
        */}
        {currentStep < totalSteps - 1 ? (
          <TouchableOpacity 
            onPress={() => setCurrentStep(totalSteps - 1)}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              paddingVertical: 8,
              paddingHorizontal: 14,
              backgroundColor: '#ffffff',
              borderWidth: 1.5,
              borderColor: '#e2e8f0',
              borderRadius: 12,
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 2 },
              shadowOpacity: 0.06,
              shadowRadius: 6,
              elevation: 2,
            }}
            accessible={true}
            accessibilityRole="button"
            accessibilityLabel={`${t.skip}, button`}
            accessibilityHint="Skips straight to selecting student or volunteer role"
          >
            <Text style={{ color: '#2563eb', fontWeight: '800', fontSize: 13 }}>{t.skip}</Text>
          </TouchableOpacity>
        ) : (
          <View style={{ width: 64 }} />
        )}
      </View>

      {/* 
        MAIN CONTENT BODY
        Renders different slide cards based on currentStep state.
      */}
      <ScrollView 
        contentContainerStyle={{ flexGrow: 1, justifyContent: 'center' }} 
        className="px-6 py-4"
      >
        
        {/* SLIDE 1: Primary Branding Introduction */}
        {currentStep === 0 && (
          <View style={{
            backgroundColor: '#ffffff',
            borderWidth: 1.5, borderColor: '#e2e8f0',
            borderRadius: 28, padding: 32, alignItems: 'center',
            shadowColor: '#64748b', shadowOffset: { width: 0, height: 12 },
            shadowOpacity: 0.08, shadowRadius: 24, elevation: 5,
            width: '100%', maxWidth: 340, alignSelf: 'center',
            minHeight: 400, justifyContent: 'center',
          }}>
            {/* Clean rounded container for the logo */}
            <View style={{
              width: 110,
              height: 110,
              backgroundColor: '#ffffff',
              borderWidth: 1.5,
              borderColor: '#e2e8f0',
              borderRadius: 24,
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: 24,
              shadowColor: '#2563eb',
              shadowOffset: { width: 0, height: 8 },
              shadowOpacity: 0.12,
              shadowRadius: 16,
              elevation: 4,
              padding: 6,
            }}>
              <RNImage 
                source={require('../../../assets/images/custom/Pen_Logo.jpg')} 
                style={{
                  width: '100%',
                  height: '100%',
                  borderRadius: 18,
                }}
                resizeMode="contain"
                accessible={true}
                accessibilityLabel="Anulekh Logo"
              />
            </View>

            <Text 
              className="text-2xl font-black text-slate-900 text-center tracking-tight px-2"
              accessible={true}
              accessibilityRole="header"
              accessibilityLabel={t.slides[0].title}
            >
              {t.slides[0].title}
            </Text>
            
            <Text className="text-slate-600 text-center mt-5 text-sm leading-relaxed max-w-xs">
              {t.slides[0].desc}
            </Text>
          </View>
        )}

        {/* SLIDE 2: Student Flow explanation */}
        {currentStep === 1 && (
          <View style={{
            backgroundColor: '#ffffff',
            borderWidth: 1.5, borderColor: '#e2e8f0',
            borderRadius: 28, padding: 32, alignItems: 'center',
            shadowColor: '#2563eb', shadowOffset: { width: 0, height: 12 },
            shadowOpacity: 0.08, shadowRadius: 24, elevation: 5,
            width: '100%', maxWidth: 340, alignSelf: 'center',
            minHeight: 400, justifyContent: 'center',
          }}>
            {/* Minimalist Book-open outline icon */}
            <View 
              style={{
                width: 96, height: 96,
                backgroundColor: 'rgba(37,99,235,0.08)',
                borderWidth: 1.5, borderColor: 'rgba(37,99,235,0.22)',
                borderRadius: 48,
                alignItems: 'center', justifyContent: 'center',
                marginBottom: 28,
                shadowColor: '#2563eb', shadowOffset: { width: 0, height: 8 },
                shadowOpacity: 0.12, shadowRadius: 16, elevation: 4,
              }}
            >
              <Feather name="book-open" size={42} color="#2563eb" />
            </View>

            <Text 
              className="text-2xl font-black text-slate-900 text-center px-2"
              accessible={true}
              accessibilityRole="header"
              accessibilityLabel={t.slides[1].title}
            >
              {t.slides[1].title}
            </Text>
            
            <Text className="text-slate-600 text-center mt-5 text-sm leading-relaxed max-w-xs">
              {t.slides[1].desc}
            </Text>
          </View>
        )}

        {/* SLIDE 3: Scribe Flow explanation */}
        {currentStep === 2 && (
          <View style={{
            backgroundColor: '#ffffff',
            borderWidth: 1.5, borderColor: '#e2e8f0',
            borderRadius: 28, padding: 32, alignItems: 'center',
            shadowColor: '#10b981', shadowOffset: { width: 0, height: 12 },
            shadowOpacity: 0.08, shadowRadius: 24, elevation: 5,
            width: '100%', maxWidth: 340, alignSelf: 'center',
            minHeight: 400, justifyContent: 'center',
          }}>
            {/* Minimalist Users outline icon representing community connection */}
            <View 
              style={{
                width: 96, height: 96,
                backgroundColor: 'rgba(16,185,129,0.08)',
                borderWidth: 1.5, borderColor: 'rgba(16,185,129,0.22)',
                borderRadius: 48,
                alignItems: 'center', justifyContent: 'center',
                marginBottom: 28,
                shadowColor: '#10b981', shadowOffset: { width: 0, height: 8 },
                shadowOpacity: 0.12, shadowRadius: 16, elevation: 4,
              }}
            >
              <Feather name="users" size={42} color="#10b981" />
            </View>

            <Text 
              className="text-2xl font-black text-slate-900 text-center px-2"
              accessible={true}
              accessibilityRole="header"
              accessibilityLabel={t.slides[2].title}
            >
              {t.slides[2].title}
            </Text>
            
            <Text className="text-slate-600 text-center mt-5 text-sm leading-relaxed max-w-xs">
              {t.slides[2].desc}
            </Text>
          </View>
        )}

        {/* SLIDE 4: Call-To-Action & Role Selection Gate */}
        {currentStep === 3 && (
          <View style={{
            backgroundColor: '#ffffff',
            borderWidth: 1.5, borderColor: '#e2e8f0',
            borderRadius: 28, padding: 32, alignItems: 'center',
            shadowColor: '#64748b', shadowOffset: { width: 0, height: 12 },
            shadowOpacity: 0.08, shadowRadius: 24, elevation: 5,
            width: '100%', maxWidth: 340, alignSelf: 'center',
            minHeight: 450, justifyContent: 'center',
          }}>
            {/* White rounded corner square container for the logo */}
            <View style={{
              width: 100,
              height: 100,
              backgroundColor: '#ffffff',
              borderWidth: 1.5,
              borderColor: '#e2e8f0',
              borderRadius: 22,
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: 20,
              shadowColor: '#64748b',
              shadowOffset: { width: 0, height: 6 },
              shadowOpacity: 0.08,
              shadowRadius: 12,
              elevation: 2,
              padding: 6,
            }}>
              <RNImage 
                source={require('../../../assets/images/custom/Pen_Logo.jpg')} 
                style={{
                  width: '100%',
                  height: '100%',
                  borderRadius: 14,
                }}
                resizeMode="contain"
                accessible={true}
                accessibilityLabel="Anulekh Logo"
              />
            </View>
            
            <Text 
              className="text-2xl font-black text-slate-900 text-center px-2"
              accessible={true}
              accessibilityRole="header"
              accessibilityLabel={t.step4Title}
            >
              {t.step4Title}
            </Text>
            
            <Text className="text-slate-500 text-center mt-3 text-sm max-w-xs mb-6">
              {t.step4Sub}
            </Text>

            <View className="space-y-4 w-full">
              {/* Student CTA Button (Solid Brand Blue 500 + Shadow Glow) */}
              <TouchableOpacity 
                onPress={handleNavigateToStudent}
                className="w-full bg-blue-500 active:bg-blue-600 py-4 px-6 rounded-xl items-center justify-center shadow-lg shadow-blue-500/25"
                accessible={true}
                accessibilityRole="button"
                accessibilityLabel={`${t.studentBtn}, button`}
                accessibilityHint="Double tap to register or log in as a student in need of a scribe"
                activeOpacity={0.85}
              >
                <Text className="text-white text-base font-bold">
                  {t.studentBtn}
                </Text>
              </TouchableOpacity>

              {/* Scribe CTA Button (Solid Volunteer Emerald 500 + Shadow Glow) */}
              <TouchableOpacity 
                onPress={handleNavigateToScribe}
                className="w-full bg-emerald-500 active:bg-emerald-600 py-4 px-6 rounded-xl items-center justify-center mt-4 shadow-lg shadow-emerald-500/25"
                accessible={true}
                accessibilityRole="button"
                accessibilityLabel={`${t.scribeBtn}, button`}
                accessibilityHint="Double tap to register or log in as a volunteer scribe"
                activeOpacity={0.85}
              >
                <Text className="text-white text-base font-bold">
                  {t.scribeBtn}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </ScrollView>

      {/* 
        BOTTOM NAVIGATION BAR (Floating Pill Button)
        Rendered only when onboarding slides are in progress.
      */}
      {currentStep < totalSteps - 1 && (
        <View style={{ paddingHorizontal: 24, paddingBottom: Platform.OS === 'android' ? 24 : 16, paddingTop: 8 }}>
          <TouchableOpacity 
            onPress={handleNext}
            style={{
              width: '100%',
              backgroundColor: '#2563eb',
              paddingVertical: 16,
              borderRadius: 18,
              alignItems: 'center',
              justifyContent: 'center',
              shadowColor: '#2563eb',
              shadowOffset: { width: 0, height: 8 },
              shadowOpacity: 0.3,
              shadowRadius: 16,
              elevation: 6,
            }}
            accessible={true}
            accessibilityRole="button"
            accessibilityLabel={`${t.next}, button`}
            accessibilityHint="Goes to the next onboarding screen"
            activeOpacity={0.85}
          >
            <Text style={{ color: '#ffffff', fontSize: 17, fontWeight: '800' }}>{t.next}</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* 
        LANGUAGE SELECTION BOTTOM SHEET MODAL
      */}
      {showLanguageModal && (
        <View className="absolute inset-0 z-50 flex-col justify-end">
          {/* Dimming Backdrop Overlay */}
          <TouchableOpacity 
            activeOpacity={1} 
            onPress={() => setShowLanguageModal(false)} 
            className="absolute inset-0 bg-black/45"
            accessible={true}
            accessibilityLabel="Close language selector backdrop, button"
            accessibilityHint="Tap anywhere outside to close the language modal"
          />
          
          {/* Modal Container */}
          <View className="bg-white rounded-t-3xl p-6 border-t border-slate-100 shadow-2xl z-50">
            <View className="items-center mb-6">
              {/* Decorative handle bar */}
              <View className="w-12 h-1 bg-slate-200 rounded-full mb-4" />
              <Text className="text-lg font-bold text-slate-900">{t.selectLanguageTitle}</Text>
              <Text className="text-slate-500 text-xs mt-1">{t.selectLanguageSub}</Text>
            </View>

            {/* Language Selection List */}
            <View className="mb-6">
              {['English', 'Hindi', 'Gujarati'].map((lang) => {
                const isSelected = appLanguage === lang;
                
                // Display translation values
                const localizedNames: Record<string, string> = {
                  English: 'English',
                  Hindi: 'हिन्दी (Hindi)',
                  Gujarati: 'ગુજરાતી (Gujarati)'
                };

                return (
                  <TouchableOpacity
                    key={lang}
                    onPress={() => {
                      setAppLanguage(lang as 'English' | 'Hindi' | 'Gujarati');
                      setShowLanguageModal(false);
                    }}
                    className={`w-full py-4 px-5 rounded-xl border flex-row items-center justify-between mt-3 ${
                      isSelected 
                        ? 'bg-blue-50 border-blue-400' 
                        : 'bg-slate-50 border-slate-200'
                    }`}
                    accessible={true}
                    accessibilityRole="checkbox"
                    accessibilityLabel={localizedNames[lang]}
                    accessibilityState={{ checked: isSelected }}
                  >
                    <Text className={`font-semibold text-base ${isSelected ? 'text-blue-500' : 'text-slate-800'}`}>
                      {localizedNames[lang]}
                    </Text>
                    {isSelected && (
                      <Text className="text-blue-500 font-bold text-lg">✓</Text>
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Close Modal Button */}
            <TouchableOpacity
              onPress={() => setShowLanguageModal(false)}
              className="w-full bg-slate-900 active:bg-slate-800 py-4 rounded-xl items-center justify-center"
              accessible={true}
              accessibilityRole="button"
              accessibilityLabel={`${t.closeBtn}, button`}
            >
              <Text className="text-white font-bold text-base">{t.closeBtn}</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

    </SafeAreaView>
    </View>
  );
}
