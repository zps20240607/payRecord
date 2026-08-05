import { getDb } from './schema';
import type { Category } from '../../constants/categories';

export async function initCategories(categories: Category[]): Promise<void> {
  const db = await getDb();
  const existing = await db.getFirstAsync<{ count: number }>('SELECT COUNT(*) as count FROM categories');
  if ((existing?.count ?? 0) > 0) return;

  await db.withTransactionAsync(async () => {
    for (const [index, cat] of categories.entries()) {
      await db.runAsync(
        'INSERT INTO categories (id, name, icon, color, sort_order) VALUES (?, ?, ?, ?, ?)',
        cat.id, cat.name, cat.icon, cat.color, index
      );
    }
  });
}

export async function getCategories(): Promise<Category[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<Record<string, any>>('SELECT * FROM categories ORDER BY sort_order');
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    icon: r.icon,
    color: r.color,
  }));
}
