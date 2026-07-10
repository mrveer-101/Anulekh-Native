import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, ActivityIndicator, RefreshControl, TouchableOpacity, TextInput, Alert } from 'react-native';
import { Feather, Ionicons } from '@expo/vector-icons';
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
}

export default function ScribeExploreView() {
  const { t } = useLanguage();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [availableExams, setAvailableExams] = useState<ExamRequest[]>([]);
  const [scribeProfile, setScribeProfile] = useState<any>(null);
  
  // Search & Filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedLanguage, setSelectedLanguage] = useState('All');
  const [selectedType, setSelectedType] = useState('All');

  useEffect(() => {
    fetchSession();
  }, []);

  const fetchSession = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      // 1. Fetch Scribe Profile to check location
      const { data: profile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', session.user.id)
        .single();
      setScribeProfile(profile);

      // 2. Fetch Available Exams
      const { data, error } = await supabase
        .from('exam_requests')
        .select('*')
        .eq('status', 'pending')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setAvailableExams(data || []);
    } catch (error: any) {
      console.error('Error fetching scribe explore data:', error.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    fetchSession();
  };

  const isVerified = scribeProfile?.verification_status === 'approved';

  // Apply search query and filters
  const filteredExams = availableExams.filter(exam => {
    const matchesSearch = 
      (exam.subject || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (exam.exam_venue || '').toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesLanguage = selectedLanguage === 'All' || exam.exam_language === selectedLanguage;
    const matchesType = selectedType === 'All' || exam.exam_type === selectedType;

    return matchesSearch && matchesLanguage && matchesType;
  });

  // Segment by location (Nearby vs All Other)
  const scribeLocation = (scribeProfile?.location || '').trim().toLowerCase();
  
  const nearbyExams = filteredExams.filter(exam => {
    if (!scribeLocation) return false;
    const venue = (exam.exam_venue || '').toLowerCase();
    return venue.includes(scribeLocation);
  });

  const otherExams = filteredExams.filter(exam => {
    if (!scribeLocation) return true;
    const venue = (exam.exam_venue || '').toLowerCase();
    return !venue.includes(scribeLocation);
  });

  const renderExamCard = (exam: ExamRequest) => {
    return (
      <TouchableOpacity 
        key={exam.id} 
        onPress={() => {
          if (isVerified) {
            router.push(`/console/scribe/apply?id=${exam.id}` as any);
          } else {
            Alert.alert(t('error'), 'અરજી કરવા માટે કૃપા કરીને પહેલા તમારી ચકાસણી પૂર્ણ કરો.');
          }
        }}
        activeOpacity={0.9}
        style={{ 
          backgroundColor: '#fff', 
          padding: 18, 
          borderRadius: 24, 
          borderWidth: 1, 
          borderColor: 'rgba(0,0,0,0.06)', 
          shadowColor: '#000', 
          shadowOffset: { width: 0, height: 4 }, 
          shadowOpacity: 0.03, 
          shadowRadius: 10, 
          elevation: 2, 
          marginBottom: 12 
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <View style={{ flex: 1, paddingRight: 8 }}>
            <Text style={{ fontFamily: 'Roboto', fontSize: 15, fontWeight: '900', color: '#0f172a' }}>{exam.subject}</Text>
            <Text style={{ fontFamily: 'Roboto', fontSize: 10, color: '#64748b', marginTop: 1 }}>{t('exam_level')}: {exam.exam_type}</Text>
          </View>
          <View style={{ paddingVertical: 4, paddingHorizontal: 10, borderRadius: 20, backgroundColor: 'rgba(22,163,74,0.08)', borderWidth: 1, borderColor: 'rgba(22,163,74,0.2)' }}>
            <Text style={{ fontFamily: 'Roboto', fontSize: 9, fontWeight: '800', color: '#16a34a' }}>PENDING</Text>
          </View>
        </View>

        <View style={{ borderTopWidth: 1, borderTopColor: '#f1f5f9', paddingTop: 10, marginBottom: 4, gap: 6 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Feather name="user" size={12} color="#64748b" style={{ marginRight: 8 }} />
            <Text style={{ fontFamily: 'Roboto', color: '#475569', fontSize: 12 }}>
              {t('candidate_student')}: <Text style={{ fontWeight: '700', color: '#0f172a' }}>{exam.student_name} ({exam.education_grade})</Text>
            </Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Feather name="calendar" size={12} color="#64748b" style={{ marginRight: 8 }} />
            <Text style={{ fontFamily: 'Roboto', color: '#475569', fontSize: 12 }}>
              {t('exam_date')}: {exam.exam_date}
            </Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Feather name="map-pin" size={12} color="#64748b" style={{ marginRight: 8 }} />
            <Text style={{ fontFamily: 'Roboto', color: '#475569', fontSize: 12 }} numberOfLines={1}>
              {t('exam_venue')}: {exam.exam_venue}
            </Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Feather name="globe" size={12} color="#64748b" style={{ marginRight: 8 }} />
            <Text style={{ fontFamily: 'Roboto', color: '#475569', fontSize: 12 }}>
              {t('exam_language')}: {exam.exam_language}
            </Text>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f0fdf4' }}>
        <ActivityIndicator size="large" color="#16a34a" />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#f0fdf4' }}>
      
      {/* Search Header Bar */}
      <View style={{ paddingHorizontal: 24, paddingTop: 16, pb: 10, gap: 10 }}>
        
        {/* Search Input */}
        <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 16, borderWidth: 1.5, borderColor: 'rgba(0,0,0,0.06)', paddingHorizontal: 12, height: 46 }}>
          <Feather name="search" size={16} color="#94a3b8" style={{ marginRight: 8 }} />
          <TextInput
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Search subject or venue..."
            placeholderTextColor="#94a3b8"
            style={{ flex: 1, fontSize: 13, color: '#0f172a', fontWeight: '600' }}
          />
          {searchQuery ? (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <Feather name="x" size={16} color="#94a3b8" />
            </TouchableOpacity>
          ) : null}
        </View>

        {/* Filter Selection Chips */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 4 }}>
          {/* Language filter */}
          <View style={{ flexDirection: 'row', gap: 6, borderRightWidth: 1, borderRightColor: 'rgba(0,0,0,0.08)', paddingRight: 8 }}>
            {['All', 'English', 'Hindi', 'Gujarati'].map(lang => (
              <TouchableOpacity
                key={lang}
                onPress={() => setSelectedLanguage(lang)}
                style={{
                  paddingHorizontal: 10,
                  paddingVertical: 5,
                  borderRadius: 10,
                  backgroundColor: selectedLanguage === lang ? '#16a34a' : '#fff',
                  borderWidth: 1,
                  borderColor: selectedLanguage === lang ? '#16a34a' : 'rgba(0,0,0,0.05)',
                }}
              >
                <Text style={{ fontSize: 10, fontWeight: '700', color: selectedLanguage === lang ? '#fff' : '#64748b' }}>
                  {lang}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Exam Type filter */}
          <View style={{ flexDirection: 'row', gap: 6 }}>
            {['All', 'School', 'College', 'Competitive'].map(type => (
              <TouchableOpacity
                key={type}
                onPress={() => setSelectedType(type)}
                style={{
                  paddingHorizontal: 10,
                  paddingVertical: 5,
                  borderRadius: 10,
                  backgroundColor: selectedType === type ? '#16a34a' : '#fff',
                  borderWidth: 1,
                  borderColor: selectedType === type ? '#16a34a' : 'rgba(0,0,0,0.05)',
                }}
              >
                <Text style={{ fontSize: 10, fontWeight: '700', color: selectedType === type ? '#fff' : '#64748b' }}>
                  {type}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>
      </View>

      {/* Main Oppurtunities List */}
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 10, paddingBottom: 40 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#16a34a']} />
        }
      >
        
        {/* Nearby Opportunities Segment */}
        {scribeLocation && nearbyExams.length > 0 && (
          <View style={{ marginBottom: 18 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 }}>
              <Ionicons name="location" size={15} color="#16a34a" />
              <Text style={{ fontFamily: 'Roboto', color: '#16a34a', fontWeight: '950', fontSize: 13, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                Opportunities Near You ({scribeProfile?.location})
              </Text>
            </View>
            {nearbyExams.map(renderExamCard)}
          </View>
        )}

        {/* Other / General Opportunities Segment */}
        <View>
          <Text style={{ fontFamily: 'Roboto', color: '#475569', fontWeight: '800', fontSize: 13, marginBottom: 10 }}>
            {scribeLocation && nearbyExams.length > 0 ? 'All Other Opportunities' : t('available_opportunities')}
          </Text>
          
          {filteredExams.length === 0 ? (
            <View style={{ backgroundColor: '#fff', padding: 32, borderRadius: 24, borderWidth: 1, borderColor: 'rgba(0,0,0,0.05)', alignItems: 'center', justifyContent: 'center' }}>
              <Feather name="search" size={26} color="#94a3b8" />
              <Text style={{ fontFamily: 'Roboto', fontSize: 15, fontWeight: '900', color: '#0f172a', marginTop: 10 }}>No matching exams</Text>
              <Text style={{ fontFamily: 'Roboto', fontSize: 11, color: '#64748b', marginTop: 4, textAlign: 'center', lineHeight: 16 }}>
                Try adjusting your search query or filter selections.
              </Text>
            </View>
          ) : (
            (scribeLocation && nearbyExams.length > 0 ? otherExams : filteredExams).map(renderExamCard)
          )}
        </View>

      </ScrollView>

    </View>
  );
}
