package com.payrecord.app.notification

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log

/** 开机后恢复：重排每日提醒闹钟、拉起保活前台服务、启动自愈看门狗 */
class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != Intent.ACTION_BOOT_COMPLETED) return
        Log.d("PayRecord", "Boot completed, restoring services")
        ReminderScheduler.rescheduleIfEnabled(context)
        ReminderScheduler.rescheduleSummaryIfEnabled(context)
        KeepAliveService.ensureRunning(context)
        Watchdog.schedule(context)
    }
}
