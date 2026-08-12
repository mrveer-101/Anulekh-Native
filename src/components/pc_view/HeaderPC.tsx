import React from 'react';
import { View, Text, Pressable, Image } from 'react-native';
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
      backgroundColor: 'rgba(255, 255, 255, 0.95)',
      borderBottomWidth: 1,
      borderBottomColor: 'rgba(226, 232, 240, 0.8)',
      paddingHorizontal: 48,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      position: 'sticky' as any,
      top: 0,
      zIndex: 100,
      shadowColor: '#0f172a',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.04,
      shadowRadius: 16,
      elevation: 4,
    }}>
      {/* ── Brand Logo + Title (with Hover Animation) ── */}
      <Pressable
        onPress={() => router.push('/')}
        style={({ hovered }: any) => ({
          flexDirection: 'row',
          alignItems: 'center',
          gap: 12,
          cursor: 'pointer' as any,
          transform: [{ scale: hovered ? 1.02 : 1 }],
        })}
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
      </Pressable>

      {/* ── Desktop Navigation Links (with Smooth Hover Effects) ── */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 32 }}>
        {[
          { id: 'how-it-works', label: 'How It Works' },
          { id: 'features', label: 'Features & SOS' },
          { id: 'ngos', label: 'For NGOs & Colleges' },
          { id: 'faq', label: 'FAQ' },
        ].map((item) => (
          <Pressable
            key={item.id}
            onPress={() => onNavigateSection?.(item.id)}
            style={({ hovered }: any) => ({
              paddingVertical: 8,
              paddingHorizontal: 12,
              borderRadius: 10,
              backgroundColor: hovered ? 'rgba(37, 99, 235, 0.08)' : 'transparent',
              cursor: 'pointer' as any,
              transform: [{ translateY: hovered ? -1 : 0 }],
            })}
          >
            {({ hovered }: any) => (
              <Text style={{
                fontSize: 14,
                fontWeight: hovered ? '800' : '700',
                color: hovered ? '#2563eb' : '#475569',
              }}>
                {item.label}
              </Text>
            )}
          </Pressable>
        ))}
      </View>

      {/* ── Auth Actions (Log In & Get Started with Hover States) ── */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
        <Pressable
          onPress={() => router.push('/auth/login')}
          style={({ hovered }: any) => ({
            paddingHorizontal: 20,
            paddingVertical: 11,
            borderRadius: 12,
            backgroundColor: hovered ? '#e2e8f0' : 'rgba(241, 245, 249, 0.9)',
            borderWidth: 1,
            borderColor: hovered ? '#cbd5e1' : 'rgba(203, 213, 225, 0.8)',
            cursor: 'pointer' as any,
            transform: [{ scale: hovered ? 1.03 : 1 }],
          })}
        >
          {({ hovered }: any) => (
            <Text style={{ fontSize: 14, fontWeight: '800', color: hovered ? '#0f172a' : '#1e293b' }}>
              Log In
            </Text>
          )}
        </Pressable>

        <Pressable
          onPress={() => router.push('/landing/induction')}
          style={({ hovered }: any) => ({
            paddingHorizontal: 22,
            paddingVertical: 11,
            borderRadius: 12,
            backgroundColor: hovered ? '#1d4ed8' : '#2563eb',
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
            shadowColor: '#2563eb',
            shadowOffset: { width: 0, height: hovered ? 8 : 6 },
            shadowOpacity: hovered ? 0.35 : 0.25,
            shadowRadius: hovered ? 16 : 12,
            elevation: hovered ? 6 : 4,
            cursor: 'pointer' as any,
            transform: [{ scale: hovered ? 1.04 : 1 }],
          })}
        >
          <Text style={{ fontSize: 14, fontWeight: '800', color: '#ffffff' }}>
            Get Started
          </Text>
          <Feather name="arrow-right" size={16} color="#ffffff" />
        </Pressable>
      </View>
    </View>
  );
}
