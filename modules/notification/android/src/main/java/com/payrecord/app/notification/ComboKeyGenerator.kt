package com.payrecord.app.notification

import java.security.MessageDigest

/**
 * 组合 Key 生成器：当单号抓取失败时，用发送人+金额+时间生成唯一 Key。
 */
object ComboKeyGenerator {
    private val amountRegex = Regex("""[¥￥]\s*(\d+(?:\.\d+)?)""")
    private val amountYuanRegex = Regex("""(\d+(?:\.\d{1,2})?)\s*元""")
    private val timeRegex = Regex("""(\d{1,2}:\d{2})""")

    /**
     * 生成红包组合 Key。
     * @param texts 页面所有文本
     * @param prefix 前缀，如 "red"
     * @return MD5 哈希后的组合 Key，或 null（信息不足时）
     */
    fun generateRedPacketComboKey(texts: List<String>): String? {
        return generateComboKey(texts, "red")
    }

    /**
     * 生成转账组合 Key。
     */
    fun generateTransferComboKey(texts: List<String>): String? {
        return generateComboKey(texts, "trans")
    }

    private fun generateComboKey(texts: List<String>, prefix: String): String? {
        // 提取金额
        val amount = texts.firstNotNullOfOrNull { amountRegex.find(it)?.groupValues?.get(1) }
            ?: texts.firstNotNullOfOrNull { amountYuanRegex.find(it)?.groupValues?.get(1) }
            ?: return null // 没有金额无法生成

        // 提取时间（精确到分钟）
        val time = texts.firstNotNullOfOrNull { timeRegex.find(it)?.groupValues?.get(1) } ?: "unknown"

        // 提取发送人：取第一个非金额、非时间、非关键词的短文本（通常是昵称）
        val sender = texts.firstOrNull {
            it.length in 2..20 &&
            !it.contains("微信") &&
            !it.contains("红包") &&
            !it.contains("转账") &&
            amountRegex.find(it) == null &&
            amountYuanRegex.find(it) == null
        } ?: "unknown"

        val raw = "${prefix}_${sender}_${amount}_${time}"
        return "${prefix}_combo_${md5(raw)}"
    }

    private fun md5(input: String): String {
        val digest = MessageDigest.getInstance("MD5")
        val bytes = digest.digest(input.toByteArray(Charsets.UTF_8))
        return bytes.joinToString("") { "%02x".format(it) }
    }
}
