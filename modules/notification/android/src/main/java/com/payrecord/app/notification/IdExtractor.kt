package com.payrecord.app.notification

import android.view.accessibility.AccessibilityNodeInfo
import android.util.Log

/**
 * 从微信无障碍节点树中提取红包/转账的唯一标识（单号）。
 * 若单号抓取失败，退回组合 Key 方案。
 */
object IdExtractor {
    private const val TAG = "PayRecord"

    // ---- 红包单号 ----
    // 微信不同版本可能显示为"单号"、"红包单号"、"交易单号"、"账单号"
    private val redPacketIdLabels = listOf("单号", "红包单号", "交易单号", "账单号")
    // 单号通常为 20~30 位纯数字
    private val idRegex = Regex("""(\d{18,32})""")

    /**
     * 从红包详情页节点树中提取单号。
     * @return 单号字符串，或 null
     */
    fun extractRedPacketId(root: AccessibilityNodeInfo): String? {
        return extractIdFromLabels(root, redPacketIdLabels)
    }

    // ---- 转账单号 ----
    private val transferIdLabels = listOf("转账单号", "商户单号", "交易单号", "单号")

    /**
     * 从转账详情页节点树中提取单号。
     * @return 单号字符串，或 null
     */
    fun extractTransferId(root: AccessibilityNodeInfo): String? {
        return extractIdFromLabels(root, transferIdLabels)
    }

    // ---- 通用提取逻辑 ----

    /**
     * 遍历节点树，找到包含 label 的文本节点，然后在同层级或下一层级提取数字单号。
     */
    private fun extractIdFromLabels(root: AccessibilityNodeInfo, labels: List<String>): String? {
        try {
            val allTexts = mutableListOf<Pair<String, AccessibilityNodeInfo>>()
            collectNodesWithText(root, allTexts, 0)

            for ((text, node) in allTexts) {
                for (label in labels) {
                    if (text.contains(label)) {
                        // 尝试从同一节点的剩余文本提取
                        val idFromSame = idRegex.find(text.substringAfter(label))?.groupValues?.get(1)
                        if (idFromSame != null) return idFromSame

                        // 尝试从下一个兄弟节点提取
                        val idFromSibling = extractFromSibling(node)
                        if (idFromSibling != null) return idFromSibling

                        // 尝试从子节点提取
                        val idFromChild = extractFromChildren(node)
                        if (idFromChild != null) return idFromChild
                    }
                }
            }
        } catch (e: Exception) {
            Log.w(TAG, "IdExtractor failed", e)
        }
        return null
    }

    private fun extractFromSibling(node: AccessibilityNodeInfo): String? {
        val parent = node.parent ?: return null
        for (i in 0 until parent.childCount) {
            val sibling = parent.getChild(i) ?: continue
            if (sibling == node) continue
            val text = sibling.text?.toString() ?: continue
            val match = idRegex.find(text)?.groupValues?.get(1)
            if (match != null) return match
        }
        return null
    }

    private fun extractFromChildren(node: AccessibilityNodeInfo): String? {
        for (i in 0 until node.childCount) {
            val child = node.getChild(i) ?: continue
            val text = child.text?.toString() ?: continue
            val match = idRegex.find(text)?.groupValues?.get(1)
            if (match != null) return match
            // 递归一层
            val deeper = extractFromChildren(child)
            if (deeper != null) return deeper
        }
        return null
    }

    private fun collectNodesWithText(node: AccessibilityNodeInfo, out: MutableList<Pair<String, AccessibilityNodeInfo>>, depth: Int) {
        if (depth > 15 || out.size > 300) return
        node.text?.toString()?.takeIf { it.isNotBlank() }?.let { out.add(it to node) }
        for (i in 0 until node.childCount) {
            val child = node.getChild(i) ?: continue
            try {
                collectNodesWithText(child, out, depth + 1)
            } finally {
                // 不 recycle child，因为 out 持有引用
            }
        }
    }

    // ---- 页面辅助信息提取 ----

    /**
     * 提取页面中所有可见文本（用于组合 Key 生成）。
     */
    fun extractAllTexts(root: AccessibilityNodeInfo): List<String> {
        val texts = mutableListOf<String>()
        collectTexts(root, texts, 0)
        return texts
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
}
