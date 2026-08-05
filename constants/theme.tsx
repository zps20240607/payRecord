import React, { createContext, useContext, useEffect, useMemo, useRef } from 'react';
import { Appearance, AppState } from 'react-native';
import { useThemeStore } from '../stores/useThemeStore';

export const LightColors = {
  primary: '#4A90D9',
  background: '#F5F7FA',
  surface: '#FFFFFF',
  text: '#1A1A2E',
  textSecondary: '#8E8E93',
  border: '#E8ECF0',
  danger: '#FF3B30',
  success: '#34C759',
  warning: '#FF9500',
  gradient: {
    blue: '#4A90D9',
    blueLight: '#7BB3F0',
    green: '#34C759',
    greenLight: '#6EE08A',
  },
};

export const DarkColors = {
  primary: '#5A9FE8',
  background: '#0D1117',
  surface: '#161B22',
  text: '#E6EDF3',
  textSecondary: '#8B949E',
  border: '#30363D',
  danger: '#F85149',
  success: '#3FB950',
  warning: '#D29922',
  gradient: {
    blue: '#5A9FE8',
    blueLight: '#79B8FF',
    green: '#3FB950',
    greenLight: '#56D364',
  },
};

export type AppColors = typeof LightColors;

const ColorContext = createContext<AppColors>(LightColors);

/** 更新全局 Colors 对象（供 colors.ts 使用） */
export function _updateColors(colors: AppColors) {
  (globalThis as any).__PAYRECORD_COLORS__ = colors;
}

export function ColorProvider({ children }: { children: React.ReactNode }) {
  const mode = useThemeStore((s) => s.mode);
  const [systemScheme, setSystemScheme] = React.useState(Appearance.getColorScheme());

  useEffect(() => {
    // 实时监听系统主题变化
    const sub = Appearance.addChangeListener(({ colorScheme }) => {
      setSystemScheme(colorScheme);
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    // App 回到前台时也检测一次（兜底）
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        setSystemScheme(Appearance.getColorScheme());
      }
    });
    return () => sub.remove();
  }, []);

  const dark = mode === 'system' ? systemScheme === 'dark' : mode === 'dark';
  const colors = useMemo(() => (dark ? DarkColors : LightColors), [dark]);

  _updateColors(colors);

  return (
    <ColorContext.Provider value={colors}>
      {children}
    </ColorContext.Provider>
  );
}

export function useColors(): AppColors {
  return useContext(ColorContext);
}

export function useThemedStyles<T extends Record<string, any>>(
  factory: (colors: AppColors) => T
): T {
  const colors = useColors();
  return useMemo(() => factory(colors), [colors, factory]);
}
