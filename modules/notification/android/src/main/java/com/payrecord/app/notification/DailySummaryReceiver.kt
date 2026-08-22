package com.payrecord.app.notification

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build
import android.util.Log

/** 每晚 23:00 支出汇总通知：今日支出 + 预算预警/超支 */
class DailySummaryReceiver : BroadcastReceiver() {
    companion object {
        private const val TAG = "PayRecord"
        private const val CHANNEL_ID = "daily_summary"
        private const val NOTIFICATION_ID = 2002
    }

    override fun onReceive(context: Context, intent: Intent) {
        Log.d(TAG, "DailySummaryReceiver triggered")

        val prefs = context.getSharedPreferences("payrecord_prefs", 0)
        // 无精确闹钟权限时，23:00 的汇总可能被系统推迟到次日凌晨触发，
        // 必须按调度时记录的目标日期统计，否则金额会算成新一天的数据
        val targetDate = prefs.getString("daily_summary_target_date", null)
        val stats = DailyStats.load(context, targetDate)

        // 通知文案里的日期标签：目标日 == 今天 → "今日"，否则显示具体日期
        val nowCal = java.util.Calendar.getInstance()
        val nowDate = String.format(
            java.util.Locale.US, "%04d-%02d-%02d",
            nowCal.get(java.util.Calendar.YEAR),
            nowCal.get(java.util.Calendar.MONTH) + 1,
            nowCal.get(java.util.Calendar.DAY_OF_MONTH)
        )
        val (dayLabel, monthLabel) = if (targetDate == null || targetDate == nowDate) {
            "今日" to "本月"
        } else {
            val parts = targetDate.split("-")
            if (parts.size == 3) {
                try {
                    "${parts[1].toInt()}月${parts[2].toInt()}日" to "${parts[1].toInt()}月"
                } catch (_: Exception) {
                    "今日" to "本月"
                }
            } else {
                "今日" to "本月"
            }
        }

        val notificationManager = context.getSystemService(Context.NOTIFICATION_SERVICE) as android.app.NotificationManager
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = android.app.NotificationChannel(
                CHANNEL_ID, "支出汇总", android.app.NotificationManager.IMPORTANCE_DEFAULT
            ).apply {
                description = "每晚汇总当日支出与预算使用情况"
                enableVibration(true)
            }
            notificationManager.createNotificationChannel(channel)
        }

        // 点击通知打开 App
        val launchIntent = context.packageManager.getLaunchIntentForPackage(context.packageName)?.apply {
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
        }
        val pendingIntent = if (launchIntent != null) {
            android.app.PendingIntent.getActivity(
                context, NOTIFICATION_ID, launchIntent,
                android.app.PendingIntent.FLAG_UPDATE_CURRENT or android.app.PendingIntent.FLAG_IMMUTABLE
            )
        } else null

        val contentText = "${dayLabel}支出 ¥${"%.2f".format(stats.todayExpense)}（${stats.todayCount} 笔）"
        val bigText = buildString {
            append(contentText)
            append("\n${monthLabel}累计支出 ¥${"%.2f".format(stats.monthExpense)}")
            for (w in stats.warnings) {
                if (w.over) {
                    append("\n🚨 「${w.label}」预算已超支 ${w.percent - 100}%")
                } else {
                    append("\n⚠️ 「${w.label}」预算已用 ${w.percent}%，接近上限")
                }
            }
        }
        val hasWarning = stats.warnings.isNotEmpty()

        val notification = android.app.Notification.Builder(context, CHANNEL_ID)
            .setSmallIcon(context.applicationInfo.icon)
            .setContentTitle(if (hasWarning) "📊 ${dayLabel}账单（有预算预警）" else "📊 ${dayLabel}账单")
            .setContentText(if (hasWarning) "$contentText · ${stats.warnings.size} 项预算预警" else contentText)
            .setStyle(android.app.Notification.BigTextStyle().bigText(bigText))
            .setAutoCancel(true)
            .apply { pendingIntent?.let { setContentIntent(it) } }
            .build()

        try {
            notificationManager.notify(NOTIFICATION_ID, notification)
        } catch (e: Exception) {
            Log.e(TAG, "summary notify failed", e)
        }

        // 调度明天（scheduleSummary 内部会同时更新目标日期）
        val hour = prefs.getInt("daily_summary_hour", 23)
        val minute = prefs.getInt("daily_summary_minute", 0)
        ReminderScheduler.scheduleSummary(context, hour, minute)
    }
}
