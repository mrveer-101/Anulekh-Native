import React from 'react';
import { View, Text, TouchableOpacity, ScrollView, Image } from 'react-native';
import { router } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { supabase } from '@/core/supabase';

interface ConsoleStudentPCProps {
  userProfile?: any;
  requests?: any[];
  onRefresh?: () => void;
}

export default function ConsoleStudentPC({ userProfile, requests = [], onRefresh }: ConsoleStudentPCProps) {
  const handleLogout = async () => {
    try {
      await supabase.auth.signOut();
    } catch (_) {}
    router.replace('/auth/login');
  };

  return (
    <View style={{ flex: 1, flexDirection: 'row', backgroundColor: '#f8fafc' }}>
      {/* ── Left Desktop Navigation Sidebar ── */}
      <View style={{
        width: 260,
        backgroundColor: '#0f172a',
        borderRightWidth: 1,
        borderRightColor: 'rgba(51, 65, 85, 0.6)',
        paddingVertical: 32,
        paddingHorizontal: 20,
        justifyContent: 'space-between',
      }}>
        <View>
          {/* Brand Logo */}
          <TouchableOpacity
            onPress={() => router.push('/')}
            activeOpacity={0.8}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 36, paddingHorizontal: 8 }}
          >
            <View style={{
              width: 40, height: 40, borderRadius: 12,
              backgroundColor: '#ffffff', alignItems: 'center', justifyContent: 'center',
              overflow: 'hidden',
            }}>
              <Image
                source={require('../../../assets/images/custom/Pen_Logo.jpg')}
                style={{ width: '100%', height: '100%' }}
                resizeMode="cover"
              />
            </View>
            <View>
              <Text style={{ fontSize: 20, fontWeight: '900', color: '#ffffff' }}>Anulekh</Text>
              <Text style={{ fontSize: 11, fontWeight: '700', color: '#60a5fa' }}>Student Portal</Text>
            </View>
          </TouchableOpacity>

          {/* User Profile Card */}
          <View style={{
            backgroundColor: 'rgba(30, 41, 59, 0.7)',
            borderWidth: 1, borderColor: 'rgba(51, 65, 85, 0.8)',
            borderRadius: 16, padding: 14, marginBottom: 28,
            flexDirection: 'row', alignItems: 'center', gap: 12,
          }}>
            <View style={{
              width: 42, height: 42, borderRadius: 14,
              backgroundColor: '#2563eb', alignItems: 'center', justifyContent: 'center',
            }}>
              <Text style={{ fontSize: 18, fontWeight: '900', color: '#ffffff' }}>
                {userProfile?.full_name ? userProfile.full_name.charAt(0).toUpperCase() : 'S'}
              </Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 14, fontWeight: '800', color: '#ffffff' }} numberOfLines={1}>
                {userProfile?.full_name || 'Student Candidate'}
              </Text>
              <View style={{
                backgroundColor: 'rgba(37, 99, 235, 0.2)',
                paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6,
                alignSelf: 'flex-start', marginTop: 4,
              }}>
                <Text style={{ fontSize: 10, fontWeight: '800', color: '#60a5fa' }}>CANDIDATE</Text>
              </View>
            </View>
          </View>

          {/* Sidebar Menu Items */}
          <View style={{ gap: 8 }}>
            <TouchableOpacity style={{
              flexDirection: 'row', alignItems: 'center', gap: 12,
              backgroundColor: 'rgba(37, 99, 235, 0.15)', borderWidth: 1, borderColor: 'rgba(37, 99, 235, 0.3)',
              paddingHorizontal: 16, paddingVertical: 12, borderRadius: 14,
            }}>
              <Feather name="grid" size={18} color="#60a5fa" />
              <Text style={{ fontSize: 14, fontWeight: '800', color: '#ffffff' }}>Dashboard</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => router.push('/console/student/create-request' as any)}
              style={{
                flexDirection: 'row', alignItems: 'center', gap: 12,
                paddingHorizontal: 16, paddingVertical: 12, borderRadius: 14,
              }}
            >
              <Feather name="plus-circle" size={18} color="#94a3b8" />
              <Text style={{ fontSize: 14, fontWeight: '700', color: '#94a3b8' }}>New Exam Request</Text>
            </TouchableOpacity>

            <TouchableOpacity style={{
              flexDirection: 'row', alignItems: 'center', gap: 12,
              paddingHorizontal: 16, paddingVertical: 12, borderRadius: 14,
            }}>
              <Feather name="shield" size={18} color="#94a3b8" />
              <Text style={{ fontSize: 14, fontWeight: '700', color: '#94a3b8' }}>Profile Verification</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Logout Button */}
        <TouchableOpacity
          onPress={handleLogout}
          style={{
            flexDirection: 'row', alignItems: 'center', gap: 12,
            backgroundColor: 'rgba(239, 68, 68, 0.1)', borderWidth: 1, borderColor: 'rgba(239, 68, 68, 0.25)',
            paddingHorizontal: 16, paddingVertical: 12, borderRadius: 14,
          }}
        >
          <Feather name="log-out" size={18} color="#f87171" />
          <Text style={{ fontSize: 14, fontWeight: '800', color: '#f87171' }}>Log Out</Text>
        </TouchableOpacity>
      </View>

      {/* ── Main Content Area ── */}
      <View style={{ flex: 1 }}>
        {/* Top Header Bar */}
        <View style={{
          height: 72, backgroundColor: '#ffffff',
          borderBottomWidth: 1, borderBottomColor: 'rgba(226, 232, 240, 0.8)',
          paddingHorizontal: 36, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <View>
            <Text style={{ fontSize: 22, fontWeight: '900', color: '#0f172a' }}>Student Dashboard</Text>
            <Text style={{ fontSize: 12, color: '#64748b', fontWeight: '600' }}>Manage your scribe requests & matches</Text>
          </View>

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
            <TouchableOpacity
              onPress={() => router.push('/console/student/create-request' as any)}
              style={{
                backgroundColor: '#2563eb', paddingHorizontal: 20, paddingVertical: 10, borderRadius: 12,
                flexDirection: 'row', alignItems: 'center', gap: 8,
              }}
            >
              <Feather name="plus" size={16} color="#ffffff" />
              <Text style={{ fontSize: 14, fontWeight: '800', color: '#ffffff' }}>New Exam Request</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Dashboard Grid Content */}
        <ScrollView contentContainerStyle={{ padding: 36 }} showsVerticalScrollIndicator={false}>
          <View style={{ flexDirection: 'row', gap: 28 }}>
            {/* Main Column: Exam Requests List */}
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
                <Text style={{ fontSize: 18, fontWeight: '800', color: '#0f172a' }}>
                  My Exam Requests ({requests.length})
                </Text>
                {onRefresh && (
                  <TouchableOpacity onPress={onRefresh} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Feather name="refresh-cw" size={14} color="#2563eb" />
                    <Text style={{ fontSize: 13, fontWeight: '700', color: '#2563eb' }}>Refresh</Text>
                  </TouchableOpacity>
                )}
              </View>

              {requests.length === 0 ? (
                <View style={{
                  backgroundColor: '#ffffff', borderWidth: 1, borderColor: 'rgba(226, 232, 240, 0.8)',
                  borderRadius: 20, padding: 48, alignItems: 'center', justifyContent: 'center',
                }}>
                  <Feather name="file-text" size={40} color="#94a3b8" style={{ marginBottom: 16 }} />
                  <Text style={{ fontSize: 18, fontWeight: '800', color: '#0f172a', marginBottom: 8 }}>No Exam Requests Yet</Text>
                  <Text style={{ fontSize: 14, color: '#64748b', textAlign: 'center', maxWidth: 360, marginBottom: 24 }}>
                    Submit an exam request with your subject, center address, and exam date to match with nearby scribes.
                  </Text>
                  <TouchableOpacity
                    onPress={() => router.push('/console/student/create-request' as any)}
                    style={{
                      backgroundColor: '#2563eb', paddingHorizontal: 24, paddingVertical: 12, borderRadius: 14,
                    }}
                  >
                    <Text style={{ fontSize: 14, fontWeight: '800', color: '#ffffff' }}>Create First Request</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <View style={{ gap: 16 }}>
                  {requests.map((req) => (
                    <View key={req.id} style={{
                      backgroundColor: '#ffffff', borderWidth: 1, borderColor: 'rgba(226, 232, 240, 0.9)',
                      borderRadius: 20, padding: 24, shadowColor: '#0f172a', shadowOffset: { width: 0, height: 4 },
                      shadowOpacity: 0.03, shadowRadius: 12, elevation: 2,
                    }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                        <Text style={{ fontSize: 18, fontWeight: '800', color: '#0f172a' }}>{req.subject || 'Exam Request'}</Text>
                        <View style={{
                          backgroundColor: req.status === 'accepted' ? 'rgba(22, 163, 74, 0.1)' : 'rgba(234, 88, 12, 0.1)',
                          paddingHorizontal: 12, paddingVertical: 4, borderRadius: 8,
                        }}>
                          <Text style={{ fontSize: 12, fontWeight: '800', color: req.status === 'accepted' ? '#16a34a' : '#ea580c' }}>
                            {req.status ? req.status.toUpperCase() : 'SEARCHING SCRIBE'}
                          </Text>
                        </View>
                      </View>

                      <View style={{ gap: 8, marginBottom: 16 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                          <Feather name="calendar" size={14} color="#64748b" />
                          <Text style={{ fontSize: 14, color: '#475569', fontWeight: '600' }}>Date: {req.exam_date || 'Upcoming'}</Text>
                        </View>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                          <Feather name="map-pin" size={14} color="#64748b" />
                          <Text style={{ fontSize: 14, color: '#475569', fontWeight: '600' }}>Center: {req.exam_center_address || 'Address provided'}</Text>
                        </View>
                      </View>
                    </View>
                  ))}
                </View>
              )}
            </View>

            {/* Right Side Panel: Platform Quick Stats & SOS Backup */}
            <View style={{ width: 320, gap: 20 }}>
              <View style={{
                backgroundColor: '#ffffff', borderWidth: 1, borderColor: 'rgba(226, 232, 240, 0.9)',
                borderRadius: 20, padding: 24,
              }}>
                <Text style={{ fontSize: 16, fontWeight: '800', color: '#0f172a', marginBottom: 16 }}>Quick Summary</Text>
                <View style={{ gap: 14 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Text style={{ fontSize: 14, color: '#64748b' }}>Total Requests</Text>
                    <Text style={{ fontSize: 16, fontWeight: '800', color: '#0f172a' }}>{requests.length}</Text>
                  </View>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Text style={{ fontSize: 14, color: '#64748b' }}>Matched Scribes</Text>
                    <Text style={{ fontSize: 16, fontWeight: '800', color: '#16a34a' }}>
                      {requests.filter(r => r.status === 'accepted').length}
                    </Text>
                  </View>
                </View>
              </View>

              {/* SOS Emergency Box */}
              <View style={{
                backgroundColor: 'rgba(254, 243, 199, 0.6)', borderWidth: 1, borderColor: 'rgba(245, 158, 11, 0.4)',
                borderRadius: 20, padding: 20,
              }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                  <Feather name="zap" size={20} color="#d97706" />
                  <Text style={{ fontSize: 16, fontWeight: '800', color: '#78350f' }}>SOS Emergency Mode</Text>
                </View>
                <Text style={{ fontSize: 13, color: '#92400e', lineHeight: 19, marginBottom: 14 }}>
                  If your matched scribe faces a morning emergency, activate the 3-minute reserve scribe pool.
                </Text>
              </View>
            </View>
          </View>
        </ScrollView>
      </View>
    </View>
  );
}
