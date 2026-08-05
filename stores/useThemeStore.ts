import { create } from 'zustand';
import { storage, Keys } from '../modules/mmkv';
import { Appearance } from 'react-native';

export type ThemeMode = 'light' | 'dark' | 'system';

interface ThemeState {
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
  loadTheme: () => void;
}

export const useThemeStore = create<ThemeState>((set) => ({
  mode: 'system',

  loadTheme: () => {
    const saved = storage.getString(Keys.THEME_MODE) as ThemeMode | undefined;
    if (saved && ['light', 'dark', 'system'].includes(saved)) {
      set({ mode: saved });
    }
  },

  setMode: (mode) => {
    storage.set(Keys.THEME_MODE, mode);
    set({ mode });
  },
}));

export function isDarkMode(mode: ThemeMode): boolean {
  if (mode === 'system') {
    return Appearance.getColorScheme() === 'dark';
  }
  return mode === 'dark';
}
