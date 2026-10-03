/**
 * ExamStatusBadge
 *
 * Small pill-shaped badge that turns an `exam_requests.status` value into a
 * student-friendly label and colour (e.g. 'open' -> "Finding Scribe",
 * 'assigned' -> "Scribe Confirmed"). When the request is an SOS/emergency
 * request, a red "SOS" pill is shown in front of the status pill.
 *
 * Purely presentational: no data loading or navigation. Styles are inline
 * hex colours (not NativeWind classes or theme tokens), so it does not adapt
 * to dark mode. At the time of writing it is not imported by any screen.
 */
import React from 'react';
import { View, Text } from 'react-native';

/**
 * Props for {@link ExamStatusBadge}.
 * - `status`: raw status string from `exam_requests.status` (case-insensitive).
 * - `isEmergency`: the request's emergency flag; the database stores it as the
 *   string 'yes'/'no', but a boolean is also accepted.
 */
interface ExamStatusBadgeProps {
  status: string;
  isEmergency?: string | boolean;
}

/**
 * Renders the optional SOS pill plus the colour-coded status pill in a row.
 * Unknown statuses fall back to a grey pill showing the raw status text.
 */
export const ExamStatusBadge: React.FC<ExamStatusBadgeProps> = ({ status, isEmergency }) => {
  // Normalise the 'yes' string / boolean emergency flag into one boolean.
  const isEmergencyActive = isEmergency === 'yes' || isEmergency === true;

  /**
   * Maps the status to its pill colours and label. 'open' and 'pending' share
   * the same "Finding Scribe" look.
   * @returns `{ bg, text, border, label }` used by the status pill below.
   */
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
      {/* Red SOS pill, only for emergency requests */}
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
      {/* Status pill coloured by getStatusConfig() */}
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
