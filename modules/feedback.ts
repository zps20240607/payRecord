import Constants from 'expo-constants';
import * as Device from 'expo-device';

// ==========================================
// 配置区：部署后替换为你的 Vercel URL
// ==========================================
const API_URL = 'https://payrecord-feedback.vercel.app/api/feedback';
const API_KEY = 'payrecord_2026_secret_key';

export interface DeviceInfo {
  brand: string | null;
  model: string | null;
  systemVersion: string | null;
  appVersion: string | undefined;
  platform: string | null;
}

export const getDeviceInfo = (): DeviceInfo => ({
  brand: Device.brand,
  model: Device.modelName,
  systemVersion: Device.osVersion,
  appVersion: Constants.expoConfig?.version,
  platform: Device.osName,
});

export const submitFeedback = async (
  content: string,
  contact?: string
): Promise<{ success: boolean; message: string }> => {
  const deviceInfo = getDeviceInfo();

  const response = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Api-Key': API_KEY,
    },
    body: JSON.stringify({
      content: content.trim(),
      contact: contact?.trim() || '',
      deviceInfo,
    }),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || '提交失败，请稍后重试');
  }

  return data;
};
