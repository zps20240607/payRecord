import { getDb } from './schema';

export interface RecurringRecord {
  id: string;
  amount: number;
  type: 'expense' | 'income';
  categoryId: string;
  merchant?: string;
  note?: string;
  periodType: 'daily' | 'weekly' | 'monthly';
  periodValue: number;
  nextTrigger: number;
  enabled: boolean;
  createdAt: number;
}

function rowToRecurring(row: Record<string, any>): RecurringRecord {
  return {
    id: row.id,
    amount: row.amount,
    type: row.type,
    categoryId: row.category_id,
    merchant: row.merchant ?? undefined,
    note: row.note ?? undefined,
    periodType: row.period_type,
    periodValue: row.period_value,
    nextTrigger: row.next_trigger,
    enabled: row.enabled === 1,
    createdAt: row.created_at,
  };
}

export async function addRecurring(record: RecurringRecord): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO recurrings (id, amount, type, category_id, merchant, note, period_type, period_value, next_trigger, enabled, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    record.id, record.amount, record.type, record.categoryId,
    record.merchant ?? null, record.note ?? null,
    record.periodType, record.periodValue, record.nextTrigger,
    record.enabled ? 1 : 0, record.createdAt
  );
}

export async function getRecurrings(enabledOnly = false): Promise<RecurringRecord[]> {
  const db = await getDb();
  const sql = enabledOnly
    ? 'SELECT * FROM recurrings WHERE enabled = 1 ORDER BY next_trigger ASC'
    : 'SELECT * FROM recurrings ORDER BY created_at DESC';
  const rows = await db.getAllAsync<Record<string, any>>(sql);
  return rows.map(rowToRecurring);
}

export async function deleteRecurring(id: string): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM recurrings WHERE id = ?', id);
}

export async function toggleRecurring(id: string, enabled: boolean): Promise<void> {
  const db = await getDb();
  await db.runAsync('UPDATE recurrings SET enabled = ? WHERE id = ?', enabled ? 1 : 0, id);
}

export async function updateNextTrigger(id: string, nextTrigger: number): Promise<void> {
  const db = await getDb();
  await db.runAsync('UPDATE recurrings SET next_trigger = ? WHERE id = ?', nextTrigger, id);
}

/** Calculate next trigger timestamp based on period */
export function calcNextTrigger(periodType: RecurringRecord['periodType'], periodValue: number, from: number): number {
  const d = new Date(from);
  switch (periodType) {
    case 'daily':
      d.setDate(d.getDate() + periodValue);
      break;
    case 'weekly':
      d.setDate(d.getDate() + 7 * periodValue);
      break;
    case 'monthly':
      d.setMonth(d.getMonth() + periodValue);
      break;
  }
  return d.getTime();
}
