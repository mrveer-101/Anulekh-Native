import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, ScrollView, ActivityIndicator, RefreshControl, TouchableOpacity, Alert, Modal, Linking, TextInput } from 'react-native';
import { Feather, Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { supabase } from '../app/core/supabase';
import { useLanguage } from '../app/core/translation';

interface Application {
  id: number;
  request_id: number;
  scribe_id: string;
  status: string;
  created_at: string;
}

interface EnrichedApplication extends Application {
  examDetails?: {
    id: number;
    subject: string;
    exam_type: string;
    exam_date: string;
    exam_venue: string;
    exam_language: string;
    student_name: string;
    education_grade: string;
    phone?: string;
    status?: string;
  };
}

export default function ScribeCommitmentsView() {
  const { t } = useLanguage();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [applications, setApplications] = useState<EnrichedApplication[]>([]);
  const [scribeProfile, setScribeProfile] = useState<any>(null);
  const [reviews, setReviews] = useState<any[]>([]);

  // Student reviews states
  const [studentReviews, setStudentReviews] = useState<any[]>([]);
  const [ratingModalVisible, setRatingModalVisible] = useState(false);
  const [ratingTarget, setRatingTarget] = useState<any>(null);
  const [selectedRating, setSelectedRating] = useState(5);
  const [remark, setRemark] = useState('');
  const [submittingRating, setSubmittingRating] = useState(false);

  // Status filter for the flat applications list
  const [selectedFilter, setSelectedFilter] = useState<'All' | 'Pending' | 'Completed' | 'Rejected'>('All');

  // Track which cards are expanded (by application id) for the collapsed list / detailed view toggle
  const [expandedIds, setExpandedIds] = useState<number[]>([]);

  const toggleExpanded = (id: number) => {
    setExpandedIds(prev => (prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]));
  };

  // Declaration Modal State
  const [selectedExam, setSelectedExam] = useState<any>(null);
  const [isDeclarationOpen, setIsDeclarationOpen] = useState(false);

  // Call Modal State
  const [callExam, setCallExam] = useState<any>(null);
  const [isCallOpen, setIsCallOpen] = useState(false);
  const [showMaskedNumber, setShowMaskedNumber] = useState(false);

  useFocusEffect(
    useCallback(() => {
      fetchApplications();
    }, [])
  );

  const fetchApplications = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      // Fetch Scribe Profile
      const { data: profile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', session.user.id)
        .single();
      setScribeProfile(profile);

      // Fetch all Scribe Applications
      const { data, error } = await supabase
        .from('scribe_applications')
        .select('*')
        .eq('scribe_id', session.user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Fetch Scribe Reviews
      const { data: reviewsData } = await supabase
        .from('scribe_reviews')
        .select('*')
        .eq('scribe_id', session.user.id);
      setReviews(reviewsData || []);

      // Fetch reviews of students left by this scribe
      const { data: studentReviewsData } = await supabase
        .from('student_reviews')
        .select('*')
        .eq('scribe_id', session.user.id);
      setStudentReviews(studentReviewsData || []);

      // Enrich with Exam Details
      const enriched = await Promise.all(
        (data || []).map(async (app: any) => {
          const { data: exam } = await supabase
            .from('exam_requests')
            .select('*')
            .eq('id', app.request_id)
            .single();
          
          return {
            ...app,
            examDetails: exam || undefined
          };
        })
      );

      setApplications(enriched);
    } catch (error: any) {
      console.error('Error fetching applications:', error.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    fetchApplications();
  };

  const openRatingModal = (app: EnrichedApplication) => {
    setRatingTarget(app);
    setSelectedRating(5);
    setRemark('');
    setRatingModalVisible(true);
  };

  const submitStudentRating = async () => {
    if (!ratingTarget || submittingRating) return;
    setSubmittingRating(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const { error } = await supabase
        .from('student_reviews')
        .insert({
          request_id: ratingTarget.request_id,
          student_id: ratingTarget.examDetails.student_id,
          scribe_id: session.user.id,
          rating_overall: selectedRating,
          remark: remark.trim(),
          created_at: new Date().toISOString(),
        });

      if (error) throw error;

      Alert.alert("Success", "Student rating submitted successfully!");
      setRatingModalVisible(false);
      fetchApplications();
    } catch (e: any) {
      Alert.alert("Error", e.message || "Failed to submit rating.");
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
    // Date format is "YYYY-MM-DD | 10:00 AM" or "YYYY-MM-DD"
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

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', paddingVertical: 10, backgroundColor: '#f8fafc' }}>
        <ActivityIndicator size="large" color="#059669" />
      </View>
    );
  }

  const StarDisplay = ({ rating }: { rating: number }) => {
    return (
      <View style={{ flexDirection: 'row', gap: 2 }}>
        {[1, 2, 3, 4, 5].map((star) => (
          <Ionicons
            key={star}
            name={star <= rating ? 'star' : 'star-outline'}
            size={13}
            color={star <= rating ? '#eab308' : '#cbd5e1'}
          />
        ))}
      </View>
    );
  };

  // Classify a single application into one of the display buckets (matches renderCard's `type`).
  const getAppType = (app: EnrichedApplication): 'pending' | 'confirmed' | 'completed' | 'rejected' | null => {
    if (app.status === 'pending') return 'pending';
    if (app.status === 'rejected') return 'rejected';
    if (app.status === 'accepted' && app.examDetails?.status === 'matched') return 'confirmed';
    if (app.status === 'accepted' && app.examDetails?.status === 'completed') return 'completed';
    return null;
  };

  const FILTERS: { key: 'All' | 'Pending' | 'Completed' | 'Rejected'; label: string }[] = [
    { key: 'All', label: 'All' },
    { key: 'Pending', label: 'Pending' },
    { key: 'Completed', label: 'Completed' },
    { key: 'Rejected', label: 'Rejected' },
  ];

  // Apply the active filter to the (already newest-first) applications list.
  // "Pending" covers both pending applications and confirmed commitments (accepted but not yet completed).
  const visibleApps = applications.filter(app => {
    const type = getAppType(app);
    if (!type) return false;
    if (selectedFilter === 'All') return true;
    if (selectedFilter === 'Pending') return type === 'pending' || type === 'confirmed';
    return type === selectedFilter.toLowerCase();
  });

  const renderCard = (app: EnrichedApplication, type: 'pending' | 'confirmed' | 'rejected' | 'completed') => {
    const exam = app.examDetails;
    if (!exam) return null;

    let badgeBg = 'rgba(234,179,8,0.08)';
    let badgeBorder = 'rgba(234,179,8,0.2)';
    let badgeText = '#d97706';
    let statusLabel = t('status_pending');

    if (type === 'confirmed') {
      badgeBg = 'rgba(5,150,105,0.08)';
      badgeBorder = 'rgba(5,150,105,0.2)';
      badgeText = '#059669';
      statusLabel = t('status_matched');
    } else if (type === 'completed') {
      badgeBg = 'rgba(16,185,129,0.08)';
      badgeBorder = 'rgba(16,185,129,0.2)';
      badgeText = '#10b981';
      statusLabel = 'Completed';
    } else if (type === 'rejected') {
      badgeBg = 'rgba(220,38,38,0.08)';
      badgeBorder = 'rgba(220,38,38,0.2)';
      badgeText = '#dc2626';
      statusLabel = t('status_rejected') || 'Rejected';
    }

    const review = reviews.find(r => r.request_id === app.request_id);
    const isExpanded = expandedIds.includes(app.id);

    return (
      <View key={app.id} style={{ backgroundColor: '#fff', padding: 18, borderRadius: 24, borderWidth: 1, borderColor: 'rgba(0,0,0,0.05)', borderLeftWidth: 6, borderLeftColor: badgeText, shadowColor: '#0f172a', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.03, shadowRadius: 16, elevation: 3, marginBottom: 14 }}>
        {/* Header row (tappable to expand/collapse) */}
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={() => toggleExpanded(app.id)}
          style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
        >
          <View style={{ flex: 1, marginRight: 8 }}>
            <Text style={{ fontFamily: 'Roboto', fontSize: 15, fontWeight: '900', color: '#0f172a' }}>{exam.subject || 'પરીક્ષા'}</Text>
            <Text style={{ fontFamily: 'Roboto', fontSize: 10, color: '#64748b', marginTop: 1 }}>{t('exam_level')}: {exam.exam_type}</Text>
          </View>
          <View style={{ paddingVertical: 4, paddingHorizontal: 10, borderRadius: 20, backgroundColor: badgeBg, borderWidth: 1, borderColor: badgeBorder }}>
            <Text style={{ fontFamily: 'Roboto', fontSize: 9, fontWeight: '800', color: badgeText }}>{statusLabel}</Text>
          </View>
          <View style={{ marginLeft: 10, width: 26, height: 26, borderRadius: 13, backgroundColor: '#f1f5f9', alignItems: 'center', justifyContent: 'center' }}>
            <Feather name={isExpanded ? 'chevron-up' : 'chevron-down'} size={16} color="#64748b" />
          </View>
        </TouchableOpacity>

        {/* Collapsed summary line (only when NOT expanded) */}
        {!isExpanded && (
          <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 10, gap: 6 }}>
            <Feather name="calendar" size={11} color="#94a3b8" />
            <Text style={{ fontFamily: 'Roboto', color: '#64748b', fontSize: 11, flexShrink: 1 }} numberOfLines={1}>
              {exam.exam_date || t('date_not_specified')}
              {exam.exam_venue ? `  •  ${exam.exam_venue}` : ''}
            </Text>
          </View>
        )}

        {/* Detailed view (only when expanded) */}
        {isExpanded && (
        <>
        <View style={{ borderTopWidth: 1, borderTopColor: '#f1f5f9', paddingTop: 10, marginTop: 12, marginBottom: 12, gap: 6 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Feather name="user" size={12} color="#64748b" style={{ marginRight: 8 }} />
            <Text style={{ fontFamily: 'Roboto', color: '#475569', fontSize: 12 }}>
              {t('candidate_student')}: <Text style={{ fontFamily: 'Roboto', fontWeight: '700', color: '#0f172a' }}>{exam.student_name} ({exam.education_grade})</Text>
            </Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Feather name="calendar" size={12} color="#64748b" style={{ marginRight: 8 }} />
            <Text style={{ fontFamily: 'Roboto', color: '#475569', fontSize: 12 }}>
              {t('exam_date')}: {exam.exam_date || t('date_not_specified')}
            </Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Feather name="map-pin" size={12} color="#64748b" style={{ marginRight: 8 }} />
            <Text style={{ fontFamily: 'Roboto', color: '#475569', fontSize: 12 }} numberOfLines={1}>
              {t('exam_venue')}: {exam.exam_venue || t('venue_not_specified')}
            </Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Feather name="globe" size={12} color="#64748b" style={{ marginRight: 8 }} />
            <Text style={{ fontFamily: 'Roboto', color: '#475569', fontSize: 12 }}>
              {t('exam_language')}: {exam.exam_language}
            </Text>
          </View>
        </View>

        {/* If Confirmed, render Chat, Call, and Declaration Buttons */}
        {type === 'confirmed' && (
          <View style={{ gap: 8, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#f1f5f9' }}>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {/* Call */}
              <TouchableOpacity 
                onPress={() => openCallSheet(exam)}
                style={{ flex: 1, backgroundColor: '#f1f5f9', paddingVertical: 12, borderRadius: 14, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6 }}
              >
                <Feather name="phone" size={12} color="#334155" />
                <Text style={{ fontFamily: 'Roboto', color: '#334155', fontWeight: '800', fontSize: 12 }}>{t('call')}</Text>
              </TouchableOpacity>

              {/* Chat */}
              <TouchableOpacity 
                onPress={() => router.push(`/console/common/chat?requestId=${exam.id}` as any)}
                style={{ flex: 1, backgroundColor: '#f1f5f9', paddingVertical: 12, borderRadius: 14, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6 }}
              >
                <Feather name="message-square" size={12} color="#334155" />
                <Text style={{ fontFamily: 'Roboto', color: '#334155', fontWeight: '800', fontSize: 12 }}>{t('chat')}</Text>
              </TouchableOpacity>
            </View>

            {/* View Declaration */}
            <TouchableOpacity 
              onPress={() => {
                setSelectedExam(exam);
                setIsDeclarationOpen(true);
              }}
              style={{ width: '100%', backgroundColor: '#059669', paddingVertical: 12, borderRadius: 14, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6, shadowColor: '#059669', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 8, elevation: 2 }}
            >
              <Feather name="file-text" size={12} color="white" />
              <Text style={{ fontFamily: 'Roboto', color: 'white', fontWeight: '800', fontSize: 12 }}>{t('view_declaration')}</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* If Completed and Review exists, render Star Feedback */}
        {type === 'completed' && review && (
          <View style={{ marginTop: 12, borderTopWidth: 1, borderTopColor: '#f1f5f9', paddingTop: 12 }}>
            <Text style={{ fontFamily: 'Roboto', fontSize: 10, fontWeight: '800', color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>Student Feedback & Ratings</Text>
            
            <View style={{ backgroundColor: '#f8fafc', padding: 12, borderRadius: 16, borderStyle: 'solid', borderWidth: 1, borderColor: '#e2e8f0', gap: 6 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text style={{ fontFamily: 'Roboto', fontSize: 11, color: '#475569' }}>Punctuality:</Text>
                <StarDisplay rating={review.rating_punctuality} />
              </View>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text style={{ fontFamily: 'Roboto', fontSize: 11, color: '#475569' }}>Communication:</Text>
                <StarDisplay rating={review.rating_communication} />
              </View>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text style={{ fontFamily: 'Roboto', fontSize: 11, color: '#475569' }}>Writing Speed:</Text>
                <StarDisplay rating={review.rating_speed} />
              </View>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text style={{ fontFamily: 'Roboto', fontSize: 11, color: '#475569' }}>Politeness & Behavior:</Text>
                <StarDisplay rating={review.rating_behavior} />
              </View>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderTopWidth: 1, borderTopColor: '#e2e8f0', paddingTop: 4, marginTop: 2 }}>
                <Text style={{ fontFamily: 'Roboto', fontSize: 11, fontWeight: '700', color: '#0f172a' }}>Overall Rating:</Text>
                <StarDisplay rating={review.rating_overall} />
              </View>
              {/* Review privacy: the student's written remark is intentionally NOT shown to
                  the scribe. Scribes see numerical ratings only; remarks stay in the
                  candidate's dashboard. */}
            </View>
          </View>
        )}

        {/* Scribe's Feedback for Student (Rate Student) */}
        {type === 'completed' && (
          <View style={{ marginTop: 12, borderTopWidth: 1, borderTopColor: '#f1f5f9', paddingTop: 12 }}>
            {(() => {
              const studentReview = studentReviews.find(r => r.request_id === app.request_id);
              if (studentReview) {
                return (
                  <View style={{ gap: 4 }}>
                    <Text style={{ fontFamily: 'Roboto', fontSize: 10, fontWeight: '800', color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5 }}>Your Rating for Student</Text>
                    <View style={{ backgroundColor: '#f8fafc', padding: 12, borderRadius: 16, borderStyle: 'solid', borderWidth: 1, borderColor: '#e2e8f0', gap: 6 }}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Text style={{ fontFamily: 'Roboto', fontSize: 11, color: '#475569', fontWeight: '700' }}>Overall Rating:</Text>
                        <StarDisplay rating={studentReview.rating_overall} />
                      </View>
                      {studentReview.remark ? (
                        <Text style={{ fontFamily: 'Roboto', fontSize: 11, color: '#64748b', fontStyle: 'italic', marginTop: 2 }}>
                          "{studentReview.remark}"
                        </Text>
                      ) : null}
                    </View>
                  </View>
                );
              } else {
                return (
                  <TouchableOpacity
                    onPress={() => openRatingModal(app)}
                    style={{ width: '100%', backgroundColor: 'rgba(37,99,235,0.08)', borderWidth: 1, borderColor: 'rgba(37,99,235,0.18)', paddingVertical: 12, borderRadius: 14, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6 }}
                  >
                    <Feather name="edit-3" size={12} color="#2563eb" style={{ marginRight: 4 }} />
                    <Text style={{ fontFamily: 'Roboto', color: '#2563eb', fontWeight: '800', fontSize: 12 }}>Rate Student</Text>
                  </TouchableOpacity>
                );
              }
            })()}
          </View>
        )}
        </>
        )}
      </View>
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: '#f8fafc' }}>

      {/* Filter Selection Tabs (equal width) */}
      <View style={{ paddingHorizontal: 24, paddingTop: 16, paddingBottom: 6 }}>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {FILTERS.map(f => (
            <TouchableOpacity
              key={f.key}
              onPress={() => setSelectedFilter(f.key)}
              style={{
                flex: 1,
                paddingVertical: 8,
                borderRadius: 12,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: selectedFilter === f.key ? '#059669' : '#fff',
                borderWidth: 1,
                borderColor: selectedFilter === f.key ? '#059669' : 'rgba(0,0,0,0.05)',
              }}
            >
              <Text style={{ fontFamily: 'Roboto', fontSize: 11, fontWeight: '800', color: selectedFilter === f.key ? '#fff' : '#64748b' }}>
                {f.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 10, paddingBottom: 40 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#059669']} />
        }
      >
        {visibleApps.length === 0 ? (
          <View style={{ backgroundColor: '#fff', padding: 32, borderRadius: 24, borderWidth: 1, borderColor: 'rgba(0,0,0,0.05)', justifyContent: 'center', alignItems: 'center', marginTop: 10 }}>
            <Feather name="inbox" size={28} color="#94a3b8" />
            <Text style={{ fontFamily: 'Roboto', fontSize: 14, fontWeight: '900', color: '#0f172a', marginTop: 10 }}>
              {selectedFilter === 'All' ? 'No applications yet' : `No ${selectedFilter.toLowerCase()} applications`}
            </Text>
            <Text style={{ fontFamily: 'Roboto', fontSize: 11, color: '#64748b', marginTop: 4, textAlign: 'center', lineHeight: 16 }}>
              {selectedFilter === 'All'
                ? 'Apply to exams from the Explore tab to see them here.'
                : 'Try selecting a different filter above.'}
            </Text>
          </View>
        ) : (
          visibleApps.map(app => renderCard(app, getAppType(app) as 'pending' | 'confirmed' | 'rejected' | 'completed'))
        )}
      </ScrollView>

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
                <Text style={{ fontFamily: 'Roboto', fontWeight: '900', fontSize: 20, color: '#059669', letterSpacing: -0.5 }}>Anulekh Portal</Text>
                <Text style={{ fontFamily: 'Roboto', fontSize: 9, fontStyle: 'normal', color: '#64748b', textTransform: 'uppercase', letterSpacing: 1.5, marginTop: 2 }}>{t('official_cert_letter')}</Text>
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
                  <Text style={{ fontFamily: 'Roboto', fontSize: 12, color: '#0f172a', fontWeight: '800' }}>{selectedExam?.student_name}</Text>
                  <Text style={{ fontFamily: 'Roboto', fontSize: 10, color: '#64748b', marginTop: 1 }}>ધોરણ: {selectedExam?.education_grade}</Text>
                  <Text style={{ fontFamily: 'Roboto', fontSize: 10, color: '#64748b' }}>આધાર ID: ચકાસાયેલ</Text>
                </View>

                <View style={{ height: 1, backgroundColor: '#f1f5f9' }} />

                <View>
                  <Text style={{ fontFamily: 'Roboto', fontSize: 9, fontWeight: '800', color: '#64748b', textTransform: 'uppercase', marginBottom: 2 }}>{t('volunteer_scribe')}</Text>
                  <Text style={{ fontFamily: 'Roboto', fontSize: 12, color: '#0f172a', fontWeight: '800' }}>{scribeProfile?.full_name}</Text>
                  <Text style={{ fontFamily: 'Roboto', fontSize: 10, color: '#64748b', marginTop: 1 }}>વ્યવસાય: {scribeProfile?.occupation || 'વિદ્યાર્થી લખિયો'}</Text>
                  <Text style={{ fontFamily: 'Roboto', fontSize: 10, color: '#64748b' }}>શિક્ષણ: {scribeProfile?.education_level || 'અંડરગ્રેજ્યુએટ'}</Text>
                </View>
              </View>

              {/* 3. Formal Declaration Text */}
              <View style={{ backgroundColor: 'rgba(5,150,105,0.05)', borderWidth: 1, borderColor: 'rgba(5,150,105,0.18)', padding: 12, borderRadius: 16, marginTop: 4 }}>
                <Text style={{ fontFamily: 'Roboto', fontSize: 10, color: '#047857', lineHeight: 16, fontStyle: 'italic', textAlign: 'center' }}>
                  {t('declaration_agreement_text')}
                </Text>
              </View>

              {/* 4. Verification Stamp */}
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 2, paddingVertical: 4 }}>
                <View>
                  <Text style={{ fontFamily: 'Roboto', fontSize: 8, fontWeight: '800', color: '#64748b', textTransform: 'uppercase' }}>{t('status')}</Text>
                  <Text style={{ fontFamily: 'Roboto', fontSize: 10, color: '#059669', fontWeight: '800', marginTop: 2 }}>✓ ચકાસાયેલ લખિયો</Text>
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
                style={{ flex: 1, backgroundColor: '#059669', paddingVertical: 11, borderRadius: 12, alignItems: 'center', shadowColor: '#059669', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 8, elevation: 3 }}
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
                backgroundColor: 'rgba(5,150,105,0.09)', borderWidth: 1, borderColor: 'rgba(5,150,105,0.22)',
                alignItems: 'center', justifyContent: 'center',
              }}>
                <Feather name="phone" size={16} color="#059669" />
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
            backgroundColor: 'rgba(5,150,105,0.09)', borderWidth: 1, borderColor: 'rgba(5,150,105,0.22)',
            borderRadius: 20, padding: 20,
          }}>
            {/* Avatar + name */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 16 }}>
              <View style={{
                width: 54, height: 54, borderRadius: 16,
                backgroundColor: 'rgba(5,150,105,0.15)',
                borderWidth: 2, borderColor: 'rgba(5,150,105,0.22)',
                alignItems: 'center', justifyContent: 'center',
              }}>
                <Text style={{ fontFamily: 'Roboto', fontSize: 22, fontWeight: '900', color: '#059669' }}>
                  {callExam?.student_name?.charAt(0)?.toUpperCase() ?? 'S'}
                </Text>
              </View>
              <View>
                <Text style={{ fontFamily: 'Roboto', fontSize: 17, fontWeight: '900', color: '#0f172a' }}>
                  {callExam?.student_name ?? 'વિદ્યાર્થી'}
                </Text>
                <View style={{
                  marginTop: 4, backgroundColor: 'rgba(5,150,105,0.09)',
                  borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3,
                  alignSelf: 'flex-start', borderWidth: 1, borderColor: 'rgba(5,150,105,0.22)',
                }}>
                  <Text style={{ fontFamily: 'Roboto', color: '#059669', fontSize: 10, fontWeight: '800' }}>CANDIDATE STUDENT</Text>
                </View>
              </View>
            </View>

            {/* Phone number display */}
            {showMaskedNumber ? (
              <View style={{
                backgroundColor: '#fff',
                borderRadius: 14, paddingVertical: 14, paddingHorizontal: 18,
                flexDirection: 'row', alignItems: 'center', gap: 12,
                borderWidth: 1, borderColor: 'rgba(5,150,105,0.22)',
              }}>
                <Feather name="phone" size={18} color="#059669" />
                <Text style={{ fontFamily: 'Roboto', fontSize: 20, fontWeight: '900', color: '#0f172a', letterSpacing: 1.5 }}>
                  {callExam?.phone || '9876543210'}
                </Text>
              </View>
            ) : (
              <TouchableOpacity
                onPress={() => setShowMaskedNumber(true)}
                style={{
                  backgroundColor: '#fff',
                  borderRadius: 14, paddingVertical: 14, paddingHorizontal: 18,
                  flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
                  borderWidth: 1, borderColor: 'rgba(5,150,105,0.22)',
                  borderStyle: 'dashed'
                }}
              >
                <Feather name="eye" size={16} color="#059669" />
                <Text style={{ fontFamily: 'Roboto', fontSize: 14, fontWeight: '800', color: '#059669' }}>{t('view_number')}</Text>
              </TouchableOpacity>
            )}

            {/* Exam context */}
            <Text style={{ fontFamily: 'Roboto', fontSize: 11, color: '#64748b', marginTop: 10, textAlign: 'center' }}>
              વિષય: <Text style={{ fontWeight: '700', color: '#0f172a' }}>{callExam?.subject}</Text> પરીક્ષાના વિદ્યાર્થી
            </Text>
          </View>

          {/* Dial Now CTA */}
          <TouchableOpacity
            onPress={async () => {
              const url = `tel:${callExam?.phone || '9876543210'}`;
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
              backgroundColor: '#059669',
              borderRadius: 18, paddingVertical: 16, marginTop: 16,
              flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
              shadowColor: '#059669', shadowOffset: { width: 0, height: 10 },
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

      {/* RATE STUDENT MODAL */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={ratingModalVisible}
        onRequestClose={() => setRatingModalVisible(false)}
      >
        <View style={{ flex: 1, backgroundColor: 'rgba(15,23,42,0.6)', justifyContent: 'center', alignItems: 'center', paddingHorizontal: 20 }}>
          <View style={{ backgroundColor: '#fff', width: '100%', maxWidth: 340, borderRadius: 28, padding: 24, shadowColor: '#000', shadowOffset: { width: 0, height: 20 }, shadowOpacity: 0.15, shadowRadius: 30, elevation: 15, borderWidth: 1, borderColor: 'rgba(0,0,0,0.05)' }}>
            <View style={{ alignItems: 'center', marginBottom: 16 }}>
              <View style={{ width: 48, height: 48, borderRadius: 16, backgroundColor: 'rgba(37,99,235,0.09)', alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
                <Feather name="star" size={24} color="#2563eb" />
              </View>
              <Text style={{ fontFamily: 'Roboto', fontSize: 18, fontWeight: '900', color: '#0f172a', textAlign: 'center' }}>Rate Candidate Student</Text>
              <Text style={{ fontFamily: 'Roboto', fontSize: 11, color: '#64748b', textAlign: 'center', marginTop: 4 }}>
                Please provide feedback for student {ratingTarget?.examDetails?.student_name}.
              </Text>
            </View>

            {/* Stars selection */}
            <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 8, marginBottom: 20 }}>
              {[1, 2, 3, 4, 5].map((star) => (
                <TouchableOpacity
                  key={star}
                  onPress={() => setSelectedRating(star)}
                  style={{ padding: 4 }}
                >
                  <Ionicons
                    name={star <= selectedRating ? "star" : "star-outline"}
                    size={32}
                    color={star <= selectedRating ? "#eab308" : "#cbd5e1"}
                  />
                </TouchableOpacity>
              ))}
            </View>

            {/* Remark input */}
            <View style={{ marginBottom: 20 }}>
              <Text style={{ fontFamily: 'Roboto', fontSize: 11, fontWeight: '700', color: '#475569', marginBottom: 6, marginLeft: 2 }}>Write a remark (optional)</Text>
              <TextInput
                value={remark}
                onChangeText={setRemark}
                placeholder="e.g. Cooperative, punctual and shared requirements clearly."
                placeholderTextColor="#94a3b8"
                multiline={true}
                numberOfLines={3}
                style={{ backgroundColor: '#f8fafc', borderWidth: 1.5, borderColor: '#e2e8f0', borderRadius: 14, paddingHorizontal: 14, paddingVertical: 10, fontSize: 13, color: '#0f172a', height: 72, textAlignVertical: 'top' }}
              />
            </View>

            {/* Actions */}
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <TouchableOpacity
                onPress={() => setRatingModalVisible(false)}
                style={{ flex: 1, backgroundColor: '#f1f5f9', paddingVertical: 12, borderRadius: 14, alignItems: 'center', justifyContent: 'center' }}
              >
                <Text style={{ fontFamily: 'Roboto', color: '#475569', fontWeight: '800', fontSize: 13 }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={submitStudentRating}
                disabled={submittingRating}
                style={{ flex: 1, backgroundColor: '#2563eb', paddingVertical: 12, borderRadius: 14, alignItems: 'center', justifyContent: 'center' }}
              >
                {submittingRating ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={{ fontFamily: 'Roboto', color: '#fff', fontWeight: '800', fontSize: 13 }}>Submit Rating</Text>
                )}
              </TouchableOpacity>
            </View>

          </View>
        </View>
      </Modal>
    </View>
  );
}
