import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { supabase } from '../app/core/supabase';
import { useLanguage } from '../app/core/translation';

const getFirstName = (fullName: string | null | undefined, defaultVal: string) => {
  if (!fullName) return defaultVal;
  const first = fullName.trim().split(/\s+/)[0];
  if (!first) return defaultVal;
  return first.charAt(0).toUpperCase() + first.slice(1);
};

export default function ScribeHomeView() {
  const { t } = useLanguage();
  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [availableExams, setAvailableExams] = useState<any[]>([]);
  const [scribeCommitments, setScribeCommitments] = useState<any[]>([]);
  const [pendingApplicationsCount, setPendingApplicationsCount] = useState(0);

  useEffect(() => {
    fetchSession();
  }, []);

  const fetchSession = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      setUser(session.user);

      // 1. Fetch Profile
      const { data: profileData } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', session.user.id)
        .single();

      setProfile(profileData);

      // 2. Fetch Available Exams (where status is pending)
      const { data: available } = await supabase
        .from('exam_requests')
        .select('*')
        .eq('status', 'pending')
        .order('created_at', { ascending: false });

      setAvailableExams(available || []);

      // 3. Fetch Scribe's Confirmed Commitments
      const { data: committed } = await supabase
        .from('exam_requests')
        .select('*')
        .eq('status', 'matched')
        .eq('scribe_id', session.user.id)
        .order('created_at', { ascending: false });

      setScribeCommitments(committed || []);

      // 4. Fetch Scribe's Pending Applications Count
      const { data: apps } = await supabase
        .from('scribe_applications')
        .select('id')
        .eq('scribe_id', session.user.id)
        .eq('status', 'pending');
      
      setPendingApplicationsCount(apps ? apps.length : 0);

    } catch (err: any) {
      console.log('Error fetching volunteer session:', err.message);
    } finally {
      setLoading(false);
    }
  };

  const simulateAdminApproval = async () => {
    setLoading(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ verification_status: 'approved' })
        .eq('id', user.id);

      if (error) throw error;

      Alert.alert(t('success'), 'તમારી પ્રોફાઇલ સફળતાપૂર્વક મંજૂર થઈ ગઈ છે! હવે તમે પરીક્ષા સ્વીકારી શકો છો.');
      await fetchSession();
    } catch (err: any) {
      Alert.alert(t('error'), err.message || 'મંજૂર કરવામાં નિષ્ફળતા.');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 10, backgroundColor: '#f8fafc' }}>
        <ActivityIndicator size="large" color="#059669" />
      </View>
    );
  }

  const isVerified = profile?.verification_status === 'approved';
  const isPending = profile?.verification_status === 'pending';
  const isUnverified = !profile?.verification_status || profile.verification_status === 'unverified';

  return (
    <ScrollView style={{ flex: 1, paddingHorizontal: 24, paddingVertical: 12 }} contentContainerStyle={{ paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
      {/* Welcome Section */}
      <View style={{ marginBottom: 16 }}>
        <Text style={{ fontFamily: 'Roboto', fontSize: 11, fontWeight: '800', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 1.5 }}>
          {t('welcome_scribe_portal')}
        </Text>
        <Text style={{ fontFamily: 'Roboto', fontSize: 24, fontWeight: '900', color: '#0f172a', marginTop: 4, letterSpacing: -0.5 }}>
          {t('hello_user', { name: getFirstName(profile?.full_name, 'Scribe') })}
        </Text>
      </View>

      {/* 1. Complete Profile Onboarding Card */}
      {isUnverified && (
        <View style={{ backgroundColor: '#fff', borderWidth: 1, borderColor: '#fef3c7', padding: 20, borderRadius: 24, shadowColor: '#d97706', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.05, shadowRadius: 10, elevation: 2, marginBottom: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <View style={{ flex: 1, paddingRight: 16 }}>
            <Text style={{ fontFamily: 'Roboto', fontSize: 15, fontWeight: '800', color: '#92400e' }}>{t('complete_profile')}</Text>
            <Text style={{ fontFamily: 'Roboto', fontSize: 12, color: '#64748b', marginTop: 4, lineHeight: 18 }}>
              {t('profile_onboarding_desc')}
            </Text>
          </View>
          <TouchableOpacity 
            onPress={() => router.replace('/console/scribe/complete_profile' as any)}
            style={{ backgroundColor: '#d97706', paddingVertical: 10, paddingHorizontal: 16, borderRadius: 12 }}
          >
            <Text style={{ fontFamily: 'Roboto', color: '#fff', fontWeight: '800', fontSize: 12 }}>{t('verify_now')}</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* 2. Verification Pending Card with Simulation Tool */}
      {isPending && (
        <View style={{ backgroundColor: '#fff', borderWidth: 1, borderColor: '#dbeafe', padding: 20, borderRadius: 24, shadowColor: '#2563eb', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.05, shadowRadius: 10, elevation: 2, marginBottom: 20 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8, gap: 8 }}>
            <Feather name="clock" size={18} color="#2563eb" />
            <Text style={{ fontFamily: 'Roboto', fontSize: 15, fontWeight: '800', color: '#1e40af' }}>{t('verification_pending')}</Text>
          </View>
          <Text style={{ fontFamily: 'Roboto', fontSize: 12, color: '#64748b', marginBottom: 14, lineHeight: 18 }}>
            {t('verification_pending_desc')}
          </Text>
          <TouchableOpacity 
            onPress={simulateAdminApproval}
            style={{ width: '100%', backgroundColor: '#2563eb', paddingVertical: 12, borderRadius: 12, alignItems: 'center', justifyContent: 'center' }}
          >
            <Text style={{ fontFamily: 'Roboto', color: '#fff', fontWeight: '800', fontSize: 12 }}>{t('auto_approve')}</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* 3. Verified Badge */}
      {isVerified && (
        <View style={{ backgroundColor: 'rgba(5,150,105,0.08)', borderWidth: 1, borderColor: 'rgba(5,150,105,0.18)', paddingVertical: 10, paddingHorizontal: 16, borderRadius: 14, flexDirection: 'row', alignItems: 'center', marginBottom: 20, gap: 8 }}>
          <Feather name="check-circle" size={16} color="#059669" />
          <Text style={{ fontFamily: 'Roboto', color: '#047857', fontSize: 12, fontWeight: '800' }}>{t('verified_scribe_profile')}</Text>
        </View>
      )}

      {/* Scribe Stats Summary */}
      <View style={{ backgroundColor: '#fff', padding: 16, borderRadius: 24, borderWidth: 1, borderColor: 'rgba(0,0,0,0.05)', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.04, shadowRadius: 10, elevation: 2, flexDirection: 'row', justifyContent: 'space-around', marginBottom: 20 }}>
        <View style={{ alignItems: 'center', flex: 1 }}>
          <Text style={{ fontFamily: 'Roboto', fontSize: 20, fontWeight: '900', color: '#0f172a' }}>{scribeCommitments.length}</Text>
          <Text style={{ fontFamily: 'Roboto', color: '#64748b', fontSize: 10, fontWeight: '800', marginTop: 2 }}>{t('commitments')}</Text>
        </View>
        <View style={{ width: 1, height: 32, backgroundColor: '#f1f5f9' }} />
        <View style={{ alignItems: 'center', flex: 1 }}>
          <Text style={{ fontFamily: 'Roboto', fontSize: 20, fontWeight: '900', color: '#0f172a' }}>{pendingApplicationsCount}</Text>
          <Text style={{ fontFamily: 'Roboto', color: '#64748b', fontSize: 10, fontWeight: '800', marginTop: 2 }}>{t('applications')}</Text>
        </View>
        <View style={{ width: 1, height: 32, backgroundColor: '#f1f5f9' }} />
        <View style={{ alignItems: 'center', flex: 1 }}>
          <Text style={{ fontFamily: 'Roboto', fontSize: 20, fontWeight: '900', color: '#0f172a' }}>{availableExams.length}</Text>
          <Text style={{ fontFamily: 'Roboto', color: '#64748b', fontSize: 10, fontWeight: '800', marginTop: 2 }}>{t('available')}</Text>
        </View>
      </View>

      {/* Available Opportunities List */}
      <View>
        <Text style={{ fontFamily: 'Roboto', color: '#475569', fontWeight: '800', fontSize: 14, marginBottom: 12 }}>{t('available_opportunities')}</Text>

        {availableExams.length === 0 ? (
          <View style={{ backgroundColor: '#fff', padding: 24, borderRadius: 24, borderWidth: 1, borderColor: 'rgba(0,0,0,0.05)', alignItems: 'center', justifyContent: 'center' }}>
            <Feather name="inbox" size={28} color="#94a3b8" />
            <Text style={{ fontFamily: 'Roboto', color: '#94a3b8', fontSize: 12, marginTop: 8, textAlign: 'center' }}>{t('no_opportunities_found')}</Text>
          </View>
        ) : (
          availableExams.map((exam) => (
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
              style={{ backgroundColor: '#fff', padding: 16, borderRadius: 28, borderWidth: 1, borderColor: 'rgba(0,0,0,0.06)', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.04, shadowRadius: 10, elevation: 2, marginBottom: 14 }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <View style={{ flex: 1, paddingRight: 8 }}>
                  <Text style={{ fontFamily: 'Roboto', fontSize: 16, fontWeight: '900', color: '#0f172a' }}>{exam.subject || 'Exam'}</Text>
                  <Text style={{ fontFamily: 'Roboto', fontSize: 10, color: '#64748b', marginTop: 1 }}>{t('exam_level')}: {exam.exam_type}</Text>
                </View>
              </View>

              <View style={{ borderTopWidth: 1, borderTopColor: '#f8fafc', paddingTop: 10, marginBottom: 12, gap: 6 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Feather name="user" size={12} color="#64748b" style={{ marginRight: 8 }} />
                  <Text style={{ fontFamily: 'Roboto', color: '#475569', fontSize: 12 }}>
                    {t('candidate_student')}: {exam.student_name} ({exam.education_grade})
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

              <View style={{ width: '105%', marginLeft: '-2.5%', backgroundColor: 'rgba(5,150,105,0.08)', paddingVertical: 10, borderRadius: 16, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6 }}>
                <Feather name="file-text" size={12} color="#059669" />
                <Text style={{ fontFamily: 'Roboto', color: '#047857', fontWeight: '800', fontSize: 12 }}>{t('view_details_apply')}</Text>
              </View>
            </TouchableOpacity>
          ))
        )}
      </View>

      {/* Need Help? Contact Support Card */}
      <TouchableOpacity 
        onPress={() => router.push('/console/common/support' as any)}
        style={{
          backgroundColor: '#fff',
          borderWidth: 1,
          borderColor: '#e2e8f0',
          padding: 20,
          borderRadius: 24,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.03,
          shadowRadius: 10,
          elevation: 1.5,
          marginTop: 10,
          marginBottom: 20,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}
      >
        <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 14 }}>
          <View style={{
            width: 44,
            height: 44,
            borderRadius: 14,
            backgroundColor: '#ecfdf5',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <Feather name="life-buoy" size={20} color="#059669" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontFamily: 'Roboto', fontSize: 15, fontWeight: '800', color: '#0f172a' }}>
              Need Help?
            </Text>
            <Text style={{ fontFamily: 'Roboto', fontSize: 12, color: '#64748b', marginTop: 2 }}>
              Contact support to resolve application or profile issues
            </Text>
          </View>
        </View>
        <Feather name="chevron-right" size={18} color="#64748b" />
      </TouchableOpacity>

    </ScrollView>
  );
}
