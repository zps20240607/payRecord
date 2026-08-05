import { create } from 'zustand';
import type { PayRecord } from '../modules/record/types';
import * as db from '../modules/db';
import { startOfDay, startOfMonth, endOfDay, endOfMonth, subMonths } from '../utils/date';

interface RecordState {
  records: PayRecord[];
  todayExpense: number;
  todayIncome: number;
  monthExpense: number;
  monthIncome: number;
  lastMonthExpense: number;
  lastMonthIncome: number;
  loading: boolean;
  loadRecords: (options?: Parameters<typeof db.getRecords>[0]) => Promise<void>;
  addRecord: (record: PayRecord) => Promise<void>;
  updateRecord: (record: Partial<PayRecord> & { id: string }) => Promise<void>;
  removeRecord: (id: string) => Promise<void>;
  refreshDashboard: () => Promise<void>;
}

export const useRecordStore = create<RecordState>((set, get) => ({
  records: [],
  todayExpense: 0,
  todayIncome: 0,
  monthExpense: 0,
  monthIncome: 0,
  lastMonthExpense: 0,
  lastMonthIncome: 0,
  loading: false,

  loadRecords: async (options) => {
    set({ loading: true });
    const records = await db.getRecords(options);
    set({ records, loading: false });
  },

  addRecord: async (record) => {
    await db.insertRecord(record);
    await get().refreshDashboard();
  },

  updateRecord: async (record) => {
    await db.updateRecord(record);
    await get().refreshDashboard();
  },

  removeRecord: async (id) => {
    await db.deleteRecord(id);
    await get().refreshDashboard();
  },

  refreshDashboard: async () => {
    set({ loading: true });
    try {
      const now = Date.now();
      const [
        records,
        todayExpense,
        todayIncome,
        monthExpense,
        monthIncome,
        lastMonthExpense,
        lastMonthIncome,
      ] = await Promise.all([
        db.getRecords({ endTime: endOfMonth(now), status: 'confirmed', limit: 100 }),
        db.getTotalByRange(startOfDay(now), endOfDay(now), 'expense'),
        db.getTotalByRange(startOfDay(now), endOfDay(now), 'income'),
        db.getTotalByRange(startOfMonth(now), endOfMonth(now), 'expense'),
        db.getTotalByRange(startOfMonth(now), endOfMonth(now), 'income'),
        db.getTotalByRange(startOfMonth(subMonths(now, 1)), endOfMonth(subMonths(now, 1)), 'expense'),
        db.getTotalByRange(startOfMonth(subMonths(now, 1)), endOfMonth(subMonths(now, 1)), 'income'),
      ]);
      set({
        records, todayExpense, todayIncome, monthExpense, monthIncome,
        lastMonthExpense, lastMonthIncome, loading: false,
      });
    } catch (e) {
      console.error('refreshDashboard error:', e);
      set({ loading: false });
    }
  },
}));
