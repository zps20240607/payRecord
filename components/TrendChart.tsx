import React from 'react';
import { View, Text, StyleSheet, useWindowDimensions } from 'react-native';
import { CartesianChart, Line, Area } from 'victory-native';
import { useThemedStyles, useColors } from '../constants/colors';
import type { AppColors } from '../constants/colors';

interface TrendChartProps {
  data: { day: string; total: number }[];
}

function formatDay(day: string): string {
  const parts = day.split('-');
  if (parts.length === 3) return `${Number(parts[1])}/${Number(parts[2])}`;
  return day;
}

const createStyles = (c: AppColors) => StyleSheet.create({
  container: { height: 180 },
  labelsRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 },
  labelItem: { flex: 1, alignItems: 'center' },
  labelAmount: { fontSize: 9, fontWeight: '700', color: c.primary },
  labelDay: { fontSize: 9, color: c.textSecondary, marginTop: 2 },
  empty: { height: 180, alignItems: 'center', justifyContent: 'center' },
  emptyText: { color: c.textSecondary },
});

export function TrendChart({ data }: TrendChartProps) {
  const { width } = useWindowDimensions();
  const styles = useThemedStyles(createStyles);
  const colors = useColors();

  if (data.length === 0) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyText}>暂无趋势数据</Text>
      </View>
    );
  }

  return (
    <View style={{ width: width - 40, alignSelf: 'center' }}>
      <View style={styles.container}>
        <CartesianChart
          data={data}
          xKey="day"
          yKeys={['total']}
          domainPadding={{ left: 10, right: 10 }}
          axisOptions={{
            font: undefined as any,
            tickCount: { x: Math.min(data.length, 5), y: 4 },
            lineColor: colors.border,
            labelColor: colors.textSecondary,
          }}
        >
          {({ points, chartBounds }) => (
            <>
              <Area points={points.total} y0={chartBounds.bottom} color={colors.primary} opacity={0.08} />
              <Line points={points.total} color={colors.primary} strokeWidth={2.5} strokeCap="round" strokeJoin="round" />
            </>
          )}
        </CartesianChart>
      </View>
      <View style={styles.labelsRow}>
        {data.map((item) => (
          <View key={item.day} style={styles.labelItem}>
            <Text style={styles.labelAmount} numberOfLines={1}>
              ¥{item.total % 1 === 0 ? item.total : item.total.toFixed(2)}
            </Text>
            <Text style={styles.labelDay}>{formatDay(item.day)}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}
