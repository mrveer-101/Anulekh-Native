import React from 'react';
import { View, Text, TouchableOpacity, Alert, Platform } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Feather, Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';

export interface StudentRequestCardProps {
  item: any;
  index?: number;
  isExpanded: boolean;
  onToggleExpand: () => void;
  singleRowCollapsed?: boolean;
  onCall?: (item: any) => void;
  onChat?: (item: any) => void;
  onMarkCompleted?: (item: any) => void;
  onChangeScribe?: (item: any) => void;
  onCancelRequest?: (item: any) => void;
  onViewApplications?: (item: any) => void;
  onInviteScribes?: (item: any) => void;
  onSOS?: (item: any) => void;
}

export function StudentRequestCard({
  item,
  index = 0,
  isExpanded,
  onToggleExpand,
  singleRowCollapsed = false,
  onCall,
  onChat,
  onMarkCompleted,
  onChangeScribe,
  onCancelRequest,
  onViewApplications,
  onInviteScribes,
  onSOS,
}: StudentRequestCardProps) {
  const isEmergency = item.is_emergency === 'yes';
  const isMatched = item.status === 'matched' || (!item.status && !!item.scribe_id) || (!!item.scribeProfile && item.status !== 'pending');
  const isCompleted = item.status === 'completed';

  const statusLabel = (() => {
    if (isEmergency) return 'EMERGENCY SOS';
    const st = (item.status || (isMatched ? 'matched' : 'pending')).toLowerCase();
    switch (st) {
      case 'pending': return 'NOT ASSIGNED';
      case 'matched': return 'ASSIGNED';
      case 'completed': return 'COMPLETED';
      case 'cancelled': return 'CANCELLED';
      default: return (item.status || 'ASSIGNED').toUpperCase();
    }
  })();

  const statusColor = (() => {
    if (isEmergency) {
      return { text: '#dc2626', border: '#fca5a5', bg: '#fef2f2' };
    }
    const st = (item.status || (isMatched ? 'matched' : 'pending')).toLowerCase();
    switch (st) {
      case 'pending': return { text: '#2563eb', border: '#bfdbfe', bg: '#eff6ff' };
      case 'matched': return { text: '#059669', border: '#a7f3d0', bg: '#f0fdf4' };
      case 'completed': return { text: '#10b981', border: '#a7f3d0', bg: '#ecfdf5' };
      case 'cancelled': return { text: '#ef4444', border: '#fca5a5', bg: '#fff7f7' };
      default: return { text: '#059669', border: '#a7f3d0', bg: '#f0fdf4' };
    }
  })();

  const cardBorderColor = isEmergency ? '#fca5a5' : (isMatched || isCompleted) ? '#a7f3d0' : '#e2e8f0';

  const handleDefaultChat = () => {
    if (onChat) {
      onChat(item);
    } else {
      const type = item.requestType || (item.is_assignment ? 'assignment' : 'exam');
      router.push(`/console/common/chat?requestId=${item.id}&type=${type}` as any);
    }
  };

  const handleDefaultCall = () => {
    if (onCall) {
      onCall(item);
    } else {
      Alert.alert("Call Scribe", "Calling is available on the day of the exam.");
    }
  };

  const formatDisplayDate = (raw?: string) => {
    if (!raw) return 'Scheduled';
    const parts = raw.split('|');
    const datePart = parts[0].trim();
    const timePart = parts[1] ? parts[1].trim() : '';
    const d = new Date(datePart);
    if (!isNaN(d.getTime())) {
      const formatted = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
      return timePart ? `${formatted}, ${timePart}` : formatted;
    }
    return datePart || raw;
  };

  const rise = FadeInDown.delay(Math.min(index, 6) * 70).duration(420);

  return (
    <Animated.View entering={rise} style={{
      backgroundColor: isEmergency ? '#fffdfd' : '#ffffff',
      borderRadius: 20,
      borderWidth: 1.5,
      borderColor: cardBorderColor,
      shadowColor: '#0f172a',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.05,
      shadowRadius: 12,
      elevation: 2,
      marginBottom: 12,
      overflow: 'hidden',
    }}>
      {singleRowCollapsed ? (
        /* ── Compact One-Row Header (Home Tab) ── */
        <TouchableOpacity
          onPress={onToggleExpand}
          activeOpacity={0.85}
          style={{
            paddingHorizontal: 16,
            paddingVertical: 14,
            backgroundColor: isEmergency ? '#fffdfd' : '#ffffff',
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            {/* Left: Exam Name */}
            <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, marginRight: 12 }}>
              {isEmergency && (
                <Feather name="alert-triangle" size={15} color="#dc2626" style={{ marginRight: 6 }} />
              )}
              <Text
                style={{
                  fontFamily: 'Roboto',
                  fontSize: 15,
                  fontWeight: '800',
                  color: '#0f172a',
                  letterSpacing: -0.2,
                }}
                numberOfLines={1}
              >
                {item.subject || item.assignment_title || 'Exam'}
              </Text>
            </View>

            {/* Right: When it is (Date/Time) + Expand Chevron */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <View style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 5,
                backgroundColor: '#f8fafc',
                paddingHorizontal: 9,
                paddingVertical: 4.5,
                borderRadius: 10,
                borderWidth: 1,
                borderColor: '#e2e8f0',
              }}>
                <Feather name="calendar" size={12} color="#f97316" />
                <Text style={{ fontFamily: 'Roboto', fontSize: 12, fontWeight: '700', color: '#334155' }}>
                  {formatDisplayDate(item.exam_date || item.deadline)}
                </Text>
              </View>

              <View style={{
                width: 26,
                height: 26,
                borderRadius: 13,
                backgroundColor: isExpanded ? 'rgba(37,99,235,0.1)' : '#f1f5f9',
                alignItems: 'center',
                justifyContent: 'center',
              }}>
                <Feather
                  name={isExpanded ? "chevron-up" : "chevron-down"}
                  size={15}
                  color={isExpanded ? "#2563eb" : "#64748b"}
                />
              </View>
            </View>
          </View>

          {/* When expanded in singleRow mode, show meta row with Level & Status pill */}
          {isExpanded && (
            <View style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginTop: 10,
              paddingTop: 10,
              borderTopWidth: 1,
              borderTopColor: '#f1f5f9',
            }}>
              <Text style={{ fontFamily: 'Roboto', fontSize: 11, color: '#64748b' }}>
                Level: {item.exam_type || item.academic_level || 'General'}
              </Text>

              <View style={{
                paddingVertical: 2.5,
                paddingHorizontal: 8,
                borderRadius: 999,
                backgroundColor: statusColor.bg,
                borderWidth: 1,
                borderColor: statusColor.border,
              }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  {isEmergency && <Feather name="alert-triangle" size={9} color={statusColor.text} />}
                  {!isEmergency && (isMatched || isCompleted) && <Feather name="check-circle" size={9} color={statusColor.text} />}
                  <Text style={{ fontFamily: 'Roboto', color: statusColor.text, fontSize: 9.5, fontWeight: '800', letterSpacing: 0.4 }}>
                    {statusLabel}
                  </Text>
                </View>
              </View>
            </View>
          )}
        </TouchableOpacity>
      ) : (
        /* ── Top section: Title & Subtitle on Left, Status Badge on Right ── */
        <TouchableOpacity onPress={onToggleExpand} activeOpacity={0.85} style={{ padding: 16, paddingBottom: 12 }}>
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' }}>
            <View style={{ flex: 1, marginRight: 10 }}>
              <Text style={{ fontFamily: 'Roboto', fontSize: 16, fontWeight: '800', color: '#0f172a', letterSpacing: -0.2 }}>
                {item.subject || item.assignment_title || 'Exam'}
              </Text>
              <Text style={{ fontFamily: 'Roboto', fontSize: 11, color: '#64748b', marginTop: 3 }}>
                Level: {item.exam_type || item.academic_level || 'General'} {item.created_at ? `| Confirmed ${new Date(item.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}` : ''}
              </Text>
            </View>

            {/* Status Badge */}
            <View style={{
              paddingVertical: 3.5, paddingHorizontal: 9, borderRadius: 999,
              backgroundColor: statusColor.bg,
              borderWidth: 1, borderColor: statusColor.border
            }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                {isEmergency && <Feather name="alert-triangle" size={9} color={statusColor.text} />}
                {!isEmergency && (isMatched || isCompleted) && <Feather name="check-circle" size={9} color={statusColor.text} />}
                <Text style={{ fontFamily: 'Roboto', color: statusColor.text, fontSize: 9.5, fontWeight: '800', letterSpacing: 0.4 }}>
                  {statusLabel}
                </Text>
              </View>
            </View>
          </View>

          {/* ── Summary Row: Divider + Date on Left + "Details v" Pill Button on Right ── */}
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#f1f5f9' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, gap: 10 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Feather name="calendar" size={13} color="#f97316" style={{ marginRight: 6 }} />
                <Text style={{ fontFamily: 'Roboto', fontSize: 12, fontWeight: '700', color: '#334155' }}>
                  {item.exam_date ? item.exam_date.split(' ')[0] : (item.deadline ? item.deadline.split(' ')[0] : 'Scheduled')}
                </Text>
              </View>

              {/* Applications Badge (if present) */}
              {item.applicationCount !== undefined && item.applicationCount > 0 && !isMatched && (
                <TouchableOpacity
                  onPress={() => onViewApplications ? onViewApplications(item) : router.push(`/console/student/view_applications?id=${item.id}` as any)}
                  style={{ backgroundColor: '#eff6ff', borderWidth: 1, borderColor: '#bfdbfe', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3 }}
                >
                  <Text style={{ fontFamily: 'Roboto', fontSize: 10, fontWeight: '800', color: '#2563eb' }}>
                    {item.applicationCount} {item.applicationCount === 1 ? 'Applicant' : 'Applicants'}
                  </Text>
                </TouchableOpacity>
              )}
            </View>

            {/* "Details v" / "Collapse ^" Pill Button */}
            <View style={{
              flexDirection: 'row',
              alignItems: 'center',
              backgroundColor: isExpanded ? 'rgba(37,99,235,0.14)' : 'rgba(37,99,235,0.08)',
              borderWidth: 1,
              borderColor: isExpanded ? 'rgba(37,99,235,0.3)' : 'rgba(37,99,235,0.2)',
              paddingHorizontal: 11,
              paddingVertical: 5,
              borderRadius: 12,
              gap: 5
            }}>
              <Text style={{ fontFamily: 'Roboto', fontSize: 11.5, fontWeight: '800', color: '#2563eb' }}>
                {isExpanded ? 'Collapse' : 'Details'}
              </Text>
              <Feather name={isExpanded ? "chevron-up" : "chevron-down"} size={14} color="#2563eb" />
            </View>
          </View>
        </TouchableOpacity>
      )}

      {/* ── Expanded Content ── */}
      {isExpanded && (
        <View>
          {/* Divider */}
          <View style={{ height: 1, backgroundColor: '#f1f5f9', marginHorizontal: 18 }} />

          {/* Exam Center block */}
          <View style={{ paddingHorizontal: 18, paddingVertical: 14 }}>
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
              <Feather name="map-pin" size={18} color="#ef4444" style={{ marginTop: 1 }} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontFamily: 'Roboto', fontSize: 14, fontWeight: '900', color: '#0f172a' }}>
                  Exam Center
                </Text>
                <Text style={{ fontFamily: 'Roboto', fontSize: 12, color: '#64748b', marginTop: 2 }} numberOfLines={2}>
                  {item.exam_venue || 'Exam Center / Venue not specified'}
                </Text>
              </View>
            </View>

            {/* Matched Scribe block */}
            {(isMatched || isCompleted) && item.scribeProfile && (
              <View style={{
                marginTop: 10, backgroundColor: 'rgba(5,150,105,0.07)',
                borderRadius: 14, padding: 12,
                borderWidth: 1, borderColor: 'rgba(5,150,105,0.2)',
                flexDirection: 'row', alignItems: 'center', gap: 10,
              }}>
                <View style={{
                  width: 36, height: 36, borderRadius: 10,
                  backgroundColor: 'rgba(5,150,105,0.12)',
                  alignItems: 'center', justifyContent: 'center',
                }}>
                  <Text style={{ fontFamily: 'Roboto', fontSize: 16, fontWeight: '900', color: '#059669' }}>
                    {item.scribeProfile.full_name?.charAt(0)?.toUpperCase() ?? 'S'}
                  </Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontFamily: 'Roboto', fontSize: 13, fontWeight: '900', color: '#047857' }}>
                    {item.scribeProfile.full_name}
                  </Text>
                  <Text style={{ fontFamily: 'Roboto', fontSize: 11, color: '#064e3b' }}>
                    {item.scribeProfile.role === 'scribe' ? 'Volunteer Scribe · Assigned' : 'Volunteer · Assigned'}
                  </Text>
                </View>
              </View>
            )}
          </View>

          {/* Action Buttons */}
          <View style={{ paddingHorizontal: 18, paddingBottom: 18, gap: 10 }}>
            {/* If pending with no scribe */}
            {!isMatched && !isCompleted ? (
              <View style={{ gap: 10 }}>
                {onSOS && (
                  <TouchableOpacity
                    onPress={() => onSOS(item)}
                    style={{
                      backgroundColor: item.is_emergency === 'yes' ? '#fca5a5' : '#ef4444',
                      borderRadius: 14, paddingVertical: 14,
                      flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
                      shadowColor: '#ef4444', shadowOffset: { width: 0, height: 6 },
                      shadowOpacity: 0.25, shadowRadius: 12, elevation: 5,
                    }}
                    activeOpacity={0.85}
                  >
                    <Feather name="alert-triangle" size={18} color="#fff" />
                    <Text style={{ fontFamily: 'Roboto', fontSize: 15, fontWeight: '900', color: '#fff', letterSpacing: 0.2 }}>
                      {item.is_emergency === 'yes' ? 'SOS Triggered' : '🚨 Call SOS Emergency Scribe'}
                    </Text>
                  </TouchableOpacity>
                )}

                {onInviteScribes && (
                  <TouchableOpacity
                    onPress={() => onInviteScribes(item)}
                    style={{
                      backgroundColor: '#2563eb',
                      borderRadius: 14, paddingVertical: 12,
                      flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
                      shadowColor: '#2563eb', shadowOffset: { width: 0, height: 4 },
                      shadowOpacity: 0.18, shadowRadius: 10, elevation: 4,
                    }}
                    activeOpacity={0.85}
                  >
                    <Feather name="search" size={16} color="#fff" />
                    <Text style={{ fontFamily: 'Roboto', fontSize: 14, fontWeight: '900', color: '#fff' }}>
                      Find & Invite Scribes
                    </Text>
                  </TouchableOpacity>
                )}

                {onViewApplications && (
                  <TouchableOpacity
                    onPress={() => onViewApplications(item)}
                    style={{
                      backgroundColor: '#eff6ff',
                      borderRadius: 14, paddingVertical: 12,
                      flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
                      borderWidth: 1.5, borderColor: '#bfdbfe',
                    }}
                    activeOpacity={0.85}
                  >
                    <Feather name="users" size={16} color="#2563eb" />
                    <Text style={{ fontFamily: 'Roboto', fontSize: 14, fontWeight: '900', color: '#2563eb', letterSpacing: 0.2 }}>
                      View Applications ({item.applicationCount ?? 0})
                    </Text>
                  </TouchableOpacity>
                )}

                {onCancelRequest && (
                  <TouchableOpacity
                    onPress={() => onCancelRequest(item)}
                    style={{
                      paddingVertical: 12,
                      borderRadius: 14, borderWidth: 1.5,
                      borderColor: '#fca5a5', backgroundColor: '#fff7f7',
                      alignItems: 'center', justifyContent: 'center',
                    }}
                    activeOpacity={0.7}
                  >
                    <Text style={{ fontFamily: 'Roboto', fontSize: 13, fontWeight: '800', color: '#ef4444' }}>
                      Cancel Request
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            ) : isMatched ? (
              /* Matched actions (Uniform Grid) */
              <View style={{ gap: 10, marginTop: 4 }}>
                {/* Row 1: Call Scribe + Chat */}
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <TouchableOpacity
                    onPress={handleDefaultCall}
                    style={{
                      flex: 1, backgroundColor: '#2563eb',
                      borderRadius: 12, paddingVertical: 11,
                      flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
                      shadowColor: '#2563eb', shadowOffset: { width: 0, height: 4 },
                      shadowOpacity: 0.15, shadowRadius: 8, elevation: 3,
                    }}
                    activeOpacity={0.85}
                  >
                    <Feather name="phone-call" size={15} color="#fff" />
                    <Text style={{ fontFamily: 'Roboto', fontSize: 13, fontWeight: '800', color: '#fff' }}>
                      Call Scribe
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    onPress={handleDefaultChat}
                    style={{
                      flex: 1, paddingVertical: 11,
                      borderRadius: 12, borderWidth: 1.5,
                      borderColor: '#bfdbfe',
                      backgroundColor: '#eff6ff',
                      flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
                    }}
                    activeOpacity={0.7}
                  >
                    <Feather name="message-square" size={15} color="#2563eb" />
                    <Text style={{ fontFamily: 'Roboto', fontSize: 13, fontWeight: '800', color: '#2563eb' }}>
                      Chat
                    </Text>
                  </TouchableOpacity>
                </View>

                {/* Row 2: Mark Completed */}
                {onMarkCompleted && (
                  <View style={{ flexDirection: 'row', gap: 10 }}>
                    <TouchableOpacity
                      onPress={() => onMarkCompleted(item)}
                      style={{
                        flex: 1, backgroundColor: '#10b981',
                        borderRadius: 12, paddingVertical: 11,
                        flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
                        shadowColor: '#10b981', shadowOffset: { width: 0, height: 4 },
                        shadowOpacity: 0.15, shadowRadius: 8, elevation: 3,
                      }}
                      activeOpacity={0.85}
                    >
                      <Feather name="check-circle" size={15} color="#fff" />
                      <Text style={{ fontFamily: 'Roboto', fontSize: 13, fontWeight: '800', color: '#fff' }}>
                        Mark Completed
                      </Text>
                    </TouchableOpacity>
                  </View>
                )}

                {/* Row 3: Change Scribe + Cancel Request */}
                <View style={{ flexDirection: 'row', gap: 10, marginTop: 4 }}>
                  {onChangeScribe && (
                    <TouchableOpacity
                      onPress={() => onChangeScribe(item)}
                      style={{
                        flex: 1, paddingVertical: 10,
                        borderRadius: 12, borderWidth: 1.5,
                        borderColor: '#f97316', backgroundColor: '#fff7ed',
                        alignItems: 'center', justifyContent: 'center',
                      }}
                      activeOpacity={0.7}
                    >
                      <Text style={{ fontFamily: 'Roboto', fontSize: 12, fontWeight: '800', color: '#ea580c' }}>
                        Change Scribe
                      </Text>
                    </TouchableOpacity>
                  )}

                  {onCancelRequest && (
                    <TouchableOpacity
                      onPress={() => onCancelRequest(item)}
                      style={{
                        flex: 1, paddingVertical: 10,
                        borderRadius: 12, borderWidth: 1.5,
                        borderColor: '#fca5a5', backgroundColor: '#fff7f7',
                        alignItems: 'center', justifyContent: 'center',
                      }}
                      activeOpacity={0.7}
                    >
                      <Text style={{ fontFamily: 'Roboto', fontSize: 12, fontWeight: '800', color: '#ef4444' }}>
                        Cancel Request
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            ) : (
              /* Completed actions */
              <View style={{ gap: 10, marginTop: 4 }}>
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <TouchableOpacity
                    onPress={handleDefaultChat}
                    style={{
                      flex: 1, paddingVertical: 11,
                      borderRadius: 12, borderWidth: 1.5,
                      borderColor: '#bfdbfe',
                      backgroundColor: '#eff6ff',
                      flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
                    }}
                    activeOpacity={0.7}
                  >
                    <Feather name="message-square" size={15} color="#2563eb" />
                    <Text style={{ fontFamily: 'Roboto', fontSize: 13, fontWeight: '800', color: '#2563eb' }}>
                      View Chat History
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </View>
        </View>
      )}
    </Animated.View>
  );
}
