import React, { memo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useSharedValue, useAnimatedStyle, withSpring } from 'react-native-reanimated';
import type { PayRecord } from '../modules/record/types';
import { getCategoryById } from '../constants/categories';
import { useThemedStyles, useColors } from '../constants/colors';
import type { AppColors } from '../constants/colors';
import { formatDateTime, formatMoney } from '../utils/date';
import * as db from '../modules/db';
import { useRecordStore } from '../stores/useRecordStore';

interface RecordItemProps {
  record: PayRecord;
  onPress?: (record: PayRecord) => void;
  onDeleted?: () => void;
}

const createStyles = (c: AppColors) => StyleSheet.create({
  container: {
    overflow: 'hidden',
    borderBottomWidth: 1,
    borderBottomColor: c.border,
  },
  deleteBg: {
    position: 'absolute',
    right: 0, top: 0, bottom: 0,
    width: 80,
    backgroundColor: c.danger,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteText: { color: '#fff', fontWeight: '600', fontSize: 14 },
  row: {
    flexDirection: 'row', alignItems: 'center', paddingVertical: 12,
    backgroundColor: c.surface,
  },
  iconCircle: {
    width: 44, height: 44, borderRadius: 16,
    alignItems: 'center', justifyContent: 'center', marginRight: 12,
  },
  icon: { fontSize: 21 },
  info: { flex: 1 },
  title: { fontSize: 15, fontWeight: '600', color: c.text },
  subtitle: { fontSize: 12, color: c.textSecondary, marginTop: 3 },
  amountWrap: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  amount: { fontSize: 17, fontWeight: '700', letterSpacing: -0.3 },
  chevron: { fontSize: 18, color: c.border, fontWeight: '600', marginLeft: 2 },
});

export const RecordItem = memo(function RecordItem({ record, onPress, onDeleted }: RecordItemProps) {
  const colors = useColors();
  const styles = useThemedStyles(createStyles);
  const category = getCategoryById(record.categoryId);

  const offsetX = useSharedValue(0);

  const panGesture = Gesture.Pan()
    .activeOffsetX([-10, 10])
    .failOffsetY([-20, 20])
    .onUpdate((e) => {
      if (e.translationX < 0) {
        offsetX.value = Math.max(e.translationX, -80);
      } else {
        offsetX.value = Math.min(e.translationX + offsetX.value, 0);
      }
    })
    .onEnd(() => {
      if (offsetX.value < -40) {
        offsetX.value = withSpring(-80, { damping: 20 });
      } else {
        offsetX.value = withSpring(0, { damping: 20 });
      }
    });

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: offsetX.value }],
  }));

  const handleDelete = () => {
    Alert.alert('删除记录', `确定删除这笔 ¥${record.amount.toFixed(2)} 的${record.type === 'income' ? '收入' : '支出'}记录吗？`, [
      { text: '取消', style: 'cancel', onPress: () => {
        offsetX.value = withSpring(0);
      }},
      { text: '删除', style: 'destructive', onPress: async () => {
        await db.deleteRecord(record.id);
        await useRecordStore.getState().refreshDashboard();
        onDeleted?.();
      }},
    ]);
  };

  return (
    <GestureDetector gesture={panGesture}>
      <View style={styles.container}>
        <View style={styles.deleteBg}>
          <TouchableOpacity onPress={handleDelete} style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={styles.deleteText}>删除</Text>
          </TouchableOpacity>
        </View>
        <Animated.View style={animatedStyle}>
          <TouchableOpacity
            style={styles.row}
            activeOpacity={0.6}
            onPress={() => onPress?.(record)}
          >
            <View style={[styles.iconCircle, { backgroundColor: category.color + '26' }]}>
              <Text style={styles.icon}>{category.icon}</Text>
            </View>
            <View style={styles.info}>
              <Text style={styles.title} numberOfLines={1}>{record.merchant || category.name}</Text>
              <Text style={styles.subtitle} numberOfLines={1}>
                {formatDateTime(record.createdAt)} · {record.channel || record.sourceApp || '手动'}
              </Text>
            </View>
            <View style={styles.amountWrap}>
              <Text style={[styles.amount, { color: record.type === 'income' ? colors.success : colors.text }]}>
                {record.type === 'income' ? '+' : '-'}{formatMoney(record.amount)}
              </Text>
              <Text style={styles.chevron}>›</Text>
            </View>
          </TouchableOpacity>
        </Animated.View>
      </View>
    </GestureDetector>
  );
});
