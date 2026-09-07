import React from 'react';
import { View, Text } from 'react-native';

interface ExamStatusBadgeProps {
  status: string;
  isEmergency?: string | boolean;
}

export const ExamStatusBadge: React.FC<ExamStatusBadgeProps> = ({ status, isEmergency }) => {
  const isEmergencyActive = isEmergency === 'yes' || isEmergency === true;

  const getStatusConfig = () => {
    switch (status?.toLowerCase()) {
      case 'open':
      case 'pending':
        return {
          bg: '#FEF3C7',
          text: '#92400E',
          border: '#FCD34D',
          label: 'Finding Scribe',
        };
      case 'applied':
        return {
          bg: '#E0E7FF',
          text: '#3730A3',
          border: '#C7D2FE',
          label: 'Applications Received',
        };
      case 'assigned':
        return {
          bg: '#D1FAE5',
          text: '#065F46',
          border: '#A7F3D0',
          label: 'Scribe Confirmed',
        };
      case 'completed':
        return {
          bg: '#ECFDF5',
          text: '#047857',
          border: '#6EE7B7',
          label: 'Completed',
        };
      case 'cancelled':
        return {
          bg: '#FEE2E2',
          text: '#991B1B',
          border: '#FCA5A5',
          label: 'Cancelled',
        };
      default:
        return {
          bg: '#F3F4F6',
          text: '#4B5563',
          border: '#E5E7EB',
          label: status || 'Pending',
        };
    }
  };

  const config = getStatusConfig();

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      {isEmergencyActive && (
        <View
          style={{
            backgroundColor: '#FEE2E2',
            borderColor: '#EF4444',
            borderWidth: 1,
            paddingHorizontal: 8,
            paddingVertical: 2,
            borderRadius: 9999,
          }}
        >
          <Text style={{ color: '#DC2626', fontSize: 11, fontWeight: '700' }}>🚨 SOS</Text>
        </View>
      )}
      <View
        style={{
          backgroundColor: config.bg,
          borderColor: config.border,
          borderWidth: 1,
          paddingHorizontal: 10,
          paddingVertical: 3,
          borderRadius: 9999,
        }}
      >
        <Text style={{ color: config.text, fontSize: 12, fontWeight: '600' }}>{config.label}</Text>
      </View>
    </View>
  );
};
