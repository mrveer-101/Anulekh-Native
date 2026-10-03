/**
 * RequestFilterBar - a pill-style segmented control for the student's requests area.
 *
 * Renders three equal-width tabs ("Exam Requests", "Direct Hires", "My Scribes"),
 * highlights the active one with a white raised pill, and shows a count badge on a
 * tab when its count is above zero. Purely presentational: it loads no data and keeps
 * no state; the parent owns the selected tab and the counts.
 *
 * Note: not imported anywhere at the time of writing (StudentRequestsView draws its own tabs).
 */
import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';

/** Keys of the three tabs; the parent stores one of these as its active tab. */
export type StudentRequestTab = 'requests' | 'assignments' | 'past_scribes';

/**
 * Props for RequestFilterBar.
 * @property activeTab       Currently selected tab.
 * @property onTabChange     Called with the tab key when the user taps a tab.
 * @property requestCount    Badge count for "Exam Requests" (badge hidden when 0).
 * @property assignmentCount Badge count for "Direct Hires" (badge hidden when 0).
 * @property pastScribeCount Badge count for "My Scribes" (badge hidden when 0).
 */
interface RequestFilterBarProps {
  activeTab: StudentRequestTab;
  onTabChange: (tab: StudentRequestTab) => void;
  requestCount?: number;
  assignmentCount?: number;
  pastScribeCount?: number;
}

/** Controlled three-tab filter bar; see the file header for behaviour. */
export const RequestFilterBar: React.FC<RequestFilterBarProps> = ({
  activeTab,
  onTabChange,
  requestCount = 0,
  assignmentCount = 0,
  pastScribeCount = 0,
}) => {
  // Tab definitions in display order, paired with the count shown in each badge.
  const tabs: { key: StudentRequestTab; label: string; count: number }[] = [
    { key: 'requests', label: 'Exam Requests', count: requestCount },
    { key: 'assignments', label: 'Direct Hires', count: assignmentCount },
    { key: 'past_scribes', label: 'My Scribes', count: pastScribeCount },
  ];

  return (
    <View
      style={{
        flexDirection: 'row',
        backgroundColor: '#F3F4F6',
        borderRadius: 12,
        padding: 4,
        marginHorizontal: 16,
        marginVertical: 12,
      }}
    >
      {/* One flex:1 button per tab; the active tab gets a white background and a soft shadow. */}
      {tabs.map(tab => {
        const isActive = activeTab === tab.key;
        return (
          <TouchableOpacity
            key={tab.key}
            onPress={() => onTabChange(tab.key)}
            style={{
              flex: 1,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              paddingVertical: 8,
              borderRadius: 10,
              backgroundColor: isActive ? '#FFFFFF' : 'transparent',
              shadowColor: isActive ? '#000' : 'transparent',
              shadowOffset: { width: 0, height: 1 },
              shadowOpacity: isActive ? 0.08 : 0,
              shadowRadius: 2,
              elevation: isActive ? 2 : 0,
              gap: 6,
            }}
          >
            <Text
              style={{
                fontSize: 13,
                fontWeight: isActive ? '700' : '500',
                color: isActive ? '#1F2937' : '#6B7280',
              }}
            >
              {tab.label}
            </Text>
            {/* Count badge: only rendered when there is something to count. */}
            {tab.count > 0 && (
              <View
                style={{
                  backgroundColor: isActive ? '#2563EB' : '#E5E7EB',
                  paddingHorizontal: 6,
                  paddingVertical: 2,
                  borderRadius: 9999,
                }}
              >
                <Text
                  style={{
                    fontSize: 10,
                    fontWeight: '700',
                    color: isActive ? '#FFFFFF' : '#4B5563',
                  }}
                >
                  {tab.count}
                </Text>
              </View>
            )}
          </TouchableOpacity>
        );
      })}
    </View>
  );
};
