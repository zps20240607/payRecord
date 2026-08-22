package com.payrecord.app.notification

import android.content.BroadcastReceiver
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.os.Build
import android.provider.Settings
import android.service.notification.NotificationListenerService
import android.util.Log

/** 看门狗闹钟回调：自愈检查 + 重新调度下一轮 */
class WatchdogReceiver : BroadcastReceiver() {
    companion object {
        private const val TAG = "PayRecord"
        private const val PREFS = "payrecord_prefs"
        private const val KEY_RETICK = "watchdog_retick_count"
        private const val KEY_LAST_TICK = "watchdog_last_tick"
        private const val MAX_RETICK = 3
    }

    override fun onReceive(context: Context, intent: Intent) {
        // 记录自检时间，供设置页「自愈诊断」查看闹钟是否真的在触发
        context.getSharedPreferences(PREFS, 0).edit()
            .putLong(KEY_LAST_TICK, System.currentTimeMillis()).apply()

        var a11yDead = false
        try {
            // 1. 通知监听：已授权但服务未运行 → 请求系统重新绑定
            val flat = Settings.Secure.getString(context.contentResolver, "enabled_notification_listeners") ?: ""
            val granted = flat.contains(context.packageName)
            if (granted && !NotificationListener.isRunning) {
                Log.w(TAG, "Watchdog: notification listener dead, requesting rebind")
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
                    NotificationListenerService.requestRebind(
                        ComponentName(context, NotificationListener::class.java)
                    )
                }
            }

            // 2. 无障碍服务：已启用但未运行（如划掉 App 后进程被杀）。
            //    无障碍无法由 App 主动 rebind，只能靠"进程存活 + 系统自动重绑"，
            //    所以这里拉起保活前台服务让进程驻留，并进入高频重检模式给系统重绑机会
            val a11yFlat = Settings.Secure.getString(context.contentResolver, "enabled_accessibility_services") ?: ""
            val a11yGranted = a11yFlat.contains(context.packageName)
            a11yDead = a11yGranted && !PayAccessibilityService.isRunning
            if (a11yDead) {
                Log.w(TAG, "Watchdog: accessibility service enabled but not bound, keeping process alive")
            }

            // 3. 保活前台服务（内部会检查用户开关；悬浮窗权限已授予时
            //    Android 12+ 允许后台启动 FGS）
            KeepAliveService.ensureRunning(context)
        } catch (e: Exception) {
            Log.e(TAG, "Watchdog tick failed", e)
        }

        // 4. 安排下一轮：无障碍未绑定则 1 分钟高频重检（最多 3 次，防止无限高频耗电），
        //    否则回到常规 15 分钟间隔
        val prefs = context.getSharedPreferences(PREFS, 0)
        val retick = prefs.getInt(KEY_RETICK, 0)
        val nextDelay = if (a11yDead && retick < MAX_RETICK) {
            prefs.edit().putInt(KEY_RETICK, retick + 1).apply()
            Watchdog.QUICK_REBIND_MS
        } else {
            prefs.edit().putInt(KEY_RETICK, 0).apply()
            Watchdog.INTERVAL_MS
        }
        Watchdog.schedule(context, nextDelay)
    }
}
