import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, Platform, Alert } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system';
import { useLanguage } from '../../app/core/translation';

export interface VoiceMessageBubbleProps {
  messageId: number;
  base64Audio: string;
  isMine: boolean;
  themeColor: string;
  formattedTime: string;
}

export function VoiceMessageBubble({ base64Audio, isMine, themeColor, formattedTime }: VoiceMessageBubbleProps) {
  const { t } = useLanguage();
  const [sound, setSound] = useState<Audio.Sound | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [localUri, setLocalUri] = useState<string | null>(null);
  const [playbackProgress, setPlaybackProgress] = useState(0);
  const [duration, setDuration] = useState(0);

  useEffect(() => {
    return () => {
      if (sound) {
        sound.unloadAsync();
      }
    };
  }, [sound]);

  const loadAndPlaySound = async () => {
    try {
      let playUri = localUri;

      if (!playUri) {
        if (Platform.OS === 'web') {
          const byteCharacters = atob(base64Audio);
          const byteNumbers = new Array(byteCharacters.length);
          for (let i = 0; i < byteCharacters.length; i++) {
            byteNumbers[i] = byteCharacters.charCodeAt(i);
          }
          const byteArray = new Uint8Array(byteNumbers);
          const blob = new Blob([byteArray], { type: 'audio/m4a' });
          playUri = URL.createObjectURL(blob);
        } else {
          const tempFilename = `${(FileSystem as any).cacheDirectory || (FileSystem as any).documentDirectory}voice_${Date.now()}.m4a`;
          await FileSystem.writeAsStringAsync(tempFilename, base64Audio, {
            encoding: FileSystem.EncodingType.Base64,
          });
          playUri = tempFilename;
        }
        setLocalUri(playUri);
      }

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
      });

      const { sound: newSound } = await Audio.Sound.createAsync(
        { uri: playUri },
        { shouldPlay: true },
        (status) => {
          if (status.isLoaded) {
            if (status.durationMillis) {
              setDuration(status.durationMillis);
              setPlaybackProgress(status.positionMillis / status.durationMillis);
            }
            if (status.didJustFinish) {
              setIsPlaying(false);
              setPlaybackProgress(0);
              newSound.setPositionAsync(0);
            }
          }
        }
      );

      setSound(newSound);
      setIsPlaying(true);
    } catch (err) {
      console.error('Failed to load sound:', err);
      Alert.alert(t('error'), 'ઓડિયો પ્લેબેકમાં નિષ્ફળતા.');
    }
  };

  const handlePlayPause = async () => {
    if (sound) {
      if (isPlaying) {
        await sound.pauseAsync();
        setIsPlaying(false);
      } else {
        await sound.playAsync();
        setIsPlaying(true);
      }
    } else {
      await loadAndPlaySound();
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
          width: 36, height: 36, borderRadius: 18,
          backgroundColor: isMine ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.05)',
          alignItems: 'center', justifyContent: 'center'
        }}
      >
        <Feather 
          name={isPlaying ? "pause" : "play"} 
          size={16} 
          color={isMine ? '#fff' : themeColor} 
        />
      </TouchableOpacity>
      
      <View style={{ flex: 1 }}>
        <View style={{ height: 4, backgroundColor: isMine ? 'rgba(255,255,255,0.3)' : '#e2e8f0', borderRadius: 2, overflow: 'hidden' }}>
          <View style={{ height: '100%', width: `${playbackProgress * 100}%`, backgroundColor: isMine ? '#fff' : themeColor }} />
        </View>
        
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 }}>
          <Text style={{ fontSize: 9, color: isMine ? 'rgba(255,255,255,0.6)' : '#64748b', fontFamily: 'Roboto' }}>
            {duration ? formatDuration(duration * playbackProgress) : '0:00'}
          </Text>
          <Text style={{ fontSize: 9, color: isMine ? 'rgba(255,255,255,0.6)' : '#64748b', fontFamily: 'Roboto' }}>
            {duration ? formatDuration(duration) : 'વોઇસ નોટ'}
          </Text>
        </View>
      </View>
    </View>
  );
}
