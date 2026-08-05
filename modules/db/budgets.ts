import { getDb } from './schema';
import type { Budget } from '../record/types';

export async function setBudget(budget: Budget): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO budgets (id, category_id, amount, period) VALUES (?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET category_id=excluded.category_id, amount=excluded.amount, period=excluded.period`,
    budget.id, budget.categoryId ?? null, budget.amount, budget.period
  );
}

export async function deleteBudget(id: string): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM budgets WHERE id = ?', id);
}

export async function getBudgets(): Promise<Budget[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<Record<string, any>>('SELECT * FROM budgets');
  return rows.map((r) => ({
    id: r.id,
    categoryId: r.category_id ?? undefined,
    amount: r.amount,
    period: r.period,
  }));
}
