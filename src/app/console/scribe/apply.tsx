import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, Alert, Modal, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { router, useLocalSearchParams } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { supabase } from '@/app/core/supabase';
import PolicyModal from '@/components/modals/PolicyModal';

export default function ScribeApplyDetailsPage() {
  const params = useLocalSearchParams<{ id: string; type?: string }>();
  const type = params.type || 'exam';
  
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [exam, setExam] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const [hasApplied, setHasApplied] = useState(false);
  const [appStatus, setAppStatus] = useState<string | null>(null);
  const [appId, setAppId] = useState<number | null>(null);
  const [showSuccessOverlay, setShowSuccessOverlay] = useState(false);
  const [selectedAttachment, setSelectedAttachment] = useState<any>(null);
  const [agreedGuidelines, setAgreedGuidelines] = useState(false);
  const [showGuidelinesModal, setShowGuidelinesModal] = useState(false);

  const parsedAttachments = React.useMemo(() => {
    if (!exam || !exam.attachments || !Array.isArray(exam.attachments)) return [];
    return exam.attachments.map((entry: string) => {
      const sepIdx = entry.indexOf('::');
      if (sepIdx === -1) return null;
      const name = entry.substring(0, sepIdx);
      const dataUri = entry.substring(sepIdx + 2);
      const ext = name.split('.').pop()?.toLowerCase() || '';
      const mimeType = ext === 'pdf' ? 'application/pdf' : `image/${ext}`;
      return { uri: dataUri, name, mimeType, dataUri };
    }).filter(Boolean) as any[];
  }, [exam]);

  useEffect(() => {
    fetchExamAndProfile();
  }, [params.id, params.type]);

  const fetchExamAndProfile = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.replace('/auth/login');
        return;
      }

      // 1. Fetch Scribe Profile
      const { data: profileData } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', session.user.id)
        .single();
      
      setProfile(profileData);

      // 2. Fetch Details based on type
      let examData = null;
      if (type === 'assignment') {
        const { data } = await supabase
          .from('assignment_requests')
          .select('*')
          .eq('id', params.id)
          .single();
        examData = data;
      } else {
        const { data } = await supabase
          .from('exam_requests')
          .select('*')
          .eq('id', params.id)
          .single();
        examData = data;
      }
      
      setExam(examData);

      // 3. Check if Scribe has an active application on this request.
      if (examData) {
        const { data: existingApps } = await supabase
          .from('scribe_applications')
          .select('*')
          .eq('request_id', examData.id)
          .eq('scribe_id', session.user.id)
          .eq('type', type);

        const activeApp = (existingApps || []).find((app: any) => app.status !== 'rejected');
        if (activeApp) {
          setHasApplied(true);
          setAppStatus(activeApp.status);
          setAppId(activeApp.id);
        } else {
          setHasApplied(false);
          setAppStatus(null);
          setAppId(null);
        }
      }
    } catch (err) {
      console.error('Error fetching details:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleApply = async () => {
    if (!profile) return;

    if (profile.verification_status !== 'approved') {
      Alert.alert(
        'Verification Required',
        'Your profile must be approved before you can apply. Please complete your profile.'
      );
      return;
    }

    if (!agreedGuidelines) {
      Alert.alert(
        'Policy Agreement Required',
        'Please agree to the Anulekh Scribe Guidelines & Code of Conduct before applying.'
      );
      return;
    }

    setSubmitting(true);

    try {
      // Insert application as 'pending' for manual student approval
      const { error: insertError } = await supabase
        .from('scribe_applications')
        .insert({
          request_id: exam.id,
          scribe_id: profile.id,
          scribe_name: profile.official_name || profile.full_name,
          status: 'pending',
          type: type
        });

      if (insertError) throw insertError;

      // Create notification for the Student to manually review
      await supabase
        .from('notifications')
        .insert({
          user_id: exam.student_id,
          title: type === 'exam' ? 'New Scribe Application' : 'New Writer Application',
          message: type === 'exam'
            ? `${profile.official_name || profile.full_name} has applied to be a scribe for your "${exam.subject || 'Exam'}" exam.`
            : `${profile.official_name || profile.full_name} has applied to write your assignment "${exam.subject || 'Assignment'}".`,
          is_read: 0,
          created_at: new Date().toISOString()
        });

      // Show success overlay and redirect
      setShowSuccessOverlay(true);
      setTimeout(() => {
        setShowSuccessOverlay(false);
        router.replace('/console/scribe');
      }, 3000);

    } catch (err: any) {
      Alert.alert('Application Failed', err.message || 'Failed to submit application.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleAcceptInviteDirect = async () => {
    if (!appId || !exam) return;

    if (!agreedGuidelines) {
      Alert.alert(
        'Policy Agreement Required',
        'Please agree to the Anulekh Scribe Guidelines & Code of Conduct before accepting this invitation.'
      );
      return;
    }

    setSubmitting(true);
    try {
      const { error: appErr } = await supabase
        .from('scribe_applications')
        .update({ status: 'accepted' })
        .eq('id', appId);

      if (appErr) throw appErr;

      const table = type === 'assignment' ? 'assignment_requests' : 'exam_requests';
      const { error: reqErr } = await supabase
        .from(table)
        .update({ status: 'matched', scribe_id: profile.id })
        .eq('id', exam.id);

      if (reqErr) throw reqErr;

      await supabase
        .from('notifications')
        .insert({
          user_id: exam.student_id,
          title: type === 'assignment' ? '📝 Writer Match Confirmed' : '📅 Scribe Match Confirmed',
          message: `${profile.official_name || profile.full_name} accepted your invitation for "${exam.subject || 'Request'}".`,
          is_read: 0,
          created_at: new Date().toISOString()
        });

      Alert.alert('Success', 'You have accepted this invitation.');
      await fetchExamAndProfile();
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to accept invitation.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleRejectInviteDirect = async () => {
    if (!appId || !exam) return;
    setSubmitting(true);
    try {
      const { error: appErr } = await supabase
        .from('scribe_applications')
        .update({ status: 'rejected' })
        .eq('id', appId);

      if (appErr) throw appErr;

      await supabase
        .from('notifications')
        .insert({
          user_id: exam.student_id,
          title: type === 'assignment' ? '📝 Invitation Declined' : '📅 Invitation Declined',
          message: `${profile.official_name || profile.full_name} declined your invitation for "${exam.subject || 'Request'}".`,
          is_read: 0,
          created_at: new Date().toISOString()
        });

      Alert.alert('Declined', 'You have declined this invitation.');
      router.back();
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to decline invitation.');
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <View className="flex-1 bg-white items-center justify-center">
        <ActivityIndicator size="large" color="#059669" />
      </View>
    );
  }

  if (!exam) {
    return (
      <SafeAreaView className="flex-1 bg-slate-50 justify-center items-center p-6">
        <Feather name="alert-circle" size={48} color="#ef4444" />
        <Text className="text-base font-bold text-slate-800 mt-4">
          {type === 'exam' ? 'Exam Request Not Found' : 'Assignment Request Not Found'}
        </Text>
        <TouchableOpacity onPress={() => router.back()} className="mt-4 bg-emerald-500 px-6 py-2.5 rounded-xl shadow-md">
          <Text className="text-white font-bold text-xs">Go Back</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-slate-50">
      <StatusBar style="dark" />
      
      {/* Header */}
      <View className="bg-white px-6 py-4 border-b border-slate-100 flex-row items-center shadow-sm">
        <TouchableOpacity 
          onPress={() => router.back()} 
          className="mr-4 p-2 -ml-2 rounded-lg active:bg-slate-50"
        >
          <Feather name="arrow-left" size={24} color="#334155" />
        </TouchableOpacity>
        <Text className="text-xl font-black text-slate-800">
          {type === 'exam' ? 'Exam Details' : 'Assignment Details'}
        </Text>
      </View>
 
      <ScrollView className="flex-1 px-6 py-3" contentContainerStyle={{ paddingBottom: 20 }}>
        {/* Main Details Card */}
        <View className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm space-y-4 mb-4">
          
          {/* Header & Status */}
          <View className="flex-row items-center justify-between border-b border-slate-50 pb-3">
            <View className="flex-1 pr-2">
              <Text className="text-xl font-black text-slate-850 text-slate-900">{exam.subject || 'Details'}</Text>
              <Text className="text-xs font-semibold text-slate-400 mt-0.5">
                {type === 'exam' ? exam.exam_type : `Level: ${exam.academic_level}`}
              </Text>
            </View>
            <View className={`py-1 px-3 rounded-full border ${
              exam.status === 'matched' ? 'bg-emerald-50 border-emerald-200' : 'bg-amber-50 border-amber-200'
            }`}>
              <Text className={`text-[10px] font-bold uppercase ${
                exam.status === 'matched' ? 'text-emerald-700' : 'text-amber-700'
              }`}>{exam.status}</Text>
            </View>
          </View>
 
          {/* Details Grid */}
          <View className="space-y-3.5">
            {type === 'exam' ? (
              <>
                <View className="flex-row items-start">
                  <Feather name="calendar" size={16} color="#059669" className="mr-3.5 mt-0.5" />
                  <View className="flex-1">
                    <Text className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Date & Time</Text>
                    <Text className="text-sm font-semibold text-slate-700 mt-0.5">{exam.exam_date || 'Date not specified'}</Text>
                  </View>
                </View>
 
                <View className="flex-row items-start">
                  <Feather name="map-pin" size={16} color="#059669" className="mr-3.5 mt-0.5" />
                  <View className="flex-1">
                    <Text className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Exam Venue</Text>
                    <Text className="text-sm font-semibold text-slate-700 mt-0.5">{exam.exam_venue || 'Venue not specified'}</Text>
                  </View>
                </View>
 
                <View className="flex-row items-start">
                  <Feather name="globe" size={16} color="#059669" className="mr-3.5 mt-0.5" />
                  <View className="flex-1">
                    <Text className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Languages Required</Text>
                    <Text className="text-sm font-semibold text-slate-700 mt-0.5">{exam.exam_language}</Text>
                  </View>
                </View>
              </>
            ) : (
              <>
                <View className="flex-row items-start">
                  <Feather name="calendar" size={16} color="#059669" className="mr-3.5 mt-0.5" />
                  <View className="flex-1">
                    <Text className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Deadline</Text>
                    <Text className="text-sm font-semibold text-slate-700 mt-0.5">{exam.deadline}</Text>
                  </View>
                </View>

                <View className="flex-row items-start">
                  <Feather name="file-text" size={16} color="#059669" className="mr-3.5 mt-0.5" />
                  <View className="flex-1">
                    <Text className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Assignment Title</Text>
                    <Text className="text-sm font-semibold text-slate-700 mt-0.5">{exam.assignment_title}</Text>
                  </View>
                </View>

                {exam.page_count ? (
                  <View className="flex-row items-start">
                    <Feather name="layers" size={16} color="#059669" className="mr-3.5 mt-0.5" />
                    <View className="flex-1">
                      <Text className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Page Count Estimate</Text>
                      <Text className="text-sm font-semibold text-slate-700 mt-0.5">{exam.page_count} {parseInt(exam.page_count) === 1 ? 'Page' : 'Pages'}</Text>
                    </View>
                  </View>
                ) : null}

                {exam.description ? (
                  <View className="flex-row items-start">
                    <Feather name="info" size={16} color="#059669" className="mr-3.5 mt-0.5" />
                    <View className="flex-1">
                      <Text className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Instructions</Text>
                      <Text className="text-sm font-semibold text-slate-700 mt-0.5">{exam.description}</Text>
                    </View>
                  </View>
                ) : null}
              </>
            )}
 
            <View className="flex-row items-start">
              <Feather name="user" size={16} color="#059669" className="mr-3.5 mt-0.5" />
              <View className="flex-1">
                <Text className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Student Name</Text>
                <Text className="text-sm font-semibold text-slate-700 mt-0.5">
                  {exam.student_name} {type === 'exam' ? `(${exam.education_grade})` : ''}
                </Text>
              </View>
            </View>
          </View>
 
          {/* Admit Card Section (Only for Exams) */}
          {type === 'exam' && exam.admit_card_proof ? (
            <View className="pt-3 border-t border-slate-100">
              <Text className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Student's Admit Card / Proof</Text>
              <View className="bg-slate-50 border border-slate-200 rounded-2xl p-4 flex-row items-center justify-between">
                <View className="flex-row items-center flex-1 pr-2">
                  <View className="w-10 h-10 bg-emerald-50 rounded-xl items-center justify-center mr-3 border border-emerald-100">
                    <Feather name="image" size={18} color="#059669" />
                  </View>
                  <View className="flex-1">
                    <Text className="text-xs font-bold text-slate-800" numberOfLines={1}>{exam.admit_card_proof}</Text>
                    <Text className="text-[9px] text-slate-400 mt-0.5">JPEG Image • 1.2 MB</Text>
                  </View>
                </View>
                <TouchableOpacity className="p-2 bg-emerald-100/40 rounded-lg">
                  <Feather name="eye" size={14} color="#059669" />
                </TouchableOpacity>
              </View>
            </View>
          ) : null}
 
        </View>

        {/* Attachments Section (Only for Assignments / if attachments exist) */}
        {parsedAttachments.length > 0 ? (
          <View className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm mb-4">
            <Text className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-3">Attachments</Text>
            <View className="space-y-2.5">
              {parsedAttachments.map((file, index) => {
                const isPdf = file.mimeType.includes('pdf');
                return (
                  <View key={index} className="bg-slate-50 border border-slate-100 rounded-2xl p-4 flex-row items-center justify-between">
                    <View className="flex-row items-center flex-1 pr-2">
                      <View className={`w-10 h-10 rounded-xl items-center justify-center mr-3 border ${
                        isPdf ? 'bg-red-50 border-red-100' : 'bg-purple-50 border-purple-100'
                      }`}>
                        <Feather name={isPdf ? 'file-text' : 'image'} size={18} color={isPdf ? '#ef4444' : '#7c3aed'} />
                      </View>
                      <View className="flex-1">
                        <Text className="text-xs font-bold text-slate-850" numberOfLines={1}>{file.name}</Text>
                        <Text className="text-[9px] text-slate-400 mt-0.5">{isPdf ? 'PDF Document' : 'Image File'}</Text>
                      </View>
                    </View>
                    <TouchableOpacity 
                      onPress={() => setSelectedAttachment(file)}
                      className="p-2 bg-slate-200/40 rounded-lg"
                    >
                      <Feather name="eye" size={14} color="#059669" />
                    </TouchableOpacity>
                  </View>
                );
              })}
            </View>
          </View>
        ) : null}

        {/* Guidelines & Policy Agreement Checkbox */}
        {!hasApplied && appStatus !== 'accepted' && (
          <View style={{
            backgroundColor: '#ffffff',
            padding: 16,
            borderRadius: 20,
            borderWidth: 1,
            borderColor: '#e2e8f0',
            marginBottom: 16,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 12,
            shadowColor: '#64748b',
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.05,
            shadowRadius: 10,
            elevation: 2,
          }}>
            <TouchableOpacity
              onPress={() => setAgreedGuidelines(!agreedGuidelines)}
              style={{
                width: 22,
                height: 22,
                borderRadius: 6,
                borderWidth: 2,
                borderColor: agreedGuidelines ? '#16a34a' : '#94a3b8',
                backgroundColor: agreedGuidelines ? '#16a34a' : '#ffffff',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {agreedGuidelines && <Feather name="check" size={14} color="#ffffff" />}
            </TouchableOpacity>

            <Text style={{ flex: 1, fontSize: 12, color: '#334155', lineHeight: 18 }}>
              I agree to the{' '}
              <Text
                onPress={() => setShowGuidelinesModal(true)}
                style={{ color: '#16a34a', fontWeight: '800', textDecorationLine: 'underline' }}
              >
                Anulekh Scribe Guidelines & Code of Conduct
              </Text>{' '}
              (Write only what is dictated, 0 money/gifts, stay on-platform).
            </Text>
          </View>
        )}

        {/* Action Button */}
        {hasApplied || (exam && exam.scribe_id === (profile ? profile.id : '')) ? (
          (() => {
            if (appStatus === 'accepted' || (exam && exam.scribe_id === (profile ? profile.id : ''))) {
              return (
                <View className="bg-emerald-50 border border-emerald-200 p-4 rounded-2xl flex-row items-center justify-center">
                  <Feather name="check-circle" size={16} color="#059669" className="mr-2" />
                  <Text className="text-emerald-800 text-xs font-bold">Assigned Scribe (Confirmed) 🎉</Text>
                </View>
              );
            }
            if (appStatus === 'invited') {
              return (
                <View className="bg-white border border-slate-150 p-4 rounded-3xl">
                  <Text className="text-xs font-bold text-slate-500 text-center mb-3">You have been invited to this request by the student.</Text>
                  <View className="flex-row gap-3">
                    <TouchableOpacity
                      onPress={handleAcceptInviteDirect}
                      disabled={submitting}
                      className="flex-1 bg-emerald-500 active:bg-emerald-600 py-3 rounded-2xl items-center justify-center shadow-md shadow-emerald-500/10"
                    >
                      {submitting ? (
                        <ActivityIndicator color="white" size="small" />
                      ) : (
                        <Text className="text-white font-bold text-xs">Accept Invite</Text>
                      )}
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={handleRejectInviteDirect}
                      disabled={submitting}
                      className="flex-1 bg-rose-500 active:bg-rose-600 py-3 rounded-2xl items-center justify-center shadow-md shadow-rose-500/10"
                    >
                      {submitting ? (
                        <ActivityIndicator color="white" size="small" />
                      ) : (
                        <Text className="text-white font-bold text-xs">Decline</Text>
                      )}
                    </TouchableOpacity>
                  </View>
                </View>
              );
            }
            return (
              <View className="bg-emerald-50 border border-emerald-200 p-4 rounded-2xl flex-row items-center justify-center">
                <Feather name="clock" size={16} color="#059669" className="mr-2" />
                <Text className="text-emerald-800 text-xs font-bold">Application Pending Approval</Text>
              </View>
            );
          })()
        ) : (
          <TouchableOpacity
            onPress={handleApply}
            disabled={submitting}
            className="w-full bg-emerald-500 active:bg-emerald-600 py-3.5 rounded-2xl items-center justify-center shadow-lg shadow-emerald-500/20"
          >
            {submitting ? (
              <ActivityIndicator color="white" size="small" />
            ) : (
              <Text className="text-white font-bold text-sm">
                {type === 'exam' ? 'Apply as Scribe' : 'Apply as Writer'}
              </Text>
            )}
          </TouchableOpacity>
        )}
      </ScrollView>

      {/* 100% APPLICATION SUCCESS OVERLAY */}
      {showSuccessOverlay && (
        <View className="absolute inset-0 bg-slate-950/80 items-center justify-center z-50">
          <View className="bg-white/95 p-8 rounded-3xl items-center border border-slate-200/50 shadow-2xl w-80">
            {/* Pulsing Success Icon */}
            <View className="w-20 h-20 bg-emerald-50 rounded-full items-center justify-center mb-5 border-2 border-emerald-500 shadow-lg shadow-emerald-500/20">
              <Feather name="check" size={40} color="#059669" />
            </View>
            
            <Text className="text-2xl font-black text-slate-900 text-center tracking-tight">Application Sent!</Text>
            <Text className="text-xs font-semibold text-slate-500 text-center mt-2 px-2 leading-relaxed">
              Your application has been sent to the student. You will be notified once they accept or reject it.
            </Text>
            
            {/* Loading Indicator */}
            <View className="flex-row space-x-1.5 mt-6 items-center">
              <ActivityIndicator size="small" color="#059669" className="mr-2" />
              <Text className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Returning to Portal...</Text>
            </View>
          </View>
        </View>
      )}

      {/* Attachment Preview Modal */}
      <Modal
        visible={!!selectedAttachment}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setSelectedAttachment(null)}
      >
        <View className="flex-1 bg-slate-950/95 justify-between">
          {/* Header */}
          <SafeAreaView className="bg-slate-900 px-6 py-4 flex-row items-center justify-between border-b border-slate-800">
            <Text className="text-sm font-bold text-white flex-1 mr-4" numberOfLines={1}>
              {selectedAttachment?.name || 'Attachment Preview'}
            </Text>
            <TouchableOpacity 
              onPress={() => setSelectedAttachment(null)}
              className="p-2 rounded-lg bg-slate-800"
            >
              <Feather name="x" size={16} color="white" />
            </TouchableOpacity>
          </SafeAreaView>

          {/* Body */}
          <View className="flex-1 items-center justify-center p-6">
            {selectedAttachment?.mimeType.includes('pdf') ? (
              <View className="items-center bg-slate-900 p-8 rounded-3xl border border-slate-800">
                <Feather name="file-text" size={64} color="#ef4444" className="mb-4" />
                <Text className="text-base font-bold text-white text-center">PDF Document</Text>
                <Text className="text-xs text-slate-400 text-center mt-2 max-w-[240px]">
                  PDF documents are securely stored inside the application database.
                </Text>
              </View>
            ) : (
              selectedAttachment?.uri ? (
                <Image 
                  source={{ uri: selectedAttachment.uri }} 
                  style={{ width: '100%', height: '85%' }}
                  resizeMode="contain" 
                />
              ) : (
                <Text className="text-slate-400 text-sm">Unable to load preview</Text>
              )
            )}
          </View>

          {/* Footer */}
          <SafeAreaView className="bg-slate-900 p-4 border-t border-slate-800">
            <TouchableOpacity 
              onPress={() => setSelectedAttachment(null)}
              className="w-full bg-emerald-500 py-3 rounded-xl items-center justify-center"
            >
              <Text className="text-white font-bold text-xs">Close Preview</Text>
            </TouchableOpacity>
          </SafeAreaView>
        </View>
      </Modal>

      {/* Guidelines Policy Modal */}
      <PolicyModal
        visible={showGuidelinesModal}
        onClose={() => setShowGuidelinesModal(false)}
        type="guidelines"
        onAgree={() => setAgreedGuidelines(true)}
      />
    </SafeAreaView>
  );
}
