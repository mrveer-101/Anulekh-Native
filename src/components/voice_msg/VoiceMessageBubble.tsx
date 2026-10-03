/**
 * VoiceMessageBubble — inline player for a voice note inside a chat message bubble.
 *
 * Used by the chat room screen (app/console/common/chat.tsx) for messages whose type is voice;
 * the audio comes from the `chat_messages` row (a URL or an inline base64 payload) and is passed in
 * as props, so this component does no data loading of its own.
 *
 * Playback is only real on web (HTML5 `Audio`). On iOS/Android the play button merely toggles the
 * icon and shows a fixed 50% progress bar — no audio is played yet.
 */
import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, Platform } from 'react-native';
import { Feather } from '@expo/vector-icons';

/**
 * Props for VoiceMessageBubble.
 * - messageId / formattedTime: passed by the chat screen but currently unused here.
 * - audioUrl: remote audio URL; preferred over base64Audio when both are given.
 * - base64Audio: raw base64 (assumed m4a) or a full `data:` URI.
 * - isMine: true for the current user's own message; switches to light-on-colour styling.
 * - themeColor: role accent colour used for the icon/progress on the other party's bubbles.
 * - duration: length in seconds from the message row; replaced by real metadata once loaded (web).
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

/**
 * Renders a play/pause button, a progress bar and "elapsed / total" labels for one voice note.
 * Side effects (web only): creates an HTML `Audio` element for the source and pauses it on unmount.
 */
export function VoiceMessageBubble({
  audioUrl,
  base64Audio,
  isMine,
  themeColor,
  duration: initialDuration,
}: VoiceMessageBubbleProps) {
  // Playback state: progress is a 0..1 fraction; duration is kept in milliseconds
  // (seconds from props × 1000, or a 3 s placeholder when the row has no duration).
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackProgress, setPlaybackProgress] = useState(0);
  const [duration, setDuration] = useState(
    initialDuration && initialDuration > 0 ? initialDuration * 1000 : 3000
  );
  // The web HTMLAudioElement for the current source (null on native or before setup).
  const audioRef = useRef<any>(null);

  // Resolve a playable source: URL first, else wrap bare base64 in an m4a data URI.
  const audioSource =
    audioUrl ||
    (base64Audio
      ? base64Audio.startsWith('data:')
        ? base64Audio
        : `data:audio/m4a;base64,${base64Audio}`
      : '');

  // Web: (re)create the Audio element whenever the source changes and wire its events to state:
  // real duration once metadata loads, live progress while playing, and reset when it ends.
  useEffect(() => {
    if (Platform.OS === 'web' && typeof window !== 'undefined' && audioSource) {
      const audio = new window.Audio(audioSource);
      audioRef.current = audio;

      audio.onloadedmetadata = () => {
        if (audio.duration && !isNaN(audio.duration)) {
          setDuration(Math.floor(audio.duration * 1000));
        }
      };

      audio.ontimeupdate = () => {
        if (audio.duration) {
          setPlaybackProgress(audio.currentTime / audio.duration);
        }
      };

      audio.onended = () => {
        setIsPlaying(false);
        setPlaybackProgress(0);
      };

      // Stop playback when the bubble unmounts or the source changes.
      return () => {
        audio.pause();
        audioRef.current = null;
      };
    }
  }, [audioSource]);

  /** Toggles playback. Web drives the real Audio element; play() may reject (e.g. autoplay policy). */
  const handlePlayPause = async () => {
    if (Platform.OS === 'web' && audioRef.current) {
      if (isPlaying) {
        audioRef.current.pause();
        setIsPlaying(false);
      } else {
        try {
          await audioRef.current.play();
          setIsPlaying(true);
        } catch (e) {
          console.warn('Audio play error:', e);
        }
      }
    } else {
      // Native placeholder: no audio engine is attached, so only the UI state is toggled.
      setIsPlaying(!isPlaying);
      if (!isPlaying) {
        setPlaybackProgress(0.5);
      } else {
        setPlaybackProgress(0);
      }
    }
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
