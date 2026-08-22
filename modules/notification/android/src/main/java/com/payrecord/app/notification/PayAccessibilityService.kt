package com.payrecord.app.notification

import android.accessibilityservice.AccessibilityService
import android.util.Log
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo

/**
 * 监听微信内的支付/转账/红包页面，弹悬浮窗速记。
 * 简化版：不限时间，不防重，看到就弹。
 */
class PayAccessibilityService : AccessibilityService() {

  companion object {
    var isRunning = false
      private set
    private const val TAG = "PayRecord"
    private val successKeywords = listOf("支付成功", "转账成功", "支付完成")
    private val chatMarkers = listOf("转账给", "已转账", "微信转账", "发出红包")
    private val receiptMarkers = listOf("支付金额", "转账金额", "红包金额")
    private val transferWaitKeywords = listOf("等待对方确认", "等待对方领取", "等待确认收款")
    private val expiredRefundKeywords = listOf("已过期", "过期退款", "过期退回", "已退还", "过期未领取")
    private val amountRegex = Regex("""[¥￥]\s*(\d+(?:\.\d+)?)""")
    private val amountYuanRegex = Regex("""(\d+(?:\.\d{1,2})?)\s*元""")
    private const val DEDUP_WINDOW_MS = 60_000L
    private const val DEDUP_MAX = 20
  }

  // 支付流程状态
  private var sawPayDialogAt = 0L
  private var sawPasswordPageAt = 0L
  // 红包流程：看到 NewDetailUI 记录，返回时弹窗
  private var sawLuckyMoneyNewUIAt = 0L
  // 收款流程：看到 RemittanceDetailUI 记录，返回时弹窗
  private var sawRemittanceAt = 0L
  private var lastDebugAt = 0L

  // 简易去重（防止同一事件 60 秒内重复弹）
  private val recentFired = LinkedHashMap<String, Long>(8, 0.75f, false)

  override fun onServiceConnected() {
    isRunning = true
    DedupManager.init(this)
    DedupManager.cleanExpiredRecords()
    KeepAliveService.ensureRunning(this)
    Watchdog.schedule(this)
    Log.d(TAG, "PayAccessibilityService connected")
  }

  override fun onDestroy() {
    isRunning = false
    super.onDestroy()
    // 无障碍被系统解绑（划掉 App/进程被杀）时，安排看门狗快速恢复
    Watchdog.schedule(this, Watchdog.QUICK_RECOVERY_MS)
    Log.d(TAG, "PayAccessibilityService destroyed")
  }

  override fun onAccessibilityEvent(event: AccessibilityEvent?) {
    if (event == null) return
    if (event.packageName?.toString() != "com.tencent.mm") return
    val root = rootInActiveWindow ?: return
    try {
      val texts = mutableListOf<String>()
      collectTexts(root, texts, 0)
      val cls = event.className?.toString() ?: ""
      val now = System.currentTimeMillis()

      // 调试日志（限流 300ms）
      if (now - lastDebugAt > 300) {
        lastDebugAt = now
        writeDebug(event, listOf("texts=${texts.size}") + texts.take(8))
      }

      // ---- 支付流程跟踪 ----
      if (cls.contains("dialog") && texts.any { it.contains("微信支付") }) {
        sawPayDialogAt = now
      } else if (cls.contains("UIPageFragmentActivity") && now - sawPayDialogAt < 60_000) {
        sawPasswordPageAt = now
      } else if (cls.contains("LauncherUI") && sawPasswordPageAt > 0 && now - sawPasswordPageAt < 90_000) {
        sawPasswordPageAt = 0
        sawPayDialogAt = 0
        fireManual()
      }

      // ---- 转账等待确认页面 ----
      if (sawPasswordPageAt > 0 && texts.any { t -> transferWaitKeywords.any { t.contains(it) } }) {
        sawPasswordPageAt = 0
        sawPayDialogAt = 0
        val waitAmount = texts.firstNotNullOfOrNull { amountRegex.find(it)?.groupValues?.get(1)?.toDoubleOrNull() }
          ?: texts.firstNotNullOfOrNull { amountYuanRegex.find(it)?.groupValues?.get(1)?.toDoubleOrNull() }
        if (waitAmount != null) {
          fire(waitAmount, "转账等待确认")
        } else {
          fireManual()
        }
      }

      // ---- 红包领取检测 ----
      // 看到 LuckyMoneyNewDetailUI（红包详情页）就标记，返回时弹窗
      // 不限时间，已领取的再打开也弹；过期/退款详情页跳过，避免误弹
      if (cls.contains("LuckyMoneyNewDetailUI")) {
        if (texts.any { t -> expiredRefundKeywords.any { t.contains(it) } }) {
          sawLuckyMoneyNewUIAt = 0
          Log.d(TAG, "[RP] Expired/refund red packet detail, skip prompting")
        } else {
          sawLuckyMoneyNewUIAt = now
          Log.d(TAG, "[RP] LuckyMoneyNewDetailUI, will prompt on return")
        }
      }
      // 返回聊天/主界面 → 弹悬浮窗
      if ((cls.contains("ChattingMainUI") || cls.contains("LauncherUI")) && sawLuckyMoneyNewUIAt > 0 && sawPasswordPageAt == 0L && now - sawLuckyMoneyNewUIAt < 60_000) {
        val signature = "红包:${sawLuckyMoneyNewUIAt / 1000}"
        sawLuckyMoneyNewUIAt = 0
        if (!isDuplicate(signature) && !QuickAddOverlay.isShowing()) {
          Log.d(TAG, "[RP] Returned from red packet, prompting entry")
          QuickAddOverlay.show(this, "微信红包 领取红包", null)
        }
      }

      // ---- 收款检测 ----
      // 看到 RemittanceDetailUI（转账详情页）就标记，返回时弹窗
      // 不限时间，已收的再打开也弹；过期/退款详情页跳过，避免误弹
      if (cls.contains("RemittanceDetailUI")) {
        if (texts.any { t -> expiredRefundKeywords.any { t.contains(it) } }) {
          sawRemittanceAt = 0
          Log.d(TAG, "[RM] Expired/refund remittance detail, skip prompting")
        } else {
          sawRemittanceAt = now
          Log.d(TAG, "[RM] RemittanceDetailUI, will prompt on return")
        }
      }
      // 返回聊天/主界面 → 弹悬浮窗
      if ((cls.contains("ChattingMainUI") || cls.contains("LauncherUI")) && sawRemittanceAt > 0 && sawPasswordPageAt == 0L && now - sawRemittanceAt < 60_000) {
        val signature = "收款:${sawRemittanceAt / 1000}"
        sawRemittanceAt = 0
        if (!isDuplicate(signature) && !QuickAddOverlay.isShowing()) {
          Log.d(TAG, "[RM] Returned from remittance, prompting entry")
          QuickAddOverlay.show(this, "微信转账 收款", null)
        }
      }

      // ---- 直接文本识别 ----
      // 红包/转账过期退款的页面（或返回聊天后带有过期退款气泡）不弹任何速记
      if (texts.any { t -> expiredRefundKeywords.any { t.contains(it) } }) return

      val isSuccessPage = texts.any { t -> successKeywords.any { t.contains(it) } }
      val isChatBubble = texts.any { t -> chatMarkers.any { t.contains(it) } }
      val isReceipt = texts.any { t -> receiptMarkers.any { t.contains(it) } }
      if (!isSuccessPage && !isChatBubble && !isReceipt) return

      val amount = texts.firstNotNullOfOrNull { amountRegex.find(it)?.groupValues?.get(1)?.toDoubleOrNull() }
        ?: texts.firstNotNullOfOrNull { amountYuanRegex.find(it)?.groupValues?.get(1)?.toDoubleOrNull() }

      if (amount != null) {
        val source = when {
          isSuccessPage -> "支付成功"
          isChatBubble -> "微信转账/红包"
          else -> "微信支付回执"
        }
        fire(amount, source)
      }
    } finally {
      root.recycle()
    }
  }

  override fun onInterrupt() {}

  private fun writeDebug(event: AccessibilityEvent, texts: List<String>) {
    try {
      val f = java.io.File(filesDir, "pay_a11y_debug.log")
      if (f.length() > 128 * 1024) f.writeText("")
      val ts = java.text.SimpleDateFormat("MM-dd HH:mm:ss", java.util.Locale.CHINA).format(java.util.Date())
      val body = texts.joinToString(" | ").take(600)
      f.appendText("[$ts] type=${event.eventType} cls=${event.className} :: $body\n")
    } catch (_: Exception) {}
  }

  private fun collectTexts(node: AccessibilityNodeInfo, out: MutableList<String>, depth: Int) {
    if (depth > 15 || out.size > 300) return
    node.text?.toString()?.takeIf { it.isNotBlank() }?.let { out.add(it) }
    for (i in 0 until node.childCount) {
      val child = node.getChild(i) ?: continue
      try {
        collectTexts(child, out, depth + 1)
      } finally {
        child.recycle()
      }
    }
  }

  private fun isDuplicate(signature: String): Boolean {
    val now = System.currentTimeMillis()
    val lastTime = recentFired[signature]
    if (lastTime != null && now - lastTime < DEDUP_WINDOW_MS) return true
    if (recentFired.size >= DEDUP_MAX) {
      val iter = recentFired.entries.iterator()
      while (iter.hasNext()) {
        if (now - iter.next().value > DEDUP_WINDOW_MS) iter.remove() else break
      }
    }
    recentFired[signature] = now
    return false
  }

  private fun fire(amount: Double, source: String) {
    val signature = "$source:$amount"
    if (isDuplicate(signature)) return
    if (QuickAddOverlay.isShowing()) return
    Log.d(TAG, "WeChat in-app payment detected ($source): ¥$amount")
    QuickAddOverlay.show(this, "微信支付 $source ¥${String.format("%.2f", amount)}", amount)
  }

  private fun fireManual() {
    if (QuickAddOverlay.isShowing()) return
    Log.d(TAG, "WeChat in-app payment flow detected (amount unreadable), prompting manual entry")
    QuickAddOverlay.show(this, "微信支付 微信内支付", null)
  }
}
