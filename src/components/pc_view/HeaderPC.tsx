import React from 'react';
import { View, Text, TouchableOpacity, Image } from 'react-native';
import { router } from 'expo-router';
import { Feather } from '@expo/vector-icons';

interface HeaderPCProps {
  activeTab?: string;
  onNavigateSection?: (sectionId: string) => void;
}

export default function HeaderPC({ activeTab = 'home', onNavigateSection }: HeaderPCProps) {
  return (
    <View style={{
      height: 76,
      backgroundColor: 'rgba(255, 255, 255, 0.92)',
      borderBottomWidth: 1,
      borderBottomColor: 'rgba(226, 232, 240, 0.8)',
      paddingHorizontal: 48,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      position: 'sticky' as any,
      top: 0,
      zIndex: 50,
      shadowColor: '#0f172a',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.04,
      shadowRadius: 16,
      elevation: 4,
    }}>
      {/* ── Brand Logo + Title ── */}
      <TouchableOpacity
        onPress={() => router.push('/')}
        activeOpacity={0.85}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}
      >
        <View style={{
          width: 44, height: 44, borderRadius: 14,
          backgroundColor: '#ffffff',
          borderWidth: 1.5, borderColor: 'rgba(37,99,235,0.25)',
          alignItems: 'center', justifyContent: 'center',
          shadowColor: '#2563eb', shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.15, shadowRadius: 10, elevation: 3,
          overflow: 'hidden',
        }}>
          <Image
            source={require('../../../assets/images/custom/Pen_Logo.jpg')}
            style={{ width: '100%', height: '100%' }}
            resizeMode="cover"
          />
        </View>

        <View>
          <Text style={{ fontSize: 22, fontWeight: '900', color: '#0f172a', letterSpacing: -0.5 }}>
            Anulekh
          </Text>
          <Text style={{ fontSize: 11, fontWeight: '700', color: '#2563eb', letterSpacing: 0.5 }}>
            अनुलेख • A Scribe for every Voice
          </Text>
        </View>
      </TouchableOpacity>

      {/* ── Desktop Navigation Links ── */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 32 }}>
        <TouchableOpacity
          onPress={() => onNavigateSection ? onNavigateSection('how-it-works') : router.push('/landing')}
          style={{ paddingVertical: 8 }}
        >
          <Text style={{ fontSize: 14, fontWeight: '700', color: '#475569' }}>
            How It Works
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => onNavigateSection ? onNavigateSection('features') : router.push('/landing')}
          style={{ paddingVertical: 8 }}
        >
          <Text style={{ fontSize: 14, fontWeight: '700', color: '#475569' }}>
            Features & SOS
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => onNavigateSection ? onNavigateSection('ngos') : router.push('/landing')}
          style={{ paddingVertical: 8 }}
        >
          <Text style={{ fontSize: 14, fontWeight: '700', color: '#475569' }}>
            For NGOs & Colleges
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => onNavigateSection ? onNavigateSection('faq') : router.push('/landing')}
          style={{ paddingVertical: 8 }}
        >
          <Text style={{ fontSize: 14, fontWeight: '700', color: '#475569' }}>
            FAQ
          </Text>
        </TouchableOpacity>
      </View>

      {/* ── Auth Actions (Log In & Get Started) ── */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
        <TouchableOpacity
          onPress={() => router.push('/auth/login')}
          activeOpacity={0.8}
          style={{
            paddingHorizontal: 20,
            paddingVertical: 11,
            borderRadius: 12,
            backgroundColor: 'rgba(241, 245, 249, 0.9)',
            borderWidth: 1,
            borderColor: 'rgba(203, 213, 225, 0.8)',
          }}
        >
          <Text style={{ fontSize: 14, fontWeight: '800', color: '#1e293b' }}>
            Log In
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => router.push('/landing/induction')}
          activeOpacity={0.85}
          style={{
            paddingHorizontal: 22,
            paddingVertical: 11,
            borderRadius: 12,
            backgroundColor: '#2563eb',
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
            shadowColor: '#2563eb',
            shadowOffset: { width: 0, height: 6 },
            shadowOpacity: 0.25,
            shadowRadius: 12,
            elevation: 4,
          }}
        >
          <Text style={{ fontSize: 14, fontWeight: '800', color: '#ffffff' }}>
            Get Started
          </Text>
          <Feather name="arrow-right" size={16} color="#ffffff" />
        </TouchableOpacity>
      </View>
    </View>
  );
}
