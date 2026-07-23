import React from 'react';
import { View, Text, Modal, TouchableOpacity, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';

export type PolicyType = 'student_terms' | 'scribe_terms' | 'guidelines';

interface PolicyModalProps {
  visible: boolean;
  onClose: () => void;
  type: PolicyType;
  onAgree?: () => void;
  showAgreeButton?: boolean;
}

export default function PolicyModal({ visible, onClose, type, onAgree, showAgreeButton = true }: PolicyModalProps) {
  if (!visible) return null;

  const isStudent = type === 'student_terms';
  const isScribe = type === 'scribe_terms';
  const isGuidelines = type === 'guidelines';

  const accentColor = isStudent ? '#2563eb' : isScribe ? '#16a34a' : '#7c3aed';
  const headerBg = isStudent ? 'bg-blue-50 border-blue-200' : isScribe ? 'bg-emerald-50 border-emerald-200' : 'bg-purple-50 border-purple-200';
  const badgeColor = isStudent ? 'text-blue-700 bg-blue-100' : isScribe ? 'text-emerald-700 bg-emerald-100' : 'text-purple-700 bg-purple-100';

  return (
    <Modal visible={visible} animationType="slide" transparent={false} onRequestClose={onClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: '#f8fafc' }}>
        {/* Header */}
        <View style={{
          backgroundColor: '#ffffff',
          paddingHorizontal: 20,
          paddingVertical: 14,
          borderBottomWidth: 1,
          borderBottomColor: '#e2e8f0',
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.04,
          shadowRadius: 8,
          elevation: 2,
        }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, paddingRight: 10 }}>
            <View style={{
              width: 36,
              height: 36,
              borderRadius: 12,
              backgroundColor: isStudent ? '#eff6ff' : isScribe ? '#ecfdf5' : '#f5f3ff',
              alignItems: 'center',
              justifyContent: 'center',
              marginRight: 12,
              borderWidth: 1,
              borderColor: isStudent ? '#bfdbfe' : isScribe ? '#a7f3d0' : '#ddd6fe',
            }}>
              <Feather
                name={isStudent ? 'book-open' : isScribe ? 'shield' : 'file-text'}
                size={18}
                color={accentColor}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontFamily: 'Roboto', fontSize: 16, fontWeight: '800', color: '#0f172a' }} numberOfLines={1}>
                {isStudent ? 'Student Terms & Conditions' : isScribe ? 'Scribe Terms & Conditions' : 'Anulekh Practical Guidelines'}
              </Text>
              <Text style={{ fontFamily: 'Roboto', fontSize: 11, color: '#64748b', marginTop: 1 }}>
                {isStudent ? 'Official Terms for Students' : isScribe ? 'Volunteer Code & Scribe Terms' : 'Scribe & Student Handbook v0.1'}
              </Text>
            </View>
          </View>

          <TouchableOpacity onPress={onClose} style={{ padding: 6, borderRadius: 10, backgroundColor: '#f1f5f9' }}>
            <Feather name="x" size={20} color="#475569" />
          </TouchableOpacity>
        </View>

        {/* Content Body */}
        <ScrollView style={{ flex: 1, paddingHorizontal: 20, paddingTop: 16 }} contentContainerStyle={{ paddingBottom: 30 }}>
          {/* Top Info Card */}
          <View style={{
            backgroundColor: '#ffffff',
            borderRadius: 20,
            padding: 16,
            borderWidth: 1,
            borderColor: '#e2e8f0',
            marginBottom: 16,
            shadowColor: '#64748b',
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.06,
            shadowRadius: 12,
            elevation: 2,
          }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <View style={{ paddingVertical: 3, paddingHorizontal: 8, borderRadius: 10, backgroundColor: isStudent ? '#dbeafe' : isScribe ? '#d1fae5' : '#ede9fe' }}>
                <Text style={{ fontFamily: 'Roboto', fontSize: 10, fontWeight: '800', color: isStudent ? '#1e40af' : isScribe ? '#065f46' : '#5b21b6' }}>
                  {isStudent ? 'STUDENT POLICY' : isScribe ? 'SCRIBE POLICY' : 'DICTATION CODE'}
                </Text>
              </View>
              <View style={{ paddingVertical: 3, paddingHorizontal: 8, borderRadius: 10, backgroundColor: '#f1f5f9' }}>
                <Text style={{ fontFamily: 'Roboto', fontSize: 10, fontWeight: '700', color: '#475569' }}>
                  RPwD ACT 2016 & DPDP ACT 2023
                </Text>
              </View>
            </View>
            <Text style={{ fontFamily: 'Roboto', fontSize: 13, color: '#334155', lineHeight: 20 }}>
              {isStudent
                ? 'These Terms govern your use of Anulekh as a Student. They protect your exam fairness, guarantee a verified scribe, and ensure 100% free service.'
                : isScribe
                ? 'These Terms govern your participation as a Volunteer Scribe. Scribes write only what is dictated and strictly adhere to safeguarding rules.'
                : 'These practical guidelines outline the dictation golden rules, exam day protocols, and mandatory safeguarding standards.'}
            </Text>
          </View>

          {/* Section: Non-Negotiables */}
          <Text style={{ fontFamily: 'Roboto', fontSize: 12, fontWeight: '800', color: '#475569', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 10 }}>
            ⚡ Core Non-Negotiables
          </Text>

          <View style={{ backgroundColor: '#ffffff', borderRadius: 20, padding: 16, borderWidth: 1, borderColor: '#e2e8f0', gap: 12, marginBottom: 16 }}>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Text style={{ fontWeight: '900', color: accentColor }}>1.</Text>
              <Text style={{ flex: 1, fontSize: 13, color: '#1e293b', lineHeight: 18 }}>
                <Text style={{ fontWeight: '800' }}>Strict Dictation Only:</Text> A scribe writes ONLY what is dictated. No prompting, hinting, explaining, or correcting.
              </Text>
            </View>

            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Text style={{ fontWeight: '900', color: accentColor }}>2.</Text>
              <Text style={{ flex: 1, fontSize: 13, color: '#1e293b', lineHeight: 18 }}>
                <Text style={{ fontWeight: '800' }}>Zero Financial Exchange:</Text> No money, tips, gifts, or favours ever change hands. Scribes are volunteers.
              </Text>
            </View>

            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Text style={{ fontWeight: '900', color: accentColor }}>3.</Text>
              <Text style={{ flex: 1, fontSize: 13, color: '#1e293b', lineHeight: 18 }}>
                <Text style={{ fontWeight: '800' }}>Identity Verification:</Text> Mandatory ID verification for all users before any match is made.
              </Text>
            </View>

            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Text style={{ fontWeight: '900', color: accentColor }}>4.</Text>
              <Text style={{ flex: 1, fontSize: 13, color: '#1e293b', lineHeight: 18 }}>
                <Text style={{ fontWeight: '800' }}>Child Protection First:</Text> Guardian consent and strictly on-platform communication for minor students.
              </Text>
            </View>

            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Text style={{ fontWeight: '900', color: accentColor }}>5.</Text>
              <Text style={{ flex: 1, fontSize: 13, color: '#1e293b', lineHeight: 18 }}>
                <Text style={{ fontWeight: '800' }}>Data Confidentiality:</Text> Personal and disability data is protected under India's DPDP Act 2023.
              </Text>
            </View>

            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Text style={{ fontWeight: '900', color: accentColor }}>6.</Text>
              <Text style={{ flex: 1, fontSize: 13, color: '#1e293b', lineHeight: 18 }}>
                <Text style={{ fontWeight: '800' }}>Exam Authority Rule Precedence:</Text> The rules of the board or university conducting the exam always govern.
              </Text>
            </View>
          </View>

          {/* Section: Specific Role Details */}
          {isStudent && (
            <>
              <Text style={{ fontFamily: 'Roboto', fontSize: 12, fontWeight: '800', color: '#475569', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 10 }}>
                🎓 Student Protections & Rights
              </Text>
              <View style={{ backgroundColor: '#ffffff', borderRadius: 20, padding: 16, borderWidth: 1, borderColor: '#e2e8f0', gap: 10, marginBottom: 16 }}>
                <Text style={{ fontSize: 13, color: '#334155', lineHeight: 20 }}>
                  • <Text style={{ fontWeight: '700' }}>Your Hand, Not Your Mind:</Text> Your scribe reads questions as written and writes your answers exactly as dictated.
                </Text>
                <Text style={{ fontSize: 13, color: '#334155', lineHeight: 20 }}>
                  • <Text style={{ fontWeight: '700' }}>Refuse Unsolicited Assistance:</Text> If a scribe offers hints or corrections, say no and report it immediately to prevent your disqualification.
                </Text>
                <Text style={{ fontSize: 13, color: '#334155', lineHeight: 20 }}>
                  • <Text style={{ fontWeight: '700' }}>Compensatory Time:</Text> Entitled students receive compensatory extra time (commonly 20 minutes per hour) as per RPwD Act guidelines.
                </Text>
              </View>
            </>
          )}

          {isScribe && (
            <>
              <Text style={{ fontFamily: 'Roboto', fontSize: 12, fontWeight: '800', color: '#475569', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 10 }}>
                🤝 Scribe Duties & Code of Conduct
              </Text>
              <View style={{ backgroundColor: '#ffffff', borderRadius: 20, padding: 16, borderWidth: 1, borderColor: '#e2e8f0', gap: 10, marginBottom: 16 }}>
                <Text style={{ fontSize: 13, color: '#334155', lineHeight: 20 }}>
                  • <Text style={{ fontWeight: '700' }}>The Golden Rule (Do Less):</Text> Read questions aloud as written. Write answers as spoken. Read back on request. Never explain, prompt, or judge.
                </Text>
                <Text style={{ fontSize: 13, color: '#334155', lineHeight: 20 }}>
                  • <Text style={{ fontWeight: '700' }}>Academic Eligibility:</Text> Ensure you meet the authority's criteria (e.g. lower educational level/grade than the candidate, not a subject teacher).
                </Text>
                <Text style={{ fontSize: 13, color: '#334155', lineHeight: 20 }}>
                  • <Text style={{ fontWeight: '700' }}>Zero Off-Platform Contact:</Text> Keep all chats on the platform. Never contact minors privately or ask for secrets.
                </Text>
              </View>
            </>
          )}

          {isGuidelines && (
            <>
              <Text style={{ fontFamily: 'Roboto', fontSize: 12, fontWeight: '800', color: '#475569', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 10 }}>
                📖 Dictation Protocols & Scenarios
              </Text>
              <View style={{ backgroundColor: '#ffffff', borderRadius: 20, padding: 16, borderWidth: 1, borderColor: '#e2e8f0', gap: 10, marginBottom: 16 }}>
                <Text style={{ fontSize: 13, color: '#334155', lineHeight: 20 }}>
                  • <Text style={{ fontWeight: '700' }}>Student Pauses:</Text> Wait quietly. Scribes must not prompt or suggest.
                </Text>
                <Text style={{ fontSize: 13, color: '#334155', lineHeight: 20 }}>
                  • <Text style={{ fontWeight: '700' }}>Obvious Spelling Error:</Text> Write exactly as dictated. Correct only when the student explicitly dictates a correction.
                </Text>
                <Text style={{ fontSize: 13, color: '#334155', lineHeight: 20 }}>
                  • <Text style={{ fontWeight: '700' }}>"Is this answer right?":</Text> Gently remind the student you can only write and read back.
                </Text>
              </View>
            </>
          )}

          {/* Action Footer Button */}
          {showAgreeButton && (
            <TouchableOpacity
              onPress={() => {
                if (onAgree) onAgree();
                onClose();
              }}
              style={{
                backgroundColor: accentColor,
                paddingVertical: 14,
                borderRadius: 16,
                alignItems: 'center',
                justifyContent: 'center',
                shadowColor: accentColor,
                shadowOffset: { width: 0, height: 4 },
                shadowOpacity: 0.25,
                shadowRadius: 10,
                elevation: 4,
                marginTop: 8,
              }}
            >
              <Text style={{ fontFamily: 'Roboto', color: '#ffffff', fontSize: 15, fontWeight: '800' }}>
                I Understand & Agree
              </Text>
            </TouchableOpacity>
          )}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}
