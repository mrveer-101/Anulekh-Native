import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, ActivityIndicator, RefreshControl, TouchableOpacity, Alert, Modal, Linking } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { supabase } from '../app/core/supabase';
import { useLanguage } from '../app/core/translation';

interface ExamRequest {
  id: number;
  subject: string;
  exam_type: string;
  exam_date: string;
  exam_venue: string;
  exam_language: string;
  student_name: string;
  education_grade: string;
  phone?: string;
  id_proof?: string;
  is_emergency?: string;
  status?: string;
}

export default function ScribePlanView() {
  const { t } = useLanguage();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [plans, setPlans] = useState<any[]>([]);
  const [scribeProfile, setScribeProfile] = useState<any>(null);

  // Custom Calendar & Filter States
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<'all' | 'upcoming' | 'completed'>('all');

  // Declaration Modal State
  const [selectedExam, setSelectedExam] = useState<any>(null);
  const [isDeclarationOpen, setIsDeclarationOpen] = useState(false);

  // Call Modal State
  const [callExam, setCallExam] = useState<any>(null);
  const [isCallOpen, setIsCallOpen] = useState(false);
  const [showMaskedNumber, setShowMaskedNumber] = useState(false);

  useEffect(() => {
    fetchPlans();
  }, []);

  const fetchPlans = async () => {
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

      // Fetch only MATCHED exam requests (Confirmed Plans)
      const { data: exams, error: examsErr } = await supabase
        .from('exam_requests')
        .select('*')
        .eq('status', 'matched')
        .eq('scribe_id', session.user.id);

      if (examsErr) throw examsErr;

      // Fetch only MATCHED assignment requests (Confirmed Plans)
      const { data: assignments, error: assignmentsErr } = await supabase
        .from('assignment_requests')
        .select('*')
        .eq('status', 'matched')
        .eq('scribe_id', session.user.id);

      if (assignmentsErr) throw assignmentsErr;

      const mappedAssignments = (assignments || []).map((assign: any) => ({
        id: assign.id,
        subject: assign.subject || 'Assignment',
        exam_type: 'Assignment: ' + assign.academic_level,
        exam_date: assign.deadline,
        exam_venue: assign.description || 'No instructions provided.',
        exam_language: 'Written',
        student_name: assign.student_name || 'Student',
        education_grade: assign.academic_level,
        status: assign.status,
        is_assignment: true
      }));

      const allPlans = [...(exams || []), ...mappedAssignments];
      setPlans(allPlans);
    } catch (error: any) {
      console.error('Error fetching scribe plans:', error.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    fetchPlans();
  };

  const openCallSheet = (exam: any) => {
    setCallExam(exam);
    setShowMaskedNumber(true);
    setIsCallOpen(true);
  };

  const closeCallSheet = () => setIsCallOpen(false);

  const changeMonth = (offset: number) => {
    const next = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + offset, 1);
    setCurrentMonth(next);
  };

  const getDaysInMonth = (date: Date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const firstDay = new Date(year, month, 1).getDay();
    const totalDays = new Date(year, month + 1, 0).getDate();
    const days = [];
    for (let i = 0; i < firstDay; i++) {
      days.push(null);
    }
    for (let i = 1; i <= totalDays; i++) {
      days.push(new Date(year, month, i));
    }
    return days;
  };

  const hasPlanOnDate = (day: Date) => {
    if (!day) return false;
    const year = day.getFullYear();
    const month = String(day.getMonth() + 1).padStart(2, '0');
    const date = String(day.getDate()).padStart(2, '0');
    const dateStr = `${year}-${month}-${date}`;
    return plans.some(p => p.exam_date && p.exam_date.startsWith(dateStr));
  };

  const getPlansOnDate = (day: Date) => {
    if (!day) return [];
    const year = day.getFullYear();
    const month = String(day.getMonth() + 1).padStart(2, '0');
    const date = String(day.getDate()).padStart(2, '0');
    const dateStr = `${year}-${month}-${date}`;
    return plans.filter(p => p.exam_date && p.exam_date.startsWith(dateStr));
  };

  // Sort and filter logic
  const sortedPlans = [...plans].sort((a, b) => {
    const dateA = a.exam_date ? a.exam_date.split(' ')[0] : '9999-12-31';
    const dateB = b.exam_date ? b.exam_date.split(' ')[0] : '9999-12-31';
    return dateA.localeCompare(dateB);
  });

  let filteredPlans = sortedPlans;
  if (selectedDate) {
    filteredPlans = filteredPlans.filter(p => p.exam_date && p.exam_date.startsWith(selectedDate));
  }

  const checkUpcoming = (dateStr: string) => {
    if (!dateStr) return true;
    const cleanDate = dateStr.split(' ')[0];
    const examTime = new Date(cleanDate).getTime();
    const todayTime = new Date(new Date().toISOString().split('T')[0]).getTime();
    return examTime >= todayTime;
  };

  filteredPlans = filteredPlans.filter(p => {
    if (activeFilter === 'upcoming') {
      return checkUpcoming(p.exam_date);
    }
    if (activeFilter === 'completed') {
      return !checkUpcoming(p.exam_date);
    }
    return true;
  });

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', paddingVertical: 10, backgroundColor: '#f9fafb' }}>
        <ActivityIndicator size="large" color="#059669" />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#f9fafb' }}>
      <ScrollView 
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 16, paddingBottom: 40 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#059669']} />
        }
      >
        {/* ── CALENDAR BLOCK ── */}
        <View style={{
          backgroundColor: '#ffffff',
          padding: 18,
          borderRadius: 24,
          borderWidth: 1.5,
          borderColor: '#e2e8f0',
          shadowColor: '#059669',
          shadowOffset: { width: 0, height: 6 },
          shadowOpacity: 0.08,
          shadowRadius: 16,
          elevation: 4,
          marginBottom: 16
        }}>
          {/* Header: Month Selector */}
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <TouchableOpacity 
              onPress={() => changeMonth(-1)} 
              style={{ padding: 8, backgroundColor: 'rgba(37,99,235,0.08)', borderWidth: 1, borderColor: 'rgba(37,99,235,0.18)', borderRadius: 12 }}
            >
              <Feather name="chevron-left" size={18} color="#2563eb" />
            </TouchableOpacity>
            
            <View style={{ alignItems: 'center' }}>
              <Text style={{ fontFamily: 'Roboto', fontSize: 16, fontWeight: '900', color: '#2563eb', letterSpacing: -0.3 }}>
                {currentMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
              </Text>
            </View>

            <TouchableOpacity 
              onPress={() => changeMonth(1)} 
              style={{ padding: 8, backgroundColor: 'rgba(37,99,235,0.08)', borderWidth: 1, borderColor: 'rgba(37,99,235,0.18)', borderRadius: 12 }}
            >
              <Feather name="chevron-right" size={18} color="#2563eb" />
            </TouchableOpacity>
          </View>

          {/* Weekdays Row with All Orange Accents */}
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 }}>
            {['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'].map((day, idx) => (
              <View key={idx} style={{ width: '14.2%', alignItems: 'center' }}>
                <Text style={{ fontFamily: 'Roboto', fontSize: 10, fontWeight: '900', color: '#f97316', letterSpacing: 0.5 }}>{day}</Text>
              </View>
            ))}
          </View>

          {/* Days Grid */}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', rowGap: 8 }}>
            {getDaysInMonth(currentMonth).map((day, idx) => {
              if (!day) {
                return <View key={`empty-${idx}`} style={{ width: '14.2%', height: 38 }} />;
              }
              const dateString = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`;
              const isSelected = selectedDate === dateString;
              const hasPlan = hasPlanOnDate(day);
              const isToday = day.toISOString().split('T')[0] === new Date().toISOString().split('T')[0];

              let cellBg = 'transparent';
              let cellTextColor = '#334155';
              let cellBorder = {};
              let dotColor = '#94a3b8';

              if (isSelected) {
                cellBg = '#059669';
                cellTextColor = '#ffffff';
                dotColor = '#ffffff';
              } else if (hasPlan) {
                cellBg = 'rgba(249,115,22,0.14)';
                cellTextColor = '#c2410c';
                cellBorder = { borderWidth: 1.5, borderColor: 'rgba(249,115,22,0.35)' };
                dotColor = '#f97316';
              } else if (isToday) {
                cellBg = 'rgba(5,150,105,0.08)';
                cellTextColor = '#059669';
                cellBorder = { borderWidth: 1.5, borderColor: 'rgba(5,150,105,0.3)' };
              }

              return (
                <TouchableOpacity
                  key={idx}
                  onPress={() => {
                    if (isSelected) {
                      setSelectedDate(null);
                    } else {
                      setSelectedDate(dateString);
                    }
                  }}
                  style={{
                    width: '14.2%',
                    height: 38,
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderRadius: 19,
                    backgroundColor: cellBg,
                    ...cellBorder
                  }}
                >
                  <Text style={{
                    fontFamily: 'Roboto',
                    fontSize: 12,
                    fontWeight: isSelected || hasPlan || isToday ? '900' : '600',
                    color: cellTextColor
                  }}>
                    {day.getDate()}
                  </Text>
                  {hasPlan && (
                    <View style={{
                      width: 5,
                      height: 5,
                      borderRadius: 2.5,
                      backgroundColor: dotColor,
                      marginTop: 2
                    }} />
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* ── FILTER SELECTION BLOCK (one liner 3 filters) ── */}
        <View style={{
          flexDirection: 'row',
          backgroundColor: '#ffffff',
          padding: 5,
          borderRadius: 18,
          borderWidth: 1.5,
          borderColor: '#cbd5e1',
          shadowColor: '#475569',
          shadowOffset: { width: 0, height: 6 },
          shadowOpacity: 0.1,
          shadowRadius: 14,
          elevation: 4,
          marginBottom: 16,
          gap: 4
        }}>
          {(['all', 'upcoming', 'completed'] as const).map((filter) => {
            const isActive = activeFilter === filter;
            const filterLabel = filter === 'all' ? 'All' : filter === 'upcoming' ? 'Upcoming' : 'Completed';
            return (
              <TouchableOpacity
                key={filter}
                onPress={() => setActiveFilter(filter)}
                style={{
                  flex: 1,
                  paddingVertical: 9,
                  borderRadius: 14,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: isActive ? '#059669' : 'transparent',
                  shadowColor: isActive ? '#059669' : 'transparent',
                  shadowOffset: { width: 0, height: 4 },
                  shadowOpacity: isActive ? 0.35 : 0,
                  shadowRadius: 10,
                  elevation: isActive ? 4 : 0
                }}
              >
                <Text style={{
                  fontFamily: 'Roboto',
                  fontSize: 11,
                  fontWeight: '900',
                  textTransform: 'uppercase',
                  color: isActive ? '#ffffff' : '#64748b',
                  letterSpacing: 0.5
                }}>
                  {filterLabel}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {filteredPlans.length === 0 ? (
          <View style={{ backgroundColor: '#ffffff', padding: 32, borderRadius: 24, borderWidth: 1.5, borderColor: '#e2e8f0', shadowColor: '#64748b', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.06, shadowRadius: 16, elevation: 3, alignItems: 'center', justifyContent: 'center', marginTop: 8 }}>
            <View style={{ width: 60, height: 60, borderRadius: 30, backgroundColor: 'rgba(5,150,105,0.08)', alignItems: 'center', justifyContent: 'center', marginBottom: 16, borderWidth: 1, borderColor: 'rgba(5,150,105,0.18)' }}>
              <Feather name="calendar" size={26} color="#059669" />
            </View>
            <Text style={{ fontFamily: 'Roboto', fontSize: 16, fontWeight: '900', color: '#0f172a' }}>{t('no_confirmed_plans')}</Text>
            <Text style={{ fontFamily: 'Roboto', fontSize: 12, color: '#64748b', marginTop: 6, textAlign: 'center', lineHeight: 18, paddingHorizontal: 16 }}>
              {t('scribe_no_plans_desc')}
            </Text>
          </View>
        ) : (
          filteredPlans.map((exam) => (
            <View key={exam.id} style={{ backgroundColor: '#ffffff', padding: 18, borderRadius: 24, borderWidth: 1.5, borderColor: '#e2e8f0', shadowColor: '#64748b', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.06, shadowRadius: 16, elevation: 3, marginBottom: 14 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <View style={{ flex: 1, marginRight: 8 }}>
                  <Text style={{ fontFamily: 'Roboto', fontSize: 15, fontWeight: '900', color: '#0f172a' }}>{exam.subject || 'પરીક્ષા'}</Text>
                  <Text style={{ fontFamily: 'Roboto', fontSize: 10, color: '#64748b', marginTop: 1 }}>{t('exam_level')}: {exam.exam_type}</Text>
                </View>
                <View style={{ paddingVertical: 4, paddingHorizontal: 10, borderRadius: 20, backgroundColor: 'rgba(5,150,105,0.08)', borderWidth: 1, borderColor: 'rgba(5,150,105,0.2)' }}>
                  <Text style={{ fontFamily: 'Roboto', color: '#059669', fontSize: 9, fontWeight: '800' }}>{t('status_matched')}</Text>
                </View>
              </View>

              <View style={{ borderTopWidth: 1, borderTopColor: '#f1f5f9', paddingTop: 10, marginBottom: 12, gap: 6 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Feather name="user" size={12} color="#059669" style={{ marginRight: 8 }} />
                  <Text style={{ fontFamily: 'Roboto', color: '#475569', fontSize: 12 }}>
                    {t('candidate_student')}: <Text style={{ fontWeight: '700', color: '#0f172a' }}>{exam.student_name} {exam.is_assignment ? '' : `(${exam.education_grade})`}</Text>
                  </Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Feather name="calendar" size={12} color="#64748b" style={{ marginRight: 8 }} />
                  <Text style={{ fontFamily: 'Roboto', color: '#475569', fontSize: 12 }}>
                    {exam.is_assignment ? 'Deadline' : t('exam_date')}: {exam.exam_date || t('date_not_specified')}
                  </Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Feather name={exam.is_assignment ? 'info' : 'map-pin'} size={12} color="#64748b" style={{ marginRight: 8 }} />
                  <Text style={{ fontFamily: 'Roboto', color: '#475569', fontSize: 12 }} numberOfLines={1}>
                    {exam.is_assignment ? 'Instructions' : t('exam_venue')}: {exam.exam_venue || t('venue_not_specified')}
                  </Text>
                </View>
                {!exam.is_assignment && (
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <Feather name="globe" size={12} color="#64748b" style={{ marginRight: 8 }} />
                    <Text style={{ fontFamily: 'Roboto', color: '#475569', fontSize: 12 }}>
                      {t('exam_language')}: {exam.exam_language}
                    </Text>
                  </View>
                )}
              </View>

              {/* Matched Coordination Controls */}
              <View style={{ gap: 8, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#f1f5f9' }}>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  {/* Call Button */}
                  {!exam.is_assignment && (
                    <TouchableOpacity 
                      onPress={() => openCallSheet(exam)}
                      style={{ flex: 1, backgroundColor: '#fff', borderWidth: 1, borderColor: '#e2e8f0', paddingVertical: 10, borderRadius: 12, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6 }}
                    >
                      <Feather name="phone" size={12} color="#334155" />
                      <Text style={{ fontFamily: 'Roboto', color: '#334155', fontWeight: '800', fontSize: 12 }}>{t('call')}</Text>
                    </TouchableOpacity>
                  )}

                  {/* Chat Button */}
                  <TouchableOpacity 
                    onPress={() => router.push(`/console/common/chat?requestId=${exam.id}&type=${exam.is_assignment ? 'assignment' : 'exam'}` as any)}
                    style={{ flex: 1, backgroundColor: '#fff', borderWidth: 1, borderColor: '#e2e8f0', paddingVertical: 10, borderRadius: 12, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6 }}
                  >
                    <Feather name="message-square" size={12} color="#334155" />
                    <Text style={{ fontFamily: 'Roboto', color: '#334155', fontWeight: '800', fontSize: 12 }}>{t('chat')}</Text>
                  </TouchableOpacity>
                </View>

                {/* View Declaration Button */}
                {!exam.is_assignment && (
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
                )}
              </View>
            </View>
          ))
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
          <View style={{ backgroundColor: '#f8fafc', width: '100%', maxWidth: 360, borderRadius: 28, overflow: 'hidden', shadowColor: '#64748b', shadowOffset: { width: 0, height: 20 }, shadowOpacity: 0.08, shadowRadius: 12, elevation: 3, borderWidth: 1, borderColor: '#e2e8f0' }}>
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
                <Text style={{ fontFamily: 'Roboto', fontWeight: '900', fontSize: 20, color: '#059669' }}>Anulekh Portal</Text>
                <Text style={{ fontFamily: 'Roboto', fontSize: 9, color: '#64748b', textTransform: 'uppercase', letterSpacing: 1.5, marginTop: 2 }}>{t('official_cert_letter')}</Text>
              </View>

              {/* 1. Exam Details */}
              <View style={{ backgroundColor: '#f8fafc', padding: 12, borderRadius: 16, borderWidth: 1, borderColor: '#e2e8f0', gap: 4 }}>
                <Text style={{ fontFamily: 'Roboto', fontSize: 9, fontWeight: '800', color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 }}>{t('exam_details')}</Text>
                <Text style={{ fontFamily: 'Roboto', fontSize: 12, color: '#334155', fontWeight: '700' }}>Subject: {selectedExam?.subject}</Text>
                <Text style={{ fontFamily: 'Roboto', fontSize: 11, color: '#475569' }}>Level: {selectedExam?.exam_type}</Text>
                <Text style={{ fontFamily: 'Roboto', fontSize: 11, color: '#475569' }}>Date: {selectedExam?.exam_date}</Text>
                <Text style={{ fontFamily: 'Roboto', fontSize: 11, color: '#475569' }}>Venue: {selectedExam?.exam_venue}</Text>
              </View>

              {/* 2. Candidate & Scribe Details */}
              <View style={{ gap: 10 }}>
                <View>
                  <Text style={{ fontFamily: 'Roboto', fontSize: 9, fontWeight: '800', color: '#64748b', textTransform: 'uppercase', marginBottom: 2 }}>{t('candidate_student')}</Text>
                  <Text style={{ fontFamily: 'Roboto', fontSize: 12, color: '#0f172a', fontWeight: '800' }}>{selectedExam?.student_name}</Text>
                  <Text style={{ fontFamily: 'Roboto', fontSize: 10, color: '#64748b', marginTop: 1 }}>Grade: {selectedExam?.education_grade}</Text>
                  <Text style={{ fontFamily: 'Roboto', fontSize: 10, color: '#64748b' }}>Aadhaar ID: Verified</Text>
                </View>

                <View style={{ height: 1, backgroundColor: '#f1f5f9' }} />

                <View>
                  <Text style={{ fontFamily: 'Roboto', fontSize: 9, fontWeight: '800', color: '#64748b', textTransform: 'uppercase', marginBottom: 2 }}>{t('volunteer_scribe')}</Text>
                  <Text style={{ fontFamily: 'Roboto', fontSize: 12, color: '#0f172a', fontWeight: '800' }}>{scribeProfile?.full_name}</Text>
                  <Text style={{ fontFamily: 'Roboto', fontSize: 10, color: '#64748b', marginTop: 1 }}>Occupation: {scribeProfile?.occupation || 'Student Volunteer Scribe'}</Text>
                  <Text style={{ fontFamily: 'Roboto', fontSize: 10, color: '#64748b' }}>Education: {scribeProfile?.education_level || 'Undergraduate'}</Text>
                </View>
              </View>

              {/* 3. Formal Declaration Text */}
              <View style={{ backgroundColor: 'rgba(5,150,105,0.05)', borderWidth: 1, borderColor: 'rgba(5,150,105,0.18)', padding: 12, borderRadius: 16, marginTop: 4 }}>
                <Text style={{ fontFamily: 'Roboto', fontSize: 10, color: '#047857', lineHeight: 16, fontStyle: 'italic', textAlign: 'center' }}>
                  {t('declaration_agreement_text')}
                </Text>
              </View>

              {/* 4. Verification Stamp */}
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 4 }}>
                <View>
                  <Text style={{ fontFamily: 'Roboto', fontSize: 8, fontWeight: '800', color: '#64748b', textTransform: 'uppercase' }}>{t('status')}</Text>
                  <Text style={{ fontFamily: 'Roboto', fontSize: 10, color: '#059669', fontWeight: '800', marginTop: 2 }}>✓ Verified Scribe</Text>
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
