export type RecordType = 'expense' | 'income';

export type RecordStatus = 'confirmed' | 'pending' | 'ignored' | 'refunded' | 'partial';

export interface PayRecord {
  id: string;
  amount: number;
  type: RecordType;
  categoryId: string;
  merchant?: string;
  channel?: string;
  sourceApp?: string;
  rawNotification?: string;
  note?: string;
  createdAt: number;
  confirmedAt?: number;
  status: RecordStatus;
  expiredAt?: number;
  relatedId?: string;
  platform?: string;
}

export interface ParsedNotification {
  amount: number | null;
  type: RecordType;
  merchant?: string;
  channel?: string;
  sourceApp?: string;
  raw: string;
  matchedRule?: string;
  confidence: number;
}

export interface Budget {
  id: string;
  categoryId?: string;
  amount: number;
  period: 'monthly';
}
