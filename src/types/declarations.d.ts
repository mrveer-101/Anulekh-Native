import 'react-native';

declare module '*.module.css' {
  const classes: { [key: string]: string };
  export default classes;
}

declare module '*.css' {
  const content: any;
  export default content;
}

declare module 'react-native' {
  interface ViewStyle {
    backdropFilter?: string;
  }
}
