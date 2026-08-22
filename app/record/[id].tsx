import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, useThemedStyles, useColors } from '../../constants/colors';
import type { AppColors } from '../../constants/colors';
import { getCategoryById, getCategoriesByType } from '../../constants/categories';
import { useRecordStore } from '../../stores/useRecordStore';
import * as db from '../../modules/db';
import { formatDateTime, formatMoney } from '../../utils/date';
import type { PayRecord } from '../../modules/record/types';

const STATUS_LABEL: Record<string, string> = {
  confirmed: '已确认',
  pending: '待确认',
  ignored: '已忽略',
  refunded: '已退款',
  partial: '部分退款',
};

export default function RecordDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [record, setRecord] = useState<PayRecord | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editAmount, setEditAmount] = useState('');
  const [editCategoryId, setEditCategoryId] = useState('');
  const [editMerchant, setEditMerchant] = useState('');
  const [editNote, setEditNote] = useState('');
  const styles = useThemedStyles(createStyles);
  const colors = useColors();

  const load = useCallback(async () => {
    if (!id) return;
    const r = await db.getRecordById(id);
    if (r) setRecord(r);
    else setNotFound(true);
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const startEdit = () => {
    if (!record) return;
    setEditAmount(record.amount.toFixed(2));
    setEditCategoryId(record.categoryId);
    setEditMerchant(record.merchant || '');
    setEditNote(record.note || '');
    setEditing(true);
  };

  const saveEdit = async () => {
    if (!record) return;
    const amount = parseFloat(editAmount);
    if (isNaN(amount) || amount <= 0) {
      Alert.alert('提示', '请输入有效金额');
      return;
    }
    await db.updateRecord({
      id: record.id,
      amount,
      categoryId: editCategoryId,
      // 直接传编辑后的值（含空串），否则清空商户/备注后保存旧值会残留
      merchant: editMerchant,
      note: editNote,
    });
    setEditing(false);
    await load();
    await useRecordStore.getState().refreshDashboard();
  };

  const handleDelete = () => {
    Alert.alert('删除记录', '确定要删除这条流水吗？删除后无法恢复。', [
      { text: '取消', style: 'cancel' },
      {
        text: '删除',
        style: 'destructive',
        onPress: async () => {
          if (!record) return;
          await db.deleteRecord(record.id);
          await useRecordStore.getState().refreshDashboard();
          router.back();
        },
      },
    ]);
  };

  const category = record ? getCategoryById(record.categoryId) : null;
  const filteredCategories = record ? getCategoriesByType(record.type) : [];

  return (
    <View style={styles.safe}>
      <View style={[styles.header, { paddingTop: Math.max(insets.top, 16) }]}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.back}>← 返回</Text>
        </TouchableOpacity>
        <Text style={styles.title}>流水详情</Text>
        {record && !editing ? (
          <TouchableOpacity onPress={startEdit}>
            <Text style={styles.editBtn}>编辑</Text>
          </TouchableOpacity>
        ) : editing ? (
          <TouchableOpacity onPress={saveEdit}>
            <Text style={styles.editBtn}>保存</Text>
          </TouchableOpacity>
        ) : (
          <View style={{ width: 60 }} />
        )}
      </View>

      <ScrollView style={styles.content} contentContainerStyle={{ paddingBottom: 24 + insets.bottom }} keyboardShouldPersistTaps="handled">
        {notFound && <Text style={styles.hint}>记录不存在或已被删除</Text>}

        {editing ? (
          <>
            <View style={styles.editCard}>
              <Text style={styles.editLabel}>金额</Text>
              <TextInput
                style={styles.editInput}
                value={editAmount}
                onChangeText={setEditAmount}
                keyboardType="decimal-pad"
                selectTextOnFocus
              />
            </View>

            <View style={styles.editCard}>
              <Text style={styles.editLabel}>分类</Text>
              <View style={styles.categoryGrid}>
                {filteredCategories.map((cat) => (
                  <TouchableOpacity
                    key={cat.id}
                    style={[
                      styles.categoryItem,
                      editCategoryId === cat.id && { backgroundColor: cat.color + '33', borderColor: cat.color },
                    ]}
                    onPress={() => setEditCategoryId(cat.id)}
                  >
                    <Text style={styles.categoryIcon}>{cat.icon}</Text>
                    <Text style={styles.editCategoryName}>{cat.name}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <View style={styles.editCard}>
              <Text style={styles.editLabel}>商户/用途</Text>
              <TextInput
                style={styles.editInput}
                value={editMerchant}
                onChangeText={setEditMerchant}
                placeholder="例如：午餐、超市"
                placeholderTextColor={colors.textSecondary}
              />
            </View>

            <View style={styles.editCard}>
              <Text style={styles.editLabel}>备注</Text>
              <TextInput
                style={styles.editInput}
                value={editNote}
                onChangeText={setEditNote}
                placeholder="备注（可选）"
                placeholderTextColor={colors.textSecondary}
              />
            </View>

            <TouchableOpacity style={styles.cancelEditBtn} onPress={() => setEditing(false)}>
              <Text style={styles.cancelEditBtnText}>取消编辑</Text>
            </TouchableOpacity>
          </>
        ) : record && category ? (
          <>
            <View style={[styles.amountCard, { backgroundColor: category.color + '14' }]}>
              <View style={[styles.iconCircle, { backgroundColor: category.color + '2E' }]}>
                <Text style={styles.icon}>{category.icon}</Text>
              </View>
              <Text style={[styles.amount, { color: record.type === 'income' ? colors.success : colors.text }]}>
                {record.type === 'income' ? '+' : '-'}{formatMoney(record.amount)}
              </Text>
              <View style={[styles.typeBadge, { backgroundColor: category.color + '24' }]}>
                <Text style={[styles.typeBadgeText, { color: category.color }]}>
                  {category.name} · {record.type === 'income' ? '收入' : '支出'}
                </Text>
              </View>
            </View>

            <View style={styles.detailCard}>
              <DetailRow label="商户/对方" value={record.merchant || '—'} rowStyle={styles.row} labelStyle={styles.rowLabel} valueStyle={styles.rowValue} />
              <DetailRow label="备注" value={record.note || '—'} rowStyle={styles.row} labelStyle={styles.rowLabel} valueStyle={styles.rowValue} />
              <DetailRow label="支付渠道" value={record.channel || record.sourceApp || '手动记账'} rowStyle={styles.row} labelStyle={styles.rowLabel} valueStyle={styles.rowValue} />
              <DetailRow label="记录时间" value={formatDateTime(record.createdAt)} rowStyle={styles.row} labelStyle={styles.rowLabel} valueStyle={styles.rowValue} />
              {record.confirmedAt != null && (
                <DetailRow label="确认时间" value={formatDateTime(record.confirmedAt)} rowStyle={styles.row} labelStyle={styles.rowLabel} valueStyle={styles.rowValue} />
              )}
              <DetailRow label="状态" value={STATUS_LABEL[record.status]} rowStyle={styles.row} labelStyle={styles.rowLabel} valueStyle={styles.rowValue} />
              <DetailRow label="记录 ID" value={record.id} small last rowStyle={styles.row} labelStyle={styles.rowLabel} valueStyle={styles.rowValue} />
            </View>

            {record.rawNotification ? (
              <View style={styles.detailCard}>
                <Text style={styles.rawTitle}>原始通知</Text>
                <Text style={styles.rawText}>{record.rawNotification}</Text>
              </View>
            ) : null}

            <TouchableOpacity style={styles.deleteBtn} onPress={handleDelete}>
              <Text style={styles.deleteBtnText}>删除这条记录</Text>
            </TouchableOpacity>
          </>
        ) : null}
      </ScrollView>
    </View>
  );
}

function DetailRow({ label, value, small, last, rowStyle, labelStyle, valueStyle }: { label: string; value: string; small?: boolean; last?: boolean; rowStyle: any; labelStyle: any; valueStyle: any }) {
  return (
    <View style={[rowStyle, last && { borderBottomWidth: 0 }]}>
      <Text style={labelStyle}>{label}</Text>
      <Text style={[valueStyle, small && { fontSize: 11 }]} numberOfLines={small ? 1 : undefined}>{value}</Text>
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
  editBtn: { color: c.primary, fontSize: 15, fontWeight: '600' },
  content: { padding: 16 },
  hint: { textAlign: 'center', color: c.textSecondary, marginTop: 40 },
  amountCard: {
    backgroundColor: c.surface, borderRadius: 16, padding: 24, alignItems: 'center', marginBottom: 16,
    shadowColor: c.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.06, shadowRadius: 12, elevation: 3,
  },
  iconCircle: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  icon: { fontSize: 28 },
  amount: { fontSize: 32, fontWeight: '700' },
  typeBadge: { marginTop: 10, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 5 },
  typeBadgeText: { fontSize: 13, fontWeight: '600' },
  detailCard: {
    backgroundColor: c.surface, borderRadius: 16, paddingHorizontal: 16, marginBottom: 16,
    shadowColor: c.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.06, shadowRadius: 12, elevation: 3,
  },
  row: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: c.border, gap: 16,
  },
  rowLabel: { fontSize: 14, color: c.textSecondary },
  rowValue: { fontSize: 14, color: c.text, fontWeight: '500', flexShrink: 1, textAlign: 'right' },
  rawTitle: { fontSize: 13, color: c.textSecondary, marginTop: 14, marginBottom: 6 },
  rawText: { fontSize: 13, color: c.text, lineHeight: 20, marginBottom: 14 },
  deleteBtn: {
    backgroundColor: c.danger + '12', borderRadius: 12, paddingVertical: 14, alignItems: 'center',
    marginTop: 8,
  },
  deleteBtnText: { color: c.danger, fontSize: 15, fontWeight: '600' },
  editCard: { backgroundColor: c.surface, borderRadius: 16, padding: 16, marginBottom: 12 },
  editLabel: { fontSize: 14, fontWeight: '500', color: c.text, marginBottom: 8 },
  editInput: {
    backgroundColor: c.background, borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 10, fontSize: 15,
    borderWidth: 1, borderColor: c.border, color: c.text,
  },
  categoryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  categoryItem: {
    width: '18%', aspectRatio: 1, borderRadius: 12, borderWidth: 1, borderColor: c.border,
    alignItems: 'center', justifyContent: 'center', backgroundColor: c.surface,
  },
  categoryIcon: { fontSize: 22, marginBottom: 4 },
  editCategoryName: { fontSize: 11, color: c.textSecondary },
  cancelEditBtn: {
    backgroundColor: c.surface, borderRadius: 12, paddingVertical: 14, alignItems: 'center',
    borderWidth: 1, borderColor: c.border, marginTop: 4,
  },
  cancelEditBtnText: { color: c.textSecondary, fontSize: 15, fontWeight: '500' },
});
