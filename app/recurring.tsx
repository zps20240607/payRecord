import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, Alert, Switch,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useThemedStyles, useColors } from '../constants/colors';
import type { AppColors } from '../constants/colors';
import { DEFAULT_CATEGORIES, getCategoryById } from '../constants/categories';
import type { RecurringRecord } from '../modules/db/recurrings';
import { getRecurrings, addRecurring, deleteRecurring, toggleRecurring, calcNextTrigger } from '../modules/db/recurrings';
import { formatDateTime } from '../utils/date';

const PERIOD_OPTIONS: { label: string; type: RecurringRecord['periodType']; value: number }[] = [
  { label: '每天', type: 'daily', value: 1 },
  { label: '每周', type: 'weekly', value: 1 },
  { label: '每月', type: 'monthly', value: 1 },
  { label: '每2周', type: 'weekly', value: 2 },
  { label: '每2月', type: 'monthly', value: 2 },
  { label: '每3月', type: 'monthly', value: 3 },
  { label: '每半年', type: 'monthly', value: 6 },
  { label: '每年', type: 'monthly', value: 12 },
];

const EXPENSE_IDS = ['food', 'transport', 'shopping', 'entertainment', 'housing', 'medical', 'education', 'social', 'expense_other'];
const INCOME_IDS = ['salary', 'redpacket', 'transfer', 'parttime', 'invest', 'income_other'];

export default function RecurringScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const styles = useThemedStyles(createStyles);
  const colors = useColors();

  const [recurrings, setRecurrings] = useState<RecurringRecord[]>([]);
  const [showForm, setShowForm] = useState(false);

  // 表单
  const [formType, setFormType] = useState<'expense' | 'income'>('expense');
  const [formAmount, setFormAmount] = useState('');
  const [formCategoryId, setFormCategoryId] = useState('food');
  const [formMerchant, setFormMerchant] = useState('');
  const [formNote, setFormNote] = useState('');
  const [formPeriodIdx, setFormPeriodIdx] = useState(2); // 默认每月

  const load = useCallback(async () => {
    const list = await getRecurrings();
    setRecurrings(list);
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleTypeChange = (t: 'expense' | 'income') => {
    setFormType(t);
    setFormCategoryId(t === 'expense' ? 'food' : 'salary');
  };

  const handleSave = async () => {
    const amount = parseFloat(formAmount);
    if (isNaN(amount) || amount <= 0) {
      Alert.alert('提示', '请输入有效金额');
      return;
    }
    const period = PERIOD_OPTIONS[formPeriodIdx];
    const now = Date.now();
    const rec: RecurringRecord = {
      id: `rec_${now}`,
      amount,
      type: formType,
      categoryId: formCategoryId,
      merchant: formMerchant || undefined,
      note: formNote || undefined,
      periodType: period.type,
      periodValue: period.value,
      nextTrigger: calcNextTrigger(period.type, period.value, now),
      enabled: true,
      createdAt: now,
    };
    await addRecurring(rec);
    setShowForm(false);
    setFormAmount('');
    setFormMerchant('');
    setFormNote('');
    setFormPeriodIdx(2);
    load();
  };

  const handleDelete = (id: string) => {
    Alert.alert('确认删除', '删除后该周期记账将不再自动执行', [
      { text: '取消', style: 'cancel' },
      { text: '删除', style: 'destructive', onPress: async () => {
        await deleteRecurring(id);
        load();
      }},
    ]);
  };

  const handleToggle = async (id: string, enabled: boolean) => {
    await toggleRecurring(id, enabled);
    load();
  };

  const periodLabel = (r: RecurringRecord) => {
    if (r.periodType === 'daily') return r.periodValue === 1 ? '每天' : `每${r.periodValue}天`;
    if (r.periodType === 'weekly') return r.periodValue === 1 ? '每周' : `每${r.periodValue}周`;
    return r.periodValue === 1 ? '每月' : `每${r.periodValue}月`;
  };

  const filteredCategories = DEFAULT_CATEGORIES.filter(c =>
    formType === 'expense' ? EXPENSE_IDS.includes(c.id) : INCOME_IDS.includes(c.id)
  );

  return (
    <View style={styles.safe}>
      <View style={[styles.header, { paddingTop: Math.max(insets.top, 16) }]}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.back}>← 返回</Text>
        </TouchableOpacity>
        <Text style={styles.title}>周期记账</Text>
        <TouchableOpacity onPress={() => setShowForm(!showForm)}>
          <Text style={styles.back}>{showForm ? '取消' : '+ 新增'}</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.content} contentContainerStyle={{ paddingBottom: 24 + insets.bottom }} keyboardShouldPersistTaps="handled">
        {showForm && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>新增周期记账</Text>

            {/* 类型 */}
            <View style={styles.typeRow}>
              <TouchableOpacity
                style={[styles.typeBtn, formType === 'expense' && styles.typeBtnActive]}
                onPress={() => handleTypeChange('expense')}
              >
                <Text style={[styles.typeBtnText, formType === 'expense' && styles.typeBtnTextActive]}>支出</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.typeBtn, formType === 'income' && styles.typeBtnActive]}
                onPress={() => handleTypeChange('income')}
              >
                <Text style={[styles.typeBtnText, formType === 'income' && styles.typeBtnTextActive]}>收入</Text>
              </TouchableOpacity>
            </View>

            {/* 金额 */}
            <TextInput
              style={styles.input}
              placeholder="金额"
              placeholderTextColor={colors.textSecondary}
              keyboardType="decimal-pad"
              value={formAmount}
              onChangeText={setFormAmount}
            />

            {/* 周期 */}
            <Text style={styles.label}>周期</Text>
            <View style={styles.periodRow}>
              {PERIOD_OPTIONS.map((p, i) => (
                <TouchableOpacity
                  key={i}
                  style={[styles.periodChip, formPeriodIdx === i && styles.periodChipActive]}
                  onPress={() => setFormPeriodIdx(i)}
                >
                  <Text style={[styles.periodChipText, formPeriodIdx === i && styles.periodChipTextActive]}>{p.label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* 分类 */}
            <Text style={styles.label}>分类</Text>
            <View style={styles.categoryRow}>
              {filteredCategories.map((cat) => (
                <TouchableOpacity
                  key={cat.id}
                  style={[styles.categoryChip, formCategoryId === cat.id && { backgroundColor: cat.color + '33', borderColor: cat.color }]}
                  onPress={() => setFormCategoryId(cat.id)}
                >
                  <Text style={styles.categoryIcon}>{cat.icon}</Text>
                  <Text style={styles.categoryName}>{cat.name}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <TextInput
              style={styles.input}
              placeholder="商户/用途（可选）"
              placeholderTextColor={colors.textSecondary}
              value={formMerchant}
              onChangeText={setFormMerchant}
            />

            <TextInput
              style={styles.input}
              placeholder="备注（可选）"
              placeholderTextColor={colors.textSecondary}
              value={formNote}
              onChangeText={setFormNote}
            />

            <TouchableOpacity style={styles.saveBtn} onPress={handleSave}>
              <Text style={styles.saveBtnText}>保存</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* 列表 */}
        {recurrings.length === 0 && !showForm && (
          <View style={styles.emptyBox}>
            <Text style={styles.emptyText}>暂无周期记账</Text>
            <Text style={styles.emptyHint}>点击右上角"+ 新增"添加周期性收支，如房租、工资等</Text>
          </View>
        )}
        {recurrings.map((rec) => {
          const cat = getCategoryById(rec.categoryId);
          return (
            <View key={rec.id} style={[styles.card, !rec.enabled && styles.cardDisabled]}>
              <View style={styles.recRow}>
                <View style={[styles.recIcon, { backgroundColor: cat.color + '33' }]}>
                  <Text style={{ fontSize: 18 }}>{cat.icon}</Text>
                </View>
                <View style={styles.recInfo}>
                  <Text style={styles.recTitle}>{rec.merchant || cat.name}</Text>
                  <Text style={styles.recSub}>
                    {periodLabel(rec)} · {rec.type === 'income' ? '收入' : '支出'} · 下次 {formatDateTime(rec.nextTrigger)}
                  </Text>
                  {rec.note ? <Text style={styles.recNote}>{rec.note}</Text> : null}
                </View>
                <Text style={[styles.recAmount, { color: rec.type === 'income' ? colors.success : colors.text }]}>
                  {rec.type === 'income' ? '+' : '-'}¥{rec.amount.toFixed(2)}
                </Text>
              </View>
              <View style={styles.recActions}>
                <Switch
                  value={rec.enabled}
                  onValueChange={(v) => handleToggle(rec.id, v)}
                  trackColor={{ false: colors.border, true: colors.primary }}
                  thumbColor="#fff"
                />
                <TouchableOpacity style={styles.deleteBtn} onPress={() => handleDelete(rec.id)}>
                  <Text style={styles.deleteBtnText}>删除</Text>
                </TouchableOpacity>
              </View>
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
    backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border,
  },
  back: { color: c.primary, fontSize: 15, width: 60, fontWeight: '500' },
  title: { fontSize: 18, fontWeight: '700', color: c.text },
  content: { padding: 16 },
  card: {
    backgroundColor: c.surface, borderRadius: 16, padding: 16, marginBottom: 12,
    borderWidth: 1, borderColor: c.border,
    shadowColor: c.primary, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.04, shadowRadius: 8, elevation: 2,
  },
  cardDisabled: { opacity: 0.5 },
  cardTitle: { fontSize: 16, fontWeight: '600', color: c.text, marginBottom: 12 },
  typeRow: { flexDirection: 'row', gap: 10, marginBottom: 14 },
  typeBtn: {
    flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: 'center',
    backgroundColor: c.background, borderWidth: 1, borderColor: c.border,
  },
  typeBtnActive: { backgroundColor: c.primary, borderColor: c.primary },
  typeBtnText: { fontSize: 14, fontWeight: '600', color: c.text },
  typeBtnTextActive: { color: '#fff' },
  input: {
    backgroundColor: c.background, borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 10, fontSize: 15,
    borderWidth: 1, borderColor: c.border, color: c.text, marginBottom: 10,
  },
  label: { fontSize: 13, fontWeight: '600', color: c.textSecondary, marginBottom: 8 },
  periodRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 },
  periodChip: {
    paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8,
    backgroundColor: c.background, borderWidth: 1, borderColor: c.border,
  },
  periodChipActive: { backgroundColor: c.primary, borderColor: c.primary },
  periodChipText: { fontSize: 13, color: c.text },
  periodChipTextActive: { color: '#fff', fontWeight: '600' },
  categoryRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 },
  categoryChip: {
    width: '18%', aspectRatio: 1, borderRadius: 12, borderWidth: 1, borderColor: c.border,
    alignItems: 'center', justifyContent: 'center', backgroundColor: c.surface,
  },
  categoryIcon: { fontSize: 18, marginBottom: 2 },
  categoryName: { fontSize: 10, color: c.textSecondary },
  saveBtn: {
    backgroundColor: c.primary, borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 4,
  },
  saveBtnText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  emptyBox: { alignItems: 'center', marginTop: 60 },
  emptyText: { fontSize: 16, color: c.textSecondary, fontWeight: '500' },
  emptyHint: { fontSize: 13, color: c.textSecondary, textAlign: 'center', marginTop: 8, lineHeight: 20 },
  recRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  recIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  recInfo: { flex: 1 },
  recTitle: { fontSize: 15, fontWeight: '600', color: c.text },
  recSub: { fontSize: 12, color: c.textSecondary, marginTop: 2 },
  recNote: { fontSize: 12, color: c.textSecondary, marginTop: 2, fontStyle: 'italic' },
  recAmount: { fontSize: 16, fontWeight: '700' },
  recActions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: c.border },
  deleteBtn: { paddingHorizontal: 16, paddingVertical: 6 },
  deleteBtnText: { color: c.danger, fontSize: 13, fontWeight: '500' },
});
