import React, { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { router } from 'expo-router';
import { supabase } from '../core/supabase';

export default function ConsoleIndex() {
  useEffect(() => {
    const routeSession = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
          router.replace('/landing');
          return;
        }

        const { data: profile } = await supabase
          .from('profiles')
          .select('role')
          .eq('id', session.user.id)
          .single();

        if (profile?.role === 'scribe') {
          router.replace('/console/scribe');
        } else {
          router.replace('/console/student');
        }
      } catch (err) {
        router.replace('/landing');
      }
    };

    routeSession();
  }, []);

  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#f0f4ff' }}>
      <ActivityIndicator size="large" color="#2563eb" />
    </View>
  );
}
