import React, { createContext, useContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

type ThemeMode = 'light' | 'dark';

interface ThemeContextType {
  themeMode: ThemeMode;
  isDark: boolean;
  toggleTheme: () => void;
  setThemeMode: (mode: ThemeMode) => void;
}

const ThemeContext = createContext<ThemeContextType>({
  themeMode: 'light',
  isDark: false,
  toggleTheme: () => {},
  setThemeMode: () => {},
});

const THEME_STORAGE_KEY = '@anulekh_theme_mode';

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [themeMode, setThemeState] = useState<ThemeMode>('light');

  useEffect(() => {
    // Load saved theme, default to 'light' (white theme)
    AsyncStorage.getItem(THEME_STORAGE_KEY).then((saved) => {
      if (saved === 'dark' || saved === 'light') {
        setThemeState(saved);
      } else {
        setThemeState('light');
      }
    }).catch(() => setThemeState('light'));
  }, []);

  const setThemeMode = (mode: ThemeMode) => {
    setThemeState(mode);
    AsyncStorage.setItem(THEME_STORAGE_KEY, mode).catch(console.error);
  };

  const toggleTheme = () => {
    const nextMode = themeMode === 'light' ? 'dark' : 'light';
    setThemeMode(nextMode);
  };

  return (
    <ThemeContext.Provider
      value={{
        themeMode,
        isDark: themeMode === 'dark',
        toggleTheme,
        setThemeMode,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
};

export const useThemeMode = () => useContext(ThemeContext);
