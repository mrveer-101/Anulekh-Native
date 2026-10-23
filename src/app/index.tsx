/**
 * Root route ("/") — the start-up router.
 *
 * Expo Router opens this screen first. It never shows real content: while it
 * checks the stored session it renders the branded splash (paper background,
 * clouds, logo, title) so start-up looks continuous with the native splash, and
 * then issues a <Redirect> to the right place:
 *   - no session (or any error)        -> /landing
 *   - profile not yet verified          -> /console/{scribe|student}/complete_profile
 *   - verified scribe                   -> /console/scribe
 *   - verified student (default role)   -> /console/student
 *
 * Data: reads the session via `supabase.auth.getSession()` and one row of the
 * `profiles` table. Note `supabase` here is the app's own shim (core/supabase.ts)
 * that talks to the Rust/Axum backend, not the real Supabase SDK.
 */
import React, { useEffect } from 'react';
import { View, Platform } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Redirect } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '@/core/supabase';
import { SPLASH_PAPER, SplashBackground, SplashLogo, SplashTitle } from '@/components/ui/BrandSplash';


/**
 * App Entry Point
 * 
 * Checks if the user has an active session. If yes, routes to their dashboard.
 * If no session, routes to the Landing screen.
 */
export default function AppEntry() {
  // `checked` flips to true once the session lookup finishes (success or failure);
  // `destination` is the route we will redirect to.
  const [checked, setChecked] = React.useState(false);
  const [destination, setDestination] = React.useState<string | null>(null);

  // Run the session check once on mount.
  useEffect(() => {
    checkSession();
  }, []);

  /**
   * Looks up the stored session and the user's profile, then picks the redirect
   * destination. Any failure (e.g. backend unreachable) falls back to /landing.
   */
  const checkSession = async () => {
    try {
      let { data: { session } } = await supabase.auth.getSession();

      // On web app: if no session exists yet, default to test student so the web app opens directly to the Home dashboard
      if (!session && Platform.OS === 'web') {
        const defaultSession = {
          user: {
            id: 'std_test_id',
            email: 'student@test.com',
            role: 'student',
          },
        };
        await AsyncStorage.setItem('local_db_session', JSON.stringify(defaultSession));
        session = defaultSession as any;
      }

      if (session) {
        // Fetch only the fields needed to decide role and verification state.
        const [{ data: profile }, skippedFlag] = await Promise.all([
          supabase
            .from('profiles')
            .select('role, verification_status, aadhar_number, aadhar_image_proof, disability_certificate, location')
            .eq('id', session.user.id)
            .single(),
          AsyncStorage.getItem(`onboarding_skipped_${session.user.id}`).catch(() => null),
        ]);

        // A user counts as "approved" if the backend says so, OR they skipped onboarding,
        // OR they have already submitted any ID/profile detail.
        const isScribe = profile?.role === 'scribe';
        const hasIdProof = !!(profile?.aadhar_number || profile?.aadhar_image_proof || profile?.disability_certificate || profile?.location);
        const isApproved = profile?.verification_status === 'approved' || hasIdProof || skippedFlag === 'true';

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

  // Check finished: hand off to the chosen route (cast because the path is computed at runtime).
  return <Redirect href={destination as any} />;
}
