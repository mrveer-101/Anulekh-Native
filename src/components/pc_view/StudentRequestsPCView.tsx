import React, { useState, useEffect } from 'react';
import { View, Text, Pressable, TextInput, ActivityIndicator, Alert, Modal, ScrollView } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { supabase } from '@/core/supabase';

interface StudentRequestsPCViewProps {
  requests?: any[];
  onRefresh?: () => void;
}

export default function StudentRequestsPCView({
  requests: initialRequests = [],
  onRefresh,
}: StudentRequestsPCViewProps) {
  const [loading, setLoading] = useState(true);
  const [requestsList, setRequestsList] = useState<any[]>([]);

  // Main Filters
  const [categoryFilter, setCategoryFilter] = useState<'all' | 'exam' | 'assignment'>('all');
  const [filterStatus, setFilterStatus] = useState<'all' | 'pending' | 'matched'>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Advanced Filter Modal State
  const [isAdvancedModalOpen, setIsAdvancedModalOpen] = useState(false);
  const [advLanguage, setAdvLanguage] = useState<string>('all');
  const [advEmergencyOnly, setAdvEmergencyOnly] = useState<boolean>(false);
  const [advSortOrder, setAdvSortOrder] = useState<'newest' | 'oldest'>('newest');

  useEffect(() => {
    fetchRequests();
  }, []);

  const fetchRequests = async () => {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      // 1. Fetch Exam Requests
      const { data: examReqs } = await supabase
        .from('exam_requests')
        .select('*')
        .eq('student_id', session.user.id);

      const taggedExams = (examReqs || []).map((r: any) => ({
        ...r,
        request_category: 'exam',
        title: r.subject || 'Exam Request',
        location: r.exam_center_address || r.exam_venue || 'Center N/A',
        dateStr: r.exam_date || 'Date N/A',
      }));

      // 2. Fetch Assignment Requests
      const { data: assignReqs } = await supabase
        .from('assignment_requests')
        .select('*')
        .eq('student_id', session.user.id);

      const taggedAssignments = (assignReqs || []).map((r: any) => ({
        ...r,
        request_category: 'assignment',
        title: r.subject || r.title || 'Assignment Request',
        location: r.pickup_address || r.city || 'Location N/A',
        dateStr: r.submission_deadline || r.due_date || 'Deadline N/A',
      }));

      // Combine & sort
      const combined = [...taggedExams, ...taggedAssignments];
      combined.sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());

      setRequestsList(combined);
    } catch (err: any) {
      console.log('Error fetching requests:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteRequest = (item: any) => {
    const isExam = item.request_category === 'exam';
    const table = isExam ? 'exam_requests' : 'assignment_requests';

    Alert.alert(
      'Delete Request',
      `Are you sure you want to delete this ${isExam ? 'exam' : 'assignment'} request?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              const { error } = await supabase.from(table).delete().eq('id', item.id);
              if (error) throw error;
              fetchRequests();
              if (onRefresh) onRefresh();
            } catch (err: any) {
              Alert.alert('Error', err.message || 'Failed to delete request.');
            }
          },
        },
      ]
    );
  };

  const hasActiveAdvancedFilters = advLanguage !== 'all' || advEmergencyOnly || advSortOrder !== 'newest';

  const resetAdvancedFilters = () => {
    setAdvLanguage('all');
    setAdvEmergencyOnly(false);
    setAdvSortOrder('newest');
  };

  // Filter & Sort Logic
  const filteredRequests = requestsList.filter((item) => {
    // Category filter
    if (categoryFilter !== 'all' && item.request_category !== categoryFilter) return false;

    // Status filter
    if (filterStatus !== 'all' && item.status !== filterStatus) return false;

    // Emergency filter
    if (advEmergencyOnly && item.is_emergency !== 'yes') return false;

    // Language filter
    if (advLanguage !== 'all') {
      const itemLang = (item.language || item.exam_language || '').toLowerCase();
      if (!itemLang.includes(advLanguage.toLowerCase())) return false;
    }

    // Search query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const title = (item.title || '').toLowerCase();
      const loc = (item.location || '').toLowerCase();
      return title.includes(q) || loc.includes(q);
    }

    return true;
  });

  // Apply sorting
  if (advSortOrder === 'oldest') {
    filteredRequests.sort((a, b) => new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime());
  } else {
    filteredRequests.sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());
  }

  return (
    <View style={{ gap: 24 }}>
      {/* ── TOP CONTROL BAR (Ultra-Glassmorphic) ── */}
      <View style={{
        backgroundColor: 'rgba(255, 255, 255, 0.72)',
        backdropFilter: 'blur(24px) saturate(180%)',
        WebkitBackdropFilter: 'blur(24px) saturate(180%)',
        borderRadius: 24,
        padding: 20,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.85)',
        borderTopColor: 'rgba(255, 255, 255, 0.98)',
        gap: 16,
        boxShadow: '0 12px 36px 0 rgba(37, 99, 235, 0.08), inset 0 1px 2px 0 rgba(255, 255, 255, 0.95)',
      } as any}>
        {/* Category Pills Row + Search + Filter Button */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
          {/* Category Tabs: All, Exams, Assignments */}
          <View style={{
            flexDirection: 'row',
            backgroundColor: '#f1f5f9',
            borderRadius: 14,
            padding: 4,
            borderWidth: 1,
            borderColor: '#e2e8f0',
          }}>
            {(['all', 'exam', 'assignment'] as const).map((cat) => {
              const active = categoryFilter === cat;
              const label = cat === 'all' ? 'All Types' : cat === 'exam' ? '🎓 Exams' : '📚 Assignments';
              return (
                <Pressable
                  key={cat}
                  onPress={() => setCategoryFilter(cat)}
                  style={({ hovered }: any) => ({
                    paddingHorizontal: 16,
                    paddingVertical: 8,
                    borderRadius: 10,
                    backgroundColor: active ? '#ffffff' : (hovered ? 'rgba(255,255,255,0.6)' : 'transparent'),
                    borderWidth: active ? 1 : 0,
                    borderColor: active ? '#cbd5e1' : 'transparent',
                    cursor: 'pointer' as any,
                    shadowColor: active ? '#000' : 'transparent',
                    shadowOffset: { width: 0, height: 2 },
                    shadowOpacity: active ? 0.05 : 0,
                    shadowRadius: 4,
                  })}
                >
                  <Text style={{
                    fontSize: 13,
                    fontWeight: active ? '800' : '600',
                    color: active ? '#2563eb' : '#64748b',
                  }}>
                    {label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {/* Right Group: Status Pills + Advanced Filter Button */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            {/* Status Pills: All, Pending, Matched */}
            <View style={{ flexDirection: 'row', gap: 6 }}>
              {(['all', 'pending', 'matched'] as const).map((status) => {
                const active = filterStatus === status;
                const label = status === 'all' ? 'All Status' : status === 'pending' ? 'Pending' : 'Matched';
                return (
                  <Pressable
                    key={status}
                    onPress={() => setFilterStatus(status)}
                    style={({ hovered }: any) => ({
                      paddingHorizontal: 14,
                      paddingVertical: 8,
                      borderRadius: 12,
                      backgroundColor: active ? '#2563eb' : (hovered ? 'rgba(37,99,235,0.08)' : '#f8fafc'),
                      borderWidth: 1,
                      borderColor: active ? '#2563eb' : '#e2e8f0',
                      cursor: 'pointer' as any,
                    })}
                  >
                    <Text style={{
                      fontSize: 12,
                      fontWeight: active ? '800' : '600',
                      color: active ? '#ffffff' : '#475569',
                    }}>
                      {label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {/* Advanced Filter Modal Toggle Button */}
            <Pressable
              onPress={() => setIsAdvancedModalOpen(true)}
              style={({ hovered }: any) => ({
                flexDirection: 'row',
                alignItems: 'center',
                gap: 8,
                backgroundColor: hasActiveAdvancedFilters ? 'rgba(37,99,235,0.1)' : (hovered ? '#e2e8f0' : '#f1f5f9'),
                borderWidth: 1,
                borderColor: hasActiveAdvancedFilters ? 'rgba(37,99,235,0.3)' : '#cbd5e1',
                paddingHorizontal: 14,
                paddingVertical: 8,
                borderRadius: 12,
                cursor: 'pointer' as any,
              })}
            >
              <Feather name="sliders" size={15} color={hasActiveAdvancedFilters ? '#2563eb' : '#475569'} />
              <Text style={{ fontSize: 13, fontWeight: '700', color: hasActiveAdvancedFilters ? '#2563eb' : '#475569' }}>
                Filters
              </Text>
              {hasActiveAdvancedFilters && (
                <View style={{ width: 7, height: 7, borderRadius: 3.5, backgroundColor: '#2563eb' }} />
              )}
            </Pressable>
          </View>
        </View>

        {/* Live Search Input Row */}
        <View style={{
          flexDirection: 'row',
          alignItems: 'center',
          backgroundColor: '#f8fafc',
          borderWidth: 1,
          borderColor: '#cbd5e1',
          borderRadius: 14,
          paddingHorizontal: 14,
        }}>
          <Feather name="search" size={16} color="#94a3b8" style={{ marginRight: 10 }} />
          <TextInput
            style={{ flex: 1, color: '#0f172a', fontSize: 14, paddingVertical: 10, fontFamily: 'Roboto' }}
            placeholder="Search by subject, title, or exam center location..."
            placeholderTextColor="#94a3b8"
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery ? (
            <Pressable onPress={() => setSearchQuery('')} style={{ padding: 4 }}>
              <Feather name="x" size={15} color="#94a3b8" />
            </Pressable>
          ) : null}
        </View>
      </View>

      {/* ── REQUESTS DATA GRID ── */}
      {loading ? (
        <View style={{ paddingVertical: 50, alignItems: 'center' }}>
          <ActivityIndicator size="large" color="#2563eb" />
        </View>
      ) : filteredRequests.length === 0 ? (
        <View style={{
          backgroundColor: '#ffffff', borderRadius: 20, padding: 40,
          alignItems: 'center', justifyContent: 'center',
          borderWidth: 1, borderColor: '#e2e8f0', borderStyle: 'dashed',
        }}>
          <Feather name="file-text" size={32} color="#94a3b8" style={{ marginBottom: 12 }} />
          <Text style={{ fontSize: 16, fontWeight: '800', color: '#0f172a' }}>
            No Requests Found
          </Text>
          <Text style={{ fontSize: 13, color: '#64748b', marginTop: 4 }}>
            Try adjusting your search query, type selection, or status filters.
          </Text>
        </View>
      ) : (
        <View style={{ gap: 14 }}>
          {filteredRequests.map((item) => {
            const isMatched = item.status === 'matched';
            const isExam = item.request_category === 'exam';

            return (
              <View
                key={`${item.request_category}-${item.id}`}
                style={{
                  backgroundColor: '#ffffff',
                  borderRadius: 18,
                  borderWidth: 1,
                  borderColor: item.is_emergency === 'yes' ? 'rgba(239,68,68,0.3)' : '#e2e8f0',
                  padding: 20,
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  shadowColor: '#0f172a',
                  shadowOffset: { width: 0, height: 2 },
                  shadowOpacity: 0.03,
                  shadowRadius: 8,
                  elevation: 2,
                }}
              >
                {/* Request Main Info */}
                <View style={{ flex: 1, gap: 8 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                    {/* Category Badge */}
                    <View style={{
                      backgroundColor: isExam ? 'rgba(37,99,235,0.08)' : 'rgba(147,51,234,0.08)',
                      borderWidth: 1,
                      borderColor: isExam ? 'rgba(37,99,235,0.22)' : 'rgba(147,51,234,0.22)',
                      paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6,
                    }}>
                      <Text style={{ fontSize: 10, fontWeight: '800', color: isExam ? '#2563eb' : '#9333ea', textTransform: 'uppercase' }}>
                        {isExam ? '🎓 EXAM' : '📚 ASSIGNMENT'}
                      </Text>
                    </View>

                    <Text style={{ fontSize: 18, fontWeight: '800', color: '#0f172a' }}>
                      {item.title}
                    </Text>

                    {/* Emergency Badge */}
                    {item.is_emergency === 'yes' && (
                      <View style={{
                        backgroundColor: 'rgba(239,68,68,0.1)',
                        borderWidth: 1, borderColor: 'rgba(239,68,68,0.3)',
                        paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6,
                      }}>
                        <Text style={{ fontSize: 10, fontWeight: '800', color: '#ef4444' }}>🚨 EMERGENCY SOS</Text>
                      </View>
                    )}

                    {/* Status Badge */}
                    <View style={{
                      backgroundColor: isMatched ? 'rgba(22,163,74,0.1)' : 'rgba(234,88,12,0.1)',
                      borderWidth: 1,
                      borderColor: isMatched ? 'rgba(22,163,74,0.25)' : 'rgba(234,88,12,0.25)',
                      paddingHorizontal: 10, paddingVertical: 3, borderRadius: 8,
                    }}>
                      <Text style={{
                        fontSize: 11, fontWeight: '800',
                        color: isMatched ? '#16a34a' : '#ea580c',
                        textTransform: 'uppercase',
                      }}>
                        {isMatched ? 'MATCHED' : 'SEARCHING SCRIBE'}
                      </Text>
                    </View>
                  </View>

                  <View style={{ flexDirection: 'row', gap: 20, flexWrap: 'wrap' }}>
                    <Text style={{ fontSize: 13, color: '#64748b' }}>
                      📅 <Text style={{ fontWeight: '700', color: '#334155' }}>{item.dateStr}</Text>
                    </Text>
                    <Text style={{ fontSize: 13, color: '#64748b' }}>
                      📍 <Text style={{ fontWeight: '700', color: '#334155' }}>{item.location}</Text>
                    </Text>
                    {item.language && (
                      <Text style={{ fontSize: 13, color: '#64748b' }}>
                        🌐 <Text style={{ fontWeight: '700', color: '#334155' }}>Language: {item.language}</Text>
                      </Text>
                    )}
                  </View>
                </View>

                {/* PC Action Buttons */}
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <Pressable
                    onPress={() => router.push(`/console/student/view_applications?request_id=${item.id}`)}
                    style={({ hovered }: any) => ({
                      flexDirection: 'row', alignItems: 'center', gap: 6,
                      backgroundColor: hovered ? 'rgba(37,99,235,0.15)' : 'rgba(37,99,235,0.08)',
                      borderWidth: 1, borderColor: 'rgba(37,99,235,0.22)',
                      paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10,
                      cursor: 'pointer' as any,
                    })}
                  >
                    <Feather name="users" size={14} color="#2563eb" />
                    <Text style={{ fontSize: 12, fontWeight: '800', color: '#2563eb' }}>Applications</Text>
                  </Pressable>

                  <Pressable
                    onPress={() => handleDeleteRequest(item)}
                    style={({ hovered }: any) => ({
                      width: 36, height: 36, borderRadius: 10,
                      backgroundColor: hovered ? 'rgba(239,68,68,0.2)' : 'rgba(239,68,68,0.08)',
                      borderWidth: 1, borderColor: 'rgba(239,68,68,0.22)',
                      alignItems: 'center', justifyContent: 'center',
                      cursor: 'pointer' as any,
                    })}
                  >
                    <Feather name="trash-2" size={15} color="#ef4444" />
                  </Pressable>
                </View>
              </View>
            );
          })}
        </View>
      )}

      {/* ── ADVANCED FILTERS MODAL ── */}
      <Modal
        visible={isAdvancedModalOpen}
        animationType="fade"
        transparent={true}
        onRequestClose={() => setIsAdvancedModalOpen(false)}
      >
        <View style={{
          flex: 1,
          backgroundColor: 'rgba(15, 23, 42, 0.4)',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 24,
        }}>
          <ScrollView
            style={{
              backgroundColor: '#ffffff',
              borderRadius: 24,
              width: '100%',
              maxWidth: 520,
              maxHeight: '85vh' as any,
              borderWidth: 1,
              borderColor: '#e2e8f0',
              shadowColor: '#0f172a',
              shadowOffset: { width: 0, height: 12 },
              shadowOpacity: 0.2,
              shadowRadius: 24,
              elevation: 10,
            }}
            contentContainerStyle={{
              padding: 28,
              gap: 20,
            }}
            showsVerticalScrollIndicator={true}
          >
            {/* Modal Header */}
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <View style={{
                  width: 38, height: 38, borderRadius: 12,
                  backgroundColor: 'rgba(37,99,235,0.1)', alignItems: 'center', justifyContent: 'center',
                }}>
                  <Feather name="sliders" size={18} color="#2563eb" />
                </View>
                <Text style={{ fontSize: 18, fontWeight: '900', color: '#0f172a' }}>Advanced Filters</Text>
              </View>

              <Pressable onPress={() => setIsAdvancedModalOpen(false)} style={{ padding: 4 }}>
                <Feather name="x" size={20} color="#64748b" />
              </Pressable>
            </View>

            {/* Filter Section 1: Language */}
            <View style={{ gap: 8 }}>
              <Text style={{ fontSize: 12, fontWeight: '800', color: '#475569', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                Preferred Language
              </Text>
              <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                {[
                  { id: 'all', label: 'All Languages' },
                  { id: 'english', label: 'English' },
                  { id: 'gujarati', label: 'Gujarati' },
                  { id: 'hindi', label: 'Hindi' },
                ].map((lang) => {
                  const active = advLanguage === lang.id;
                  return (
                    <Pressable
                      key={lang.id}
                      onPress={() => setAdvLanguage(lang.id)}
                      style={({ hovered }: any) => ({
                        paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10,
                        backgroundColor: active ? '#2563eb' : (hovered ? '#e2e8f0' : '#f1f5f9'),
                        borderWidth: 1, borderColor: active ? '#2563eb' : '#cbd5e1',
                        cursor: 'pointer' as any,
                      })}
                    >
                      <Text style={{ fontSize: 12, fontWeight: active ? '800' : '600', color: active ? '#ffffff' : '#334155' }}>
                        {lang.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            {/* Filter Section 2: Sort Order */}
            <View style={{ gap: 8 }}>
              <Text style={{ fontSize: 12, fontWeight: '800', color: '#475569', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                Sort Order
              </Text>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <Pressable
                  onPress={() => setAdvSortOrder('newest')}
                  style={{
                    flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: 'center',
                    backgroundColor: advSortOrder === 'newest' ? '#2563eb' : '#f1f5f9',
                    borderWidth: 1, borderColor: advSortOrder === 'newest' ? '#2563eb' : '#cbd5e1',
                  }}
                >
                  <Text style={{ fontSize: 12, fontWeight: '800', color: advSortOrder === 'newest' ? '#ffffff' : '#334155' }}>
                    Newest First
                  </Text>
                </Pressable>

                <Pressable
                  onPress={() => setAdvSortOrder('oldest')}
                  style={{
                    flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: 'center',
                    backgroundColor: advSortOrder === 'oldest' ? '#2563eb' : '#f1f5f9',
                    borderWidth: 1, borderColor: advSortOrder === 'oldest' ? '#2563eb' : '#cbd5e1',
                  }}
                >
                  <Text style={{ fontSize: 12, fontWeight: '800', color: advSortOrder === 'oldest' ? '#ffffff' : '#334155' }}>
                    Oldest First
                  </Text>
                </Pressable>
              </View>
            </View>

            {/* Filter Section 3: Emergency Flag Toggle */}
            <Pressable
              onPress={() => setAdvEmergencyOnly(!advEmergencyOnly)}
              style={{
                flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                backgroundColor: '#f8fafc', borderWidth: 1, borderColor: '#e2e8f0',
                borderRadius: 14, padding: 14, cursor: 'pointer' as any,
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <Feather name="alert-triangle" size={18} color="#ef4444" />
                <View>
                  <Text style={{ fontSize: 13, fontWeight: '800', color: '#0f172a' }}>Emergency SOS Only</Text>
                  <Text style={{ fontSize: 11, color: '#64748b' }}>Only show high-priority SOS requests</Text>
                </View>
              </View>

              <View style={{
                width: 20, height: 20, borderRadius: 6,
                backgroundColor: advEmergencyOnly ? '#ef4444' : '#ffffff',
                borderWidth: 1.5, borderColor: advEmergencyOnly ? '#ef4444' : '#cbd5e1',
                alignItems: 'center', justifyContent: 'center',
              }}>
                {advEmergencyOnly && <Feather name="check" size={14} color="#ffffff" />}
              </View>
            </Pressable>

            {/* Modal Actions */}
            <View style={{ flexDirection: 'row', gap: 12, marginTop: 8 }}>
              <Pressable
                onPress={resetAdvancedFilters}
                style={({ hovered }: any) => ({
                  flex: 1, paddingVertical: 12, borderRadius: 12, alignItems: 'center',
                  backgroundColor: hovered ? '#e2e8f0' : '#f1f5f9',
                  borderWidth: 1, borderColor: '#cbd5e1',
                  cursor: 'pointer' as any,
                })}
              >
                <Text style={{ fontSize: 13, fontWeight: '700', color: '#475569' }}>Reset All</Text>
              </Pressable>

              <Pressable
                onPress={() => setIsAdvancedModalOpen(false)}
                style={({ hovered }: any) => ({
                  flex: 2, paddingVertical: 12, borderRadius: 12, alignItems: 'center',
                  backgroundColor: hovered ? '#1d4ed8' : '#2563eb',
                  cursor: 'pointer' as any,
                })}
              >
                <Text style={{ fontSize: 13, fontWeight: '800', color: '#ffffff' }}>Apply Filters</Text>
              </Pressable>
            </View>
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}
