import React, { useEffect } from 'react';
import { View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Redirect } from 'expo-router';
import { supabase } from '@/core/supabase';
import { SPLASH_PAPER, SplashBackground, SplashLogo, SplashTitle } from '@/components/ui/BrandSplash';


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
          .select('role, verification_status, aadhar_number, aadhar_image_proof, disability_certificate, location')
          .eq('id', session.user.id)
          .single();

        const isScribe = profile?.role === 'scribe';
        const hasIdProof = !!(profile?.aadhar_number || profile?.aadhar_image_proof || profile?.disability_certificate || profile?.location);
        const isApproved = profile?.verification_status === 'approved' || hasIdProof;

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
    } catch {
      setDestination('/landing');
    } finally {
      setChecked(true);
    }
  };

  if (!checked) {
    // Same paper, clouds and logo as the native splash, so start-up looks like one continuous screen.
    return (
      <View style={{ flex: 1, backgroundColor: SPLASH_PAPER, alignItems: 'center', justifyContent: 'center' }}>
        <StatusBar style="dark" />
        <SplashBackground />
        <SplashLogo />
        <SplashTitle />
      </View>
    );
  }

  return <Redirect href={destination as any} />;
}
