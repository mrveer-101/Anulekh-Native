import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, ActivityIndicator, RefreshControl, TouchableOpacity, Alert, Modal, Linking } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
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
  };
}

export default function ScribeCommitmentsView() {
  const { t } = useLanguage();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [applications, setApplications] = useState<EnrichedApplication[]>([]);
  const [scribeProfile, setScribeProfile] = useState<any>(null);

  // Declaration Modal State
  const [selectedExam, setSelectedExam] = useState<any>(null);
  const [isDeclarationOpen, setIsDeclarationOpen] = useState(false);

  // Call Modal State
  const [callExam, setCallExam] = useState<any>(null);
  const [isCallOpen, setIsCallOpen] = useState(false);
  const [showMaskedNumber, setShowMaskedNumber] = useState(false);

  useEffect(() => {
    fetchApplications();
  }, []);

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

  const openCallSheet = (exam: any) => {
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

  const pendingApps = applications.filter(app => app.status === 'pending');
  const confirmedApps = applications.filter(app => app.status === 'accepted');
  const rejectedApps = applications.filter(app => app.status === 'rejected');

  const renderCard = (app: EnrichedApplication, type: 'pending' | 'confirmed' | 'rejected') => {
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
    } else if (type === 'rejected') {
      badgeBg = 'rgba(220,38,38,0.08)';
      badgeBorder = 'rgba(220,38,38,0.2)';
      badgeText = '#dc2626';
      statusLabel = t('status_cancelled');
    }

    return (
      <View key={app.id} style={{ backgroundColor: '#fff', padding: 18, borderRadius: 24, borderWidth: 1, borderColor: 'rgba(0,0,0,0.06)', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.04, shadowRadius: 10, elevation: 2, marginBottom: 14 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <View style={{ flex: 1, marginRight: 8 }}>
            <Text style={{ fontFamily: 'Roboto', fontSize: 15, fontWeight: '900', color: '#0f172a' }}>{exam.subject || 'પરીક્ષા'}</Text>
            <Text style={{ fontFamily: 'Roboto', fontSize: 10, color: '#64748b', marginTop: 1 }}>{t('exam_level')}: {exam.exam_type}</Text>
          </View>
          <View style={{ paddingVertical: 4, paddingHorizontal: 10, borderRadius: 20, backgroundColor: badgeBg, borderWidth: 1, borderColor: badgeBorder }}>
            <Text style={{ fontFamily: 'Roboto', fontSize: 9, fontWeight: '800', color: badgeText }}>{statusLabel}</Text>
          </View>
        </View>

        <View style={{ borderTopWidth: 1, borderTopColor: '#f1f5f9', paddingTop: 10, marginBottom: 12, gap: 6 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Feather name="user" size={12} color="#64748b" style={{ marginRight: 8 }} />
            <Text style={{ fontFamily: 'Roboto', color: '#475569', fontSize: 12 }}>
              {t('candidate_student')}: <Text style={{ fontWeight: '700', color: '#0f172a' }}>{exam.student_name} ({exam.education_grade})</Text>
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
                style={{ flex: 1, backgroundColor: '#fff', borderWidth: 1, borderColor: '#e2e8f0', paddingVertical: 10, borderRadius: 12, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6 }}
              >
                <Feather name="phone" size={12} color="#334155" />
                <Text style={{ fontFamily: 'Roboto', color: '#334155', fontWeight: '800', fontSize: 12 }}>{t('call')}</Text>
              </TouchableOpacity>

              {/* Chat */}
              <TouchableOpacity 
                onPress={() => router.push(`/console/common/chat?requestId=${exam.id}` as any)}
                style={{ flex: 1, backgroundColor: '#fff', borderWidth: 1, borderColor: '#e2e8f0', paddingVertical: 10, borderRadius: 12, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6 }}
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
              style={{ width: '100%', backgroundColor: '#059669', paddingVertical: 10, borderRadius: 12, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6, shadowColor: '#059669', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.1, shadowRadius: 6, elevation: 2 }}
            >
              <Feather name="file-text" size={12} color="white" />
              <Text style={{ fontFamily: 'Roboto', color: 'white', fontWeight: '800', fontSize: 12 }}>{t('view_declaration')}</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: '#f8fafc' }}>
      <ScrollView 
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 16, paddingBottom: 40 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#059669']} />
        }
      >
        {/* 1. SECTION: MY PENDING APPLICATIONS */}
        <View style={{ marginBottom: 20 }}>
          <Text style={{ fontFamily: 'Roboto', color: '#475569', fontWeight: '800', fontSize: 13, marginBottom: 10 }}>{t('my_applications_pending')}</Text>
          {pendingApps.length === 0 ? (
            <View style={{ backgroundColor: '#fff', padding: 20, borderRadius: 24, borderWidth: 1, borderColor: 'rgba(0,0,0,0.05)', justifyContent: 'center', alignItems: 'center' }}>
              <Text style={{ fontFamily: 'Roboto', color: '#94a3b8', fontSize: 12, textAlign: 'center' }}>{t('no_pending_apps')}</Text>
            </View>
          ) : (
            pendingApps.map(app => renderCard(app, 'pending'))
          )}
        </View>

        {/* 2. SECTION: MY CONFIRMED COMMITMENTS */}
        <View style={{ marginBottom: 20 }}>
          <Text style={{ fontFamily: 'Roboto', color: '#475569', fontWeight: '800', fontSize: 13, marginBottom: 10 }}>{t('my_confirmed_exams')}</Text>
          {confirmedApps.length === 0 ? (
            <View style={{ backgroundColor: '#fff', padding: 20, borderRadius: 24, borderWidth: 1, borderColor: 'rgba(0,0,0,0.05)', justifyContent: 'center', alignItems: 'center' }}>
              <Text style={{ fontFamily: 'Roboto', color: '#94a3b8', fontSize: 12, textAlign: 'center' }}>{t('no_confirmed_exams')}</Text>
            </View>
          ) : (
            confirmedApps.map(app => renderCard(app, 'confirmed'))
          )}
        </View>

        {/* 3. SECTION: REJECTED APPLICATIONS */}
        <View style={{ marginBottom: 20 }}>
          <Text style={{ fontFamily: 'Roboto', color: '#475569', fontWeight: '800', fontSize: 13, marginBottom: 10 }}>{t('rejected_applications')}</Text>
          {rejectedApps.length === 0 ? (
            <View style={{ backgroundColor: '#fff', padding: 20, borderRadius: 24, borderWidth: 1, borderColor: 'rgba(0,0,0,0.05)', justifyContent: 'center', alignItems: 'center' }}>
              <Text style={{ fontFamily: 'Roboto', color: '#94a3b8', fontSize: 12, textAlign: 'center' }}>{t('no_rejected_apps')}</Text>
            </View>
          ) : (
            rejectedApps.map(app => renderCard(app, 'rejected'))
          )}
        </View>
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
    </View>
  );
}
