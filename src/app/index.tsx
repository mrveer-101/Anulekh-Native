import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Animated,
  Dimensions,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Redirect, router } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '@/core/supabase';

const { width, height } = Dimensions.get('window');

/**
 * App Entry Point
 * 
 * Checks if the user has an active session. If yes, routes to their dashboard.
 * If no session, routes to the Landing screen.
 */
export default function AppEntry() {
  const [checked, setChecked] = React.useState(false);
  const [destination, setDestination] = React.useState<string | null>(null);

  useEffect(() => {
    checkSession();
  }, []);

  const checkSession = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('role, verification_status')
          .eq('id', session.user.id)
          .single();

        const isScribe = profile?.role === 'scribe';
        const isApproved = profile?.verification_status === 'approved';

        if (!isApproved) {
          setDestination(isScribe ? '/console/scribe/complete_profile' : '/console/student/complete_profile');
        } else if (isScribe) {
          setDestination('/console/scribe');
        } else {
          setDestination('/console/student');
        }
      } else {
        setDestination('/landing');
      }
    } catch (_) {
      setDestination('/landing');
    } finally {
      setChecked(true);
    }
  };

  if (!checked) {
    return (
      <View style={{ flex: 1, backgroundColor: '#f0f4ff', alignItems: 'center', justifyContent: 'center' }}>
        <StatusBar style="dark" />
        <View style={{
          width: 80, height: 80, borderRadius: 24,
          backgroundColor: 'rgba(255,255,255,0.85)',
          borderWidth: 1.5, borderColor: 'rgba(37,99,235,0.25)',
          alignItems: 'center', justifyContent: 'center',
          marginBottom: 16,
          shadowColor: '#2563eb', shadowOffset: { width: 0, height: 8 },
          shadowOpacity: 0.2, shadowRadius: 20, elevation: 10,
          overflow: 'hidden',
        }}>
          <Image 
            source={require('../../assets/images/custom/Pen_Logo.jpg')}
            style={{ width: '100%', height: '100%' }}
            resizeMode="cover"
          />
        </View>
        <Text style={{ fontSize: 28, color: '#0f172a', fontWeight: '900', letterSpacing: -0.8 }}>
          Anulekh
        </Text>
        <Text style={{ fontSize: 14, color: '#475569', fontWeight: '600', marginTop: 4 }}>
          A Scribe for every Voice
        </Text>
      </View>
    );
  }

  return <Redirect href={destination as any} />;
}
