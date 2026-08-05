import { createMMKV } from 'react-native-mmkv';

// 单例，避免重复创建
let _budgetAlertStorage: ReturnType<typeof createMMKV> | null = null;

export function getBudgetAlertStorage(): ReturnType<typeof createMMKV> {
  if (!_budgetAlertStorage) {
    try {
      _budgetAlertStorage = createMMKV({ id: 'budgetAlerts' });
    } catch {
      // fallback: 使用默认实例（某些环境下自定义 id 可能失败）
      _budgetAlertStorage = createMMKV();
    }
  }
  return _budgetAlertStorage;
}
