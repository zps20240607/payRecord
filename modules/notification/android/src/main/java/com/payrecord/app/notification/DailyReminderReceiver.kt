package com.payrecord.app.notification

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build
import android.util.Log

class DailyReminderReceiver : BroadcastReceiver() {
    companion object {
        private const val TAG = "PayRecord"
        private const val CHANNEL_ID = "daily_reminder"
    }

    override fun onReceive(context: Context, intent: Intent) {
        Log.d(TAG, "DailyReminderReceiver triggered")

        // 创建通知渠道
        val notificationManager = context.getSystemService(Context.NOTIFICATION_SERVICE) as android.app.NotificationManager
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = android.app.NotificationChannel(
                CHANNEL_ID, "记账提醒", android.app.NotificationManager.IMPORTANCE_DEFAULT
            ).apply {
                description = "每天提醒你记账"
                enableVibration(true)
            }
            notificationManager.createNotificationChannel(channel)
        }

        // 点击通知打开 App
        val launchIntent = context.packageManager.getLaunchIntentForPackage(context.packageName)?.apply {
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
            putExtra("screen", "add")
        }
        // requestCode 用 2001，避免与模块内其他 getActivity(requestCode=0) 互相覆盖 extra
        val pendingIntent = if (launchIntent != null) {
            android.app.PendingIntent.getActivity(
                context, 2001, launchIntent,
                android.app.PendingIntent.FLAG_UPDATE_CURRENT or android.app.PendingIntent.FLAG_IMMUTABLE
            )
        } else null

        val notification = android.app.Notification.Builder(context, CHANNEL_ID)
            .setSmallIcon(context.applicationInfo.icon)
            .setContentTitle("📝 今天有消费吗？")
            .setContentText("别忘了记一笔，坚持记账养成好习惯")
            .setAutoCancel(true)
            .apply { pendingIntent?.let { setContentIntent(it) } }
            .build()

        notificationManager.notify(2001, notification)

        // 调度明天的提醒
        scheduleNext(context)
    }

    private fun scheduleNext(context: Context) {
        val prefs = context.getSharedPreferences("payrecord_prefs", 0)
        val hour = prefs.getInt("daily_reminder_hour", 21)
        val minute = prefs.getInt("daily_reminder_minute", 0)
        ReminderScheduler.schedule(context, hour, minute)
    }
}
