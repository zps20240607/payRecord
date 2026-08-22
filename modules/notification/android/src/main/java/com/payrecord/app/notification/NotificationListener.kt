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
    Watchdog.schedule(this)
    Log.d(TAG, "NotificationListener started")
  }

  override fun onDestroy() {
    isRunning = false
    super.onDestroy()
    // 被系统回收时尽快安排一轮自愈检查，避免要等用户手动打开 App
    Watchdog.schedule(this, Watchdog.QUICK_RECOVERY_MS)
    Log.d(TAG, "NotificationListener stopped")
  }

  override fun onNotificationPosted(sbn: StatusBarNotification) {
    val sourcePackage = sbn.packageName
    if (sourcePackage !in monitoredPackages) return

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

    // 微信的红包/转账通知（含过期退款）统一交给无障碍服务处理：
    // 未领取/未确认之前通知里没有金额，这里弹窗既拿不到金额，
    // 又会在无障碍「红包/转账详情页 → 返回聊天」时重复弹一次。
    val wechatExpiredRefund = content.contains("过期") &&
      (content.contains("退款") || content.contains("退回") || content.contains("退还"))
    if (sourcePackage == "com.tencent.mm" &&
      (content.contains("红包") || content.contains("转账") || wechatExpiredRefund)
    ) {
      Log.d(TAG, "WeChat red packet/transfer (or expired refund) handled by accessibility, ignore notification: $content")
      return
    }

    // 其他 App 的"红包"：营销类直接屏蔽；拿不到金额的也屏蔽，避免误弹悬浮窗
    if (content.contains("红包")) {
      if (sourcePackage in redPacketIgnorePackages) {
        Log.d(TAG, "Ignored marketing red-packet notification: $content")
        return
      }
      if (parseAmountFromText(text) == null) {
        Log.d(TAG, "Red packet notification (amount unknown), ignored: $content")
        return
      }
    }

    val parsedAmount = parseAmountFromText(text)

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
        putExtra("packageName", sourcePackage)
        putExtra("title", title)
        putExtra("text", text)
        putExtra("timestamp", sbn.postTime)
        // 广播必须投给本 App 自己的包名（release 为 com.payrecord.app、debug 为 .dev 后缀），
        // 之前误写成 sourcePackage，导致前台通知永远投给了微信/支付宝，JS 层收不到、弹不出确认面板
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
