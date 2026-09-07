import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';

export type StudentRequestTab = 'requests' | 'assignments' | 'past_scribes';

interface RequestFilterBarProps {
  activeTab: StudentRequestTab;
  onTabChange: (tab: StudentRequestTab) => void;
  requestCount?: number;
  assignmentCount?: number;
  pastScribeCount?: number;
}

export const RequestFilterBar: React.FC<RequestFilterBarProps> = ({
  activeTab,
  onTabChange,
  requestCount = 0,
  assignmentCount = 0,
  pastScribeCount = 0,
}) => {
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
