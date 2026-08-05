# 记花（payRecord）

基于 Expo / React Native 的个人记账 App。核心亮点是通过 Android 系统通知监听，自动识别支付消息并记账。

## 功能

- **自动记账**：监听支付通知，自动解析金额、商家、平台
- **手动记账**：快速记一笔，支持分类、备注、周期账单
- **统计报表**：趋势图、环形图，日/月/年维度汇总
- **预算管理**：月度预算与超支提醒
- **搜索与导出**：关键词搜索，数据导出分享
- **每日提醒**：定时提醒记账与每日消费汇总

## 技术栈

- Expo SDK 57 / React Native 0.86 / TypeScript
- expo-router（文件路由）、expo-sqlite（本地数据库）
- zustand（状态管理）、MMKV（键值存储）
- Skia + Victory Native（图表）、bottom-sheet（交互组件）
- 自研 Android 原生模块：通知监听、无障碍服务、悬浮快速记账、每日提醒

## 目录结构

```
app/          页面路由（首页、记账、报表、设置等）
components/   通用组件（图表、列表项、弹层等）
stores/       zustand 状态
constants/    分类、颜色、主题
modules/      业务逻辑（db 数据库、parser 通知解析、notification 原生模块等）
utils/        工具函数
plugins/      Expo 配置插件（Android 定制）
```

## 本地开发

```bash
npm install
npx expo start        # 启动开发服务器
npx expo run:android  # Android 原生构建
```

## 说明

- Android 的通知监听、无障碍、悬浮窗等能力需要用户手动授权
- 签名文件、密钥、环境变量等敏感内容不提交（见 `.gitignore`）