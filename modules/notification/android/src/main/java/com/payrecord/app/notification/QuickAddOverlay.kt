package com.payrecord.app.notification

import android.annotation.SuppressLint
import android.content.Context
import android.graphics.Color
import android.graphics.PixelFormat
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.os.Build
import android.text.InputType
import android.util.TypedValue
import android.view.Gravity
import android.view.KeyEvent
import android.view.MotionEvent
import android.view.View
import android.view.WindowManager
import android.widget.EditText
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import android.widget.Toast
import org.json.JSONArray
import org.json.JSONObject

object QuickAddOverlay {

  private var showing = false
  // 安全网：如果 showing=true 但 overlay 实际已被系统回收（如微信回前台时系统杀 overlay），
  // 超过此时间强制重置，避免后续 show() 永远被挡住
  private var shownAt = 0L
  private const val SHOW_TIMEOUT_MS = 120_000L // 2 分钟

  private val categories = listOf(
    Pair("🍔", "餐饮") to "food",
    Pair("🚗", "交通") to "transport",
    Pair("🛍️", "购物") to "shopping",
    Pair("🎮", "娱乐") to "entertainment",
    Pair("🏠", "住房") to "housing",
    Pair("💊", "医疗") to "medical",
    Pair("📚", "教育") to "education",
    Pair("🎁", "人情") to "social",
    Pair("✏️", "其他") to "other",
  )

  private val incomeCategories = listOf(
    Pair("💼", "工资") to "salary",
    Pair("🧧", "红包") to "redpacket",
    Pair("💸", "转账") to "transfer",
    Pair("🛠️", "兼职") to "parttime",
    Pair("📈", "理财") to "invest",
    Pair("✏️", "其他") to "other",
  )

  private val incomeCategoryColors = listOf(
    "#E8F5E9", "#FFF0F0", "#E3F2FD", "#FFF3E0", "#F3E5F5", "#F5F5F5",
  )

  private val incomeSelectedBorderColors = listOf(
    "#4CAF50", "#F44336", "#2196F3", "#FF9800", "#9C27B0", "#9E9E9E",
  )

  private val categoryColors = listOf(
    "#FFF0F0", "#E8F5E9", "#FCE4EC", "#F3E5F5",
    "#FFF3E0", "#FFEBEE", "#E3F2FD", "#FCE4EC", "#F5F5F5",
  )

  private val selectedBorderColors = listOf(
    "#FF6B6B", "#4CAF50", "#E91E63", "#9C27B0",
    "#FF9800", "#F44336", "#2196F3", "#E91E63", "#9E9E9E",
  )

  fun canShow(context: Context): Boolean =
    Build.VERSION.SDK_INT < 23 || android.provider.Settings.canDrawOverlays(context)

  fun isShowing(): Boolean {
    // 超时安全网
    if (showing && System.currentTimeMillis() - shownAt > SHOW_TIMEOUT_MS) {
      android.util.Log.w("PayRecord", "QuickAddOverlay showing stuck for >2min, force reset")
      showing = false
    }
    return showing
  }

  @SuppressLint("ClickableViewAccessibility")
  fun show(context: Context, sourceText: String, parsedAmount: Double? = null) {
    // 超时安全网：showing 卡 true 超过 2 分钟强制重置
    if (showing && System.currentTimeMillis() - shownAt > SHOW_TIMEOUT_MS) {
      android.util.Log.w("PayRecord", "QuickAddOverlay showing stuck for >2min, force reset")
      showing = false
    }
    if (showing) return
    if (!canShow(context)) return

    val wm = context.getSystemService(Context.WINDOW_SERVICE) as WindowManager
    val overlayType = if (Build.VERSION.SDK_INT >= 26)
      WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
    else @Suppress("DEPRECATION") WindowManager.LayoutParams.TYPE_PHONE

    // 注意：不能用 FLAG_NOT_FOCUSABLE，否则 EditText 无法获取焦点、键盘永远弹不出来。
    // 用可聚焦窗口 + ADJUST_RESIZE，键盘弹出时卡片会被顶到键盘上方。
    val containerParams = WindowManager.LayoutParams(
      WindowManager.LayoutParams.MATCH_PARENT,
      WindowManager.LayoutParams.MATCH_PARENT,
      overlayType,
      0,
      PixelFormat.TRANSLUCENT
    ).apply {
      dimAmount = 0f  // We handle dim ourselves
      softInputMode = WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE or
        WindowManager.LayoutParams.SOFT_INPUT_STATE_HIDDEN
    }

    val dp = { v: Int -> TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, v.toFloat(), context.resources.displayMetrics).toInt() }

    // 横屏时限制卡片宽度/高度：避免铺满整个屏幕，四周留出可点击关闭的区域
    val dm = context.resources.displayMetrics
    val isLandscape = dm.widthPixels > dm.heightPixels
    val cardWidthPx = if (isLandscape) minOf((dm.widthPixels * 0.55).toInt(), dp(560)) else dm.widthPixels
    val maxCardHeightPx = (dm.heightPixels * 0.88).toInt()

    // Outer container (full screen, semi-transparent black)
    val outerContainer = FrameLayout(context).apply {
      setBackgroundColor(Color.parseColor("#80000000"))
    }

    // Inner card (bottom sheet)
    val card = LinearLayout(context).apply {
      orientation = LinearLayout.VERTICAL
      setBackgroundColor(Color.WHITE)
      setPadding(dp(20), 0, dp(20), dp(28))
    }
    val cardBg = GradientDrawable().apply {
      setColor(Color.WHITE)
      cornerRadii = floatArrayOf(dp(20).toFloat(), dp(20).toFloat(), dp(20).toFloat(), dp(20).toFloat(), 0f, 0f, 0f, 0f)
    }
    card.background = cardBg

    // ---- Card content ----

    // 顶部拖拽区（把手 + 标题）：按住下拉可关闭整个悬浮窗
    val dragZone = LinearLayout(context).apply {
      orientation = LinearLayout.VERTICAL
      setPadding(0, dp(12), 0, dp(8))
    }
    val handleBar = View(context).apply { setBackgroundColor(Color.parseColor("#E0E0E0")) }
    dragZone.addView(handleBar, LinearLayout.LayoutParams(dp(36), dp(4)).apply { gravity = Gravity.CENTER_HORIZONTAL })

    val tvTitle = TextView(context).apply {
      text = "确认这笔支出"
      setTextSize(TypedValue.COMPLEX_UNIT_SP, 17f)
      setTypeface(null, Typeface.BOLD)
      setTextColor(Color.parseColor("#1A1A1A"))
      gravity = Gravity.CENTER
    }
    dragZone.addView(tvTitle, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT).apply { topMargin = dp(10) })
    card.addView(dragZone, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT).apply { bottomMargin = dp(4) })

    // Amount row
    val amountRow = LinearLayout(context).apply { orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER }
    val tvCurrency = TextView(context).apply {
      text = "¥"
      setTextSize(TypedValue.COMPLEX_UNIT_SP, 34f)
      setTypeface(null, Typeface.BOLD)
      setTextColor(Color.parseColor("#1A1A1A"))
    }
    amountRow.addView(tvCurrency)

    val etAmount = EditText(context).apply {
      hint = "0.00"
      setTextSize(TypedValue.COMPLEX_UNIT_SP, 38f)
      setTypeface(null, Typeface.BOLD)
      inputType = InputType.TYPE_CLASS_NUMBER or InputType.TYPE_NUMBER_FLAG_DECIMAL
      setTextColor(Color.parseColor("#1A1A1A"))
      setHintTextColor(Color.parseColor("#CCCCCC"))
      setBackgroundColor(Color.TRANSPARENT)
      minWidth = dp(140)
      if (parsedAmount != null && parsedAmount > 0) setText(String.format("%.2f", parsedAmount))
    }
    amountRow.addView(etAmount)
    card.addView(amountRow, LinearLayout.LayoutParams(LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT).apply { gravity = Gravity.CENTER; topMargin = dp(4) })

    // Source info
    val infoRow = LinearLayout(context).apply { orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER_VERTICAL }
    val sourceLeft = LinearLayout(context).apply { orientation = LinearLayout.VERTICAL; layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f) }
    sourceLeft.addView(TextView(context).apply {
      text = sourceText.take(20)
      setTextSize(TypedValue.COMPLEX_UNIT_SP, 13f)
      setTextColor(Color.parseColor("#666666"))
      maxLines = 1; ellipsize = android.text.TextUtils.TruncateAt.END
    })
    sourceLeft.addView(TextView(context).apply {
      text = extractAppName(sourceText)
      setTextSize(TypedValue.COMPLEX_UNIT_SP, 11f)
      setTextColor(Color.parseColor("#999999"))
    })
    infoRow.addView(sourceLeft)
    infoRow.addView(TextView(context).apply {
      val sdf = java.text.SimpleDateFormat("M月d日 HH:mm", java.util.Locale.CHINA)
      text = sdf.format(java.util.Date())
      setTextSize(TypedValue.COMPLEX_UNIT_SP, 13f)
      setTextColor(Color.parseColor("#999999"))
    })
    card.addView(infoRow, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT).apply { topMargin = dp(8); bottomMargin = dp(12) })

    // Divider
    card.addView(View(context).apply { setBackgroundColor(Color.parseColor("#F0F0F0")) }, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, dp(1)).apply { bottomMargin = dp(12) })

    // 支出/收入切换
    var recordType = if (sourceText.contains("红包") || sourceText.contains("领取红包") || sourceText.contains("收款")) "income" else "expense"
    var selectedCategoryId = when {
      sourceText.contains("红包") || sourceText.contains("领取红包") -> "redpacket"
      sourceText.contains("转账") || sourceText.contains("收款") -> "transfer"
      else -> "food"
    }
    var rebuildGridRef: (() -> Unit)? = null

    val btnExpense = TextView(context).apply {
      text = "支出"; setTextSize(TypedValue.COMPLEX_UNIT_SP, 14f)
      gravity = Gravity.CENTER; setPadding(0, dp(8), 0, dp(8)); setTypeface(null, Typeface.BOLD)
    }
    val btnIncome = TextView(context).apply {
      text = "收入"; setTextSize(TypedValue.COMPLEX_UNIT_SP, 14f)
      gravity = Gravity.CENTER; setPadding(0, dp(8), 0, dp(8)); setTypeface(null, Typeface.BOLD)
    }
    fun refreshTypeToggle() {
      val exp = recordType == "expense"
      btnExpense.background = GradientDrawable().apply {
        setColor(if (exp) Color.parseColor("#4A90D9") else Color.TRANSPARENT); cornerRadius = dp(8).toFloat()
      }
      btnExpense.setTextColor(if (exp) Color.WHITE else Color.parseColor("#666666"))
      btnIncome.background = GradientDrawable().apply {
        setColor(if (!exp) Color.parseColor("#4CAF50") else Color.TRANSPARENT); cornerRadius = dp(8).toFloat()
      }
      btnIncome.setTextColor(if (!exp) Color.WHITE else Color.parseColor("#666666"))
      tvTitle.text = if (exp) "确认这笔支出" else "确认这笔收入"
    }
    val typeRow = LinearLayout(context).apply {
      orientation = LinearLayout.HORIZONTAL
      background = GradientDrawable().apply { setColor(Color.parseColor("#F5F5F5")); cornerRadius = dp(10).toFloat() }
      setPadding(dp(3), dp(3), dp(3), dp(3))
    }
    typeRow.addView(btnExpense, LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f))
    typeRow.addView(btnIncome, LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f))
    btnExpense.setOnClickListener {
      if (recordType != "expense") { recordType = "expense"; selectedCategoryId = "food"; refreshTypeToggle(); rebuildGridRef?.invoke() }
    }
    btnIncome.setOnClickListener {
      if (recordType != "income") { recordType = "income"; selectedCategoryId = "redpacket"; refreshTypeToggle(); rebuildGridRef?.invoke() }
    }
    card.addView(typeRow, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT).apply { bottomMargin = dp(12) })
    refreshTypeToggle()

    // "选择分类"
    card.addView(TextView(context).apply {
      text = "选择分类"
      setTextSize(TypedValue.COMPLEX_UNIT_SP, 14f)
      setTypeface(null, Typeface.BOLD)
      setTextColor(Color.parseColor("#1A1A1A"))
    }, LinearLayout.LayoutParams(LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT).apply { bottomMargin = dp(8) })

    // Category grid（随支出/收入切换而重建）
    val gridContainer = LinearLayout(context).apply { orientation = LinearLayout.VERTICAL }

    fun buildGrid() {
      val list = if (recordType == "income") incomeCategories else categories
      val colors = if (recordType == "income") incomeCategoryColors else categoryColors
      val borders = if (recordType == "income") incomeSelectedBorderColors else selectedBorderColors
      gridContainer.removeAllViews()
      var row: LinearLayout? = null
      list.forEachIndexed { index, (emojiName, catId) ->
        if (index % 4 == 0) {
          row = LinearLayout(context).apply { orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER }
          gridContainer.addView(row!!, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT).apply { bottomMargin = dp(8) })
        }
        val (emoji, name) = emojiName
        val isSelected = catId == selectedCategoryId
        val catCard = LinearLayout(context).apply {
          orientation = LinearLayout.VERTICAL; gravity = Gravity.CENTER
          setPadding(dp(8), dp(8), dp(8), dp(6))
          background = GradientDrawable().apply {
            setColor(Color.parseColor(if (isSelected) colors[index] else "#FAFAFA"))
            cornerRadius = dp(12).toFloat()
            setStroke(if (isSelected) dp(2) else dp(1), Color.parseColor(if (isSelected) borders[index] else "#EEEEEE"))
          }
        }
        catCard.addView(TextView(context).apply { text = emoji; setTextSize(TypedValue.COMPLEX_UNIT_SP, 22f) })
        catCard.addView(TextView(context).apply {
          text = name; setTextSize(TypedValue.COMPLEX_UNIT_SP, 11f)
          setTextColor(Color.parseColor(if (isSelected) borders[index] else "#666666"))
        }, LinearLayout.LayoutParams(LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT).apply { topMargin = dp(2) })

        catCard.setOnClickListener { selectedCategoryId = catId; buildGrid() }
        val itemWidth = (cardWidthPx - dp(40) - dp(24)) / 4
        row!!.addView(catCard, LinearLayout.LayoutParams(itemWidth, LinearLayout.LayoutParams.WRAP_CONTENT).apply { if (index % 4 != 0) leftMargin = dp(8) })
      }
    }
    buildGrid()
    rebuildGridRef = { buildGrid() }
    card.addView(gridContainer)

    // Note
    val etNote = EditText(context).apply {
      hint = "备注（可选）"
      setTextSize(TypedValue.COMPLEX_UNIT_SP, 14f)
      setTextColor(Color.parseColor("#1A1A1A"))
      setHintTextColor(Color.parseColor("#BBBBBB"))
      setPadding(dp(12), dp(10), dp(12), dp(10))
      background = GradientDrawable().apply { setColor(Color.parseColor("#F5F5F5")); cornerRadius = dp(8).toFloat() }
    }
    card.addView(etNote, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT).apply { topMargin = dp(12); bottomMargin = dp(16) })

    // Save button only (no cancel button)
    val btnSave = TextView(context).apply {
      text = "保存"
      setTextSize(TypedValue.COMPLEX_UNIT_SP, 16f)
      setTextColor(Color.WHITE)
      gravity = Gravity.CENTER
      setPadding(0, dp(12), 0, dp(12))
      background = GradientDrawable().apply { setColor(Color.parseColor("#4A90D9")); cornerRadius = dp(12).toFloat() }
    }
    card.addView(btnSave, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT))

    // Put card at bottom of container
    // 横屏（或键盘弹出）时卡片可能比屏幕高，包一层 ScrollView 保证保存按钮/备注可滚动到；
    // 横屏下再限制高度上限（88% 屏高），顶部留出可点击关闭的区域
    val cardScroll = object : ScrollView(context) {
      override fun onMeasure(widthMeasureSpec: Int, heightMeasureSpec: Int) {
        val hSpec = if (isLandscape)
          View.MeasureSpec.makeMeasureSpec(maxCardHeightPx, View.MeasureSpec.AT_MOST)
        else heightMeasureSpec
        super.onMeasure(widthMeasureSpec, hSpec)
      }
    }.apply {
      isVerticalScrollBarEnabled = false
    }
    cardScroll.addView(card, FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.WRAP_CONTENT))
    val cardParams = FrameLayout.LayoutParams(
      if (isLandscape) cardWidthPx else FrameLayout.LayoutParams.MATCH_PARENT,
      FrameLayout.LayoutParams.WRAP_CONTENT
    ).apply {
      gravity = Gravity.BOTTOM or Gravity.CENTER_HORIZONTAL
    }
    outerContainer.addView(cardScroll, cardParams)

    // ---- Dismiss logic ----
    fun dismiss() {
      try { wm.removeView(outerContainer) } catch (_: Exception) {}
      showing = false
    }

    // Tap outside card → dismiss
    outerContainer.setOnTouchListener { _, event ->
      if (event.action == MotionEvent.ACTION_DOWN) {
        val x = event.rawX.toInt()
        val y = event.rawY.toInt()
        val cardLoc = IntArray(2)
        cardScroll.getLocationOnScreen(cardLoc)
        val inCard = x >= cardLoc[0] && x <= cardLoc[0] + cardScroll.width &&
                     y >= cardLoc[1] && y <= cardLoc[1] + cardScroll.height
        if (!inCard) { dismiss(); return@setOnTouchListener true }
      }
      false
    }

    // Back 键 → dismiss（可聚焦窗口会收到按键事件）
    outerContainer.isFocusableInTouchMode = true
    outerContainer.setOnKeyListener { _, keyCode, event ->
      if (keyCode == KeyEvent.KEYCODE_BACK && event.action == KeyEvent.ACTION_UP) {
        dismiss(); true
      } else false
    }

    // 顶部拖拽区下拉 → 卡片跟随手指，松手超过阈值关闭，否则回弹
    var dragStartY = 0f
    var dragging = false
    dragZone.setOnTouchListener { _, event ->
      when (event.action) {
        MotionEvent.ACTION_DOWN -> { dragStartY = event.rawY; dragging = false; true }
        MotionEvent.ACTION_MOVE -> {
          val dy = event.rawY - dragStartY
          if (dy > dp(6)) dragging = true
          if (dragging) cardScroll.translationY = dy.coerceAtLeast(0f)
          true
        }
        MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> {
          if (cardScroll.translationY > dp(100)) {
            dismiss()
          } else {
            cardScroll.animate().translationY(0f).setDuration(150).start()
          }
          dragging = false
          true
        }
        else -> false
      }
    }

    // Save
    btnSave.setOnClickListener {
      val amountText = etAmount.text.toString().trim()
      val amount = amountText.toDoubleOrNull()
      if (amount == null || amount <= 0) {
        Toast.makeText(context, "请输入金额", Toast.LENGTH_SHORT).show()
        return@setOnClickListener
      }
      val note = etNote.text.toString().trim()
      val activeList = if (recordType == "income") incomeCategories else categories
      val catName = activeList.find { it.second == selectedCategoryId }?.first?.second ?: "其他"

      // Save to file (cross-process accessible, unlike SharedPreferences)
      try {
        val dir = context.filesDir
        val file = java.io.File(dir, "quick_add_queue.json")
        val lockFile = java.io.File(dir, "quick_add_queue.lock")
        // Use file lock to prevent race conditions across threads/processes
        java.io.FileOutputStream(lockFile).use { fos ->
          val lock = fos.channel.lock()
          try {
            val queue = if (file.exists()) JSONArray(file.readText()) else JSONArray()
            queue.put(JSONObject().apply {
              put("amount", amount)
              put("note", note)
              put("type", recordType)
              put("categoryId", selectedCategoryId)
              put("categoryName", catName)
              put("source", sourceText)
              put("timestamp", System.currentTimeMillis())
              // 发红包/转账时记为 pending，24h 后过期；收款/领红包记为 confirmed
              val isPending = recordType == "expense" && (sourceText.contains("红包") || sourceText.contains("转账"))
              put("status", if (isPending) "pending" else "confirmed")
              if (isPending) {
                put("expiredAt", System.currentTimeMillis() + 24 * 60 * 60 * 1000)
              }
              put("platform", "wechat")
            })
            file.writeText(queue.toString())
            android.util.Log.d("PayRecord", "Queue saved: ${queue.length()} items")
          } finally {
            lock.release()
          }
        }
        lockFile.delete()
      } catch (e: Exception) {
        android.util.Log.e("PayRecord", "Failed to save queue", e)
      }

      Toast.makeText(context, "已速记 ¥${String.format("%.2f", amount)}", Toast.LENGTH_SHORT).show()
      dismiss()
    }

    try {
      wm.addView(outerContainer, containerParams)
      showing = true
      shownAt = System.currentTimeMillis()
      outerContainer.requestFocus()
    } catch (e: Exception) {
      android.util.Log.e("PayRecord", "Failed to add overlay view", e)
      showing = false
    }
  }

  private fun extractAppName(text: String): String = when {
    text.contains("微信") -> "微信支付"
    text.contains("支付宝") -> "支付宝"
    text.contains("云闪付") -> "云闪付"
    text.contains("美团") -> "美团"
    text.contains("饿了么") -> "饿了么"
    text.contains("工商") -> "工商银行"
    text.contains("农业") -> "农业银行"
    text.contains("招商") -> "招商银行"
    else -> "其他来源"
  }
}
