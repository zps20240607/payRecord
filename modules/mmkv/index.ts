import { createMMKV } from 'react-native-mmkv';

export const storage = createMMKV({ id: 'payrecord-storage' });

export const Keys = {
  APP_WHITELIST: 'app_whitelist',
  PARSE_TEMPLATES: 'parse_templates',
  FIRST_LAUNCH: 'first_launch',
  THEME_MODE: 'theme_mode',
} as const;
