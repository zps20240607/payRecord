import { create } from 'zustand';
import { storage, Keys } from '../modules/mmkv';

export const DEFAULT_WHITELIST = ['com.eg.android.AlipayGphone', 'com.tencent.mm', 'com.unionpay'];

interface AppState {
  whitelist: string[];
  firstLaunch: boolean;
  loadSettings: () => void;
  setWhitelist: (list: string[]) => void;
  markLaunched: () => void;
}

export const useAppStore = create<AppState>((set) => ({
  whitelist: DEFAULT_WHITELIST,
  firstLaunch: true,

  loadSettings: () => {
    const whitelist = storage.getString(Keys.APP_WHITELIST);
    const firstLaunch = storage.getBoolean(Keys.FIRST_LAUNCH) ?? true;
    set({
      whitelist: whitelist ? JSON.parse(whitelist) : DEFAULT_WHITELIST,
      firstLaunch,
    });
  },

  setWhitelist: (list) => {
    storage.set(Keys.APP_WHITELIST, JSON.stringify(list));
    set({ whitelist: list });
  },

  markLaunched: () => {
    storage.set(Keys.FIRST_LAUNCH, false);
    set({ firstLaunch: false });
  },
}));
