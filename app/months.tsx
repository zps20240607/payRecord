import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, useThemedStyles, useColors } from '../constants/colors';
import type { AppColors } from '../constants/colors';
import { TrendChart } from '../components/TrendChart';
import * as db from '../modules/db';
import { formatMoney, startOfMonth, endOfMonth } from '../utils/date';

export default function MonthsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { type } = useLocalSearchParams<{ type?: string }>();
  const isIncome = type === 'income';
  const [data, setData] = useState<{ day: string; total: number }[]>([]);
  const [monthOffset, setMonthOffset] = useState(0);
  const styles = useThemedStyles(createStyles);
  const colors = useColors();

  const load = useCallback(async () => {
    const now = new Date();
    const months: { start: number; end: number; label: string }[] = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i - monthOffset, 1);
      months.push({
        start: startOfMonth(d.getTime()),
        end: endOfMonth(d.getTime()),
        label: `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}`,
      });
    }
    const results = await db.getMonthlyTotals(months, isIncome ? 'income' : 'expense');
    setData(results.map(r => ({ day: r.label, total: r.total })));
  }, [isIncome, monthOffset]);

  useEffect(() => { load(); }, [load]);

  const max = Math.max(...data.map((d) => d.total), 0);
  const min = data.length ? Math.min(...data.map((d) => d.total)) : 0;

  return (
    <View style={styles.safe}>
      <View style={[styles.header, { paddingTop: Math.max(insets.top, 16) }]}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.back}>← 返回</Text>
        </TouchableOpacity>
        <Text style={styles.title}>{isIncome ? '收入对比' : '支出对比'}</Text>
        <View style={{ width: 60 }} />
      </View>

      <ScrollView style={styles.content} contentContainerStyle={{ paddingBottom: 24 + insets.bottom }}>
        <View style={styles.chartCard}>
          <View style={styles.chartHeader}>
            <TouchableOpacity onPress={() => setMonthOffset(prev => prev + 12)} style={styles.navBtn}>
              <Text style={styles.navBtnText}>← 更早</Text>
            </TouchableOpacity>
            <Text style={styles.chartTitle}>{isIncome ? '近12个月收入趋势' : '近12个月支出趋势'}</Text>
            <TouchableOpacity onPress={() => setMonthOffset(prev => Math.max(0, prev - 12))} style={[styles.navBtn, monthOffset === 0 && styles.navBtnDisabled]}>
              <Text style={[styles.navBtnText, monthOffset === 0 && styles.navBtnDisabledText]}>更新 →</Text>
            </TouchableOpacity>
          </View>
          {data.length > 0 && <TrendChart data={data} />}
        </View>

        <View style={styles.listCard}>
          {data.map((item) => (
            <View key={item.day} style={styles.row}>
              <Text style={styles.rowMonth}>{item.day}</Text>
              <View style={styles.rowBarBg}>
                <View style={[styles.rowBarFill, isIncome && { backgroundColor: colors.success }, { width: max > 0 ? `${(item.total / max) * 100}%` : '0%' }]} />
              </View>
              <Text style={styles.rowValue}>{formatMoney(item.total)}</Text>
            </View>
          ))}
          {data.length > 0 && (
            <Text style={styles.summary}>
              最高 {formatMoney(max)} · 最低 {formatMoney(min)} · 差值 {formatMoney(max - min)}
            </Text>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const createStyles = (c: AppColors) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: c.background },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingTop: 16, paddingBottom: 12,
    backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border,
  },
  back: { color: c.primary, fontSize: 15, width: 60 },
  title: { fontSize: 18, fontWeight: '600', color: c.text },
  content: { padding: 16 },
  chartCard: {
    backgroundColor: c.surface, borderRadius: 16, padding: 16, marginBottom: 16, alignItems: 'center',
    shadowColor: c.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.06, shadowRadius: 12, elevation: 3,
  },
  chartHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', width: '100%', marginBottom: 12 },
  chartTitle: { fontSize: 15, fontWeight: '600', color: c.text },
  navBtn: { paddingHorizontal: 12, paddingVertical: 6 },
  navBtnText: { color: c.primary, fontSize: 13, fontWeight: '500' },
  navBtnDisabled: { opacity: 0.3 },
  navBtnDisabledText: { color: c.textSecondary },
  listCard: {
    backgroundColor: c.surface, borderRadius: 16, padding: 16,
    shadowColor: c.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.06, shadowRadius: 12, elevation: 3,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10 },
  rowMonth: { width: 36, fontSize: 14, color: c.text, fontWeight: '500' },
  rowBarBg: { flex: 1, height: 8, borderRadius: 4, backgroundColor: c.border },
  rowBarFill: { height: '100%', borderRadius: 4, backgroundColor: c.primary },
  rowValue: { width: 80, fontSize: 13, color: c.text, textAlign: 'right' },
  summary: { fontSize: 12, color: c.textSecondary, marginTop: 8, textAlign: 'center' },
});
