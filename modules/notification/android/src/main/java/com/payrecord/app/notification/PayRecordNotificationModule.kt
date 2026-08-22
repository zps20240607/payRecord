package com.payrecord.app.notification

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.Build
import android.util.Log
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class PayRecordNotificationModule : Module() {

  private var receiver: BroadcastReceiver? = null

  override fun definition() = ModuleDefinition {
    Name("PayRecordNotification")

    Events("onNotification")

    OnCreate {
      registerNotificationReceiver()
    }

    OnDestroy {
      unregisterNotificationReceiver()
    }

    AsyncFunction("isListening") { promise: Promise ->
      promise.resolve(NotificationListener.isRunning)
    }

    AsyncFunction("canDrawOverlay") { promise: Promise ->
      val context = appContext.reactContext
      if (context == null) { promise.resolve(false); return@AsyncFunction }
      promise.resolve(Build.VERSION.SDK_INT < 23 || android.provider.Settings.canDrawOverlays(context))
    }

    AsyncFunction("openOverlaySettings") { promise: Promise ->
      val context = appContext.reactContext
      if (context == null) { promise.resolve(false); return@AsyncFunction }
      try {
        val intent = Intent(
          android.provider.Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
          android.net.Uri.parse("package:${context.packageName}")
        ).apply { addFlags(Intent.FLAG_ACTIVITY_NEW_TASK) }
        context.startActivity(intent)
        promise.resolve(true)
      } catch (e: Exception) {
        Log.e("PayRecord", "openOverlaySettings failed", e)
        promise.resolve(false)
      }
    }

    AsyncFunction("startListener") { promise: Promise ->
      appContext.reactContext?.let {
        KeepAliveService.ensureRunning(it)
        // 汇总通知默认开启，App 启动时自愈调度（覆盖新装/升级/闹钟丢失场景）
        ReminderScheduler.rescheduleSummaryIfEnabled(it)
        // 启动进程自愈看门狗：每 15 分钟检查一次监听服务/保活服务是否被系统回收
        Watchdog.schedule(it)
      }
      promise.resolve(true)
    }

    // --- 前台服务保活（华为/荣耀默认开启） ---
    AsyncFunction("isKeepAliveRecommended") { promise: Promise ->
      promise.resolve(KeepAliveService.isRecommended())
    }

    AsyncFunction("isKeepAliveEnabled") { promise: Promise ->
      val context = appContext.reactContext
      if (context == null) { promise.resolve(false); return@AsyncFunction }
      promise.resolve(KeepAliveService.isEnabled(context))
    }

    AsyncFunction("setKeepAliveEnabled") { enabled: Boolean, promise: Promise ->
      val context = appContext.reactContext
      if (context == null) { promise.resolve(false); return@AsyncFunction }
      KeepAliveService.setEnabled(context, enabled)
      promise.resolve(true)
    }

    // 通知读取权限的真实系统状态（重启后服务可能还没绑定，isRunning 不可靠，这里直接读系统设置）
    AsyncFunction("isNotificationAccessGranted") { promise: Promise ->
      val context = appContext.reactContext
      if (context == null) { promise.resolve(false); return@AsyncFunction }
      val flat = android.provider.Settings.Secure.getString(
        context.contentResolver, "enabled_notification_listeners"
      ) ?: ""
      promise.resolve(flat.contains(context.packageName))
    }

    // 已授权但服务未绑定（如刚重启）时，主动请求系统重新绑定监听服务
    AsyncFunction("requestListenerRebind") { promise: Promise ->
      val context = appContext.reactContext
      if (context == null) { promise.resolve(false); return@AsyncFunction }
      try {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
          android.service.notification.NotificationListenerService.requestRebind(
            android.content.ComponentName(context, NotificationListener::class.java)
          )
        }
        promise.resolve(true)
      } catch (e: Exception) {
        Log.e("PayRecord", "requestRebind failed", e)
        promise.resolve(false)
      }
    }

    // 后台运行：以"忽略电池优化"白名单作为可检查项
    AsyncFunction("isBatteryOptIgnored") { promise: Promise ->
      val context = appContext.reactContext
      if (context == null) { promise.resolve(false); return@AsyncFunction }
      val pm = context.getSystemService(Context.POWER_SERVICE) as android.os.PowerManager
      promise.resolve(pm.isIgnoringBatteryOptimizations(context.packageName))
    }

    AsyncFunction("openBatteryOptSettings") { promise: Promise ->
      val context = appContext.reactContext
      if (context == null) { promise.resolve(false); return@AsyncFunction }
      try {
        val manufacturer = Build.MANUFACTURER.lowercase()
        val intent = when {
          // 小米/Redmi → 自启动管理
          manufacturer.contains("xiaomi") || manufacturer.contains("redmi") -> {
            Log.d("PayRecord", "Detected Xiaomi/Redmi, opening autostart settings")
            // MIUI 自启动管理
            Intent().apply {
              component = android.content.ComponentName(
                "com.miui.securitycenter",
                "com.miui.permcenter.autostart.AutoStartManagementActivity"
              )
              addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
          }
          // 华为/荣耀 → 电池优化管理（启动管理）
          manufacturer.contains("huawei") || manufacturer.contains("honor") -> {
            Log.d("PayRecord", "Detected Huawei/Honor, opening battery settings")
            Intent().apply {
              component = android.content.ComponentName(
                "com.huawei.systemmanager",
                "com.huawei.systemmanager.optimize.process.ProtectActivity"
              )
              addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
          }
          // OPPO/一加 → 耗电保护/自启动管理（ColorOS 有多个入口，逐个尝试）
          manufacturer.contains("oppo") || manufacturer.contains("oneplus") -> {
            Log.d("PayRecord", "Detected OPPO/OnePlus, trying battery/startup settings")
            val oppoIntents = listOf(
              // ColorOS 13+ 耗电保护
              Intent("com.coloros.safecenter.permission.StartupAppListActivity"),
              // ColorOS 14 自启动管理
              Intent().apply {
                component = android.content.ComponentName(
                  "com.coloros.safecenter",
                  "com.coloros.safecenter.permission.startup.StartupAppListActivity"
                )
              },
              // heytap 耗电保护（部分 ColorOS 14）
              Intent().apply {
                component = android.content.ComponentName(
                  "com.heytap.powersave",
                  "com.heytap.powersave.ui.PowerSaveActivity"
                )
              },
              // 耗电优化（部分 ColorOS 版本）
              Intent().apply {
                component = android.content.ComponentName(
                  "com.coloros.powersave",
                  "com.coloros.powersave.ui.PowerSaveActivity"
                )
              },
              // 旧版 ColorOS
              Intent().apply {
                component = android.content.ComponentName(
                  "com.oppo.safe",
                  "com.oppo.safe.permission.startup.StartupAppListActivity"
                )
              },
            )
            var opened = false
            for (i in oppoIntents) {
              try {
                i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                context.startActivity(i)
                opened = true
                break
              } catch (_: Exception) {}
            }
            if (opened) {
              promise.resolve(true)
              return@AsyncFunction
            }
            // ROM 专属入口全部失败，跳应用详情页（用户可在里面找到耗电管理/自启动）
            Log.d("PayRecord", "OPPO ROM-specific intents all failed, opening app details")
            try {
              val appDetailIntent = Intent(
                android.provider.Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
                android.net.Uri.parse("package:${context.packageName}")
              ).apply { addFlags(Intent.FLAG_ACTIVITY_NEW_TASK) }
              context.startActivity(appDetailIntent)
              promise.resolve(true)
              return@AsyncFunction
            } catch (_: Exception) {}
            null
          }
          // vivo → 后台管理
          manufacturer.contains("vivo") -> {
            Log.d("PayRecord", "Detected vivo, opening bg manager settings")
            Intent("com.vivo.abe.secui.abefloatwindowlist").apply {
              addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
          }
          // 三星 → 设备维护
          manufacturer.contains("samsung") -> {
            Log.d("PayRecord", "Detected Samsung, opening device maintenance")
            Intent("com.samsung.android.sm.SETTINGS_APP_BATTERY").apply {
              addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
          }
          // 其他：先尝试标准 API，失败则跳通用电池优化列表
          else -> null
        }

        if (intent != null) {
          try {
            context.startActivity(intent)
            promise.resolve(true)
            return@AsyncFunction
          } catch (e: Exception) {
            Log.w("PayRecord", "ROM-specific intent failed, falling back", e)
          }
        }

        // 标准 Android：直接请求忽略电池优化（会弹系统确认对话框）
        try {
          val stdIntent = Intent(
            android.provider.Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS,
            android.net.Uri.parse("package:${context.packageName}")
          ).apply { addFlags(Intent.FLAG_ACTIVITY_NEW_TASK) }
          context.startActivity(stdIntent)
          promise.resolve(true)
        } catch (e: Exception) {
          // 最后兜底：跳到电池优化列表页
          try {
            val fallbackIntent = Intent(android.provider.Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS)
              .apply { addFlags(Intent.FLAG_ACTIVITY_NEW_TASK) }
            context.startActivity(fallbackIntent)
            promise.resolve(true)
          } catch (e2: Exception) {
            Log.e("PayRecord", "openBatteryOptSettings failed", e2)
            promise.resolve(false)
          }
        }
      } catch (e: Exception) {
        Log.e("PayRecord", "openBatteryOptSettings unexpected error", e)
        promise.resolve(false)
      }
    }

    // 自启动权限状态检测（无法精确检测，用 BOOT_COMPLETED 注册状态作为参考）
    AsyncFunction("isAutoStartEnabled") { promise: Promise ->
      val context = appContext.reactContext
      if (context == null) { promise.resolve(true); return@AsyncFunction }
      // 自启动权限没有标准 API 可以检测，不同厂商实现不同
      // 返回 true 表示无法确定，避免误导用户
      promise.resolve(true)
    }

    // 自启动权限设置跳转（各厂商定制路径）
    AsyncFunction("openAutoStartSettings") { promise: Promise ->
      val context = appContext.reactContext
      if (context == null) { promise.resolve(false); return@AsyncFunction }
      try {
        val manufacturer = Build.MANUFACTURER.lowercase()
        val intents = mutableListOf<Intent>()

        when {
          // 小米/Redmi/MIUI → 自启动管理
          manufacturer.contains("xiaomi") || manufacturer.contains("redmi") -> {
            intents.add(Intent().apply {
              component = android.content.ComponentName(
                "com.miui.securitycenter",
                "com.miui.permcenter.autostart.AutoStartManagementActivity"
              )
              addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            })
          }
          // 华为/荣耀/EMUI → 应用启动管理
          manufacturer.contains("huawei") || manufacturer.contains("honor") -> {
            intents.add(Intent().apply {
              component = android.content.ComponentName(
                "com.huawei.systemmanager",
                "com.huawei.systemmanager.startupmgr.ui.StartupNormalAppListActivity"
              )
              addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            })
            intents.add(Intent().apply {
              component = android.content.ComponentName(
                "com.huawei.systemmanager",
                "com.huawei.systemmanager.optimize.process.ProtectActivity"
              )
              addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            })
          }
          // OPPO/一加/realme/ColorOS → 自启动管理
          manufacturer.contains("oppo") || manufacturer.contains("oneplus") || manufacturer.contains("realme") -> {
            intents.add(Intent("com.coloros.safecenter.permission.StartupAppListActivity").apply {
              addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            })
            intents.add(Intent().apply {
              component = android.content.ComponentName(
                "com.coloros.safecenter",
                "com.coloros.safecenter.permission.startup.StartupAppListActivity"
              )
              addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            })
            intents.add(Intent().apply {
              component = android.content.ComponentName(
                "com.oppo.safe",
                "com.oppo.safe.permission.startup.StartupAppListActivity"
              )
              addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            })
          }
          // vivo/iQOO/OriginOS → 后台管理/自启动
          manufacturer.contains("vivo") || manufacturer.contains("iqoo") -> {
            intents.add(Intent().apply {
              component = android.content.ComponentName(
                "com.vivo.abe",
                "com.vivo.applicationbehaviorengine.ui.ExcessivePowerManagerActivity"
              )
              addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            })
            intents.add(Intent("com.vivo.abe.secui.abefloatwindowlist").apply {
              addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            })
          }
        }

        // 通用 fallback：应用详情页
        intents.add(Intent(
          android.provider.Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
          android.net.Uri.parse("package:${context.packageName}")
        ).apply { addFlags(Intent.FLAG_ACTIVITY_NEW_TASK) })

        for (intent in intents) {
          try {
            context.startActivity(intent)
            promise.resolve(true)
            return@AsyncFunction
          } catch (_: Exception) {}
        }
        promise.resolve(false)
      } catch (e: Exception) {
        Log.e("PayRecord", "openAutoStartSettings failed", e)
        promise.resolve(false)
      }
    }

    // 无障碍服务（微信内支付补记）状态与跳转
    AsyncFunction("isAccessibilityEnabled") { promise: Promise ->
      val context = appContext.reactContext
      if (context == null) { promise.resolve(false); return@AsyncFunction }
      val flat = android.provider.Settings.Secure.getString(
        context.contentResolver, "enabled_accessibility_services"
      ) ?: ""
      promise.resolve(flat.contains(context.packageName))
    }

    AsyncFunction("openAccessibilitySettings") { promise: Promise ->
      val context = appContext.reactContext
      if (context == null) { promise.resolve(false); return@AsyncFunction }
      try {
        val intent = Intent(android.provider.Settings.ACTION_ACCESSIBILITY_SETTINGS)
          .apply { addFlags(Intent.FLAG_ACTIVITY_NEW_TASK) }
        context.startActivity(intent)
        promise.resolve(true)
      } catch (e: Exception) {
        Log.e("PayRecord", "openAccessibilitySettings failed", e)
        promise.resolve(false)
      }
    }

    AsyncFunction("stopListener") { promise: Promise ->
      promise.resolve(true)
    }

    AsyncFunction("sendBudgetAlert") { title: String, message: String, promise: Promise ->
      val context = appContext.reactContext
      if (context == null) { promise.resolve(false); return@AsyncFunction }
      try {
        val notificationManager = context.getSystemService(Context.NOTIFICATION_SERVICE) as android.app.NotificationManager
        val channelId = "budget_alert"

        // 创建通知渠道（Android 8+）
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
          val channel = android.app.NotificationChannel(
            channelId, "预算预警", android.app.NotificationManager.IMPORTANCE_HIGH
          ).apply {
            description = "预算使用提醒"
            enableVibration(true)
          }
          notificationManager.createNotificationChannel(channel)
        }

        // 点击通知跳转到预算页
        val intent = context.packageManager.getLaunchIntentForPackage(context.packageName)?.apply {
          addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
          putExtra("screen", "budget")
        }
        val pendingIntent = android.app.PendingIntent.getActivity(
          context, 0, intent,
          android.app.PendingIntent.FLAG_UPDATE_CURRENT or android.app.PendingIntent.FLAG_IMMUTABLE
        )

        val notificationId = (System.currentTimeMillis() % 100000).toInt()
        val notification = android.app.Notification.Builder(context, channelId)
          .setSmallIcon(context.applicationInfo.icon)
          .setContentTitle(title)
          .setContentText(message)
          .setStyle(android.app.Notification.BigTextStyle().bigText(message))
          .setAutoCancel(true)
          .setContentIntent(pendingIntent)
          .build()

        notificationManager.notify(notificationId, notification)
        promise.resolve(true)
      } catch (e: Exception) {
        Log.e("PayRecord", "sendBudgetAlert failed", e)
        promise.resolve(false)
      }
    }

    // 打开应用通知设置页（带包名 extra，直接定位到本应用）
    AsyncFunction("openNotificationPermSettings") { promise: Promise ->
      val context = appContext.reactContext
      if (context == null) { promise.resolve(false); return@AsyncFunction }
      try {
        val intent = Intent(android.provider.Settings.ACTION_APP_NOTIFICATION_SETTINGS).apply {
          putExtra(android.provider.Settings.EXTRA_APP_PACKAGE, context.packageName)
          addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        context.startActivity(intent)
        promise.resolve(true)
      } catch (e: Exception) {
        Log.e("PayRecord", "openNotificationPermSettings failed", e)
        promise.resolve(false)
      }
    }

    // 打开闹钟与提醒权限设置页（Android 12+）
    AsyncFunction("openAlarmPermSettings") { promise: Promise ->
      val context = appContext.reactContext
      if (context == null) { promise.resolve(false); return@AsyncFunction }
      try {
        val intent = Intent(android.provider.Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM).apply {
          data = android.net.Uri.parse("package:${context.packageName}")
          addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        context.startActivity(intent)
        promise.resolve(true)
      } catch (e: Exception) {
        // 旧版 Android 没有此设置，跳应用详情页
        try {
          val fallback = Intent(
            android.provider.Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
            android.net.Uri.parse("package:${context.packageName}")
          ).apply { addFlags(Intent.FLAG_ACTIVITY_NEW_TASK) }
          context.startActivity(fallback)
          promise.resolve(true)
        } catch (e2: Exception) {
          promise.resolve(false)
        }
      }
    }

    // 每日记账提醒
    AsyncFunction("scheduleDailyReminder") { hour: Int, minute: Int, promise: Promise ->
      val context = appContext.reactContext
      if (context == null) { promise.resolve(false); return@AsyncFunction }
      val ok = ReminderScheduler.schedule(context, hour, minute)
      if (ok) {
        // 保存设置
        val prefs = context.getSharedPreferences("payrecord_prefs", 0)
        prefs.edit().putBoolean("daily_reminder_enabled", true).putInt("daily_reminder_hour", hour).putInt("daily_reminder_minute", minute).apply()
      } else {
        Log.e("PayRecord", "scheduleDailyReminder failed (exact-alarm permission missing?)")
      }
      promise.resolve(ok)
    }

    AsyncFunction("cancelDailyReminder") { promise: Promise ->
      val context = appContext.reactContext
      if (context == null) { promise.resolve(false); return@AsyncFunction }
      try {
        ReminderScheduler.cancel(context)

        val prefs = context.getSharedPreferences("payrecord_prefs", 0)
        prefs.edit().putBoolean("daily_reminder_enabled", false).apply()

        promise.resolve(true)
      } catch (e: Exception) {
        Log.e("PayRecord", "cancelDailyReminder failed", e)
        promise.resolve(false)
      }
    }

    AsyncFunction("isDailyReminderEnabled") { promise: Promise ->
      val context = appContext.reactContext
      if (context == null) { promise.resolve(false); return@AsyncFunction }
      val prefs = context.getSharedPreferences("payrecord_prefs", 0)
      promise.resolve(prefs.getBoolean("daily_reminder_enabled", false))
    }

    // 晚间支出汇总（默认开启，23:00）
    AsyncFunction("scheduleDailySummary") { hour: Int, minute: Int, promise: Promise ->
      val context = appContext.reactContext
      if (context == null) { promise.resolve(false); return@AsyncFunction }
      val ok = ReminderScheduler.scheduleSummary(context, hour, minute)
      if (ok) {
        val prefs = context.getSharedPreferences("payrecord_prefs", 0)
        prefs.edit().putBoolean("daily_summary_enabled", true).putInt("daily_summary_hour", hour).putInt("daily_summary_minute", minute).apply()
      }
      promise.resolve(ok)
    }

    AsyncFunction("cancelDailySummary") { promise: Promise ->
      val context = appContext.reactContext
      if (context == null) { promise.resolve(false); return@AsyncFunction }
      ReminderScheduler.cancelSummary(context)
      val prefs = context.getSharedPreferences("payrecord_prefs", 0)
      prefs.edit().putBoolean("daily_summary_enabled", false).apply()
      promise.resolve(true)
    }

    AsyncFunction("isDailySummaryEnabled") { promise: Promise ->
      val context = appContext.reactContext
      if (context == null) { promise.resolve(false); return@AsyncFunction }
      promise.resolve(ReminderScheduler.isSummaryEnabled(context))
    }

    // 自愈诊断：把看门狗/监听/无障碍/保活的真实运行状态上报给设置页展示，
    // 用于定位"划掉 App 后监听不恢复"的设备级问题
    AsyncFunction("getWatchdogStatus") { promise: Promise ->
      val context = appContext.reactContext
      if (context == null) { promise.resolve(emptyMap<String, Any>()); return@AsyncFunction }
      try {
        val prefs = context.getSharedPreferences("payrecord_prefs", 0)
        val alarmManager = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
        val pendingIntent = PendingIntent.getBroadcast(
          context, 3001,
          Intent(context, WatchdogReceiver::class.java),
          PendingIntent.FLAG_NO_CREATE or PendingIntent.FLAG_IMMUTABLE
        )
        val listenerFlat = android.provider.Settings.Secure.getString(
          context.contentResolver, "enabled_notification_listeners"
        ) ?: ""
        val a11yFlat = android.provider.Settings.Secure.getString(
          context.contentResolver, "enabled_accessibility_services"
        ) ?: ""
        val canExact = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
          alarmManager.canScheduleExactAlarms()
        } else true

        promise.resolve(mapOf(
          "lastTick" to prefs.getLong("watchdog_last_tick", 0L),
          "watchdogAlarmPending" to (pendingIntent != null),
          "listenerGranted" to listenerFlat.contains(context.packageName),
          "listenerRunning" to NotificationListener.isRunning,
          "a11yGranted" to a11yFlat.contains(context.packageName),
          "a11yRunning" to PayAccessibilityService.isRunning,
          "keepAliveRunning" to KeepAliveService.isRunning,
          "canExactAlarm" to canExact
        ))
      } catch (e: Exception) {
        Log.e("PayRecord", "getWatchdogStatus failed", e)
        promise.resolve(emptyMap<String, Any>())
      }
    }

    AsyncFunction("consumeQuickAddQueue") { promise: Promise ->
      val context = appContext.reactContext
      if (context == null) { promise.resolve(emptyList<Any>()); return@AsyncFunction }
      try {
        val dir = context.filesDir
        val file = java.io.File(dir, "quick_add_queue.json")
        val lockFile = java.io.File(dir, "quick_add_queue.lock")
        java.io.FileOutputStream(lockFile).use { fos ->
          val lock = fos.channel.lock()
          try {
            val raw = if (file.exists()) file.readText() else "[]"
            file.writeText("[]")
            val arr = org.json.JSONArray(raw)
            val list = mutableListOf<Map<String, Any>>()
            for (i in 0 until arr.length()) {
              val o = arr.getJSONObject(i)
              list.add(mapOf(
                "amount" to o.getDouble("amount"),
                "note" to (o.optString("note", "")),
                "type" to o.getString("type"),
                "categoryId" to (o.optString("categoryId", "other")),
                "categoryName" to (o.optString("categoryName", "其他")),
                "source" to o.getString("source"),
                "timestamp" to o.getLong("timestamp"),
                "status" to (o.optString("status", "confirmed")),
                "expiredAt" to (if (o.has("expiredAt")) o.getLong("expiredAt") else 0L),
                "platform" to (o.optString("platform", ""))
              ))
            }
            Log.d("PayRecord", "Queue consumed: ${list.size} items")
            promise.resolve(list)
          } finally {
            lock.release()
          }
        }
        lockFile.delete()
      } catch (e: Exception) {
        Log.e("PayRecord", "Queue consume failed", e)
        promise.resolve(emptyList<Any>())
      }
    }
  }

  private fun registerNotificationReceiver() {
    val context = appContext.reactContext
    if (context == null) {
      Log.d("PayRecord", "receiver NOT registered: reactContext is null")
      return
    }
    if (receiver != null) return

    receiver = object : BroadcastReceiver() {
      override fun onReceive(ctx: Context, intent: Intent) {
        Log.d("PayRecord", "module received broadcast, sending to JS")
        sendEvent("onNotification", mapOf(
          "packageName" to (intent.getStringExtra("packageName") ?: ""),
          "title" to (intent.getStringExtra("title") ?: ""),
          "text" to (intent.getStringExtra("text") ?: ""),
          "timestamp" to intent.getLongExtra("timestamp", 0L)
        ))
      }
    }

    val filter = IntentFilter("com.payrecord.app.NOTIFICATION_RECEIVED")
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
      context.registerReceiver(receiver, filter, Context.RECEIVER_NOT_EXPORTED)
    } else {
      context.registerReceiver(receiver, filter)
    }
    Log.d("PayRecord", "receiver registered")
  }

  private fun unregisterNotificationReceiver() {
    val context = appContext.reactContext ?: return
    receiver?.let { context.unregisterReceiver(it) }
    receiver = null
  }
}
