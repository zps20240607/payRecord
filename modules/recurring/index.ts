import { getRecurrings, updateNextTrigger, calcNextTrigger } from '../db/recurrings';
import { insertRecord } from '../db/records';
import type { PayRecord } from '../record/types';

/**
 * Check all enabled recurring records and create PayRecords for those that are due.
 * Returns the number of records created.
 */
export async function checkAndCreateRecords(): Promise<number> {
  const recurrings = await getRecurrings(true);
  const now = Date.now();
  let created = 0;

  for (const rec of recurrings) {
    if (rec.periodValue <= 0) continue; // 防死循环
    // 循环补齐漏掉的周期：App 长时间未打开时，每期都补记一笔
    let trigger = rec.nextTrigger;
    while (trigger <= now) {
      const record: PayRecord = {
        id: `rec_${rec.id}_${trigger}`,
        amount: rec.amount,
        type: rec.type,
        categoryId: rec.categoryId,
        merchant: rec.merchant,
        channel: '周期记账',
        note: rec.note ?? `[周期] ${rec.periodType === 'daily' ? '每日' : rec.periodType === 'weekly' ? '每周' : '每月'}`,
        createdAt: trigger,
        confirmedAt: trigger,
        status: 'confirmed',
      };

      await insertRecord(record);
      trigger = calcNextTrigger(rec.periodType, rec.periodValue, trigger);
      created++;
    }
    if (trigger !== rec.nextTrigger) {
      await updateNextTrigger(rec.id, trigger);
    }
  }

  return created;
}
