import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Switch, Alert, AppState } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors, useThemedStyles } from '../constants/colors';
import { useAppStore, DEFAULT_WHITELIST } from '../stores/useAppStore';
import { useThemeStore } from '../stores/useThemeStore';
import type { ThemeMode } from '../stores/useThemeStore';
import { openNotificationSettings, isNotificationServiceEnabled, canDrawOverlay, openOverlaySettings, isBatteryOptIgnored, openBatteryOptSettings, isAccessibilityEnabled, openAccessibilitySettings, openAutoStartSettings, isAutoStartEnabled, scheduleDailyReminder, cancelDailyReminder, isDailyReminderEnabled, openReminderPermissionSettings, openAlarmPermissionSettings, isKeepAliveEnabled, setKeepAliveEnabled, isKeepAliveRecommended, scheduleDailySummary, cancelDailySummary, isDailySummaryEnabled, getWatchdogStatus } from '../modules/notification';
import type { WatchdogStatus } from '../modules/notification';
import Constants from 'expo-constants';
import * as db from '../modules/db';
import { shareCSV, shareJSON, importJSON } from '../utils/export';

const APP_OPTIONS = [
  { id: 'com.eg.android.AlipayGphone', name: '支付宝' },
  { id: 'com.tencent.mm', name: '微信' },
  { id: 'com.unionpay', name: '云闪付' },
  { id: 'com.sankuai.meituan', name: '美团' },
  { id: 'me.ele', name: '饿了么' },
  { id: 'com.taobao.taobao', name: '淘宝' },
];

export default function SettingsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const styles = useThemedStyles((c) => StyleSheet.create({
    container: { flex: 1, backgroundColor: c.background },
    header: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      paddingHorizontal: 16, paddingTop: 16, paddingBottom: 12,
      backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border,
    },
    back: { color: c.primary, fontSize: 15, width: 60 },
    title: { fontSize: 18, fontWeight: '600', color: c.text },
    content: { padding: 16 },
    card: {
      backgroundColor: c.surface, borderRadius: 16,
      paddingHorizontal: 16, paddingVertical: 12, marginBottom: 16,
    },
    sectionTitle: { fontSize: 14, fontWeight: '600', color: c.text, marginBottom: 8 },
    themeRow: { flexDirection: 'row', gap: 10 },
    themeBtn: {
      flex: 1, paddingVertical: 12, borderRadius: 12, alignItems: 'center',
      backgroundColor: c.background, borderWidth: 1, borderColor: c.border,
    },
    themeBtnActive: { backgroundColor: c.primary, borderColor: c.primary },
    themeBtnText: { fontSize: 13, color: c.text, fontWeight: '500' },
    themeBtnTextActive: { color: '#fff' },
    row: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: c.border,
    },
    rowTitle: { fontSize: 15, color: c.text },
    hintInline: { fontSize: 12, color: c.textSecondary, marginTop: 2 },
    hideNotifyBtn: {
      marginTop: 8, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8,
      backgroundColor: c.primary + '12', alignSelf: 'flex-start',
    },
    hideNotifyBtnText: { fontSize: 12, color: c.primary, fontWeight: '500' },
    permBtn: {
      paddingHorizontal: 14, paddingVertical: 8,
      backgroundColor: c.primary, borderRadius: 8,
    },
    permBtnText: { color: '#fff', fontSize: 13, fontWeight: '600' },
    checkBox: {
      width: 22, height: 22, borderRadius: 6, borderWidth: 2,
      borderColor: c.border, alignItems: 'center', justifyContent: 'center',
    },
    checkBoxActive: { backgroundColor: c.primary, borderColor: c.primary },
    checkMark: { color: '#fff', fontSize: 12, fontWeight: '700' },
    arrow: { fontSize: 22, color: c.textSecondary },
    footer: { textAlign: 'center', color: c.textSecondary, fontSize: 12, marginTop: 8 },
    guideRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
    guideBrand: { fontSize: 12, fontWeight: '700', color: c.primary, minWidth: 90, paddingTop: 1 },
    guidePath: { fontSize: 12, color: c.textSecondary, flex: 1, lineHeight: 18 },
  }));

  const { whitelist, setWhitelist } = useAppStore();
  const themeMode = useThemeStore((s) => s.mode);
  const setThemeMode = useThemeStore((s) => s.setMode);
  const [enabled, setEnabled] = useState(false);
  const [overlayEnabled, setOverlayEnabled] = useState(false);
  const [batteryIgnored, setBatteryIgnored] = useState(false);
  const [a11yEnabled, setA11yEnabled] = useState(false);
  const [autoStartEnabled, setAutoStartEnabled] = useState(false);
  const [reminderEnabled, setReminderEnabled] = useState(false);
  const [summaryEnabled, setSummaryEnabled] = useState(false);
  const [keepAliveEnabled, setKeepAliveState] = useState(false);
  const [keepAliveRecommended, setKeepAliveRecommended] = useState(false);
  const [recordCount, setRecordCount] = useState(0);
  const [checking, setChecking] = useState(false);
  const [wd, setWd] = useState<WatchdogStatus | null>(null);

  useEffect(() => {
    useAppStore.getState().loadSettings();
    useThemeStore.getState().loadTheme();
    loadCount();
    checkPermission();
  }, []);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') checkPermission();
    });
    return () => sub.remove();
  }, []);

  const checkPermission = async () => {
    setChecking(true);
    try {
      setEnabled(await isNotificationServiceEnabled());
      setOverlayEnabled(await canDrawOverlay());
      setBatteryIgnored(await isBatteryOptIgnored());
      setA11yEnabled(await isAccessibilityEnabled());
      setAutoStartEnabled(await isAutoStartEnabled());
      setReminderEnabled(await isDailyReminderEnabled());
      setSummaryEnabled(await isDailySummaryEnabled());
      setKeepAliveState(await isKeepAliveEnabled());
      setKeepAliveRecommended(await isKeepAliveRecommended());
      setWd(await getWatchdogStatus());
    } catch {}
    setChecking(false);
  };

  const loadCount = async () => {
    setRecordCount(await db.getRecordCount());
  };

  const toggleApp = (appId: string) => {
    const next = whitelist.includes(appId) ? whitelist.filter((id) => id !== appId) : [...whitelist, appId];
    setWhitelist(next);
  };

  const handleExportCSV = async () => {
    try {
      const records = await db.getRecords({ limit: 10000 });
      if (!records.length) { Alert.alert('提示', '暂无记录可导出'); return; }
      await shareCSV(records);
    } catch (e: any) { Alert.alert('导出失败', e.message); }
  };

  const handleExportJSON = async () => {
    try {
      const records = await db.getRecords({ limit: 10000 });
      if (!records.length) { Alert.alert('提示', '暂无记录可导出'); return; }
      await shareJSON(records);
    } catch (e: any) { Alert.alert('导出失败', e.message); }
  };

  const handleClearData = () => {
    Alert.alert('确认清空', '此操作将删除所有记账数据，不可恢复！', [
      { text: '取消', style: 'cancel' },
      { text: '清空', style: 'destructive', onPress: async () => {
        const ddb = await db.getDb();
        await ddb.runAsync('DELETE FROM records');
        await ddb.runAsync('DELETE FROM budgets');
        await ddb.runAsync('DELETE FROM recurrings');
        Alert.alert('已清空', '所有数据已删除');
        loadCount();
      }},
    ]);
  };

  const handleImportJSON = async () => {
    try {
      const count = await importJSON();
      Alert.alert('导入成功', `已恢复 ${count} 条记录`);
      loadCount();
    } catch (e: any) { Alert.alert('导入失败', e.message || '请选择有效的 JSON 备份文件'); }
  };

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: Math.max(insets.top, 16) }]}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.back}>← 返回</Text>
        </TouchableOpacity>
        <Text style={styles.title}>设置</Text>
        <View style={{ width: 60 }} />
      </View>

      <ScrollView style={styles.content} contentContainerStyle={{ paddingBottom: 24 + insets.bottom }}>
        {/* 外观 */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>外观</Text>
          <View style={styles.themeRow}>
            {([
              { key: 'light' as ThemeMode, label: '☀️ 白天' },
              { key: 'dark' as ThemeMode, label: '🌙 黑夜' },
              { key: 'system' as ThemeMode, label: '🔄 跟随系统' },
            ]).map((opt) => (
              <TouchableOpacity
                key={opt.key}
                style={[styles.themeBtn, themeMode === opt.key && styles.themeBtnActive]}
                onPress={() => setThemeMode(opt.key)}
              >
                <Text style={[styles.themeBtnText, themeMode === opt.key && styles.themeBtnTextActive]}>
                  {opt.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* 权限 */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>权限与后台（自动记账需要以下权限）</Text>
          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowTitle}>📋 通知读取权限</Text>
              <Text style={styles.hintInline}>{enabled ? '✅ 已开启' : '❌ 未开启'}</Text>
              <Text style={styles.hintInline}>用于：自动捕捉支付宝、微信、云闪付等 App 的消费通知，实现自动记账</Text>
            </View>
            <TouchableOpacity style={styles.permBtn} onPress={openNotificationSettings}>
              <Text style={styles.permBtnText}>去设置</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowTitle}>🔘 悬浮窗权限</Text>
              <Text style={styles.hintInline}>{overlayEnabled ? '✅ 已开启' : '❌ 未开启'}</Text>
              <Text style={styles.hintInline}>用于：消费通知到来时，在任意界面直接弹出速记悬浮窗，无需切 App 即可确认记账</Text>
            </View>
            <TouchableOpacity style={styles.permBtn} onPress={openOverlaySettings}>
              <Text style={styles.permBtnText}>去设置</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowTitle}>🔋 后台运行权限</Text>
              <Text style={styles.hintInline}>{batteryIgnored ? '✅ 已开启' : '❌ 未开启'}</Text>
              <Text style={styles.hintInline}>用于：防止系统杀掉后台通知监听服务，确保锁屏后仍能实时捕捉消费通知</Text>
            </View>
            <TouchableOpacity style={styles.permBtn} onPress={openBatteryOptSettings}>
              <Text style={styles.permBtnText}>去设置</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowTitle}>♿ 无障碍服务（微信补记）</Text>
              <Text style={styles.hintInline}>{a11yEnabled ? '✅ 已开启' : '❌ 未开启'}</Text>
              <Text style={styles.hintInline}>用于：微信红包/转账金额在通知里不显示，统一由无障碍识别红包/转账页面，返回聊天时补记</Text>
            </View>
            <TouchableOpacity style={styles.permBtn} onPress={openAccessibilitySettings}>
              <Text style={styles.permBtnText}>去设置</Text>
            </TouchableOpacity>
          </View>
          <View style={[styles.row, { borderBottomWidth: 0 }]}>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowTitle}>🚀 自启动权限</Text>
              <Text style={styles.hintInline}>{autoStartEnabled ? '✅ 已开启' : '❌ 未开启'}</Text>
              <Text style={styles.hintInline}>用于：手机重启后自动启动记花，确保开机后无需手动打开也能继续自动记账</Text>
            </View>
            <TouchableOpacity style={styles.permBtn} onPress={openAutoStartSettings}>
              <Text style={styles.permBtnText}>去设置</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* 自启动导航指南 */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>📱 自启动权限设置导航</Text>
          <Text style={{ fontSize: 12, color: colors.textSecondary, marginBottom: 8 }}>
            点击上方"去设置"会自动跳转对应页面，若跳转失败可按以下路径手动查找：
          </Text>
          <View style={{ gap: 8 }}>
            <View style={styles.guideRow}>
              <Text style={styles.guideBrand}>小米/MIUI</Text>
              <Text style={styles.guidePath}>设置 → 省电与电池 → 右上角⚙️ → 应用智能省电 → 找到"记花" → 无限制</Text>
            </View>
            <View style={styles.guideRow}>
              <Text style={styles.guideBrand}>华为/鸿蒙 HarmonyOS</Text>
              <Text style={styles.guidePath}>设置 → 电池 → 应用启动管理 → 找到"记花" → 关闭自动管理 → 勾选「允许自启动 + 允许关联启动 + 允许后台活动」</Text>
            </View>
            <View style={styles.guideRow}>
              <Text style={styles.guideBrand}>OPPO/ColorOS</Text>
              <Text style={styles.guidePath}>设置 → 电池 → 应用耗电管理 → 找到"记花" → 允许完全后台行为 + 允许自启动</Text>
            </View>
            <View style={styles.guideRow}>
              <Text style={styles.guideBrand}>vivo/OriginOS</Text>
              <Text style={styles.guidePath}>设置 → 电池 → 后台耗电管理 → 找到"记花" → 允许后台高耗电</Text>
            </View>
          </View>
        </View>

        {/* 每日提醒 */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>功能设置</Text>
          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowTitle}>📝 每日记账提醒</Text>
              <Text style={styles.hintInline}>每天 21:00 通过通知栏提醒你记账，坚持养成好习惯</Text>
              <Text style={styles.hintInline}>⚠️ 需要「通知权限」和「闹钟与提醒」权限</Text>
            </View>
            <Switch
              value={reminderEnabled}
              onValueChange={async (v) => {
                if (v) {
                  const ok = await scheduleDailyReminder(21, 0);
                  setReminderEnabled(ok);
                } else {
                  await cancelDailyReminder();
                  setReminderEnabled(false);
                }
              }}
              trackColor={{ false: colors.border, true: colors.primary }}
              thumbColor="#fff"
            />
          </View>
          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowTitle}>📊 晚间支出汇总</Text>
              <Text style={styles.hintInline}>每晚 23:00 推送今日支出总额，预算达到 80% 或超支时一并提醒</Text>
            </View>
            <Switch
              value={summaryEnabled}
              onValueChange={async (v) => {
                if (v) {
                  const ok = await scheduleDailySummary(23, 0);
                  setSummaryEnabled(ok);
                } else {
                  await cancelDailySummary();
                  setSummaryEnabled(false);
                }
              }}
              trackColor={{ false: colors.border, true: colors.primary }}
              thumbColor="#fff"
            />
          </View>
          <View style={[styles.row, { borderBottomWidth: 0 }]}>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowTitle}>🛡️ 后台保活{keepAliveRecommended ? '（本机建议开启）' : ''}</Text>
              <Text style={styles.hintInline}>华为/荣耀/OPPO/vivo/小米等国产机型会激进冻结无障碍和通知监听服务，开启后通过前台服务防止被冻结</Text>
              <Text style={styles.hintInline}>通知栏会有一条「记花正在运行」静默提示，这是 Android 系统对前台服务的强制要求，App 无法自行隐藏</Text>
              <TouchableOpacity style={styles.hideNotifyBtn} onPress={openReminderPermissionSettings}>
                <Text style={styles.hideNotifyBtnText}>🚫 隐藏「记花正在运行」通知（一键跳转，关掉「后台运行」渠道即可，不影响记账）</Text>
              </TouchableOpacity>
            </View>
            <Switch
              value={keepAliveEnabled}
              onValueChange={async (v) => {
                await setKeepAliveEnabled(v);
                setKeepAliveState(v);
              }}
              trackColor={{ false: colors.border, true: colors.primary }}
              thumbColor="#fff"
            />
          </View>
        </View>

        {/* 提醒权限导航 */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>🔔 提醒所需权限（记账提醒需要以下权限）</Text>
          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowTitle}>🔔 通知权限</Text>
              <Text style={styles.hintInline}>用于：在通知栏显示每日记账提醒</Text>
            </View>
            <TouchableOpacity style={styles.permBtn} onPress={openReminderPermissionSettings}>
              <Text style={styles.permBtnText}>去设置</Text>
            </TouchableOpacity>
          </View>
          <View style={[styles.row, { borderBottomWidth: 0 }]}>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowTitle}>⏰ 闹钟与提醒权限</Text>
              <Text style={styles.hintInline}>用于：在指定时间准时触发提醒（Android 12+）</Text>
            </View>
            <TouchableOpacity style={styles.permBtn} onPress={openAlarmPermissionSettings}>
              <Text style={styles.permBtnText}>去设置</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* 自愈诊断 */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>🩺 自愈诊断</Text>
          {wd ? (
            <>
              <View style={styles.row}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowTitle}>📋 通知监听</Text>
                  <Text style={styles.hintInline}>授权 {wd.listenerGranted ? '✅' : '❌'} · 运行 {wd.listenerRunning ? '✅' : '❌'}</Text>
                </View>
                <TouchableOpacity style={styles.permBtn} onPress={() => { checkPermission(); }}>
                  <Text style={styles.permBtnText}>刷新</Text>
                </TouchableOpacity>
              </View>
              <View style={styles.row}>
                <Text style={styles.rowTitle}>♿ 无障碍服务</Text>
                <Text style={styles.hintInline}>授权 {wd.a11yGranted ? '✅' : '❌'} · 运行 {wd.a11yRunning ? '✅' : '❌'}</Text>
              </View>
              <View style={styles.row}>
                <Text style={styles.rowTitle}>🛡️ 保活前台服务</Text>
                <Text style={styles.hintInline}>{wd.keepAliveRunning ? '✅ 运行中' : '❌ 未运行'}</Text>
              </View>
              <View style={styles.row}>
                <Text style={styles.rowTitle}>⏰ 看门狗闹钟</Text>
                <Text style={styles.hintInline}>{wd.watchdogAlarmPending ? '✅ 已武装' : '❌ 未武装'}</Text>
              </View>
              <View style={styles.row}>
                <Text style={styles.rowTitle}>🎯 精确闹钟权限</Text>
                <Text style={styles.hintInline}>{wd.canExactAlarm ? '✅ 已授权' : '⚠️ 未授权（降级为普通闹钟）'}</Text>
              </View>
              <View style={[styles.row, { borderBottomWidth: 0 }]}>
                <Text style={styles.rowTitle}>🕐 最近自检</Text>
                <Text style={styles.hintInline}>
                  {wd.lastTick > 0 ? `${Math.floor((Date.now() - wd.lastTick) / 60000)} 分钟前` : '从未触发'}
                </Text>
              </View>
              <Text style={styles.hintInline}>
                划掉 App 后若「最近自检」一直停在原地不更新，说明系统阻止了闹钟（需开启🚀自启动权限）；若自检在跑但监听仍不恢复，请把本页截图反馈。
              </Text>
            </>
          ) : (
            <Text style={styles.hintInline}>{checking ? '检测中...' : '暂不可用'}</Text>
          )}
        </View>

        {/* 白名单 */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>监听应用白名单</Text>
          {APP_OPTIONS.map((app) => (
            <TouchableOpacity key={app.id} style={styles.row} onPress={() => toggleApp(app.id)}>
              <Text style={styles.rowTitle}>{app.name}</Text>
              <View style={[styles.checkBox, whitelist.includes(app.id) && styles.checkBoxActive]}>
                {whitelist.includes(app.id) && <Text style={styles.checkMark}>✓</Text>}
              </View>
            </TouchableOpacity>
          ))}
        </View>

        {/* 周期记账 */}
        <View style={styles.card}>
          <TouchableOpacity style={styles.row} onPress={() => router.push('/recurring')}>
            <Text style={styles.rowTitle}>🔄 周期记账管理</Text>
            <Text style={styles.arrow}>›</Text>
          </TouchableOpacity>
        </View>

        {/* 数据 */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>数据管理（共 {recordCount} 条记录）</Text>
          <TouchableOpacity style={styles.row} onPress={handleExportCSV}>
            <Text style={styles.rowTitle}>导出 CSV</Text>
            <Text style={styles.arrow}>›</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.row} onPress={handleExportJSON}>
            <Text style={styles.rowTitle}>导出 JSON</Text>
            <Text style={styles.arrow}>›</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.row} onPress={handleImportJSON}>
            <Text style={styles.rowTitle}>从 JSON 恢复</Text>
            <Text style={styles.arrow}>›</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.row} onPress={handleClearData}>
            <Text style={[styles.rowTitle, { color: colors.danger }]}>清空所有数据</Text>
            <Text style={styles.arrow}>›</Text>
          </TouchableOpacity>
        </View>

        {/* 反馈 */}
        <View style={styles.card}>
          <TouchableOpacity style={[styles.row, { borderBottomWidth: 0 }]} onPress={() => router.push('/feedback')}>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowTitle}>💬 意见反馈</Text>
              <Text style={styles.hintInline}>功能建议、Bug 反馈、任何想说的话</Text>
            </View>
            <Text style={styles.arrow}>›</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.footer}>数据仅存储在本地，保护隐私。· v{Constants.expoConfig?.version ?? '1.3.1'}</Text>
      </ScrollView>
    </View>
  );
}
