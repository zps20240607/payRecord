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

    fun load(context: Context): Summary {
        var todayExpense = 0.0
        var todayCount = 0
        var monthExpense = 0.0
        val warnings = mutableListOf<BudgetWarning>()

        val dbFile = findDatabase(context) ?: return Summary(0.0, 0, 0.0, emptyList())
        var db: SQLiteDatabase? = null
        try {
            db = openDatabase(dbFile) ?: return Summary(0.0, 0, 0.0, emptyList())

            val cal = Calendar.getInstance()
            cal.apply { set(Calendar.HOUR_OF_DAY, 0); set(Calendar.MINUTE, 0); set(Calendar.SECOND, 0); set(Calendar.MILLISECOND, 0) }
            val todayStart = cal.timeInMillis
            cal.apply { set(Calendar.HOUR_OF_DAY, 23); set(Calendar.MINUTE, 59); set(Calendar.SECOND, 59) }
            val todayEnd = cal.timeInMillis
            cal.apply { set(Calendar.DAY_OF_MONTH, 1); set(Calendar.HOUR_OF_DAY, 0); set(Calendar.MINUTE, 0); set(Calendar.SECOND, 0); set(Calendar.MILLISECOND, 0) }
            val monthStart = cal.timeInMillis
            cal.add(Calendar.MONTH, 1)
            cal.add(Calendar.MILLISECOND, -1)
            val monthEnd = cal.timeInMillis

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
