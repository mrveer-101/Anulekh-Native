import React, { useState, useEffect } from 'react';
import { View, Text, FlatList, ActivityIndicator, RefreshControl, TouchableOpacity, Alert, Modal, Linking, ScrollView } from 'react-native';
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
  created_at: string;
  scribe_id?: string;
  status?: string;
  is_emergency?: string;
  private_scribe_id?: string;
  scribeProfile?: {
    full_name: string;
    phone: string;
    education_level: string;
    occupation: string;
  };
}

export default function StudentPlanView() {
  const { t } = useLanguage();
  const [plans, setPlans] = useState<ExamRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [studentProfile, setStudentProfile] = useState<any>(null);

  // Custom Calendar & Filter States
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<'all' | 'upcoming' | 'completed'>('all');
  const [expandedPlanIds, setExpandedPlanIds] = useState<Set<number>>(new Set());

  // Declaration Modal State
  const [selectedExam, setSelectedExam] = useState<any>(null);
  const [isDeclarationOpen, setIsDeclarationOpen] = useState(false);

  // Call Modal State
  const [callExam, setCallExam] = useState<any>(null);
  const [isCallOpen, setIsCallOpen] = useState(false);
  const [showMaskedNumber, setShowMaskedNumber] = useState(false);

  const fetchPlans = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      // Fetch Student Profile
      const { data: profile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', session.user.id)
        .single();
      setStudentProfile(profile);

      // Fetch student's requests (all)
      const { data, error } = await supabase
        .from('exam_requests')
        .select('*')
        .eq('student_id', session.user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;

      const activePlans = (data || []).filter((exam: any) => {
        return exam.status === 'matched' || (exam.status === 'pending' && exam.is_emergency === 'yes');
      });

      // Enrich plans with Scribe profiles
      const enriched = await Promise.all(
        activePlans.map(async (exam: any) => {
          let scribeProfile = null;
          if (exam.scribe_id) {
            const { data: scribe } = await supabase
              .from('profiles')
              .select('*')
              .eq('id', exam.scribe_id)
              .single();
            scribeProfile = scribe;
          }
          return {
            ...exam,
            scribeProfile: scribeProfile || undefined
          };
        })
      );

      setPlans(enriched);
    } catch (error: any) {
      console.error('Error fetching student plans:', error.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchPlans();
  }, []);

  const onRefresh = () => {
    setRefreshing(true);
    fetchPlans();
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  };

  const openCallSheet = (exam: any) => {
    if (!exam || !exam.exam_date) {
      Alert.alert("Contact Info Locked 🔒", "Contact details are only unlocked on the day of the exam for privacy protection.");
      return;
    }
    
    const dateStr = exam.exam_date.split('|')[0].trim();
    const todayStr = new Date().toISOString().split('T')[0];
    
    if (dateStr !== todayStr) {
      Alert.alert("Contact Info Locked 🔒", `Scribe contact details are protected and will unlock on the exam day (${dateStr}).`);
      return;
    }

    setCallExam(exam);
    setShowMaskedNumber(false);
    setIsCallOpen(true);
  };

  const closeCallSheet = () => setIsCallOpen(false);

  const dialNumber = async (phoneNumber: string) => {
    const url = `tel:${phoneNumber}`;
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
  };

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
        <ActivityIndicator size="large" color="#2563eb" />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#f9fafb' }}>
      <FlatList
        style={{ flex: 1 }}
        data={filteredPlans}
        keyExtractor={(item) => item.id.toString()}
        contentContainerStyle={{ padding: 24, paddingBottom: 40 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#2563eb']} />
        }
        ListHeaderComponent={
          <View style={{ marginBottom: 12 }}>
            {/* ── CALENDAR BLOCK ── */}
            <View style={{
              backgroundColor: '#ffffff',
              padding: 18,
              borderRadius: 24,
              borderWidth: 1.5,
              borderColor: '#e2e8f0',
              shadowColor: '#2563eb',
              shadowOffset: { width: 0, height: 6 },
              shadowOpacity: 0.08,
              shadowRadius: 16,
              elevation: 4,
              marginBottom: 16
            }}>
              {/* Header: Month Selector with Both Blue Buttons & Orange Month Title */}
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
                    cellBg = '#2563eb';
                    cellTextColor = '#ffffff';
                    dotColor = '#ffffff';
                  } else if (hasPlan) {
                    const plansOnDay = getPlansOnDate(day);
                    const hasEmergency = plansOnDay.some(p => p.is_emergency === 'yes');
                    if (hasEmergency) {
                      cellBg = 'rgba(239,68,68,0.15)';
                      cellTextColor = '#dc2626';
                      cellBorder = { borderWidth: 1.5, borderColor: 'rgba(239,68,68,0.35)' };
                      dotColor = '#dc2626';
                    } else {
                      // Vibrant Orange Accent for confirmed plans
                      cellBg = 'rgba(249,115,22,0.14)';
                      cellTextColor = '#c2410c';
                      cellBorder = { borderWidth: 1.5, borderColor: 'rgba(249,115,22,0.35)' };
                      dotColor = '#f97316';
                    }
                  } else if (isToday) {
                    cellBg = '#eff6ff';
                    cellTextColor = '#2563eb';
                    cellBorder = { borderWidth: 1.5, borderColor: '#93c5fd' };
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
                      backgroundColor: isActive ? '#2563eb' : 'transparent',
                      shadowColor: isActive ? '#2563eb' : 'transparent',
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
          </View>
        }
        ListEmptyComponent={
          <View style={{ backgroundColor: '#ffffff', padding: 32, borderRadius: 24, borderWidth: 1.5, borderColor: '#e2e8f0', shadowColor: '#64748b', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.06, shadowRadius: 16, elevation: 3, alignItems: 'center', justifyContent: 'center', marginTop: 8 }}>
            <View style={{ width: 60, height: 60, borderRadius: 30, backgroundColor: 'rgba(37,99,235,0.08)', alignItems: 'center', justifyContent: 'center', marginBottom: 16, borderWidth: 1, borderColor: 'rgba(37,99,235,0.18)' }}>
              <Feather name="calendar" size={26} color="#2563eb" />
            </View>
            <Text style={{ fontFamily: 'Roboto', fontSize: 16, fontWeight: '900', color: '#0f172a' }}>{t('no_confirmed_plans')}</Text>
            <Text style={{ fontFamily: 'Roboto', fontSize: 12, color: '#64748b', marginTop: 6, textAlign: 'center', lineHeight: 18, paddingHorizontal: 16 }}>
              {t('scribe_confirmed_plans_desc')}
            </Text>
          </View>
        }
        renderItem={({ item }) => {
          const isEmergency = item.is_emergency === 'yes';
          const isConfirmed = item.status === 'matched' || !!item.scribe_id;
          const isExpanded = expandedPlanIds.has(item.id);

          const toggleExpand = () => {
            setExpandedPlanIds(prev => {
              const next = new Set(prev);
              if (next.has(item.id)) next.delete(item.id);
              else next.add(item.id);
              return next;
            });
          };

          // Status-based Border & Shadow colors
          let borderColor = '#bfdbfe';
          let shadowColor = '#2563eb';
          let borderWidth = 1.5;
          let shadowOpacity = 0.12;

          if (isEmergency) {
            borderColor = '#fca5a5';
            shadowColor = '#dc2626';
            borderWidth = 2;
            shadowOpacity = 0.15;
          } else if (isConfirmed) {
            borderColor = '#a7f3d0';
            shadowColor = '#059669';
            borderWidth = 1.5;
            shadowOpacity = 0.12;
          } else {
            // Non-Confirmed / Pending
            borderColor = '#bfdbfe';
            shadowColor = '#2563eb';
            borderWidth = 1.5;
            shadowOpacity = 0.12;
          }

          return (
            <View style={{
              backgroundColor: '#ffffff',
              padding: 16,
              borderRadius: 24,
              borderWidth,
              borderColor,
              shadowColor,
              shadowOffset: { width: 0, height: 6 },
              shadowOpacity,
              shadowRadius: 16,
              elevation: 4,
              marginBottom: 14
            }}>
              {/* Card Header */}
              <TouchableOpacity onPress={toggleExpand} activeOpacity={0.85} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <View style={{ flex: 1, marginRight: 8 }}>
                  <Text style={{ fontFamily: 'Roboto', fontSize: 16, fontWeight: '900', color: '#0f172a' }}>{item.subject || 'પરીક્ષા'}</Text>
                  <Text style={{ fontFamily: 'Roboto', fontSize: 11, color: '#64748b', marginTop: 2 }}>
                    Level: {item.exam_type} | Confirmed {formatDate(item.created_at)}
                  </Text>
                </View>
                
                <View style={{
                  paddingVertical: 5, paddingHorizontal: 10, borderRadius: 20,
                  backgroundColor: isEmergency ? '#fef2f2' : 'rgba(5,150,105,0.08)',
                  borderWidth: 1,
                  borderColor: isEmergency ? '#fca5a5' : 'rgba(5,150,105,0.2)'
                }}>
                  <Text style={{ fontFamily: 'Roboto', color: isEmergency ? '#dc2626' : '#059669', fontSize: 9.5, fontWeight: '800' }}>
                    {isEmergency ? '🚨 EMERGENCY SOS' : t('status_matched')}
                  </Text>
                </View>
              </TouchableOpacity>

              {/* Collapsed Preview Summary Bar */}
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#f1f5f9' }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, gap: 12 }}>
                  {!isEmergency && item.scribeProfile?.full_name && (
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                      <Feather name="user" size={12} color="#059669" style={{ marginRight: 5 }} />
                      <Text style={{ fontFamily: 'Roboto', fontSize: 12, fontWeight: '700', color: '#0f172a' }}>
                        {item.scribeProfile.full_name}
                      </Text>
                    </View>
                  )}
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <Feather name="calendar" size={12} color="#f97316" style={{ marginRight: 5 }} />
                    <Text style={{ fontFamily: 'Roboto', fontSize: 11.5, color: '#475569', fontWeight: '600' }}>
                      {item.exam_date ? item.exam_date.split(' ')[0] : 'Scheduled'}
                    </Text>
                  </View>
                </View>

                {/* Details Expand/Collapse Button */}
                <TouchableOpacity
                  onPress={toggleExpand}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    backgroundColor: isExpanded ? 'rgba(37,99,235,0.08)' : '#f8fafc',
                    borderWidth: 1,
                    borderColor: isExpanded ? 'rgba(37,99,235,0.2)' : '#e2e8f0',
                    paddingHorizontal: 10,
                    paddingVertical: 4,
                    borderRadius: 10,
                    gap: 4
                  }}
                >
                  <Text style={{ fontFamily: 'Roboto', fontSize: 11, fontWeight: '800', color: isExpanded ? '#2563eb' : '#64748b' }}>
                    {isExpanded ? 'Collapse' : 'Details'}
                  </Text>
                  <Feather name={isExpanded ? "chevron-up" : "chevron-down"} size={14} color={isExpanded ? "#2563eb" : "#64748b"} />
                </TouchableOpacity>
              </View>

              {/* Expanded Detailed View */}
              {isExpanded && (
                <View style={{ marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#f1f5f9' }}>
                  {isEmergency && (
                    <View style={{ 
                      backgroundColor: '#fef2f2', 
                      padding: 12, borderRadius: 14, 
                      borderWidth: 1, borderColor: '#fca5a5', 
                      flexDirection: 'row', alignItems: 'center', 
                      gap: 8, marginBottom: 12 
                    }}>
                      <Feather name="alert-triangle" size={14} color="#dc2626" />
                      <Text style={{ fontFamily: 'Roboto', color: '#b91c1c', fontSize: 11, fontWeight: '800', flex: 1 }}>
                        Scribe cancelled! Re-broadcasting emergency SOS.
                      </Text>
                    </View>
                  )}

                  <View style={{ gap: 8, marginBottom: 14 }}>
                    {!isEmergency && (
                      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                        <Feather name="user" size={13} color="#059669" style={{ marginRight: 8 }} />
                        <Text style={{ fontFamily: 'Roboto', color: '#475569', fontSize: 12 }}>
                          {t('volunteer_scribe')}: <Text style={{ fontWeight: '700', color: '#0f172a' }}>{item.scribeProfile?.full_name}</Text>
                        </Text>
                      </View>
                    )}
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                      <Feather name="calendar" size={13} color="#f97316" style={{ marginRight: 8 }} />
                      <Text style={{ fontFamily: 'Roboto', color: '#475569', fontSize: 12 }}>
                        {t('exam_date')}: {item.exam_date || t('date_not_specified')}
                      </Text>
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                      <Feather name="map-pin" size={13} color="#2563eb" style={{ marginRight: 8 }} />
                      <Text style={{ fontFamily: 'Roboto', color: '#475569', fontSize: 12 }} numberOfLines={1}>
                        {t('exam_venue')}: {item.exam_venue || t('venue_not_specified')}
                      </Text>
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                      <Feather name="globe" size={13} color="#64748b" style={{ marginRight: 8 }} />
                      <Text style={{ fontFamily: 'Roboto', color: '#475569', fontSize: 12 }}>
                        {t('exam_language')}: {item.exam_language}
                      </Text>
                    </View>
                  </View>

                  {/* Controls */}
                  <View style={{ gap: 8, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#f1f5f9' }}>
                    {isEmergency ? (
                      <TouchableOpacity
                        onPress={() => router.push('/console/student/view_applications' as any)}
                        style={{ 
                          width: '100%', 
                          backgroundColor: '#dc2626', 
                          paddingVertical: 12, 
                          borderRadius: 14, 
                          alignItems: 'center', 
                          justifyContent: 'center',
                          flexDirection: 'row',
                          gap: 6
                        }}
                      >
                        <Feather name="users" size={14} color="#ffffff" />
                        <Text style={{ color: '#ffffff', fontWeight: '800', fontSize: 12 }}>View SOS Applications</Text>
                      </TouchableOpacity>
                    ) : (
                      <>
                        <View style={{ flexDirection: 'row', gap: 10 }}>
                          <TouchableOpacity
                            onPress={() => openCallSheet(item)}
                            style={{ 
                              flex: 1, 
                              backgroundColor: 'rgba(5,150,105,0.08)', 
                              borderWidth: 1, 
                              borderColor: 'rgba(5,150,105,0.2)', 
                              paddingVertical: 10, 
                              borderRadius: 14, 
                              alignItems: 'center', 
                              justifyContent: 'center', 
                              flexDirection: 'row', 
                              gap: 6 
                            }}
                          >
                            <Feather name="phone" size={14} color="#059669" />
                            <Text style={{ fontFamily: 'Roboto', color: '#059669', fontWeight: '800', fontSize: 12 }}>{t('call')}</Text>
                          </TouchableOpacity>

                          <TouchableOpacity
                            onPress={() => {
                              router.push(`/console/common/chat?id=${item.id}&type=exam` as any);
                            }}
                            style={{ 
                              flex: 1, 
                              backgroundColor: 'rgba(37,99,235,0.08)', 
                              borderWidth: 1, 
                              borderColor: 'rgba(37,99,235,0.2)', 
                              paddingVertical: 10, 
                              borderRadius: 14, 
                              alignItems: 'center', 
                              justifyContent: 'center', 
                              flexDirection: 'row', 
                              gap: 6 
                            }}
                          >
                            <Feather name="message-square" size={14} color="#2563eb" />
                            <Text style={{ fontFamily: 'Roboto', color: '#2563eb', fontWeight: '800', fontSize: 12 }}>{t('chat')}</Text>
                          </TouchableOpacity>
                        </View>

                        <TouchableOpacity
                          onPress={() => {
                            setSelectedExam(item);
                            setIsDeclarationOpen(true);
                          }}
                          style={{
                            width: '100%',
                            backgroundColor: '#2563eb',
                            paddingVertical: 12,
                            borderRadius: 14,
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexDirection: 'row',
                            gap: 6,
                            shadowColor: '#2563eb',
                            shadowOffset: { width: 0, height: 4 },
                            shadowOpacity: 0.15,
                            shadowRadius: 8,
                            elevation: 2
                          }}
                        >
                          <Feather name="file-text" size={14} color="#ffffff" />
                          <Text style={{ color: '#ffffff', fontWeight: '800', fontSize: 12 }}>{t('view_declaration')}</Text>
                        </TouchableOpacity>
                      </>
                    )}
                  </View>
                </View>
              )}
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
                <Text style={{ fontFamily: 'Roboto', fontSize: 12, color: '#334155', fontWeight: '700' }}>Subject: {selectedExam?.subject}</Text>
                <Text style={{ fontFamily: 'Roboto', fontSize: 11, color: '#475569' }}>Level: {selectedExam?.exam_type}</Text>
                <Text style={{ fontFamily: 'Roboto', fontSize: 11, color: '#475569' }}>Date: {selectedExam?.exam_date}</Text>
                <Text style={{ fontFamily: 'Roboto', fontSize: 11, color: '#475569' }}>Venue: {selectedExam?.exam_venue}</Text>
              </View>

              {/* 2. Candidate & Scribe Details */}
              <View style={{ gap: 10 }}>
                <View>
                  <Text style={{ fontFamily: 'Roboto', fontSize: 9, fontWeight: '800', color: '#64748b', textTransform: 'uppercase', marginBottom: 2 }}>{t('candidate_student')}</Text>
                  <Text style={{ fontFamily: 'Roboto', fontSize: 12, color: '#0f172a', fontWeight: '800' }}>{studentProfile?.full_name}</Text>
                  <Text style={{ fontFamily: 'Roboto', fontSize: 10, color: '#64748b', marginTop: 1 }}>Grade: {selectedExam?.education_grade}</Text>
                  <Text style={{ fontFamily: 'Roboto', fontSize: 10, color: '#64748b' }}>Aadhaar ID: Verified</Text>
                </View>

                <View style={{ height: 1, backgroundColor: '#f1f5f9' }} />

                <View>
                  <Text style={{ fontFamily: 'Roboto', fontSize: 9, fontWeight: '800', color: '#64748b', textTransform: 'uppercase', marginBottom: 2 }}>{t('volunteer_scribe')}</Text>
                  <Text style={{ fontFamily: 'Roboto', fontSize: 12, color: '#0f172a', fontWeight: '800' }}>{selectedExam?.scribeProfile?.full_name}</Text>
                  <Text style={{ fontFamily: 'Roboto', fontSize: 10, color: '#64748b', marginTop: 1 }}>Occupation: {selectedExam?.scribeProfile?.occupation || 'Student Volunteer Scribe'}</Text>
                  <Text style={{ fontFamily: 'Roboto', fontSize: 10, color: '#64748b' }}>Education: {selectedExam?.scribeProfile?.education_level || 'Undergraduate'}</Text>
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
                  {callExam?.scribeProfile?.full_name?.charAt(0)?.toUpperCase() ?? 'S'}
                </Text>
              </View>
              <View>
                <Text style={{ fontFamily: 'Roboto', fontSize: 17, fontWeight: '900', color: '#0f172a' }}>
                  {callExam?.scribeProfile?.full_name ?? 'લખિયો'}
                </Text>
                <View style={{
                  marginTop: 4, backgroundColor: 'rgba(5,150,105,0.09)',
                  borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3,
                  alignSelf: 'flex-start', borderWidth: 1, borderColor: 'rgba(5,150,105,0.22)',
                }}>
                  <Text style={{ fontFamily: 'Roboto', color: '#059669', fontSize: 10, fontWeight: '800' }}>VOLUNTEER SCRIBE</Text>
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
              વિષય: <Text style={{ fontWeight: '700', color: '#0f172a' }}>{callExam?.subject}</Text> પરીક્ષાના સ્વયંસેવક
            </Text>
          </View>

          {/* Dial Now CTA */}
          <TouchableOpacity
            onPress={() => dialNumber(callExam?.scribeProfile?.phone || '9876543210')}
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
