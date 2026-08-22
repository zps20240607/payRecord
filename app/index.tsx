import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  useWindowDimensions,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useFocusEffect } from 'expo-router';
import BottomSheet from '@gorhom/bottom-sheet';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, useThemedStyles, useColors } from '../constants/colors';
import type { AppColors } from '../constants/colors';
import { useRecordStore } from '../stores/useRecordStore';
import { useAppStore } from '../stores/useAppStore';
import { useThemeStore } from '../stores/useThemeStore';
import { RecordItem } from '../components/RecordItem';
import { ConfirmSheet } from '../components/ConfirmSheet';
import { DonutChart } from '../components/DonutChart';
import { TrendChart } from '../components/TrendChart';
import { DraggableFab } from '../components/DraggableFab';
import { EasterEggModal } from '../components/EasterEggModal';
import { formatMoney, subDays, startOfDay, endOfDay, startOfMonth, endOfMonth } from '../utils/date';
import type { ParsedNotification, PayRecord } from '../modules/record/types';
import { DEFAULT_CATEGORIES, getCategoryById } from '../constants/categories';
import {
  startNotificationListener,
  isNotificationServiceEnabled,
  openNotificationSettings,
  setNotificationCallback,
  setupQuickAddSync,
  setQuickAddQueueConsumer,
  sendBudgetAlert,
} from '../modules/notification';
import { getBudgetAlertStorage } from '../modules/storage';
import { checkAndCreateRecords } from '../modules/recurring';
import * as db from '../modules/db';

export default function HomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const sheetRef = useRef<BottomSheet>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [pending, setPending] = useState<ParsedNotification | null>(null);
  const [categoryTotals, setCategoryTotals] = useState<{ categoryId: string; total: number }[]>([]);
  const [dailyTotals, setDailyTotals] = useState<{ day: string; total: number }[]>([]);
  const [incomeCategoryTotals, setIncomeCategoryTotals] = useState<{ categoryId: string; total: number }[]>([]);
  const [incomeDailyTotals, setIncomeDailyTotals] = useState<{ day: string; total: number }[]>([]);
  const [totalBudget, setTotalBudget] = useState(0);
  const [budgetWarnings, setBudgetWarnings] = useState<{ label: string; percent: number; over: boolean; categoryId?: string }[]>([]);
  const [displayCount, setDisplayCount] = useState(20);
  const [easterEggVisible, setEasterEggVisible] = useState(false);
  const { width: screenWidth } = useWindowDimensions();
  const styles = useThemedStyles(createStyles);
  const colors = useColors();

  const { records, todayExpense, todayIncome, monthExpense, monthIncome, lastMonthExpense, loading, refreshDashboard } = useRecordStore();

  useEffect(() => {
    useAppStore.getState().loadSettings();
    useThemeStore.getState().loadTheme();
    db.initCategories(DEFAULT_CATEGORIES)
      .then(() => checkAndCreateRecords())
      .then((created) => {
        if (created > 0) console.log(`[PayRecord] 周期记账补记 ${created} 笔`);
        refreshDashboard();
        loadCharts();
      })
      .catch((e) => console.error('[PayRecord] DB init failed:', e));
  }, []);

  // 从预算页等返回时自动刷新（3秒防抖，避免频繁切换页面时重复查询）
  const lastFocusTimeRef = useRef(0);
  useFocusEffect(useCallback(() => {
    const now = Date.now();
    if (now - lastFocusTimeRef.current < 3000) return;
    lastFocusTimeRef.current = now;
    loadCharts();
    refreshDashboard();
    setDisplayCount(20);
  }, []));

  useEffect(() => {
    setNotificationCallback((parsed) => {
      setPending(parsed);
      sheetRef.current?.snapToIndex(0);
    });

    // Start native notification listener on Android
    startNotificationListener().then((ok) => {
      if (!ok) {
        console.log('[PayRecord] Notification listener not active. Grant permission in Settings.');
      }
    });

    // Sync quick-add overlay queue on app open
    setupQuickAddSync();
    setQuickAddQueueConsumer((items) => {
      console.log('[PayRecord] Consuming queue items:', items.length);
      // 批量插入后只刷新一次，避免每条记录都触发全量 dashboard 查询
      (async () => {
        for (const it of items as any[]) {
          try {
            await db.insertRecord({
              id: `${it.timestamp}-${Math.random().toString(36).slice(2, 8)}`,
              amount: it.amount,
              type: it.type === 'income' ? 'income' : 'expense',
              categoryId: it.categoryId || 'expense_other',
              note: it.note ? `${it.note}（来自速记）` : '来自速记',
              channel: it.source,
              rawNotification: it.source,
              createdAt: it.timestamp,
              confirmedAt: it.status === 'confirmed' ? Date.now() : undefined,
              status: it.status || 'confirmed',
              expiredAt: it.expiredAt || undefined,
              platform: it.platform || undefined,
            });
          } catch (e) {
            console.warn('[PayRecord] Queue item insert failed:', e);
          }
        }
        await useRecordStore.getState().refreshDashboard();
        await loadCharts();
      })();
    });
  }, []);

  const loadCharts = async () => {
    const now = Date.now();
    const [cats, days, budgetList, incomeCats, incomeDays] = await Promise.all([
      db.getCategoryTotals(startOfMonth(now), endOfMonth(now), 'expense'),
      db.getDailyTotals(subDays(now, 6), now, 'expense'),
      db.getBudgets(),
      db.getCategoryTotals(startOfMonth(now), endOfMonth(now), 'income'),
      db.getDailyTotals(subDays(now, 6), now, 'income'),
    ]);
    setCategoryTotals(cats);
    // 补全7天数据，没有记录的天固定为0
    const fillDays = (raw: { day: string; total: number }[], start: number) => {
      const map = new Map(raw.map(d => [d.day, d.total]));
      const result: { day: string; total: number }[] = [];
      for (let i = 6; i >= 0; i--) {
        const d = new Date(start - i * 86400000);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        result.push({ day: key, total: map.get(key) ?? 0 });
      }
      return result;
    };
    setDailyTotals(fillDays(days, now));
    setIncomeCategoryTotals(incomeCats);
    setIncomeDailyTotals(fillDays(incomeDays, now));
    setTotalBudget(budgetList.find((b) => !b.categoryId)?.amount ?? 0);

    // 预算预警：总预算或分类预算达到 80% 即预警，超过 100% 标记超支
    const monthSpent = useRecordStore.getState().monthExpense;
    const warnings: { label: string; percent: number; over: boolean; categoryId?: string }[] = [];
    for (const b of budgetList) {
      if (!b.amount || b.amount <= 0) continue;
      const spent = b.categoryId
        ? (cats.find((c) => c.categoryId === b.categoryId)?.total ?? 0)
        : monthSpent;
      const percent = (spent / b.amount) * 100;
      if (percent >= 80) {
        const label = b.categoryId ? getCategoryById(b.categoryId).name : '总预算';
        warnings.push({ label, percent, over: percent >= 100, categoryId: b.categoryId });

        // 发送通知栏预警（每个分类每3天最多提醒一次）
        const today = new Date();
        const daySlot = Math.floor(today.getTime() / (3 * 86400000));
        const alertKey = `budget_alert_${b.categoryId ?? 'total'}_${daySlot}`;
        try {
          const budgetStorage = getBudgetAlertStorage();
          if (!budgetStorage.getBoolean(alertKey)) {
            if (percent >= 100) {
              sendBudgetAlert('⚠️ 预算超支警告', `「${label}」已超支 ${percent.toFixed(0)}%，请注意控制支出`);
            } else {
              sendBudgetAlert('💰 预算预警', `「${label}」已使用 ${percent.toFixed(0)}%，接近预算上限`);
            }
            budgetStorage.set(alertKey, true);
          }
        } catch (e) {
          console.warn('[PayRecord] Budget alert failed:', e);
        }
      }
    }
    setBudgetWarnings(warnings);
  };

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refreshDashboard();
    await loadCharts();
    setRefreshing(false);
  }, []);

  const handleConfirm = async (record: PayRecord) => {
    await useRecordStore.getState().addRecord(record);
    sheetRef.current?.close();
    setPending(null);
    await loadCharts();
  };

  const handleIgnore = () => {
    sheetRef.current?.close();
    setPending(null);
  };

  const handleLater = () => {
    sheetRef.current?.close();
    setPending(null);
  };

  const monthDiff = lastMonthExpense > 0 ? ((monthExpense - lastMonthExpense) / lastMonthExpense) * 100 : 0;
  const budgetPercent = totalBudget > 0 ? (monthExpense / totalBudget) * 100 : 0;
  const budgetOver = budgetPercent > 100;

  return (
    <View style={styles.safe}>
      <View style={[styles.header, { paddingTop: Math.max(insets.top, 12) }]}>
        <Text style={styles.headerTitle}>🌸 记花</Text>
        <View style={styles.headerActions}>
          <TouchableOpacity style={styles.headerBtn} onPress={() => router.push('/report')}>
            <Text style={styles.headerBtnText}>报告</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.headerBtn} onPress={() => router.push('/budget')}>
            <Text style={styles.headerBtnText}>预算</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.headerBtn} onPress={() => setEasterEggVisible(true)}>
            <Text style={styles.headerBtnText}>彩蛋</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.headerBtn} onPress={() => router.push('/search')}>
            <Text style={styles.headerBtnText}>搜索</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.headerBtn} onPress={() => router.push('/settings')}>
            <Text style={styles.headerBtnText}>设置</Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        style={styles.container}
        contentContainerStyle={{ paddingBottom: 24 + insets.bottom }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <ScrollView
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          style={styles.summaryPager}
        >
          <View style={[styles.summaryCards, { width: screenWidth - 32 }]}>
            <TouchableOpacity style={[styles.card, styles.todayCard]} activeOpacity={0.8} onPress={() => router.push('/day')}>
              <Text style={styles.cardLabel}>💸 今日支出 ›</Text>
              <Text style={styles.cardValue}>{formatMoney(todayExpense)}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.card} activeOpacity={0.8} onPress={() => router.push('/months')}>
              <Text style={styles.cardLabel}>📅 本月支出 ›</Text>
              <Text style={styles.cardValue}>{formatMoney(monthExpense)}</Text>
              <Text style={[styles.cardDiff, monthDiff > 0 ? styles.up : styles.down]}>
                {monthDiff >= 0 ? '↑' : '↓'} {Math.abs(monthDiff).toFixed(1)}%
              </Text>
            </TouchableOpacity>
          </View>
          <View style={[styles.summaryCards, { width: screenWidth - 32 }]}>
            <TouchableOpacity style={[styles.card, styles.incomeCard]} activeOpacity={0.8} onPress={() => router.push('/day?type=income')}>
              <Text style={styles.cardLabel}>💰 今日收入 ›</Text>
              <Text style={[styles.cardValue, styles.incomeValue]}>{formatMoney(todayIncome)}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.card} activeOpacity={0.8} onPress={() => router.push('/months?type=income')}>
              <Text style={styles.cardLabel}>📈 本月收入 ›</Text>
              <Text style={[styles.cardValue, styles.incomeValue]}>{formatMoney(monthIncome)}</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>

        <View style={styles.section}>
          <View style={styles.sectionTitleRow}>
            <Text style={styles.sectionTitle}>月度预算</Text>
            <TouchableOpacity onPress={() => router.push('/budget')}>
              <Text style={styles.sectionMore}>管理 ›</Text>
            </TouchableOpacity>
          </View>
          <TouchableOpacity style={styles.chartCard} activeOpacity={0.8} onPress={() => router.push('/budget')}>
            {totalBudget > 0 ? (
              <View style={{ alignSelf: 'stretch' }}>
                <View style={styles.budgetRow}>
                  <Text style={styles.budgetSpent}>{formatMoney(monthExpense)}</Text>
                  <Text style={styles.budgetLimit}>/ {formatMoney(totalBudget)}</Text>
                  <Text style={[styles.budgetPercent, budgetOver && { color: colors.danger }]}>
                    {budgetOver ? '已超支 ' : '已用 '}{budgetPercent.toFixed(0)}%
                  </Text>
                </View>
                <View style={styles.progressBg}>
                  <View
                    style={[
                      styles.progressFill,
                      { width: `${Math.min(budgetPercent, 100)}%`, backgroundColor: budgetOver ? colors.danger : colors.primary },
                    ]}
                  />
                </View>
              </View>
            ) : (
              <Text style={styles.budgetHint}>尚未设置月度预算，点击去设置</Text>
            )}
          </TouchableOpacity>
          {budgetWarnings.map((w) => (
            <TouchableOpacity
              key={w.label}
              style={[styles.warnRow, w.over ? styles.warnRowOver : styles.warnRowNear]}
              onPress={() => router.push({ pathname: '/budget', params: { categoryId: w.categoryId ?? '' } })}
              activeOpacity={0.7}
            >
              <Text style={[styles.warnText, w.over ? styles.warnTextOver : styles.warnTextNear]}>
                {w.over ? '🚨' : '⚠️'} {w.label}
                {w.over ? `已超支 ${(w.percent - 100).toFixed(0)}%` : `已达预算 ${w.percent.toFixed(0)}%`} ›
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <ScrollView
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          style={styles.chartPager}
        >
          <View style={[styles.chartPage, { width: screenWidth - 32 }]}>
            <Text style={styles.sectionTitle}>分类占比</Text>
            <Text style={styles.chartPageLabelText}>支出</Text>
            <View style={styles.chartCard}>
              <DonutChart data={categoryTotals} label="本月支出" />
              <View style={styles.legendFixed}>
                <View style={styles.legendWrap}>
                  {categoryTotals.map((item) => {
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
            </View>
            <Text style={[styles.sectionTitle, { marginTop: 16 }]}>近7天支出趋势</Text>
            <View style={styles.chartCard}>
              <TrendChart data={dailyTotals} />
            </View>
          </View>
          <View style={[styles.chartPage, { width: screenWidth - 32 }]}>
            <Text style={styles.sectionTitle}>分类占比</Text>
            <Text style={[styles.chartPageLabelText, { color: colors.success }]}>收入</Text>
            <View style={styles.chartCard}>
              <DonutChart data={incomeCategoryTotals} label="本月收入" />
              <View style={styles.legendFixed}>
                <View style={styles.legendWrap}>
                  {incomeCategoryTotals.map((item) => {
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
            </View>
            <Text style={[styles.sectionTitle, { marginTop: 16 }]}>近7天收入趋势</Text>
            <View style={styles.chartCard}>
              <TrendChart data={incomeDailyTotals} />
            </View>
          </View>
        </ScrollView>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>最近流水</Text>
          {records.length === 0 && !loading && (
            <Text style={styles.emptyText}>暂无记录，点击右下角 + 记一笔，或等支付通知自动记账</Text>
          )}
          <View style={styles.listCard}>
            {records.slice(0, displayCount).map((record) => (
              <RecordItem key={record.id} record={record} onPress={(r) => router.push(`/record/${r.id}`)} onDeleted={loadCharts} />
            ))}
            {displayCount < records.length && (
              <TouchableOpacity style={styles.loadMoreBtn} onPress={() => setDisplayCount(prev => prev + 20)}>
                <Text style={styles.loadMoreText}>加载更多</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </ScrollView>

      <DraggableFab bottomInset={insets.bottom} onPress={() => router.push('/add')} />

      <EasterEggModal visible={easterEggVisible} onClose={() => setEasterEggVisible(false)} />

      <ConfirmSheet
        ref={sheetRef}
        payload={pending}
        onConfirm={handleConfirm}
        onIgnore={handleIgnore}
        onLater={handleLater}
      />
    </View>
  );
}

const createStyles = (c: AppColors) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: c.background },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12, backgroundColor: c.surface,
  },
  headerTitle: { fontSize: 22, fontWeight: '700', color: c.text },
  headerActions: { flexDirection: 'row', gap: 6 },
  headerBtn: {
    paddingHorizontal: 12, paddingVertical: 7,
    backgroundColor: c.primary + '12', borderRadius: 20,
  },
  headerBtnText: { fontSize: 12, color: c.primary, fontWeight: '600' },
  container: { flex: 1, paddingHorizontal: 16 },
  summaryPager: { marginTop: 16, marginBottom: 16 },
  summaryCards: { flexDirection: 'row', gap: 12 },
  incomeCard: { borderTopWidth: 3, borderTopColor: c.success },
  incomeValue: { color: c.success },
  card: {
    flex: 1, backgroundColor: c.surface, borderRadius: 20, padding: 18,
    shadowColor: c.primary, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08, shadowRadius: 12, elevation: 4,
  },
  todayCard: { borderTopWidth: 3, borderTopColor: c.primary },
  cardLabel: { fontSize: 13, color: c.textSecondary, marginBottom: 6 },
  cardValue: { fontSize: 26, fontWeight: '700', color: c.text, letterSpacing: -0.5 },
  cardDiff: { fontSize: 12, marginTop: 4, fontWeight: '500' },
  up: { color: c.danger },
  down: { color: c.success },
  section: { marginBottom: 20 },
  sectionTitleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionMore: { fontSize: 13, color: c.primary, marginBottom: 10 },
  budgetRow: { flexDirection: 'row', alignItems: 'baseline', gap: 6, marginBottom: 10 },
  budgetSpent: { fontSize: 22, fontWeight: '700', color: c.text },
  budgetLimit: { fontSize: 14, color: c.textSecondary },
  budgetPercent: { marginLeft: 'auto', fontSize: 13, fontWeight: '600', color: c.primary },
  budgetHint: { color: c.textSecondary, fontSize: 14, paddingVertical: 8 },
  progressBg: { height: 10, borderRadius: 5, backgroundColor: c.border, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 5 },
  warnRow: { alignSelf: 'stretch', marginTop: 8, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, borderWidth: 1 },
  warnRowNear: { backgroundColor: '#FFF8EC', borderColor: '#FFD666' },
  warnRowOver: { backgroundColor: '#FFF1F0', borderColor: '#FFA39E' },
  warnText: { fontSize: 13, fontWeight: '600' },
  warnTextNear: { color: '#D48806' },
  warnTextOver: { color: c.danger },
  sectionTitle: { fontSize: 17, fontWeight: '700', color: c.text, marginBottom: 10, letterSpacing: -0.3 },
  chartCard: {
    backgroundColor: c.surface, borderRadius: 20, padding: 18, alignItems: 'center',
    shadowColor: c.primary, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06, shadowRadius: 12, elevation: 3,
  },
  legend: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', marginTop: 16, gap: 8 },
  legendItem: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  legendDot: { width: 10, height: 10, borderRadius: 5, marginRight: 5 },
  legendText: { fontSize: 12, color: c.textSecondary, fontWeight: '500' },
  listCard: {
    backgroundColor: c.surface, borderRadius: 20, paddingHorizontal: 16,
    shadowColor: c.primary, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06, shadowRadius: 12, elevation: 3,
  },
  emptyText: { textAlign: 'center', color: c.textSecondary, marginVertical: 20 },
  loadMoreBtn: {
    paddingVertical: 14, alignItems: 'center',
    backgroundColor: c.primary + '0A', marginHorizontal: 16, marginTop: 8, marginBottom: 8, borderRadius: 12,
  },
  loadMoreText: { color: c.primary, fontSize: 14, fontWeight: '600' },
  chartPager: { marginBottom: 20 },
  chartPage: { alignSelf: 'stretch' },
  chartPageLabelText: { fontSize: 12, fontWeight: '500', color: c.primary, textAlign: 'center', marginBottom: 6 },
  legendFixed: { height: 80, overflow: 'hidden' },
  legendWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, justifyContent: 'center' },
});
