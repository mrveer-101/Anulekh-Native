import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, FlatList, ActivityIndicator, RefreshControl, TouchableOpacity, Alert, Modal, ScrollView, Linking, TextInput } from 'react-native';
import { Feather, Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { supabase } from '../app/core/supabase';
import { useLanguage } from '../app/core/translation';
import ScribesDirectoryModal from './ScribesDirectoryModal';

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
  is_emergency?: string;
  private_scribe_id?: string;
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
  const [assignmentRequests, setAssignmentRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [studentProfile, setStudentProfile] = useState<any>(null);

  // Tab view control
  const [activeTab, setActiveTab] = useState<'requests' | 'assignments' | 'past_scribes'>('requests');
  const [showScribeDirectory, setShowScribeDirectory] = useState(false);
  const [preSelectedScribeReq, setPreSelectedScribeReq] = useState<{ id: number; type: 'exam' | 'assignment'; subject: string } | undefined>(undefined);

  // Past scribes and private invites states
  const [pastScribes, setPastScribes] = useState<any[]>([]);
  const [scribeSearchQuery, setScribeSearchQuery] = useState('');
  const [inviteModalVisible, setInviteModalVisible] = useState(false);
  const [inviteTargetScribe, setInviteTargetScribe] = useState<any>(null);
  const [submittingInvite, setSubmittingInvite] = useState(false);

  // Scribe detailed profile modal states
  const [profileModalVisible, setProfileModalVisible] = useState(false);
  const [viewingScribe, setViewingScribe] = useState<any>(null);
  const [viewingReviews, setViewingReviews] = useState<any[]>([]);
  const [loadingReviews, setLoadingReviews] = useState(false);

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

  // Expanded Cards State
  const [expandedCards, setExpandedCards] = useState<Record<string, boolean>>({});
  const toggleCard = (id: string | number) => {
    setExpandedCards(prev => ({ ...prev, [id]: !prev[id] }));
  };

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

      if (error) throw new Error(error.message || error.details || error.hint || 'Failed to load exam requests.');

      // Fetch all assignment requests
      const { data: assignmentData, error: assignmentError } = await supabase
        .from('assignment_requests')
        .select('*')
        .eq('student_id', session.user.id)
        .order('created_at', { ascending: false });

      if (assignmentError) throw new Error(assignmentError.message || assignmentError.details || assignmentError.hint || 'Failed to load assignment requests.');

      // Enrich assignment requests with scribe profiles
      const enrichedAssignments = await Promise.all(
        (assignmentData || []).map(async (assign: any) => {
          let scribeProfile = null;
          if (assign.status === 'matched' && assign.scribe_id) {
            const { data: scribe } = await supabase
              .from('profiles')
              .select('*')
              .eq('id', assign.scribe_id)
              .single();
            scribeProfile = scribe;
          }
          return {
            ...assign,
            scribeProfile: scribeProfile || undefined
          };
        })
      );
      setAssignmentRequests(enrichedAssignments);

      // Fetch unique past scribes
      const { data: pastExams } = await supabase
        .from('exam_requests')
        .select('scribe_id')
        .eq('student_id', session.user.id)
        .neq('scribe_id', null);

      const uniqueScribeIds = Array.from(new Set((pastExams || []).map((e: any) => e.scribe_id)));
      const scribesList = await Promise.all(
        uniqueScribeIds.map(async (sid) => {
          const { data: scribeProf } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', sid)
            .single();
          return scribeProf;
        })
      );
      setPastScribes(scribesList.filter(Boolean));

      // Enrich requests with applications counts and scribe profiles
      const enriched = await Promise.all(
        (data || []).map(async (exam: any) => {
          const { data: apps } = await supabase
            .from('scribe_applications')
            .select('id')
            .eq('request_id', exam.id);
          
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
      const msg = error?.message ?? error?.details ?? error?.hint ?? (typeof error === 'string' ? error : JSON.stringify(error));
      console.error('Error fetching requests:', msg, error);
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
    if (!exam || !exam.exam_date) {
      Alert.alert("Calling Unavailable", "Calling is only permitted on the day of the exam.");
      return;
    }
    
    // Check if the exam date is today
    const dateStr = exam.exam_date.split('|')[0].trim(); // Get YYYY-MM-DD
    const todayStr = new Date().toISOString().split('T')[0];
    
    if (dateStr !== todayStr) {
      Alert.alert("Calling Unavailable", `Calling is only permitted on the day of the exam (${dateStr}).`);
      return;
    }

    setCallExam(exam);
    setShowMaskedNumber(false);
    setIsCallOpen(true);
  };

  const closeCallSheet = () => setIsCallOpen(false);

  const handleOpenScribeProfile = async (scribe: any) => {
    setViewingScribe({ scribe_name: scribe.full_name || scribe.official_name, profile: scribe });
    setProfileModalVisible(true);
    setLoadingReviews(true);
    try {
      const { data, error } = await supabase
        .from('scribe_reviews')
        .select('*')
        .eq('scribe_id', scribe.id);
      if (!error && data) {
        setViewingReviews(data);
      } else {
        setViewingReviews([]);
      }
    } catch (e) {
      console.error(e);
      setViewingReviews([]);
    } finally {
      setLoadingReviews(false);
    }
  };

  const openInviteModal = (scribe: any) => {
    setInviteTargetScribe(scribe);
    setInviteModalVisible(true);
  };

  const sendPrivateInvitation = async (examId: number) => {
    if (!inviteTargetScribe || submittingInvite) return;
    setSubmittingInvite(true);
    try {
      const { error } = await supabase
        .from('exam_requests')
        .update({ private_scribe_id: inviteTargetScribe.id })
        .eq('id', examId);
      
      if (error) throw error;
      
      Alert.alert("Success", `Invitation sent privately to ${inviteTargetScribe.full_name || inviteTargetScribe.official_name}!`);
      setInviteModalVisible(false);
      fetchRequests();
    } catch (e: any) {
      Alert.alert("Error", e.message || "Failed to send invitation.");
    } finally {
      setSubmittingInvite(false);
    }
  };

  const renderAssignmentCard = (item: any) => {
    const isMatched = item.status === 'matched';

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
        'Delete Assignment Request',
        'Are you sure you want to delete this assignment request? This action cannot be undone.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Delete', style: 'destructive',
            onPress: async () => {
              await supabase.from('assignment_requests').delete().eq('id', item.id);
              fetchRequests();
            }
          }
        ]
      );
    };

    const handleMarkCompleted = async () => {
      Alert.alert(
        'Mark as Completed',
        'Are you sure you want to mark this assignment as completed?',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Confirm',
            onPress: async () => {
              try {
                await supabase
                  .from('assignment_requests')
                  .update({ status: 'completed' })
                  .eq('id', item.id);
                fetchRequests();
              } catch (e: any) {
                Alert.alert('Error', e.message || 'Failed to update request');
              }
            }
          }
        ]
      );
    };

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
        padding: 20,
      }}>
        {/* Top Section: Status Badge & Subject info */}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
          {/* Icon + details block */}
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12, flex: 1 }}>
            {/* Book-Open Icon block */}
            <View style={{
              width: 46, height: 46, borderRadius: 14,
              backgroundColor: 'rgba(79,70,229,0.08)',
              alignItems: 'center', justifyContent: 'center',
              borderWidth: 1, borderColor: 'rgba(79,70,229,0.16)',
            }}>
              <Feather name="book-open" size={20} color="#4f46e5" />
            </View>

            <View style={{ flex: 1 }}>
              <Text style={{ fontFamily: 'Roboto', fontSize: 18, fontWeight: '900', color: '#0f172a', letterSpacing: -0.3 }}>
                {item.subject}
              </Text>
              <Text style={{ fontFamily: 'Roboto', fontSize: 13, fontWeight: '700', color: '#4f46e5', marginTop: 2 }}>
                {item.assignment_title}
              </Text>
              
              {/* Level Tag badge */}
              <View style={{ flexDirection: 'row', marginTop: 6 }}>
                <View style={{ backgroundColor: '#f1f5f9', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 }}>
                  <Text style={{ fontFamily: 'Roboto', fontSize: 9, fontWeight: '700', color: '#475569' }}>
                    Level: {item.academic_level}
                  </Text>
                </View>
              </View>
            </View>
          </View>

          {/* Status Badge */}
          <View style={{
            paddingVertical: 4, paddingHorizontal: 10,
            borderRadius: 12,
            borderWidth: 1.2,
            borderColor: statusColor.border,
            backgroundColor: statusColor.bg,
          }}>
            <Text style={{ fontFamily: 'Roboto', fontSize: 9, fontWeight: '800', color: statusColor.text, letterSpacing: 0.3 }}>
              {statusLabel}
            </Text>
          </View>
        </View>

        {/* Instructions bubble section if description exists */}
        {item.description ? (
          <View style={{
            backgroundColor: '#f8fafc',
            borderWidth: 1,
            borderColor: '#e2e8f0',
            borderRadius: 14,
            padding: 12,
            marginBottom: 14,
          }}>
            <Text style={{ fontFamily: 'Roboto', fontSize: 9, color: '#64748b', fontWeight: '800', textTransform: 'uppercase', marginBottom: 4 }}>Instructions</Text>
            <Text style={{ fontFamily: 'Roboto', color: '#475569', fontSize: 12, lineHeight: 17 }}>
              {item.description}
            </Text>
          </View>
        ) : null}

        {/* Deadline and Writer Details Row */}
        <View style={{ gap: 6, marginBottom: 16 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Feather name="clock" size={12} color="#64748b" style={{ marginRight: 8 }} />
            <Text style={{ fontFamily: 'Roboto', color: '#475569', fontSize: 12 }}>
              Deadline: <Text style={{ fontWeight: '700', color: '#0f172a' }}>{item.deadline}</Text>
            </Text>
          </View>

          {isMatched && item.scribeProfile ? (
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Feather name="user" size={12} color="#4f46e5" style={{ marginRight: 8 }} />
              <Text style={{ fontFamily: 'Roboto', color: '#475569', fontSize: 12 }}>
                Writer: <Text style={{ fontWeight: '700', color: '#0f172a' }}>{item.scribeProfile.full_name}</Text>
              </Text>
            </View>
          ) : null}
        </View>

        {/* Action Row */}
        {isMatched ? (
          <View style={{ gap: 10 }}>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <TouchableOpacity
                onPress={handleMarkCompleted}
                style={{
                  flex: 1, backgroundColor: '#10b981',
                  borderRadius: 12, paddingVertical: 11,
                  flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
                  shadowColor: '#10b981', shadowOffset: { width: 0, height: 4 },
                  shadowOpacity: 0.15, shadowRadius: 8, elevation: 3,
                }}
                activeOpacity={0.85}
              >
                <Feather name="check-circle" size={14} color="#fff" />
                <Text style={{ fontFamily: 'Roboto', fontSize: 13, fontWeight: '800', color: '#fff' }}>
                  Mark Completed
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => {
                  if (item.scribeProfile?.phone) {
                    Linking.openURL(`tel:${item.scribeProfile.phone}`);
                  } else {
                    Alert.alert('Unavailable', 'Phone number not available');
                  }
                }}
                style={{
                  flex: 1, backgroundColor: '#2563eb',
                  borderRadius: 12, paddingVertical: 11,
                  flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
                  shadowColor: '#2563eb', shadowOffset: { width: 0, height: 4 },
                  shadowOpacity: 0.15, shadowRadius: 8, elevation: 3,
                }}
                activeOpacity={0.85}
              >
                <Feather name="phone-call" size={14} color="#fff" />
                <Text style={{ fontFamily: 'Roboto', fontSize: 13, fontWeight: '800', color: '#fff' }}>
                  Call Writer
                </Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              onPress={() => router.push(`/console/common/chat?requestId=${item.id}&type=assignment` as any)}
              style={{
                width: '100%', paddingVertical: 11,
                borderRadius: 12, borderWidth: 1.5,
                borderColor: '#bfdbfe',
                backgroundColor: '#eff6ff',
                alignItems: 'center', justifyContent: 'center',
              }}
              activeOpacity={0.7}
            >
              <Text style={{ fontFamily: 'Roboto', fontSize: 13, fontWeight: '800', color: '#2563eb' }}>Chat with Writer</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={{ gap: 10 }}>
            {/* Find & Invite Writers button — full width, primary */}
            <TouchableOpacity
              onPress={() => {
                setPreSelectedScribeReq({ id: item.id, type: 'assignment', subject: item.subject });
                setShowScribeDirectory(true);
              }}
              style={{
                width: '100%', paddingVertical: 11,
                borderRadius: 12,
                backgroundColor: '#4f46e5',
                alignItems: 'center', justifyContent: 'center',
                flexDirection: 'row', gap: 6,
                shadowColor: '#4f46e5', shadowOffset: { width: 0, height: 4 },
                shadowOpacity: 0.15, shadowRadius: 8, elevation: 3,
              }}
              activeOpacity={0.85}
            >
              <Feather name="search" size={14} color="#fff" />
              <Text style={{ fontFamily: 'Roboto', fontSize: 13, fontWeight: '800', color: '#fff' }}>
                Find & Invite Writers
              </Text>
            </TouchableOpacity>

            <View style={{ flexDirection: 'row', gap: 10 }}>
              <TouchableOpacity
                onPress={() => {
                  router.push(`/console/student/assignment_form?id=${item.id}` as any);
                }}
                style={{
                  flex: 1, paddingVertical: 11,
                  borderRadius: 12, borderWidth: 1.5,
                  borderColor: '#2563eb',
                  backgroundColor: '#fff',
                  alignItems: 'center', justifyContent: 'center',
                }}
                activeOpacity={0.7}
              >
                <Text style={{ fontFamily: 'Roboto', fontSize: 13, fontWeight: '800', color: '#2563eb' }}>
                  Edit Details
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={handleDelete}
                style={{
                  flex: 1, paddingVertical: 11,
                  borderRadius: 12, borderWidth: 1.5,
                  borderColor: '#fca5a5',
                  backgroundColor: '#fff7f7',
                  alignItems: 'center', justifyContent: 'center',
                }}
                activeOpacity={0.7}
              >
                <Text style={{ fontFamily: 'Roboto', fontSize: 13, fontWeight: '800', color: '#ef4444' }}>
                  Delete
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </View>
    );
  };

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', paddingVertical: 10, backgroundColor: '#f9fafb' }}>
        <ActivityIndicator size="large" color="#2563eb" />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#f9fafb' }}>
      {/* Top Filter & Action Panel */}
      <View style={{
        backgroundColor: '#ffffff',
        marginHorizontal: 24,
        marginTop: 16,
        marginBottom: 12,
        borderRadius: 24,
        borderWidth: 1.5,
        borderColor: '#e2e8f0',
        padding: 16,
        shadowColor: '#64748b',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.05,
        shadowRadius: 12,
        elevation: 3,
      }}>
        {/* Header row: request count + always-visible New Request action */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <Text style={{ fontFamily: 'Roboto', fontSize: 13, fontWeight: '900', color: '#1e293b' }}>
            {activeTab === 'requests' 
              ? `${requests.length} ${requests.length === 1 ? 'Exam' : 'Exams'}`
              : activeTab === 'assignments'
              ? `${assignmentRequests.length} ${assignmentRequests.length === 1 ? 'Assignment' : 'Assignments'}`
              : `${pastScribes.length} Past Scribes`
            }
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <TouchableOpacity
              onPress={() => setShowScribeDirectory(true)}
              style={{
                flexDirection: 'row', alignItems: 'center', gap: 5,
                borderWidth: 1.5, borderColor: '#2563eb', paddingVertical: 7, paddingHorizontal: 12,
                borderRadius: 12, backgroundColor: '#fff'
              }}
            >
              <Feather name="search" size={13} color="#2563eb" />
              <Text style={{ fontFamily: 'Roboto', fontSize: 11, fontWeight: '800', color: '#2563eb' }}>Find Scribes</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => {
                Alert.alert(
                  'Select Request Type',
                  'What type of request would you like to create?',
                  [
                    { text: 'Cancel', style: 'cancel' },
                    { text: 'Exam Scribe', onPress: () => router.push('/console/student/request_form' as any) },
                    { text: 'Assignment Writer', onPress: () => router.push('/console/student/assignment_form' as any) }
                  ]
                );
              }}
              style={{ 
                flexDirection: 'row', alignItems: 'center', gap: 5, 
                backgroundColor: '#2563eb', paddingVertical: 8, paddingHorizontal: 12, 
                borderRadius: 12, shadowColor: '#2563eb', 
                shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.15, shadowRadius: 6, elevation: 2 
              }}
            >
              <Feather name="plus" size={13} color="#fff" />
              <Text style={{ fontFamily: 'Roboto', fontSize: 11, fontWeight: '800', color: '#fff' }}>New Request</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Tab Switcher */}
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <TouchableOpacity
            onPress={() => setActiveTab('requests')}
            style={{
              flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: 'center', justifyContent: 'center',
              backgroundColor: activeTab === 'requests' ? '#2563eb' : 'rgba(0,0,0,0.02)',
              borderWidth: 1, borderColor: activeTab === 'requests' ? '#2563eb' : 'rgba(0,0,0,0.06)'
            }}
          >
            <Text style={{ fontFamily: 'Roboto', fontSize: 11, fontWeight: '800', color: activeTab === 'requests' ? '#fff' : '#64748b' }}>Exams</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setActiveTab('assignments')}
            style={{
              flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: 'center', justifyContent: 'center',
              backgroundColor: activeTab === 'assignments' ? '#2563eb' : 'rgba(0,0,0,0.02)',
              borderWidth: 1, borderColor: activeTab === 'assignments' ? '#2563eb' : 'rgba(0,0,0,0.06)'
            }}
          >
            <Text style={{ fontFamily: 'Roboto', fontSize: 11, fontWeight: '800', color: activeTab === 'assignments' ? '#fff' : '#64748b' }}>Assignments</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setActiveTab('past_scribes')}
            style={{
              flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: 'center', justifyContent: 'center',
              backgroundColor: activeTab === 'past_scribes' ? '#2563eb' : 'rgba(0,0,0,0.02)',
              borderWidth: 1, borderColor: activeTab === 'past_scribes' ? '#2563eb' : 'rgba(0,0,0,0.06)'
            }}
          >
            <Text style={{ fontFamily: 'Roboto', fontSize: 11, fontWeight: '800', color: activeTab === 'past_scribes' ? '#fff' : '#64748b' }}>Past Scribes</Text>
          </TouchableOpacity>
        </View>
      </View>

      {activeTab === 'requests' || activeTab === 'assignments' ? (
      <FlatList
        style={{ flex: 1 }}
        data={activeTab === 'requests' ? requests : assignmentRequests}
        keyExtractor={(item) => item.id.toString()}
        contentContainerStyle={{ padding: 24, paddingTop: 8, paddingBottom: 40 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#2563eb']} />
        }
        ListEmptyComponent={
          <View style={{ backgroundColor: '#f8fafc', padding: 32, borderRadius: 24, borderWidth: 1, borderColor: '#e2e8f0', alignItems: 'center', justifyContent: 'center', marginTop: 8 }}>
            <Feather name="inbox" size={48} color="#94a3b8" />
            <Text style={{ fontFamily: 'Roboto', fontSize: 16, fontWeight: '900', color: '#0f172a', marginTop: 12 }}>
              {activeTab === 'requests' ? t('no_requests_found') : 'No assignments found'}
            </Text>
            <Text style={{ fontFamily: 'Roboto', fontSize: 12, color: '#64748b', marginTop: 4, textAlign: 'center' }}>
              {activeTab === 'requests' ? t('no_requests_desc') : 'Request a helper to write or complete assignments for you.'}
            </Text>
            <TouchableOpacity
              onPress={() => {
                if (activeTab === 'requests') {
                  router.push('/console/student/request_form' as any);
                } else {
                  router.push('/console/student/assignment_form' as any);
                }
              }}
              style={{ marginTop: 16, backgroundColor: '#2563eb', paddingVertical: 10, paddingHorizontal: 20, borderRadius: 12 }}
            >
              <Text style={{ fontFamily: 'Roboto', color: '#fff', fontWeight: '800', fontSize: 12 }}>
                {activeTab === 'requests' ? 'Create Request' : 'Create Assignment'}
              </Text>
            </TouchableOpacity>
          </View>
        }
        renderItem={({ item }) => {
          if (activeTab === 'assignments') {
            return renderAssignmentCard(item);
          }
          const statusStyle = getStatusStyle(item.status);
          const hasApps = item.status === 'pending' && (item.applicationCount || 0) > 0;
          const isMatched = item.status === 'matched';

          // Status label
          const statusLabel = (() => {
            if (item.is_emergency === 'yes') {
              return '🚨 EMERGENCY SOS';
            }
            switch (item.status.toLowerCase()) {
              case 'pending': return 'NOT ASSIGNED';
              case 'matched': return 'ASSIGNED';
              case 'completed': return 'COMPLETED';
              case 'cancelled': return 'CANCELLED';
              default: return item.status.toUpperCase();
            }
          })();
          const statusColor = (() => {
            if (item.is_emergency === 'yes') {
              return { text: '#dc2626', border: '#fca5a5', bg: '#fef2f2' };
            }
            switch (item.status.toLowerCase()) {
              case 'pending': return { text: '#475569', border: '#cbd5e1', bg: '#fff' };
              case 'matched': return { text: '#059669', border: '#6ee7b7', bg: '#f0fdf4' };
              case 'completed': return { text: '#10b981', border: '#a7f3d0', bg: '#ecfdf5' };
              case 'cancelled': return { text: '#ef4444', border: '#fca5a5', bg: '#fff7f7' };
              default: return { text: '#2563eb', border: '#bfdbfe', bg: '#eff6ff' };
            }
          })();

          const isToday = item.exam_date && item.exam_date.split('|')[0].trim() === new Date().toISOString().split('T')[0];
          
          const handleSOS = async () => {
            if (item.is_emergency === 'yes') {
              Alert.alert("SOS Already Sent", "You have already notified emergency scribes for this request.");
              return;
            }
            
            Alert.alert(
              'Trigger Emergency SOS',
              'This will notify all available emergency scribes immediately. Are you sure?',
              [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Confirm SOS', style: 'destructive',
                  onPress: async () => {
                    try {
                      // Update request
                      await supabase.from('exam_requests').update({ is_emergency: 'yes' }).eq('id', item.id);
                      
                      // Get emergency scribes
                      const { data: scribes } = await supabase.from('profiles').select('id').eq('role', 'scribe').eq('urgent_calls', 'yes');
                      
                      if (scribes && scribes.length > 0) {
                        const notifications = scribes.map((s: any) => ({
                          user_id: s.id,
                          title: '🚨 Emergency Scribe Needed!',
                          message: `[Emergency Request] A student needs an emergency scribe for "${item.subject}" TODAY at ${item.exam_venue}! Open the app to accept immediately.`,
                          is_read: 0,
                          created_at: new Date().toISOString()
                        }));
                        await supabase.from('notifications').insert(notifications);
                      }
                      
                      Alert.alert("SOS Alert Sent!", "All registered emergency scribes have been notified.");
                      fetchRequests();
                    } catch (e: any) {
                      Alert.alert("Error", e.message || "Failed to trigger SOS");
                    }
                  }
                }
              ]
            );
          };

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

          const isExpanded = expandedCards[item.id] || false;

          return (
            <View style={{
              backgroundColor: '#fff',
              borderRadius: 22,
              borderWidth: item.is_emergency === 'yes' ? 2 : 1.5,
              borderColor: item.is_emergency === 'yes' ? '#fca5a5' : '#e2e8f0',
              shadowColor: item.is_emergency === 'yes' ? '#dc2626' : '#64748b',
              shadowOffset: { width: 0, height: 6 },
              shadowOpacity: item.is_emergency === 'yes' ? 0.12 : 0.06,
              shadowRadius: 16,
              elevation: 3,
              marginBottom: 16,
              overflow: 'hidden',
            }}>

              {/* ── Top section: icon + exam name + status badge ── */}
              <TouchableOpacity onPress={() => toggleCard(item.id)} activeOpacity={0.7} style={{ padding: 18, paddingBottom: 14 }}>
                {/* Status badge & chevron — top right */}
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', marginBottom: 12, gap: 10 }}>
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
                  <Feather name={isExpanded ? "chevron-up" : "chevron-down"} size={18} color="#94a3b8" />
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
              </TouchableOpacity>

              {/* ── Expanded Content ── */}
              {isExpanded && (
                <View>
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
                  <>
                    {isToday && (
                      <TouchableOpacity
                        onPress={handleSOS}
                        style={{
                          backgroundColor: item.is_emergency === 'yes' ? '#fca5a5' : '#ef4444',
                          borderRadius: 14, paddingVertical: 14,
                          flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
                          shadowColor: '#ef4444', shadowOffset: { width: 0, height: 6 },
                          shadowOpacity: 0.25, shadowRadius: 12, elevation: 5,
                        }}
                        activeOpacity={0.85}
                      >
                        <Feather name="alert-triangle" size={18} color="#fff" />
                        <Text style={{ fontFamily: 'Roboto', fontSize: 15, fontWeight: '900', color: '#fff', letterSpacing: 0.2 }}>
                          {item.is_emergency === 'yes' ? 'SOS Triggered' : '🚨 Call SOS Emergency Scribe'}
                        </Text>
                      </TouchableOpacity>
                    )}
                    {/* Find & Invite Scribes directly to this exam */}
                    <TouchableOpacity
                      onPress={() => {
                        setPreSelectedScribeReq({ id: item.id, type: 'exam', subject: item.subject });
                        setShowScribeDirectory(true);
                      }}
                      style={{
                        backgroundColor: '#2563eb',
                        borderRadius: 14, paddingVertical: 12,
                        flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
                        shadowColor: '#2563eb', shadowOffset: { width: 0, height: 4 },
                        shadowOpacity: 0.18, shadowRadius: 10, elevation: 4,
                      }}
                      activeOpacity={0.85}
                    >
                      <Feather name="search" size={16} color="#fff" />
                      <Text style={{ fontFamily: 'Roboto', fontSize: 14, fontWeight: '900', color: '#fff' }}>
                        Find & Invite Scribes
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => router.push(`/console/student/view_applications?id=${item.id}` as any)}
                      style={{
                        backgroundColor: '#eff6ff',
                        borderRadius: 14, paddingVertical: 12,
                        flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
                        borderWidth: 1.5, borderColor: '#bfdbfe',
                      }}
                      activeOpacity={0.85}
                    >
                      <Feather name="users" size={16} color="#2563eb" />
                      <Text style={{ fontFamily: 'Roboto', fontSize: 14, fontWeight: '900', color: '#2563eb', letterSpacing: 0.2 }}>
                        View Applications ({item.applicationCount ?? 0})
                      </Text>
                    </TouchableOpacity>
                  </>
                )}

                {/* Matched actions (2x2 Compact Grid) */}
                {isMatched ? (
                  <View style={{ gap: 10, marginTop: 4 }}>
                    {/* Row 1: Call Scribe + Chat */}
                    <View style={{ flexDirection: 'row', gap: 10 }}>
                      <TouchableOpacity
                        onPress={() => openCallSheet(item)}
                        style={{
                          flex: 1, backgroundColor: '#2563eb',
                          borderRadius: 12, paddingVertical: 11,
                          flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
                          shadowColor: '#2563eb', shadowOffset: { width: 0, height: 4 },
                          shadowOpacity: 0.15, shadowRadius: 8, elevation: 3,
                        }}
                        activeOpacity={0.85}
                      >
                        <Feather name="phone-call" size={15} color="#fff" />
                        <Text style={{ fontFamily: 'Roboto', fontSize: 13, fontWeight: '800', color: '#fff' }}>
                          Call Scribe
                        </Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        onPress={() => router.push(`/console/common/chat?requestId=${item.id}` as any)}
                        style={{
                          flex: 1, paddingVertical: 11,
                          borderRadius: 12, borderWidth: 1.5,
                          borderColor: '#bfdbfe',
                          backgroundColor: '#eff6ff',
                          flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
                        }}
                        activeOpacity={0.7}
                      >
                        <Feather name="message-square" size={15} color="#2563eb" />
                        <Text style={{ fontFamily: 'Roboto', fontSize: 13, fontWeight: '800', color: '#2563eb' }}>
                          Chat
                        </Text>
                      </TouchableOpacity>
                    </View>

                    {/* Row 2: Mark Completed + View Details */}
                    <View style={{ flexDirection: 'row', gap: 10 }}>
                      <TouchableOpacity
                        onPress={() => openRatingModal(item)}
                        style={{
                          flex: 1, backgroundColor: '#10b981',
                          borderRadius: 12, paddingVertical: 11,
                          flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
                          shadowColor: '#10b981', shadowOffset: { width: 0, height: 4 },
                          shadowOpacity: 0.15, shadowRadius: 8, elevation: 3,
                        }}
                        activeOpacity={0.85}
                      >
                        <Feather name="check-circle" size={15} color="#fff" />
                        <Text style={{ fontFamily: 'Roboto', fontSize: 13, fontWeight: '800', color: '#fff' }}>
                          Mark Completed
                        </Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        onPress={() => {
                          setSelectedExam(item);
                          setIsDeclarationOpen(true);
                        }}
                        style={{
                          flex: 1, paddingVertical: 11,
                          borderRadius: 12, borderWidth: 1.5,
                          borderColor: '#2563eb',
                          alignItems: 'center', justifyContent: 'center',
                        }}
                        activeOpacity={0.7}
                      >
                        <Text style={{ fontFamily: 'Roboto', fontSize: 13, fontWeight: '800', color: '#2563eb' }}>
                          View Details
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ) : (
                  /* Original Unmatched Flow */
                  <View style={{ gap: 10 }}>
                    {/* Bottom row: View Details + Delete */}
                    <View style={{ flexDirection: 'row', gap: 10 }}>
                      {/* View Details */}
                      <TouchableOpacity
                        onPress={() => {
                          router.push(`/console/student/request_form?id=${item.id}` as any);
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
                    </View>
                  </View>
                )}
              </View>
                </View>
              )}
            </View>
          );
        }}
      />
      ) : (
        <View style={{ flex: 1 }}>
          {/* Scribe Name Search Bar */}
          <View style={{ backgroundColor: '#fff', marginHorizontal: 24, marginBottom: 14, borderRadius: 16, borderWidth: 1.5, borderColor: '#e2e8f0', flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12 }}>
            <Feather name="search" size={16} color="#64748b" style={{ marginRight: 8 }} />
            <TextInput
              value={scribeSearchQuery}
              onChangeText={setScribeSearchQuery}
              placeholder="Search past scribes by name..."
              placeholderTextColor="#94a3b8"
              style={{ flex: 1, fontFamily: 'Roboto', fontSize: 13, color: '#0f172a', paddingVertical: 10, fontWeight: '600' }}
            />
            {scribeSearchQuery.length > 0 && (
              <TouchableOpacity onPress={() => setScribeSearchQuery('')}>
                <Feather name="x" size={14} color="#64748b" />
              </TouchableOpacity>
            )}
          </View>

          {/* Past Scribes List */}
          <FlatList
            style={{ flex: 1 }}
            data={pastScribes.filter(s => (s.full_name || s.official_name || '').toLowerCase().includes(scribeSearchQuery.toLowerCase()))}
            keyExtractor={(item) => item.id}
            contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 40 }}
            ListEmptyComponent={
              <View style={{ backgroundColor: '#f8fafc', padding: 32, borderRadius: 24, borderWidth: 1, borderColor: '#e2e8f0', alignItems: 'center', justifyContent: 'center', marginTop: 8 }}>
                <Feather name="users" size={48} color="#94a3b8" />
                <Text style={{ fontFamily: 'Roboto', fontSize: 16, fontWeight: '900', color: '#0f172a', marginTop: 12 }}>No Past Scribes Found</Text>
                <Text style={{ fontFamily: 'Roboto', fontSize: 12, color: '#64748b', marginTop: 4, textAlign: 'center' }}>
                  {scribeSearchQuery.length > 0
                    ? "Try searching with a different name."
                    : "Scribes you have worked with in completed exams will show up here."
                  }
                </Text>
              </View>
            }
            renderItem={({ item }) => (
              <View style={{ backgroundColor: '#fff', borderRadius: 24, padding: 18, borderWidth: 1, borderColor: 'rgba(0,0,0,0.05)', shadowColor: '#64748b', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.08, shadowRadius: 12, elevation: 3.5, marginBottom: 14 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 14 }}>
                  <View style={{ width: 44, height: 44, borderRadius: 16, backgroundColor: 'rgba(37,99,235,0.09)', alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ fontSize: 18, fontWeight: '900', color: '#2563eb' }}>
                      {(item.full_name || item.official_name || 'S').charAt(0).toUpperCase()}
                    </Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontFamily: 'Roboto', fontSize: 15, fontWeight: '900', color: '#0f172a' }}>{item.full_name || item.official_name}</Text>
                    <Text style={{ fontFamily: 'Roboto', fontSize: 11, color: '#64748b', marginTop: 1 }}>{item.occupation || 'Volunteer Scribe'}</Text>
                  </View>

                  {/* Star Rating on the Right */}
                  <View style={{ alignItems: 'flex-end', justifyContent: 'center' }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      <Ionicons name="star" size={14} color={(item.reviews_count > 0) ? "#eab308" : "#cbd5e1"} />
                      <Text style={{ fontFamily: 'Roboto', fontSize: 14, fontWeight: '900', color: (item.reviews_count > 0) ? '#0f172a' : '#64748b' }}>
                        {(item.reviews_count > 0) ? (item.rating ? Number(item.rating).toFixed(1) : "5.0") : "New"}
                      </Text>
                    </View>
                    <Text style={{ fontFamily: 'Roboto', fontSize: 10, color: '#94a3b8', marginTop: 2, fontWeight: '700' }}>
                      {item.reviews_count || 0} {item.reviews_count === 1 ? 'Review' : 'Reviews'}
                    </Text>
                  </View>
                </View>

                <View style={{ gap: 6, marginBottom: 14, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Feather name="book-open" size={12} color="#64748b" />
                    <Text style={{ fontFamily: 'Roboto', fontSize: 12, color: '#475569' }}>Education: {item.education_level}</Text>
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Feather name="map-pin" size={12} color="#64748b" />
                    <Text style={{ fontFamily: 'Roboto', fontSize: 12, color: '#475569' }}>Location: {item.location}</Text>
                  </View>
                </View>

                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <TouchableOpacity
                    onPress={() => handleOpenScribeProfile(item)}
                    style={{ flex: 1, backgroundColor: '#f1f5f9', paddingVertical: 10, borderRadius: 12, alignItems: 'center', justifyContent: 'center' }}
                  >
                    <Text style={{ fontFamily: 'Roboto', fontSize: 12, fontWeight: '800', color: '#475569' }}>View Profile</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => openInviteModal(item)}
                    style={{ flex: 1, backgroundColor: '#2563eb', paddingVertical: 10, borderRadius: 12, alignItems: 'center', justifyContent: 'center' }}
                  >
                    <Text style={{ fontFamily: 'Roboto', fontSize: 12, fontWeight: '800', color: '#fff' }}>Invite Privately</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
          />
        </View>
      )}

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

      {/* PRIVATE INVITATION MODAL */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={inviteModalVisible}
        onRequestClose={() => setInviteModalVisible(false)}
      >
        <View style={{ flex: 1, backgroundColor: 'rgba(15,23,42,0.6)', justifyContent: 'center', alignItems: 'center', paddingHorizontal: 20 }}>
          <View style={{ backgroundColor: '#fff', width: '100%', maxWidth: 350, borderRadius: 28, padding: 24, shadowColor: '#000', shadowOffset: { width: 0, height: 20 }, shadowOpacity: 0.15, shadowRadius: 30, elevation: 15, borderWidth: 1, borderColor: 'rgba(0,0,0,0.05)' }}>
            
            <View style={{ alignItems: 'center', marginBottom: 16 }}>
              <View style={{ width: 48, height: 48, borderRadius: 16, backgroundColor: 'rgba(37,99,235,0.09)', alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
                <Feather name="mail" size={22} color="#2563eb" />
              </View>
              <Text style={{ fontFamily: 'Roboto', fontSize: 18, fontWeight: '900', color: '#0f172a', textAlign: 'center' }}>Invite Privately</Text>
              <Text style={{ fontFamily: 'Roboto', fontSize: 12, color: '#64748b', textAlign: 'center', marginTop: 4 }}>
                Select an exam request to invite <Text style={{ fontWeight: '700', color: '#0f172a' }}>{inviteTargetScribe?.full_name || inviteTargetScribe?.official_name}</Text> privately:
              </Text>
            </View>

            <ScrollView style={{ maxHeight: 200 }} contentContainerStyle={{ gap: 8 }} showsVerticalScrollIndicator={false}>
              {requests.filter(r => r.status === 'pending' && !r.private_scribe_id).length === 0 ? (
                <Text style={{ fontFamily: 'Roboto', fontSize: 11, color: '#94a3b8', fontStyle: 'italic', textAlign: 'center', paddingVertical: 12 }}>
                  No pending/prebooked requests available for invitation.
                </Text>
              ) : (
                requests
                  .filter(r => r.status === 'pending' && !r.private_scribe_id)
                  .map((r) => (
                    <TouchableOpacity
                      key={r.id}
                      onPress={() => sendPrivateInvitation(r.id)}
                      style={{ backgroundColor: '#f8fafc', padding: 12, borderRadius: 14, borderWidth: 1, borderColor: '#e2e8f0' }}
                    >
                      <Text style={{ fontFamily: 'Roboto', fontSize: 12, fontWeight: '800', color: '#334155' }}>{r.subject}</Text>
                      <Text style={{ fontFamily: 'Roboto', fontSize: 10, color: '#64748b', marginTop: 2 }}>{r.exam_date} · {r.exam_type}</Text>
                    </TouchableOpacity>
                  ))
              )}
            </ScrollView>

            <TouchableOpacity
              onPress={() => setInviteModalVisible(false)}
              style={{ marginTop: 16, width: '100%', backgroundColor: '#f1f5f9', paddingVertical: 12, borderRadius: 14, alignItems: 'center', justifyContent: 'center' }}
            >
              <Text style={{ fontFamily: 'Roboto', color: '#475569', fontWeight: '800', fontSize: 13 }}>Cancel</Text>
            </TouchableOpacity>

          </View>
        </View>
      </Modal>

      {/* SCRIBE ACCOUNT PROFILE MODAL */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={profileModalVisible}
        onRequestClose={() => setProfileModalVisible(false)}
      >
        <View style={{ flex: 1, backgroundColor: 'rgba(15,23,42,0.6)', justifyContent: 'center', alignItems: 'center', paddingHorizontal: 20 }}>
          <View style={{ backgroundColor: '#fff', width: '100%', maxWidth: 360, borderRadius: 28, overflow: 'hidden', shadowColor: '#000', shadowOffset: { width: 0, height: 20 }, shadowOpacity: 0.15, shadowRadius: 30, elevation: 15, borderWidth: 1, borderColor: 'rgba(0,0,0,0.05)' }}>
            
            {/* Modal Header */}
            <View style={{ paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#f1f5f9', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Text style={{ fontFamily: 'Roboto', fontSize: 13, fontWeight: '800', color: '#0f172a', textTransform: 'uppercase' }}>Scribe Account Profile</Text>
              <TouchableOpacity onPress={() => setProfileModalVisible(false)} style={{ padding: 4 }}>
                <Feather name="x" size={18} color="#64748b" />
              </TouchableOpacity>
            </View>

            {/* Profile Content */}
            <ScrollView style={{ maxHeight: 420 }} contentContainerStyle={{ padding: 20, gap: 14 }} showsVerticalScrollIndicator={false}>
              {/* Profile Header Card */}
              <View style={{ alignItems: 'center', marginBottom: 6 }}>
                <View style={{ width: 56, height: 56, borderRadius: 20, backgroundColor: 'rgba(37,99,235,0.09)', alignItems: 'center', justifyContent: 'center', marginBottom: 8 }}>
                  <Text style={{ fontSize: 20, fontWeight: '900', color: '#2563eb' }}>
                    {viewingScribe?.scribe_name?.charAt(0).toUpperCase() || 'S'}
                  </Text>
                </View>
                <Text style={{ fontFamily: 'Roboto', fontWeight: '900', fontSize: 18, color: '#0f172a' }}>{viewingScribe?.scribe_name}</Text>
                <Text style={{ fontFamily: 'Roboto', fontSize: 11, color: '#64748b', marginTop: 2 }}>{viewingScribe?.profile?.occupation || 'Volunteer Scribe'}</Text>
              </View>

              {/* Scribe Stats / Details */}
              <View style={{ backgroundColor: '#f8fafc', padding: 16, borderRadius: 18, borderWidth: 1, borderColor: '#e2e8f0', gap: 8 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Feather name="book-open" size={13} color="#2563eb" />
                  <Text style={{ fontFamily: 'Roboto', fontSize: 12, color: '#475569' }}>
                    <Text style={{ fontWeight: '800', color: '#334155' }}>Education: </Text>
                    {viewingScribe?.profile?.education_level || 'N/A'}
                  </Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Feather name="globe" size={13} color="#2563eb" />
                  <Text style={{ fontFamily: 'Roboto', fontSize: 12, color: '#475569' }}>
                    <Text style={{ fontWeight: '800', color: '#334155' }}>Languages: </Text>
                    {(() => {
                      const langs = viewingScribe?.profile?.languages;
                      if (!langs) return 'N/A';
                      if (Array.isArray(langs)) return langs.join(', ');
                      if (typeof langs === 'string') {
                        try {
                          const parsed = JSON.parse(langs);
                          if (Array.isArray(parsed)) return parsed.join(', ');
                        } catch (_) {}
                        return langs;
                      }
                      return 'N/A';
                    })()}
                  </Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Feather name="map-pin" size={13} color="#2563eb" />
                  <Text style={{ fontFamily: 'Roboto', fontSize: 12, color: '#475569' }}>
                    <Text style={{ fontWeight: '800', color: '#334155' }}>Location: </Text>
                    {viewingScribe?.profile?.location || 'N/A'}
                  </Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Feather name="award" size={13} color="#2563eb" />
                  <Text style={{ fontFamily: 'Roboto', fontSize: 12, color: '#475569' }}>
                    <Text style={{ fontWeight: '800', color: '#334155' }}>First Time Scribe? </Text>
                    {viewingScribe?.profile?.first_time === 'yes' ? 'Yes' : 'No'}
                  </Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Feather name="shield" size={13} color="#2563eb" />
                  <Text style={{ fontFamily: 'Roboto', fontSize: 12, color: '#475569' }}>
                    <Text style={{ fontWeight: '800', color: '#334155' }}>ID Verification: </Text>
                    {viewingScribe?.profile?.verification_status === 'approved' ? 'Aadhar Verified ✅' : 'Pending Verification'}
                  </Text>
                </View>
              </View>

              {/* Scribe Reviews / Student Feedback Section */}
              <View>
                <Text style={{ fontFamily: 'Roboto', fontSize: 11, fontWeight: '800', color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>Student Feedback & Reviews</Text>
                
                {loadingReviews ? (
                  <ActivityIndicator size="small" color="#2563eb" style={{ marginVertical: 10 }} />
                ) : viewingReviews.length === 0 ? (
                  <Text style={{ fontFamily: 'Roboto', fontSize: 12, color: '#94a3b8', fontStyle: 'italic', textAlign: 'center', paddingVertical: 10 }}>No feedback reviews submitted yet.</Text>
                ) : (
                  <View style={{ gap: 8 }}>
                    {viewingReviews.map((r, idx) => (
                      <View key={r.id || idx} style={{ backgroundColor: '#f8fafc', padding: 12, borderRadius: 16, borderWidth: 1, borderColor: '#e2e8f0', gap: 4 }}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                          <View style={{ flexDirection: 'row', gap: 2 }}>
                            {[1, 2, 3, 4, 5].map((star) => (
                              <Ionicons
                                key={star}
                                name={star <= (r.rating_overall || 5) ? 'star' : 'star-outline'}
                                size={11}
                                color={star <= (r.rating_overall || 5) ? '#eab308' : '#cbd5e1'}
                              />
                            ))}
                          </View>
                          <Text style={{ fontSize: 9, color: '#94a3b8' }}>
                            {r.created_at ? r.created_at.split('T')[0] : ''}
                          </Text>
                        </View>
                        {r.remark ? (
                          <Text style={{ fontFamily: 'Roboto', fontSize: 11, color: '#475569', marginTop: 2 }}>
                            "{r.remark}"
                          </Text>
                        ) : null}
                      </View>
                    ))}
                  </View>
                )}
              </View>
            </ScrollView>

            {/* Modal Footer / Close */}
            <View style={{ padding: 18, borderTopWidth: 1, borderTopColor: '#f1f5f9' }}>
              <TouchableOpacity 
                onPress={() => setProfileModalVisible(false)}
                style={{ width: '100%', backgroundColor: '#2563eb', paddingVertical: 12, borderRadius: 14, alignItems: 'center', justifyContent: 'center' }}
              >
                <Text style={{ fontFamily: 'Roboto', color: '#fff', fontWeight: '800', fontSize: 13 }}>Close Account Profile</Text>
              </TouchableOpacity>
            </View>

          </View>
        </View>
      </Modal>

      {/* Scribes Directory Search Modal */}
      <ScribesDirectoryModal
        visible={showScribeDirectory}
        onClose={() => {
          setShowScribeDirectory(false);
          setPreSelectedScribeReq(undefined);
        }}
        studentId={studentProfile?.id || ''}
        preSelectedRequest={preSelectedScribeReq}
      />

    </View>
  );
}
