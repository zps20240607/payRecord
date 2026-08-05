import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import BottomSheet, { BottomSheetBackdrop, BottomSheetView } from '@gorhom/bottom-sheet';
import type { ParsedNotification, PayRecord } from '../modules/record/types';
import { DEFAULT_CATEGORIES, getCategoryById } from '../constants/categories';
import { useThemedStyles, useColors } from '../constants/colors';
import type { AppColors } from '../constants/colors';
import { formatDateTime, formatMoney } from '../utils/date';

interface ConfirmSheetProps {
  payload: ParsedNotification | null;
  onConfirm: (record: PayRecord) => void;
  onIgnore: () => void;
  onLater: () => void;
}

const createStyles = (c: AppColors) => StyleSheet.create({
  container: { flex: 1, paddingHorizontal: 20, paddingBottom: 30 },
  title: { fontSize: 18, fontWeight: '600', textAlign: 'center', marginBottom: 16, color: c.text },
  amountRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  currency: { fontSize: 32, fontWeight: '700', color: c.text, marginRight: 4 },
  amountInput: { fontSize: 40, fontWeight: '700', color: c.text, minWidth: 120, textAlign: 'center' },
  metaRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  metaText: { color: c.textSecondary, fontSize: 13 },
  channelText: { color: c.textSecondary, fontSize: 13, marginBottom: 16 },
  sectionTitle: { fontSize: 14, fontWeight: '600', marginBottom: 10, color: c.text },
  categoryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 16 },
  categoryItem: {
    width: '18%', aspectRatio: 1, borderRadius: 12, borderWidth: 1, borderColor: c.border,
    alignItems: 'center', justifyContent: 'center', backgroundColor: c.surface,
  },
  categoryIcon: { fontSize: 22, marginBottom: 4 },
  categoryName: { fontSize: 11, color: c.textSecondary },
  noteInput: {
    borderWidth: 1, borderColor: c.border, borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, marginBottom: 16, backgroundColor: c.surface, color: c.text,
  },
  actions: { flexDirection: 'row', gap: 10, marginTop: 'auto' },
  btn: { flex: 1, paddingVertical: 14, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  btnPrimary: { flex: 2, backgroundColor: c.primary },
  btnDisabled: { backgroundColor: c.border, opacity: 0.6 },
  btnSecondary: { backgroundColor: c.border },
  btnTextPrimary: { color: '#fff', fontWeight: '600', fontSize: 14 },
  btnTextSecondary: { color: c.text, fontWeight: '500', fontSize: 14 },
});

export const ConfirmSheet = React.forwardRef<BottomSheet, ConfirmSheetProps>(
  ({ payload, onConfirm, onIgnore, onLater }, ref) => {
    const styles = useThemedStyles(createStyles);
    const colors = useColors();
    const [amount, setAmount] = useState('');
    const [categoryId, setCategoryId] = useState(DEFAULT_CATEGORIES[0].id);
    const [note, setNote] = useState('');

    const EXPENSE_IDS = ['food', 'transport', 'shopping', 'entertainment', 'housing', 'medical', 'education', 'social', 'expense_other'];
    const INCOME_IDS = ['salary', 'redpacket', 'transfer', 'parttime', 'invest', 'income_other'];
    const filteredCategories = useMemo(() =>
      DEFAULT_CATEGORIES.filter(c =>
        (payload?.type === 'income' ? INCOME_IDS : EXPENSE_IDS).includes(c.id)
      ), [payload?.type]
    );

    useEffect(() => {
      if (payload) {
        setAmount(payload.amount != null ? payload.amount.toFixed(2) : '');
        if (payload.type === 'income') {
          if (payload.channel?.includes('红包')) setCategoryId('redpacket');
          else if (payload.channel?.includes('转账')) setCategoryId('transfer');
          else setCategoryId('salary');
        } else {
          if (payload.channel?.includes('红包')) setCategoryId('social');
          else if (payload.channel?.includes('转账')) setCategoryId('social');
          else setCategoryId('food');
        }
        setNote(payload.channel?.includes('红包') ? '红包' : '');
      }
    }, [payload]);

    const handleConfirm = useCallback(() => {
      if (!payload) return;
      const value = parseFloat(amount);
      if (isNaN(value) || value <= 0) return;

      const record: PayRecord = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        amount: value,
        type: payload.type,
        categoryId,
        merchant: payload.merchant,
        channel: payload.channel,
        sourceApp: payload.sourceApp,
        rawNotification: payload.raw,
        note,
        createdAt: Date.now(),
        confirmedAt: Date.now(),
        status: 'confirmed',
      };
      onConfirm(record);
    }, [payload, amount, categoryId, note, onConfirm]);

    const renderBackdrop = useCallback(
      (props: any) => <BottomSheetBackdrop {...props} appearsOnIndex={0} disappearsOnIndex={-1} pressBehavior="close" />,
      []
    );

    if (!payload) return null;

    return (
      <BottomSheet
        ref={ref}
        index={-1}
        snapPoints={['60%']}
        enablePanDownToClose
        backdropComponent={renderBackdrop}
        keyboardBehavior="interactive"
        keyboardBlurBehavior="restore"
        android_keyboardInputMode="adjustResize"
      >
        <BottomSheetView style={styles.container}>
          <Text style={styles.title}>确认这笔{payload.type === 'income' ? '收入' : '支出'}</Text>
          <View style={styles.amountRow}>
            <Text style={styles.currency}>¥</Text>
            <TextInput style={styles.amountInput} value={amount} onChangeText={setAmount} keyboardType="decimal-pad" selectTextOnFocus />
          </View>
          <View style={styles.metaRow}>
            <Text style={styles.metaText}>{payload.merchant || '未知商户'}</Text>
            <Text style={styles.metaText}>{formatDateTime(Date.now())}</Text>
          </View>
          <Text style={styles.channelText}>{payload.channel}</Text>
          <Text style={styles.sectionTitle}>选择分类</Text>
          <View style={styles.categoryGrid}>
            {filteredCategories.map((cat) => (
              <TouchableOpacity
                key={cat.id}
                style={[styles.categoryItem, categoryId === cat.id && { backgroundColor: cat.color + '33', borderColor: cat.color }]}
                onPress={() => setCategoryId(cat.id)}
              >
                <Text style={styles.categoryIcon}>{cat.icon}</Text>
                <Text style={[styles.categoryName, categoryId === cat.id && { color: cat.color }]}>{cat.name}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <TextInput style={styles.noteInput} placeholder="备注（可选）" placeholderTextColor={colors.textSecondary} value={note} onChangeText={setNote} />
          <View style={styles.actions}>
            <TouchableOpacity style={[styles.btn, styles.btnSecondary]} onPress={onIgnore}>
              <Text style={styles.btnTextSecondary}>忽略</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.btn, styles.btnSecondary]} onPress={onLater}>
              <Text style={styles.btnTextSecondary}>稍后</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.btn, styles.btnPrimary, (!amount || parseFloat(amount) <= 0) && styles.btnDisabled]}
              onPress={handleConfirm}
              disabled={!amount || parseFloat(amount) <= 0}
            >
              <Text style={styles.btnTextPrimary}>
                {!amount || parseFloat(amount) <= 0 ? '请输入金额' : `保存 ${formatMoney(parseFloat(amount))}`}
              </Text>
            </TouchableOpacity>
          </View>
        </BottomSheetView>
      </BottomSheet>
    );
  }
);
