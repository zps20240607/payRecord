import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useThemedStyles, useColors } from '../constants/colors';
import type { AppColors } from '../constants/colors';
import { DEFAULT_CATEGORIES, getCategoryById } from '../constants/categories';
import { DonutChart } from '../components/DonutChart';
import * as db from '../modules/db';
import { formatMoney, startOfMonth, endOfMonth, subMonths, startOfDay, endOfDay } from '../utils/date';
import type { RecordType } from '../modules/record/types';

export default function ReportScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const styles = useThemedStyles(createStyles);
  const colors = useColors();

  const [monthOffset, setMonthOffset] = useState(1); // 默认上月
  const [loading, setLoading] = useState(true);

  // 数据
  const [expense, setExpense] = useState(0);
  const [income, setIncome] = useState(0);
  const [prevExpense, setPrevExpense] = useState(0);
  const [prevIncome, setPrevIncome] = useState(0);
  const [categoryTotals, setCategoryTotals] = useState<{ categoryId: string; total: number }[]>([]);
  const [incomeCategoryTotals, setIncomeCategoryTotals] = useState<{ categoryId: string; total: number }[]>([]);
  const [recordCount, setRecordCount] = useState(0);
  const [budgetAmount, setBudgetAmount] = useState(0);
  const [daysInMonth, setDaysInMonth] = useState(30);
  const [recordDays, setRecordDays] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    const now = new Date();
    const base = new Date(now.getFullYear(), now.getMonth() - monthOffset, 1);
    const start = startOfMonth(base.getTime());
    const end = endOfMonth(base.getTime());
    setDaysInMonth(new Date(base.getFullYear(), base.getMonth() + 1, 0).getDate());

    const [
      exp, inc, prevExp, prevInc,
      catTotals, incCatTotals, count, budgets,
      allRecords,
    ] = await Promise.all([
      db.getTotalByRange(start, end, 'expense'),
      db.getTotalByRange(start, end, 'income'),
      db.getTotalByRange(startOfMonth(subMonths(base.getTime(), 1)), endOfMonth(subMonths(base.getTime(), 1)), 'expense'),
      db.getTotalByRange(startOfMonth(subMonths(base.getTime(), 1)), endOfMonth(subMonths(base.getTime(), 1)), 'income'),
      db.getCategoryTotals(start, end, 'expense'),
      db.getCategoryTotals(start, end, 'income'),
      db.getRecordCount(),
      db.getBudgets(),
      db.getRecords({ startTime: start, endTime: end, status: 'confirmed', limit: 10000 }),
    ]);

    setExpense(exp);
    setIncome(inc);
    setPrevExpense(prevExp);
    setPrevIncome(prevInc);
    setCategoryTotals(catTotals);
    setIncomeCategoryTotals(incCatTotals);
    setRecordCount(allRecords.length);

    const totalBudget = budgets.find(b => !b.categoryId)?.amount ?? 0;
    setBudgetAmount(totalBudget);

    // 有记录的天数
    const daySet = new Set<string>();
    allRecords.forEach(r => {
      const d = new Date(r.createdAt);
      daySet.add(`${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`);
    });
    setRecordDays(daySet.size);
    setLoading(false);
  }, [monthOffset]);

  useEffect(() => { load(); }, [load]);

  const monthLabel = () => {
    const now = new Date();
    const d = new Date(now.getFullYear(), now.getMonth() - monthOffset, 1);
    return `${d.getFullYear()}年${d.getMonth() + 1}月`;
  };

  const expenseChange = prevExpense > 0 ? ((expense - prevExpense) / prevExpense * 100) : 0;
  const incomeChange = prevIncome > 0 ? ((income - prevIncome) / prevIncome * 100) : 0;
  const budgetPercent = budgetAmount > 0 ? (expense / budgetAmount * 100) : 0;
  const dailyAvg = recordDays > 0 ? expense / recordDays : 0;

  const top3 = categoryTotals.slice(0, 3);
  const top3Income = incomeCategoryTotals.slice(0, 3);

  return (
    <View style={styles.safe}>
      <View style={[styles.header, { paddingTop: Math.max(insets.top, 16) }]}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.back}>← 返回</Text>
        </TouchableOpacity>
        <Text style={styles.title}>月度报告</Text>
        <View style={{ width: 60 }} />
      </View>

      <ScrollView style={styles.content} contentContainerStyle={{ paddingBottom: 24 + insets.bottom }}>
        {/* 月份切换 */}
        <View style={styles.monthNav}>
          <TouchableOpacity onPress={() => setMonthOffset(p => p + 1)} style={styles.monthBtn}>
            <Text style={styles.monthBtnText}>← 更早</Text>
          </TouchableOpacity>
          <Text style={styles.monthLabel}>{monthLabel()}</Text>
          <TouchableOpacity onPress={() => setMonthOffset(p => Math.max(0, p - 1))} style={[styles.monthBtn, monthOffset === 0 && { opacity: 0.3 }]}>
            <Text style={styles.monthBtnText}>更新 →</Text>
          </TouchableOpacity>
        </View>

        {monthOffset === 0 && (
          <View style={styles.currentMonthHint}>
            <Text style={styles.currentMonthHintText}>本月还未结束，数据会持续更新</Text>
          </View>
        )}

        {/* 总览卡片 */}
        <View style={styles.overviewRow}>
          <View style={[styles.overviewCard, { borderLeftWidth: 4, borderLeftColor: colors.danger }]}>
            <Text style={styles.overviewLabel}>总支出</Text>
            <Text style={styles.overviewValue}>{formatMoney(expense)}</Text>
            <Text style={[styles.overviewChange, expenseChange > 0 ? styles.up : styles.down]}>
              {prevExpense > 0 ? `${expenseChange >= 0 ? '↑' : '↓'} ${Math.abs(expenseChange).toFixed(1)}% 环比` : '无上月数据'}
            </Text>
          </View>
          <View style={[styles.overviewCard, { borderLeftWidth: 4, borderLeftColor: colors.success }]}>
            <Text style={styles.overviewLabel}>总收入</Text>
            <Text style={[styles.overviewValue, { color: colors.success }]}>{formatMoney(income)}</Text>
            <Text style={[styles.overviewChange, incomeChange > 0 ? styles.up : styles.down]}>
              {prevIncome > 0 ? `${incomeChange >= 0 ? '↑' : '↓'} ${Math.abs(incomeChange).toFixed(1)}% 环比` : '无上月数据'}
            </Text>
          </View>
        </View>

        {/* 结余 */}
        <View style={styles.card}>
          <View style={styles.statRow}>
            <Text style={styles.statLabel}>月度结余</Text>
            <Text style={[styles.statValue, { color: income - expense >= 0 ? colors.success : colors.danger }]}>
              {income - expense >= 0 ? '+' : ''}{formatMoney(income - expense)}
            </Text>
          </View>
          <View style={[styles.statRow, { borderBottomWidth: 0 }]}>
            <Text style={styles.statLabel}>日均消费</Text>
            <Text style={styles.statValue}>{formatMoney(dailyAvg)}</Text>
          </View>
          <Text style={styles.statHint}>有记录 {recordDays} 天 / 共 {daysInMonth} 天</Text>
        </View>

        {/* 预算达成 */}
        {budgetAmount > 0 && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>预算达成</Text>
            <View style={styles.progressRow}>
              <Text style={styles.progressSpent}>{formatMoney(expense)}</Text>
              <Text style={styles.progressLimit}>/ {formatMoney(budgetAmount)}</Text>
            </View>
            <View style={styles.progressBg}>
              <View style={[styles.progressFill, {
                width: `${Math.min(budgetPercent, 100)}%`,
                backgroundColor: budgetPercent > 100 ? colors.danger : colors.primary,
              }]} />
            </View>
            <Text style={[styles.progressText, budgetPercent > 100 && { color: colors.danger }]}>
              {budgetPercent > 100 ? `已超支 ${(budgetPercent - 100).toFixed(0)}%` : `剩余 ${formatMoney(budgetAmount - expense)}`}
            </Text>
          </View>
        )}

        {/* 支出 Top3 */}
        {top3.length > 0 && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>支出 Top 3</Text>
            {top3.map((item, idx) => {
              const cat = getCategoryById(item.categoryId);
              const percent = expense > 0 ? (item.total / expense * 100) : 0;
              return (
                <View key={item.categoryId} style={styles.topRow}>
                  <Text style={styles.topRank}>#{idx + 1}</Text>
                  <Text style={styles.topIcon}>{cat.icon}</Text>
                  <View style={styles.topInfo}>
                    <Text style={styles.topName}>{cat.name}</Text>
                    <View style={styles.topBarBg}>
                      <View style={[styles.topBarFill, { width: `${percent}%`, backgroundColor: cat.color }]} />
                    </View>
                  </View>
                  <View style={styles.topRight}>
                    <Text style={styles.topAmount}>{formatMoney(item.total)}</Text>
                    <Text style={styles.topPercent}>{percent.toFixed(0)}%</Text>
                  </View>
                </View>
              );
            })}
          </View>
        )}

        {/* 支出分类占比 */}
        {categoryTotals.length > 0 && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>支出分类占比</Text>
            <DonutChart data={categoryTotals} label="支出分布" />
            <View style={styles.legend}>
              {categoryTotals.map(item => {
                const cat = getCategoryById(item.categoryId);
                return (
                  <View key={item.categoryId} style={styles.legendItem}>
                    <View style={[styles.legendDot, { backgroundColor: cat.color }]} />
                    <Text style={styles.legendText}>{cat.name} {formatMoney(item.total)}</Text>
                  </View>
                );
              })}
            </View>
          </View>
        )}

        {/* 收入 Top3 */}
        {top3Income.length > 0 && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>收入 Top 3</Text>
            {top3Income.map((item, idx) => {
              const cat = getCategoryById(item.categoryId);
              const percent = income > 0 ? (item.total / income * 100) : 0;
              return (
                <View key={item.categoryId} style={styles.topRow}>
                  <Text style={styles.topRank}>#{idx + 1}</Text>
                  <Text style={styles.topIcon}>{cat.icon}</Text>
                  <View style={styles.topInfo}>
                    <Text style={styles.topName}>{cat.name}</Text>
                    <View style={styles.topBarBg}>
                      <View style={[styles.topBarFill, { width: `${percent}%`, backgroundColor: cat.color }]} />
                    </View>
                  </View>
                  <View style={styles.topRight}>
                    <Text style={styles.topAmount}>{formatMoney(item.total)}</Text>
                    <Text style={styles.topPercent}>{percent.toFixed(0)}%</Text>
                  </View>
                </View>
              );
            })}
          </View>
        )}

        {/* 收入分类占比 */}
        {incomeCategoryTotals.length > 0 && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>收入分类占比</Text>
            <DonutChart data={incomeCategoryTotals} label="收入来源" />
            <View style={styles.legend}>
              {incomeCategoryTotals.map(item => {
                const cat = getCategoryById(item.categoryId);
                return (
                  <View key={item.categoryId} style={styles.legendItem}>
                    <View style={[styles.legendDot, { backgroundColor: cat.color }]} />
                    <Text style={styles.legendText}>{cat.name} {formatMoney(item.total)}</Text>
                  </View>
                );
              })}
            </View>
          </View>
        )}
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
  title: { fontSize: 18, fontWeight: '700', color: c.text },
  content: { padding: 16 },
  monthNav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  monthBtn: { paddingHorizontal: 12, paddingVertical: 6 },
  monthBtnText: { color: c.primary, fontSize: 14, fontWeight: '500' },
  monthLabel: { fontSize: 18, fontWeight: '700', color: c.text },
  currentMonthHint: { backgroundColor: c.primary + '12', borderRadius: 10, padding: 10, marginBottom: 12 },
  currentMonthHintText: { fontSize: 12, color: c.primary, textAlign: 'center' },
  overviewRow: { flexDirection: 'row', gap: 12, marginBottom: 12 },
  overviewCard: {
    flex: 1, backgroundColor: c.surface, borderRadius: 16, padding: 16,
    shadowColor: c.primary, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.04, shadowRadius: 8, elevation: 2,
  },
  overviewLabel: { fontSize: 13, color: c.textSecondary, marginBottom: 6 },
  overviewValue: { fontSize: 24, fontWeight: '700', color: c.text, letterSpacing: -0.5 },
  overviewChange: { fontSize: 12, marginTop: 4, fontWeight: '500' },
  up: { color: c.danger },
  down: { color: c.success },
  card: {
    backgroundColor: c.surface, borderRadius: 16, padding: 16, marginBottom: 12,
    shadowColor: c.primary, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.04, shadowRadius: 8, elevation: 2,
  },
  cardTitle: { fontSize: 16, fontWeight: '600', color: c.text, marginBottom: 12 },
  statRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: c.border,
  },
  statLabel: { fontSize: 15, color: c.textSecondary },
  statValue: { fontSize: 17, fontWeight: '700', color: c.text },
  statHint: { fontSize: 12, color: c.textSecondary, marginTop: 6, textAlign: 'center' },
  progressRow: { flexDirection: 'row', alignItems: 'baseline', gap: 6, marginBottom: 10 },
  progressSpent: { fontSize: 22, fontWeight: '700', color: c.text },
  progressLimit: { fontSize: 14, color: c.textSecondary },
  progressBg: { height: 10, borderRadius: 5, backgroundColor: c.border, overflow: 'hidden', marginBottom: 8 },
  progressFill: { height: '100%', borderRadius: 5 },
  progressText: { fontSize: 13, color: c.primary, fontWeight: '500' },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10 },
  topRank: { fontSize: 14, fontWeight: '700', color: c.primary, width: 24 },
  topIcon: { fontSize: 18 },
  topInfo: { flex: 1 },
  topName: { fontSize: 13, color: c.text, fontWeight: '500', marginBottom: 4 },
  topBarBg: { height: 6, borderRadius: 3, backgroundColor: c.border, overflow: 'hidden' },
  topBarFill: { height: '100%', borderRadius: 3 },
  topRight: { alignItems: 'flex-end', width: 70 },
  topAmount: { fontSize: 13, fontWeight: '600', color: c.text },
  topPercent: { fontSize: 11, color: c.textSecondary },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12, justifyContent: 'center' },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { fontSize: 12, color: c.textSecondary },
});
