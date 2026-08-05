package com.payrecord.app.notification

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import android.util.Log

/** 每日定时调度：记账提醒（21:00）与支出汇总（23:00）共用，模块/接收器/开机恢复统一走这里 */
object ReminderScheduler {
    private const val TAG = "PayRecord"
    private const val REQUEST_CODE_REMINDER = 1001
    private const val REQUEST_CODE_SUMMARY = 1002
    private const val PREFS = "payrecord_prefs"

    fun canScheduleExact(context: Context): Boolean {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) return true
        val alarmManager = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
        return alarmManager.canScheduleExactAlarms()
    }

    private fun pendingIntent(context: Context, receiver: Class<*>, requestCode: Int): PendingIntent {
        val intent = Intent(context, receiver)
        return PendingIntent.getBroadcast(
            context, requestCode, intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
    }

    private fun scheduleInternal(
        context: Context, receiver: Class<*>, requestCode: Int,
        hour: Int, minute: Int, allowInexactFallback: Boolean
    ): Boolean {
        val exact = canScheduleExact(context)
        if (!exact && !allowInexactFallback) {
            Log.w(TAG, "SCHEDULE_EXACT_ALARM not granted, skip scheduling")
            return false
        }
        return try {
            val calendar = java.util.Calendar.getInstance().apply {
                set(java.util.Calendar.HOUR_OF_DAY, hour)
                set(java.util.Calendar.MINUTE, minute)
                set(java.util.Calendar.SECOND, 0)
                set(java.util.Calendar.MILLISECOND, 0)
                if (timeInMillis <= System.currentTimeMillis()) {
                    add(java.util.Calendar.DAY_OF_MONTH, 1)
                }
            }
            val alarmManager = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
            if (exact) {
                alarmManager.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, calendar.timeInMillis, pendingIntent(context, receiver, requestCode))
            } else {
                // 无精确闹钟权限时降级为非精确闹钟，时间可能漂移几分钟
                alarmManager.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, calendar.timeInMillis, pendingIntent(context, receiver, requestCode))
            }
            true
        } catch (e: Exception) {
            Log.e(TAG, "schedule failed", e)
            false
        }
    }

    private fun cancelInternal(context: Context, receiver: Class<*>, requestCode: Int) {
        try {
            val alarmManager = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
            alarmManager.cancel(pendingIntent(context, receiver, requestCode))
        } catch (e: Exception) {
            Log.e(TAG, "cancel failed", e)
        }
    }

    // --- 每日记账提醒 ---
    fun schedule(context: Context, hour: Int, minute: Int): Boolean =
        scheduleInternal(context, DailyReminderReceiver::class.java, REQUEST_CODE_REMINDER, hour, minute, allowInexactFallback = false)

    fun cancel(context: Context) = cancelInternal(context, DailyReminderReceiver::class.java, REQUEST_CODE_REMINDER)

    fun rescheduleIfEnabled(context: Context) {
        val prefs = context.getSharedPreferences(PREFS, 0)
        if (!prefs.getBoolean("daily_reminder_enabled", false)) return
        val hour = prefs.getInt("daily_reminder_hour", 21)
        val minute = prefs.getInt("daily_reminder_minute", 0)
        if (schedule(context, hour, minute)) {
            Log.d(TAG, "daily reminder rescheduled at $hour:$minute")
        }
    }

    // --- 晚间支出汇总（默认开启，23:00） ---
    fun scheduleSummary(context: Context, hour: Int, minute: Int): Boolean =
        scheduleInternal(context, DailySummaryReceiver::class.java, REQUEST_CODE_SUMMARY, hour, minute, allowInexactFallback = true)

    fun cancelSummary(context: Context) = cancelInternal(context, DailySummaryReceiver::class.java, REQUEST_CODE_SUMMARY)

    fun isSummaryEnabled(context: Context): Boolean =
        context.getSharedPreferences(PREFS, 0).getBoolean("daily_summary_enabled", true)

    fun rescheduleSummaryIfEnabled(context: Context) {
        val prefs = context.getSharedPreferences(PREFS, 0)
        if (!prefs.getBoolean("daily_summary_enabled", true)) return
        val hour = prefs.getInt("daily_summary_hour", 23)
        val minute = prefs.getInt("daily_summary_minute", 0)
        if (scheduleSummary(context, hour, minute)) {
            Log.d(TAG, "daily summary rescheduled at $hour:$minute")
        }
    }
}
