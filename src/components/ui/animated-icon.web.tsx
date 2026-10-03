/**
 * Web build of the start-up splash overlay.
 *
 * Metro resolves `@/components/ui/animated-icon` to this `.web.tsx` file when
 * bundling for the browser, and to the sibling `animated-icon.tsx` on iOS/Android.
 * The root layout (app/_layout.tsx) mounts `<AnimatedSplashOverlay />` once on
 * every platform, so this stub must keep the same export name and signature.
 */
// Web has no native splash to continue from; the branded loading screen in app/index.tsx covers start-up.
/** No-op overlay for web: renders nothing so the root layout can mount it unconditionally. */
export function AnimatedSplashOverlay() {
  return null;
}
