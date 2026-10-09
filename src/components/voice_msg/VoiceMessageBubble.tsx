/**
 * VoiceMessageBubble — inline player for a voice note inside a chat message bubble.
 *
 * Used by the chat room screen (app/console/common/chat.tsx) for messages whose type is voice;
 * the audio comes from the `chat_messages` row (a URL or an old inline base64 payload) and is passed
 * in as props, so this component does no data loading of its own.
 *
 * Playback uses `expo-audio` (`useAudioPlayer`), so it works on iOS, Android and web.
 */
import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';

/**
 * Props for VoiceMessageBubble.
 * - messageId / formattedTime: passed by the chat screen but currently unused here.
 * - audioUrl: remote audio URL; preferred over base64Audio when both are given.
 * - base64Audio: raw base64 (assumed m4a) or a full `data:` URI (old messages).
 * - isMine: true for the current user's own message; switches to light-on-colour styling.
 * - themeColor: role accent colour used for the icon/progress on the other party's bubbles.
 * - duration: length in seconds from the message row; replaced by the real length once loaded.
 */
export interface VoiceMessageBubbleProps {
  messageId?: number;
  audioUrl?: string;
  base64Audio?: string;
  isMine: boolean;
  themeColor: string;
  formattedTime?: string;
  duration?: number;
}

/** Renders a play/pause button, a progress bar and "elapsed / total" labels for one voice note. */
export function VoiceMessageBubble({
  audioUrl,
  base64Audio,
  isMine,
  themeColor,
  duration: initialDuration,
}: VoiceMessageBubbleProps) {
  // Resolve a playable source: URL first, else wrap bare base64 in an m4a data URI.
  const audioSource =
    audioUrl ||
    (base64Audio
      ? base64Audio.startsWith('data:')
        ? base64Audio
        : `data:audio/m4a;base64,${base64Audio}`
      : null);

  // One player per bubble; the status hook re-renders as playback moves.
  const player = useAudioPlayer(audioSource);
  const status = useAudioPlayerStatus(player);
  const isPlaying = status.playing;

  // Duration in ms: the real length once loaded, else the row's value, else a 3 s placeholder.
  const duration = status.duration > 0
    ? status.duration * 1000
    : (initialDuration && initialDuration > 0 ? initialDuration * 1000 : 3000);
  const playbackProgress = status.duration > 0 ? Math.min(1, status.currentTime / status.duration) : 0;

  /** Toggles playback; a finished note starts again from the beginning. */
  const handlePlayPause = async () => {
    if (!audioSource) return;
    if (isPlaying) {
      player.pause();
      return;
    }
    if (status.didJustFinish || (status.duration > 0 && status.currentTime >= status.duration - 0.05)) {
      await player.seekTo(0);
    }
    player.play();
  };

  /** Formats milliseconds as m:ss (e.g. 65000 -> "1:05"); 0 or NaN-ish input gives "0:00". */
  const formatDuration = (millis: number) => {
    if (!millis) return '0:00';
    const totalSecs = Math.floor(millis / 1000);
    const mins = Math.floor(totalSecs / 60);
    const secs = totalSecs % 60;
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 4, width: 200 }}>
      {/* Round play/pause button */}
      <TouchableOpacity
        onPress={handlePlayPause}
        style={{
          width: 36,
          height: 36,
          borderRadius: 18,
          backgroundColor: isMine ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.05)',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Feather
          name={isPlaying ? 'pause' : 'play'}
          size={16}
          color={isMine ? '#fff' : themeColor}
        />
      </TouchableOpacity>

      {/* Progress track + elapsed/total time labels */}
      <View style={{ flex: 1 }}>
        <View
          style={{
            height: 4,
            backgroundColor: isMine ? 'rgba(255,255,255,0.3)' : '#e2e8f0',
            borderRadius: 2,
            overflow: 'hidden',
          }}
        >
          <View
            style={{
              height: '100%',
              width: `${playbackProgress * 100}%`,
              backgroundColor: isMine ? '#fff' : themeColor,
            }}
          />
        </View>

        {/* Left: elapsed time (duration × progress); right: total duration */}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 }}>
          <Text
            style={{
              fontSize: 9,
              color: isMine ? 'rgba(255,255,255,0.6)' : '#64748b',
              fontFamily: 'Roboto',
            }}
          >
            {duration ? formatDuration(duration * playbackProgress) : '0:00'}
          </Text>
          <Text
            style={{
              fontSize: 9,
              color: isMine ? 'rgba(255,255,255,0.6)' : '#64748b',
              fontFamily: 'Roboto',
            }}
          >
            {duration ? formatDuration(duration) : 'Voice Note'}
          </Text>
        </View>
      </View>
    </View>
  );
}
