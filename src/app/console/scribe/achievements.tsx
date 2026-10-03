/**
 * Scribe Achievements & Certificates screen — route `/console/scribe/achievements`.
 *
 * Opened from the scribe home dashboard (components/scribe/ScribeHomeView.tsx).
 * Shows the signed-in scribe's milestone badges with progress bars, a small
 * stats card, and their volunteering certificate.
 *
 * Data (via the `supabase` shim, which calls the Rust/Axum backend):
 * - the auth session (current user id),
 * - `profiles` row of the scribe (for the display name),
 * - `exam_requests` with status 'completed' assigned to this scribe (only the count is used).
 *
 * Badge progress is computed on the client from that count. The Emergency,
 * Assignment Ally and Submission Hero badges are placeholders (always locked,
 * progress 0). The certificate button opens the backend-rendered page at
 * `/api/certificates/view/:scribe_id` in the browser; if the URL cannot be
 * opened, the link is shown in an alert instead.
 */
import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, Alert, Linking } from 'react-native';
import { Feather, Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { supabase } from '@/core/supabase';

/**
 * Screen component (default export used by expo-router). Takes no props.
 * Loads data once on mount; shows a full-screen spinner until loading ends.
 */
export default function ScribeAchievementsPage() {
  // Loaded data: auth user, profile row and number of completed exams.
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const [completedExamsCount, setCompletedExamsCount] = useState(0);

  // Load once when the screen mounts.
  useEffect(() => {
    fetchData();
  }, []);

  /**
   * Fetches the session, the scribe's profile and their completed-exam count.
   * Reads `profiles` and `exam_requests`. Errors are only logged; the screen
   * then renders with defaults (0 completed, generic name). Always clears
   * `loading` at the end, including when there is no session.
   */
  const fetchData = async () => {
    try {
      // 1. Current user from the auth session; nothing to load when signed out.
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      setUser(session.user);

      // 2. Scribe's profile row (display name on badges and certificate).
      const { data: prof } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', session.user.id)
        .single();
      setProfile(prof);

      // 3. Exams this scribe has completed; only the row count drives the badges.
      const { data: completed } = await supabase
        .from('exam_requests')
        .select('id')
        .eq('status', 'completed')
        .eq('scribe_id', session.user.id);

      setCompletedExamsCount(completed ? completed.length : 0);
    } catch (e) {
      console.log('Error fetching achievements:', e);
    } finally {
      setLoading(false);
    }
  };

  /**
   * Milestone badge definitions, rebuilt every render from `completedExamsCount`.
   * Each entry: `key`, display `title` / `desc`, Ionicons `icon` name, accent
   * `color`, progress `current` / `max`, and whether it is `unlocked`.
   * The exam-count thresholds (5 / 15 / 30) match the ones the student-side
   * view_applications screen uses. The last three badges are not wired to data yet.
   */
  const badgesList = [
    { key: 'bronze', title: 'Bronze Volunteer', desc: 'Completed 5 successful scribing assignments', icon: 'award', color: '#cd7f32', current: Math.min(completedExamsCount, 5), max: 5, unlocked: completedExamsCount >= 5 },
    { key: 'silver', title: 'Silver Volunteer', desc: 'Completed 15 successful scribing assignments', icon: 'shield-checkmark', color: '#94a3b8', current: Math.min(completedExamsCount, 15), max: 15, unlocked: completedExamsCount >= 15 },
    { key: 'gold', title: 'Gold Elite Scribe', desc: 'Completed 30+ successful scribing assignments', icon: 'star', color: '#eab308', current: Math.min(completedExamsCount, 30), max: 30, unlocked: completedExamsCount >= 30 },
    { key: 'emergency', title: 'Emergency Hero', desc: 'Responded to 3+ Urgent SOS Emergency dispatches', icon: 'flash', color: '#ef4444', current: 0, max: 3, unlocked: false },
    { key: 'asg_ally', title: 'Assignment Ally', desc: 'Completed 1+ Academic Assignment assistance request', icon: 'document-text', color: '#6366f1', current: 0, max: 1, unlocked: false },
    { key: 'asg_master', title: 'Submission Hero', desc: 'Completed 5+ Homework & Assignment assistances', icon: 'checkmark-done-circle', color: '#10b981', current: 0, max: 5, unlocked: false },
  ];

  const earnedBadgesCount = badgesList.filter(b => b.unlocked).length;

  // Full-screen spinner while fetchData is running.
  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f8fafc' }}>
        <ActivityIndicator size="large" color="#2563eb" />
      </View>
    );
  }

  // Certificate details: a display ID derived from the user id, and the backend URL that renders
  // the certificate (EXPO_PUBLIC_API_URL, falling back to the hosted Axum server).
  const scribeName = profile?.full_name || 'Volunteer Scribe';
  const certId = `ANULEKH-CERT-${user?.id?.substring(0, 8).toUpperCase()}-2026`;
  const apiHost = process.env.EXPO_PUBLIC_API_URL || 'https://anulekh-axum.onrender.com';
  const certUrl = `${apiHost}/api/certificates/view/${user?.id}`;

  return (
    <View style={{ flex: 1, backgroundColor: '#f8fafc' }}>
      {/* Top Header Bar */}
      <View style={{ backgroundColor: '#ffffff', paddingTop: 50, paddingBottom: 16, paddingHorizontal: 20, borderWidth: 1, borderColor: '#e2e8f0', flexDirection: 'row', alignItems: 'center', gap: 14 }}>
        <TouchableOpacity onPress={() => router.back()} style={{ width: 36, height: 36, borderRadius: 12, backgroundColor: '#f1f5f9', alignItems: 'center', justifyContent: 'center' }}>
          <Feather name="arrow-left" size={18} color="#0f172a" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={{ fontFamily: 'Roboto', fontSize: 18, fontWeight: '900', color: '#0f172a' }}>My Achievements & Certificates</Text>
          <Text style={{ fontFamily: 'Roboto', fontSize: 11, color: '#64748b', marginTop: 1 }}>Official Recognition & Verified Credentials</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={{ padding: 20 }}>
        {/* Overview Stats Header Card */}
        <View style={{ backgroundColor: '#ffffff', borderRadius: 24, padding: 20, borderWidth: 1.5, borderColor: '#e2e8f0', shadowColor: '#64748b', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.06, shadowRadius: 16, elevation: 3, marginBottom: 24 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 }}>
            <View style={{ width: 44, height: 44, borderRadius: 14, backgroundColor: 'rgba(234,179,8,0.12)', alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="trophy" size={22} color="#eab308" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontFamily: 'Roboto', fontSize: 16, fontWeight: '900', color: '#0f172a' }}>{scribeName}</Text>
              <Text style={{ fontFamily: 'Roboto', fontSize: 11, color: '#64748b', marginTop: 1 }}>Official Certified Accessibility Scribe</Text>
            </View>
          </View>

          {/* Stat tiles: badges earned, completed exams, and estimated hours (3 per completed exam) */}
          <View style={{ flexDirection: 'row', gap: 10, paddingTop: 14, borderTopWidth: 1, borderTopColor: '#f1f5f9' }}>
            <View style={{ flex: 1, backgroundColor: '#f8fafc', borderRadius: 14, padding: 12, borderWidth: 1, borderColor: '#e2e8f0', alignItems: 'center' }}>
              <Text style={{ fontFamily: 'Roboto', fontSize: 18, fontWeight: '900', color: '#d97706' }}>{earnedBadgesCount} / {badgesList.length}</Text>
              <Text style={{ fontFamily: 'Roboto', fontSize: 10, fontWeight: '700', color: '#64748b', marginTop: 2 }}>Badges Earned</Text>
            </View>
            <View style={{ flex: 1, backgroundColor: '#f8fafc', borderRadius: 14, padding: 12, borderWidth: 1, borderColor: '#e2e8f0', alignItems: 'center' }}>
              <Text style={{ fontFamily: 'Roboto', fontSize: 18, fontWeight: '900', color: '#2563eb' }}>{completedExamsCount}</Text>
              <Text style={{ fontFamily: 'Roboto', fontSize: 10, fontWeight: '700', color: '#64748b', marginTop: 2 }}>PDF Certificates</Text>
            </View>
            <View style={{ flex: 1, backgroundColor: '#f8fafc', borderRadius: 14, padding: 12, borderWidth: 1, borderColor: '#e2e8f0', alignItems: 'center' }}>
              <Text style={{ fontFamily: 'Roboto', fontSize: 18, fontWeight: '900', color: '#059669' }}>{completedExamsCount * 3}</Text>
              <Text style={{ fontFamily: 'Roboto', fontSize: 10, fontWeight: '700', color: '#64748b', marginTop: 2 }}>Hours Scribed</Text>
            </View>
          </View>
        </View>

        {/* Section I: Detailed Badges List */}
        <View style={{ marginBottom: 28 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <Text style={{ fontFamily: 'Roboto', fontSize: 14, fontWeight: '900', color: '#0f172a', textTransform: 'uppercase', letterSpacing: 0.5 }}>
              🏆 Volunteer Milestone Badges
            </Text>
            <Text style={{ fontFamily: 'Roboto', fontSize: 11, fontWeight: '700', color: '#d97706' }}>4 Unlocked</Text>
          </View>

          {/* One card per badge; locked badges are dimmed and have no coloured border */}
          <View style={{ gap: 12 }}>
            {badgesList.map((badge) => (
              <View
                key={badge.key}
                style={{
                  backgroundColor: '#ffffff',
                  borderRadius: 20,
                  borderWidth: 1.5,
                  borderColor: badge.unlocked ? badge.color : '#e2e8f0',
                  padding: 16,
                  shadowColor: '#64748b',
                  shadowOffset: { width: 0, height: 4 },
                  shadowOpacity: badge.unlocked ? 0.06 : 0,
                  shadowRadius: 12,
                  elevation: badge.unlocked ? 2 : 0,
                  opacity: badge.unlocked ? 1 : 0.65,
                }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
                  <View style={{ width: 44, height: 44, borderRadius: 14, backgroundColor: `${badge.color}18`, alignItems: 'center', justifyContent: 'center' }}>
                    <Ionicons name={badge.icon as any} size={22} color={badge.color} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                      <Text style={{ fontFamily: 'Roboto', fontSize: 14, fontWeight: '900', color: '#0f172a' }}>{badge.title}</Text>
                      {badge.unlocked ? (
                        <View style={{ backgroundColor: `${badge.color}18`, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, borderWidth: 1, borderColor: `${badge.color}40` }}>
                          <Text style={{ fontFamily: 'Roboto', fontSize: 9, fontWeight: '900', color: badge.color }}>UNLOCKED ✓</Text>
                        </View>
                      ) : (
                        <View style={{ backgroundColor: '#f1f5f9', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 }}>
                          <Text style={{ fontFamily: 'Roboto', fontSize: 9, fontWeight: '800', color: '#94a3b8' }}>LOCKED 🔒</Text>
                        </View>
                      )}
                    </View>
                    <Text style={{ fontFamily: 'Roboto', fontSize: 11.5, color: '#64748b', marginTop: 3 }}>{badge.desc}</Text>
                    
                    {/* Progress Bar */}
                    <View style={{ marginTop: 10 }}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                        <Text style={{ fontFamily: 'Roboto', fontSize: 9.5, fontWeight: '700', color: '#94a3b8' }}>Progress</Text>
                        <Text style={{ fontFamily: 'Roboto', fontSize: 9.5, fontWeight: '800', color: badge.color }}>{badge.current} / {badge.max}</Text>
                      </View>
                      <View style={{ height: 6, backgroundColor: '#f1f5f9', borderRadius: 3, overflow: 'hidden' }}>
                        <View style={{ height: '100%', width: `${(badge.current / badge.max) * 100}%`, backgroundColor: badge.color, borderRadius: 3 }} />
                      </View>
                    </View>
                  </View>
                </View>
              </View>
            ))}
          </View>
        </View>

        {/* Section II: Verified Official Digital Certificates */}
        <View style={{ marginBottom: 30 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <Text style={{ fontFamily: 'Roboto', fontSize: 14, fontWeight: '900', color: '#0f172a', textTransform: 'uppercase', letterSpacing: 0.5 }}>
              📜 Official Digital Certificates
            </Text>
            <Text style={{ fontFamily: 'Roboto', fontSize: 11, fontWeight: '700', color: '#2563eb' }}>QR Verified</Text>
          </View>

          <View style={{ backgroundColor: '#ffffff', borderRadius: 24, borderWidth: 2, borderColor: '#eab308', padding: 20, shadowColor: '#eab308', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.12, shadowRadius: 16, elevation: 4 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: 'rgba(37,99,235,0.1)', alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name="ribbon" size={20} color="#2563eb" />
                </View>
                <View>
                  <Text style={{ fontFamily: 'Roboto', fontSize: 15, fontWeight: '900', color: '#0f172a' }}>Certificate of Volunteering</Text>
                  <Text style={{ fontFamily: 'Roboto', fontSize: 10.5, color: '#64748b' }}>Anulekh Disability Accessibility Network</Text>
                </View>
              </View>
              <View style={{ backgroundColor: '#10b981', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 }}>
                <Text style={{ fontFamily: 'Roboto', fontSize: 8.5, fontWeight: '900', color: '#ffffff' }}>VERIFIED QR</Text>
              </View>
            </View>

            {/* Certificate details: ID, recipient name and verification host */}
            <View style={{ backgroundColor: '#f8fafc', borderRadius: 14, padding: 12, borderWidth: 1, borderColor: '#e2e8f0', marginBottom: 14, gap: 6 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={{ fontFamily: 'Roboto', fontSize: 11, color: '#64748b', fontWeight: '600' }}>Certificate ID:</Text>
                <Text style={{ fontFamily: 'Roboto', fontSize: 11, color: '#0f172a', fontWeight: '800' }}>{certId}</Text>
              </View>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={{ fontFamily: 'Roboto', fontSize: 11, color: '#64748b', fontWeight: '600' }}>Awarded To:</Text>
                <Text style={{ fontFamily: 'Roboto', fontSize: 11, color: '#0f172a', fontWeight: '800' }}>{scribeName}</Text>
              </View>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={{ fontFamily: 'Roboto', fontSize: 11, color: '#64748b', fontWeight: '600' }}>Verification URL:</Text>
                <Text style={{ fontFamily: 'Roboto', fontSize: 11, color: '#2563eb', fontWeight: '800' }}>{apiHost}</Text>
              </View>
            </View>

            {/* Opens the backend-rendered certificate; falls back to showing the link in an alert */}
            <TouchableOpacity
              onPress={() => {
                Linking.openURL(certUrl).catch(() => {
                  Alert.alert("Certificate Link", certUrl);
                });
              }}
              style={{ backgroundColor: '#2563eb', paddingVertical: 12, borderRadius: 14, alignItems: 'center', justifyContent: 'center', shadowColor: '#2563eb', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 10, elevation: 3 }}
            >
              <Text style={{ fontFamily: 'Roboto', fontSize: 13, fontWeight: '900', color: '#ffffff' }}>View Verified Certificate PDF 📜</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}
