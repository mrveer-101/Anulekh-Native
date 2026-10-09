/**
 * Onboarding / induction carousel — route `/landing/induction`.
 *
 * Opened from the "Get Started" buttons on the mobile landing screen
 * (`app/landing/index.tsx`) and the desktop landing page (LandingPC,
 * HeaderPC, FooterPC). Four steps: brand intro, how students request help,
 * how scribes volunteer, and a role picker that sends the user to
 * `/auth/register?role=student` or `/auth/register?role=scribe`.
 *
 * Loads no backend data. A language bottom sheet opens automatically on
 * start; the choice goes through the shared `useLanguage()` hook (persisted
 * in AsyncStorage as `app_language`) so it carries into registration, while
 * this screen's own copy comes from the local TRANSLATIONS table. Choosing a
 * role writes `onboarding_complete = 'true'` to AsyncStorage.
 *
 * Accessibility: all controls have roles/labels/hints, slide titles are
 * headers, language options are radios, and every animation is disabled when
 * the OS "Reduce Motion" setting is on.
 */
import React, { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { View, Text, TouchableOpacity, ScrollView, Image as RNImage, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { router } from 'expo-router';
import { Feather, FontAwesome5 } from '@expo/vector-icons';
import Animated, {
  Easing,
  FadeIn,
  FadeInDown,
  FadeInLeft,
  FadeInRight,
  SlideInDown,
  interpolateColor,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useLanguage } from '@/core/translation';

// Translation dictionary for English, Hindi, and Gujarati
/**
 * Screen-local copy, keyed by the language name used by `useLanguage()`
 * ('English' | 'Hindi' | 'Gujarati'). `slides[0..2]` hold the title and
 * description for steps 1-3; `step4*`, `studentBtn` and `scribeBtn` are for
 * the role-selection step; the rest label header, footer and sheet buttons.
 */
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

// Header buttons: ~44px touch targets with light brand tints (blue = language/back, orange = skip).
// Solid tints rather than translucent ones, so Android elevation shadows render cleanly.
const HEADER_BUTTON = {
  flexDirection: 'row',
  alignItems: 'center',
  gap: 5,
  paddingVertical: 11,
  paddingHorizontal: 14,
  borderRadius: 14,
  borderWidth: 1.5,
  shadowOffset: { width: 0, height: 3 },
  shadowOpacity: 0.14,
  shadowRadius: 8,
  elevation: 3,
} as const;
/** Colour variants of HEADER_BUTTON plus the matching text style / colours. */
const HEADER_BUTTON_BLUE = { ...HEADER_BUTTON, backgroundColor: '#EAF1FF', borderColor: '#BFD3FB', shadowColor: '#2563eb' };
const HEADER_BUTTON_ORANGE = { ...HEADER_BUTTON, backgroundColor: '#FFF1E5', borderColor: '#FDC9A3', shadowColor: '#ea580c' };
const HEADER_BUTTON_TEXT = { fontWeight: '800', fontSize: 15 } as const;
const HEADER_BLUE_TEXT = '#1d4ed8';
const HEADER_ORANGE_TEXT = '#c2410c';

// Soft background tints that shift with each step so every slide feels distinct.
const ORB_TOP_COLORS = ['rgba(37,99,235,0.18)', 'rgba(79,70,229,0.18)', 'rgba(16,185,129,0.18)', 'rgba(249,115,22,0.14)'];
const ORB_BOTTOM_COLORS = ['rgba(16,185,129,0.12)', 'rgba(37,99,235,0.12)', 'rgba(234,179,8,0.14)', 'rgba(37,99,235,0.12)'];

/** Progress pill that smoothly stretches and recolours when it becomes the active step. */
/**
 * @param active       true for the dot of the current step (wide + blue).
 * @param reduceMotion when true the change is applied instantly (0ms).
 */
function ProgressDot({ active, reduceMotion }: { active: boolean; reduceMotion: boolean }) {
  // 0 = inactive (8px grey dot), 1 = active (32px blue pill); animated in between.
  const progress = useSharedValue(active ? 1 : 0);
  useEffect(() => {
    progress.set(withTiming(active ? 1 : 0, { duration: reduceMotion ? 0 : 300, easing: Easing.out(Easing.cubic) }));
  }, [active, reduceMotion, progress]);
  const style = useAnimatedStyle(() => ({
    width: 8 + progress.get() * 24,
    backgroundColor: interpolateColor(progress.get(), [0, 1], ['#cbd5e1', '#2563eb']),
  }));
  return <Animated.View style={[{ height: 8, borderRadius: 4 }, style]} />;
}

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
  // Shared app language: the choice made here carries into registration and the rest of the app.
  const { lang: appLanguage, changeLanguage } = useLanguage();

  // Open the language picker as soon as the intro starts, so language is the first choice the user makes.
  useEffect(() => {
    const timer = setTimeout(() => setShowLanguageModal(true), 500);
    return () => clearTimeout(timer);
  }, []);

  // Animation state: slide direction (1 = forward, -1 = back) and the OS "Reduce Motion" preference.
  const [direction, setDirection] = useState<1 | -1>(1);
  const reduceMotion = useReducedMotion();
  /**
   * Wrap a Reanimated `entering` animation so it is dropped (undefined) when
   * Reduce Motion is on; used for every entering animation on this screen.
   */
  const enter = <T,>(animation: T) => (reduceMotion ? undefined : animation);

  // Background orbs drift between per-slide tints.
  const stepProgress = useSharedValue(0);
  useEffect(() => {
    stepProgress.set(withTiming(currentStep, { duration: reduceMotion ? 0 : 600 }));
  }, [currentStep, reduceMotion, stepProgress]);
  const orbTopStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(stepProgress.get(), [0, 1, 2, 3], ORB_TOP_COLORS),
  }));
  const orbBottomStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(stepProgress.get(), [0, 1, 2, 3], ORB_BOTTOM_COLORS),
  }));

  // Fetch active translation strings
  // (local table, not the shared `t()` from useLanguage — keys must match its language names)
  const t = TRANSLATIONS[appLanguage];

  // Handler to advance to the next slide
  const handleNext = () => {
    if (currentStep < totalSteps - 1) {
      setDirection(1);
      setCurrentStep(currentStep + 1);
    }
  };

  // Handler to return to the previous slide
  const handleBack = () => {
    if (currentStep > 0) {
      setDirection(-1);
      setCurrentStep(currentStep - 1);
    }
  };

  // Routing actions for user roles — mark onboarding complete before navigating to registration
  // (`onboarding_complete` is only written here; nothing in the app reads it yet.)
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
      <Animated.View style={[{
        position: 'absolute', top: -100, left: -80,
        width: 320, height: 320, borderRadius: 160,
      }, orbTopStyle]} />
      <Animated.View style={[{
        position: 'absolute', bottom: -80, right: -60,
        width: 280, height: 280, borderRadius: 140,
      }, orbBottomStyle]} />

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
          - Slide 1: Language selection button (light blue).
          - Slides 2, 3, 4: Back button (light blue).
        */}
        {currentStep === 0 ? (
          <TouchableOpacity
            onPress={() => setShowLanguageModal(true)}
            activeOpacity={0.75}
            style={HEADER_BUTTON_BLUE}
            accessible={true}
            accessibilityRole="button"
            accessibilityLabel={`Select Language. Current: ${appLanguage}. Button`}
            accessibilityHint="Opens language selection sheet"
          >
            <Feather name="globe" size={16} color={HEADER_BLUE_TEXT} />
            <Text style={[HEADER_BUTTON_TEXT, { color: HEADER_BLUE_TEXT }]}>
              {appLanguage === 'Hindi' ? 'हिन्दी' : appLanguage === 'Gujarati' ? 'ગુજરાતી' : 'EN'}
            </Text>
            <Feather name="chevron-down" size={15} color={HEADER_BLUE_TEXT} style={{ marginLeft: -2 }} />
          </TouchableOpacity>
        ) : (
          <TouchableOpacity 
            onPress={handleBack}
            activeOpacity={0.75}
            style={HEADER_BUTTON_BLUE}
            accessible={true}
            accessibilityRole="button"
            accessibilityLabel={`${t.back}, button`}
            accessibilityHint="Goes back to the previous onboarding slide"
          >
            <Feather name="chevron-left" size={18} color={HEADER_BLUE_TEXT} style={{ marginLeft: -5, marginRight: -2 }} />
            <Text style={[HEADER_BUTTON_TEXT, { color: HEADER_BLUE_TEXT }]}>{t.back}</Text>
          </TouchableOpacity>
        )}

        {/* Progress indicators (Dots / Pills) */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          {Array.from({ length: totalSteps }).map((_, index) => (
            <ProgressDot key={index} active={index === currentStep} reduceMotion={reduceMotion} />
          ))}
        </View>

        {/* 
          RIGHT SLOT: 
          - Slides 1, 2, 3: Skip button (light orange).
          - Slide 4: Renders an empty placeholder to keep the header aligned.
        */}
        {/* Skip jumps straight to the last (role selection) step, animating forward */}
        {currentStep < totalSteps - 1 ? (
          <TouchableOpacity
            onPress={() => { setDirection(1); setCurrentStep(totalSteps - 1); }}
            activeOpacity={0.75}
            style={HEADER_BUTTON_ORANGE}
            accessible={true}
            accessibilityRole="button"
            accessibilityLabel={`${t.skip}, button`}
            accessibilityHint="Skips straight to selecting student or volunteer role"
          >
            <Text style={[HEADER_BUTTON_TEXT, { color: HEADER_ORANGE_TEXT }]}>{t.skip}</Text>
            <Feather name="chevrons-right" size={16} color={HEADER_ORANGE_TEXT} style={{ marginRight: -3 }} />
          </TouchableOpacity>
        ) : (
          <View style={{ width: 88 }} />
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
        {/* Keyed by step so each change remounts and replays the slide-in from the travel direction */}
        <Animated.View
          key={currentStep}
          entering={enter(direction === 1 ? FadeInRight.duration(380) : FadeInLeft.duration(380))}
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
            {/* Clean rounded container for the logo — fades in once */}
            <Animated.View entering={enter(FadeIn.delay(120).duration(300))}>
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
            </Animated.View>

            <Animated.View entering={enter(FadeInDown.delay(180).duration(420))} style={{ width: '100%', alignItems: 'center' }}>
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
            </Animated.View>
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
            {/* Minimalist Book-open outline icon — fades in once */}
            <Animated.View entering={enter(FadeIn.delay(120).duration(300))}>
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
            </Animated.View>

            <Animated.View entering={enter(FadeInDown.delay(180).duration(420))} style={{ width: '100%', alignItems: 'center' }}>
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
            </Animated.View>
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
            {/* Minimalist Users outline icon representing community connection — fades in once */}
            <Animated.View entering={enter(FadeIn.delay(120).duration(300))}>
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
            </Animated.View>

            <Animated.View entering={enter(FadeInDown.delay(180).duration(420))} style={{ width: '100%', alignItems: 'center' }}>
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
            </Animated.View>
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
            {/* White rounded corner square container for the logo — fades in once */}
            <Animated.View entering={enter(FadeIn.delay(120).duration(300))}>
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
            </Animated.View>
            
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
              <Animated.View entering={enter(FadeInDown.delay(200).duration(420))}>
              <TouchableOpacity  
                onPress={handleNavigateToStudent}
                className="w-full bg-blue-500 active:bg-blue-600 py-4 px-6 rounded-xl items-center justify-center shadow-lg shadow-blue-500/25"
                accessible={true}
                accessibilityRole="button"
                accessibilityLabel={`${t.studentBtn}, button`}
                accessibilityHint="Double tap to register or log in as a student in need of a scribe"
                activeOpacity={0.85}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <FontAwesome5 name="user-graduate" size={16} color="#ffffff" />
                  <Text className="text-white text-base font-bold" style={{ flexShrink: 1 }}>
                    {t.studentBtn}
                  </Text>
                </View>
              </TouchableOpacity>
              </Animated.View>

              {/* Scribe CTA Button (Solid Volunteer Emerald 500 + Shadow Glow) */}
              <Animated.View entering={enter(FadeInDown.delay(300).duration(420))}>
              <TouchableOpacity  
                onPress={handleNavigateToScribe}
                className="w-full bg-emerald-500 active:bg-emerald-600 py-4 px-6 rounded-xl items-center justify-center mt-4 shadow-lg shadow-emerald-500/25"
                accessible={true}
                accessibilityRole="button"
                accessibilityLabel={`${t.scribeBtn}, button`}
                accessibilityHint="Double tap to register or log in as a volunteer scribe"
                activeOpacity={0.85}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <FontAwesome5 name="pen-nib" size={16} color="#ffffff" />
                  <Text className="text-white text-base font-bold" style={{ flexShrink: 1 }}>
                    {t.scribeBtn}
                  </Text>
                </View>
              </TouchableOpacity>
              </Animated.View>
            </View>
          </View>
        )}
        </Animated.View>
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
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Text style={{ color: '#ffffff', fontSize: 17, fontWeight: '800' }}>{t.next}</Text>
              <Feather name="arrow-right" size={18} color="#ffffff" />
            </View>
          </TouchableOpacity>
        </View>
      )}

      {/* 
        LANGUAGE SELECTION BOTTOM SHEET MODAL
      */}
      {showLanguageModal && (
        <View className="absolute inset-0 z-50 flex-col justify-end">
          {/* Dimming Backdrop Overlay (fades in) */}
          <Animated.View
            entering={enter(FadeIn.duration(200))}
            style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
          >
          <TouchableOpacity  
            activeOpacity={1} 
            onPress={() => setShowLanguageModal(false)} 
            className="absolute inset-0 bg-black/45"
            accessible={true}
            accessibilityLabel="Close language selector backdrop, button"
            accessibilityHint="Tap anywhere outside to close the language modal"
          />
          </Animated.View>
          
          {/* Modal Container (slides up) */}
          <Animated.View entering={enter(SlideInDown.duration(320))}>
          <View className="bg-white rounded-t-3xl p-6 border-t border-slate-100 shadow-2xl z-50">
            <View className="items-center mb-6">
              {/* Decorative handle bar */}
              <View className="w-12 h-1 bg-slate-200 rounded-full mb-4" />
              <Text className="text-lg font-bold text-slate-900">{t.selectLanguageTitle}</Text>
              <Text className="text-slate-500 text-xs mt-1">{t.selectLanguageSub}</Text>
            </View>

            {/* Language Selection List */}
            <View className="mb-6">
              {/* Selecting a language applies it app-wide immediately, then closes the sheet */}
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
                      changeLanguage(lang as 'English' | 'Hindi' | 'Gujarati');
                      // Brief pause so the user sees their pick confirmed before the sheet closes.
                      setTimeout(() => setShowLanguageModal(false), reduceMotion ? 0 : 280);
                    }}
                    className={`w-full py-4 px-5 rounded-xl border flex-row items-center justify-between mt-3 ${
                      isSelected 
                        ? 'bg-blue-50 border-blue-400' 
                        : 'bg-slate-50 border-slate-200'
                    }`}
                    accessible={true}
                    accessibilityRole="radio"
                    accessibilityLabel={localizedNames[lang]}
                    accessibilityState={{ checked: isSelected }}
                  >
                    <Text className={`font-semibold text-base ${isSelected ? 'text-blue-500' : 'text-slate-800'}`}>
                      {localizedNames[lang]}
                    </Text>
                    {isSelected && (
                      <Animated.View entering={enter(FadeIn.duration(300))}>
                        <Feather name="check-circle" size={20} color="#3b82f6" />
                      </Animated.View>
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
          </Animated.View>
        </View>
      )}

    </SafeAreaView>
    </View>
  );
}
