/**
 * Navbar Design Preview & Reference Page — Route `/dev/navbar-preview`.
 *
 * Provides a side-by-side interactive gallery of all navbar iterations:
 * 1. Current Docked Standardized Navbar (flat top & bottom, full-width)
 * 2. Floating Pill: Shiny White Rim (with 1.5px white border and deep floating shadows)
 * 3. Floating Pill: Anulekh Blue Rim (#DCEBFA border with 5.5px thickness)
 *
 * Allows toggling between 'student' (blue theme) and 'scribe' (green theme).
 * Accessible in dev mode for future design reviews and switching.
 */
import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import {
  FloatingPillNavBar,
  DEFAULT_STUDENT_TABS,
  DEFAULT_SCRIBE_TABS,
} from '@/components/navigation/FloatingPillNavBar';
import { ClassicHeader } from '@/components/navigation/ClassicHeader';

export default function NavbarPreview() {
  const [role, setRole] = useState<'student' | 'scribe'>('student');
  const [activeVariant, setActiveVariant] = useState<'shiny-white' | 'blue-rim'>('shiny-white');
  const [activeTab, setActiveTab] = useState<string>('home');

  const tabs = role === 'scribe' ? DEFAULT_SCRIBE_TABS : DEFAULT_STUDENT_TABS;
  const isScribe = role === 'scribe';
  const roleColor = isScribe ? '#16A34A' : '#1D4ED8';
  const roleBg = isScribe ? '#DCFCE7' : '#EAF3FF';

  return (
    <View style={styles.container}>
      <StatusBar style="dark" />

      {/* ── HEADER ── */}
      <SafeAreaView edges={['top']} style={styles.header}>
        <View style={styles.headerInner}>
          <TouchableOpacity
            onPress={() => router.canGoBack() ? router.back() : router.replace('/')}
            style={styles.backBtn}
          >
            <Feather name="arrow-left" size={20} color="#0F172A" />
          </TouchableOpacity>
          <View>
            <Text style={styles.headerTitle}>Navbar Reference Gallery</Text>
            <Text style={styles.headerSubtitle}>Saved Floating Pill & Docked Designs</Text>
          </View>
        </View>
      </SafeAreaView>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* ── HEADER SECTION ── */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Active Classic Brand Header</Text>
          <Text style={styles.sectionDesc}>
            Standardized edge-to-edge white brand header with squircle logo, wordmark, notification bell, and user avatar.
          </Text>

          {/* Live Header Frame */}
          <View style={{
            marginTop: 14,
            borderRadius: 24,
            overflow: 'hidden',
            borderWidth: 1,
            borderColor: '#E2E8F0',
            backgroundColor: '#FFFFFF',
          }}>
            <ClassicHeader
              role={role}
              unreadCount={3}
              fullName={isScribe ? "Veer Patel" : "Aditya Patel"}
            />
          </View>
        </View>

        {/* Controls Card */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Interactive Controls</Text>
          <Text style={styles.sectionDesc}>
            Toggle roles and floating pill variants to preview and test the preserved designs.
          </Text>

          {/* Role selector */}
          <Text style={styles.fieldLabel}>Theme Role</Text>
          <View style={styles.toggleRow}>
            <TouchableOpacity
              onPress={() => setRole('student')}
              style={[
                styles.toggleBtn,
                role === 'student' && { backgroundColor: '#1D4ED8', borderColor: '#1D4ED8' },
              ]}
            >
              <Text style={[styles.toggleText, role === 'student' && styles.toggleTextActive]}>
                Student (Blue)
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => setRole('scribe')}
              style={[
                styles.toggleBtn,
                role === 'scribe' && { backgroundColor: '#16A34A', borderColor: '#16A34A' },
              ]}
            >
              <Text style={[styles.toggleText, role === 'scribe' && styles.toggleTextActive]}>
                Scribe (Green)
              </Text>
            </TouchableOpacity>
          </View>

          {/* Variant selector */}
          <Text style={[styles.fieldLabel, { marginTop: 14 }]}>Pill Variant</Text>
          <View style={styles.toggleRow}>
            <TouchableOpacity
              onPress={() => setActiveVariant('shiny-white')}
              style={[
                styles.toggleBtn,
                activeVariant === 'shiny-white' && { backgroundColor: '#0F172A', borderColor: '#0F172A' },
              ]}
            >
              <Text style={[styles.toggleText, activeVariant === 'shiny-white' && styles.toggleTextActive]}>
                Shiny White Rim
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => setActiveVariant('blue-rim')}
              style={[
                styles.toggleBtn,
                activeVariant === 'blue-rim' && { backgroundColor: '#0F172A', borderColor: '#0F172A' },
              ]}
            >
              <Text style={[styles.toggleText, activeVariant === 'blue-rim' && styles.toggleTextActive]}>
                Anulekh Blue Rim
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Specs Reference Card */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Design Specifications</Text>

          <View style={styles.specItem}>
            <Text style={styles.specName}>1. Smooth Docked Navbar (Active in production)</Text>
            <Text style={styles.specDesc}>
              • Full-width edge-to-edge docked at screen bottom (borderRadius: 0){'\n'}
              • Seamless unboxed design: no capsule border or box around active tab{'\n'}
              • Soft ambient glow / aura behind active icon in brand theme{'\n'}
              • Solid filled icon (24px) for active tab, clean outline for inactive tabs{'\n'}
              • Hairline top separator: 1px rgba(0,0,0,0.05) with upward shadow
            </Text>
          </View>

          <View style={styles.specItem}>
            <Text style={styles.specName}>2. Shiny White Floating Pill (Preserved)</Text>
            <Text style={styles.specDesc}>
              • Outer Rim: 1.5px #FFFFFF, rgba(255,255,255,0.95), borderRadius: 28{'\n'}
              • Deep ambient shadow: elevation 10, shadowRadius 22, inset highlight{'\n'}
              • Inner Surface: #FFFFFF, borderRadius 24, borderColor #E2E8F0
            </Text>
          </View>

          <View style={styles.specItem}>
            <Text style={styles.specName}>3. Blue Rim Floating Pill (Preserved)</Text>
            <Text style={styles.specDesc}>
              • Outer Rim: #DCEBFA, 5.5px thickness, borderRadius: 28{'\n'}
              • Floating shadow: elevation 6, shadowRadius 16{'\n'}
              • Inner Surface: #FFFFFF, borderRadius 24, borderColor #D4E4F7
            </Text>
          </View>
        </View>

        {/* Code Snippet Reference */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Import & Usage Example</Text>
          <View style={styles.codeBlock}>
            <Text style={styles.codeText}>
              {`import { FloatingPillNavBar } from '@/components/navigation/FloatingPillNavBar';\n\n` +
               `<FloatingPillNavBar\n` +
               `  activeTab={activeTab}\n` +
               `  onTabPress={(tab) => setActiveTab(tab)}\n` +
               `  variant="${activeVariant}"\n` +
               `  role="${role}"\n` +
               `/>`}
            </Text>
          </View>
        </View>

        {/* Spacer for bottom preview */}
        <View style={{ height: 120 }} />
      </ScrollView>

      {/* ── LIVE FLOATING PILL PREVIEW AT BOTTOM ── */}
      <FloatingPillNavBar
        tabs={tabs}
        activeTab={activeTab}
        onTabPress={(id) => setActiveTab(id)}
        variant={activeVariant}
        role={role}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  header: {
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.06)',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.04,
    shadowRadius: 10,
    elevation: 3,
    zIndex: 10,
  },
  headerInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontFamily: 'Roboto',
    fontSize: 17,
    fontWeight: '800',
    color: '#0F172A',
  },
  headerSubtitle: {
    fontFamily: 'Roboto',
    fontSize: 12,
    color: '#64748B',
    marginTop: 1,
  },
  content: {
    padding: 16,
    gap: 16,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 8,
    elevation: 2,
  },
  sectionTitle: {
    fontFamily: 'Roboto',
    fontSize: 15,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 4,
  },
  sectionDesc: {
    fontFamily: 'Roboto',
    fontSize: 13,
    color: '#64748B',
    marginBottom: 12,
    lineHeight: 18,
  },
  fieldLabel: {
    fontFamily: 'Roboto',
    fontSize: 12,
    fontWeight: '700',
    color: '#475569',
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  toggleRow: {
    flexDirection: 'row',
    gap: 8,
  },
  toggleBtn: {
    flex: 1,
    paddingVertical: 9,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  toggleText: {
    fontFamily: 'Roboto',
    fontSize: 13,
    fontWeight: '600',
    color: '#475569',
  },
  toggleTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  specItem: {
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  specName: {
    fontFamily: 'Roboto',
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 3,
  },
  specDesc: {
    fontFamily: 'Roboto',
    fontSize: 12,
    color: '#64748B',
    lineHeight: 18,
  },
  codeBlock: {
    backgroundColor: '#0F172A',
    borderRadius: 12,
    padding: 12,
    marginTop: 6,
  },
  codeText: {
    fontFamily: 'monospace',
    fontSize: 11.5,
    color: '#38BDF8',
    lineHeight: 17,
  },
});
