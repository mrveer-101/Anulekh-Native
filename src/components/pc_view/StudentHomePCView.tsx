import React, { useState, useEffect } from 'react';
import { View, Text, Pressable, ActivityIndicator, Alert, Linking } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { supabase } from '@/core/supabase';
import { hoursUntilExam } from '@/core/examDate';

interface StudentHomePCViewProps {
  userProfile?: any;
  requests?: any[];
  onRefresh?: () => void;
}

export default function StudentHomePCView({
  userProfile,
  requests = [],
  onRefresh,
}: StudentHomePCViewProps) {
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<any>(userProfile || null);
  const [confirmedPlans, setConfirmedPlans] = useState<any[]>([]);
  const [examRequestsCount, setExamRequestsCount] = useState(0);
  const [assignmentRequestsCount, setAssignmentRequestsCount] = useState(0);
  const [sosSendingId, setSosSendingId] = useState<number | null>(null);

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const { data: profileData } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', session.user.id)
        .single();
      setProfile(profileData || userProfile);

      // Fetch active/matched exam requests
      const { data: reqs } = await supabase
        .from('exam_requests')
        .select('*')
        .eq('student_id', session.user.id)
        .order('created_at', { ascending: false });

      const allReqs = reqs || [];
      setExamRequestsCount(allReqs.length);

      const matchedPlans = allReqs.filter((exam: any) => 
        exam.status === 'matched' || (exam.status === 'pending' && exam.is_emergency === 'yes')
      );

      // Enrich matched plans with scribe profiles
      const enriched = await Promise.all(
        matchedPlans.map(async (exam: any) => {
          let scribeProfile = null;
          if (exam.scribe_id) {
            const { data: scribe } = await supabase
              .from('profiles')
              .select('*')
              .eq('id', exam.scribe_id)
              .single();
            scribeProfile = scribe;
          }
          return { ...exam, scribeProfile };
        })
      );
      setConfirmedPlans(enriched);

      // Fetch assignment requests
      const { data: assignments } = await supabase
        .from('assignment_requests')
        .select('id')
        .eq('student_id', session.user.id);
      setAssignmentRequestsCount(assignments ? assignments.length : 0);

    } catch (err: any) {
      console.log('Error fetching PC student dashboard data:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSosBroadcast = (exam: any) => {
    Alert.alert(
      '🚨 Emergency SOS Broadcast',
      `Has your scribe for "${exam.subject || 'your exam'}" cancelled? This sends a high-priority alert to all nearby volunteer scribes. Continue?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Send SOS',
          style: 'destructive',
          onPress: async () => {
            setSosSendingId(exam.id);
            try {
              const { error: reqErr } = await supabase
                .from('exam_requests')
                .update({ status: 'pending', scribe_id: null, is_emergency: 'yes' })
                .eq('id', exam.id);
              if (reqErr) throw reqErr;

              const { data: scribes } = await supabase
                .from('profiles')
                .select('id')
                .eq('role', 'scribe')
                .eq('verification_status', 'approved');

              for (const scribe of scribes || []) {
                await supabase.from('notifications').insert({
                  user_id: scribe.id,
                  title: '🚨 URGENT: Emergency Scribe Needed',
                  message: `A candidate urgently needs a scribe for "${exam.subject || 'an exam'}". Open your app now to help!`,
                  is_read: 0,
                  created_at: new Date().toISOString(),
                });
              }
              Alert.alert('SOS Sent', 'Emergency broadcast sent to available scribes!');
              fetchDashboardData();
              if (onRefresh) onRefresh();
            } catch (err: any) {
              Alert.alert('Error', err.message || 'Failed to send SOS.');
            } finally {
              setSosSendingId(null);
            }
          },
        },
      ]
    );
  };

  const openCallScribe = (phoneNumber: string) => {
    if (!phoneNumber) {
      Alert.alert('Contact Locked', 'Scribe phone number will be unlocked on the exam day.');
      return;
    }
    Linking.openURL(`tel:${phoneNumber}`).catch(() => {
      Alert.alert('Call Failed', `Phone number: ${phoneNumber}`);
    });
  };

  if (loading) {
    return (
      <View style={{ paddingVertical: 60, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" color="#2563eb" />
        <Text style={{ marginTop: 14, color: '#64748b', fontSize: 14, fontWeight: '600' }}>
          Loading your candidate workspace…
        </Text>
      </View>
    );
  }

  const isApproved = profile?.verification_status === 'approved';

  // Glassmorphic Card Helper Styles (Ultra-Glassmorphic System)
  const glassCardStyle = {
    backgroundColor: 'rgba(255, 255, 255, 0.72)',
    backdropFilter: 'blur(24px) saturate(180%)',
    WebkitBackdropFilter: 'blur(24px) saturate(180%)',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.85)',
    borderTopColor: 'rgba(255, 255, 255, 0.98)',
    borderLeftColor: 'rgba(255, 255, 255, 0.9)',
    shadowColor: '#2563eb',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.06,
    shadowRadius: 28,
    elevation: 6,
    boxShadow: '0 12px 36px 0 rgba(37, 99, 235, 0.08), inset 0 1px 2px 0 rgba(255, 255, 255, 0.95)',
  };

  return (
    <View style={{ gap: 28 }}>
      {/* ── 1. WELCOME HERO & QUICK STATS ROW (Glassmorphic) ── */}
      <View style={{
        ...glassCardStyle,
        padding: 28,
      }}>
        {/* Hero Banner Header */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 16 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16, flex: 1, minWidth: 280 }}>
            <View style={{
              width: 58, height: 58, borderRadius: 20,
              backgroundColor: 'rgba(37,99,235,0.12)', borderWidth: 1.5, borderColor: 'rgba(37,99,235,0.25)',
              alignItems: 'center', justifyContent: 'center',
              shadowColor: '#2563eb', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 8,
            }}>
              <Text style={{ fontSize: 26, fontWeight: '900', color: '#2563eb' }}>
                {profile?.full_name ? profile.full_name.charAt(0).toUpperCase() : 'S'}
              </Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 22, fontWeight: '900', color: '#0f172a', letterSpacing: -0.5 }}>
                Welcome back, {profile?.full_name || 'Candidate'}! 👋
              </Text>
              <Text style={{ fontSize: 14, color: '#64748b', marginTop: 2 }}>
                Manage your scribe requests, verified matches, and exam schedule effortlessly.
              </Text>
            </View>
          </View>

          {/* Verification Status Pill */}
          <View style={{
            flexDirection: 'row', alignItems: 'center', gap: 8,
            backgroundColor: isApproved ? 'rgba(22,163,74,0.1)' : 'rgba(234,88,12,0.1)',
            borderWidth: 1, borderColor: isApproved ? 'rgba(22,163,74,0.25)' : 'rgba(234,88,12,0.25)',
            paddingHorizontal: 16, paddingVertical: 8, borderRadius: 14,
            backdropFilter: 'blur(10px)',
          }}>
            <Feather name={isApproved ? "check-circle" : "clock"} size={16} color={isApproved ? "#16a34a" : "#ea580c"} />
            <Text style={{ fontSize: 13, fontWeight: '800', color: isApproved ? "#16a34a" : "#ea580c" }}>
              {isApproved ? "VERIFIED CANDIDATE" : "VERIFICATION PENDING"}
            </Text>
          </View>
        </View>

        {/* 4 Glassmorphic Desktop Quick Stat Cards Grid (Fluid Wrapping) */}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 16 }}>
          {/* Stat 1: Total Exam Requests */}
          <View style={{
            flex: 1, minWidth: 210, backgroundColor: 'rgba(248, 250, 252, 0.85)', borderWidth: 1, borderColor: 'rgba(226, 232, 240, 0.8)',
            borderRadius: 18, padding: 20, flexDirection: 'row', alignItems: 'center', gap: 16,
            backdropFilter: 'blur(12px)',
          }}>
            <View style={{
              width: 48, height: 48, borderRadius: 14,
              backgroundColor: 'rgba(37,99,235,0.12)', alignItems: 'center', justifyContent: 'center',
            }}>
              <Feather name="file-text" size={22} color="#2563eb" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 24, fontWeight: '900', color: '#0f172a' }}>{examRequestsCount}</Text>
              <Text style={{ fontSize: 12, fontWeight: '700', color: '#64748b', marginTop: 2 }}>Exam Requests</Text>
            </View>
          </View>

          {/* Stat 2: Active Matches */}
          <View style={{
            flex: 1, minWidth: 210, backgroundColor: 'rgba(248, 250, 252, 0.85)', borderWidth: 1, borderColor: 'rgba(226, 232, 240, 0.8)',
            borderRadius: 18, padding: 20, flexDirection: 'row', alignItems: 'center', gap: 16,
            backdropFilter: 'blur(12px)',
          }}>
            <View style={{
              width: 48, height: 48, borderRadius: 14,
              backgroundColor: 'rgba(22,163,74,0.12)', alignItems: 'center', justifyContent: 'center',
            }}>
              <Feather name="user-check" size={22} color="#16a34a" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 24, fontWeight: '900', color: '#0f172a' }}>{confirmedPlans.length}</Text>
              <Text style={{ fontSize: 12, fontWeight: '700', color: '#64748b', marginTop: 2 }}>Confirmed Scribes</Text>
            </View>
          </View>

          {/* Stat 3: Assignment Requests */}
          <View style={{
            flex: 1, minWidth: 210, backgroundColor: 'rgba(248, 250, 252, 0.85)', borderWidth: 1, borderColor: 'rgba(226, 232, 240, 0.8)',
            borderRadius: 18, padding: 20, flexDirection: 'row', alignItems: 'center', gap: 16,
            backdropFilter: 'blur(12px)',
          }}>
            <View style={{
              width: 48, height: 48, borderRadius: 14,
              backgroundColor: 'rgba(147,51,234,0.12)', alignItems: 'center', justifyContent: 'center',
            }}>
              <Feather name="book-open" size={22} color="#9333ea" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 24, fontWeight: '900', color: '#0f172a' }}>{assignmentRequestsCount}</Text>
              <Text style={{ fontSize: 12, fontWeight: '700', color: '#64748b', marginTop: 2 }}>Assignment Requests</Text>
            </View>
          </View>

          {/* Stat 4: Fast Quick Action Button */}
          <Pressable
            onPress={() => router.push('/console/student/request_form')}
            style={({ hovered }: any) => ({
              flex: 1, minWidth: 210,
              backgroundColor: hovered ? '#1d4ed8' : '#2563eb',
              borderRadius: 18, padding: 20,
              flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12,
              cursor: 'pointer' as any,
              shadowColor: '#2563eb', shadowOffset: { width: 0, height: 6 },
              shadowOpacity: 0.25, shadowRadius: 12, elevation: 6,
            })}
          >
            <Feather name="plus-circle" size={22} color="#ffffff" />
            <View>
              <Text style={{ fontSize: 15, fontWeight: '900', color: '#ffffff' }}>New Scribe Request</Text>
              <Text style={{ fontSize: 11, fontWeight: '600', color: 'rgba(255,255,255,0.85)', marginTop: 2 }}>
                Find verified volunteer
              </Text>
            </View>
          </Pressable>
        </View>
      </View>

      {/* ── 2. ACTIVE EXAM MATCHES & SCRIBE CONFIRMATIONS ── */}
      <View style={{ gap: 16 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <Text style={{ fontSize: 20, fontWeight: '900', color: '#0f172a' }}>
            Your Confirmed Scribes & Exams 🎯
          </Text>

          <Pressable
            onPress={() => router.push('/console/student/request_form')}
            style={({ hovered }: any) => ({
              flexDirection: 'row', alignItems: 'center', gap: 8,
              backgroundColor: hovered ? 'rgba(37,99,235,0.15)' : 'rgba(37,99,235,0.08)',
              borderWidth: 1, borderColor: 'rgba(37,99,235,0.22)',
              paddingHorizontal: 16, paddingVertical: 10, borderRadius: 12,
              cursor: 'pointer' as any,
              backdropFilter: 'blur(10px)',
            })}
          >
            <Feather name="plus" size={16} color="#2563eb" />
            <Text style={{ fontSize: 13, fontWeight: '800', color: '#2563eb' }}>Request Scribe</Text>
          </Pressable>
        </View>

        {confirmedPlans.length === 0 ? (
          <View style={{
            ...glassCardStyle,
            padding: 40,
            alignItems: 'center', justifyContent: 'center',
            borderStyle: 'dashed',
          }}>
            <View style={{
              width: 64, height: 64, borderRadius: 20,
              backgroundColor: 'rgba(37,99,235,0.1)', alignItems: 'center', justifyContent: 'center',
              marginBottom: 16,
            }}>
              <Feather name="calendar" size={28} color="#2563eb" />
            </View>
            <Text style={{ fontSize: 18, fontWeight: '800', color: '#0f172a', marginBottom: 4 }}>
              No Matched Scribe Requests Yet
            </Text>
            <Text style={{ fontSize: 13, color: '#64748b', marginBottom: 20 }}>
              Submit a request to match with verified nearby volunteer scribes.
            </Text>
            <Pressable
              onPress={() => router.push('/console/student/request_form')}
              style={({ hovered }: any) => ({
                backgroundColor: hovered ? '#1d4ed8' : '#2563eb',
                paddingHorizontal: 22, paddingVertical: 12, borderRadius: 14,
                flexDirection: 'row', alignItems: 'center', gap: 8,
                cursor: 'pointer' as any,
              })}
            >
              <Feather name="plus-circle" size={18} color="#ffffff" />
              <Text style={{ fontSize: 14, fontWeight: '800', color: '#ffffff' }}>Create Request Now</Text>
            </Pressable>
          </View>
        ) : (
          <View style={{ gap: 16 }}>
            {confirmedPlans.map((exam: any) => {
              const scribe = exam.scribeProfile;
              const hours = hoursUntilExam(exam.exam_date);
              const isUrgent = hours !== null && hours >= 0 && hours <= 24;

              return (
                <View
                  key={exam.id}
                  style={{
                    ...glassCardStyle,
                    borderColor: isUrgent ? 'rgba(239,68,68,0.35)' : 'rgba(255,255,255,0.85)',
                    padding: 24,
                  }}
                >
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16 }}>
                    {/* Left: Exam & Scribe Details */}
                    <View style={{ flex: 1, minWidth: 280, gap: 12 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                        <Text style={{ fontSize: 20, fontWeight: '900', color: '#0f172a' }}>
                          {exam.subject || 'Upcoming Exam'}
                        </Text>
                        <View style={{
                          backgroundColor: exam.status === 'matched' ? 'rgba(22,163,74,0.1)' : 'rgba(234,88,12,0.1)',
                          borderWidth: 1,
                          borderColor: exam.status === 'matched' ? 'rgba(22,163,74,0.3)' : 'rgba(234,88,12,0.3)',
                          paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8,
                        }}>
                          <Text style={{
                            fontSize: 11, fontWeight: '800',
                            color: exam.status === 'matched' ? '#16a34a' : '#ea580c',
                            textTransform: 'uppercase',
                          }}>
                            {exam.status === 'matched' ? 'SCRIBE MATCHED' : 'PENDING SOS'}
                          </Text>
                        </View>
                      </View>

                      {/* Exam Details Grid Row */}
                      <View style={{ flexDirection: 'row', gap: 24, flexWrap: 'wrap' }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                          <Feather name="calendar" size={15} color="#64748b" />
                          <Text style={{ fontSize: 13, fontWeight: '700', color: '#334155' }}>
                            {exam.exam_date || 'Date not specified'}
                          </Text>
                        </View>

                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                          <Feather name="map-pin" size={15} color="#64748b" />
                          <Text style={{ fontSize: 13, fontWeight: '700', color: '#334155' }}>
                            {exam.exam_center_address || exam.exam_venue || 'Center not specified'}
                          </Text>
                        </View>

                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                          <Feather name="globe" size={15} color="#64748b" />
                          <Text style={{ fontSize: 13, fontWeight: '700', color: '#334155' }}>
                            Language: {exam.language || 'English'}
                          </Text>
                        </View>
                      </View>

                      {/* Scribe Details Pill */}
                      {scribe ? (
                        <View style={{
                          flexDirection: 'row', alignItems: 'center', gap: 14,
                          backgroundColor: 'rgba(248,250,252,0.85)', borderWidth: 1, borderColor: '#e2e8f0',
                          borderRadius: 16, padding: 14, marginTop: 4, maxWidth: 520,
                          backdropFilter: 'blur(10px)', flexWrap: 'wrap',
                        }}>
                          <View style={{
                            width: 44, height: 44, borderRadius: 14,
                            backgroundColor: '#16a34a', alignItems: 'center', justifyContent: 'center',
                          }}>
                            <Text style={{ fontSize: 18, fontWeight: '900', color: '#ffffff' }}>
                              {scribe.full_name ? scribe.full_name.charAt(0).toUpperCase() : 'V'}
                            </Text>
                          </View>
                          <View style={{ flex: 1, minWidth: 180 }}>
                            <Text style={{ fontSize: 14, fontWeight: '800', color: '#0f172a' }}>
                              Scribe: {scribe.full_name || 'Assigned Volunteer'}
                            </Text>
                            <Text style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
                              {scribe.qualification ? `Qualification: ${scribe.qualification}` : 'Verified Scribe Volunteer'}
                            </Text>
                          </View>
                          <Pressable
                            onPress={() => openCallScribe(scribe.phone)}
                            style={({ hovered }: any) => ({
                              flexDirection: 'row', alignItems: 'center', gap: 6,
                              backgroundColor: hovered ? '#15803d' : '#16a34a',
                              paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10,
                              cursor: 'pointer' as any,
                            })}
                          >
                            <Feather name="phone" size={14} color="#ffffff" />
                            <Text style={{ fontSize: 12, fontWeight: '800', color: '#ffffff' }}>Contact</Text>
                          </Pressable>
                        </View>
                      ) : (
                        <Text style={{ fontSize: 13, color: '#64748b', fontStyle: 'italic' }}>
                          Finding best matched scribe in your city…
                        </Text>
                      )}
                    </View>

                    {/* Right Action Buttons */}
                    <View style={{ gap: 10, alignItems: 'flex-end' }}>
                      {/* Emergency SOS Broadcast Button */}
                      <Pressable
                        onPress={() => handleSosBroadcast(exam)}
                        disabled={sosSendingId === exam.id}
                        style={({ hovered }: any) => ({
                          flexDirection: 'row', alignItems: 'center', gap: 8,
                          backgroundColor: hovered ? 'rgba(239,68,68,0.2)' : 'rgba(239,68,68,0.08)',
                          borderWidth: 1, borderColor: 'rgba(239,68,68,0.3)',
                          paddingHorizontal: 16, paddingVertical: 10, borderRadius: 12,
                          cursor: 'pointer' as any,
                        })}
                      >
                        {sosSendingId === exam.id ? (
                          <ActivityIndicator size="small" color="#ef4444" />
                        ) : (
                          <>
                            <Feather name="alert-triangle" size={16} color="#ef4444" />
                            <Text style={{ fontSize: 13, fontWeight: '800', color: '#ef4444' }}>
                              SOS Broadcast
                            </Text>
                          </>
                        )}
                      </Pressable>
                    </View>
                  </View>
                </View>
              );
            })}
          </View>
        )}
      </View>
    </View>
  );
}
