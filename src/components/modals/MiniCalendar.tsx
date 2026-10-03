/**
 * MiniCalendar: a small month-grid date picker shown in a fade-in, transparent `Modal`.
 *
 * Used by the scribe "Explore" tab (components/scribe/ScribeExploreView.tsx) to pick the
 * from/to dates of the exam-date filter. Dates go in and out as `DD/MM/YYYY` strings
 * (empty string = no date). No data is loaded; it is purely presentational.
 *
 * Behaviour: tapping the dimmed backdrop closes it; tapping a day, "Today" or "Clear" calls
 * `onSelect` and then `onClose`. Prev/next chevrons page through months. The selected day is
 * filled green and today's date gets a green ring.
 */
import React, { useState } from 'react';
import { View, Text, Modal, TouchableOpacity } from 'react-native';
import { Feather } from '@expo/vector-icons';

/**
 * Props for {@link MiniCalendar}.
 * - `visible` / `onClose`: controlled visibility of the modal.
 * - `onSelect`: receives the picked date as `DD/MM/YYYY`, or `''` when the user taps "Clear".
 * - `title`: optional heading shown above the month header.
 */
interface MiniCalendarProps {
  visible: boolean;
  onClose: () => void;
  /** Currently selected date in DD/MM/YYYY format, or empty string for none. */
  value: string;
  onSelect: (value: string) => void;
  title?: string;
}

/** Full month names, indexed by `Date.getMonth()` (0 = January). */
const MONTH_LABELS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
/** Single-letter weekday column headers; the grid starts on Sunday to match `Date.getDay()`. */
const WEEKDAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

/**
 * Parses a `D/M/YYYY` or `DD/MM/YYYY` string into a local-time Date.
 * @returns The Date, or `null` if the string doesn't match the pattern. Note that out-of-range
 * parts are not rejected: JS Date rolls them over (e.g. 31/02 becomes early March).
 */
function parseDDMMYYYY(value: string): Date | null {
  const m = value.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  const d = new Date(parseInt(m[3], 10), parseInt(m[2], 10) - 1, parseInt(m[1], 10));
  return isNaN(d.getTime()) ? null : d;
}

/** Formats a Date as zero-padded `DD/MM/YYYY` (the inverse of `parseDDMMYYYY`). */
function formatDDMMYYYY(d: Date): string {
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}/${d.getFullYear()}`;
}

/**
 * Month-grid date picker modal. See the file header for behaviour.
 * `cursor` holds the first-of-month currently being displayed (independent of the selected value).
 */
export default function MiniCalendar({ visible, onClose, value, onSelect, title }: MiniCalendarProps) {
  // `selected` is derived from the controlled `value`; `cursor` is the month on screen.
  const selected = parseDDMMYYYY(value);
  const [cursor, setCursor] = useState(() => selected || new Date());

  // Re-sync the visible month whenever the popover is (re)opened for a given value.
  React.useEffect(() => {
    if (visible) setCursor(parseDDMMYYYY(value) || new Date());
  }, [visible, value]);

  // Grid geometry for the displayed month: how many blank cells precede day 1, and how many days it has
  // (day 0 of next month = last day of this month).
  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const firstDayOfMonth = new Date(year, month, 1);
  const startWeekday = firstDayOfMonth.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  // Flat list of grid cells: `null` = leading blank, number = day of month. Rendered 7 per row via flex-wrap.
  const cells: (number | null)[] = [
    ...Array(startWeekday).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  // Calendar-day equality, ignoring the time of day.
  const today = new Date();
  const isSameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

  /** Moves the visible month by `delta` (-1 = previous, +1 = next); Date handles year rollover. */
  const goMonth = (delta: number) => setCursor(new Date(year, month + delta, 1));

  // Outer TouchableOpacity is the dimmed backdrop (tap = close); the inner one swallows taps so
  // pressing inside the card doesn't close it. onRequestClose handles the Android back button.
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
                // Empty spacer before the 1st so day 1 lands under the right weekday.
                return <View key={idx} style={{ width: `${100 / 7}%`, aspectRatio: 1 }} />;
              }
              // Real day cell: highlight if it's the selected date or today.
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
