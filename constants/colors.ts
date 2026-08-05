// 颜色常量 — 浅色为主，深色模式通过 useColors() hook 在组件中动态获取
// StyleSheet.create 中的颜色引用在模块加载时固定，不会随主题变化
// 需要深色模式的组件请使用 useColors() 替代 Colors

export const Colors = {
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

export { useColors, ColorProvider, useThemedStyles, LightColors, DarkColors } from './theme';
export type { AppColors } from './theme';
