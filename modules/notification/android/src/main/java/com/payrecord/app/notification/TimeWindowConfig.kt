package com.payrecord.app.notification

/**
 * 时间窗口与存储配置常量
 */
object TimeWindowConfig {
    /** 通知门控窗口：从收到通知到打开页面，10 分钟内有效 */
    const val NOTIFY_GATEWAY_MS = 10 * 60 * 1000L
    /** 页面返回窗口：从看到详情页到返回聊天，30 秒内有效 */
    const val PAGE_RETURN_WINDOW_MS = 30 * 1000L
    /** 记录 TTL：7 天后自动清理 */
    const val RECORD_TTL_MS = 7 * 24 * 60 * 60 * 1000L
    /** 节点抓取重试延迟（ms） */
    const val NODE_RETRY_DELAY_MS = 300L
    /** 节点抓取最大重试次数 */
    const val NODE_MAX_RETRY = 1
}
