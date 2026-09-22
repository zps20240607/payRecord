import Constants from 'expo-constants';
import * as Device from 'expo-device';

// ==========================================
// 配置区
//
// ⚠️ 不要把密钥写死在源码里：本仓库是公开的，源码里的 key 等于公开。
// 请在项目根目录的 .env 中配置（.env 已被 .gitignore 忽略）：
//   EXPO_PUBLIC_FEEDBACK_API_URL=https://payrecord-feedback.vercel.app/api/feedback
//   EXPO_PUBLIC_FEEDBACK_API_KEY=<与 Vercel 项目环境变量 API_KEY 保持一致>
// Expo 会在打包时把 EXPO_PUBLIC_* 内联进产物。
//
// 说明：客户端产物中的任何密钥都可以被逆向提取出来，
// 所以这里移出源码只是避免「仓库泄露」；真正的防护在服务端
// （校验 + 限流 + 内容长度限制），见 payrecord-feedback 仓库。
// ==========================================
const API_URL =
  process.env.EXPO_PUBLIC_FEEDBACK_API_URL ||
  'https://payrecord-feedback.vercel.app/api/feedback';

const API_KEY = process.env.EXPO_PUBLIC_FEEDBACK_API_KEY || '';

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
  if (!API_KEY) {
    throw new Error('未配置 EXPO_PUBLIC_FEEDBACK_API_KEY，无法提交反馈');
  }

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
