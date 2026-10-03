/**
 * Ambient TypeScript declarations for the whole app.
 *
 * - Lets TypeScript accept `import x from './file.css'` / `*.module.css` imports, which the
 *   web build (Metro / react-native-web) resolves but `tsc` would otherwise reject.
 * - Augments React Native's `ViewStyle` with the web-only `backdropFilter` property so
 *   frosted-glass styles can be written without casts.
 *
 * Nothing here emits code; it only affects type checking.
 */
import 'react-native';

/** CSS Modules: each class name in the stylesheet maps to its generated class string. */
declare module '*.module.css' {
  const classes: { [key: string]: string };
  export default classes;
}

/** Plain (global) CSS imports, used only for their side effect of injecting styles on web. */
declare module '*.css' {
  const content: any;
  export default content;
}

/** Module augmentation: extra style keys React Native's types don't know about. */
declare module 'react-native' {
  /** `backdropFilter` (e.g. `'blur(12px)'`) is honoured by react-native-web only; native ignores it. */
  interface ViewStyle {
    backdropFilter?: string;
  }
}
