import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, Platform } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useLanguage } from '@/core/translation';

export interface VoiceMessageBubbleProps {
  messageId?: number;
  audioUrl?: string;
  base64Audio?: string;
  isMine: boolean;
  themeColor: string;
  formattedTime?: string;
  duration?: number;
}

export function VoiceMessageBubble({
  audioUrl,
  base64Audio,
  isMine,
  themeColor,
  duration: initialDuration,
}: VoiceMessageBubbleProps) {
  const { t } = useLanguage();
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackProgress, setPlaybackProgress] = useState(0);
  const [duration, setDuration] = useState(
    initialDuration && initialDuration > 0 ? initialDuration * 1000 : 3000
  );
  const audioRef = useRef<any>(null);

  const audioSource =
    audioUrl ||
    (base64Audio
      ? base64Audio.startsWith('data:')
        ? base64Audio
        : `data:audio/m4a;base64,${base64Audio}`
      : '');

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

      return () => {
        audio.pause();
        audioRef.current = null;
      };
    }
  }, [audioSource]);

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
      setIsPlaying(!isPlaying);
      if (!isPlaying) {
        setPlaybackProgress(0.5);
      } else {
        setPlaybackProgress(0);
      }
    }
  };

  const formatDuration = (millis: number) => {
    if (!millis) return '0:00';
    const totalSecs = Math.floor(millis / 1000);
    const mins = Math.floor(totalSecs / 60);
    const secs = totalSecs % 60;
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 4, width: 200 }}>
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
