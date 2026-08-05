import type { ParsedNotification } from '../record/types';

export interface ParseTemplate {
  name: string;
  appId?: string;
  patterns: {
    regex: string;
    flags?: string;
    amountGroup: number;
    type: 'expense' | 'income';
    merchantGroup?: number;
    channelGroup?: number;
  }[];
}

export const DEFAULT_TEMPLATES: ParseTemplate[] = [
  {
    name: '支付宝支出',
    appId: 'com.eg.android.AlipayGphone',
    patterns: [
      { regex: '支付宝.*?付款([\\d,.]+)元.*?(?:给|向|在)(.+?)(?:，|\\.|$)', flags: 's', amountGroup: 1, type: 'expense', merchantGroup: 2 },
      { regex: '支出([\\d,.]+)元.*?[-—](.+?)(?:，|\\.|$)', flags: 's', amountGroup: 1, type: 'expense', merchantGroup: 2 },
    ],
  },
  {
    name: '微信支付',
    appId: 'com.tencent.mm',
    patterns: [
      // 红包
      { regex: '微信红包.*?([\\d,.]+)(?:元|块钱)', flags: 's', amountGroup: 1, type: 'expense', channelGroup: 0 },
      { regex: '发出红包.*?([\\d,.]+)(?:元|块钱)', flags: 's', amountGroup: 1, type: 'expense', channelGroup: 0 },
      { regex: '红包.*?([\\d,.]+)(?:元|块钱)', flags: 's', amountGroup: 1, type: 'expense', channelGroup: 0 },
      // 微信转账-发出
      { regex: '微信转账.*?([\\d,.]+)(?:元|块钱)', flags: 's', amountGroup: 1, type: 'expense', channelGroup: 0 },
      { regex: '(?:你向|向)(.+?)转账([\\d,.]+)(?:元|块钱)', flags: 's', amountGroup: 2, type: 'expense', merchantGroup: 1 },
      { regex: '转账-转出([\\d,.]+)(?:元|块钱)', amountGroup: 1, type: 'expense' },
      // 微信支付（合并通知如 "[4条]微信支付：已支付￥21.12"）
      { regex: '微信支付.*?(?:已支付|支付)¥([\\d,.]+)', flags: 's', amountGroup: 1, type: 'expense' },
      { regex: '微信支付.*?¥([\\d,.]+)', flags: 's', amountGroup: 1, type: 'expense' },
      { regex: '微信支付.*?(?:已支付|支付)([\\d,.]+)(?:元|块)', flags: 's', amountGroup: 1, type: 'expense' },
      { regex: '微信支付.*?([\\d,.]+)(?:元|块钱).*?(?:给|向|转出|转账|收款方)(.+?)(?:，|\\.|$)', flags: 's', amountGroup: 1, type: 'expense', merchantGroup: 2 },
      { regex: '(?:支出|转出|转账|支付)([\\d,.]+)(?:元|块钱).*?(?:给|向|付款|扫码|收款方).*?(.+?)(?:，|\\.|$)', flags: 's', amountGroup: 1, type: 'expense', merchantGroup: 2 },
      { regex: '转给(.+?)([\\d,.]+)(?:元|块钱)', flags: 's', amountGroup: 2, type: 'expense', merchantGroup: 1 },
      // 微信收款/收红包
      { regex: '微信收款.*?([\\d,.]+)(?:元|块钱)', flags: 's', amountGroup: 1, type: 'income' },
      { regex: '领取红包.*?([\\d,.]+)(?:元|块钱)', flags: 's', amountGroup: 1, type: 'income' },
      { regex: '(?:收到|入账)([\\d,.]+)(?:元|块钱)', flags: 's', amountGroup: 1, type: 'income' },
    ],
  },
  {
    name: '银行消费',
    patterns: [
      { regex: '(?:消费|支出|交易|扣款|转出|转账)([\\d,.]+).*?(?:商户|商家|对方|收款人|转入方)(?:名称)?[:：]?(.+?)(?:，|\\.|$)', flags: 's', amountGroup: 1, type: 'expense', merchantGroup: 2 },
      { regex: '您尾号\\d+卡片(?:消费|支出|转出|转账)([\\d,.]+)(?:元|块钱)', amountGroup: 1, type: 'expense' },
      { regex: '(?:转出|转账)([\\d,.]+)(?:元|块钱).*?(?:至|给|向)(.+?)(?:，|\\.|$)', flags: 's', amountGroup: 1, type: 'expense', merchantGroup: 2 },
    ],
  },
  {
    name: '美团/饿了么',
    patterns: [
      { regex: '(?:订单|外卖).*?(?:支付|扣款|实付)([\\d,.]+)元', amountGroup: 1, type: 'expense', merchantGroup: 0 },
    ],
  },
  {
    name: '通用转账/转出',
    patterns: [
      { regex: '(?:转出|转账|汇款)(?:金额)?[:：]?\s*([\\d,.]+)(?:元|块钱)', amountGroup: 1, type: 'expense' },
      { regex: '(?:转出|转账|汇款|支付)([\\d,.]+)(?:元|块钱)(?:，|\\.|$)', amountGroup: 1, type: 'expense' },
      { regex: '(?:转给|转账给|汇款给)(.+?)([\\d,.]+)(?:元|块钱)', flags: 's', amountGroup: 2, type: 'expense', merchantGroup: 1 },
    ],
  },
  {
    name: '通用退款',
    patterns: [
      { regex: '(?:退款|退回|返还).*?([\\d,.]+)(?:元|块钱)', amountGroup: 1, type: 'income' },
    ],
  },
];

export function parseAmount(text: string): number {
  const cleaned = text.replace(/,/g, '');
  const value = parseFloat(cleaned);
  return isNaN(value) ? 0 : value;
}

export function parseNotification(raw: string, sourceApp?: string): ParsedNotification | null {
  // Normalize currency symbols: full-width ￥ and half-width ¥ to a standard form
  const normalized = raw.replace(/[￥¥]/g, '¥');
  const text = normalized.replace(/\s+/g, ' ').trim();

  for (const template of DEFAULT_TEMPLATES) {
    if (template.appId && sourceApp && template.appId !== sourceApp) continue;

    for (const pattern of template.patterns) {
      const regex = new RegExp(pattern.regex, pattern.flags ?? '');
      const match = text.match(regex);
      if (!match) continue;

      const amount = parseAmount(match[pattern.amountGroup]);
      if (amount <= 0) continue;

      const merchant = pattern.merchantGroup != null ? match[pattern.merchantGroup]?.trim() : undefined;
      const channel = pattern.channelGroup != null ? match[pattern.channelGroup]?.trim() : template.name;

      return {
        amount,
        type: pattern.type,
        merchant,
        channel,
        sourceApp,
        raw,
        matchedRule: template.name,
        confidence: 0.8,
      };
    }
  }

  return null;
}
