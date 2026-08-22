import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, useThemedStyles, useColors } from '../constants/colors';
import type { AppColors } from '../constants/colors';
import { DEFAULT_CATEGORIES, getCategoriesByType } from '../constants/categories';
import { useRecordStore } from '../stores/useRecordStore';
import type { PayRecord } from '../modules/record/types';

export default function AddRecordScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [amount, setAmount] = useState('');
  const [type, setType] = useState<'expense' | 'income'>('expense');
  const [categoryId, setCategoryId] = useState(DEFAULT_CATEGORIES[0].id);

  const filteredCategories = getCategoriesByType(type);

  const handleTypeChange = (newType: 'expense' | 'income') => {
    setType(newType);
    setCategoryId(newType === 'expense' ? 'food' : 'salary');
  };
  const [merchant, setMerchant] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const styles = useThemedStyles(createStyles);
  const colors = useColors();

  const handleSave = async () => {
    if (saving) return; // 防连点重复插入
    const value = parseFloat(amount);
    if (isNaN(value) || value <= 0) return;
    if (!categoryId) return;

    setSaving(true);
    try {
      const record: PayRecord = {
        // 同毫秒连点/批量导入时 Date.now() 会撞主键，追加随机后缀
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        amount: value,
        type,
        categoryId,
        merchant: merchant || undefined,
        channel: '手动记账',
        note,
        createdAt: Date.now(),
        confirmedAt: Date.now(),
        status: 'confirmed',
      };

      await useRecordStore.getState().addRecord(record);
      router.back();
    } finally {
      setSaving(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={[styles.header, { paddingTop: Math.max(insets.top, 16) }]}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.back}>← 返回</Text>
        </TouchableOpacity>
        <Text style={styles.title}>记一笔</Text>
        <View style={{ width: 50 }} />
      </View>

      <ScrollView style={styles.form} keyboardShouldPersistTaps="handled">
        <View style={styles.typeRow}>
          <TouchableOpacity
            style={[styles.typeBtn, type === 'expense' && styles.typeBtnActive]}
            onPress={() => handleTypeChange('expense')}
          >
            <Text style={[styles.typeText, type === 'expense' && styles.typeTextActive]}>支出</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.typeBtn, type === 'income' && styles.typeBtnActive]}
            onPress={() => handleTypeChange('income')}
          >
            <Text style={[styles.typeText, type === 'income' && styles.typeTextActive]}>收入</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>金额</Text>
          <TextInput
            style={styles.input}
            placeholder="0.00"
            placeholderTextColor={colors.textSecondary}
            keyboardType="decimal-pad"
            value={amount}
            onChangeText={setAmount}
          />
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>商户/用途</Text>
          <TextInput style={styles.input} placeholder="例如：午餐、超市" placeholderTextColor={colors.textSecondary} value={merchant} onChangeText={setMerchant} />
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>分类</Text>
          <View style={styles.categoryGrid}>
            {filteredCategories.map((cat) => (
              <TouchableOpacity
                key={cat.id}
                style={[
                  styles.categoryItem,
                  categoryId === cat.id && { backgroundColor: cat.color + '33', borderColor: cat.color },
                ]}
                onPress={() => setCategoryId(cat.id)}
              >
                <Text style={styles.categoryIcon}>{cat.icon}</Text>
                <Text style={styles.categoryName}>{cat.name}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>备注</Text>
          <TextInput style={styles.input} placeholder="备注（可选）" placeholderTextColor={colors.textSecondary} value={note} onChangeText={setNote} />
        </View>
      </ScrollView>

      <TouchableOpacity style={[styles.saveBtn, { marginBottom: 16 + insets.bottom }]} onPress={handleSave}>
        <Text style={styles.saveText}>保存</Text>
      </TouchableOpacity>
    </KeyboardAvoidingView>
  );
}

const createStyles = (c: AppColors) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: c.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
    backgroundColor: c.surface,
    borderBottomWidth: 1,
    borderBottomColor: c.border,
  },
  back: {
    color: c.primary,
    fontSize: 15,
    width: 60,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: c.text,
  },
  form: {
    flex: 1,
    padding: 16,
  },
  typeRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 20,
  },
  typeBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: c.surface,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: c.border,
  },
  typeBtnActive: {
    backgroundColor: c.primary,
    borderColor: c.primary,
  },
  typeText: {
    fontWeight: '600',
    color: c.text,
  },
  typeTextActive: {
    color: '#fff',
  },
  inputGroup: {
    marginBottom: 20,
  },
  label: {
    fontSize: 14,
    fontWeight: '500',
    color: c.text,
    marginBottom: 8,
  },
  input: {
    backgroundColor: c.surface,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    borderWidth: 1,
    borderColor: c.border,
    color: c.text,
  },
  categoryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  categoryItem: {
    width: '18%',
    aspectRatio: 1,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: c.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: c.surface,
  },
  categoryIcon: {
    fontSize: 22,
    marginBottom: 4,
  },
  categoryName: {
    fontSize: 11,
    color: c.textSecondary,
  },
  saveBtn: {
    margin: 16,
    backgroundColor: c.primary,
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: 'center',
    shadowColor: c.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  saveText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
