import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, useThemedStyles } from '../constants/colors';
import type { AppColors } from '../constants/colors';
import { RecordItem } from '../components/RecordItem';
import * as db from '../modules/db';
import { formatMoney, startOfDay, endOfDay } from '../utils/date';
import type { PayRecord } from '../modules/record/types';

export default function TodayScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { type } = useLocalSearchParams<{ type?: string }>();
  const isIncome = type === 'income';
  const [records, setRecords] = useState<PayRecord[]>([]);
  const [total, setTotal] = useState(0);
  const styles = useThemedStyles(createStyles);

  const load = useCallback(async () => {
    const now = Date.now();
    const list = await db.getRecords({
      startTime: startOfDay(now),
      endTime: endOfDay(now),
      status: 'confirmed',
      type: isIncome ? 'income' : 'expense',
    });
    setRecords(list);
    setTotal(list.reduce((s, r) => s + r.amount, 0));
  }, [isIncome]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  return (
    <View style={styles.safe}>
      <View style={[styles.header, { paddingTop: Math.max(insets.top, 16) }]}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.back}>← 返回</Text>
        </TouchableOpacity>
        <Text style={styles.title}>{isIncome ? '今日收入' : '今日支出'}</Text>
        <View style={{ width: 60 }} />
      </View>

      <ScrollView style={styles.content} contentContainerStyle={{ paddingBottom: 24 + insets.bottom }}>
        <View style={[styles.totalCard, isIncome && styles.totalCardIncome]}>
          <Text style={styles.totalLabel}>{isIncome ? '今日总收入' : '今日总支出'}</Text>
          <Text style={[styles.totalValue, isIncome && { color: styles.totalCardIncome.borderLeftColor }]}>{formatMoney(total)}</Text>
          <Text style={styles.totalCount}>共 {records.length} 笔</Text>
        </View>

        <View style={styles.listCard}>
          {records.length === 0 && (
            <Text style={styles.emptyText}>{isIncome ? '今天还没有收入记录' : '今天还没有支出记录'}</Text>
          )}
          {records.map((record) => (
            <RecordItem key={record.id} record={record} onPress={(r) => router.push(`/record/${r.id}`)} />
          ))}
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
  totalCard: {
    backgroundColor: c.surface, borderRadius: 16, padding: 20, alignItems: 'center', marginBottom: 16,
    borderLeftWidth: 4, borderLeftColor: c.primary,
    shadowColor: c.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.06, shadowRadius: 12, elevation: 3,
  },
  totalCardIncome: { borderLeftColor: c.success },
  totalLabel: { fontSize: 13, color: c.textSecondary },
  totalValue: { fontSize: 30, fontWeight: '700', color: c.text, marginTop: 6 },
  totalCount: { fontSize: 12, color: c.textSecondary, marginTop: 4 },
  listCard: {
    backgroundColor: c.surface, borderRadius: 16, paddingHorizontal: 16,
    shadowColor: c.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.06, shadowRadius: 12, elevation: 3,
  },
  emptyText: { textAlign: 'center', color: c.textSecondary, paddingVertical: 24 },
});
