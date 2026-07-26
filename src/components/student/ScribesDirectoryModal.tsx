import React, { useState, useEffect } from 'react';
import { View, Text, Modal, TouchableOpacity, ScrollView, TextInput, ActivityIndicator, Alert, FlatList, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather, Ionicons } from '@expo/vector-icons';
import { supabase } from '@/core/supabase';

interface ScribesDirectoryModalProps {
  visible: boolean;
  onClose: () => void;
  studentId: string;
  preSelectedRequest?: { id: number; type: 'exam' | 'assignment'; subject: string };
}

export default function ScribesDirectoryModal({ visible, onClose, studentId, preSelectedRequest }: ScribesDirectoryModalProps) {
  const [loading, setLoading] = useState(false);
  const [scribes, setScribes] = useState<any[]>([]);
  const [ratings, setRatings] = useState<{ [key: string]: any }>({});
  const [searchQuery, setSearchQuery] = useState('');
  
  // Invitation picker state
  const [invitingScribe, setInvitingScribe] = useState<any | null>(null);
  const [invitationType, setInvitationType] = useState<'exam' | 'assignment'>('exam');
  const [studentRequests, setStudentRequests] = useState<any[]>([]);
  const [studentAssignments, setStudentAssignments] = useState<any[]>([]);
  const [showInvitePicker, setShowInvitePicker] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [sentInvites, setSentInvites] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (visible) {
      fetchScribesAndRatings();
      fetchStudentRequests();
    } else {
      // Reset sent invites when modal closes
      setSentInvites(new Set());
    }
  }, [visible]);

  useEffect(() => {
    if (visible && preSelectedRequest) {
      fetchSentInvites();
    } else {
      setSentInvites(new Set());
    }
  }, [visible, preSelectedRequest]);

  const fetchScribesAndRatings = async () => {
    setLoading(true);
    try {
      // 1. Fetch Scribe Profiles
      const { data: scribeData, error: scribeErr } = await supabase
        .from('profiles')
        .select('*')
        .eq('role', 'scribe')
        .eq('verification_status', 'approved');

      if (scribeErr) throw scribeErr;

      // 2. Fetch all Scribe Reviews to compute 5 rating distinctions
      const { data: reviewData, error: reviewErr } = await supabase
        .from('scribe_reviews')
        .select('scribe_id, rating_punctuality, rating_communication, rating_speed, rating_behavior, rating_overall');

      if (reviewErr) throw reviewErr;

      // Calculate averages across 5 distinctions
      const ratingMap: { [key: string]: { 
        sumOverall: number; 
        sumPunctuality: number;
        sumCommunication: number;
        sumSpeed: number;
        sumBehavior: number;
        count: number; 
      } } = {};

      (reviewData || []).forEach((r: any) => {
        if (!ratingMap[r.scribe_id]) {
          ratingMap[r.scribe_id] = { sumOverall: 0, sumPunctuality: 0, sumCommunication: 0, sumSpeed: 0, sumBehavior: 0, count: 0 };
        }
        ratingMap[r.scribe_id].sumOverall += r.rating_overall || 5;
        ratingMap[r.scribe_id].sumPunctuality += r.rating_punctuality || 5;
        ratingMap[r.scribe_id].sumCommunication += r.rating_communication || 5;
        ratingMap[r.scribe_id].sumSpeed += r.rating_speed || 5;
        ratingMap[r.scribe_id].sumBehavior += r.rating_behavior || 5;
        ratingMap[r.scribe_id].count += 1;
      });

      const finalRatings: { [key: string]: any } = {};
      Object.keys(ratingMap).forEach((scribeId) => {
        const c = ratingMap[scribeId].count;
        finalRatings[scribeId] = {
          avg: Math.round((ratingMap[scribeId].sumOverall / c) * 10) / 10,
          count: c,
          punctuality: Math.round((ratingMap[scribeId].sumPunctuality / c) * 10) / 10,
          communication: Math.round((ratingMap[scribeId].sumCommunication / c) * 10) / 10,
          speed: Math.round((ratingMap[scribeId].sumSpeed / c) * 10) / 10,
          behavior: Math.round((ratingMap[scribeId].sumBehavior / c) * 10) / 10,
          overall: Math.round((ratingMap[scribeId].sumOverall / c) * 10) / 10,
        };
      });

      setRatings(finalRatings);
      setScribes(scribeData || []);

      // 3. Query Axum Rust Recommendation Engine for location & smart match scores
      try {
        const recRes = await fetch('http://localhost:3000/api/recommendations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            location: preSelectedRequest?.subject || '',
            request_type: preSelectedRequest?.type || 'exam',
          }),
        });
        if (recRes.ok) {
          const recJson = await recRes.json();
          if (recJson?.data?.length > 0) {
            const recMap: { [key: string]: any } = {};
            recJson.data.forEach((r: any) => {
              recMap[r.id] = {
                avg: r.rating_avg,
                count: r.reviews_count,
                punctuality: r.rating_breakdown.punctuality,
                communication: r.rating_breakdown.communication,
                speed: r.rating_breakdown.speed,
                behavior: r.rating_breakdown.behavior,
                overall: r.rating_breakdown.overall,
                match_score: r.match_score,
              };
            });
            setRatings(prev => ({ ...prev, ...recMap }));
          }
        }
      } catch (err) {
        console.log('Rust recommendation engine fallback:', err);
      }
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to load scribes database.');
    } finally {
      setLoading(false);
    }
  };

  const fetchStudentRequests = async () => {
    try {
      // Fetch student's unmatched exam requests
      const { data: exams } = await supabase
        .from('exam_requests')
        .select('*')
        .eq('student_id', studentId)
        .eq('status', 'pending');

      // Fetch student's unmatched assignment requests
      const { data: assignments } = await supabase
        .from('assignment_requests')
        .select('*')
        .eq('student_id', studentId)
        .eq('status', 'pending');

      setStudentRequests(exams || []);
      setStudentAssignments(assignments || []);
    } catch (e: any) {
      console.log('Error fetching student requests:', e.message);
    }
  };

  const fetchSentInvites = async () => {
    if (!preSelectedRequest) return;
    try {
      const { data } = await supabase
        .from('scribe_applications')
        .select('scribe_id')
        .eq('request_id', preSelectedRequest.id)
        .eq('type', preSelectedRequest.type);

      if (data) {
        setSentInvites(new Set(data.map((row: any) => row.scribe_id)));
      }
    } catch (e: any) {
      console.log('Error fetching sent invites:', e.message);
    }
  };

  const handleOpenInvite = (scribe: any) => {
    setInvitingScribe(scribe);
    if (preSelectedRequest) {
      Alert.alert(
        'Confirm Invitation',
        `Would you like to invite ${scribe.full_name} to help with "${preSelectedRequest.subject}"?`,
        [
          { text: 'Cancel', style: 'cancel', onPress: () => setInvitingScribe(null) },
          { text: 'Send Invite', onPress: () => sendInvitation(scribe, preSelectedRequest, preSelectedRequest.type) }
        ]
      );
    } else {
      setShowInvitePicker(true);
    }
  };

  const sendInvitation = async (scribe: any, request: any, type: 'exam' | 'assignment') => {
    if (!scribe) {
      Alert.alert('Error', 'No scribe selected.');
      return;
    }
    setActionLoading(true);
    try {
      // 1. Check if application/invitation already exists
      const { data: existing } = await supabase
        .from('scribe_applications')
        .select('*')
        .eq('request_id', request.id)
        .eq('scribe_id', scribe.id)
        .eq('type', type)
        .single();

      if (existing) {
        Alert.alert('Already Sent', 'An invitation or application already exists for this scribe and request.');
        setActionLoading(false);
        return;
      }

      // 2. Create scribe_applications row with status 'invited'
      const { error: insertErr } = await supabase
        .from('scribe_applications')
        .insert({
          request_id: request.id,
          scribe_id: scribe.id,
          scribe_name: scribe.full_name,
          status: 'invited',
          type: type,
          created_at: new Date().toISOString()
        });

      if (insertErr) throw insertErr;

      // 3. Create notification for the scribe
      const { error: notifErr } = await supabase
        .from('notifications')
        .insert({
          user_id: scribe.id,
          title: type === 'exam' ? '📅 New Exam Invitation' : '📝 New Assignment Invitation',
          message: `A student has invited you to help with "${request.subject}". Go to your invitations tab to accept or reject.`,
          is_read: 0,
          created_at: new Date().toISOString()
        });

      if (notifErr) throw notifErr;

      Alert.alert('Invitation Sent', `You have successfully invited ${scribe.full_name}!`);
      // Optimistically mark as sent
      setSentInvites(prev => new Set([...prev, scribe.id]));
      setShowInvitePicker(false);
      setInvitingScribe(null);
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to send invitation');
    } finally {
      setActionLoading(false);
    }
  };

  const [expandedScribeIds, setExpandedScribeIds] = useState<Set<string>>(new Set());

  const toggleExpandScribe = (id: string) => {
    setExpandedScribeIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const getFilteredScribes = () => {
    if (!searchQuery.trim()) return scribes;
    return scribes.filter((s) => {
      const q = searchQuery.toLowerCase();
      const nameMatch = (s.full_name || '').toLowerCase().includes(q);
      const levelMatch = (s.education_level || '').toLowerCase().includes(q);
      const locationMatch = (s.location || '').toLowerCase().includes(q);
      const langMatch = (s.languages || '').toLowerCase().includes(q);
      return nameMatch || levelMatch || locationMatch || langMatch;
    });
  };

  const filtered = getFilteredScribes();

  return (
    <Modal animationType="slide" transparent={false} visible={visible} onRequestClose={onClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: '#f9fafb' }}>
        
        {/* Header */}
        <View style={{ backgroundColor: '#ffffff', borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.07)', paddingHorizontal: 24, paddingVertical: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <TouchableOpacity onPress={onClose} style={{ marginRight: 16, padding: 4, marginLeft: -4 }}>
              <Feather name="x" size={24} color="#334155" />
            </TouchableOpacity>
            <Text style={{ fontFamily: 'Roboto', fontSize: 20, fontWeight: '900', color: '#1e293b' }}>Find Scribes & Writers</Text>
          </View>
        </View>

        {/* Enhanced Search Bar */}
        <View style={{ paddingHorizontal: 24, paddingVertical: 12 }}>
          <View style={{
            flexDirection: 'row',
            alignItems: 'center',
            backgroundColor: '#ffffff',
            borderRadius: 16,
            borderWidth: 1.5,
            borderColor: '#cbd5e1',
            paddingHorizontal: 14,
            paddingVertical: Platform.OS === 'ios' ? 10 : 6,
            shadowColor: '#475569',
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.08,
            shadowRadius: 10,
            elevation: 2,
          }}>
            <Feather name="search" size={18} color="#2563eb" style={{ marginRight: 10 }} />
            <TextInput
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder="Search by name, location, qualifications..."
              placeholderTextColor="#94a3b8"
              style={{ flex: 1, fontFamily: 'Roboto', fontSize: 13.5, fontWeight: '600', color: '#0f172a' }}
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity onPress={() => setSearchQuery('')} style={{ padding: 4 }}>
                <Feather name="x" size={16} color="#94a3b8" />
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Directory List */}
        {loading ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <ActivityIndicator size="large" color="#2563eb" />
          </View>
        ) : filtered.length === 0 ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 }}>
            <Feather name="users" size={48} color="#cbd5e1" />
            <Text style={{ fontFamily: 'Roboto', fontSize: 15, fontWeight: '900', color: '#64748b', marginTop: 12 }}>No matched scribes found</Text>
          </View>
        ) : (
          <FlatList
            data={filtered}
            keyExtractor={(item) => item.id}
            contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 24 }}
            renderItem={({ item }) => {
              const ratingInfo = ratings[item.id] || { avg: 5.0, count: 0 };
              const isExpanded = expandedScribeIds.has(item.id);
              const cleanLanguages = (() => {
                try {
                  const parsed = JSON.parse(item.languages);
                  return Array.isArray(parsed) ? parsed.join(', ') : 'English';
                } catch (e) {
                  return item.languages || 'English';
                }
              })();

              return (
                <View style={{
                  backgroundColor: '#ffffff',
                  borderRadius: 24,
                  borderWidth: 1.5,
                  borderColor: '#cbd5e1',
                  shadowColor: '#475569',
                  shadowOffset: { width: 0, height: 6 },
                  shadowOpacity: 0.1,
                  shadowRadius: 14,
                  elevation: 4,
                  marginBottom: 16,
                  padding: 18,
                }}>
                  {/* Top Header Row: Scribe Avatar + Name + Details Pill */}
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 }}>
                      <View style={{
                        width: 48, height: 48, borderRadius: 24,
                        backgroundColor: 'rgba(37,99,235,0.09)',
                        alignItems: 'center', justifyContent: 'center',
                        borderWidth: 1.5, borderColor: 'rgba(37,99,235,0.2)',
                      }}>
                        <Text style={{ color: '#2563eb', fontWeight: '900', fontSize: 18 }}>
                          {(item.full_name || 'S').charAt(0).toUpperCase()}
                        </Text>
                      </View>

                      <View style={{ flex: 1 }}>
                        <Text style={{ fontFamily: 'Roboto', fontSize: 16, fontWeight: '900', color: '#0f172a' }}>
                          {item.full_name}
                        </Text>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2, flexWrap: 'wrap' }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                            <Ionicons name="star" size={13} color="#eab308" />
                            <Text style={{ fontFamily: 'Roboto', fontSize: 12, fontWeight: '800', color: '#1e293b' }}>
                              {ratingInfo.avg}
                            </Text>
                            <Text style={{ fontFamily: 'Roboto', fontSize: 11, color: '#94a3b8' }}>
                              ({ratingInfo.count})
                            </Text>
                          </View>

                          {/* Smart Match Score Badge from Axum Engine */}
                          {ratingInfo.match_score ? (
                            <View style={{
                              backgroundColor: 'rgba(5,150,105,0.1)',
                              borderWidth: 1,
                              borderColor: 'rgba(5,150,105,0.25)',
                              borderRadius: 8,
                              paddingHorizontal: 6,
                              paddingVertical: 2,
                            }}>
                              <Text style={{ fontFamily: 'Roboto', fontSize: 10, fontWeight: '900', color: '#059669' }}>
                                ⚡ {ratingInfo.match_score}% Match
                              </Text>
                            </View>
                          ) : null}
                        </View>
                      </View>
                    </View>

                    {/* Details Pill Toggle Button — Vibrant Blue */}
                    <TouchableOpacity
                      onPress={() => toggleExpandScribe(item.id)}
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        backgroundColor: isExpanded ? '#1d4ed8' : '#2563eb',
                        borderWidth: 1.5,
                        borderColor: '#2563eb',
                        paddingHorizontal: 12,
                        paddingVertical: 6,
                        borderRadius: 14,
                        gap: 5,
                        shadowColor: '#2563eb',
                        shadowOffset: { width: 0, height: 3 },
                        shadowOpacity: 0.25,
                        shadowRadius: 6,
                        elevation: 3
                      }}
                    >
                      <Text style={{ fontFamily: 'Roboto', fontSize: 11.5, fontWeight: '900', color: '#ffffff' }}>
                        {isExpanded ? 'Collapse' : 'Details'}
                      </Text>
                      <Feather name={isExpanded ? "chevron-up" : "chevron-down"} size={14} color="#ffffff" />
                    </TouchableOpacity>
                  </View>

                  {/* Summary Details Row */}
                  <View style={{ gap: 6, borderTopWidth: 1, borderTopColor: '#f1f5f9', paddingTop: 10, marginBottom: 14 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                      <Feather name="book" size={13} color="#64748b" style={{ marginRight: 6 }} />
                      <Text style={{ fontFamily: 'Roboto', fontSize: 12, color: '#475569' }}>
                        Education: <Text style={{ fontWeight: '700', color: '#0f172a' }}>{item.education_level || 'Undergraduate'}</Text>
                      </Text>
                    </View>

                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                      <Feather name="globe" size={13} color="#64748b" style={{ marginRight: 6 }} />
                      <Text style={{ fontFamily: 'Roboto', fontSize: 12, color: '#475569' }}>
                        Languages: <Text style={{ fontWeight: '700', color: '#0f172a' }}>{cleanLanguages}</Text>
                      </Text>
                    </View>

                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                      <Feather name="map-pin" size={13} color="#64748b" style={{ marginRight: 6 }} />
                      <Text style={{ fontFamily: 'Roboto', fontSize: 12, color: '#475569' }}>
                        Location: <Text style={{ fontWeight: '700', color: '#0f172a' }}>{item.location || 'Not Specified'}</Text>
                      </Text>
                    </View>

                    {/* Expanded Profile Info & 5 Rating Distinctions Accord */}
                    {isExpanded && (
                      <View style={{ marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#e2e8f0', gap: 10 }}>
                        <View style={{ gap: 6 }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                            <Feather name="briefcase" size={13} color="#64748b" style={{ marginRight: 6 }} />
                            <Text style={{ fontFamily: 'Roboto', fontSize: 12, color: '#475569' }}>
                              Occupation: <Text style={{ fontWeight: '700', color: '#0f172a' }}>{item.occupation || 'Volunteer Scribe'}</Text>
                            </Text>
                          </View>

                          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                            <Feather name="check-circle" size={13} color="#059669" style={{ marginRight: 6 }} />
                            <Text style={{ fontFamily: 'Roboto', fontSize: 12, color: '#059669', fontWeight: '800' }}>
                              Verified Volunteer Scribe
                            </Text>
                          </View>
                        </View>

                        {/* ── 5 Rating Distinctions Breakdown Card ── */}
                        <View style={{
                          backgroundColor: '#f8fafc',
                          borderRadius: 16,
                          padding: 12,
                          borderWidth: 1.5,
                          borderColor: '#cbd5e1',
                          marginTop: 4
                        }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, paddingBottom: 6, borderBottomWidth: 1, borderBottomColor: '#e2e8f0' }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                              <Ionicons name="star" size={14} color="#eab308" />
                              <Text style={{ fontFamily: 'Roboto', fontSize: 12.5, fontWeight: '900', color: '#0f172a' }}>
                                Rating Breakdown
                              </Text>
                            </View>
                            <Text style={{ fontFamily: 'Roboto', fontSize: 11, fontWeight: '800', color: '#2563eb' }}>
                              {ratingInfo.avg || 5.0} / 5.0 ({ratingInfo.count || 0} {ratingInfo.count === 1 ? 'review' : 'reviews'})
                            </Text>
                          </View>

                          {/* 5 Rating Distinctions List */}
                          {[
                            { label: 'Punctuality', score: ratingInfo.punctuality || 5.0, icon: 'clock' },
                            { label: 'Communication', score: ratingInfo.communication || 5.0, icon: 'message-square' },
                            { label: 'Speed & Efficiency', score: ratingInfo.speed || 5.0, icon: 'zap' },
                            { label: 'Behavior & Conduct', score: ratingInfo.behavior || 5.0, icon: 'smile' },
                            { label: 'Overall Experience', score: ratingInfo.overall || ratingInfo.avg || 5.0, icon: 'award' },
                          ].map((distinction, idx) => (
                            <View key={idx} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 4 }}>
                              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                <Feather name={distinction.icon as any} size={12} color="#64748b" />
                                <Text style={{ fontFamily: 'Roboto', fontSize: 11.5, fontWeight: '700', color: '#475569' }}>
                                  {distinction.label}
                                </Text>
                              </View>
                              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                                <Text style={{ fontFamily: 'Roboto', fontSize: 11.5, fontWeight: '900', color: '#0f172a' }}>
                                  {distinction.score.toFixed(1)}
                                </Text>
                                <Ionicons name="star" size={11} color="#eab308" />
                              </View>
                            </View>
                          ))}
                        </View>
                      </View>
                    )}
                  </View>

                  {/* Invitation Button */}
                  {sentInvites.has(item.id) ? (
                    <View
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 8,
                        paddingVertical: 11,
                        borderRadius: 14,
                        borderWidth: 1.5,
                        borderColor: '#6ee7b7',
                        backgroundColor: 'rgba(5,150,105,0.08)',
                      }}
                    >
                      <Feather name="check-circle" size={15} color="#059669" />
                      <Text style={{ fontFamily: 'Roboto', color: '#059669', fontSize: 13, fontWeight: '800' }}>
                        Request Sent
                      </Text>
                    </View>
                  ) : (
                    <TouchableOpacity
                      onPress={() => handleOpenInvite(item)}
                      style={{
                        backgroundColor: '#2563eb',
                        paddingVertical: 11,
                        borderRadius: 14,
                        alignItems: 'center',
                        justifyContent: 'center',
                        shadowColor: '#2563eb', shadowOffset: { width: 0, height: 4 },
                        shadowOpacity: 0.25, shadowRadius: 8, elevation: 3,
                      }}
                      activeOpacity={0.85}
                    >
                      <Text style={{ fontFamily: 'Roboto', color: '#fff', fontSize: 12.5, fontWeight: '800' }}>
                        Invite Scribe / Writer
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>
              );
            }}
          />
        )}

        {/* Invitation Picker Sub-Modal */}
        <Modal animationType="fade" transparent={true} visible={showInvitePicker} onRequestClose={() => setShowInvitePicker(false)}>
          <View style={{ flex: 1, backgroundColor: 'rgba(15,23,42,0.6)', justifyContent: 'center', alignItems: 'center', padding: 24 }}>
            <View style={{ backgroundColor: '#ffffff', width: '100%', maxWidth: 380, borderRadius: 28, padding: 22, borderWidth: 1, borderColor: '#f1f5f9', shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 15, elevation: 5 }}>
              
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <Text style={{ fontFamily: 'Roboto', fontSize: 16, fontWeight: '900', color: '#0f172a' }}>
                  Invite {invitingScribe?.full_name}
                </Text>
                <TouchableOpacity onPress={() => setShowInvitePicker(false)} style={{ padding: 4 }}>
                  <Feather name="x" size={18} color="#64748b" />
                </TouchableOpacity>
              </View>

              {/* Segment to Toggle Invitation Type */}
              <View style={{ flexDirection: 'row', backgroundColor: '#f1f5f9', padding: 3, borderRadius: 12, marginBottom: 16 }}>
                <TouchableOpacity
                  onPress={() => setInvitationType('exam')}
                  style={{ flex: 1, paddingVertical: 8, borderRadius: 9, alignItems: 'center', backgroundColor: invitationType === 'exam' ? '#fff' : 'transparent', shadowColor: invitationType === 'exam' ? '#000' : undefined, shadowOpacity: invitationType === 'exam' ? 0.05 : 0, elevation: invitationType === 'exam' ? 2 : 0 }}
                >
                  <Text style={{ fontFamily: 'Roboto', fontSize: 12, fontWeight: '800', color: invitationType === 'exam' ? '#2563eb' : '#64748b' }}>Exams</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => setInvitationType('assignment')}
                  style={{ flex: 1, paddingVertical: 8, borderRadius: 9, alignItems: 'center', backgroundColor: invitationType === 'assignment' ? '#fff' : 'transparent', shadowColor: invitationType === 'assignment' ? '#000' : undefined, shadowOpacity: invitationType === 'assignment' ? 0.05 : 0, elevation: invitationType === 'assignment' ? 2 : 0 }}
                >
                  <Text style={{ fontFamily: 'Roboto', fontSize: 12, fontWeight: '800', color: invitationType === 'assignment' ? '#2563eb' : '#64748b' }}>Assignments</Text>
                </TouchableOpacity>
              </View>

              {/* Requests List */}
              <Text style={{ fontFamily: 'Roboto', fontSize: 10, fontWeight: 'bold', color: '#64748b', textTransform: 'uppercase', marginBottom: 8 }}>
                Select {invitationType === 'exam' ? 'Exam' : 'Assignment'} Request:
              </Text>

              {actionLoading ? (
                <View style={{ paddingVertical: 20 }}>
                  <ActivityIndicator size="small" color="#2563eb" />
                </View>
              ) : (
                <ScrollView style={{ maxHeight: 180, marginBottom: 12 }}>
                  {invitationType === 'exam' ? (
                    studentRequests.length === 0 ? (
                      <Text style={{ fontSize: 12, color: '#94a3b8', fontStyle: 'italic', textAlign: 'center', paddingVertical: 10 }}>No pending exams found.</Text>
                    ) : (
                      studentRequests.map((req) => (
                        <TouchableOpacity
                          key={req.id}
                          onPress={() => sendInvitation(invitingScribe, req, 'exam')}
                          style={{ padding: 10, borderRadius: 10, borderWidth: 1, borderColor: '#e2e8f0', marginBottom: 8, backgroundColor: '#f8fafc' }}
                        >
                          <Text style={{ fontSize: 13, fontWeight: '700', color: '#0f172a' }}>{req.subject}</Text>
                          <Text style={{ fontSize: 11, color: '#64748b', marginTop: 1 }}>{req.exam_date}</Text>
                        </TouchableOpacity>
                      ))
                    )
                  ) : (
                    studentAssignments.length === 0 ? (
                      <Text style={{ fontSize: 12, color: '#94a3b8', fontStyle: 'italic', textAlign: 'center', paddingVertical: 10 }}>No pending assignments found.</Text>
                    ) : (
                      studentAssignments.map((assign) => (
                        <TouchableOpacity
                          key={assign.id}
                          onPress={() => sendInvitation(invitingScribe, assign, 'assignment')}
                          style={{ padding: 10, borderRadius: 10, borderWidth: 1, borderColor: '#e2e8f0', marginBottom: 8, backgroundColor: '#f8fafc' }}
                        >
                          <Text style={{ fontSize: 13, fontWeight: '700', color: '#0f172a' }}>{assign.subject}</Text>
                          <Text style={{ fontSize: 11, color: '#64748b', marginTop: 1 }}>Deadline: {assign.deadline}</Text>
                        </TouchableOpacity>
                      ))
                    )
                  )}
                </ScrollView>
              )}

              <TouchableOpacity
                onPress={() => setShowInvitePicker(false)}
                style={{ width: '100%', backgroundColor: '#f1f5f9', paddingVertical: 10, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginTop: 8 }}
              >
                <Text style={{ fontFamily: 'Roboto', fontSize: 12, fontWeight: '800', color: '#475569' }}>Cancel</Text>
              </TouchableOpacity>

            </View>
          </View>
        </Modal>

      </SafeAreaView>
    </Modal>
  );
}
