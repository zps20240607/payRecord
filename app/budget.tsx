import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useThemedStyles, useColors } from '../constants/colors';
import type { AppColors } from '../constants/colors';
import { DEFAULT_CATEGORIES, getCategoryById, INCOME_CATEGORY_IDS } from '../constants/categories';
import * as db from '../modules/db';
import type { Budget } from '../modules/record/types';
import { formatMoney, startOfMonth, endOfMonth } from '../utils/date';

export default function BudgetScreen() {
  const router = useRouter();
  const { categoryId: focusCategoryId } = useLocalSearchParams<{ categoryId?: string }>();
  const insets = useSafeAreaInsets();
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [totalBudget, setTotalBudget] = useState(0);
  const [newAmount, setNewAmount] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [categoryAmount, setCategoryAmount] = useState('');
  const [categorySpent, setCategorySpent] = useState<Record<string, number>>({});
  const [totalSpent, setTotalSpent] = useState(0);
  const styles = useThemedStyles(createStyles);
  const colors = useColors();

  const loadData = useCallback(async () => {
    const list = await db.getBudgets();
    setBudgets(list);

    const total = list.find((b) => !b.categoryId);
    setTotalBudget(total?.amount ?? 0);

    const now = Date.now();
    const totals = await db.getCategoryTotals(startOfMonth(now), endOfMonth(now), 'expense');
    const spent: Record<string, number> = {};
    totals.forEach((t) => { spent[t.categoryId] = t.total; });
    setCategorySpent(spent);

    const allTotal = totals.reduce((sum, t) => sum + t.total, 0);
    setTotalSpent(allTotal);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // 从首页预算预警跳转时自动展开对应分类
  useEffect(() => {
    if (focusCategoryId) {
      setSelectedCategory(focusCategoryId);
      const existing = budgets.find((b) => b.categoryId === focusCategoryId);
      setCategoryAmount(existing ? String(existing.amount) : '');
    }
  }, [focusCategoryId]);

  const saveTotalBudget = async () => {
    const amount = parseFloat(newAmount);
    if (isNaN(amount) || amount <= 0) return;
    const existing = budgets.find((b) => !b.categoryId);
    const budget: Budget = {
      id: existing?.id ?? `budget_total_${Date.now()}`,
      categoryId: undefined,
      amount,
      period: 'monthly',
    };
    await db.setBudget(budget);
    setNewAmount('');
    loadData();
  };

  const saveCategoryBudget = async () => {
    if (!selectedCategory) return;
    const amount = parseFloat(categoryAmount);
    if (isNaN(amount) || amount <= 0) return;
    const existing = budgets.find((b) => b.categoryId === selectedCategory);
    const budget: Budget = {
      id: existing?.id ?? `budget_${selectedCategory}_${Date.now()}`,
      categoryId: selectedCategory,
      amount,
      period: 'monthly',
    };
    await db.setBudget(budget);
    setSelectedCategory(null);
    setCategoryAmount('');
    loadData();
  };

  const totalPercent = totalBudget > 0 ? (totalSpent / totalBudget) * 100 : 0;
  const totalOver = totalPercent > 100;

  return (
    <View style={styles.safe}>
      <View style={[styles.header, { paddingTop: Math.max(insets.top, 16) }]}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.back}>← 返回</Text>
        </TouchableOpacity>
        <Text style={styles.title}>预算管理</Text>
        <View style={{ width: 60 }} />
      </View>

      <ScrollView style={styles.content} contentContainerStyle={{ paddingBottom: 24 + insets.bottom }}>
        {/* Total Budget */}
        <View style={[styles.card, totalOver && styles.cardDanger]}>
          <Text style={styles.cardTitle}>月度总预算</Text>
          {totalBudget > 0 ? (
            <>
              <View style={styles.budgetRow}>
                <Text style={styles.budgetSpent}>{formatMoney(totalSpent)}</Text>
                <Text style={styles.budgetDivider}>/</Text>
                <Text style={styles.budgetLimit}>{formatMoney(totalBudget)}</Text>
              </View>
              <View style={styles.progressBg}>
                <View style={[styles.progressFill, { width: `${Math.min(totalPercent, 100)}%` }, totalOver ? styles.progressDanger : styles.progressNormal]} />
              </View>
              <Text style={[styles.percentText, totalOver && styles.percentDanger]}>
                已使用 {totalPercent.toFixed(1)}%{totalOver ? ' ⚠️ 超支！' : ''}
              </Text>
            </>
          ) : (
            <Text style={styles.hint}>尚未设置月度预算</Text>
          )}
          <View style={styles.inputRow}>
            <TextInput
              style={styles.input}
              placeholder="设置月度预算"
              placeholderTextColor={colors.textSecondary}
              keyboardType="decimal-pad"
              value={newAmount}
              onChangeText={setNewAmount}
            />
            <TouchableOpacity style={styles.saveBtn} onPress={saveTotalBudget}>
              <Text style={styles.saveBtnText}>保存</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Category Budgets */}
        <Text style={styles.sectionTitle}>分类预算</Text>
        {(() => {
          const catBudgets = DEFAULT_CATEGORIES.filter((c) => !INCOME_CATEGORY_IDS.includes(c.id));
          const withBudget = catBudgets.filter(c => budgets.find(b => b.categoryId === c.id));
          const totalCatBudget = withBudget.reduce((s, c) => s + (budgets.find(b => b.categoryId === c.id)?.amount ?? 0), 0);
          const totalCatSpent = withBudget.reduce((s, c) => s + (categorySpent[c.id] ?? 0), 0);
          const catPercent = totalCatBudget > 0 ? (totalCatSpent / totalCatBudget) * 100 : 0;
          const catOver = catPercent > 100;

          return withBudget.length > 0 ? (
            <View style={[styles.card, catOver && styles.cardDanger, { marginBottom: 12 }]}>
              <Text style={styles.cardTitle}>分类预算汇总</Text>
              <View style={styles.budgetRow}>
                <Text style={styles.budgetSpent}>{formatMoney(totalCatSpent)}</Text>
                <Text style={styles.budgetDivider}>/</Text>
                <Text style={styles.budgetLimit}>{formatMoney(totalCatBudget)}</Text>
              </View>
              <View style={styles.progressBg}>
                <View style={[styles.progressFill, { width: `${Math.min(catPercent, 100)}%` }, catOver ? styles.progressDanger : styles.progressNormal]} />
              </View>
              <Text style={[styles.percentText, catOver && styles.percentDanger]}>
                已使用 {catPercent.toFixed(1)}%{catOver ? ' ⚠️ 超支！' : ` · 剩余 ${formatMoney(totalCatBudget - totalCatSpent)}`}
              </Text>
            </View>
          ) : null;
        })()}
        {DEFAULT_CATEGORIES.filter((c) => !INCOME_CATEGORY_IDS.includes(c.id)).map((cat) => {
          const budget = budgets.find((b) => b.categoryId === cat.id);
          const spent = categorySpent[cat.id] ?? 0;
          const percent = budget ? (spent / budget.amount) * 100 : 0;
          const over = percent > 100;
          const isEditing = selectedCategory === cat.id;

          return (
            <View key={cat.id} style={[styles.catCard, over && styles.cardDanger]}>
              <View style={styles.catHeader}>
                <Text style={styles.catIcon}>{cat.icon}</Text>
                <Text style={styles.catName}>{cat.name}</Text>
                {budget && (
                  <Text style={[styles.catStatus, over && styles.percentDanger]}>
                    {formatMoney(spent)} / {formatMoney(budget.amount)}
                    {over ? ' ⚠️' : ''}
                  </Text>
                )}
              </View>
              {budget && (
                <View style={styles.progressBg}>
                  <View style={[styles.progressFill, { width: `${Math.min(percent, 100)}%` }, over ? styles.progressDanger : styles.progressNormal]} />
                </View>
              )}
              {isEditing ? (
                <View style={styles.catInputRow}>
                  <TextInput
                    style={styles.input}
                    placeholder="月度预算金额"
                    placeholderTextColor={colors.textSecondary}
                    keyboardType="decimal-pad"
                    value={categoryAmount}
                    onChangeText={setCategoryAmount}
                    autoFocus
                  />
                  <TouchableOpacity style={styles.saveBtn} onPress={saveCategoryBudget}>
                    <Text style={styles.saveBtnText}>保存</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.cancelBtn} onPress={async () => {
                    if (selectedCategory) {
                      const existing = budgets.find((b) => b.categoryId === selectedCategory);
                      if (existing) {
                        await db.deleteBudget(existing.id);
                      }
                    }
                    setSelectedCategory(null);
                    setCategoryAmount('');
                    loadData();
                  }}>
                    <Text style={styles.cancelBtnText}>取消预算</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <TouchableOpacity style={styles.catSetBtn} onPress={() => { setSelectedCategory(cat.id); setCategoryAmount(budget ? String(budget.amount) : ''); }}>
                  <Text style={styles.catSetBtnText}>{budget ? '修改' : '设置预算'}</Text>
                </TouchableOpacity>
              )}
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}

const createStyles = (c: AppColors) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: c.background },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingTop: 16, paddingBottom: 12,
    backgroundColor: c.surface,
  },
  back: { color: c.primary, fontSize: 15, width: 60 },
  title: { fontSize: 18, fontWeight: '700', color: c.text },
  content: { padding: 16 },
  card: {
    backgroundColor: c.surface, borderRadius: 20, padding: 18, marginBottom: 16,
    shadowColor: c.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.06, shadowRadius: 12, elevation: 3,
  },
  cardDanger: { borderWidth: 1, borderColor: c.danger },
  cardTitle: { fontSize: 16, fontWeight: '600', color: c.text, marginBottom: 12 },
  budgetRow: { flexDirection: 'row', alignItems: 'baseline', gap: 6, marginBottom: 12 },
  budgetSpent: { fontSize: 30, fontWeight: '700', color: c.text, letterSpacing: -0.5 },
  budgetDivider: { fontSize: 18, color: c.textSecondary },
  budgetLimit: { fontSize: 18, color: c.textSecondary },
  progressBg: { height: 10, borderRadius: 5, backgroundColor: c.border, marginBottom: 8, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 5 },
  progressNormal: { backgroundColor: c.primary },
  progressDanger: { backgroundColor: c.danger },
  percentText: { fontSize: 13, color: c.textSecondary },
  percentDanger: { color: c.danger, fontWeight: '600' },
  hint: { color: c.textSecondary, fontSize: 14, marginBottom: 12 },
  inputRow: { flexDirection: 'row', gap: 10, marginTop: 8 },
  input: {
    flex: 1, backgroundColor: c.background, borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 10, fontSize: 15,
    borderWidth: 1, borderColor: c.border, color: c.text,
  },
  saveBtn: { backgroundColor: c.primary, borderRadius: 10, paddingHorizontal: 20, paddingVertical: 10, justifyContent: 'center', minHeight: 42 },
  saveBtnText: { color: '#fff', fontWeight: '600' },
  sectionTitle: { fontSize: 17, fontWeight: '700', color: c.text, marginBottom: 12, letterSpacing: -0.3 },
  catCard: {
    backgroundColor: c.surface, borderRadius: 16, padding: 16, marginBottom: 10,
    borderWidth: 1, borderColor: c.border,
  },
  catHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  catIcon: { fontSize: 20 },
  catName: { fontSize: 15, fontWeight: '500', color: c.text, flex: 1 },
  catStatus: { fontSize: 13, color: c.textSecondary },
  catSetBtn: { alignSelf: 'flex-end', marginTop: 4 },
  catSetBtnText: { fontSize: 13, color: c.primary, fontWeight: '500' },
  catInputRow: { flexDirection: 'row', gap: 8, marginTop: 10, alignItems: 'center' },
  cancelBtn: {
    backgroundColor: c.background, borderWidth: 1, borderColor: c.border,
    borderRadius: 10, paddingHorizontal: 18, paddingVertical: 10, justifyContent: 'center', minHeight: 42,
  },
  cancelBtnText: { fontSize: 14, color: c.text, fontWeight: '500' },
});
