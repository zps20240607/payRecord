import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, Modal, Image, StyleSheet, ActivityIndicator,
} from 'react-native';
import { useThemedStyles, useColors } from '../constants/colors';
import type { AppColors } from '../constants/colors';

const OSS_BASE = 'https://zps060619.oss-cn-beijing.aliyuncs.com/payRecord';

interface EasterEggModalProps {
  visible: boolean;
  onClose: () => void;
}

const createStyles = (c: AppColors) => StyleSheet.create({
  mask: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center', padding: 32 },
  dialog: { width: '100%', backgroundColor: c.surface, borderRadius: 20, padding: 24, alignItems: 'center' },
  title: { fontSize: 18, fontWeight: '700', color: c.text, marginBottom: 12 },
  inputRow: { flexDirection: 'row', gap: 10, width: '100%' },
  input: {
    flex: 1, backgroundColor: c.background, borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 10, fontSize: 16,
    borderWidth: 1, borderColor: c.border, color: c.text,
  },
  goBtn: { backgroundColor: c.primary, borderRadius: 10, paddingHorizontal: 20, justifyContent: 'center' },
  goBtnText: { color: '#fff', fontWeight: '600', fontSize: 15 },
  photoBox: { width: '100%', alignItems: 'center' },
  loading: { position: 'absolute', top: '40%', zIndex: 1 },
  photo: { width: '100%', height: 320, borderRadius: 12, backgroundColor: c.background },
  errorText: { position: 'absolute', top: '35%', textAlign: 'center', color: c.textSecondary, fontSize: 13, lineHeight: 20 },
  retryBtn: { marginTop: 14, paddingVertical: 8, paddingHorizontal: 20 },
  retryBtnText: { color: c.primary, fontSize: 14, fontWeight: '600' },
});

export function EasterEggModal({ visible, onClose }: EasterEggModalProps) {
  const styles = useThemedStyles(createStyles);
  const colors = useColors();
  const [initials, setInitials] = useState('');
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);

  const showPhoto = () => {
    const key = initials.trim().toLowerCase();
    if (!key) return;
    setFailed(false);
    setLoading(true);
    setImageUrl(`${OSS_BASE}/${encodeURIComponent(key)}.jpg`);
  };

  const handleClose = () => {
    setImageUrl(null);
    setInitials('');
    setFailed(false);
    setLoading(false);
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleClose}>
      <TouchableOpacity style={styles.mask} activeOpacity={1} onPress={handleClose}>
        <TouchableOpacity style={styles.dialog} activeOpacity={1} onPress={() => {}}>
          <Text style={styles.title}>🎉 彩蛋</Text>
          {!imageUrl && (
            <View style={styles.inputRow}>
              <TextInput
                style={styles.input}
                placeholderTextColor={colors.textSecondary}
                value={initials}
                onChangeText={setInitials}
                autoCapitalize="none"
                autoCorrect={false}
                autoFocus
                onSubmitEditing={showPhoto}
              />
              <TouchableOpacity style={styles.goBtn} onPress={showPhoto}>
                <Text style={styles.goBtnText}>看看</Text>
              </TouchableOpacity>
            </View>
          )}
          {imageUrl && (
            <View style={styles.photoBox}>
              {loading && <ActivityIndicator style={styles.loading} color={colors.primary} />}
              <Image
                source={{ uri: imageUrl }}
                style={styles.photo}
                resizeMode="contain"
                onLoad={() => setLoading(false)}
                onError={() => { setLoading(false); setFailed(true); }}
              />
              {failed && <Text style={styles.errorText}>没有找到</Text>}
              <TouchableOpacity style={styles.retryBtn} onPress={() => { setImageUrl(null); setFailed(false); }}>
                <Text style={styles.retryBtnText}>再猜一个</Text>
              </TouchableOpacity>
            </View>
          )}
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}
