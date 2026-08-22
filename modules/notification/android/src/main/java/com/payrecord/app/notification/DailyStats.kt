package com.payrecord.app.notification

import android.content.Context
import android.database.sqlite.SQLiteDatabase
import android.util.Log
import java.io.File
import java.util.Calendar

/**
 * 供原生侧（通知/接收器）直接读取记账统计。
 * 注意：表结构与 modules/db/schema.ts 耦合，schema 变更时需同步修改此处 SQL。
 */
object DailyStats {
    private const val TAG = "PayRecord"

    data class BudgetWarning(val label: String, val percent: Int, val over: Boolean)
    data class Summary(
        val todayExpense: Double,
        val todayCount: Int,
        val monthExpense: Double,
        val warnings: List<BudgetWarning>,
    )

    // 与 constants/categories.ts 对应（仅支出类，预警文案用）
    private val categoryNames = mapOf(
        "food" to "餐饮", "transport" to "交通", "shopping" to "购物", "entertainment" to "娱乐",
        "housing" to "住房", "medical" to "医疗", "education" to "教育", "social" to "人情",
        "expense_other" to "其他", "other" to "其他",
    )

    /**
     * 读取统计数据。
     * @param date 目标日期 "yyyy-MM-dd"，为 null 时按当前时间算。
     *   汇总闹钟可能被系统推迟到次日凌晨触发，此时必须传闹钟的目标日期，
     *   否则会把"今天"算成新的一天，金额全错。
     */
    fun load(context: Context, date: String? = null): Summary {
        var todayExpense = 0.0
        var todayCount = 0
        var monthExpense = 0.0
        val warnings = mutableListOf<BudgetWarning>()

        val dbFile = findDatabase(context) ?: return Summary(0.0, 0, 0.0, emptyList())
        var db: SQLiteDatabase? = null
        try {
            db = openDatabase(dbFile) ?: return Summary(0.0, 0, 0.0, emptyList())

            val cal = Calendar.getInstance()
            if (date != null) {
                val parts = date.split("-")
                if (parts.size == 3) {
                    try {
                        cal.set(Calendar.YEAR, parts[0].toInt())
                        cal.set(Calendar.MONTH, parts[1].toInt() - 1)
                        cal.set(Calendar.DAY_OF_MONTH, parts[2].toInt())
                    } catch (_: Exception) {}
                }
            }

            // 目标日的 00:00:00.000 ~ 23:59:59.999
            val dayCal = cal.clone() as Calendar
            dayCal.set(Calendar.HOUR_OF_DAY, 0)
            dayCal.set(Calendar.MINUTE, 0)
            dayCal.set(Calendar.SECOND, 0)
            dayCal.set(Calendar.MILLISECOND, 0)
            val todayStart = dayCal.timeInMillis
            val todayEnd = todayStart + 24 * 60 * 60 * 1000L - 1

            // 目标日所在月
            val monthCal = cal.clone() as Calendar
            monthCal.set(Calendar.DAY_OF_MONTH, 1)
            monthCal.set(Calendar.HOUR_OF_DAY, 0)
            monthCal.set(Calendar.MINUTE, 0)
            monthCal.set(Calendar.SECOND, 0)
            monthCal.set(Calendar.MILLISECOND, 0)
            val monthStart = monthCal.timeInMillis
            val monthEndCal = monthCal.clone() as Calendar
            monthEndCal.add(Calendar.MONTH, 1)
            monthEndCal.add(Calendar.MILLISECOND, -1)
            val monthEnd = monthEndCal.timeInMillis

            todayExpense = sumExpense(db, todayStart, todayEnd)
            todayCount = countExpense(db, todayStart, todayEnd)
            monthExpense = sumExpense(db, monthStart, monthEnd)

            // 预算预警：总预算 + 分类预算，达到 80% 即预警、100% 记超支
            db.rawQuery("SELECT category_id, amount FROM budgets", null).use { c ->
                while (c.moveToNext()) {
                    val categoryId = if (c.isNull(0)) null else c.getString(0)
                    val amount = c.getDouble(1)
                    if (amount <= 0) continue
                    val spent = if (categoryId == null) monthExpense else sumExpenseByCategory(db, monthStart, monthEnd, categoryId)
                    val percent = (spent / amount * 100).toInt()
                    if (percent >= 80) {
                        warnings.add(BudgetWarning(categoryNames[categoryId] ?: "总预算", percent, percent >= 100))
                    }
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "load stats failed", e)
        } finally {
            try { db?.close() } catch (_: Exception) {}
        }
        return Summary(todayExpense, todayCount, monthExpense, warnings)
    }

    private fun findDatabase(context: Context): File? {
        val candidates = listOf(
            context.getDatabasePath("payrecord.db"),
            File(context.filesDir, "SQLite/payrecord.db"),
        )
        return candidates.firstOrNull { it.exists() }
    }

    private fun openDatabase(file: File): SQLiteDatabase? {
        return try {
            SQLiteDatabase.openDatabase(file.absolutePath, null, SQLiteDatabase.OPEN_READWRITE)
        } catch (e: Exception) {
            try {
                SQLiteDatabase.openDatabase(file.absolutePath, null, SQLiteDatabase.OPEN_READONLY)
            } catch (e2: Exception) {
                Log.e(TAG, "open database failed", e2)
                null
            }
        }
    }

    private fun sumExpense(db: SQLiteDatabase, start: Long, end: Long): Double {
        db.rawQuery(
            "SELECT SUM(amount) FROM records WHERE created_at >= ? AND created_at <= ? AND type = 'expense' AND status = 'confirmed'",
            arrayOf(start.toString(), end.toString())
        ).use { c -> return if (c.moveToFirst()) c.getDouble(0) else 0.0 }
    }

    private fun countExpense(db: SQLiteDatabase, start: Long, end: Long): Int {
        db.rawQuery(
            "SELECT COUNT(*) FROM records WHERE created_at >= ? AND created_at <= ? AND type = 'expense' AND status = 'confirmed'",
            arrayOf(start.toString(), end.toString())
        ).use { c -> return if (c.moveToFirst()) c.getInt(0) else 0 }
    }

    private fun sumExpenseByCategory(db: SQLiteDatabase, start: Long, end: Long, categoryId: String): Double {
        db.rawQuery(
            "SELECT SUM(amount) FROM records WHERE created_at >= ? AND created_at <= ? AND type = 'expense' AND status = 'confirmed' AND category_id = ?",
            arrayOf(start.toString(), end.toString(), categoryId)
        ).use { c -> return if (c.moveToFirst()) c.getDouble(0) else 0.0 }
    }
}
