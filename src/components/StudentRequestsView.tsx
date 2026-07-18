import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, FlatList, ActivityIndicator, RefreshControl, TouchableOpacity, Alert, Modal, ScrollView, Linking, TextInput } from 'react-native';
import { Feather, Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { supabase } from '../app/core/supabase';
import { useLanguage } from '../app/core/translation';

interface ExamRequest {
  id: number;
  student_name: string;
  dob: string;
  education_grade: string;
  phone: string;
  emergency_phone: string | null;
  exam_type: string;
  exam_language: string;
  id_proof: string;
  status: string;
  created_at: string;
  subject?: string;
  exam_date?: string;
  exam_venue?: string;
  applicationCount?: number;
  scribe_id?: string;
  scribeProfile?: {
    full_name: string;
    phone: string;
    education_level: string;
    occupation: string;
  };
}

export default function StudentRequestsView() {
  const { t } = useLanguage();
  const [requests, setRequests] = useState<ExamRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [studentProfile, setStudentProfile] = useState<any>(null);

  // Declaration Modal State
  const [selectedExam, setSelectedExam] = useState<any>(null);
  const [isDeclarationOpen, setIsDeclarationOpen] = useState(false);

  // Rating Modal State
  const [ratingExam, setRatingExam] = useState<any>(null);
  const [isRatingOpen, setIsRatingOpen] = useState(false);
  const [ratingPunctuality, setRatingPunctuality] = useState(5);
  const [ratingCommunication, setRatingCommunication] = useState(5);
  const [ratingSpeed, setRatingSpeed] = useState(5);
  const [ratingBehavior, setRatingBehavior] = useState(5);
  const [ratingOverall, setRatingOverall] = useState(5);
  const [remark, setRemark] = useState('');
  const [submittingRating, setSubmittingRating] = useState(false);

  // Call Modal State
  const [callExam, setCallExam] = useState<any>(null);
  const [isCallOpen, setIsCallOpen] = useState(false);
  const [showMaskedNumber, setShowMaskedNumber] = useState(false);

  const fetchRequests = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setLoading(false);
        return;
      }

      // Fetch Student Profile
      const { data: profile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', session.user.id)
        .single();
      setStudentProfile(profile);

      // Fetch all requests
      const { data, error } = await supabase
        .from('exam_requests')
        .select('*')
        .eq('student_id', session.user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Enrich requests with applications counts and scribe profiles
      const enriched = await Promise.all(
        (data || []).map(async (exam: any) => {
          const { data: apps } = await supabase
            .from('scribe_applications')
            .select('id')
            .eq('request_id', exam.id)
            .eq('status', 'pending');
          
          let scribeProfile = null;
          if (exam.status === 'matched' && exam.scribe_id) {
            const { data: scribe } = await supabase
              .from('profiles')
              .select('*')
              .eq('id', exam.scribe_id)
              .single();
            scribeProfile = scribe;
          }
          
          return {
            ...exam,
            applicationCount: apps ? apps.length : 0,
            scribeProfile: scribeProfile || undefined
          };
        })
      );

      setRequests(enriched);
    } catch (error: any) {
      console.error('Error fetching requests:', error.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      fetchRequests();
    }, [])
  );

  const onRefresh = () => {
    setRefreshing(true);
    fetchRequests();
  };

  const getStatusStyle = (status: string) => {
    switch (status.toLowerCase()) {
      case 'pending':
        return { bg: 'rgba(234,179,8,0.08)', border: 'rgba(234,179,8,0.2)', text: '#d97706', label: t('status_pending') };
      case 'matched':
        return { bg: 'rgba(5,150,105,0.08)', border: 'rgba(5,150,105,0.2)', text: '#059669', label: t('status_matched') };
      case 'completed':
        return { bg: 'rgba(16,185,129,0.08)', border: 'rgba(16,185,129,0.2)', text: '#10b981', label: 'Completed' };
      case 'cancelled':
        return { bg: '#f1f5f9', border: '#e2e8f0', text: '#64748b', label: t('status_cancelled') };
      default:
        return { bg: 'rgba(37,99,235,0.08)', border: 'rgba(37,99,235,0.2)', text: '#2563eb', label: status };
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  };

  const openRatingModal = (exam: any) => {
    setRatingExam(exam);
    setRatingPunctuality(5);
    setRatingCommunication(5);
    setRatingSpeed(5);
    setRatingBehavior(5);
    setRatingOverall(5);
    setRemark('');
    setIsRatingOpen(true);
  };

  const submitRating = async () => {
    if (!ratingExam) return;
    setSubmittingRating(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("No active session.");

      // 1. Insert review into scribe_reviews
      const { error: reviewError } = await supabase.from('scribe_reviews').insert({
        request_id: ratingExam.id,
        student_id: session.user.id,
        scribe_id: ratingExam.scribe_id,
        rating_punctuality: ratingPunctuality,
        rating_communication: ratingCommunication,
        rating_speed: ratingSpeed,
        rating_behavior: ratingBehavior,
        rating_overall: ratingOverall,
        remark: remark.trim(),
      });
      if (reviewError) throw reviewError;

      // 2. Update status to completed in exam_requests
      const { error: requestUpdateError } = await supabase
        .from('exam_requests')
        .update({ status: 'completed' })
        .eq('id', ratingExam.id);
      if (requestUpdateError) throw requestUpdateError;

      Alert.alert("Success", "Exam request marked as completed and review submitted successfully!");
      setIsRatingOpen(false);
      fetchRequests();
    } catch (err: any) {
      Alert.alert("Error", err.message || "Failed to submit rating.");
    } finally {
      setSubmittingRating(false);
    }
  };

  const openCallSheet = (exam: any) => {
    setCallExam(exam);
    setShowMaskedNumber(false);
    setIsCallOpen(true);
  };

  const closeCallSheet = () => setIsCallOpen(false);

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', paddingVertical: 10, backgroundColor: '#f8fafc' }}>
        <ActivityIndicator size="large" color="#2563eb" />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#f8fafc' }}>
      {/* Header row: request count + always-visible New Request action */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 24, paddingTop: 20, paddingBottom: 8 }}>
        <Text style={{ fontFamily: 'Roboto', fontSize: 12, fontWeight: '800', color: '#64748b' }}>
          {requests.length} {requests.length === 1 ? 'Request' : 'Requests'}
        </Text>
        <TouchableOpacity
          onPress={() => router.push('/console/student/request_form' as any)}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#2563eb', paddingVertical: 8, paddingHorizontal: 14, borderRadius: 12, shadowColor: '#2563eb', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 6, elevation: 3 }}
        >
          <Feather name="plus" size={14} color="#fff" />
          <Text style={{ fontFamily: 'Roboto', fontSize: 12, fontWeight: '800', color: '#fff' }}>New Request</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        style={{ flex: 1 }}
        data={requests}
        keyExtractor={(item) => item.id.toString()}
        contentContainerStyle={{ padding: 24, paddingTop: 8, paddingBottom: 40 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#2563eb']} />
        }
        ListEmptyComponent={
          <View style={{ backgroundColor: '#fff', padding: 32, borderRadius: 24, borderWidth: 1, borderColor: 'rgba(0,0,0,0.05)', alignItems: 'center', justifyContent: 'center', marginTop: 8 }}>
            <Feather name="inbox" size={48} color="#94a3b8" />
            <Text style={{ fontFamily: 'Roboto', fontSize: 16, fontWeight: '900', color: '#0f172a', marginTop: 12 }}>{t('no_requests_found')}</Text>
            <Text style={{ fontFamily: 'Roboto', fontSize: 12, color: '#64748b', marginTop: 4, textAlign: 'center' }}>
              {t('no_requests_desc')}
            </Text>
            <TouchableOpacity
              onPress={() => router.push('/console/student/request_form' as any)}
              style={{ marginTop: 16, backgroundColor: '#2563eb', paddingVertical: 10, paddingHorizontal: 20, borderRadius: 12 }}
            >
              <Text style={{ fontFamily: 'Roboto', color: '#fff', fontWeight: '800', fontSize: 12 }}>Create Request</Text>
            </TouchableOpacity>
          </View>
        }
        renderItem={({ item }) => {
          const statusStyle = getStatusStyle(item.status);
          const hasApps = item.status === 'pending' && (item.applicationCount || 0) > 0;
          const isMatched = item.status === 'matched';

          // Status label
          const statusLabel = (() => {
            switch (item.status.toLowerCase()) {
              case 'pending': return 'NOT ASSIGNED';
              case 'matched': return 'ASSIGNED';
              case 'completed': return 'COMPLETED';
              case 'cancelled': return 'CANCELLED';
              default: return item.status.toUpperCase();
            }
          })();
          const statusColor = (() => {
            switch (item.status.toLowerCase()) {
              case 'pending': return { text: '#475569', border: '#cbd5e1', bg: '#fff' };
              case 'matched': return { text: '#059669', border: '#6ee7b7', bg: '#f0fdf4' };
              case 'completed': return { text: '#10b981', border: '#a7f3d0', bg: '#ecfdf5' };
              case 'cancelled': return { text: '#ef4444', border: '#fca5a5', bg: '#fff7f7' };
              default: return { text: '#2563eb', border: '#bfdbfe', bg: '#eff6ff' };
            }
          })();

          const handleDelete = () => {
            Alert.alert(
              'Delete Exam Request',
              'Are you sure you want to delete this exam request? This action cannot be undone.',
              [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Delete', style: 'destructive',
                  onPress: async () => {
                    await supabase.from('exam_requests').delete().eq('id', item.id);
                    await supabase.from('scribe_applications').delete().eq('request_id', item.id);
                    fetchRequests();
                  }
                }
              ]
            );
          };

          return (
            <View style={{
              backgroundColor: '#fff',
              borderRadius: 22,
              borderWidth: 1,
              borderColor: 'rgba(0,0,0,0.07)',
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: 0.06,
              shadowRadius: 16,
              elevation: 3,
              marginBottom: 16,
              overflow: 'hidden',
            }}>

              {/* ── Top section: icon + exam name + status badge ── */}
              <View style={{ padding: 18, paddingBottom: 14 }}>
                {/* Status badge — top right */}
                <View style={{ alignItems: 'flex-end', marginBottom: 12 }}>
                  <View style={{
                    paddingVertical: 5, paddingHorizontal: 12,
                    borderRadius: 20,
                    borderWidth: 1.5,
                    borderColor: statusColor.border,
                    backgroundColor: statusColor.bg,
                  }}>
                    <Text style={{ fontFamily: 'Roboto', fontSize: 10, fontWeight: '800', color: statusColor.text, letterSpacing: 0.5 }}>
                      {statusLabel}
                    </Text>
                  </View>
                </View>

                {/* Icon + subject + date row */}
                <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 14 }}>
                  {/* Document icon block */}
                  <View style={{
                    width: 48, height: 48, borderRadius: 14,
                    backgroundColor: 'rgba(37,99,235,0.09)',
                    alignItems: 'center', justifyContent: 'center',
                    borderWidth: 1, borderColor: 'rgba(37,99,235,0.18)',
                  }}>
                    <Feather name="file-text" size={22} color="#2563eb" />
                  </View>

                  <View style={{ flex: 1 }}>
                    <Text style={{ fontFamily: 'Roboto', fontSize: 20, fontWeight: '900', color: '#0f172a', letterSpacing: -0.3 }}>
                      {item.subject || 'Exam'}
                    </Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 4 }}>
                      <Feather name="calendar" size={12} color="#64748b" />
                      <Text style={{ fontFamily: 'Roboto', fontSize: 12, color: '#64748b' }}>
                        {item.exam_date || t('date_not_specified')}
                      </Text>
                    </View>
                    {/* Exam type tag */}
                    <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 5, gap: 6 }}>
                      <View style={{ backgroundColor: '#f1f5f9', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 }}>
                        <Text style={{ fontFamily: 'Roboto', fontSize: 10, fontWeight: '700', color: '#475569' }}>{item.exam_type}</Text>
                      </View>
                      <View style={{ backgroundColor: '#f1f5f9', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 }}>
                        <Text style={{ fontFamily: 'Roboto', fontSize: 10, fontWeight: '700', color: '#475569' }}>{item.exam_language}</Text>
                      </View>
                    </View>
                  </View>

                  {/* Application count badge */}
                  {hasApps && (
                    <TouchableOpacity
                      onPress={() => router.push(`/console/student/view_applications?id=${item.id}` as any)}
                      style={{ position: 'absolute', top: -6, right: -6 }}
                    >
                      <View style={{
                        width: 22, height: 22, borderRadius: 11,
                        backgroundColor: '#2563eb',
                        alignItems: 'center', justifyContent: 'center',
                        borderWidth: 2, borderColor: '#fff',
                      }}>
                        <Text style={{ color: '#fff', fontSize: 10, fontWeight: '900' }}>{item.applicationCount}</Text>
                      </View>
                    </TouchableOpacity>
                  )}
                </View>
              </View>

              {/* ── Divider ── */}
              <View style={{ height: 1, backgroundColor: '#f1f5f9', marginHorizontal: 18 }} />

              {/* ── Exam Center block ── */}
              <View style={{ paddingHorizontal: 18, paddingVertical: 14 }}>
                <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
                  <Feather name="map-pin" size={18} color="#ef4444" style={{ marginTop: 1 }} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontFamily: 'Roboto', fontSize: 14, fontWeight: '900', color: '#0f172a' }}>
                      Exam Center
                    </Text>
                    <Text style={{ fontFamily: 'Roboto', fontSize: 12, color: '#64748b', marginTop: 2 }} numberOfLines={2}>
                      {item.exam_venue || t('venue_not_specified')}
                    </Text>
                  </View>
                </View>

                {/* Matched Scribe block */}
                {isMatched && item.scribeProfile && (
                  <View style={{
                    marginTop: 10, backgroundColor: 'rgba(5,150,105,0.07)',
                    borderRadius: 14, padding: 12,
                    borderWidth: 1, borderColor: 'rgba(5,150,105,0.2)',
                    flexDirection: 'row', alignItems: 'center', gap: 10,
                  }}>
                    <View style={{
                      width: 36, height: 36, borderRadius: 10,
                      backgroundColor: 'rgba(5,150,105,0.12)',
                      alignItems: 'center', justifyContent: 'center',
                    }}>
                      <Text style={{ fontFamily: 'Roboto', fontSize: 16, fontWeight: '900', color: '#059669' }}>
                        {item.scribeProfile.full_name?.charAt(0)?.toUpperCase() ?? 'S'}
                      </Text>
                    </View>
                    <View>
                      <Text style={{ fontFamily: 'Roboto', fontSize: 13, fontWeight: '900', color: '#047857' }}>
                        {item.scribeProfile.full_name}
                      </Text>
                      <Text style={{ fontFamily: 'Roboto', fontSize: 11, color: '#064e3b' }}>Volunteer Scribe · Assigned</Text>
                    </View>
                  </View>
                )}
              </View>

              {/* ── Action Buttons ── */}
              <View style={{ paddingHorizontal: 18, paddingBottom: 18, gap: 10 }}>

                {/* View Scribes — only when pending */}
                {item.status === 'pending' && (
                  <TouchableOpacity
                    onPress={() => router.push(`/console/student/view_applications?id=${item.id}` as any)}
                    style={{
                      backgroundColor: '#2563eb',
                      borderRadius: 14, paddingVertical: 14,
                      flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
                      shadowColor: '#2563eb', shadowOffset: { width: 0, height: 6 },
                      shadowOpacity: 0.25, shadowRadius: 12, elevation: 5,
                    }}
                    activeOpacity={0.85}
                  >
                    <Feather name="users" size={18} color="#fff" />
                    <Text style={{ fontFamily: 'Roboto', fontSize: 15, fontWeight: '900', color: '#fff', letterSpacing: 0.2 }}>
                      View Scribes ({item.applicationCount ?? 0})
                    </Text>
                  </TouchableOpacity>
                )}

                {/* Matched actions: Call + Chat */}
                {isMatched && (
                  <View style={{ gap: 10 }}>
                    {/* Mark Completed */}
                    <TouchableOpacity
                      onPress={() => openRatingModal(item)}
                      style={{
                        backgroundColor: '#10b981',
                        borderRadius: 14, paddingVertical: 14,
                        flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
                        shadowColor: '#10b981', shadowOffset: { width: 0, height: 6 },
                        shadowOpacity: 0.25, shadowRadius: 12, elevation: 5,
                      }}
                      activeOpacity={0.85}
                    >
                      <Feather name="check-circle" size={18} color="#fff" />
                      <Text style={{ fontFamily: 'Roboto', fontSize: 15, fontWeight: '900', color: '#fff' }}>
                        Mark Completed
                      </Text>
                    </TouchableOpacity>

                    {/* Call Scribe */}
                    <TouchableOpacity
                      onPress={() => openCallSheet(item)}
                      style={{
                        backgroundColor: '#2563eb',
                        borderRadius: 14, paddingVertical: 14,
                        flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
                        shadowColor: '#2563eb', shadowOffset: { width: 0, height: 6 },
                        shadowOpacity: 0.25, shadowRadius: 12, elevation: 5,
                      }}
                      activeOpacity={0.85}
                    >
                      <Feather name="phone-call" size={18} color="#fff" />
                      <Text style={{ fontFamily: 'Roboto', fontSize: 15, fontWeight: '900', color: '#fff' }}>
                        Call Scribe
                      </Text>
                    </TouchableOpacity>
                  </View>
                )}

                {/* Bottom row: View Details + Delete */}
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  {/* View Details */}
                  <TouchableOpacity
                    onPress={() => {
                      if (isMatched) {
                        setSelectedExam(item);
                        setIsDeclarationOpen(true);
                      } else {
                        router.push(`/console/student/request_form?id=${item.id}` as any);
                      }
                    }}
                    style={{
                      flex: 1, paddingVertical: 13,
                      borderRadius: 14, borderWidth: 1.5,
                      borderColor: '#2563eb',
                      alignItems: 'center', justifyContent: 'center',
                    }}
                    activeOpacity={0.7}
                  >
                    <Text style={{ fontFamily: 'Roboto', fontSize: 13, fontWeight: '800', color: '#2563eb' }}>
                      View Details
                    </Text>
                  </TouchableOpacity>

                  {/* Delete Exam */}
                  {item.status !== 'matched' && (
                    <TouchableOpacity
                      onPress={handleDelete}
                      style={{
                        flex: 1, paddingVertical: 13,
                        borderRadius: 14, borderWidth: 1.5,
                        borderColor: '#fca5a5',
                        backgroundColor: '#fff7f7',
                        alignItems: 'center', justifyContent: 'center',
                      }}
                      activeOpacity={0.7}
                    >
                      <Text style={{ fontFamily: 'Roboto', fontSize: 13, fontWeight: '800', color: '#ef4444' }}>
                        Delete Exam
                      </Text>
                    </TouchableOpacity>
                  )}

                  {/* Chat button (matched) */}
                  {isMatched && (
                    <TouchableOpacity
                      onPress={() => router.push(`/console/common/chat?requestId=${item.id}` as any)}
                      style={{
                        flex: 1, paddingVertical: 13,
                        borderRadius: 14, borderWidth: 1.5,
                        borderColor: '#bfdbfe',
                        backgroundColor: '#eff6ff',
                        alignItems: 'center', justifyContent: 'center',
                      }}
                      activeOpacity={0.7}
                    >
                      <Text style={{ fontFamily: 'Roboto', fontSize: 13, fontWeight: '800', color: '#2563eb' }}>Chat</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            </View>
          );
        }}
      />

      {/* FORMAL SCRIBE DECLARATION MODAL */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={isDeclarationOpen}
        onRequestClose={() => setIsDeclarationOpen(false)}
      >
        <View style={{ flex: 1, backgroundColor: 'rgba(15,23,42,0.5)', justifyContent: 'center', alignItems: 'center', paddingHorizontal: 20 }}>
          <View style={{ backgroundColor: '#fff', width: '100%', maxWidth: 360, borderRadius: 28, overflow: 'hidden', shadowColor: '#000', shadowOffset: { width: 0, height: 20 }, shadowOpacity: 0.15, shadowRadius: 30, elevation: 15, borderWidth: 1, borderColor: 'rgba(0,0,0,0.05)' }}>
            {/* Modal Header */}
            <View style={{ paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#f1f5f9', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Text style={{ fontFamily: 'Roboto', fontSize: 13, fontWeight: '800', color: '#0f172a', textTransform: 'uppercase' }}>{t('scribe_declaration')}</Text>
              <TouchableOpacity onPress={() => setIsDeclarationOpen(false)} style={{ padding: 4 }}>
                <Feather name="x" size={18} color="#64748b" />
              </TouchableOpacity>
            </View>

            {/* Declaration Content */}
            <ScrollView style={{ maxHeight: 380 }} contentContainerStyle={{ padding: 20, gap: 14 }}>
              <View style={{ alignItems: 'center', marginBottom: 6 }}>
                <Text style={{ fontFamily: 'Roboto', fontWeight: '900', fontSize: 20, color: '#2563eb' }}>Anulekh Portal</Text>
                <Text style={{ fontFamily: 'Roboto', fontSize: 9, color: '#64748b', textTransform: 'uppercase', letterSpacing: 1.5, marginTop: 2 }}>{t('official_cert_letter')}</Text>
              </View>

              {/* 1. Exam Details */}
              <View style={{ backgroundColor: '#f8fafc', padding: 12, borderRadius: 16, borderWidth: 1, borderColor: '#e2e8f0', gap: 4 }}>
                <Text style={{ fontFamily: 'Roboto', fontSize: 9, fontWeight: '800', color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 }}>{t('exam_details')}</Text>
                <Text style={{ fontFamily: 'Roboto', fontSize: 12, color: '#334155', fontWeight: '700' }}>વિષય: {selectedExam?.subject}</Text>
                <Text style={{ fontFamily: 'Roboto', fontSize: 11, color: '#475569' }}>{t('exam_level')}: {selectedExam?.exam_type}</Text>
                <Text style={{ fontFamily: 'Roboto', fontSize: 11, color: '#475569' }}>તારીખ: {selectedExam?.exam_date}</Text>
                <Text style={{ fontFamily: 'Roboto', fontSize: 11, color: '#475569' }}>સ્થળ: {selectedExam?.exam_venue}</Text>
              </View>

              {/* 2. Candidate & Scribe Details */}
              <View style={{ gap: 10 }}>
                <View>
                  <Text style={{ fontFamily: 'Roboto', fontSize: 9, fontWeight: '800', color: '#64748b', textTransform: 'uppercase', marginBottom: 2 }}>{t('candidate_student')}</Text>
                  <Text style={{ fontFamily: 'Roboto', fontSize: 12, color: '#0f172a', fontWeight: '800' }}>{studentProfile?.full_name}</Text>
                  <Text style={{ fontFamily: 'Roboto', fontSize: 10, color: '#64748b', marginTop: 1 }}>ધોરણ: {selectedExam?.education_grade}</Text>
                  <Text style={{ fontFamily: 'Roboto', fontSize: 10, color: '#64748b' }}>આધાર ID: ચકાસાયેલ</Text>
                </View>

                <View style={{ height: 1, backgroundColor: '#f1f5f9' }} />

                <View>
                  <Text style={{ fontFamily: 'Roboto', fontSize: 9, fontWeight: '800', color: '#64748b', textTransform: 'uppercase', marginBottom: 2 }}>{t('volunteer_scribe')}</Text>
                  <Text style={{ fontFamily: 'Roboto', fontSize: 12, color: '#0f172a', fontWeight: '800' }}>{selectedExam?.scribeProfile?.full_name || t('volunteer_scribe')}</Text>
                  <Text style={{ fontFamily: 'Roboto', fontSize: 10, color: '#64748b', marginTop: 1 }}>{t('occupation_label')}{selectedExam?.scribeProfile?.occupation || t('student_scribe_fallback')}</Text>
                </View>
              </View>

              {/* 3. Formal Declaration Text */}
              <View style={{ backgroundColor: 'rgba(37,99,235,0.05)', borderWidth: 1, borderColor: 'rgba(37,99,235,0.18)', padding: 12, borderRadius: 16, marginTop: 4 }}>
                <Text style={{ fontFamily: 'Roboto', fontSize: 10, color: '#1d4ed8', lineHeight: 16, fontStyle: 'italic', textAlign: 'center' }}>
                  {t('declaration_agreement_text')}
                </Text>
              </View>

              {/* 4. Verification Stamp */}
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 4 }}>
                <View>
                  <Text style={{ fontFamily: 'Roboto', fontSize: 8, fontWeight: '800', color: '#64748b', textTransform: 'uppercase' }}>{t('status')}</Text>
                  <Text style={{ fontFamily: 'Roboto', fontSize: 10, color: '#059669', fontWeight: '800', marginTop: 2 }}>{t('verified_scribe_badge')}</Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={{ fontFamily: 'Roboto', fontSize: 8, fontWeight: '800', color: '#64748b', textTransform: 'uppercase' }}>{t('official_stamp')}</Text>
                  <Text style={{ fontFamily: 'Roboto', fontSize: 9, color: '#0f172a', fontWeight: '800', marginTop: 2 }}>ANULEKH ONLINE</Text>
                </View>
              </View>
            </ScrollView>

            {/* Action Buttons */}
            <View style={{ padding: 16, backgroundColor: '#f8fafc', borderTopWidth: 1, borderTopColor: '#f1f5f9', flexDirection: 'row', gap: 8 }}>
              <TouchableOpacity 
                onPress={() => setIsDeclarationOpen(false)}
                style={{ flex: 1, backgroundColor: '#e2e8f0', paddingVertical: 11, borderRadius: 12, alignItems: 'center' }}
              >
                <Text style={{ fontFamily: 'Roboto', color: '#475569', fontWeight: '700', fontSize: 13 }}>{t('close')}</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                onPress={() => Alert.alert(t('download'), t('download_declaration'))}
                style={{ flex: 1, backgroundColor: '#2563eb', paddingVertical: 11, borderRadius: 12, alignItems: 'center', shadowColor: '#2563eb', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 8, elevation: 3 }}
              >
                <Text style={{ fontFamily: 'Roboto', color: 'white', fontWeight: '800', fontSize: 13 }}>{t('download')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ═══════════════════════════════════════════════════
          CALL BOTTOM SHEET MODAL
      ═══════════════════════════════════════════════════ */}
      <Modal
        animationType="slide"
        transparent
        visible={isCallOpen}
        onRequestClose={closeCallSheet}
      >
        {/* Backdrop */}
        <TouchableOpacity
          style={{ flex: 1, backgroundColor: 'rgba(15,23,42,0.45)' }}
          activeOpacity={1}
          onPress={closeCallSheet}
        />

        {/* Sheet */}
        <View style={{
          position: 'absolute',
          bottom: 0, left: 0, right: 0,
          backgroundColor: '#fff',
          borderTopLeftRadius: 28,
          borderTopRightRadius: 28,
          paddingBottom: 30,
          paddingHorizontal: 24,
          paddingTop: 14,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: -8 },
          shadowOpacity: 0.12,
          shadowRadius: 24,
          elevation: 20,
        }}>
          {/* Handle bar */}
          <View style={{ alignItems: 'center', marginBottom: 10 }}>
            <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: '#e2e8f0' }} />
          </View>

          {/* Header row */}
          <View style={{
            flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
            paddingVertical: 14,
            borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.06)',
            marginBottom: 16
          }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <View style={{
                width: 38, height: 38, borderRadius: 11,
                backgroundColor: 'rgba(37,99,235,0.09)', borderWidth: 1, borderColor: 'rgba(37,99,235,0.22)',
                alignItems: 'center', justifyContent: 'center',
              }}>
                <Feather name="phone" size={16} color="#2563eb" />
              </View>
              <Text style={{ fontFamily: 'Roboto', fontSize: 16, fontWeight: '900', color: '#0f172a' }}>{t('call_detail')}</Text>
            </View>
            <TouchableOpacity
              onPress={closeCallSheet}
              style={{
                width: 34, height: 34, borderRadius: 10,
                backgroundColor: 'rgba(0,0,0,0.05)',
                alignItems: 'center', justifyContent: 'center',
              }}
            >
              <Feather name="x" size={16} color="#64748b" />
            </TouchableOpacity>
          </View>

          {/* Contact card */}
          <View style={{
            backgroundColor: 'rgba(37,99,235,0.09)', borderWidth: 1, borderColor: 'rgba(37,99,235,0.22)',
            borderRadius: 20, padding: 20,
          }}>
            {/* Avatar + name */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 16 }}>
              <View style={{
                width: 54, height: 54, borderRadius: 16,
                backgroundColor: 'rgba(37,99,235,0.15)',
                borderWidth: 2, borderColor: 'rgba(37,99,235,0.22)',
                alignItems: 'center', justifyContent: 'center',
              }}>
                <Text style={{ fontFamily: 'Roboto', fontSize: 22, fontWeight: '900', color: '#2563eb' }}>
                  {callExam?.scribeProfile?.full_name?.charAt(0)?.toUpperCase() ?? 'S'}
                </Text>
              </View>
              <View>
                <Text style={{ fontFamily: 'Roboto', fontSize: 17, fontWeight: '900', color: '#0f172a' }}>
                  {callExam?.scribeProfile?.full_name ?? 'લખિયો'}
                </Text>
                <View style={{
                  marginTop: 4, backgroundColor: 'rgba(37,99,235,0.09)',
                  borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3,
                  alignSelf: 'flex-start', borderWidth: 1, borderColor: 'rgba(37,99,235,0.22)',
                }}>
                  <Text style={{ fontFamily: 'Roboto', color: '#2563eb', fontSize: 10, fontWeight: '800' }}>VOLUNTEER SCRIBE</Text>
                </View>
              </View>
            </View>

            {/* Phone number display */}
            {showMaskedNumber ? (
              <View style={{
                backgroundColor: '#fff',
                borderRadius: 14, paddingVertical: 14, paddingHorizontal: 18,
                flexDirection: 'row', alignItems: 'center', gap: 12,
                borderWidth: 1, borderColor: 'rgba(37,99,235,0.22)',
              }}>
                <Feather name="phone" size={18} color="#2563eb" />
                <Text style={{ fontFamily: 'Roboto', fontSize: 20, fontWeight: '900', color: '#0f172a', letterSpacing: 1.5 }}>
                  {callExam?.scribeProfile?.phone || '9876543210'}
                </Text>
              </View>
            ) : (
              <TouchableOpacity
                onPress={() => setShowMaskedNumber(true)}
                style={{
                  backgroundColor: '#fff',
                  borderRadius: 14, paddingVertical: 14, paddingHorizontal: 18,
                  flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
                  borderWidth: 1, borderColor: 'rgba(37,99,235,0.22)',
                  borderStyle: 'dashed'
                }}
              >
                <Feather name="eye" size={16} color="#2563eb" />
                <Text style={{ fontFamily: 'Roboto', fontSize: 14, fontWeight: '800', color: '#2563eb' }}>{t('view_number')}</Text>
              </TouchableOpacity>
            )}

            {/* Exam context */}
            <Text style={{ fontFamily: 'Roboto', fontSize: 11, color: '#64748b', marginTop: 10, textAlign: 'center' }}>
              વિષય: <Text style={{ fontWeight: '700', color: '#0f172a' }}>{callExam?.subject}</Text> પરીક્ષાના સ્વયંસેવક
            </Text>
          </View>

          {/* Dial Now CTA */}
          <TouchableOpacity
            onPress={async () => {
              const url = `tel:${callExam?.scribeProfile?.phone || '9876543210'}`;
              try {
                const supported = await Linking.canOpenURL(url);
                if (supported) {
                  await Linking.openURL(url);
                } else {
                  Alert.alert(t('error'), 'આ ઉપકરણથી કૉલ કરવો શક્ય નથી.');
                }
              } catch (_) {
                Alert.alert(t('error'), 'કૉલ શરૂ કરવામાં ભૂલ આવી.');
              }
            }}
            style={{
              backgroundColor: '#2563eb',
              borderRadius: 18, paddingVertical: 16, marginTop: 16,
              flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
              shadowColor: '#2563eb', shadowOffset: { width: 0, height: 10 },
              shadowOpacity: 0.25, shadowRadius: 20, elevation: 10,
            }}
            activeOpacity={0.85}
          >
            <Feather name="phone-call" size={20} color="#fff" />
            <Text style={{ fontFamily: 'Roboto', color: '#fff', fontSize: 16, fontWeight: '900' }}>{t('dial_now')}</Text>
          </TouchableOpacity>

          {/* Cancel */}
          <TouchableOpacity
            onPress={closeCallSheet}
            style={{ paddingVertical: 14, alignItems: 'center', marginTop: 4 }}
          >
            <Text style={{ fontFamily: 'Roboto', color: '#64748b', fontSize: 14, fontWeight: '600' }}>{t('cancel')}</Text>
          </TouchableOpacity>
        </View>
      </Modal>

      {/* ═══════════════════════════════════════════════════
          RATING / FEEDBACK MODAL
      ═══════════════════════════════════════════════════ */}
      <Modal
        animationType="slide"
        transparent
        visible={isRatingOpen}
        onRequestClose={() => setIsRatingOpen(false)}
      >
        <View style={{ flex: 1, backgroundColor: 'rgba(15,23,42,0.5)', justifyContent: 'center', alignItems: 'center', paddingHorizontal: 20 }}>
          <View style={{ backgroundColor: '#fff', width: '100%', maxWidth: 380, borderRadius: 28, padding: 24, shadowColor: '#000', shadowOffset: { width: 0, height: 20 }, shadowOpacity: 0.15, shadowRadius: 30, elevation: 15 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <Text style={{ fontFamily: 'Roboto', fontSize: 18, fontWeight: '900', color: '#0f172a' }}>Rate your Scribe</Text>
              <TouchableOpacity onPress={() => setIsRatingOpen(false)} style={{ padding: 4 }}>
                <Feather name="x" size={20} color="#64748b" />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 400 }} contentContainerStyle={{ paddingBottom: 10 }}>
              
              <Text style={{ fontFamily: 'Roboto', fontSize: 12, color: '#64748b', marginBottom: 12 }}>
                Please provide feedback for <Text style={{ fontWeight: '700', color: '#0f172a' }}>{ratingExam?.scribeProfile?.full_name || 'Volunteer Scribe'}</Text> across 5 fields.
              </Text>

              {/* 1. Punctuality */}
              <View style={{ marginVertical: 6 }}>
                <Text style={{ fontFamily: 'Roboto', fontSize: 11, fontWeight: '800', color: '#475569', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>1. Punctuality (Time Management)</Text>
                <View style={{ flexDirection: 'row', gap: 6 }}>
                  {[1, 2, 3, 4, 5].map((star) => (
                    <TouchableOpacity key={star} onPress={() => setRatingPunctuality(star)}>
                      <Ionicons name={star <= ratingPunctuality ? 'star' : 'star-outline'} size={24} color={star <= ratingPunctuality ? '#eab308' : '#cbd5e1'} />
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {/* 2. Communication */}
              <View style={{ marginVertical: 6 }}>
                <Text style={{ fontFamily: 'Roboto', fontSize: 11, fontWeight: '800', color: '#475569', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>2. Communication (Interaction)</Text>
                <View style={{ flexDirection: 'row', gap: 6 }}>
                  {[1, 2, 3, 4, 5].map((star) => (
                    <TouchableOpacity key={star} onPress={() => setRatingCommunication(star)}>
                      <Ionicons name={star <= ratingCommunication ? 'star' : 'star-outline'} size={24} color={star <= ratingCommunication ? '#eab308' : '#cbd5e1'} />
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {/* 3. Writing Speed */}
              <View style={{ marginVertical: 6 }}>
                <Text style={{ fontFamily: 'Roboto', fontSize: 11, fontWeight: '800', color: '#475569', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>3. Scribing Speed & Accuracy</Text>
                <View style={{ flexDirection: 'row', gap: 6 }}>
                  {[1, 2, 3, 4, 5].map((star) => (
                    <TouchableOpacity key={star} onPress={() => setRatingSpeed(star)}>
                      <Ionicons name={star <= ratingSpeed ? 'star' : 'star-outline'} size={24} color={star <= ratingSpeed ? '#eab308' : '#cbd5e1'} />
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {/* 4. Behavior */}
              <View style={{ marginVertical: 6 }}>
                <Text style={{ fontFamily: 'Roboto', fontSize: 11, fontWeight: '800', color: '#475569', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>4. Conduct & Behavior</Text>
                <View style={{ flexDirection: 'row', gap: 6 }}>
                  {[1, 2, 3, 4, 5].map((star) => (
                    <TouchableOpacity key={star} onPress={() => setRatingBehavior(star)}>
                      <Ionicons name={star <= ratingBehavior ? 'star' : 'star-outline'} size={24} color={star <= ratingBehavior ? '#eab308' : '#cbd5e1'} />
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {/* 5. Overall */}
              <View style={{ marginVertical: 6 }}>
                <Text style={{ fontFamily: 'Roboto', fontSize: 11, fontWeight: '800', color: '#475569', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>5. Overall Experience</Text>
                <View style={{ flexDirection: 'row', gap: 6 }}>
                  {[1, 2, 3, 4, 5].map((star) => (
                    <TouchableOpacity key={star} onPress={() => setRatingOverall(star)}>
                      <Ionicons name={star <= ratingOverall ? 'star' : 'star-outline'} size={24} color={star <= ratingOverall ? '#eab308' : '#cbd5e1'} />
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {/* Remark */}
              <View style={{ marginVertical: 8 }}>
                <Text style={{ fontFamily: 'Roboto', fontSize: 11, fontWeight: '800', color: '#475569', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>Remarks & Feedback</Text>
                <TextInput
                  value={remark}
                  onChangeText={setRemark}
                  placeholder="Write a brief review about your experience with this scribe..."
                  multiline
                  numberOfLines={4}
                  style={{
                    width: '100%',
                    backgroundColor: '#f8fafc',
                    borderWidth: 1.5,
                    borderColor: '#e2e8f0',
                    borderRadius: 14,
                    paddingHorizontal: 12,
                    paddingVertical: 10,
                    fontSize: 13,
                    color: '#0f172a',
                    minHeight: 80,
                    textAlignVertical: 'top'
                  }}
                />
              </View>
            </ScrollView>

            <View style={{ marginTop: 14 }}>
              <TouchableOpacity
                onPress={submitRating}
                disabled={submittingRating}
                style={{
                  backgroundColor: '#10b981',
                  borderRadius: 16,
                  paddingVertical: 14,
                  alignItems: 'center',
                  justifyContent: 'center',
                  shadowColor: '#10b981',
                  shadowOffset: { width: 0, height: 6 },
                  shadowOpacity: 0.2,
                  shadowRadius: 10,
                  elevation: 4
                }}
              >
                {submittingRating ? (
                  <ActivityIndicator color="white" size="small" />
                ) : (
                  <Text style={{ fontFamily: 'Roboto', fontSize: 14, fontWeight: '900', color: '#fff' }}>Submit & Mark Complete</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

    </View>
  );
}
