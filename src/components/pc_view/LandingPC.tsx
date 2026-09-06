import React, { useState, useRef } from 'react';
import { View, Text, Pressable, ScrollView, Image } from 'react-native';
import { router } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import HeaderPC from './HeaderPC';
import FooterPC from './FooterPC';

export default function LandingPC() {
  const [openFaqIndex, setOpenFaqIndex] = useState<number | null>(0);
  const scrollViewRef = useRef<ScrollView>(null);

  // Section Y Position References for Navbar Smooth Scroll
  const howItWorksY = 560;
  const featuresY = 1050;
  const ngosY = 1450;
  const faqY = 1850;

  const scrollToSection = (sectionId: string) => {
    let targetY = 0;
    if (sectionId === 'how-it-works') targetY = howItWorksY;
    else if (sectionId === 'features') targetY = featuresY;
    else if (sectionId === 'ngos') targetY = ngosY;
    else if (sectionId === 'faq') targetY = faqY;

    scrollViewRef.current?.scrollTo({ y: targetY, animated: true });
  };

  const stats = [
    { label: 'Free Accessibility Platform', value: '100%', icon: 'gift', color: '#2563eb' },
    { label: 'Verified Volunteer Scribes', value: '5,000+', icon: 'users', color: '#16a34a' },
    { label: 'Exams Successfully Assisted', value: '12,500+', icon: 'award', color: '#7c3aed' },
    { label: 'Emergency SOS Response Time', value: '< 3 Mins', icon: 'zap', color: '#ea580c' },
  ];

  const steps = [
    {
      num: '01',
      title: 'Post Exam Request',
      desc: 'Students submit exam date, subject, language, and examination center address in seconds.',
      icon: 'file-text',
      color: '#2563eb',
      bgColor: 'rgba(37, 99, 235, 0.08)',
    },
    {
      num: '02',
      title: 'Smart Location Match',
      desc: 'Our algorithm instantly alerts verified scribes within a 10 km radius matching subject expertise.',
      icon: 'map-pin',
      color: '#7c3aed',
      bgColor: 'rgba(124, 58, 237, 0.08)',
    },
    {
      num: '03',
      title: 'Exam Day Assistance',
      desc: 'Scribe attends the exam hall, verifies credentials with the administrator, and assists seamlessly.',
      icon: 'shield-check',
      color: '#16a34a',
      bgColor: 'rgba(22, 163, 74, 0.08)',
    },
  ];

  const faqs = [
    {
      q: 'Is Anulekh completely free for students and scribes?',
      a: 'Yes! Anulekh is a 100% free accessibility platform. Candidates never pay any fee for finding a scribe, and volunteer scribes offer their services free of charge to empower students.',
    },
    {
      q: 'How does the Emergency SOS Standby Pool work?',
      a: 'If a pre-booked scribe encounters a sudden emergency on exam morning, the student can trigger the SOS Alert. Nearby reserve scribes on standby receive instant emergency push notifications to arrive at the exam hall within minutes.',
    },
    {
      q: 'Are volunteer scribes verified before being assigned?',
      a: 'Yes. Every scribe undergoes identity verification, qualification review, and background checking prior to accepting student requests.',
    },
    {
      q: 'Can educational institutions or NGOs partner with Anulekh?',
      a: 'Absolutely! Schools, colleges, disability cells, and NGOs can integrate with our admin console to bulk manage scribe requests for entire examination centers.',
    },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: '#f8fafc' }}>
      {/* ── Sticky Desktop Header with Smooth Scroll Handler ── */}
      <HeaderPC onNavigateSection={scrollToSection} />

      <ScrollView
        ref={scrollViewRef}
        contentContainerStyle={{ flexGrow: 1 }}
        showsVerticalScrollIndicator={false}
      >
        {/* ═══════════════════════════════════════════
             HERO BANNER SECTION
        ═══════════════════════════════════════════ */}
        <View style={{
          backgroundColor: '#ffffff',
          paddingVertical: 72,
          paddingHorizontal: 48,
          borderBottomWidth: 1,
          borderBottomColor: 'rgba(226, 232, 240, 0.8)',
          position: 'relative',
          overflow: 'hidden',
        }}>
          {/* Subtle Background Glow Orbs */}
          <View style={{
            position: 'absolute', top: -120, right: -100,
            width: 500, height: 500, borderRadius: 250,
            backgroundColor: 'rgba(37, 99, 235, 0.06)',
          }} />
          <View style={{
            position: 'absolute', bottom: -100, left: -100,
            width: 400, height: 400, borderRadius: 200,
            backgroundColor: 'rgba(124, 58, 237, 0.05)',
          }} />

          <View style={{
            maxWidth: 1280, width: '100%', alignSelf: 'center',
            flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
            gap: 60,
          }}>
            {/* Hero Left Column: Copy & Actions */}
            <View style={{ flex: 1.1 }}>
              <View style={{
                flexDirection: 'row', alignItems: 'center', gap: 8,
                backgroundColor: 'rgba(37, 99, 235, 0.08)',
                borderWidth: 1, borderColor: 'rgba(37, 99, 235, 0.2)',
                paddingHorizontal: 16, paddingVertical: 7, borderRadius: 20,
                alignSelf: 'flex-start', marginBottom: 20,
              }}>
                <Feather name={"sparkles" as any} size={14} color="#2563eb" />
                <Text style={{ fontSize: 13, fontWeight: '800', color: '#2563eb' }}>
                  India's Dedicated Digital Scribe Platform
                </Text>
              </View>

              <Text style={{
                fontSize: 52, fontWeight: '900', color: '#0f172a',
                lineHeight: 62, letterSpacing: -1.5, marginBottom: 20,
              }}>
                A Scribe for every Voice, <Text style={{ color: '#2563eb' }}>Dignity for every Exam.</Text>
              </Text>

              <Text style={{
                fontSize: 18, color: '#475569', lineHeight: 28,
                marginBottom: 36, maxWidth: 560,
              }}>
                Anulekh empowers visually impaired and differently-abled candidates by matching them with verified volunteer scribes based on location, language, and subject expertise.
              </Text>

              {/* Action Buttons (with Responsive Hover Scaling) */}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16, marginBottom: 40 }}>
                <Pressable
                  onPress={() => router.push('/landing/induction')}
                  style={({ hovered }: any) => ({
                    backgroundColor: hovered ? '#1d4ed8' : '#2563eb',
                    paddingHorizontal: 32, paddingVertical: 18, borderRadius: 16,
                    flexDirection: 'row', alignItems: 'center', gap: 10,
                    shadowColor: '#2563eb',
                    shadowOffset: { width: 0, height: hovered ? 14 : 10 },
                    shadowOpacity: hovered ? 0.4 : 0.3,
                    shadowRadius: hovered ? 24 : 20,
                    elevation: hovered ? 12 : 8,
                    cursor: 'pointer' as any,
                    transform: [{ scale: hovered ? 1.03 : 1 }],
                  })}
                >
                  <Text style={{ fontSize: 16, fontWeight: '800', color: '#ffffff' }}>
                    Request a Scribe
                  </Text>
                  <Feather name="arrow-right" size={18} color="#ffffff" />
                </Pressable>

                <Pressable
                  onPress={() => router.push('/landing/induction')}
                  style={({ hovered }: any) => ({
                    backgroundColor: hovered ? '#f1f5f9' : 'rgba(241, 245, 249, 0.9)',
                    borderWidth: 1.5,
                    borderColor: hovered ? '#16a34a' : 'rgba(203, 213, 225, 0.9)',
                    paddingHorizontal: 28, paddingVertical: 18, borderRadius: 16,
                    flexDirection: 'row', alignItems: 'center', gap: 10,
                    cursor: 'pointer' as any,
                    transform: [{ scale: hovered ? 1.03 : 1 }],
                  })}
                >
                  <Feather name="heart" size={18} color="#16a34a" />
                  <Text style={{ fontSize: 16, fontWeight: '800', color: '#1e293b' }}>
                    Join as Volunteer Scribe
                  </Text>
                </Pressable>
              </View>

              {/* Trust Pills */}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 24 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Feather name="check-circle" size={16} color="#16a34a" />
                  <Text style={{ fontSize: 13, fontWeight: '700', color: '#64748b' }}>Verified Volunteers</Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Feather name="zap" size={16} color="#eab308" />
                  <Text style={{ fontSize: 13, fontWeight: '700', color: '#64748b' }}>3-Min SOS Backup</Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Feather name="globe" size={16} color="#2563eb" />
                  <Text style={{ fontSize: 13, fontWeight: '700', color: '#64748b' }}>Multi-Language</Text>
                </View>
              </View>
            </View>

            {/* Hero Right Column: Interactive Glass Showcase Card */}
            <View style={{ flex: 0.9, width: '100%', maxWidth: 500 }}>
              <Pressable
                style={({ hovered }: any) => ({
                  backgroundColor: '#ffffff',
                  borderWidth: 1.5,
                  borderColor: hovered ? '#2563eb' : 'rgba(226, 232, 240, 0.9)',
                  borderRadius: 28, padding: 28,
                  shadowColor: '#0f172a',
                  shadowOffset: { width: 0, height: hovered ? 20 : 16 },
                  shadowOpacity: hovered ? 0.12 : 0.08,
                  shadowRadius: hovered ? 44 : 36,
                  elevation: hovered ? 16 : 12,
                  cursor: 'pointer' as any,
                  transform: [{ translateY: hovered ? -4 : 0 }],
                })}
              >
                {/* Showcase Header */}
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: '#22c55e' }} />
                    <Text style={{ fontSize: 14, fontWeight: '800', color: '#0f172a' }}>Live Scribe Match Preview</Text>
                  </View>
                  <View style={{
                    backgroundColor: 'rgba(22, 163, 74, 0.1)',
                    paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8,
                  }}>
                    <Text style={{ fontSize: 11, fontWeight: '800', color: '#16a34a' }}>MATCH CONFIRMED</Text>
                  </View>
                </View>

                {/* Scribe & Candidate Card */}
                <View style={{
                  backgroundColor: '#f8fafc', borderWidth: 1, borderColor: 'rgba(226, 232, 240, 0.8)',
                  borderRadius: 20, padding: 18, marginBottom: 16,
                }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 12 }}>
                    <View style={{
                      width: 48, height: 48, borderRadius: 16,
                      backgroundColor: '#2563eb', alignItems: 'center', justifyContent: 'center',
                    }}>
                      <Text style={{ fontSize: 20, fontWeight: '900', color: '#ffffff' }}>R</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 15, fontWeight: '800', color: '#0f172a' }}>Rahul Sharma (Scribe)</Text>
                      <Text style={{ fontSize: 12, color: '#64748b' }}>B.Tech Senior • English & Hindi</Text>
                    </View>
                    <Feather name={"shield-check" as any} size={20} color="#16a34a" />
                  </View>

                  <View style={{
                    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                    borderTopWidth: 1, borderTopColor: 'rgba(226, 232, 240, 0.8)', paddingTop: 10,
                  }}>
                    <Text style={{ fontSize: 12, color: '#64748b', fontWeight: '600' }}>Distance: 2.4 km away</Text>
                    <Text style={{ fontSize: 12, color: '#2563eb', fontWeight: '800' }}>Exam: Physics II</Text>
                  </View>
                </View>

                {/* SOS Live Alert Box */}
                <View style={{
                  backgroundColor: 'rgba(254, 243, 199, 0.6)',
                  borderWidth: 1, borderColor: 'rgba(245, 158, 11, 0.3)',
                  borderRadius: 16, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12,
                }}>
                  <View style={{
                    width: 36, height: 36, borderRadius: 10, backgroundColor: '#f59e0b',
                    alignItems: 'center', justifyContent: 'center',
                  }}>
                    <Feather name="zap" size={18} color="#ffffff" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 13, fontWeight: '800', color: '#78350f' }}>Emergency Standby Pool Active</Text>
                    <Text style={{ fontSize: 11, color: '#92400e' }}>10 Reserve Scribes ready within exam center radius</Text>
                  </View>
                </View>
              </Pressable>
            </View>
          </View>
        </View>

        {/* ═══════════════════════════════════════════
             LIVE PLATFORM IMPACT STATS (with Hover Cards)
        ═══════════════════════════════════════════ */}
        <View style={{ backgroundColor: '#f1f5f9', paddingVertical: 48, paddingHorizontal: 48 }}>
          <View style={{
            maxWidth: 1280, width: '100%', alignSelf: 'center',
            flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
            flexWrap: 'wrap', gap: 24,
          }}>
            {stats.map((s) => (
              <Pressable
                key={s.label}
                style={({ hovered }: any) => ({
                  flex: 1, minWidth: 240,
                  backgroundColor: '#ffffff',
                  borderWidth: 1.5,
                  borderColor: hovered ? s.color : 'rgba(226, 232, 240, 0.8)',
                  borderRadius: 20, padding: 24,
                  flexDirection: 'row', alignItems: 'center', gap: 16,
                  shadowColor: '#0f172a',
                  shadowOffset: { width: 0, height: hovered ? 8 : 4 },
                  shadowOpacity: hovered ? 0.08 : 0.03,
                  shadowRadius: hovered ? 16 : 12,
                  elevation: hovered ? 4 : 2,
                  cursor: 'pointer' as any,
                  transform: [{ translateY: hovered ? -3 : 0 }],
                })}
              >
                <View style={{
                  width: 52, height: 52, borderRadius: 16,
                  backgroundColor: `${s.color}12`,
                  borderWidth: 1, borderColor: `${s.color}25`,
                  alignItems: 'center', justifyContent: 'center',
                }}>
                  <Feather name={s.icon as any} size={24} color={s.color} />
                </View>
                <View>
                  <Text style={{ fontSize: 28, fontWeight: '900', color: '#0f172a', letterSpacing: -0.5 }}>
                    {s.value}
                  </Text>
                  <Text style={{ fontSize: 13, fontWeight: '700', color: '#64748b', marginTop: 2 }}>
                    {s.label}
                  </Text>
                </View>
              </Pressable>
            ))}
          </View>
        </View>

        {/* ═══════════════════════════════════════════
             HOW IT WORKS SECTION (with Hover Cards)
        ═══════════════════════════════════════════ */}
        <View style={{ backgroundColor: '#ffffff', paddingVertical: 80, paddingHorizontal: 48 }}>
          <View style={{ maxWidth: 1280, width: '100%', alignSelf: 'center' }}>
            <View style={{ alignItems: 'center', marginBottom: 56 }}>
              <Text style={{ fontSize: 13, fontWeight: '800', color: '#2563eb', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 8 }}>
                SIMPLE 3-STEP PROCESS
              </Text>
              <Text style={{ fontSize: 36, fontWeight: '900', color: '#0f172a', textAlign: 'center', letterSpacing: -0.5 }}>
                How Anulekh Connects Students & Scribes
              </Text>
            </View>

            <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 32 }}>
              {steps.map((st) => (
                <Pressable
                  key={st.num}
                  style={({ hovered }: any) => ({
                    flex: 1, backgroundColor: '#f8fafc',
                    borderWidth: 1.5,
                    borderColor: hovered ? st.color : 'rgba(226, 232, 240, 0.9)',
                    borderRadius: 24, padding: 32, position: 'relative',
                    shadowColor: st.color,
                    shadowOffset: { width: 0, height: hovered ? 12 : 4 },
                    shadowOpacity: hovered ? 0.15 : 0.03,
                    shadowRadius: hovered ? 24 : 12,
                    elevation: hovered ? 8 : 2,
                    cursor: 'pointer' as any,
                    transform: [{ translateY: hovered ? -6 : 0 }],
                  })}
                >
                  <Text style={{ fontSize: 44, fontWeight: '900', color: 'rgba(203, 213, 225, 0.6)', position: 'absolute', top: 24, right: 24 }}>
                    {st.num}
                  </Text>
                  <View style={{
                    width: 56, height: 56, borderRadius: 18,
                    backgroundColor: st.bgColor,
                    alignItems: 'center', justifyContent: 'center', marginBottom: 24,
                  }}>
                    <Feather name={st.icon as any} size={26} color={st.color} />
                  </View>
                  <Text style={{ fontSize: 20, fontWeight: '800', color: '#0f172a', marginBottom: 10 }}>
                    {st.title}
                  </Text>
                  <Text style={{ fontSize: 14, color: '#64748b', lineHeight: 22 }}>
                    {st.desc}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
        </View>

        {/* ═══════════════════════════════════════════
             FAQ SECTION (with Hover Highlights)
        ═══════════════════════════════════════════ */}
        <View style={{ backgroundColor: '#f8fafc', paddingVertical: 80, paddingHorizontal: 48 }}>
          <View style={{ maxWidth: 880, width: '100%', alignSelf: 'center' }}>
            <View style={{ alignItems: 'center', marginBottom: 48 }}>
              <Text style={{ fontSize: 13, fontWeight: '800', color: '#2563eb', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 8 }}>
                GOT QUESTIONS?
              </Text>
              <Text style={{ fontSize: 36, fontWeight: '900', color: '#0f172a', textAlign: 'center', letterSpacing: -0.5 }}>
                Frequently Asked Questions
              </Text>
            </View>

            <View style={{ gap: 16 }}>
              {faqs.map((f, i) => {
                const isOpen = openFaqIndex === i;
                return (
                  <View key={f.q} style={{
                    backgroundColor: '#ffffff',
                    borderWidth: 1.5,
                    borderColor: isOpen ? '#2563eb' : 'rgba(226, 232, 240, 0.8)',
                    borderRadius: 20, overflow: 'hidden',
                  }}>
                    <Pressable
                      onPress={() => setOpenFaqIndex(isOpen ? null : i)}
                      style={({ hovered }: any) => ({
                        padding: 24,
                        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 16,
                        backgroundColor: hovered ? 'rgba(241, 245, 249, 0.7)' : '#ffffff',
                        cursor: 'pointer' as any,
                      })}
                    >
                      <Text style={{ fontSize: 16, fontWeight: '800', color: '#0f172a', flex: 1 }}>
                        {f.q}
                      </Text>
                      <Feather name={isOpen ? 'chevron-up' : 'chevron-down'} size={20} color="#2563eb" />
                    </Pressable>
                    {isOpen && (
                      <View style={{ paddingHorizontal: 24, paddingBottom: 24, borderTopWidth: 1, borderTopColor: 'rgba(241, 245, 249, 0.9)', paddingTop: 16 }}>
                        <Text style={{ fontSize: 14, color: '#475569', lineHeight: 24 }}>
                          {f.a}
                        </Text>
                      </View>
                    )}
                  </View>
                );
              })}
            </View>
          </View>
        </View>

        {/* ── Desktop Footer (with Smooth Scroll Handler) ── */}
        <FooterPC onNavigateSection={scrollToSection} />
      </ScrollView>
    </View>
  );
}
