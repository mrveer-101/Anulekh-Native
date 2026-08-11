import React from 'react';
import { View, Text, TouchableOpacity, Image } from 'react-native';
import { router } from 'expo-router';
import { Feather } from '@expo/vector-icons';

export default function FooterPC() {
  return (
    <View style={{
      backgroundColor: '#0f172a',
      borderTopWidth: 1,
      borderTopColor: 'rgba(51, 65, 85, 0.6)',
      paddingTop: 64,
      paddingBottom: 40,
      paddingHorizontal: 48,
    }}>
      <View style={{
        maxWidth: 1280,
        width: '100%',
        alignSelf: 'center',
      }}>
        {/* ── Main 4-Column Grid ── */}
        <View style={{
          flexDirection: 'row',
          flexWrap: 'wrap',
          justifyContent: 'space-between',
          gap: 40,
          marginBottom: 56,
        }}>
          {/* Column 1: Brand Info & Mission Statement */}
          <View style={{ width: 320 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 }}>
              <View style={{
                width: 38, height: 38, borderRadius: 12,
                backgroundColor: '#ffffff',
                alignItems: 'center', justifyContent: 'center',
                overflow: 'hidden',
              }}>
                <Image
                  source={require('../../../assets/images/custom/Pen_Logo.jpg')}
                  style={{ width: '100%', height: '100%' }}
                  resizeMode="cover"
                />
              </View>
              <Text style={{ fontSize: 22, fontWeight: '900', color: '#ffffff', letterSpacing: -0.5 }}>
                Anulekh
              </Text>
            </View>
            <Text style={{ fontSize: 14, color: '#94a3b8', lineHeight: 22, marginBottom: 20 }}>
              Connecting visually impaired and differently-abled candidates with verified exam scribes across India seamlessly and securely.
            </Text>
            <View style={{
              flexDirection: 'row', alignItems: 'center', gap: 8,
              backgroundColor: 'rgba(30, 41, 59, 0.8)',
              borderWidth: 1, borderColor: 'rgba(51, 65, 85, 0.8)',
              paddingHorizontal: 14, paddingVertical: 8, borderRadius: 12,
              alignSelf: 'flex-start',
            }}>
              <Feather name="shield-off" size={14} color="#10b981" />
              <Text style={{ fontSize: 12, fontWeight: '700', color: '#10b981' }}>
                100% Non-Profit Accessibility Mission
              </Text>
            </View>
          </View>

          {/* Column 2: Platform Links */}
          <View style={{ width: 180 }}>
            <Text style={{ fontSize: 14, fontWeight: '800', color: '#ffffff', letterSpacing: 0.5, marginBottom: 18 }}>
              PLATFORM
            </Text>
            <View style={{ gap: 12 }}>
              <TouchableOpacity onPress={() => router.push('/landing')} activeOpacity={0.7}>
                <Text style={{ fontSize: 14, color: '#cbd5e1', fontWeight: '500' }}>Home</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => router.push('/landing/induction')} activeOpacity={0.7}>
                <Text style={{ fontSize: 14, color: '#cbd5e1', fontWeight: '500' }}>Student Portal</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => router.push('/landing/induction')} activeOpacity={0.7}>
                <Text style={{ fontSize: 14, color: '#cbd5e1', fontWeight: '500' }}>Volunteer Scribe</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => router.push('/auth/login')} activeOpacity={0.7}>
                <Text style={{ fontSize: 14, color: '#cbd5e1', fontWeight: '500' }}>Login Account</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Column 3: Safety & Emergency SOS */}
          <View style={{ width: 220 }}>
            <Text style={{ fontSize: 14, fontWeight: '800', color: '#ffffff', letterSpacing: 0.5, marginBottom: 18 }}>
              EMERGENCY & SAFETY
            </Text>
            <View style={{ gap: 12 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Feather name="zap" size={16} color="#fbbf24" />
                <Text style={{ fontSize: 14, color: '#fbbf24', fontWeight: '700' }}>
                  24/7 SOS Standby Pool
                </Text>
              </View>
              <Text style={{ fontSize: 13, color: '#94a3b8', lineHeight: 19 }}>
                Emergency scribe dispatch within 3 minutes for last-minute exam cancellations.
              </Text>
              <View style={{
                backgroundColor: 'rgba(239, 68, 68, 0.1)',
                borderWidth: 1, borderColor: 'rgba(239, 68, 68, 0.25)',
                paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10,
                marginTop: 4,
              }}>
                <Text style={{ fontSize: 12, fontWeight: '800', color: '#f87171' }}>
                  Helpline: +91 (800) ANULEKH
                </Text>
              </View>
            </View>
          </View>

          {/* Column 4: Institutional Partners & Compliance */}
          <View style={{ width: 240 }}>
            <Text style={{ fontSize: 14, fontWeight: '800', color: '#ffffff', letterSpacing: 0.5, marginBottom: 18 }}>
              PARTNERS & NGO
            </Text>
            <Text style={{ fontSize: 13, color: '#94a3b8', lineHeight: 20, marginBottom: 14 }}>
              Empowering schools, colleges, and NGOs across India with digital scribe verification.
            </Text>
            <View style={{ flexDirection: 'row', items: 'center', gap: 8 }}>
              <Feather name="check-circle" size={14} color="#60a5fa" />
              <Text style={{ fontSize: 12, color: '#60a5fa', fontWeight: '700' }}>
                WCAG 2.1 Screen Reader Ready
              </Text>
            </View>
          </View>
        </View>

        {/* ── Bottom Bar: Copyright & Soft Credit ── */}
        <View style={{
          borderTopWidth: 1,
          borderTopColor: 'rgba(51, 65, 85, 0.5)',
          paddingTop: 28,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 16,
        }}>
          <Text style={{ fontSize: 13, color: '#64748b', fontWeight: '500' }}>
            © {new Date().getFullYear()} Anulekh Accessibility Foundation. All rights reserved.
          </Text>

          <View style={{
            flexDirection: 'row', alignItems: 'center', gap: 6,
            backgroundColor: 'rgba(30, 41, 59, 0.6)',
            paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20,
          }}>
            <Text style={{ fontSize: 13, fontWeight: '700', color: '#94a3b8' }}>
              Made with <Text style={{ color: '#ef4444' }}>❤️</Text> to empower every candidate
            </Text>
          </View>
        </View>
      </View>
    </View>
  );
}
