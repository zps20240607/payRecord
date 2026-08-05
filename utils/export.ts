import * as Sharing from 'expo-sharing';
import { Paths, Directory, File, EncodingType } from 'expo-file-system';
import type { PayRecord } from '../modules/record/types';
import { formatDateTime } from './date';
import { getDb } from '../modules/db/schema';

const CSV_HEADER = '日期,类型,分类,金额,商户,渠道,备注,状态';

function escapeCSV(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function recordsToCSV(records: PayRecord[]): string {
  const lines = [CSV_HEADER];
  for (const r of records) {
    const date = formatDateTime(r.createdAt);
    const type = r.type === 'expense' ? '支出' : '收入';
    const amount = r.amount.toFixed(2);
    const merchant = r.merchant ?? '';
    const channel = r.channel ?? '';
    const note = r.note ?? '';
    const status = r.status === 'confirmed' ? '已确认' : r.status === 'pending' ? '待确认' : '已忽略';
    lines.push([date, type, r.categoryId, amount, merchant, channel, note, status].map(escapeCSV).join(','));
  }
  return '\uFEFF' + lines.join('\n'); // BOM for Excel CJK compatibility
}

export function recordsToJSON(records: PayRecord[]): string {
  return JSON.stringify(records, null, 2);
}

export async function exportToFile(content: string, filename: string): Promise<string> {
  const cacheDir = new Directory(Paths.cache, 'exports');
  if (!cacheDir.exists) {
    await cacheDir.create();
  }
  const file = cacheDir.createFile(filename, 'text/csv');
  await file.write(content, { encoding: EncodingType.UTF8 });
  return file.uri;
}

export async function shareCSV(records: PayRecord[]): Promise<void> {
  const csv = recordsToCSV(records);
  const path = await exportToFile(csv, `智能记账_${new Date().toISOString().slice(0, 10)}.csv`);
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(path, {
      mimeType: 'text/csv',
      dialogTitle: '导出记账数据',
    });
  }
}

export async function importJSON(): Promise<number> {
  const result = await import('expo-document-picker').then(m => m.default.getDocumentAsync({
    type: 'application/json',
    copyToCacheDirectory: true,
  }));
  if (result.canceled || !result.assets?.length) return 0;

  const file = new File(result.assets[0].uri);
  const content = await file.text();
  const records: PayRecord[] = JSON.parse(content);

  if (!Array.isArray(records) || records.length === 0) {
    throw new Error('JSON 文件中没有有效的记录');
  }

  // 验证基本字段
  const valid = records.filter(r => r.id && r.amount && r.type && r.categoryId && r.createdAt);
  if (valid.length === 0) {
    throw new Error('JSON 格式不匹配');
  }

  const ddb = await getDb();
  let imported = 0;
  for (const r of valid) {
    try {
      await ddb.runAsync(
        `INSERT OR REPLACE INTO records (id, amount, type, category_id, merchant, channel, source_app, raw_notification, note, created_at, confirmed_at, status, expired_at, related_id, platform)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        r.id, r.amount, r.type, r.categoryId,
        r.merchant ?? null, r.channel ?? null, r.sourceApp ?? null,
        r.rawNotification ?? null, r.note ?? null, r.createdAt,
        r.confirmedAt ?? null, r.status ?? 'confirmed',
        r.expiredAt ?? null, r.relatedId ?? null, r.platform ?? null
      );
      imported++;
    } catch {}
  }
  return imported;
}

export async function shareJSON(records: PayRecord[]): Promise<void> {
  const json = recordsToJSON(records);
  const path = await exportToFile(json, `智能记账_${new Date().toISOString().slice(0, 10)}.json`);
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(path, {
      mimeType: 'application/json',
      dialogTitle: '导出记账数据',
    });
  }
}
