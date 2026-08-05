import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Canvas, Path, Skia } from '@shopify/react-native-skia';
import { getCategoryById } from '../constants/categories';
import { useThemedStyles, useColors } from '../constants/colors';
import type { AppColors } from '../constants/colors';
import { formatMoney } from '../utils/date';

interface DonutChartProps {
  data: { categoryId: string; total: number }[];
  size?: number;
  strokeWidth?: number;
  label?: string;
}

const createStyles = (c: AppColors) => StyleSheet.create({
  container: { alignItems: 'center', justifyContent: 'center' },
  center: {
    position: 'absolute', backgroundColor: c.surface,
    alignItems: 'center', justifyContent: 'center',
  },
  totalLabel: { fontSize: 11, color: c.textSecondary },
  totalValue: { fontSize: 16, fontWeight: '700', color: c.text, marginTop: 2 },
});

export function DonutChart({ data, size = 160, strokeWidth = 22, label = '本月支出' }: DonutChartProps) {
  const styles = useThemedStyles(createStyles);
  const colors = useColors();
  const total = data.reduce((sum, item) => sum + item.total, 0);
  const innerRadius = size / 2 - strokeWidth / 2;
  const gapAngle = data.length > 1 ? 2 : 0;

  const paths: { path: any; color: string }[] = [];
  let startAngle = -90;

  for (const item of data) {
    const sweep = total > 0 ? (item.total / total) * 360 : 0;
    const actualSweep = Math.max(0, sweep - gapAngle);
    const category = getCategoryById(item.categoryId);

    const path = Skia.Path.Make();
    path.addArc(
      { x: strokeWidth / 2, y: strokeWidth / 2, width: size - strokeWidth, height: size - strokeWidth },
      startAngle + gapAngle / 2,
      actualSweep
    );
    paths.push({ path, color: category.color });
    startAngle += sweep;
  }

  return (
    <View style={styles.container}>
      <Canvas style={{ width: size, height: size }}>
        <Path
          path={Skia.Path.Make().addArc(
            { x: strokeWidth / 2, y: strokeWidth / 2, width: size - strokeWidth, height: size - strokeWidth },
            0, 360
          )}
          color={colors.border}
          style="stroke"
          strokeWidth={strokeWidth}
        />
        {paths.map((p, index) => (
          <Path key={index} path={p.path} color={p.color} style="stroke" strokeWidth={strokeWidth} strokeCap="round" />
        ))}
      </Canvas>
      <View style={[styles.center, { width: innerRadius * 2, height: innerRadius * 2, borderRadius: innerRadius }]}>
        <Text style={styles.totalLabel}>{label}</Text>
        <Text style={styles.totalValue}>{formatMoney(total)}</Text>
      </View>
    </View>
  );
}
