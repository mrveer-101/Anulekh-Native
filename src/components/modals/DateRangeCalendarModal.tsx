/**
 * DateRangeCalendarModal: A booking.com style date range picker modal.
 *
 * Features:
 * - Single calendar window that lets the user select both From (start) and To (end) dates.
 * - Green color indicator for From (start date).
 * - Orange color indicator for To (end date).
 * - Continuous horizontal shading strip across in-between dates (like Booking.com).
 * - Quick indicator cards at top displaying From and To selections.
 * - Accessible month paging (previous / next month).
 * - Reset/Clear and Apply buttons.
 */
import React, { useState, useEffect } from 'react';
import { View, Text, Modal, TouchableOpacity, ScrollView } from 'react-native';
import { Feather, Ionicons } from '@expo/vector-icons';

export interface DateRangeCalendarModalProps {
  visible: boolean;
  onClose: () => void;
  startDate: string; // DD/MM/YYYY or ''
  endDate: string;   // DD/MM/YYYY or ''
  onApply: (start: string, end: string) => void;
  title?: string;
}

const MONTH_LABELS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function parseDDMMYYYY(value: string): Date | null {
  if (!value) return null;
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

function formatDisplayDate(d: Date | null): string {
  if (!d) return '';
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
}

function toMidnight(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function isSameDay(a: Date | null, b: Date | null): boolean {
  if (!a || !b) return false;
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function isBeforeDay(a: Date, b: Date): boolean {
  return toMidnight(a).getTime() < toMidnight(b).getTime();
}

function isAfterDay(a: Date, b: Date): boolean {
  return toMidnight(a).getTime() > toMidnight(b).getTime();
}

export default function DateRangeCalendarModal({
  visible,
  onClose,
  startDate,
  endDate,
  onApply,
  title = 'Select Date Range',
}: DateRangeCalendarModalProps) {
  const [tempStart, setTempStart] = useState<Date | null>(() => parseDDMMYYYY(startDate));
  const [tempEnd, setTempEnd] = useState<Date | null>(() => parseDDMMYYYY(endDate));
  const [cursor, setCursor] = useState<Date>(() => parseDDMMYYYY(startDate) || new Date());

  useEffect(() => {
    if (visible) {
      const s = parseDDMMYYYY(startDate);
      const e = parseDDMMYYYY(endDate);
      setTempStart(s);
      setTempEnd(e);
      setCursor(s || new Date());
    }
  }, [visible, startDate, endDate]);

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

  const goMonth = (delta: number) => {
    setCursor(new Date(year, month + delta, 1));
  };

  const handleDayPress = (cellDate: Date) => {
    // If no start date, or both start and end are already selected, start fresh with From
    if (!tempStart || (tempStart && tempEnd)) {
      setTempStart(cellDate);
      setTempEnd(null);
    } else if (tempStart && !tempEnd) {
      if (isBeforeDay(cellDate, tempStart)) {
        // Tapped earlier date -> make it new start date
        setTempStart(cellDate);
        setTempEnd(null);
      } else if (isSameDay(cellDate, tempStart)) {
        // Tapped same date -> single day range
        setTempEnd(cellDate);
      } else {
        // Tapped future date -> set as End date
        setTempEnd(cellDate);
      }
    }
  };

  const handleClear = () => {
    setTempStart(null);
    setTempEnd(null);
  };

  const handleApply = () => {
    const startStr = tempStart ? formatDDMMYYYY(tempStart) : '';
    const endStr = tempEnd ? formatDDMMYYYY(tempEnd) : '';
    onApply(startStr, endStr);
    onClose();
  };

  const daysDiff = tempStart && tempEnd
    ? Math.round((toMidnight(tempEnd).getTime() - toMidnight(tempStart).getTime()) / (1000 * 60 * 60 * 24)) + 1
    : 0;

  return (
    <Modal
      animationType="fade"
      transparent
      visible={visible}
      onRequestClose={onClose}
    >
      <TouchableOpacity
        activeOpacity={1}
        onPress={onClose}
        style={{
          flex: 1,
          backgroundColor: 'rgba(15,23,42,0.45)',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 20,
        }}
      >
        <TouchableOpacity
          activeOpacity={1}
          onPress={() => {}}
          style={{
            width: '100%',
            maxWidth: 360,
            backgroundColor: '#ffffff',
            borderRadius: 22,
            padding: 18,
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 10 },
            shadowOpacity: 0.15,
            shadowRadius: 24,
            elevation: 8,
          }}
        >
          {/* Header Row */}
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingBottom: 12,
              borderBottomWidth: 1,
              borderBottomColor: '#f1f5f9',
              marginBottom: 12,
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <View
                style={{
                  width: 30,
                  height: 30,
                  borderRadius: 9,
                  backgroundColor: '#dcfce7',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Feather name="calendar" size={15} color="#16a34a" />
              </View>
              <Text style={{ fontFamily: 'Roboto', fontSize: 15, fontWeight: '800', color: '#0f172a' }}>
                {title}
              </Text>
            </View>

            <TouchableOpacity
              onPress={onClose}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              style={{
                width: 28,
                height: 28,
                borderRadius: 14,
                backgroundColor: '#f1f5f9',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Feather name="x" size={15} color="#64748b" />
            </TouchableOpacity>
          </View>

          {/* Booking.com Style From & To Visual Range Boxes */}
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 8,
              marginBottom: 10,
            }}
          >
            {/* FROM Box (Green) */}
            <View
              style={{
                flex: 1,
                padding: 10,
                borderRadius: 12,
                backgroundColor: tempStart ? '#f0fdf4' : '#f8fafc',
                borderWidth: 1.5,
                borderColor: tempStart ? '#16a34a' : '#e2e8f0',
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                <View
                  style={{
                    width: 14,
                    height: 14,
                    borderRadius: 7,
                    backgroundColor: '#16a34a',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Ionicons name="checkmark" size={10} color="#ffffff" />
                </View>
                <Text style={{ fontFamily: 'Roboto', fontSize: 10.5, fontWeight: '800', color: '#15803d', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  From
                </Text>
              </View>
              <Text
                numberOfLines={1}
                style={{
                  fontFamily: 'Roboto',
                  fontSize: 12,
                  fontWeight: tempStart ? '800' : '500',
                  color: tempStart ? '#0f172a' : '#94a3b8',
                }}
              >
                {tempStart ? formatDisplayDate(tempStart) : 'Select start'}
              </Text>
            </View>

            {/* Connecting Arrow */}
            <View style={{ paddingHorizontal: 2 }}>
              <Feather name="arrow-right" size={16} color="#94a3b8" />
            </View>

            {/* TO Box (Orange) */}
            <View
              style={{
                flex: 1,
                padding: 10,
                borderRadius: 12,
                backgroundColor: tempEnd ? '#fff7ed' : '#f8fafc',
                borderWidth: 1.5,
                borderColor: tempEnd ? '#ea580c' : '#e2e8f0',
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                <View
                  style={{
                    width: 14,
                    height: 14,
                    borderRadius: 7,
                    backgroundColor: '#ea580c',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Feather name="flag" size={8} color="#ffffff" />
                </View>
                <Text style={{ fontFamily: 'Roboto', fontSize: 10.5, fontWeight: '800', color: '#c2410c', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  To
                </Text>
              </View>
              <Text
                numberOfLines={1}
                style={{
                  fontFamily: 'Roboto',
                  fontSize: 12,
                  fontWeight: tempEnd ? '800' : '500',
                  color: tempEnd ? '#0f172a' : '#94a3b8',
                }}
              >
                {tempEnd ? formatDisplayDate(tempEnd) : (tempStart ? 'Tap end date' : 'Select end')}
              </Text>
            </View>
          </View>

          {/* Quick Helper Subtext */}
          <Text
            style={{
              fontFamily: 'Roboto',
              fontSize: 11,
              color: '#64748b',
              textAlign: 'center',
              marginBottom: 10,
            }}
          >
            {!tempStart
              ? 'Tap a date on the calendar to pick start'
              : !tempEnd
              ? 'Now tap a second date to complete the range'
              : `Selected range: ${daysDiff} day${daysDiff > 1 ? 's' : ''}`}
          </Text>

          {/* Month Navigation */}
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: 10,
              paddingHorizontal: 4,
            }}
          >
            <TouchableOpacity
              testID="calendar-prev-month"
              onPress={() => goMonth(-1)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              style={{
                width: 32,
                height: 32,
                borderRadius: 16,
                backgroundColor: '#f8fafc',
                borderWidth: 1,
                borderColor: '#e2e8f0',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Feather name="chevron-left" size={16} color="#334155" />
            </TouchableOpacity>

            <Text style={{ fontFamily: 'Roboto', fontSize: 14, fontWeight: '800', color: '#0f172a' }}>
              {MONTH_LABELS[month]} {year}
            </Text>

            <TouchableOpacity
              testID="calendar-next-month"
              onPress={() => goMonth(1)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              style={{
                width: 32,
                height: 32,
                borderRadius: 16,
                backgroundColor: '#f8fafc',
                borderWidth: 1,
                borderColor: '#e2e8f0',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Feather name="chevron-right" size={16} color="#334155" />
            </TouchableOpacity>
          </View>

          {/* Weekday Row */}
          <View style={{ flexDirection: 'row', marginBottom: 4 }}>
            {WEEKDAY_LABELS.map((w, i) => (
              <View key={i} style={{ width: '14.28%', alignItems: 'center', paddingVertical: 4 }}>
                <Text style={{ fontFamily: 'Roboto', fontSize: 11, fontWeight: '700', color: '#94a3b8' }}>
                  {w}
                </Text>
              </View>
            ))}
          </View>

          {/* Day Grid with Continuous Booking.com Style Shading */}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
            {cells.map((day, idx) => {
              if (day === null) {
                return <View key={`blank-${idx}`} style={{ width: '14.28%', height: 38 }} />;
              }

              const cellDate = new Date(year, month, day);
              const isStart = tempStart ? isSameDay(cellDate, tempStart) : false;
              const isEnd = tempEnd ? isSameDay(cellDate, tempEnd) : false;
              const hasRange = !!(tempStart && tempEnd && !isSameDay(tempStart, tempEnd));
              const inBetween = hasRange && isAfterDay(cellDate, tempStart!) && isBeforeDay(cellDate, tempEnd!);
              const isToday = isSameDay(cellDate, today);

              // Shading strip geometry
              const colIndex = idx % 7;
              const isWeekStart = colIndex === 0;
              const isWeekEnd = colIndex === 6;

              return (
                <View
                  key={`day-${day}`}
                  style={{
                    width: '14.28%',
                    height: 38,
                    alignItems: 'center',
                    justifyContent: 'center',
                    position: 'relative',
                  }}
                >
                  {/* Continuous In-Between Shading Strip */}
                  {inBetween && (
                    <View
                      style={{
                        position: 'absolute',
                        left: 0,
                        right: 0,
                        top: 4,
                        bottom: 4,
                        backgroundColor: '#dcfce7',
                        borderTopLeftRadius: isWeekStart ? 10 : 0,
                        borderBottomLeftRadius: isWeekStart ? 10 : 0,
                        borderTopRightRadius: isWeekEnd ? 10 : 0,
                        borderBottomRightRadius: isWeekEnd ? 10 : 0,
                      }}
                    />
                  )}

                  {/* Start Date Connecting Shading (Right Half) */}
                  {isStart && hasRange && (
                    <View
                      style={{
                        position: 'absolute',
                        left: '50%',
                        right: 0,
                        top: 4,
                        bottom: 4,
                        backgroundColor: '#dcfce7',
                        borderTopRightRadius: isWeekEnd ? 10 : 0,
                        borderBottomRightRadius: isWeekEnd ? 10 : 0,
                      }}
                    />
                  )}

                  {/* End Date Connecting Shading (Left Half) */}
                  {isEnd && hasRange && (
                    <View
                      style={{
                        position: 'absolute',
                        left: 0,
                        right: '50%',
                        top: 4,
                        bottom: 4,
                        backgroundColor: '#dcfce7',
                        borderTopLeftRadius: isWeekStart ? 10 : 0,
                        borderBottomLeftRadius: isWeekStart ? 10 : 0,
                      }}
                    />
                  )}

                  {/* Day Circle Button */}
                  <TouchableOpacity
                    testID={`calendar-day-${day}`}
                    activeOpacity={0.7}
                    onPress={() => handleDayPress(cellDate)}
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: 16,
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: isStart
                        ? '#16a34a'
                        : isEnd
                        ? '#ea580c'
                        : inBetween
                        ? 'transparent'
                        : 'transparent',
                      borderWidth: isToday && !isStart && !isEnd && !inBetween ? 1.5 : 0,
                      borderColor: '#16a34a',
                      shadowColor: isStart ? '#16a34a' : isEnd ? '#ea580c' : 'transparent',
                      shadowOffset: { width: 0, height: 2 },
                      shadowOpacity: (isStart || isEnd) ? 0.35 : 0,
                      shadowRadius: 4,
                      elevation: (isStart || isEnd) ? 3 : 0,
                    }}
                  >
                    <Text
                      style={{
                        fontFamily: 'Roboto',
                        fontSize: 12,
                        fontWeight: (isStart || isEnd) ? '900' : inBetween ? '800' : '600',
                        color: (isStart || isEnd)
                          ? '#ffffff'
                          : inBetween
                          ? '#15803d'
                          : isToday
                          ? '#16a34a'
                          : '#1e293b',
                      }}
                    >
                      {day}
                    </Text>
                  </TouchableOpacity>
                </View>
              );
            })}
          </View>

          {/* Legend Row */}
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 16,
              marginTop: 10,
              paddingTop: 8,
              borderTopWidth: 1,
              borderTopColor: '#f1f5f9',
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#16a34a' }} />
              <Text style={{ fontFamily: 'Roboto', fontSize: 10.5, fontWeight: '700', color: '#475569' }}>
                From
              </Text>
            </View>

            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
              <View style={{ width: 14, height: 6, borderRadius: 3, backgroundColor: '#dcfce7', borderWidth: 1, borderColor: '#86efac' }} />
              <Text style={{ fontFamily: 'Roboto', fontSize: 10.5, fontWeight: '700', color: '#475569' }}>
                Range
              </Text>
            </View>

            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#ea580c' }} />
              <Text style={{ fontFamily: 'Roboto', fontSize: 10.5, fontWeight: '700', color: '#475569' }}>
                To
              </Text>
            </View>
          </View>

          {/* Footer Action Buttons */}
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginTop: 12,
              paddingTop: 10,
              borderTopWidth: 1,
              borderTopColor: '#f1f5f9',
            }}
          >
            <TouchableOpacity
              testID="calendar-clear-button"
              onPress={handleClear}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              style={{ paddingVertical: 6, paddingHorizontal: 6 }}
            >
              <Text style={{ fontFamily: 'Roboto', fontSize: 12.5, fontWeight: '700', color: '#dc2626' }}>
                Clear Range
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              testID="calendar-apply-button"
              activeOpacity={0.8}
              onPress={handleApply}
              style={{
                backgroundColor: '#16a34a',
                paddingHorizontal: 20,
                paddingVertical: 8,
                borderRadius: 10,
                shadowColor: '#16a34a',
                shadowOffset: { width: 0, height: 3 },
                shadowOpacity: 0.25,
                shadowRadius: 6,
                elevation: 3,
              }}
            >
              <Text style={{ fontFamily: 'Roboto', fontSize: 13, fontWeight: '800', color: '#ffffff' }}>
                Apply Range
              </Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}
