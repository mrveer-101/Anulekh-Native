import React from 'react';
import { View, StyleProp, ViewStyle } from 'react-native';
import Svg, { Path, Circle, Line } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';

/**
 * 4x3 or customizable dot matrix cluster for background aesthetics.
 */
export const DotCluster: React.FC<{
  rows?: number;
  cols?: number;
  dotSize?: number;
  gap?: number;
  color?: string;
  style?: StyleProp<ViewStyle>;
}> = ({
  rows = 4,
  cols = 3,
  dotSize = 4.5,
  gap = 9,
  color = '#93C5FD',
  style,
}) => {
  return (
    <View style={[{ pointerEvents: 'none' }, style]}>
      {Array.from({ length: rows }).map((_, r) => (
        <View key={r} style={{ flexDirection: 'row', marginVertical: gap / 2 }}>
          {Array.from({ length: cols }).map((_, c) => (
            <View
              key={c}
              style={{
                width: dotSize,
                height: dotSize,
                borderRadius: dotSize / 2,
                backgroundColor: color,
                marginHorizontal: gap / 2,
                opacity: 0.65,
              }}
            />
          ))}
        </View>
      ))}
    </View>
  );
};

/**
 * Authentic 4-color Google "G" logo in SVG.
 */
export const GoogleGLogo: React.FC<{ size?: number }> = ({ size = 26 }) => {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
        fill="#4285F4"
      />
      <Path
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        fill="#34A853"
      />
      <Path
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
        fill="#FBBC05"
      />
      <Path
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
        fill="#EA4335"
      />
    </Svg>
  );
};

/**
 * Waving Hand with yellow sparkle rays matching user reference.
 */
export const WavingHandIcon: React.FC<{ size?: number; color?: string }> = ({
  size = 32,
  color = '#2563EB',
}) => {
  return (
    <View style={{ width: size + 6, height: size + 6, position: 'relative', justifyContent: 'center', alignItems: 'center' }}>
      {/* Sparkle rays */}
      <Svg width={size + 8} height={size + 8} viewBox="0 0 40 40" style={{ position: 'absolute' }}>
        <Line x1="30" y1="6" x2="33" y2="2" stroke="#F59E0B" strokeWidth="2.5" strokeLinecap="round" />
        <Line x1="36" y1="12" x2="40" y2="10" stroke="#F59E0B" strokeWidth="2.5" strokeLinecap="round" />
        <Line x1="24" y1="4" x2="25" y2="0" stroke="#F59E0B" strokeWidth="2" strokeLinecap="round" />
      </Svg>
      <Ionicons name="hand-left-outline" size={size} color={color} style={{ transform: [{ rotate: '12deg' }] }} />
    </View>
  );
};

/**
 * User Plus Icon with yellow sparkle rays matching user reference.
 */
export const UserPlusSparkleIcon: React.FC<{ size?: number; color?: string }> = ({
  size = 30,
  color = '#2563EB',
}) => {
  return (
    <View style={{ width: size + 6, height: size + 6, position: 'relative', justifyContent: 'center', alignItems: 'center' }}>
      {/* Sparkle rays */}
      <Svg width={size + 8} height={size + 8} viewBox="0 0 40 40" style={{ position: 'absolute' }}>
        <Line x1="30" y1="6" x2="34" y2="2" stroke="#F59E0B" strokeWidth="2.5" strokeLinecap="round" />
        <Line x1="36" y1="12" x2="40" y2="10" stroke="#F59E0B" strokeWidth="2.5" strokeLinecap="round" />
      </Svg>
      <Ionicons name="person-add" size={size} color={color} />
    </View>
  );
};
