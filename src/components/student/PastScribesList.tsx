/**
 * PastScribesList — the "Past Scribes" sub-tab of the student Requests tab (StudentRequestsView).
 *
 * Shows the scribes the student has already worked with, a name search, and per scribe:
 * rating, education / location chips, "View Profile" (reviews modal) and "Invite Privately".
 * Pure UI: the parent loads `scribes` and handles both actions. Two cards per row on desktop.
 */
import React, { useState } from 'react';
import { View, Text, TextInput, Pressable, FlatList } from 'react-native';
import { Feather, Ionicons } from '@expo/vector-icons';
import { gradient, STUDENT_THEME as THEME } from '@/core/portalTheme';
import { DesktopCell, desktopRowStyle, useDesktopColumns, useInDesktopShell } from '@/components/ui/DesktopShell';

type Props = {
  scribes: any[];                      // `profiles` rows of scribes from the student's past exams
  onViewProfile: (scribe: any) => void;
  onInvite: (scribe: any) => void;
};

const nameOf = (s: any) => s.full_name || s.official_name || 'Scribe';

/** Small grey chip with an icon, e.g. education or location. */
function Chip({ icon, label, color = '#475569' }: { icon: React.ComponentProps<typeof Feather>['name']; label: string; color?: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#f8fafc', borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 10, paddingHorizontal: 9, paddingVertical: 5 }}>
      <Feather name={icon} size={12} color={color} />
      <Text numberOfLines={1} style={{ fontFamily: 'Roboto', fontSize: 11.5, fontWeight: '700', color }}>{label}</Text>
    </View>
  );
}

/** One past scribe: identity + rating, chips, and the two actions. */
function ScribeCard({ scribe, onViewProfile, onInvite }: { scribe: any } & Omit<Props, 'scribes'>) {
  const hasReviews = scribe.reviews_count > 0;
  const rating = hasReviews ? Number(scribe.rating || 5).toFixed(1) : 'New';
  const reviews = `${scribe.reviews_count || 0} review${scribe.reviews_count === 1 ? '' : 's'}`;

  return (
    <View style={{ backgroundColor: '#ffffff', borderRadius: 22, borderWidth: 1.5, borderColor: THEME.cardBorder, padding: 16, marginBottom: 14, shadowColor: THEME.shadow, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.07, shadowRadius: 14, elevation: 3 }}>
      {/* Identity + rating */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <View style={[{ width: 50, height: 50, borderRadius: 25, backgroundColor: THEME.hero, alignItems: 'center', justifyContent: 'center' }, gradient(THEME.heroGradient)]}>
          <Text style={{ fontFamily: 'Roboto', fontSize: 19, fontWeight: '900', color: THEME.accentText }}>{nameOf(scribe).charAt(0).toUpperCase()}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text numberOfLines={1} style={{ fontFamily: 'Roboto', fontSize: 16, fontWeight: '900', color: '#0f172a' }}>{nameOf(scribe)}</Text>
          <Text numberOfLines={1} style={{ fontFamily: 'Roboto', fontSize: 12, color: '#64748b', marginTop: 2 }}>{scribe.occupation || 'Volunteer Scribe'}</Text>
        </View>
        <View accessibilityLabel={`Rating ${rating}, ${reviews}`} style={{ alignItems: 'flex-end' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: hasReviews ? '#fef9c3' : '#f1f5f9', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 4 }}>
            <Ionicons name="star" size={12} color={hasReviews ? '#ca8a04' : '#94a3b8'} />
            <Text style={{ fontFamily: 'Roboto', fontSize: 12.5, fontWeight: '900', color: '#1e293b' }}>{rating}</Text>
          </View>
          <Text style={{ fontFamily: 'Roboto', fontSize: 10.5, color: '#94a3b8', marginTop: 3 }}>{reviews}</Text>
        </View>
      </View>

      {/* Quick facts */}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 14 }}>
        <Chip icon="book" label={scribe.education_level || 'Undergraduate'} />
        <Chip icon="map-pin" label={scribe.location || 'Location not set'} />
        <Chip icon="check-circle" label="Verified" color="#047857" />
      </View>

      {/* Actions */}
      <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
        <Pressable
          onPress={() => onViewProfile(scribe)}
          accessibilityRole="button"
          accessibilityLabel={`View profile of ${nameOf(scribe)}`}
          style={({ pressed }) => ({ flex: 1, flexDirection: 'row', gap: 6, alignItems: 'center', justifyContent: 'center', paddingVertical: 11, borderRadius: 14, backgroundColor: THEME.soft, borderWidth: 1, borderColor: THEME.softBorder, opacity: pressed ? 0.8 : 1 })}
        >
          <Feather name="user" size={14} color={THEME.accentText} />
          <Text style={{ fontFamily: 'Roboto', fontSize: 12.5, fontWeight: '800', color: THEME.accentText }}>View Profile</Text>
        </Pressable>
        <Pressable
          onPress={() => onInvite(scribe)}
          accessibilityRole="button"
          accessibilityLabel={`Invite ${nameOf(scribe)} privately to an exam`}
          style={({ pressed }) => [{ flex: 1, flexDirection: 'row', gap: 6, alignItems: 'center', justifyContent: 'center', paddingVertical: 11, borderRadius: 14, backgroundColor: THEME.solid, opacity: pressed ? 0.85 : 1 }, gradient(THEME.buttonGradient)]}
        >
          <Feather name="send" size={14} color="#ffffff" />
          <Text style={{ fontFamily: 'Roboto', fontSize: 12.5, fontWeight: '800', color: '#ffffff' }}>Invite Privately</Text>
        </Pressable>
      </View>
    </View>
  );
}

export default function PastScribesList({ scribes, onViewProfile, onInvite }: Props) {
  const inShell = useInDesktopShell();
  const columns = useDesktopColumns();
  const [query, setQuery] = useState('');
  const shown = scribes.filter((s) => nameOf(s).toLowerCase().includes(query.trim().toLowerCase()));
  const side = inShell ? 0 : 24;

  return (
    <View style={{ flex: 1 }}>
      {/* Search by name */}
      <View style={{ flexDirection: 'row', alignItems: 'center', marginHorizontal: side, marginBottom: 12, backgroundColor: '#ffffff', borderRadius: 16, borderWidth: 1.5, borderColor: THEME.cardBorder, paddingHorizontal: 12 }}>
        <Feather name="search" size={16} color="#64748b" />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search past scribes by name..."
          placeholderTextColor="#94a3b8"
          accessibilityLabel="Search past scribes by name"
          style={{ flex: 1, fontFamily: 'Roboto', fontSize: 13, fontWeight: '600', color: '#0f172a', paddingVertical: 11, paddingHorizontal: 8 }}
        />
        {query.length > 0 && (
          <Pressable onPress={() => setQuery('')} accessibilityRole="button" accessibilityLabel="Clear search" hitSlop={8}>
            <Feather name="x" size={15} color="#64748b" />
          </Pressable>
        )}
      </View>

      {/* Count line */}
      {scribes.length > 0 && (
        <Text style={{ fontFamily: 'Roboto', fontSize: 12, fontWeight: '700', color: '#64748b', marginHorizontal: side, marginBottom: 10 }}>
          {shown.length} scribe{shown.length === 1 ? '' : 's'} you have worked with
        </Text>
      )}

      <FlatList
        style={{ flex: 1 }}
        key={`cols-${columns}`}
        numColumns={columns}
        columnWrapperStyle={desktopRowStyle(columns)}
        data={shown}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={{ paddingHorizontal: side, paddingBottom: 40 }}
        renderItem={({ item }) => (
          <DesktopCell columns={columns}>
            <ScribeCard scribe={item} onViewProfile={onViewProfile} onInvite={onInvite} />
          </DesktopCell>
        )}
        ListEmptyComponent={
          <View style={{ backgroundColor: '#ffffff', padding: 30, borderRadius: 22, borderWidth: 1.5, borderColor: THEME.cardBorder, alignItems: 'center' }}>
            <View style={{ width: 60, height: 60, borderRadius: 30, backgroundColor: THEME.soft, alignItems: 'center', justifyContent: 'center' }}>
              <Feather name="users" size={26} color={THEME.accentText} />
            </View>
            <Text style={{ fontFamily: 'Roboto', fontSize: 15, fontWeight: '900', color: '#0f172a', marginTop: 12 }}>
              {query ? 'No matching scribes' : 'No past scribes yet'}
            </Text>
            <Text style={{ fontFamily: 'Roboto', fontSize: 12, color: '#64748b', marginTop: 4, textAlign: 'center' }}>
              {query ? 'Try a different name.' : 'Scribes from your completed exams appear here.'}
            </Text>
          </View>
        }
      />
    </View>
  );
}
