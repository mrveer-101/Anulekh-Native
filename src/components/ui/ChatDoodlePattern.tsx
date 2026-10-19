/**
 * ChatDoodlePattern — WhatsApp-style subtle icon doodle wallpaper background.
 *
 * Renders an organic, staggered pattern of cute, non-filled outline icons
 * (stars, hearts, paper planes, books, music notes, coffee mugs, pencils, etc.)
 * in black with low transparency (default 0.045).
 */
import React, { memo } from 'react';
import { View, StyleProp, ViewStyle, Platform } from 'react-native';
import { Feather, Ionicons } from '@expo/vector-icons';

interface DoodleItem {
  type: 'feather' | 'ionicon';
  name: string;
  size: number;
  rotate: string;
}

// 40 distinct cute, non-filled outline icons with varied natural rotation angles and sizes
const DOODLE_POOL: DoodleItem[] = [
  { type: 'feather', name: 'heart', size: 17, rotate: '-10deg' },
  { type: 'ionicon', name: 'sparkles-outline', size: 19, rotate: '8deg' },
  { type: 'feather', name: 'coffee', size: 18, rotate: '0deg' },
  { type: 'ionicon', name: 'pencil-outline', size: 18, rotate: '15deg' },
  { type: 'feather', name: 'star', size: 17, rotate: '-6deg' },
  { type: 'feather', name: 'music', size: 18, rotate: '12deg' },
  { type: 'ionicon', name: 'bulb-outline', size: 19, rotate: '-8deg' },
  { type: 'feather', name: 'send', size: 17, rotate: '14deg' },
  { type: 'ionicon', name: 'school-outline', size: 19, rotate: '-5deg' },
  { type: 'feather', name: 'smile', size: 18, rotate: '6deg' },
  { type: 'feather', name: 'book-open', size: 18, rotate: '-12deg' },
  { type: 'ionicon', name: 'planet-outline', size: 20, rotate: '10deg' },
  { type: 'feather', name: 'headphones', size: 18, rotate: '-7deg' },
  { type: 'ionicon', name: 'chatbubbles-outline', size: 19, rotate: '5deg' },
  { type: 'feather', name: 'sun', size: 19, rotate: '0deg' },
  { type: 'feather', name: 'feather', size: 18, rotate: '-15deg' },
  { type: 'ionicon', name: 'leaf-outline', size: 18, rotate: '12deg' },
  { type: 'feather', name: 'clock', size: 17, rotate: '-4deg' },
  { type: 'ionicon', name: 'diamond-outline', size: 18, rotate: '9deg' },
  { type: 'feather', name: 'camera', size: 17, rotate: '-8deg' },
  { type: 'feather', name: 'moon', size: 17, rotate: '14deg' },
  { type: 'ionicon', name: 'rocket-outline', size: 19, rotate: '-12deg' },
  { type: 'feather', name: 'gift', size: 18, rotate: '6deg' },
  { type: 'feather', name: 'compass', size: 18, rotate: '-10deg' },
  { type: 'ionicon', name: 'flower-outline', size: 18, rotate: '8deg' },
  { type: 'feather', name: 'cloud', size: 18, rotate: '0deg' },
  { type: 'feather', name: 'bell', size: 17, rotate: '-6deg' },
  { type: 'feather', name: 'award', size: 19, rotate: '11deg' },
  { type: 'ionicon', name: 'game-controller-outline', size: 19, rotate: '-8deg' },
  { type: 'feather', name: 'key', size: 17, rotate: '15deg' },
  { type: 'feather', name: 'zap', size: 17, rotate: '-12deg' },
  { type: 'ionicon', name: 'color-palette-outline', size: 18, rotate: '7deg' },
  { type: 'feather', name: 'message-circle', size: 18, rotate: '-5deg' },
  { type: 'feather', name: 'umbrella', size: 18, rotate: '10deg' },
  { type: 'ionicon', name: 'happy-outline', size: 18, rotate: '-6deg' },
  { type: 'feather', name: 'globe', size: 18, rotate: '4deg' },
  { type: 'feather', name: 'radio', size: 17, rotate: '-14deg' },
  { type: 'ionicon', name: 'infinite-outline', size: 19, rotate: '12deg' },
  { type: 'feather', name: 'map-pin', size: 17, rotate: '-7deg' },
  { type: 'ionicon', name: 'airplane-outline', size: 18, rotate: '10deg' },
];

export interface ChatDoodlePatternProps {
  /** Low transparency opacity level. Defaults to 0.048 for a subtle watermark appearance. */
  opacity?: number;
  /** Tint color of the non-filled outline icons. Defaults to '#000000'. */
  color?: string;
  /** Optional container style override. */
  style?: StyleProp<ViewStyle>;
}

// 22 staggered rows with 7 items per row provide full coverage on all mobile screen heights
const ROWS = Array.from({ length: 24 });
const ITEMS_PER_ROW = 7;

export const ChatDoodlePattern = memo(function ChatDoodlePattern({
  opacity = 0.048,
  color = '#000000',
  style,
}: ChatDoodlePatternProps) {
  return (
    <View
      pointerEvents="none"
      style={[
        {
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          overflow: 'hidden',
          opacity,
          zIndex: 0,
        },
        style,
      ]}
    >
      <View style={{ flex: 1, paddingVertical: 12, justifyContent: 'space-around' }}>
        {ROWS.map((_, rowIndex) => {
          const isOdd = rowIndex % 2 === 1;
          const offset = rowIndex * 5;

          return (
            <View
              key={rowIndex}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-around',
                paddingLeft: isOdd ? 26 : 4,
                paddingRight: isOdd ? 4 : 26,
                marginVertical: 4,
              }}
            >
              {Array.from({ length: ITEMS_PER_ROW }).map((_, colIndex) => {
                const itemIndex = (offset + colIndex) % DOODLE_POOL.length;
                const item = DOODLE_POOL[itemIndex];

                return (
                  <View
                    key={colIndex}
                    style={{
                      width: 44,
                      height: 44,
                      alignItems: 'center',
                      justifyContent: 'center',
                      transform: [{ rotate: item.rotate }],
                    }}
                  >
                    {item.type === 'feather' ? (
                      <Feather
                        name={item.name as any}
                        size={item.size}
                        color={color}
                      />
                    ) : (
                      <Ionicons
                        name={item.name as any}
                        size={item.size}
                        color={color}
                      />
                    )}
                  </View>
                );
              })}
            </View>
          );
        })}
      </View>
    </View>
  );
});

export default ChatDoodlePattern;
