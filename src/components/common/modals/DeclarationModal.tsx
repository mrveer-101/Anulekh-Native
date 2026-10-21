import React from 'react';
import { View, Text, Modal, ScrollView, TouchableOpacity, Alert } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useLanguage } from '@/core/translation';

interface DeclarationModalProps {
  visible: boolean;
  onClose: () => void;
  exam: any;
  studentName?: string;
  scribeName?: string;
  scribeOccupation?: string;
  accentColor?: string;
}

/**
 * Shared Scribe Declaration Modal.
 * Preserves 100% of the exact design, fonts, typography, borders, and stamp layout.
 */
export function DeclarationModal({
  visible,
  onClose,
  exam,
  studentName,
  scribeName,
  scribeOccupation,
  accentColor = '#2563eb',
}: DeclarationModalProps) {
  const { t } = useLanguage();

  const finalStudentName = studentName || exam?.student_name || 'Candidate Student';
  const finalScribeName =
    scribeName ||
    exam?.scribeProfile?.full_name ||
    exam?.scribeProfile?.official_name ||
    t('volunteer_scribe');
  const finalOccupation =
    scribeOccupation ||
    exam?.scribeProfile?.occupation ||
    t('student_scribe_fallback');

  return (
    <Modal
      animationType="slide"
      transparent={true}
      visible={visible}
      onRequestClose={onClose}
    >
      <View
        style={{
          flex: 1,
          backgroundColor: 'rgba(15,23,42,0.5)',
          justifyContent: 'center',
          alignItems: 'center',
          paddingHorizontal: 20,
        }}
      >
        <View
          style={{
            backgroundColor: '#fff',
            width: '100%',
            maxWidth: 360,
            borderRadius: 28,
            overflow: 'hidden',
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 20 },
            shadowOpacity: 0.15,
            shadowRadius: 30,
            elevation: 15,
            borderWidth: 1,
            borderColor: 'rgba(0,0,0,0.05)',
          }}
        >
          {/* Modal Header */}
          <View
            style={{
              paddingHorizontal: 20,
              paddingVertical: 14,
              borderBottomWidth: 1,
              borderBottomColor: '#f1f5f9',
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <Text
              style={{
                fontFamily: 'Roboto',
                fontSize: 13,
                fontWeight: '800',
                color: '#0f172a',
                textTransform: 'uppercase',
              }}
            >
              {t('scribe_declaration')}
            </Text>
            <TouchableOpacity onPress={onClose} style={{ padding: 4 }}>
              <Feather name="x" size={18} color="#64748b" />
            </TouchableOpacity>
          </View>

          {/* Declaration Content */}
          <ScrollView style={{ maxHeight: 380 }} contentContainerStyle={{ padding: 20, gap: 14 }}>
            <View style={{ alignItems: 'center', marginBottom: 6 }}>
              <Text style={{ fontFamily: 'Roboto', fontWeight: '900', fontSize: 20, color: accentColor }}>
                Anulekh Portal
              </Text>
              <Text
                style={{
                  fontFamily: 'Roboto',
                  fontSize: 9,
                  color: '#64748b',
                  textTransform: 'uppercase',
                  letterSpacing: 1.5,
                  marginTop: 2,
                }}
              >
                {t('official_cert_letter')}
              </Text>
            </View>

            {/* 1. Exam Details */}
            <View
              style={{
                backgroundColor: '#f8fafc',
                padding: 12,
                borderRadius: 16,
                borderWidth: 1,
                borderColor: '#e2e8f0',
                gap: 4,
              }}
            >
              <Text
                style={{
                  fontFamily: 'Roboto',
                  fontSize: 9,
                  fontWeight: '800',
                  color: '#64748b',
                  textTransform: 'uppercase',
                  letterSpacing: 0.5,
                  marginBottom: 2,
                }}
              >
                {t('exam_details')}
              </Text>
              <Text style={{ fontFamily: 'Roboto', fontSize: 12, color: '#334155', fontWeight: '700' }}>
                {t('subject_label')} {exam?.subject}
              </Text>
              <Text style={{ fontFamily: 'Roboto', fontSize: 11, color: '#475569' }}>
                {t('exam_level')}: {exam?.exam_type}
              </Text>
              <Text style={{ fontFamily: 'Roboto', fontSize: 11, color: '#475569' }}>
                {t('date_label')}: {exam?.exam_date}
              </Text>
              <Text style={{ fontFamily: 'Roboto', fontSize: 11, color: '#475569' }}>
                {t('exam_venue')}: {exam?.exam_venue}
              </Text>
            </View>

            {/* 2. Candidate & Scribe Details */}
            <View style={{ gap: 10 }}>
              <View>
                <Text
                  style={{
                    fontFamily: 'Roboto',
                    fontSize: 9,
                    fontWeight: '800',
                    color: '#64748b',
                    textTransform: 'uppercase',
                    marginBottom: 2,
                  }}
                >
                  {t('candidate_student')}
                </Text>
                <Text style={{ fontFamily: 'Roboto', fontSize: 12, color: '#0f172a', fontWeight: '800' }}>
                  {finalStudentName}
                </Text>
                <Text style={{ fontFamily: 'Roboto', fontSize: 10, color: '#64748b', marginTop: 1 }}>
                  {t('grade_label')}: {exam?.education_grade || 'Undergraduate'}
                </Text>
                <Text style={{ fontFamily: 'Roboto', fontSize: 10, color: '#64748b' }}>
                  {t('aadhar_id')}: {t('status_verified_label')}
                </Text>
              </View>

              <View style={{ height: 1, backgroundColor: '#f1f5f9' }} />

              <View>
                <Text
                  style={{
                    fontFamily: 'Roboto',
                    fontSize: 9,
                    fontWeight: '800',
                    color: '#64748b',
                    textTransform: 'uppercase',
                    marginBottom: 2,
                  }}
                >
                  {t('volunteer_scribe')}
                </Text>
                <Text style={{ fontFamily: 'Roboto', fontSize: 12, color: '#0f172a', fontWeight: '800' }}>
                  {finalScribeName}
                </Text>
                <Text style={{ fontFamily: 'Roboto', fontSize: 10, color: '#64748b', marginTop: 1 }}>
                  {t('occupation_label')}{finalOccupation}
                </Text>
              </View>
            </View>

            {/* 3. Formal Declaration Text */}
            <View
              style={{
                backgroundColor: `${accentColor}0D`,
                borderWidth: 1,
                borderColor: `${accentColor}2E`,
                padding: 12,
                borderRadius: 16,
                marginTop: 4,
              }}
            >
              <Text
                style={{
                  fontFamily: 'Roboto',
                  fontSize: 10,
                  color: accentColor === '#059669' ? '#047857' : '#1d4ed8',
                  lineHeight: 16,
                  fontStyle: 'italic',
                  textAlign: 'center',
                }}
              >
                {t('declaration_agreement_text')}
              </Text>
            </View>

            {/* 4. Verification Stamp */}
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                paddingVertical: 4,
              }}
            >
              <View>
                <Text
                  style={{
                    fontFamily: 'Roboto',
                    fontSize: 8,
                    fontWeight: '800',
                    color: '#64748b',
                    textTransform: 'uppercase',
                  }}
                >
                  {t('status')}
                </Text>
                <Text
                  style={{
                    fontFamily: 'Roboto',
                    fontSize: 10,
                    color: '#059669',
                    fontWeight: '800',
                    marginTop: 2,
                  }}
                >
                  {t('verified_scribe_badge')}
                </Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text
                  style={{
                    fontFamily: 'Roboto',
                    fontSize: 8,
                    fontWeight: '800',
                    color: '#64748b',
                    textTransform: 'uppercase',
                  }}
                >
                  {t('official_stamp')}
                </Text>
                <Text
                  style={{
                    fontFamily: 'Roboto',
                    fontSize: 9,
                    color: '#0f172a',
                    fontWeight: '800',
                    marginTop: 2,
                  }}
                >
                  ANULEKH ONLINE
                </Text>
              </View>
            </View>
          </ScrollView>

          {/* Action Buttons */}
          <View
            style={{
              padding: 16,
              backgroundColor: '#f8fafc',
              borderTopWidth: 1,
              borderTopColor: '#f1f5f9',
              flexDirection: 'row',
              gap: 8,
            }}
          >
            <TouchableOpacity
              onPress={onClose}
              style={{
                flex: 1,
                backgroundColor: '#e2e8f0',
                paddingVertical: 11,
                borderRadius: 12,
                alignItems: 'center',
              }}
            >
              <Text style={{ fontFamily: 'Roboto', color: '#475569', fontWeight: '700', fontSize: 13 }}>
                {t('close')}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => Alert.alert(t('download'), t('download_declaration'))}
              style={{
                flex: 1,
                backgroundColor: accentColor,
                paddingVertical: 11,
                borderRadius: 12,
                alignItems: 'center',
                shadowColor: accentColor,
                shadowOffset: { width: 0, height: 4 },
                shadowOpacity: 0.15,
                shadowRadius: 8,
                elevation: 3,
              }}
            >
              <Text style={{ fontFamily: 'Roboto', color: 'white', fontWeight: '800', fontSize: 13 }}>
                {t('download')}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}
