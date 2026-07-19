import React, { useState, useEffect } from 'react';
import { View, Text, Modal, TouchableOpacity, ScrollView, TextInput, ActivityIndicator, Alert, FlatList, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather, Ionicons } from '@expo/vector-icons';
import { supabase } from '@/app/core/supabase';

interface ScribesDirectoryModalProps {
  visible: boolean;
  onClose: () => void;
  studentId: string;
  preSelectedRequest?: { id: number; type: 'exam' | 'assignment'; subject: string };
}

export default function ScribesDirectoryModal({ visible, onClose, studentId, preSelectedRequest }: ScribesDirectoryModalProps) {
  const [loading, setLoading] = useState(false);
  const [scribes, setScribes] = useState<any[]>([]);
  const [ratings, setRatings] = useState<{ [key: string]: { avg: number; count: number } }>({});
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

      // 2. Fetch all Scribe Reviews to compute average ratings
      const { data: reviewData, error: reviewErr } = await supabase
        .from('scribe_reviews')
        .select('scribe_id, rating_overall');

      if (reviewErr) throw reviewErr;

      // Calculate averages
      const ratingMap: { [key: string]: { sum: number; count: number } } = {};
      (reviewData || []).forEach((r: any) => {
        if (!ratingMap[r.scribe_id]) {
          ratingMap[r.scribe_id] = { sum: 0, count: 0 };
        }
        ratingMap[r.scribe_id].sum += r.rating_overall || 5;
        ratingMap[r.scribe_id].count += 1;
      });

      const finalRatings: { [key: string]: { avg: number; count: number } } = {};
      Object.keys(ratingMap).forEach((scribeId) => {
        finalRatings[scribeId] = {
          avg: Math.round((ratingMap[scribeId].sum / ratingMap[scribeId].count) * 10) / 10,
          count: ratingMap[scribeId].count
        };
      });

      setRatings(finalRatings);
      setScribes(scribeData || []);
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

  const getFilteredScribes = () => {
    if (!searchQuery.trim()) return scribes;
    return scribes.filter((s) => {
      const q = searchQuery.toLowerCase();
      const nameMatch = (s.full_name || '').toLowerCase().includes(q);
      const levelMatch = (s.education_level || '').toLowerCase().includes(q);
      const locationMatch = (s.location || '').toLowerCase().includes(q);
      return nameMatch || levelMatch || locationMatch;
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

        {/* Search Bar */}
        <View style={{ paddingHorizontal: 24, paddingVertical: 12 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 16, borderWidth: 1, borderColor: '#e2e8f0', paddingHorizontal: 12, paddingVertical: Platform.OS === 'ios' ? 10 : 2 }}>
            <Feather name="search" size={18} color="#94a3b8" style={{ marginRight: 8 }} />
            <TextInput
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder="Search by name, location, qualifications..."
              placeholderTextColor="#94a3b8"
              style={{ flex: 1, fontSize: 13, color: '#1e293b' }}
            />
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
                  borderColor: '#f1f5f9',
                  shadowColor: '#64748b',
                  shadowOffset: { width: 0, height: 6 },
                  shadowOpacity: 0.06,
                  shadowRadius: 16,
                  elevation: 3,
                  marginBottom: 16,
                  padding: 18,
                }}>
                  {/* Scribe Identity Row */}
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                    <View style={{
                      width: 44, height: 44, borderRadius: 22,
                      backgroundColor: 'rgba(37,99,235,0.08)',
                      alignItems: 'center', justifyContent: 'center',
                      borderWidth: 1.5, borderColor: 'rgba(37,99,235,0.18)',
                    }}>
                      <Text style={{ color: '#2563eb', fontWeight: '900', fontSize: 16 }}>
                        {(item.full_name || 'S').charAt(0).toUpperCase()}
                      </Text>
                    </View>

                    <View style={{ flex: 1 }}>
                      <Text style={{ fontFamily: 'Roboto', fontSize: 16, fontWeight: '900', color: '#0f172a' }}>
                        {item.full_name}
                      </Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 1 }}>
                        <Ionicons name="star" size={13} color="#eab308" />
                        <Text style={{ fontFamily: 'Roboto', fontSize: 12, fontWeight: '800', color: '#1e293b' }}>
                          {ratingInfo.avg}
                        </Text>
                        <Text style={{ fontFamily: 'Roboto', fontSize: 11, color: '#94a3b8' }}>
                          ({ratingInfo.count} reviews)
                        </Text>
                      </View>
                    </View>
                  </View>

                  {/* Scribe details */}
                  <View style={{ gap: 5, borderTopWidth: 1, borderTopColor: '#f1f5f9', paddingTop: 10, marginBottom: 14 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                      <Feather name="book" size={12} color="#64748b" style={{ marginRight: 6 }} />
                      <Text style={{ fontFamily: 'Roboto', fontSize: 12, color: '#475569' }}>
                        Education: <Text style={{ fontWeight: '700', color: '#0f172a' }}>{item.education_level || 'Undergraduate'}</Text>
                      </Text>
                    </View>

                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                      <Feather name="globe" size={12} color="#64748b" style={{ marginRight: 6 }} />
                      <Text style={{ fontFamily: 'Roboto', fontSize: 12, color: '#475569' }}>
                        Languages: <Text style={{ fontWeight: '700', color: '#0f172a' }}>{cleanLanguages}</Text>
                      </Text>
                    </View>

                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                      <Feather name="map-pin" size={12} color="#64748b" style={{ marginRight: 6 }} />
                      <Text style={{ fontFamily: 'Roboto', fontSize: 12, color: '#475569' }}>
                        Location: <Text style={{ fontWeight: '700', color: '#0f172a' }}>{item.location || 'Not Specified'}</Text>
                      </Text>
                    </View>
                  </View>

                  {/* Invitation Button */}
                  {sentInvites.has(item.id) ? (
                    <View
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 8,
                        paddingVertical: 10,
                        borderRadius: 12,
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
                        paddingVertical: 10,
                        borderRadius: 12,
                        alignItems: 'center',
                        justifyContent: 'center',
                        shadowColor: '#2563eb', shadowOffset: { width: 0, height: 4 },
                        shadowOpacity: 0.15, shadowRadius: 8, elevation: 3,
                      }}
                      activeOpacity={0.85}
                    >
                      <Text style={{ fontFamily: 'Roboto', color: '#fff', fontSize: 12, fontWeight: '800' }}>
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
