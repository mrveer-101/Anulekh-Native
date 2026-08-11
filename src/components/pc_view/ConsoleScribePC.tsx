import React from 'react';
import { View, Text, TouchableOpacity, ScrollView, Image } from 'react-native';
import { router } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { supabase } from '@/core/supabase';

interface ConsoleScribePCProps {
  userProfile?: any;
  availableRequests?: any[];
  myAssignedRequests?: any[];
  onAcceptRequest?: (requestId: string) => void;
  onRefresh?: () => void;
}

export default function ConsoleScribePC({
  userProfile,
  availableRequests = [],
  myAssignedRequests = [],
  onAcceptRequest,
  onRefresh,
}: ConsoleScribePCProps) {
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
              <Text style={{ fontSize: 11, fontWeight: '700', color: '#10b981' }}>Scribe Portal</Text>
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
              backgroundColor: '#10b981', alignItems: 'center', justifyContent: 'center',
            }}>
              <Text style={{ fontSize: 18, fontWeight: '900', color: '#ffffff' }}>
                {userProfile?.full_name ? userProfile.full_name.charAt(0).toUpperCase() : 'V'}
              </Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 14, fontWeight: '800', color: '#ffffff' }} numberOfLines={1}>
                {userProfile?.full_name || 'Volunteer Scribe'}
              </Text>
              <View style={{
                backgroundColor: 'rgba(16, 185, 129, 0.2)',
                paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6,
                alignSelf: 'flex-start', marginTop: 4,
              }}>
                <Text style={{ fontSize: 10, fontWeight: '800', color: '#34d399' }}>VERIFIED SCRIBE</Text>
              </View>
            </View>
          </View>

          {/* Sidebar Menu Items */}
          <View style={{ gap: 8 }}>
            <TouchableOpacity style={{
              flexDirection: 'row', alignItems: 'center', gap: 12,
              backgroundColor: 'rgba(16, 185, 129, 0.15)', borderWidth: 1, borderColor: 'rgba(16, 185, 129, 0.3)',
              paddingHorizontal: 16, paddingVertical: 12, borderRadius: 14,
            }}>
              <Feather name="grid" size={18} color="#34d399" />
              <Text style={{ fontSize: 14, fontWeight: '800', color: '#ffffff' }}>Exam Matches</Text>
            </TouchableOpacity>

            <TouchableOpacity style={{
              flexDirection: 'row', alignItems: 'center', gap: 12,
              paddingHorizontal: 16, paddingVertical: 12, borderRadius: 14,
            }}>
              <Feather name="award" size={18} color="#94a3b8" />
              <Text style={{ fontSize: 14, fontWeight: '700', color: '#94a3b8' }}>My Commitments</Text>
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
            <Text style={{ fontSize: 22, fontWeight: '900', color: '#0f172a' }}>Volunteer Scribe Console</Text>
            <Text style={{ fontSize: 12, color: '#64748b', fontWeight: '600' }}>Review & accept exam requests in your area</Text>
          </View>

          {onRefresh && (
            <TouchableOpacity
              onPress={onRefresh}
              style={{
                backgroundColor: 'rgba(241, 245, 249, 0.9)', borderWidth: 1, borderColor: 'rgba(203, 213, 225, 0.8)',
                paddingHorizontal: 16, paddingVertical: 10, borderRadius: 12,
                flexDirection: 'row', alignItems: 'center', gap: 8,
              }}
            >
              <Feather name="refresh-cw" size={14} color="#0f172a" />
              <Text style={{ fontSize: 14, fontWeight: '800', color: '#0f172a' }}>Refresh Matches</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Dashboard Grid Content */}
        <ScrollView contentContainerStyle={{ padding: 36 }} showsVerticalScrollIndicator={false}>
          <View style={{ flexDirection: 'row', gap: 28 }}>
            {/* Main Column: Available Requests to Assist */}
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 18, fontWeight: '800', color: '#0f172a', marginBottom: 20 }}>
                Available Student Requests ({availableRequests.length})
              </Text>

              {availableRequests.length === 0 ? (
                <View style={{
                  backgroundColor: '#ffffff', borderWidth: 1, borderColor: 'rgba(226, 232, 240, 0.8)',
                  borderRadius: 20, padding: 48, alignItems: 'center', justifyContent: 'center',
                }}>
                  <Feather name="check-circle" size={40} color="#10b981" style={{ marginBottom: 16 }} />
                  <Text style={{ fontSize: 18, fontWeight: '800', color: '#0f172a', marginBottom: 8 }}>All Nearby Requests Covered</Text>
                  <Text style={{ fontSize: 14, color: '#64748b', textAlign: 'center', maxWidth: 360 }}>
                    Thank you for being on standby! New student requests in your location will appear here automatically.
                  </Text>
                </View>
              ) : (
                <View style={{ gap: 16 }}>
                  {availableRequests.map((req) => (
                    <View key={req.id} style={{
                      backgroundColor: '#ffffff', borderWidth: 1, borderColor: 'rgba(226, 232, 240, 0.9)',
                      borderRadius: 20, padding: 24, shadowColor: '#0f172a', shadowOffset: { width: 0, height: 4 },
                      shadowOpacity: 0.03, shadowRadius: 12, elevation: 2,
                    }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                        <Text style={{ fontSize: 18, fontWeight: '800', color: '#0f172a' }}>{req.subject || 'Exam Request'}</Text>
                        <View style={{ backgroundColor: 'rgba(37, 99, 235, 0.1)', paddingHorizontal: 12, paddingVertical: 4, borderRadius: 8 }}>
                          <Text style={{ fontSize: 12, fontWeight: '800', color: '#2563eb' }}>MATCH AVAILABLE</Text>
                        </View>
                      </View>

                      <View style={{ gap: 8, marginBottom: 18 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                          <Feather name="calendar" size={14} color="#64748b" />
                          <Text style={{ fontSize: 14, color: '#475569', fontWeight: '600' }}>Date: {req.exam_date || 'Upcoming'}</Text>
                        </View>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                          <Feather name="map-pin" size={14} color="#64748b" />
                          <Text style={{ fontSize: 14, color: '#475569', fontWeight: '600' }}>Center: {req.exam_center_address || 'Address provided'}</Text>
                        </View>
                      </View>

                      {onAcceptRequest && (
                        <TouchableOpacity
                          onPress={() => onAcceptRequest(req.id)}
                          activeOpacity={0.85}
                          style={{
                            backgroundColor: '#10b981', paddingVertical: 12, borderRadius: 14,
                            alignItems: 'center', justifyContent: 'center',
                          }}
                        >
                          <Text style={{ fontSize: 15, fontWeight: '800', color: '#ffffff' }}>Accept Scribe Request</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  ))}
                </View>
              )}
            </View>

            {/* Right Side Panel: My Commitments */}
            <View style={{ width: 320, gap: 20 }}>
              <View style={{
                backgroundColor: '#ffffff', borderWidth: 1, borderColor: 'rgba(226, 232, 240, 0.9)',
                borderRadius: 20, padding: 24,
              }}>
                <Text style={{ fontSize: 16, fontWeight: '800', color: '#0f172a', marginBottom: 16 }}>My Commitments</Text>
                <Text style={{ fontSize: 28, fontWeight: '900', color: '#10b981' }}>{myAssignedRequests.length}</Text>
                <Text style={{ fontSize: 13, color: '#64748b', marginTop: 4 }}>Exams you have committed to assist</Text>
              </View>
            </View>
          </View>
        </ScrollView>
      </View>
    </View>
  );
}
