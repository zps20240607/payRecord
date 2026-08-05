import React, { useRef, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, useThemedStyles, useColors } from '../constants/colors';
import type { AppColors } from '../constants/colors';
import { DEFAULT_CATEGORIES, getCategoryById } from '../constants/categories';
import { RecordItem } from '../components/RecordItem';
import type { PayRecord } from '../modules/record/types';
import * as db from '../modules/db';
import { startOfDay, endOfDay, startOfMonth, endOfMonth, subDays, subMonths } from '../utils/date';

type DateRange = 'today' | 'week' | 'month' | 'all';

const DATE_RANGES: { key: DateRange; label: string }[] = [
  { key: 'today', label: '今天' },
  { key: 'week', label: '近7天' },
  { key: 'month', label: '本月' },
  { key: 'all', label: '全部' },
];

function getDateRange(range: DateRange): { startTime?: number; endTime?: number } {
  const now = Date.now();
  switch (range) {
    case 'today': return { startTime: startOfDay(now), endTime: endOfDay(now) };
    case 'week': return { startTime: startOfDay(subDays(now, 6)), endTime: endOfDay(now) };
    case 'month': return { startTime: startOfMonth(now), endTime: endOfMonth(now) };
    case 'all': return {};
  }
}

export default function SearchScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [keyword, setKeyword] = useState('');
  const [categoryId, setCategoryId] = useState<string | undefined>();
  const [minAmount, setMinAmount] = useState('');
  const [maxAmount, setMaxAmount] = useState('');
  const [results, setResults] = useState<PayRecord[]>([]);
  const [typeFilter, setTypeFilter] = useState<'all' | 'expense' | 'income'>('all');
  const [dateRange, setDateRange] = useState<DateRange>('all');
  const styles = useThemedStyles(createStyles);
  const colors = useColors();

  // 搜索缓存：记录上次查询条件（保留 key 仅用于调试，不做结果缓存——数据变更后缓存会过期）
  const lastQueryRef = useRef<string>('');
  const [searched, setSearched] = useState(false);

  const getQueryKey = () => JSON.stringify({ keyword, categoryId, minAmount, maxAmount, typeFilter, dateRange });

  const filteredCategories = typeFilter === 'all'
    ? DEFAULT_CATEGORIES
    : DEFAULT_CATEGORIES.filter(c =>
        typeFilter === 'expense'
          ? ['food','transport','shopping','entertainment','housing','medical','education','social','expense_other'].includes(c.id)
          : ['salary','redpacket','transfer','parttime','invest','income_other'].includes(c.id)
      );

  const handleSearch = async () => {
    // 金额输入校验：非数字不传给 SQL（parseFloat 得 NaN 会导致查询行为未定义）
    const min = minAmount ? parseFloat(minAmount) : undefined;
    const max = maxAmount ? parseFloat(maxAmount) : undefined;
    try {
      const range = getDateRange(dateRange);
      const records = await db.getRecords({
        ...range,
        categoryId,
        minAmount: min !== undefined && !isNaN(min) ? min : undefined,
        maxAmount: max !== undefined && !isNaN(max) ? max : undefined,
        keyword: keyword || undefined,
        type: typeFilter === 'all' ? undefined : typeFilter,
        limit: 100,
      });
      lastQueryRef.current = getQueryKey();
      setResults(records);
      setSearched(true);
    } catch (e) {
      console.warn('[PayRecord] search failed:', e);
    }
  };

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: Math.max(insets.top, 16) }]}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.back}>← 返回</Text>
        </TouchableOpacity>
        <Text style={styles.title}>流水搜索</Text>
        <View style={{ width: 60 }} />
      </View>

      <ScrollView style={styles.form} contentContainerStyle={{ paddingBottom: 24 + insets.bottom }} keyboardShouldPersistTaps="handled">
        <TextInput
          style={styles.input}
          placeholder="关键词：商户、备注、来源"
          placeholderTextColor={colors.textSecondary}
          value={keyword}
          onChangeText={setKeyword}
        />

        <View style={styles.typeRow}>
          {(['all', 'expense', 'income'] as const).map((t) => (
            <TouchableOpacity
              key={t}
              style={[styles.typeBtn, typeFilter === t && styles.typeBtnActive]}
              onPress={() => { setTypeFilter(t); setCategoryId(undefined); }}
            >
              <Text style={[styles.typeBtnText, typeFilter === t && styles.typeBtnTextActive]}>
                {t === 'all' ? '全部' : t === 'expense' ? '支出' : '收入'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.label}>时间范围</Text>
        <View style={styles.typeRow}>
          {DATE_RANGES.map((r) => (
            <TouchableOpacity
              key={r.key}
              style={[styles.dateBtn, dateRange === r.key && styles.dateBtnActive]}
              onPress={() => setDateRange(r.key)}
            >
              <Text style={[styles.dateBtnText, dateRange === r.key && styles.dateBtnTextActive]}>
                {r.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.label}>分类</Text>
        <View style={styles.categoryRow}>
          <TouchableOpacity
            style={[styles.categoryChip, !categoryId && styles.categoryChipActive]}
            onPress={() => setCategoryId(undefined)}
          >
            <Text style={!categoryId ? styles.categoryChipTextActive : styles.categoryChipText}>全部</Text>
          </TouchableOpacity>
          {filteredCategories.map((cat) => (
            <TouchableOpacity
              key={cat.id}
              style={[styles.categoryChip, categoryId === cat.id && styles.categoryChipActive]}
              onPress={() => setCategoryId(cat.id)}
            >
              <Text style={categoryId === cat.id ? styles.categoryChipTextActive : styles.categoryChipText}>{cat.icon} {cat.name}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.amountRow}>
          <TextInput
            style={[styles.input, styles.amountInput]}
            placeholder="最小金额"
            placeholderTextColor={colors.textSecondary}
            keyboardType="decimal-pad"
            value={minAmount}
            onChangeText={setMinAmount}
          />
          <Text style={styles.amountDivider}>-</Text>
          <TextInput
            style={[styles.input, styles.amountInput]}
            placeholder="最大金额"
            placeholderTextColor={colors.textSecondary}
            keyboardType="decimal-pad"
            value={maxAmount}
            onChangeText={setMaxAmount}
          />
        </View>

        <TouchableOpacity style={styles.searchBtn} onPress={handleSearch}>
          <Text style={styles.searchText}>搜索</Text>
        </TouchableOpacity>

        <View style={styles.results}>
          {results.map((record) => (
            <RecordItem key={record.id} record={record} onPress={(r) => router.push(`/record/${r.id}`)} />
          ))}
          {results.length === 0 && !searched && (
            <Text style={styles.empty}>输入条件后点击搜索</Text>
          )}
          {results.length === 0 && searched && (
            <Text style={styles.empty}>没有找到匹配的记录</Text>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const createStyles = (c: AppColors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: c.background },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingTop: 16, paddingBottom: 12,
    backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border,
  },
  back: { color: c.primary, fontSize: 15, width: 60 },
  title: { fontSize: 18, fontWeight: '600', color: c.text },
  form: { padding: 16 },
  input: {
    backgroundColor: c.surface, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 15, borderWidth: 1, borderColor: c.border, marginBottom: 12, color: c.text,
  },
  typeRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  typeBtn: {
    flex: 1, paddingVertical: 8, borderRadius: 8, alignItems: 'center',
    backgroundColor: c.surface, borderWidth: 1, borderColor: c.border,
  },
  typeBtnActive: { backgroundColor: c.primary, borderColor: c.primary },
  typeBtnText: { fontSize: 13, color: c.text, fontWeight: '500' },
  typeBtnTextActive: { color: '#fff' },
  label: { fontSize: 14, fontWeight: '500', color: c.text, marginBottom: 8 },
  dateBtn: {
    flex: 1, paddingVertical: 8, borderRadius: 8, alignItems: 'center',
    backgroundColor: c.surface, borderWidth: 1, borderColor: c.border,
  },
  dateBtnActive: { backgroundColor: c.gradient.blueLight, borderColor: c.primary },
  dateBtnText: { fontSize: 13, color: c.text, fontWeight: '500' },
  dateBtnTextActive: { color: c.primary, fontWeight: '600' },
  categoryRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  categoryChip: {
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20,
    backgroundColor: c.surface, borderWidth: 1, borderColor: c.border,
  },
  categoryChipActive: { backgroundColor: c.primary, borderColor: c.primary },
  categoryChipText: { fontSize: 13, color: c.text },
  categoryChipTextActive: { fontSize: 13, color: '#fff', fontWeight: '500' },
  amountRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  amountInput: { flex: 1, marginBottom: 0 },
  amountDivider: { fontSize: 18, color: c.textSecondary },
  searchBtn: { backgroundColor: c.primary, borderRadius: 14, paddingVertical: 14, alignItems: 'center', marginVertical: 16 },
  searchText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  results: { backgroundColor: c.surface, borderRadius: 16, paddingHorizontal: 16, paddingVertical: 8 },
  empty: { textAlign: 'center', color: c.textSecondary, paddingVertical: 30 },
});
