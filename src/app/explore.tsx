/**
 * This file is intentionally empty.
 * The explore.tsx boilerplate has been removed.
 * Navigation is handled via the dashboard tabs.
 */
import { Redirect } from 'expo-router';
export default function ExploreRedirect() {
  return <Redirect href={"/console" as any} />;
}
