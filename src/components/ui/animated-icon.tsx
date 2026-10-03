/**
 * Native (iOS / Android) start-up splash overlay.
 *
 * Mounted once by the root layout (app/_layout.tsx) on top of the whole app. It
 * renders BrandSplash's SplashOverlay so the hand-off from the OS splash screen to
 * the app looks seamless, then unmounts itself when SplashOverlay calls `onDone`.
 * The web build uses the sibling `animated-icon.web.tsx` instead (Metro picks the
 * `.web` file automatically). Despite the file name, there is no icon here.
 */
import { useCallback, useState } from 'react';
import { Platform } from 'react-native';

import { SplashOverlay } from './BrandSplash';

/** Continues the native splash with the colourful start-up screen (see SplashOverlay), then removes itself. */
export function AnimatedSplashOverlay() {
  // Overlay stays mounted until the animation reports it has finished.
  const [visible, setVisible] = useState(true);
  // Stable callback so SplashOverlay's timer effect (which depends on onDone) is not restarted on re-render.
  const hide = useCallback(() => setVisible(false), []);

  if (!visible) return null;
  // iOS's native splash is the full colourful image (app.json); Android's can only be paper + logo tile.
  return <SplashOverlay variant={Platform.OS === 'ios' ? 'full-image' : 'bloom'} onDone={hide} />;
}
