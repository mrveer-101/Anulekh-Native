/**
 * Console entry route (`/console`).
 *
 * A pure redirect screen: it shows a spinner while it works out where the signed-in user
 * belongs, then `router.replace`s them (so Back never returns here):
 *   - no session            -> `/landing`
 *   - profile.role 'scribe' -> `/console/scribe`
 *   - any other role        -> `/console/student`
 *   - any error             -> `/landing`
 *
 * Data: reads the current session from `supabase.auth` and the `role` column of the user's
 * row in `profiles`. (`supabase` is the app's own client shim that talks to the Rust/Axum
 * backend, not the hosted Supabase service.)
 */
import React, { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { router } from 'expo-router';
import { supabase } from '@/core/supabase';

/**
 * Role-based redirector for `/console`. Renders only a centred loading spinner; all the work
 * happens in a one-shot effect on mount.
 */
export default function ConsoleIndex() {
  // Runs once on mount: resolve the session and role, then replace the route.
  useEffect(() => {
    /** Looks up the session + profile role and navigates to the matching portal. */
    const routeSession = async () => {
      try {
        // Step 1: not signed in -> send to the public landing page.
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
          router.replace('/landing');
          return;
        }

        // Step 2: read the user's role from `profiles` to pick the portal.
        const { data: profile } = await supabase
          .from('profiles')
          .select('role')
          .eq('id', session.user.id)
          .single();

        // Anything that isn't explicitly 'scribe' (including a missing profile) lands in the student portal.
        if (profile?.role === 'scribe') {
          router.replace('/console/scribe?tab=home');
        } else {
          router.replace('/console/student?tab=home');
        }
      } catch {
        // Network/backend failure: fall back to the landing page rather than hanging on the spinner.
        router.replace('/landing');
      }
    };

    routeSession();
  }, []);

  // Placeholder UI shown for the brief moment before the redirect fires.
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#f0f4ff' }}>
      <ActivityIndicator size="large" color="#2563eb" />
    </View>
  );
}
