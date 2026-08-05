package com.payrecord.app.notification

import android.content.Context
import android.content.SharedPreferences
import android.util.Log
import org.json.JSONObject

/**
 * 去重管理器：基于 SharedPreferences 存储，支持 UUID 去重 + TTL 自动清理。
 *
 * 存储结构（SharedPreferences "pay_dedup"）：
 *   key = "lucky_{单号}" 或 "trans_{单号}" 或 "lucky_combo_{md5}" 或 "trans_combo_{md5}"
 *   value = JSON { "amount": "200.00", "sender": "张三", "capturedAt": 1722152280000, "status": "captured" }
 */
object DedupManager {
    private const val TAG = "PayRecord"
    private const val PREFS_NAME = "pay_dedup"
    private const val KEY_AMOUNT = "amount"
    private const val KEY_SENDER = "sender"
    private const val KEY_CAPTURED_AT = "capturedAt"
    private const val KEY_STATUS = "status"

    private var prefs: SharedPreferences? = null

    fun init(context: Context) {
        if (prefs == null) {
            prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        }
    }

    private fun ensureInit(): SharedPreferences {
        val p = prefs
        if (p != null) return p
        throw IllegalStateException("DedupManager not initialized. Call init(context) first.")
    }

    // ---- 红包 ----

    fun isRedPacketProcessed(id: String): Boolean {
        return isProcessed("lucky_$id")
    }

    fun markRedPacketProcessed(id: String, amount: String = "", sender: String = "") {
        markProcessed("lucky_$id", amount, sender)
    }

    fun isRedPacketComboProcessed(comboKey: String): Boolean {
        return isProcessed(comboKey) // comboKey 已包含前缀
    }

    fun markRedPacketComboProcessed(comboKey: String, amount: String = "", sender: String = "") {
        markProcessed(comboKey, amount, sender)
    }

    // ---- 转账 ----

    fun isTransferProcessed(id: String): Boolean {
        return isProcessed("trans_$id")
    }

    fun markTransferProcessed(id: String, amount: String = "", sender: String = "") {
        markProcessed("trans_$id", amount, sender)
    }

    fun isTransferComboProcessed(comboKey: String): Boolean {
        return isProcessed(comboKey)
    }

    fun markTransferComboProcessed(comboKey: String, amount: String = "", sender: String = "") {
        markProcessed(comboKey, amount, sender)
    }

    // ---- 核心逻辑 ----

    private fun isProcessed(key: String): Boolean {
        val p = ensureInit()
        val raw = p.getString(key, null) ?: return false
        try {
            val json = JSONObject(raw)
            val capturedAt = json.optLong(KEY_CAPTURED_AT, 0)
            // TTL 检查：超过 7 天视为过期，删除并返回 false
            if (capturedAt > 0 && System.currentTimeMillis() - capturedAt > TimeWindowConfig.RECORD_TTL_MS) {
                p.edit().remove(key).apply()
                Log.d(TAG, "DedupManager: expired key removed: $key")
                return false
            }
            return true
        } catch (e: Exception) {
            Log.w(TAG, "DedupManager: corrupted entry for key=$key, removing", e)
            p.edit().remove(key).apply()
            return false
        }
    }

    private fun markProcessed(key: String, amount: String, sender: String) {
        val p = ensureInit()
        try {
            val json = JSONObject().apply {
                put(KEY_AMOUNT, amount)
                put(KEY_SENDER, sender)
                put(KEY_CAPTURED_AT, System.currentTimeMillis())
                put(KEY_STATUS, "captured")
            }
            p.edit().putString(key, json.toString()).apply()
            Log.d(TAG, "DedupManager: marked $key")
        } catch (e: Exception) {
            Log.w(TAG, "DedupManager: failed to mark $key", e)
        }
    }

    /**
     * 清理所有过期记录。建议在服务启动时调用。
     */
    fun cleanExpiredRecords() {
        val p = ensureInit()
        val now = System.currentTimeMillis()
        val editor = p.edit()
        var cleaned = 0
        for ((key, value) in p.all) {
            if (value !is String) continue
            try {
                val json = JSONObject(value)
                val capturedAt = json.optLong(KEY_CAPTURED_AT, 0)
                if (capturedAt > 0 && now - capturedAt > TimeWindowConfig.RECORD_TTL_MS) {
                    editor.remove(key)
                    cleaned++
                }
            } catch (_: Exception) {
                editor.remove(key)
                cleaned++
            }
        }
        if (cleaned > 0) {
            editor.apply()
            Log.d(TAG, "DedupManager: cleaned $cleaned expired records")
        }
    }
}
