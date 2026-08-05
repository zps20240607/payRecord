import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, Alert, ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useThemedStyles, useColors } from '../constants/colors';
import type { AppColors } from '../constants/colors';
import { submitFeedback } from '../modules/feedback';

export default function FeedbackScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const styles = useThemedStyles(createStyles);
  const colors = useColors();

  const [content, setContent] = useState('');
  const [contact, setContact] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    if (!content.trim()) {
      Alert.alert('提示', '请填写反馈内容');
      return;
    }
    if (content.trim().length < 5) {
      Alert.alert('提示', '反馈内容至少 5 个字');
      return;
    }

    setLoading(true);
    try {
      await submitFeedback(content, contact);
      Alert.alert('发送成功 🎉', '感谢你的反馈，我们会尽快处理！', [
        { text: '好的', onPress: () => { setContent(''); setContact(''); router.back(); } },
      ]);
    } catch (error: any) {
      Alert.alert('发送失败', error.message || '网络异常，请检查网络后重试');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.safe}>
      <View style={[styles.header, { paddingTop: Math.max(insets.top, 16) }]}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.back}>← 返回</Text>
        </TouchableOpacity>
        <Text style={styles.title}>意见反馈</Text>
        <View style={{ width: 60 }} />
      </View>

      <ScrollView style={styles.content} contentContainerStyle={{ paddingBottom: 24 + insets.bottom }} keyboardShouldPersistTaps="handled">
        <View style={styles.card}>
          <Text style={styles.label}>反馈内容 *</Text>
          <TextInput
            style={styles.textArea}
            multiline
            numberOfLines={6}
            textAlignVertical="top"
            value={content}
            onChangeText={setContent}
            placeholder="请描述你遇到的问题、功能建议或任何想说的话..."
            placeholderTextColor={colors.textSecondary}
            maxLength={500}
          />
          <Text style={styles.hint}>{content.length}/500</Text>

          <Text style={styles.label}>联系方式（选填）</Text>
          <TextInput
            style={styles.input}
            value={contact}
            onChangeText={setContact}
            placeholder="QQ / 微信 / 邮箱，方便我们回复你"
            placeholderTextColor={colors.textSecondary}
            keyboardType="email-address"
          />

          <TouchableOpacity
            style={[styles.submitBtn, loading && styles.submitBtnDisabled]}
            onPress={handleSubmit}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.submitText}>提交反馈</Text>
            )}
          </TouchableOpacity>
        </View>

        <Text style={styles.footer}>反馈将通过邮件发送至开发团队，感谢你的支持 🌸</Text>
      </ScrollView>
    </View>
  );
}

const createStyles = (c: AppColors) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: c.background },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingTop: 16, paddingBottom: 12,
    backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border,
  },
  back: { color: c.primary, fontSize: 15, width: 60 },
  title: { fontSize: 18, fontWeight: '700', color: c.text },
  content: { padding: 16 },
  card: {
    backgroundColor: c.surface, borderRadius: 16, padding: 16,
    shadowColor: c.primary, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.04, shadowRadius: 8, elevation: 2,
  },
  label: { fontSize: 14, fontWeight: '600', color: c.text, marginBottom: 8 },
  textArea: {
    backgroundColor: c.background, borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 10, fontSize: 15,
    borderWidth: 1, borderColor: c.border, color: c.text, minHeight: 120,
  },
  input: {
    backgroundColor: c.background, borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 10, fontSize: 15,
    borderWidth: 1, borderColor: c.border, color: c.text, marginBottom: 16,
  },
  hint: { fontSize: 12, color: c.textSecondary, textAlign: 'right', marginTop: 4, marginBottom: 16 },
  submitBtn: {
    backgroundColor: c.primary, borderRadius: 12, paddingVertical: 14,
    alignItems: 'center', justifyContent: 'center', minHeight: 48,
  },
  submitBtnDisabled: { opacity: 0.6 },
  submitText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  footer: { textAlign: 'center', color: c.textSecondary, fontSize: 12, marginTop: 12 },
});
