import React, { useEffect, useRef } from 'react';
import { Animated, Platform, Text, TouchableOpacity, View } from 'react-native';
import { Feather } from '@expo/vector-icons';

interface CallRestrictionBannerProps {
  visible: boolean;
  onDismiss: () => void;
  message?: string;
  durationMs?: number;
}

/**
 * Top floating notification banner displayed when a student or scribe taps Call
 * more than 24 hours before the scheduled exam date.
 * Styled after the system update banner with smooth spring entrance and auto-dismissal.
 */
export function CallRestrictionBanner({
  visible,
  onDismiss,
  message = 'Call allowed 24hr before exam date',
  durationMs = 3800,
}: CallRestrictionBannerProps) {
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      anim.setValue(0);
      Animated.sequence([
        Animated.spring(anim, {
          toValue: 1,
          tension: 80,
          friction: 9,
          useNativeDriver: true,
        }),
        Animated.delay(durationMs),
        Animated.timing(anim, {
          toValue: 0,
          duration: 300,
          useNativeDriver: true,
        }),
      ]).start(({ finished }) => {
        if (finished) {
          onDismiss();
        }
      });
    }
  }, [visible, durationMs, onDismiss]);

  if (!visible) return null;

  return (
    <Animated.View
      testID="call-restriction-banner"
      style={{
        position: 'absolute',
        top: Platform.OS === 'web' ? 18 : 50,
        left: 20,
        right: 20,
        maxWidth: 420,
        alignSelf: 'center',
        zIndex: 999999,
        opacity: anim,
        transform: [
          {
            translateY: anim.interpolate({
              inputRange: [0, 1],
              outputRange: [-30, 0],
            }),
          },
        ],
        backgroundColor: '#ffffff',
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderRadius: 18,
        flexDirection: 'row',
        alignItems: 'center',
        borderWidth: 1.5,
        borderColor: '#fcd34d', // warm amber border
        shadowColor: '#0f172a',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.15,
        shadowRadius: 18,
        elevation: 10,
        gap: 12,
      }}
    >
      <View
        style={{
          width: 36,
          height: 36,
          borderRadius: 12,
          backgroundColor: '#fef3c7',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Feather name="phone-call" size={17} color="#d97706" />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontFamily: 'Roboto', fontSize: 13, fontWeight: '800', color: '#0f172a' }}>
          {message}
        </Text>
        <Text style={{ fontFamily: 'Roboto', fontSize: 11, color: '#64748b', marginTop: 2, fontWeight: '500' }}>
          Direct phone calls unlock 24 hours prior to exam time. Please use Chat to coordinate.
        </Text>
      </View>
      <TouchableOpacity
        testID="btn-dismiss-call-banner"
        onPress={onDismiss}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        style={{
          width: 26,
          height: 26,
          borderRadius: 13,
          backgroundColor: '#f1f5f9',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Feather name="x" size={14} color="#64748b" />
      </TouchableOpacity>
    </Animated.View>
  );
}
