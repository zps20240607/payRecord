package com.payrecord.app.notification

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.util.Log

/**
 * 进程自愈看门狗：用定时闹钟周期性唤醒本进程，检查并恢复：
 * 1. 通知监听服务（已授权但被系统杀 → requestRebind）
 * 2. 前台保活服务（被国产 ROM 冻结/回收 → 重新拉起）
 *
 * 闹钟不依赖进程存活：即使整个 App 进程被系统杀死，AlarmManager 依然会准时
 * 触发 WatchdogReceiver，从而解决"必须每隔半小时/一小时手动打开 App 才能继续
 * 自动抓通知"的问题。
 */
object Watchdog {
    private const val TAG = "PayRecord"
    private const val REQUEST_CODE = 3001

    /** 常规自愈间隔：15 分钟 */
    const val INTERVAL_MS = 15 * 60 * 1000L

    /** 感知到服务被回收后的快速恢复间隔：2 分钟 */
    const val QUICK_RECOVERY_MS = 2 * 60 * 1000L

    /** 无障碍服务已启用但未绑定时的高频重检间隔：1 分钟 */
    const val QUICK_REBIND_MS = 60 * 1000L

    fun schedule(context: Context, delayMs: Long = INTERVAL_MS) {
        try {
            val alarmManager = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
            val pendingIntent = PendingIntent.getBroadcast(
                context, REQUEST_CODE,
                Intent(context, WatchdogReceiver::class.java),
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )
            val triggerAt = System.currentTimeMillis() + delayMs
            try {
                // 优先精确闹钟（Doze 下也能准点唤醒）；无 SCHEDULE_EXACT_ALARM 权限时降级
                alarmManager.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerAt, pendingIntent)
            } catch (e: Exception) {
                alarmManager.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerAt, pendingIntent)
            }
        } catch (e: Exception) {
            Log.w(TAG, "Watchdog schedule failed", e)
        }
    }

    fun cancel(context: Context) {
        try {
            val alarmManager = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
            val pendingIntent = PendingIntent.getBroadcast(
                context, REQUEST_CODE,
                Intent(context, WatchdogReceiver::class.java),
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )
            alarmManager.cancel(pendingIntent)
        } catch (_: Exception) {}
    }
}
