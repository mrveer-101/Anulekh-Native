import React, { useState } from 'react';
import { View, Text, Modal, TouchableOpacity } from 'react-native';
import { Feather } from '@expo/vector-icons';

interface MiniCalendarProps {
  visible: boolean;
  onClose: () => void;
  /** Currently selected date in DD/MM/YYYY format, or empty string for none. */
  value: string;
  onSelect: (value: string) => void;
  title?: string;
}

const MONTH_LABELS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const WEEKDAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

function parseDDMMYYYY(value: string): Date | null {
  const m = value.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  const d = new Date(parseInt(m[3], 10), parseInt(m[2], 10) - 1, parseInt(m[1], 10));
  return isNaN(d.getTime()) ? null : d;
}

function formatDDMMYYYY(d: Date): string {
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}/${d.getFullYear()}`;
}

export default function MiniCalendar({ visible, onClose, value, onSelect, title }: MiniCalendarProps) {
  const selected = parseDDMMYYYY(value);
  const [cursor, setCursor] = useState(() => selected || new Date());

  // Re-sync the visible month whenever the popover is (re)opened for a given value.
  React.useEffect(() => {
    if (visible) setCursor(parseDDMMYYYY(value) || new Date());
  }, [visible, value]);

  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const firstDayOfMonth = new Date(year, month, 1);
  const startWeekday = firstDayOfMonth.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const cells: (number | null)[] = [
    ...Array(startWeekday).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  const today = new Date();
  const isSameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

  const goMonth = (delta: number) => setCursor(new Date(year, month + delta, 1));

  return (
    <Modal animationType="fade" transparent visible={visible} onRequestClose={onClose}>
      <TouchableOpacity
        activeOpacity={1}
        onPress={onClose}
        style={{ flex: 1, backgroundColor: 'rgba(15,23,42,0.4)', alignItems: 'center', justifyContent: 'center', padding: 24 }}
      >
        <TouchableOpacity activeOpacity={1} onPress={() => {}} style={{ width: '100%', maxWidth: 340, backgroundColor: '#fff', borderRadius: 20, padding: 16, shadowColor: '#000', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.15, shadowRadius: 24, elevation: 6 }}>
          {!!title && (
            <Text style={{ fontFamily: 'Roboto', fontSize: 13, fontWeight: '800', color: '#0f172a', marginBottom: 10 }}>{title}</Text>
          )}

          {/* Month header */}
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <TouchableOpacity onPress={() => goMonth(-1)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} style={{ padding: 4 }}>
              <Feather name="chevron-left" size={18} color="#475569" />
            </TouchableOpacity>
            <Text style={{ fontFamily: 'Roboto', fontSize: 14, fontWeight: '900', color: '#0f172a' }}>
              {MONTH_LABELS[month]} {year}
            </Text>
            <TouchableOpacity onPress={() => goMonth(1)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} style={{ padding: 4 }}>
              <Feather name="chevron-right" size={18} color="#475569" />
            </TouchableOpacity>
          </View>

          {/* Weekday row */}
          <View style={{ flexDirection: 'row', marginBottom: 4 }}>
            {WEEKDAY_LABELS.map((w, i) => (
              <View key={i} style={{ flex: 1, alignItems: 'center', paddingVertical: 4 }}>
                <Text style={{ fontSize: 10, fontWeight: '800', color: '#94a3b8' }}>{w}</Text>
              </View>
            ))}
          </View>

          {/* Day grid */}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
            {cells.map((day, idx) => {
              if (day === null) {
                return <View key={idx} style={{ width: `${100 / 7}%`, aspectRatio: 1 }} />;
              }
              const cellDate = new Date(year, month, day);
              const isSelected = selected ? isSameDay(cellDate, selected) : false;
              const isToday = isSameDay(cellDate, today);

              return (
                <View key={idx} style={{ width: `${100 / 7}%`, aspectRatio: 1, alignItems: 'center', justifyContent: 'center' }}>
                  <TouchableOpacity
                    onPress={() => {
                      onSelect(formatDDMMYYYY(cellDate));
                      onClose();
                    }}
                    style={{
                      width: 32, height: 32, borderRadius: 16,
                      alignItems: 'center', justifyContent: 'center',
                      backgroundColor: isSelected ? '#16a34a' : 'transparent',
                      borderWidth: isToday && !isSelected ? 1 : 0,
                      borderColor: '#16a34a',
                    }}
                  >
                    <Text style={{ fontSize: 12, fontWeight: isSelected ? '900' : '600', color: isSelected ? '#fff' : '#0f172a' }}>
                      {day}
                    </Text>
                  </TouchableOpacity>
                </View>
              );
            })}
          </View>

          {/* Footer actions */}
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 14, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#f1f5f9' }}>
            <TouchableOpacity
              onPress={() => { onSelect(''); onClose(); }}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Text style={{ fontSize: 12, fontWeight: '700', color: '#dc2626' }}>Clear</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => { onSelect(formatDDMMYYYY(today)); onClose(); }}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Text style={{ fontSize: 12, fontWeight: '700', color: '#16a34a' }}>Today</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}
