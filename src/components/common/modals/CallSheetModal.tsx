import React, { useState } from 'react';
import { View, Text, Modal, TouchableOpacity, Linking, Alert } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useLanguage } from '@/core/translation';

interface CallSheetModalProps {
  visible: boolean;
  onClose: () => void;
  exam: any;
  accentColor?: string;
  roleLabel?: string;
}

/**
 * Shared Call Bottom Sheet Modal.
 * Preserves 100% of the exact design, fonts, shadows, borders, and masked number logic.
 * Works seamlessly whether a Student is calling a Scribe or a Scribe is calling a Student.
 */
export function CallSheetModal({
  visible,
  onClose,
  exam,
  accentColor = '#2563eb',
  roleLabel,
}: CallSheetModalProps) {
  const { t } = useLanguage();
  const [showMaskedNumber, setShowMaskedNumber] = useState(false);

  const handleClose = () => {
    setShowMaskedNumber(false);
    onClose();
  };

  const isCallingStudent = !exam?.scribeProfile && !!exam?.student_name;
  const contactName =
    exam?.scribeProfile?.full_name ||
    exam?.scribeProfile?.official_name ||
    exam?.student_name ||
    t('student_scribe_fallback');
  const avatarLetter = contactName?.charAt(0)?.toUpperCase() || 'S';
  const phoneNumber = exam?.scribeProfile?.phone || exam?.phone || '9876543210';
  const displayRole = roleLabel || (isCallingStudent ? t('candidate_student').toUpperCase() : t('volunteer_scribe').toUpperCase());
  const contextSuffix = isCallingStudent ? t('exam_student_suffix') : t('exam_volunteer_suffix');

  return (
    <Modal
      animationType="slide"
      transparent
      visible={visible}
      onRequestClose={handleClose}
    >
      {/* Backdrop */}
      <TouchableOpacity
        style={{ flex: 1, backgroundColor: 'rgba(15,23,42,0.45)' }}
        activeOpacity={1}
        onPress={handleClose}
      />

      {/* Sheet */}
      <View
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
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
        }}
      >
        {/* Handle bar */}
        <View style={{ alignItems: 'center', marginBottom: 10 }}>
          <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: '#e2e8f0' }} />
        </View>

        {/* Header row */}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingVertical: 14,
            borderBottomWidth: 1,
            borderBottomColor: 'rgba(0,0,0,0.06)',
            marginBottom: 16,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <View
              style={{
                width: 38,
                height: 38,
                borderRadius: 11,
                backgroundColor: `${accentColor}18`,
                borderWidth: 1,
                borderColor: `${accentColor}38`,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Feather name="phone" size={16} color={accentColor} />
            </View>
            <Text style={{ fontFamily: 'Roboto', fontSize: 16, fontWeight: '900', color: '#0f172a' }}>
              {t('call_detail')}
            </Text>
          </View>
          <TouchableOpacity
            onPress={handleClose}
            style={{
              width: 34,
              height: 34,
              borderRadius: 10,
              backgroundColor: 'rgba(0,0,0,0.05)',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Feather name="x" size={16} color="#64748b" />
          </TouchableOpacity>
        </View>

        {/* Contact card */}
        <View
          style={{
            backgroundColor: `${accentColor}18`,
            borderWidth: 1,
            borderColor: `${accentColor}38`,
            borderRadius: 20,
            padding: 20,
          }}
        >
          {/* Avatar + name */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 16 }}>
            <View
              style={{
                width: 54,
                height: 54,
                borderRadius: 16,
                backgroundColor: `${accentColor}25`,
                borderWidth: 2,
                borderColor: `${accentColor}38`,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Text style={{ fontFamily: 'Roboto', fontSize: 22, fontWeight: '900', color: accentColor }}>
                {avatarLetter}
              </Text>
            </View>
            <View>
              <Text style={{ fontFamily: 'Roboto', fontSize: 17, fontWeight: '900', color: '#0f172a' }}>
                {contactName}
              </Text>
              <View
                style={{
                  marginTop: 4,
                  backgroundColor: `${accentColor}18`,
                  borderRadius: 6,
                  paddingHorizontal: 8,
                  paddingVertical: 3,
                  alignSelf: 'flex-start',
                  borderWidth: 1,
                  borderColor: `${accentColor}38`,
                }}
              >
                <Text style={{ fontFamily: 'Roboto', color: accentColor, fontSize: 10, fontWeight: '800' }}>
                  {displayRole}
                </Text>
              </View>
            </View>
          </View>

          {/* Phone number display */}
          {showMaskedNumber ? (
            <View
              style={{
                backgroundColor: '#fff',
                borderRadius: 14,
                paddingVertical: 14,
                paddingHorizontal: 18,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 12,
                borderWidth: 1,
                borderColor: `${accentColor}38`,
              }}
            >
              <Feather name="phone" size={18} color={accentColor} />
              <Text
                style={{
                  fontFamily: 'Roboto',
                  fontSize: 20,
                  fontWeight: '900',
                  color: '#0f172a',
                  letterSpacing: 1.5,
                }}
              >
                {phoneNumber}
              </Text>
            </View>
          ) : (
            <TouchableOpacity
              onPress={() => setShowMaskedNumber(true)}
              style={{
                backgroundColor: '#fff',
                borderRadius: 14,
                paddingVertical: 14,
                paddingHorizontal: 18,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                borderWidth: 1,
                borderColor: `${accentColor}38`,
                borderStyle: 'dashed',
              }}
            >
              <Feather name="eye" size={16} color={accentColor} />
              <Text style={{ fontFamily: 'Roboto', fontSize: 14, fontWeight: '800', color: accentColor }}>
                {t('view_number')}
              </Text>
            </TouchableOpacity>
          )}

          {/* Exam context */}
          <Text style={{ fontFamily: 'Roboto', fontSize: 11, color: '#64748b', marginTop: 10, textAlign: 'center' }}>
            {t('subject_label')}{' '}
            <Text style={{ fontWeight: '700', color: '#0f172a' }}>{exam?.subject}</Text>{' '}
            {contextSuffix}
          </Text>
        </View>

        {/* Dial Now CTA */}
        <TouchableOpacity
          onPress={async () => {
            const url = `tel:${phoneNumber}`;
            try {
              const supported = await Linking.canOpenURL(url);
              if (supported) {
                await Linking.openURL(url);
              } else {
                Alert.alert(t('error'), t('call_not_supported'));
              }
            } catch {
              Alert.alert(t('error'), t('call_error'));
            }
          }}
          style={{
            backgroundColor: accentColor,
            borderRadius: 18,
            paddingVertical: 16,
            marginTop: 16,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 10,
            shadowColor: accentColor,
            shadowOffset: { width: 0, height: 10 },
            shadowOpacity: 0.25,
            shadowRadius: 20,
            elevation: 10,
          }}
          activeOpacity={0.85}
        >
          <Feather name="phone-call" size={20} color="#fff" />
          <Text style={{ fontFamily: 'Roboto', color: '#fff', fontSize: 16, fontWeight: '900' }}>
            {t('dial_now')}
          </Text>
        </TouchableOpacity>

        {/* Cancel */}
        <TouchableOpacity
          onPress={handleClose}
          style={{ paddingVertical: 14, alignItems: 'center', marginTop: 4 }}
        >
          <Text style={{ fontFamily: 'Roboto', color: '#64748b', fontSize: 14, fontWeight: '600' }}>
            {t('cancel')}
          </Text>
        </TouchableOpacity>
      </View>
    </Modal>
  );
}
