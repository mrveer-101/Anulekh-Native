import React, { useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, Image } from 'react-native';
import { router } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import HeaderPC from './HeaderPC';
import FooterPC from './FooterPC';

export default function LandingPC() {
  const [openFaqIndex, setOpenFaqIndex] = useState<number | null>(0);

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
      {/* ── Sticky Desktop Header ── */}
      <HeaderPC />

      <ScrollView contentContainerStyle={{ flexGrow: 1 }} showsVerticalScrollIndicator={false}>
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
                <Feather name="sparkles" size={14} color="#2563eb" />
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

              {/* Action Buttons */}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16, marginBottom: 40 }}>
                <TouchableOpacity
                  onPress={() => router.push('/landing/induction')}
                  activeOpacity={0.85}
                  style={{
                    backgroundColor: '#2563eb',
                    paddingHorizontal: 32, paddingVertical: 18, borderRadius: 16,
                    flexDirection: 'row', alignItems: 'center', gap: 10,
                    shadowColor: '#2563eb', shadowOffset: { width: 0, height: 10 },
                    shadowOpacity: 0.3, shadowRadius: 20, elevation: 8,
                  }}
                >
                  <Text style={{ fontSize: 16, fontWeight: '800', color: '#ffffff' }}>
                    Request a Scribe
                  </Text>
                  <Feather name="arrow-right" size={18} color="#ffffff" />
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => router.push('/landing/induction')}
                  activeOpacity={0.85}
                  style={{
                    backgroundColor: 'rgba(241, 245, 249, 0.9)',
                    borderWidth: 1.5, borderColor: 'rgba(203, 213, 225, 0.9)',
                    paddingHorizontal: 28, paddingVertical: 18, borderRadius: 16,
                    flexDirection: 'row', alignItems: 'center', gap: 10,
                  }}
                >
                  <Feather name="heart" size={18} color="#16a34a" />
                  <Text style={{ fontSize: 16, fontWeight: '800', color: '#1e293b' }}>
                    Join as Volunteer Scribe
                  </Text>
                </TouchableOpacity>
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
              <View style={{
                backgroundColor: '#ffffff',
                borderWidth: 1.5, borderColor: 'rgba(226, 232, 240, 0.9)',
                borderRadius: 28, padding: 28,
                shadowColor: '#0f172a', shadowOffset: { width: 0, height: 16 },
                shadowOpacity: 0.08, shadowRadius: 36, elevation: 12,
              }}>
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
                    <Feather name="shield-check" size={20} color="#16a34a" />
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
              </View>
            </View>
          </View>
        </View>

        {/* ═══════════════════════════════════════════
             LIVE PLATFORM IMPACT STATS
        ═══════════════════════════════════════════ */}
        <View style={{ backgroundColor: '#f1f5f9', paddingVertical: 48, paddingHorizontal: 48 }}>
          <View style={{
            maxWidth: 1280, width: '100%', alignSelf: 'center',
            flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
            flexWrap: 'wrap', gap: 24,
          }}>
            {stats.map((s) => (
              <View key={s.label} style={{
                flex: 1, minWidth: 240,
                backgroundColor: '#ffffff',
                borderWidth: 1, borderColor: 'rgba(226, 232, 240, 0.8)',
                borderRadius: 20, padding: 24,
                flexDirection: 'row', alignItems: 'center', gap: 16,
                shadowColor: '#0f172a', shadowOffset: { width: 0, height: 4 },
                shadowOpacity: 0.03, shadowRadius: 12, elevation: 2,
              }}>
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
              </View>
            ))}
          </View>
        </View>

        {/* ═══════════════════════════════════════════
             HOW IT WORKS SECTION
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
                <View key={st.num} style={{
                  flex: 1, backgroundColor: '#f8fafc',
                  borderWidth: 1, borderColor: 'rgba(226, 232, 240, 0.9)',
                  borderRadius: 24, padding: 32, position: 'relative',
                }}>
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
                </View>
              ))}
            </View>
          </View>
        </View>

        {/* ═══════════════════════════════════════════
             FAQ SECTION
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
                    borderWidth: 1, borderColor: isOpen ? 'rgba(37, 99, 235, 0.3)' : 'rgba(226, 232, 240, 0.8)',
                    borderRadius: 20, overflow: 'hidden',
                  }}>
                    <TouchableOpacity
                      onPress={() => setOpenFaqIndex(isOpen ? null : i)}
                      activeOpacity={0.8}
                      style={{
                        padding: 24, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 16,
                      }}
                    >
                      <Text style={{ fontSize: 16, fontWeight: '800', color: '#0f172a', flex: 1 }}>
                        {f.q}
                      </Text>
                      <Feather name={isOpen ? 'chevron-up' : 'chevron-down'} size={20} color="#2563eb" />
                    </TouchableOpacity>
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
      </ScrollView>

      {/* ── Desktop Footer ── */}
      <FooterPC />
    </View>
  );
}
