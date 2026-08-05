import * as SQLite from 'expo-sqlite';

const DB_NAME = 'payrecord.db';

// 缓存 Promise 而不是实例：保证并发调用只打开一次数据库、只执行一次迁移，
// 避免重复 openDatabaseAsync 产生多个原生句柄导致 prepareAsync NPE
let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

export async function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (!dbPromise) {
    dbPromise = (async () => {
      const database = await SQLite.openDatabaseAsync(DB_NAME);
      await migrate(database);
      return database;
    })();
  }
  return dbPromise;
}

async function hasColumn(database: SQLite.SQLiteDatabase, table: string, column: string): Promise<boolean> {
  const rows = await database.getAllAsync<{ name: string }>(`PRAGMA table_info(${table})`);
  return rows.some((r) => r.name === column);
}

async function migrate(database: SQLite.SQLiteDatabase) {
  await database.execAsync(`
    PRAGMA journal_mode = WAL;

    CREATE TABLE IF NOT EXISTS records (
      id TEXT PRIMARY KEY NOT NULL,
      amount REAL NOT NULL,
      type TEXT NOT NULL,
      category_id TEXT NOT NULL,
      merchant TEXT,
      channel TEXT,
      source_app TEXT,
      raw_notification TEXT,
      note TEXT,
      created_at INTEGER NOT NULL,
      confirmed_at INTEGER,
      status TEXT NOT NULL DEFAULT 'confirmed',
      expired_at INTEGER,
      related_id TEXT,
      platform TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_records_created_at ON records(created_at);
    CREATE INDEX IF NOT EXISTS idx_records_category ON records(category_id);
    CREATE INDEX IF NOT EXISTS idx_records_status ON records(status);
    CREATE INDEX IF NOT EXISTS idx_records_expired ON records(expired_at) WHERE status = 'pending';
    CREATE INDEX IF NOT EXISTS idx_records_type_status ON records(type, status);

    CREATE TABLE IF NOT EXISTS categories (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      icon TEXT NOT NULL,
      color TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0
    );
  `);

  // 迁移：给旧表加新字段
  if (!(await hasColumn(database, 'records', 'expired_at'))) {
    await database.execAsync(`ALTER TABLE records ADD COLUMN expired_at INTEGER;`);
  }
  if (!(await hasColumn(database, 'records', 'related_id'))) {
    await database.execAsync(`ALTER TABLE records ADD COLUMN related_id TEXT;`);
  }
  if (!(await hasColumn(database, 'records', 'platform'))) {
    await database.execAsync(`ALTER TABLE records ADD COLUMN platform TEXT;`);
  }

  // 旧版本 budgets/recurrings 使用驼峰字段名（categoryId/nextTrigger），与代码不匹配，
  // 仅当检测到旧结构时才重建，避免每次启动都丢数据
  if (await hasColumn(database, 'budgets', 'categoryId')) {
    await database.execAsync('DROP TABLE IF EXISTS budgets;');
  }
  await database.execAsync(`
    CREATE TABLE IF NOT EXISTS budgets (
      id TEXT PRIMARY KEY NOT NULL,
      category_id TEXT,
      amount REAL NOT NULL,
      period TEXT NOT NULL
    );
  `);

  if (await hasColumn(database, 'recurrings', 'nextTrigger')) {
    await database.execAsync('DROP TABLE IF EXISTS recurrings;');
  }
  await database.execAsync(`
    CREATE TABLE IF NOT EXISTS recurrings (
      id TEXT PRIMARY KEY NOT NULL,
      amount REAL NOT NULL,
      type TEXT NOT NULL,
      category_id TEXT NOT NULL,
      merchant TEXT,
      note TEXT,
      period_type TEXT NOT NULL,
      period_value INTEGER NOT NULL,
      next_trigger INTEGER NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      created_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_recurrings_next ON recurrings(next_trigger);
    CREATE INDEX IF NOT EXISTS idx_recurrings_enabled ON recurrings(enabled);
  `);
}
