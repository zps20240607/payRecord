import { Linking, NativeModules, Platform, AppState } from 'react-native';
import { EventEmitter, requireNativeModule } from 'expo-modules-core';
import type { ParsedNotification } from '../record/types';
import { parseNotification } from '../parser';

export interface NotificationPayload {
  packageName: string;
  title: string;
  text: string;
  timestamp: number;
}

type NotificationListenerCallback = (payload: ParsedNotification) => void;

let listener: NotificationListenerCallback | null = null;
let started = false;

// Expo 原生模块
let NativeModule: any = null;
try {
  NativeModule = requireNativeModule('PayRecordNotification');
} catch {
  NativeModule = (NativeModules as any).PayRecordNotification ?? null;
}

let eventSubscription: { remove: () => void } | null = null;

// --- Dedup ---
const recentNotifications = new Map<string, number>();
const DEDUP_WINDOW_MS = 5000;
const DEDUP_MAX_SIZE = 50;

function getDedupKey(payload: NotificationPayload): string {
  // 同一条通知的重复投递/内容更新共享 postTime（timestamp），
  // 而连续两笔同文案消费 postTime 不同——把 timestamp 放进 key，避免误杀真实连续消费
  return `${payload.packageName}:${payload.timestamp}:${payload.text}`;
}

function isDuplicate(payload: NotificationPayload): boolean {
  const key = getDedupKey(payload);
  const lastTime = recentNotifications.get(key);
  if (lastTime != null && Math.abs(payload.timestamp - lastTime) < DEDUP_WINDOW_MS) {
    return true;
  }
  if (recentNotifications.size >= DEDUP_MAX_SIZE) {
    const now = Date.now();
    for (const [k, t] of recentNotifications) {
      if (now - t > DEDUP_WINDOW_MS * 2) recentNotifications.delete(k);
    }
  }
  recentNotifications.set(key, payload.timestamp);
  return false;
}


export function setNotificationCallback(callback: NotificationListenerCallback) {
  listener = callback;
}

// 收付款关键词（命中即弹窗），覆盖银行场景
const PAYMENT_KEYWORDS = ['付款', '支付', '收款', '到账', '转账', '红包', '消费', '支出', '转出', '扣款', '汇款', '取款', '存入'];
const IGNORE_KEYWORDS = ['发起', '处理中', '充值成功', '到账提醒', '话费', '流量', '缴费成功', '自动充值', '余额', '已确认收款', '对方已收款', '对方已确认', '已被接收', '已被领取', '优惠券到期', '券即将过期', '卡包', '还款日', '账单日', '待还款', '还款提醒', '信用卡', '额度', '积分'];

export function handleNotification(payload: NotificationPayload) {
  console.log('[PayRecord] JS received:', JSON.stringify(payload));
  if (isDuplicate(payload)) return;

  const content = `${payload.title} ${payload.text}`;
  // 只关心收付款类通知，其余（如 B站推送）直接忽略
  const hitPay = PAYMENT_KEYWORDS.some((k) => content.includes(k));
  const hitIgnore = IGNORE_KEYWORDS.some((k) => content.includes(k));
  if (!hitPay) {
    console.log('[PayRecord] 忽略非支付通知:', content.substring(0, 80));
    return;
  }
  if (hitIgnore) {
    console.log('[PayRecord] 被忽略关键词过滤:', content.substring(0, 80), '| 命中:', IGNORE_KEYWORDS.filter(k => content.includes(k)));
    return;
  }

  const parsed = parseNotification(content, payload.packageName);
  if (parsed) {
    listener?.(parsed);            // 有金额：正常流程，弹窗预填
  } else {
    listener?.({                   // 无金额：构造兜底对象，金额留空让用户填
      amount: null as any,
      type: 'expense',
      merchant: payload.title || '未知来源',
      channel: payload.packageName,
      sourceApp: payload.packageName,
      raw: content,
      matchedRule: '关键词兜底',
      confidence: 0.3,
    } as ParsedNotification);
  }

}

/**
 * Start listening for native notification events.
 */
export async function startNotificationListener(): Promise<boolean> {
  if (Platform.OS !== 'android' || !NativeModule) return false;

  try {
    if (!eventSubscription) {
      const emitter = new EventEmitter(NativeModule);
      eventSubscription = (emitter as any).addListener('onNotification', (event: NotificationPayload) => {
        console.log('[PayRecord] JS subscription created');
        handleNotification(event);
      });
    }

    await NativeModule.startListener();
    // 已授权但服务未绑定（如重启后）时主动请求重新绑定
    try {
      const granted = NativeModule?.isNotificationAccessGranted ? await NativeModule.isNotificationAccessGranted() : false;
      const running = NativeModule?.isListening ? await NativeModule.isListening() : false;
      if (granted && !running) await NativeModule?.requestListenerRebind?.();
    } catch {}
    started = true;
    return true;
  } catch (e) {
    console.warn('[PayRecord] Failed to start notification listener:', e);
    started = false;
    return false;
  }
}

export async function stopNotificationListener(): Promise<void> {
  if (Platform.OS !== 'android' || !NativeModule) return;

  try {
    eventSubscription?.remove();
    eventSubscription = null;
    await NativeModule.stopListener();
    started = false;
  } catch (e) {
    console.warn('[PayRecord] Failed to stop notification listener:', e);
    started = false;
  }
}

export async function isNotificationServiceEnabled(): Promise<boolean> {
  if (Platform.OS !== 'android') return false;

  try {
    // 优先读系统真实授权状态（重启后服务未绑定时 isListening 会误报为关闭）
    if (NativeModule?.isNotificationAccessGranted) {
      const granted = await NativeModule.isNotificationAccessGranted();
      if (granted) {
        // 已授权但服务未绑定（如刚重启）时主动请求重新绑定
        try {
          const running = NativeModule?.isListening ? await NativeModule.isListening() : false;
          if (!running) await NativeModule?.requestListenerRebind?.();
        } catch {}
        started = true;
        return true;
      }
    } else if (NativeModule?.isListening) {
      const result = await NativeModule.isListening();
      started = result;
      return result;
    }
  } catch {}
  return false;
}

export async function isBatteryOptIgnored(): Promise<boolean> {
  if (Platform.OS !== 'android') return true;
  try {
    if (NativeModule?.isBatteryOptIgnored) return await NativeModule.isBatteryOptIgnored();
  } catch {}
  return false;
}

export async function openBatteryOptSettings(): Promise<void> {
  if (Platform.OS !== 'android') return;
  try {
    await NativeModule?.openBatteryOptSettings?.();
  } catch {}
}

export async function isAccessibilityEnabled(): Promise<boolean> {
  if (Platform.OS !== 'android') return false;
  try {
    if (NativeModule?.isAccessibilityEnabled) return await NativeModule.isAccessibilityEnabled();
  } catch {}
  return false;
}

export async function openAccessibilitySettings(): Promise<void> {
  if (Platform.OS !== 'android') return;
  try {
    await NativeModule?.openAccessibilitySettings?.();
    return;
  } catch {}
  try {
    await Linking.sendIntent('android.settings.ACCESSIBILITY_SETTINGS');
  } catch {
    try { await Linking.openSettings(); } catch {}
  }
}

export async function isAutoStartEnabled(): Promise<boolean> {
  if (Platform.OS !== 'android') return true;
  try {
    if (NativeModule?.isAutoStartEnabled) return await NativeModule.isAutoStartEnabled();
  } catch {}
  // 无法自动检测时默认返回 true，避免误报未开启
  return true;
}

export async function openAutoStartSettings(): Promise<void> {
  if (Platform.OS !== 'android') return;
  // 各厂商自启动设置页面的 Intent
  const manufacturer = (Platform.constants?.Manufacturer || '').toLowerCase();
  const intents: string[] = [];

  if (manufacturer.includes('xiaomi') || manufacturer.includes('redmi')) {
    // MIUI: 省电与电池 → 应用智能省电
    intents.push('intent:#Intent;action=miui.intent.action.OP_AUTOSTART;end');
    intents.push('intent:#Intent;action=android.settings.APPLICATION_DETAILS_SETTINGS;S.android.intent.extra.PACKAGE_NAME=com.miui.powerkeeper;end');
  } else if (manufacturer.includes('huawei') || manufacturer.includes('honor')) {
    // EMUI: 应用启动管理
    intents.push('intent:#Intent;action=huawei.intent.action.HSM_BOOTAPP_MANAGER;end');
  } else if (manufacturer.includes('oppo') || manufacturer.includes('realme') || manufacturer.includes('oneplus')) {
    // ColorOS: 应用耗电管理
    intents.push('intent:#Intent;action=android.settings.APPLICATION_DETAILS_SETTINGS;S.android.intent.extra.PACKAGE_NAME=com.coloros.safecenter;end');
  } else if (manufacturer.includes('vivo') || manufacturer.includes('iqoo')) {
    // OriginOS: 后台耗电管理
    intents.push('intent:#Intent;action=com.vivo.abe.uni.action.EXTERNAL_ACCESS;end');
  }

  // 通用 fallback：应用详情页
  intents.push('intent:#Intent;action=android.settings.APPLICATION_DETAILS_SETTINGS;S.android.intent.extra.PACKAGE_NAME=' + (NativeModule?.getPackageName ? await NativeModule.getPackageName() : 'com.payrecord.app') + ';end');

  for (const intent of intents) {
    try {
      await Linking.openURL(intent);
      return;
    } catch {}
  }
  try { await Linking.openSettings(); } catch {}
}

export async function canDrawOverlay(): Promise<boolean> {
  if (Platform.OS !== 'android') return true;
  try {
    if (NativeModule?.canDrawOverlay) {
      return await NativeModule.canDrawOverlay();
    }
  } catch {}
  return false;
}

export async function openOverlaySettings(): Promise<void> {
  if (Platform.OS !== 'android') return;
  try {
    if (NativeModule?.openOverlaySettings) {
      await NativeModule.openOverlaySettings();
      return;
    }
  } catch {}
  try {
    await Linking.sendIntent('android.settings.MANAGE_OVERLAY_PERMISSION');
  } catch {
    try { await Linking.openSettings(); } catch {}
  }
}

export async function openNotificationSettings(): Promise<void> {
  if (Platform.OS !== 'android') return;
  try {
    await Linking.openURL('intent:#Intent;action=android.settings.ACTION_NOTIFICATION_LISTENER_SETTINGS;end');
  } catch {
    try { await Linking.openSettings(); } catch {}
  }
}

// --- 每日记账提醒 ---
export async function scheduleDailyReminder(hour: number = 21, minute: number = 0): Promise<boolean> {
  if (Platform.OS !== 'android' || !NativeModule) return false;
  try {
    return await NativeModule.scheduleDailyReminder(hour, minute);
  } catch (e) {
    console.warn('[PayRecord] scheduleDailyReminder failed:', e);
    return false;
  }
}

export async function cancelDailyReminder(): Promise<boolean> {
  if (Platform.OS !== 'android' || !NativeModule) return false;
  try {
    return await NativeModule.cancelDailyReminder();
  } catch (e) {
    console.warn('[PayRecord] cancelDailyReminder failed:', e);
    return false;
  }
}

export async function isDailyReminderEnabled(): Promise<boolean> {
  if (Platform.OS !== 'android' || !NativeModule) return false;
  try {
    return await NativeModule.isDailyReminderEnabled();
  } catch {}
  return false;
}

// --- 晚间支出汇总（默认开启，23:00） ---
export async function scheduleDailySummary(hour: number = 23, minute: number = 0): Promise<boolean> {
  if (Platform.OS !== 'android' || !NativeModule) return false;
  try {
    return await NativeModule.scheduleDailySummary(hour, minute);
  } catch (e) {
    console.warn('[PayRecord] scheduleDailySummary failed:', e);
    return false;
  }
}

export async function cancelDailySummary(): Promise<boolean> {
  if (Platform.OS !== 'android' || !NativeModule) return false;
  try {
    return await NativeModule.cancelDailySummary();
  } catch (e) {
    console.warn('[PayRecord] cancelDailySummary failed:', e);
    return false;
  }
}

export async function isDailySummaryEnabled(): Promise<boolean> {
  if (Platform.OS !== 'android' || !NativeModule) return false;
  try {
    return await NativeModule.isDailySummaryEnabled();
  } catch {}
  return false;
}

export async function openReminderPermissionSettings(): Promise<void> {
  if (Platform.OS !== 'android') return;
  try {
    if (NativeModule?.openNotificationPermSettings) {
      await NativeModule.openNotificationPermSettings();
      return;
    }
  } catch {}
  // fallback
  try { await Linking.openSettings(); } catch {}
}

export async function openAlarmPermissionSettings(): Promise<void> {
  if (Platform.OS !== 'android') return;
  try {
    if (NativeModule?.openAlarmPermSettings) {
      await NativeModule.openAlarmPermSettings();
      return;
    }
  } catch {}
  try {
    await Linking.sendIntent('android.settings.REQUEST_SCHEDULE_EXACT_ALARM');
  } catch {
    try { await Linking.openSettings(); } catch {}
  }
}

// --- 前台服务保活（华为/荣耀默认开启，最低打扰通知） ---
export async function isKeepAliveRecommended(): Promise<boolean> {
  if (Platform.OS !== 'android' || !NativeModule) return false;
  try {
    if (NativeModule?.isKeepAliveRecommended) return await NativeModule.isKeepAliveRecommended();
  } catch {}
  return false;
}

export async function isKeepAliveEnabled(): Promise<boolean> {
  if (Platform.OS !== 'android' || !NativeModule) return false;
  try {
    if (NativeModule?.isKeepAliveEnabled) return await NativeModule.isKeepAliveEnabled();
  } catch {}
  return false;
}

export async function setKeepAliveEnabled(enabled: boolean): Promise<void> {
  if (Platform.OS !== 'android' || !NativeModule) return;
  try {
    await NativeModule?.setKeepAliveEnabled?.(enabled);
  } catch (e) {
    console.warn('[PayRecord] setKeepAliveEnabled failed:', e);
  }
}

export function isListenerStarted(): boolean {
  return started;
}

// --- Quick Add Queue: sync pending records from overlay ---
let queueConsumer: ((items: any[]) => void) | null = null;

export function setQuickAddQueueConsumer(cb: (items: any[]) => void) {
  queueConsumer = cb;
}

export function setupQuickAddSync() {
  const sync = async () => {
    if (!NativeModule) {
      console.warn('[PayRecord] No native module for queue sync');
      return;
    }
    try {
      console.log('[PayRecord] NativeModule keys:', NativeModule ? Object.keys(NativeModule) : 'null');
      console.log('[PayRecord] consumeQuickAddQueue type:', typeof NativeModule?.consumeQuickAddQueue);
      const items = await NativeModule.consumeQuickAddQueue();
      console.log('[PayRecord] Queue sync items:', JSON.stringify(items));
      if (items && items.length > 0) queueConsumer?.(items);
    } catch (e) {
      console.warn('[PayRecord] Queue sync failed:', e);
    }
  };
  AppState.addEventListener('change', (s) => { if (s === 'active') sync(); });
  sync(); // 启动时也同步一次
}

// --- 预算预警通知 ---
export async function sendBudgetAlert(title: string, message: string): Promise<boolean> {
  if (!NativeModule || Platform.OS !== 'android') return false;
  try {
    return await NativeModule.sendBudgetAlert(title, message);
  } catch (e) {
    console.warn('[PayRecord] sendBudgetAlert failed:', e);
    return false;
  }
}
