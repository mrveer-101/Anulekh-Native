import React, { useState } from 'react';
import { View, Text, Modal, TouchableOpacity, ScrollView, TextInput, Platform, ActivityIndicator, Alert } from 'react-native';
import { Feather, Ionicons } from '@expo/vector-icons';
import { supabase } from '@/core/supabase';

interface RatingModalProps {
  visible: boolean;
  onClose: () => void;
  exam: any;
  onSuccess: () => void;
}

export function RatingModal({ visible, onClose, exam, onSuccess }: RatingModalProps) {
  const [ratingPunctuality, setRatingPunctuality] = useState(5);
  const [ratingCommunication, setRatingCommunication] = useState(5);
  const [ratingSpeed, setRatingSpeed] = useState(5);
  const [ratingBehavior, setRatingBehavior] = useState(5);
  const [ratingOverall, setRatingOverall] = useState(5);
  const [remark, setRemark] = useState('');
  const [submittingRating, setSubmittingRating] = useState(false);

  const resetForm = () => {
    setRatingPunctuality(5);
    setRatingCommunication(5);
    setRatingSpeed(5);
    setRatingBehavior(5);
    setRatingOverall(5);
    setRemark('');
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const submitRating = async () => {
    if (!exam) return;
    setSubmittingRating(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("No active session.");

      // 1. Insert review into scribe_reviews
      const { error: reviewError } = await supabase.from('scribe_reviews').insert({
        request_id: exam.id,
        student_id: session.user.id,
        scribe_id: exam.scribe_id,
        rating_punctuality: ratingPunctuality,
        rating_communication: ratingCommunication,
        rating_speed: ratingSpeed,
        rating_behavior: ratingBehavior,
        rating_overall: ratingOverall,
        remark: remark.trim(),
      });
      if (reviewError) throw reviewError;

      // 2. Update status to completed in exam_requests (or assignment_requests)
      const table = (exam.is_assignment || exam.requestType === 'assignment') ? 'assignment_requests' : 'exam_requests';
      const { error: requestUpdateError } = await supabase
        .from(table)
        .update({ status: 'completed' })
        .eq('id', exam.id);
      if (requestUpdateError) throw requestUpdateError;

      Alert.alert("Success", "Request marked as completed and review submitted successfully!");
      handleClose();
      onSuccess();
    } catch (err: any) {
      Alert.alert("Error", err.message || "Failed to submit rating.");
    } finally {
      setSubmittingRating(false);
    }
  };

  return (
    <Modal
      animationType="fade"
      transparent
      visible={visible}
      onRequestClose={handleClose}
    >
      <View style={{ flex: 1, backgroundColor: 'rgba(15,23,42,0.45)', justifyContent: 'center', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 20 }}>
        <View style={{
          backgroundColor: '#FFFFFF',
          width: '100%',
          maxWidth: 420,
          borderRadius: 28,
          paddingHorizontal: 20,
          paddingVertical: 20,
          shadowColor: '#0F172A',
          shadowOffset: { width: 0, height: 20 },
          shadowOpacity: 0.12,
          shadowRadius: 28,
          elevation: 16,
          borderWidth: 1,
          borderColor: '#EDF2F7',
        }}>
          {/* Header: Badge + Title + Close */}
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, paddingRight: 8 }}>
              {/* Clipboard Badge */}
              <View style={{
                width: 48,
                height: 48,
                borderRadius: 16,
                backgroundColor: '#EFF6FF',
                borderWidth: 1.5,
                borderColor: '#DBEAFE',
                alignItems: 'center',
                justifyContent: 'center',
                marginRight: 12,
                shadowColor: '#1676D2',
                shadowOffset: { width: 0, height: 2 },
                shadowOpacity: 0.08,
                shadowRadius: 6,
              }}>
                <Ionicons name="clipboard" size={26} color="#1676D2" />
                <Ionicons name="star" size={13} color="#F59E0B" style={{ position: 'absolute', top: 18 }} />
              </View>

              {/* Title & Subtitle */}
              <View style={{ flex: 1 }}>
                <Text style={{ fontFamily: 'Roboto', fontSize: 20, fontWeight: '900', color: '#0B192C', letterSpacing: -0.3 }}>
                  Rate your Scribe
                </Text>
                <Text style={{ fontFamily: 'Roboto', fontSize: 12.5, color: '#64748B', marginTop: 3, lineHeight: 17 }}>
                  Please provide feedback for{' '}
                  <Text style={{ fontWeight: '800', color: '#1676D2' }}>
                    {exam?.scribeProfile?.full_name || exam?.scribeProfile?.official_name || 'Volunteer Scribe'}
                  </Text>{' '}
                  across 5 fields.
                </Text>
              </View>
            </View>

            <TouchableOpacity
              onPress={handleClose}
              accessibilityRole="button"
              accessibilityLabel="Close"
              style={{ padding: 6, borderRadius: 12, backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: '#F1F5F9' }}
            >
              <Feather name="x" size={18} color="#64748B" />
            </TouchableOpacity>
          </View>

          {/* Scrollable Star Rows & Remark */}
          <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 460 }} contentContainerStyle={{ paddingBottom: 6 }}>
            
            {/* 1. Punctuality (Time Management) */}
            <View style={{
              backgroundColor: '#F0F7FD',
              borderRadius: 16,
              paddingHorizontal: 12,
              paddingVertical: 10,
              marginBottom: 9,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, marginRight: 8 }}>
                <View style={{
                  width: 38,
                  height: 38,
                  borderRadius: 19,
                  backgroundColor: '#D9ECFD',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginRight: 10,
                }}>
                  <Feather name="clock" size={18} color="#1676D2" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontFamily: 'Roboto', fontSize: 13.5, fontWeight: '800', color: '#0F172A' }}>
                    1. Punctuality
                  </Text>
                  <Text style={{ fontFamily: 'Roboto', fontSize: 11, fontWeight: '500', color: '#64748B', marginTop: 1 }}>
                    (Time Management)
                  </Text>
                </View>
              </View>
              <View style={{ flexDirection: 'row', gap: 4 }}>
                {[1, 2, 3, 4, 5].map((star) => (
                  <TouchableOpacity
                    key={star}
                    onPress={() => setRatingPunctuality(star)}
                    activeOpacity={0.7}
                    hitSlop={{ top: 8, bottom: 8, left: 3, right: 3 }}
                  >
                    <Ionicons
                      name="star"
                      size={21}
                      color={star <= ratingPunctuality ? '#F58220' : '#D1DFEC'}
                    />
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* 2. Communication (Interaction) */}
            <View style={{
              backgroundColor: '#FFFFFF',
              borderRadius: 16,
              borderWidth: 1,
              borderColor: '#EDF2F7',
              paddingHorizontal: 12,
              paddingVertical: 10,
              marginBottom: 9,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, marginRight: 8 }}>
                <View style={{
                  width: 38,
                  height: 38,
                  borderRadius: 19,
                  backgroundColor: '#FFF0E6',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginRight: 10,
                }}>
                  <Feather name="message-square" size={17} color="#F07820" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontFamily: 'Roboto', fontSize: 13.5, fontWeight: '800', color: '#0F172A' }}>
                    2. Communication
                  </Text>
                  <Text style={{ fontFamily: 'Roboto', fontSize: 11, fontWeight: '500', color: '#64748B', marginTop: 1 }}>
                    (Interaction)
                  </Text>
                </View>
              </View>
              <View style={{ flexDirection: 'row', gap: 4 }}>
                {[1, 2, 3, 4, 5].map((star) => (
                  <TouchableOpacity
                    key={star}
                    onPress={() => setRatingCommunication(star)}
                    activeOpacity={0.7}
                    hitSlop={{ top: 8, bottom: 8, left: 3, right: 3 }}
                  >
                    <Ionicons
                      name="star"
                      size={21}
                      color={star <= ratingCommunication ? '#F58220' : '#D1DFEC'}
                    />
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* 3. Scribing Speed & Accuracy */}
            <View style={{
              backgroundColor: '#F0F7FD',
              borderRadius: 16,
              paddingHorizontal: 12,
              paddingVertical: 10,
              marginBottom: 9,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, marginRight: 8 }}>
                <View style={{
                  width: 38,
                  height: 38,
                  borderRadius: 19,
                  backgroundColor: '#D9ECFD',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginRight: 10,
                }}>
                  <Ionicons name="speedometer-outline" size={19} color="#1676D2" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontFamily: 'Roboto', fontSize: 13.5, fontWeight: '800', color: '#0F172A' }}>
                    3. Scribing Speed & Accuracy
                  </Text>
                </View>
              </View>
              <View style={{ flexDirection: 'row', gap: 4 }}>
                {[1, 2, 3, 4, 5].map((star) => (
                  <TouchableOpacity
                    key={star}
                    onPress={() => setRatingSpeed(star)}
                    activeOpacity={0.7}
                    hitSlop={{ top: 8, bottom: 8, left: 3, right: 3 }}
                  >
                    <Ionicons
                      name="star"
                      size={21}
                      color={star <= ratingSpeed ? '#F58220' : '#D1DFEC'}
                    />
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* 4. Conduct & Behavior */}
            <View style={{
              backgroundColor: '#FFFFFF',
              borderRadius: 16,
              borderWidth: 1,
              borderColor: '#EDF2F7',
              paddingHorizontal: 12,
              paddingVertical: 10,
              marginBottom: 9,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, marginRight: 8 }}>
                <View style={{
                  width: 38,
                  height: 38,
                  borderRadius: 19,
                  backgroundColor: '#FFF0E6',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginRight: 10,
                }}>
                  <Feather name="user" size={18} color="#F07820" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontFamily: 'Roboto', fontSize: 13.5, fontWeight: '800', color: '#0F172A' }}>
                    4. Conduct & Behavior
                  </Text>
                </View>
              </View>
              <View style={{ flexDirection: 'row', gap: 4 }}>
                {[1, 2, 3, 4, 5].map((star) => (
                  <TouchableOpacity
                    key={star}
                    onPress={() => setRatingBehavior(star)}
                    activeOpacity={0.7}
                    hitSlop={{ top: 8, bottom: 8, left: 3, right: 3 }}
                  >
                    <Ionicons
                      name="star"
                      size={21}
                      color={star <= ratingBehavior ? '#F58220' : '#D1DFEC'}
                    />
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* 5. Overall Experience */}
            <View style={{
              backgroundColor: '#F0F7FD',
              borderRadius: 16,
              paddingHorizontal: 12,
              paddingVertical: 10,
              marginBottom: 12,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, marginRight: 8 }}>
                <View style={{
                  width: 38,
                  height: 38,
                  borderRadius: 19,
                  backgroundColor: '#D9ECFD',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginRight: 10,
                }}>
                  <Feather name="star" size={18} color="#1676D2" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontFamily: 'Roboto', fontSize: 13.5, fontWeight: '800', color: '#0F172A' }}>
                    5. Overall Experience
                  </Text>
                </View>
              </View>
              <View style={{ flexDirection: 'row', gap: 4 }}>
                {[1, 2, 3, 4, 5].map((star) => (
                  <TouchableOpacity
                    key={star}
                    onPress={() => setRatingOverall(star)}
                    activeOpacity={0.7}
                    hitSlop={{ top: 8, bottom: 8, left: 3, right: 3 }}
                  >
                    <Ionicons
                      name="star"
                      size={21}
                      color={star <= ratingOverall ? '#F58220' : '#D1DFEC'}
                    />
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Remarks & Feedback */}
            <View style={{ marginTop: 2 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                <Feather name="message-square" size={15} color="#1676D2" />
                <Text style={{ fontFamily: 'Roboto', fontSize: 13.5, fontWeight: '800', color: '#0F172A' }}>
                  Remarks & Feedback
                </Text>
              </View>
              <TextInput
                value={remark}
                onChangeText={setRemark}
                placeholder="Write a brief review about your experience with this scribe..."
                placeholderTextColor="#94A3B8"
                multiline
                numberOfLines={3}
                style={{
                  width: '100%',
                  backgroundColor: '#F3F8FC',
                  borderWidth: 1,
                  borderColor: '#DCE8F5',
                  borderRadius: 16,
                  paddingHorizontal: 14,
                  paddingVertical: 12,
                  fontSize: 13,
                  fontFamily: 'Roboto',
                  color: '#0F172A',
                  minHeight: 84,
                  textAlignVertical: 'top',
                  ...(Platform.OS === 'web' ? { outlineStyle: 'none' } : {}),
                } as any}
              />
            </View>
          </ScrollView>

          {/* Submit & Mark Complete Button */}
          <TouchableOpacity
            onPress={submitRating}
            disabled={submittingRating}
            activeOpacity={0.85}
            style={{
              backgroundColor: '#F07820',
              borderRadius: 22,
              paddingVertical: 14,
              marginTop: 14,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              shadowColor: '#F07820',
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: 0.25,
              shadowRadius: 10,
              elevation: 4,
            }}
          >
            {submittingRating ? (
              <ActivityIndicator color="white" size="small" />
            ) : (
              <>
                <Feather name="send" size={16} color="#FFFFFF" style={{ marginLeft: 2, marginTop: -1 }} />
                <Text style={{ fontFamily: 'Roboto', fontSize: 15, fontWeight: '800', color: '#FFFFFF' }}>
                  Submit & Mark Complete
                </Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}
