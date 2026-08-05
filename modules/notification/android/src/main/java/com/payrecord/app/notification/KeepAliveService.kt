package com.payrecord.app.notification

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import android.util.Log

/**
 * 前台服务保活：华为/荣耀对无障碍、通知监听服务的后台冻结过于激进，
 * 挂一个 IMPORTANCE_MIN 的前台服务通知（无声、无震动、无角标、收在通知栏最底部），
 * 让系统把本进程视为"用户可感知的活跃服务"，不轻易回收。
 *
 * Android 强制前台服务必须配通知，无法完全去掉；MIN 级别是最低打扰方案。
 * 默认只在华为/荣耀设备开启，其他厂商默认关闭，可在设置页手动开关。
 */
class KeepAliveService : Service() {

    companion object {
        private const val TAG = "PayRecord"
        private const val CHANNEL_ID = "payrecord_keepalive"
        private const val NOTIFICATION_ID = 1001
        private const val PREFS = "payrecord_keepalive"
        private const val KEY_ENABLED = "enabled"

        /** 是否处于后台管控激进的厂商（国产 ROM 普遍激进冻结后台进程） */
        fun isRecommended(): Boolean {
            val m = Build.MANUFACTURER.lowercase()
            return listOf("huawei", "honor", "oppo", "realme", "oneplus", "vivo", "iqoo", "xiaomi", "redmi", "meizu")
                .any { m.contains(it) }
        }

        fun isEnabled(context: Context): Boolean {
            val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            return prefs.getBoolean(KEY_ENABLED, isRecommended())
        }

        fun setEnabled(context: Context, enabled: Boolean) {
            context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                .edit().putBoolean(KEY_ENABLED, enabled).apply()
            if (enabled) start(context) else stop(context)
        }

        fun start(context: Context) {
            try {
                val intent = Intent(context, KeepAliveService::class.java)
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    context.startForegroundService(intent)
                } else {
                    context.startService(intent)
                }
                Log.d(TAG, "KeepAliveService started")
            } catch (e: Exception) {
                // Android 12+ 后台启动 FGS 受限（电池优化白名单/悬浮窗权限可豁免），
                // 启动失败时等 App 下次前台由 startListener 兜底拉起
                Log.w(TAG, "KeepAliveService start failed: ${e.message}")
            }
        }

        fun stop(context: Context) {
            try {
                context.stopService(Intent(context, KeepAliveService::class.java))
            } catch (_: Exception) {}
        }

        /** 服务连接/模块启动时按需拉起 */
        fun ensureRunning(context: Context) {
            if (isEnabled(context)) start(context)
        }
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        showForegroundNotification()
        return START_STICKY
    }

    private fun showForegroundNotification() {
        val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        val channel = NotificationChannel(CHANNEL_ID, "后台运行", NotificationManager.IMPORTANCE_MIN).apply {
            description = "保持自动记账服务在后台可用"
            setShowBadge(false)
            enableVibration(false)
            setSound(null, null)
        }
        nm.createNotificationChannel(channel)

        val notification = Notification.Builder(this, CHANNEL_ID)
            .setContentTitle("记花正在运行")
            .setContentText("自动记账服务保持中")
            .setSmallIcon(applicationInfo.icon)
            .setOngoing(true)
            .setCategory(Notification.CATEGORY_SERVICE)
            .build()

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC)
        } else {
            startForeground(NOTIFICATION_ID, notification)
        }
    }
}
