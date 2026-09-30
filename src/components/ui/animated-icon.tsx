import { useCallback, useState } from 'react';
import { Platform } from 'react-native';

import { SplashOverlay } from './BrandSplash';

/** Continues the native splash with the colourful start-up screen (see SplashOverlay), then removes itself. */
export function AnimatedSplashOverlay() {
  const [visible, setVisible] = useState(true);
  const hide = useCallback(() => setVisible(false), []);

  if (!visible) return null;
  // iOS's native splash is the full colourful image (app.json); Android's can only be paper + logo tile.
  return <SplashOverlay variant={Platform.OS === 'ios' ? 'full-image' : 'bloom'} onDone={hide} />;
}
