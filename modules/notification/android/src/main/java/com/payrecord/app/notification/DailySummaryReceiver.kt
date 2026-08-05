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

        val stats = DailyStats.load(context)

        val notificationManager = context.getSystemService(Context.NOTIFICATION_SERVICE) as android.app.NotificationManager
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = android.app.NotificationChannel(
                CHANNEL_ID, "支出汇总", android.app.NotificationManager.IMPORTANCE_DEFAULT
            ).apply {
                description = "每晚汇总今日支出与预算使用情况"
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

        val contentText = "今日支出 ¥${"%.2f".format(stats.todayExpense)}（${stats.todayCount} 笔）"
        val bigText = buildString {
            append(contentText)
            append("\n本月累计支出 ¥${"%.2f".format(stats.monthExpense)}")
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
            .setContentTitle(if (hasWarning) "📊 今日账单（有预算预警）" else "📊 今日账单")
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

        // 调度明天
        val prefs = context.getSharedPreferences("payrecord_prefs", 0)
        val hour = prefs.getInt("daily_summary_hour", 23)
        val minute = prefs.getInt("daily_summary_minute", 0)
        ReminderScheduler.scheduleSummary(context, hour, minute)
    }
}
