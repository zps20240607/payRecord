export interface Category {
  id: string;
  name: string;
  icon: string;
  color: string;
}

/** 支出分类 ID（与 DEFAULT_CATEGORIES 保持同步，各页面统一引用，避免多处重复定义） */
export const EXPENSE_CATEGORY_IDS: readonly string[] = [
  'food', 'transport', 'shopping', 'entertainment', 'housing',
  'medical', 'education', 'social', 'expense_other',
];

/** 收入分类 ID */
export const INCOME_CATEGORY_IDS: readonly string[] = [
  'salary', 'redpacket', 'transfer', 'parttime', 'invest', 'income_other',
];

/** 按收支类型过滤默认分类 */
export function getCategoriesByType(type: 'expense' | 'income'): Category[] {
  const ids: readonly string[] = type === 'expense' ? EXPENSE_CATEGORY_IDS : INCOME_CATEGORY_IDS;
  return DEFAULT_CATEGORIES.filter((c) => ids.includes(c.id));
}

export const DEFAULT_CATEGORIES: Category[] = [
  { id: 'food', name: '餐饮', icon: '🍔', color: '#FF6B6B' },
  { id: 'transport', name: '交通', icon: '🚗', color: '#4ECDC4' },
  { id: 'shopping', name: '购物', icon: '🛍️', color: '#45B7D1' },
  { id: 'entertainment', name: '娱乐', icon: '🎮', color: '#96CEB4' },
  { id: 'housing', name: '住房', icon: '🏠', color: '#FFEAA7' },
  { id: 'medical', name: '医疗', icon: '💊', color: '#DDA0DD' },
  { id: 'education', name: '教育', icon: '📚', color: '#98D8C8' },
  { id: 'social', name: '人情', icon: '🎁', color: '#F7DC6F' },
  { id: 'expense_other', name: '其他', icon: '📝', color: '#B2BEC3' },
  { id: 'salary', name: '工资', icon: '💼', color: '#4CAF50' },
  { id: 'redpacket', name: '红包', icon: '🧧', color: '#F44336' },
  { id: 'transfer', name: '转账', icon: '💸', color: '#2196F3' },
  { id: 'parttime', name: '兼职', icon: '🛠️', color: '#FF9800' },
  { id: 'invest', name: '理财', icon: '📈', color: '#9C27B0' },
  { id: 'income_other', name: '其他', icon: '📝', color: '#B2BEC3' },
];

export function getCategoryById(id?: string | null): Category {
  if (id === 'other') {
    // 兼容旧数据
    return DEFAULT_CATEGORIES.find(c => c.id === 'expense_other')!;
  }
  return DEFAULT_CATEGORIES.find((c) => c.id === id) ?? DEFAULT_CATEGORIES.find(c => c.id === 'expense_other')!;
}
