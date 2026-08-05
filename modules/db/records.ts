import { getDb } from './schema';
import type { PayRecord, RecordType } from '../record/types';

function rowToRecord(row: Record<string, any>): PayRecord {
  return {
    id: row.id,
    amount: row.amount,
    type: row.type as RecordType,
    categoryId: row.category_id,
    merchant: row.merchant ?? undefined,
    channel: row.channel ?? undefined,
    sourceApp: row.source_app ?? undefined,
    rawNotification: row.raw_notification ?? undefined,
    note: row.note ?? undefined,
    createdAt: row.created_at,
    confirmedAt: row.confirmed_at ?? undefined,
    status: row.status,
    expiredAt: row.expired_at ?? undefined,
    relatedId: row.related_id ?? undefined,
    platform: row.platform ?? undefined,
  };
}

export async function insertRecord(record: PayRecord): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO records (id, amount, type, category_id, merchant, channel, source_app, raw_notification, note, created_at, confirmed_at, status, expired_at, related_id, platform)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    record.id,
    record.amount,
    record.type,
    record.categoryId,
    record.merchant ?? null,
    record.channel ?? null,
    record.sourceApp ?? null,
    record.rawNotification ?? null,
    record.note ?? null,
    record.createdAt,
    record.confirmedAt ?? null,
    record.status,
    record.expiredAt ?? null,
    record.relatedId ?? null,
    record.platform ?? null
  );
}

export async function updateRecord(record: Partial<PayRecord> & { id: string }): Promise<void> {
  const db = await getDb();
  const sets: string[] = [];
  const values: any[] = [];
  if (record.amount !== undefined) { sets.push('amount = ?'); values.push(record.amount); }
  if (record.type !== undefined) { sets.push('type = ?'); values.push(record.type); }
  if (record.categoryId !== undefined) { sets.push('category_id = ?'); values.push(record.categoryId); }
  if (record.merchant !== undefined) { sets.push('merchant = ?'); values.push(record.merchant); }
  if (record.channel !== undefined) { sets.push('channel = ?'); values.push(record.channel); }
  if (record.sourceApp !== undefined) { sets.push('source_app = ?'); values.push(record.sourceApp); }
  if (record.rawNotification !== undefined) { sets.push('raw_notification = ?'); values.push(record.rawNotification); }
  if (record.note !== undefined) { sets.push('note = ?'); values.push(record.note); }
  if (record.createdAt !== undefined) { sets.push('created_at = ?'); values.push(record.createdAt); }
  if (record.confirmedAt !== undefined) { sets.push('confirmed_at = ?'); values.push(record.confirmedAt); }
  if (record.status !== undefined) { sets.push('status = ?'); values.push(record.status); }
  if (record.expiredAt !== undefined) { sets.push('expired_at = ?'); values.push(record.expiredAt); }
  if (record.relatedId !== undefined) { sets.push('related_id = ?'); values.push(record.relatedId); }
  if (record.platform !== undefined) { sets.push('platform = ?'); values.push(record.platform); }
  if (sets.length === 0) return;
  values.push(record.id);
  await db.runAsync(`UPDATE records SET ${sets.join(', ')} WHERE id = ?`, ...values);
}

export async function deleteRecord(id: string): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM records WHERE id = ?', id);
}

export async function getRecords(options?: {
  startTime?: number;
  endTime?: number;
  categoryId?: string;
  status?: string;
  sourceApp?: string;
  minAmount?: number;
  maxAmount?: number;
  keyword?: string;
  type?: RecordType;
  limit?: number;
  offset?: number;
}): Promise<PayRecord[]> {
  const db = await getDb();
  const where: string[] = [];
  const args: any[] = [];
  if (options?.startTime !== undefined) { where.push('created_at >= ?'); args.push(options.startTime); }
  if (options?.endTime !== undefined) { where.push('created_at <= ?'); args.push(options.endTime); }
  if (options?.categoryId) { where.push('category_id = ?'); args.push(options.categoryId); }
  if (options?.status) { where.push('status = ?'); args.push(options.status); }
  if (options?.sourceApp) { where.push('source_app = ?'); args.push(options.sourceApp); }
  if (options?.minAmount !== undefined) { where.push('amount >= ?'); args.push(options.minAmount); }
  if (options?.maxAmount !== undefined) { where.push('amount <= ?'); args.push(options.maxAmount); }
  if (options?.type) { where.push('type = ?'); args.push(options.type); }
  if (options?.keyword) {
    const kw = `%${options.keyword}%`;
    where.push('(merchant LIKE ? OR note LIKE ? OR channel LIKE ? OR source_app LIKE ?)');
    args.push(kw, kw, kw, kw);
  }

  let sql = `SELECT * FROM records ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY created_at DESC`;
  if (options?.limit !== undefined) { sql += ' LIMIT ?'; args.push(options.limit); }
  if (options?.offset !== undefined) { sql += ' OFFSET ?'; args.push(options.offset); }

  const rows = await db.getAllAsync<Record<string, any>>(sql, ...args);
  return rows.map(rowToRecord);
}

export async function getRecordCount(): Promise<number> {
  const db = await getDb();
  const row = await db.getFirstAsync<Record<string, any>>('SELECT COUNT(*) as count FROM records');
  return row?.count ?? 0;
}

export async function getRecordById(id: string): Promise<PayRecord | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<Record<string, any>>('SELECT * FROM records WHERE id = ?', id);
  return row ? rowToRecord(row) : null;
}

export async function getTotalByRange(startTime: number, endTime: number, type: RecordType = 'expense'): Promise<number> {
  const db = await getDb();
  const row = await db.getFirstAsync<Record<string, any>>(
    'SELECT SUM(amount) as total FROM records WHERE created_at >= ? AND created_at <= ? AND type = ? AND status = ?',
    startTime, endTime, type, 'confirmed'
  );
  return row?.total ?? 0;
}

export async function getCategoryTotals(startTime: number, endTime: number, type: RecordType = 'expense'): Promise<{ categoryId: string; total: number }[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<Record<string, any>>(
    `SELECT category_id, SUM(amount) as total FROM records
     WHERE created_at >= ? AND created_at <= ? AND type = ? AND status = ?
     GROUP BY category_id ORDER BY total DESC`,
    startTime, endTime, type, 'confirmed'
  );
  return rows.map((r) => ({ categoryId: r.category_id, total: r.total }));
}

export async function getDailyTotals(startTime: number, endTime: number, type: RecordType = 'expense'): Promise<{ day: string; total: number }[]> {
  const db = await getDb();
  // 使用 +8 小时偏移修正时区（中国 UTC+8），strftime 只支持 UTC
  const tzOffsetHours = -(new Date().getTimezoneOffset() / 60);
  const tzClause = tzOffsetHours >= 0
    ? `+${tzOffsetHours} hours`
    : `${tzOffsetHours} hours`;
  const rows = await db.getAllAsync<Record<string, any>>(
    `SELECT strftime('%Y-%m-%d', created_at / 1000, 'unixepoch', '${tzClause}') as day, SUM(amount) as total
     FROM records
     WHERE created_at >= ? AND created_at <= ? AND type = ? AND status = ?
     GROUP BY day ORDER BY day ASC`,
    startTime, endTime, type, 'confirmed'
  );
  return rows.map((r) => ({ day: r.day, total: r.total }));
}

/**
 * 批量获取多个月的总额，一次 SQL 搞定（替代循环 N 次 getTotalByRange）
 */
export async function getMonthlyTotals(months: { start: number; end: number; label: string }[], type: RecordType = 'expense'): Promise<{ label: string; total: number }[]> {
  if (months.length === 0) return [];
  const db = await getDb();
  // 查出整个范围的数据，再 JS 分组
  const globalStart = Math.min(...months.map(m => m.start));
  const globalEnd = Math.max(...months.map(m => m.end));
  const rows = await db.getAllAsync<Record<string, any>>(
    `SELECT created_at, amount FROM records
     WHERE created_at >= ? AND created_at <= ? AND type = ? AND status = ?`,
    globalStart, globalEnd, type, 'confirmed'
  );
  // 按月分组
  const map = new Map<string, number>();
  for (const m of months) map.set(m.label, 0);
  for (const row of rows) {
    const ts = row.created_at as number;
    const amt = row.amount as number;
    for (const m of months) {
      if (ts >= m.start && ts <= m.end) {
        map.set(m.label, (map.get(m.label) ?? 0) + amt);
        break;
      }
    }
  }
  return months.map(m => ({ label: m.label, total: map.get(m.label) ?? 0 }));
}

/**
 * 批量获取多周的总额
 */
export async function getWeeklyTotals(weeks: { start: number; end: number; label: string }[], type: RecordType = 'expense'): Promise<{ label: string; total: number }[]> {
  return getMonthlyTotals(weeks, type); // 逻辑完全一样
}
