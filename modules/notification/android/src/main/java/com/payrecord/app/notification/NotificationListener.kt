package com.payrecord.app.notification

import android.app.ActivityManager
import android.content.Context
import android.content.Intent
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import android.util.Log

class NotificationListener : NotificationListenerService() {

  companion object {
    var isRunning = false
      private set
    private const val TAG = "PayRecord"
  }

  private val monitoredPackages = setOf(
    "com.eg.android.AlipayGphone",   // 支付宝
    "com.tencent.mm",                 // 微信
    "com.unionpay",                   // 云闪付
    "com.sankuai.meituan",            // 美团
    "me.ele",                         // 饿了么
    "com.taobao.taobao",              // 淘宝
    "com.icbc",                       // 工商银行
    "com.android.bankabc",            // 农业银行
    "com.cmbchina.ccd.pluto.cmbActivity", // 招商银行
  )

  private val paymentKeywords = listOf("付款", "支付", "收款", "到账", "转账", "红包", "消费", "支出", "转出", "扣款", "汇款", "取款", "存入")
  private val ignoreKeywords = listOf("发起", "处理中", "充值成功", "到账提醒", "话费", "流量", "缴费成功", "自动充值", "余额", "已确认收款", "对方已收款", "对方已确认", "已被接收", "已被领取", "优惠券到期", "券即将过期", "卡包", "还款日", "账单日", "待还款", "还款提醒", "信用卡", "额度", "积分")

  // 这些 App 的"红包"是营销/优惠券活动，不是真实资金变动，屏蔽以免误弹悬浮窗
  private val redPacketIgnorePackages = setOf(
    "com.sankuai.meituan",            // 美团
    "me.ele",                         // 饿了么
    "com.taobao.taobao",              // 淘宝
    "com.jingdong.app.mall",          // 京东
    "com.eg.android.AlipayGphone",    // 支付宝
  )

  override fun onCreate() {
    super.onCreate()
    isRunning = true
    KeepAliveService.ensureRunning(this)
    Log.d(TAG, "NotificationListener started")
  }

  override fun onDestroy() {
    isRunning = false
    super.onDestroy()
    Log.d(TAG, "NotificationListener stopped")
  }

  override fun onNotificationPosted(sbn: StatusBarNotification) {
    val packageName = sbn.packageName
    if (packageName !in monitoredPackages) return

    val extras = sbn.notification.extras
    val title = extras.getCharSequence("android.title")?.toString() ?: ""
    // 优先使用大文本（展开通知的完整内容），避免合并通知摘要截断金额
    var text = extras.getCharSequence("android.bigText")?.toString()
      ?: extras.getCharSequence("android.text")?.toString()
      ?: ""
    // 如果 text 仍被截断（合并通知摘要），尝试从 textLines 拼接完整内容
    if (text.isNotBlank()) {
      val textLines = extras.getCharSequenceArray("android.textLines")
      if (textLines != null && textLines.isNotEmpty()) {
        // 找到包含金额的完整行
        val fullLine = textLines.lastOrNull { line ->
          val l = line.toString()
          l.contains("支付") || l.contains("付款") || l.contains("收款") || l.contains("转账") || l.contains("红包")
        }
        if (fullLine != null && fullLine.length > text.length) {
          text = fullLine.toString()
        }
      }
    }
    if (text.isBlank()) return

    val content = "$title $text"
    if (!paymentKeywords.any { content.contains(it) }) return
    if (ignoreKeywords.any { content.contains(it) }) return

    // 提前解析金额（红包/转账兜底逻辑需要）
    val parsedAmount = parseAmountFromText(text)

    // 红包通知：微信收到红包通知时金额可能为空（"收到红包"），仍然弹窗让用户填写
    // 无障碍服务在华为等手机上容易被杀，通知监听层也要兜底
    if (content.contains("红包") && packageName == "com.tencent.mm") {
      if (parsedAmount != null) {
        Log.d(TAG, "WeChat red packet with amount: ¥$parsedAmount")
      } else {
        Log.d(TAG, "WeChat red packet (amount unknown), prompting entry: $content")
      }
      // 不 return，继续走正常弹窗流程
    } else if (content.contains("红包") && packageName in redPacketIgnorePackages) {
      Log.d(TAG, "Ignored marketing red-packet notification: $content")
      return
    } else if (content.contains("红包") && parsedAmount == null) {
      Log.d(TAG, "Red packet notification (amount unknown, non-WeChat), ignored: $content")
      return
    }

    // 转账收款通知：保留弹窗，让用户确认金额
    // 之前直接忽略是假设无障碍服务会兜底，但华为等手机容易杀无障碍
    if (content.contains("转账") && content.contains("收款")) {
      Log.d(TAG, "Transfer receive notification, showing overlay for confirmation: $content")
      // 不 return，继续走正常弹窗流程
    }

    Log.d(TAG, "Payment notification captured: $content")

    // 如果源文本中的金额被截断（如 "已支付¥3" 实际金额 3.99），用 parsedAmount 补全显示
    val displayText = if (parsedAmount != null && parsedAmount != parsedAmount.toInt().toDouble()) {
      // 金额有小数部分，检查源文本是否截断
      val truncatedRegex = Regex("""[￥¥]\s*(\d+)(?!\.\d)""")
      val truncatedMatch = truncatedRegex.find(content)
      if (truncatedMatch != null) {
        val truncatedVal = truncatedMatch.groupValues[1].toDoubleOrNull()
        if (truncatedVal != null && parsedAmount.toString().startsWith(truncatedVal.toInt().toString())) {
          content.replace(truncatedMatch.value, "¥${String.format("%.2f", parsedAmount)}")
        } else content
      } else content
    } else content

    if (isAppInForeground()) {
      // 前台：交给 JS 层的 ConfirmSheet 弹窗（广播给原生模块转发）
      val broadcast = Intent("com.payrecord.app.NOTIFICATION_RECEIVED").apply {
        putExtra("packageName", packageName)
        putExtra("title", title)
        putExtra("text", text)
        putExtra("timestamp", sbn.postTime)
        // 用动态包名：debug 包有 .dev 后缀，硬编码会导致广播投错包
        setPackage(packageName)
      }
      sendBroadcast(broadcast)
    } else {
      // 后台：直接弹悬浮窗速记（无需切回 App）
      QuickAddOverlay.show(this, displayText, parsedAmount)
    }
  }

  /** 通过进程重要性判断本 App 是否在前台，避免前台时悬浮窗和 JS 弹窗重复弹出 */
  private fun isAppInForeground(): Boolean {
    return try {
      val am = getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager
      am.runningAppProcesses?.any {
        it.processName == packageName &&
          it.importance == ActivityManager.RunningAppProcessInfo.IMPORTANCE_FOREGROUND
      } == true
    } catch (e: Exception) {
      false
    }
  }

  private fun parseAmountFromText(text: String): Double? {
    // 优先匹配 ￥¥ 符号后的金额（如 "已支付￥6.89"）
    val symbolRegex = Regex("""[￥¥]\s*(\d[\d,]*\.?\d*)""")
    val symbolMatch = symbolRegex.find(text)
    if (symbolMatch != null) {
      return symbolMatch.groupValues[1].replace(",", "").toDoubleOrNull()
    }
    // 兜底匹配 "元" / "块钱" 结尾
    val regex = Regex("""(\d[\d,]*\.?\d*)\s*(?:元|块钱)""")
    val match = regex.find(text) ?: return null
    return match.groupValues[1].replace(",", "").toDoubleOrNull()
  }

  override fun onNotificationRemoved(sbn: StatusBarNotification) {}
}
