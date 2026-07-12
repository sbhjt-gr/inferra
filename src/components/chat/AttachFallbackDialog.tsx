import React from 'react';
import { StyleSheet, View, TouchableOpacity } from 'react-native';
import { Text } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import Dialog from '../Dialog';
import { useTheme } from '../../context/ThemeContext';
import { theme } from '../../constants/theme';
import type { AttachKind } from '../../types/attachment';

type Props = {
  visible: boolean;
  kind: AttachKind;
  fileName: string;
  reason: 'needs-fallback' | 'unsupported' | 'needs-mmproj';
  onOcr?: () => void;
  onStt?: () => void;
  onRemove: () => void;
  onLoadMmproj?: () => void;
  onDismiss: () => void;
};

export default function AttachFallbackDialog({
  visible,
  kind,
  fileName,
  reason,
  onOcr,
  onStt,
  onRemove,
  onLoadMmproj,
  onDismiss,
}: Props) {
  const { theme: currentTheme } = useTheme();
  const colors = theme[currentTheme as 'light' | 'dark'];
  const isDark = currentTheme === 'dark';

  const canOcr = kind === 'image' || kind === 'pdf';
  const canStt = kind === 'audio';

  const title =
    reason === 'needs-mmproj'
      ? 'Projector required'
      : reason === 'unsupported'
        ? 'Attachment unsupported'
        : 'Native media unavailable';

  const description =
    reason === 'needs-mmproj'
      ? `Load an mmproj projector before using ${kind} with this llama.cpp model.`
      : reason === 'unsupported'
        ? `This model cannot use ${fileName}. Remove it or switch models.`
        : `This model cannot use ${kind} natively. Choose a text fallback or remove the attachment.`;

  console.log('attach_fallback_show', kind, reason);

  return (
    <Dialog
      visible={visible}
      onDismiss={onDismiss}
      onClose={onDismiss}
      title={title}
      description={description}
      secondaryButtonText="Close"
      onSecondaryPress={onDismiss}
    >
      <View style={styles.body}>
        {reason === 'needs-mmproj' && onLoadMmproj ? (
          <ActionBtn
            icon="projector"
            label="Load mmproj"
            color={colors.primary}
            bg={isDark ? colors.surface : '#F2F2F7'}
            onPress={onLoadMmproj}
          />
        ) : null}

        {canOcr && onOcr ? (
          <ActionBtn
            icon="text-recognition"
            label={reason === 'needs-mmproj' ? 'Use OCR instead' : 'Use OCR'}
            color={colors.primary}
            bg={isDark ? colors.surface : '#F2F2F7'}
            onPress={onOcr}
          />
        ) : null}

        {canStt && onStt ? (
          <ActionBtn
            icon="microphone-message"
            label={reason === 'needs-mmproj' ? 'Use STT instead' : 'Use STT'}
            color={colors.primary}
            bg={isDark ? colors.surface : '#F2F2F7'}
            onPress={onStt}
          />
        ) : null}

        <ActionBtn
          icon="trash-can-outline"
          label="Remove"
          color="#FF3B30"
          bg={isDark ? 'rgba(255,59,48,0.12)' : 'rgba(255,59,48,0.08)'}
          onPress={onRemove}
        />
      </View>
    </Dialog>
  );
}

function ActionBtn({
  icon,
  label,
  color,
  bg,
  onPress,
}: {
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  label: string;
  color: string;
  bg: string;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity style={[styles.btn, { backgroundColor: bg }]} onPress={onPress} activeOpacity={0.7}>
      <MaterialCommunityIcons name={icon} size={20} color={color} />
      <Text style={[styles.btnText, { color }]}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  body: {
    gap: 10,
    marginTop: 8,
    paddingHorizontal: 4,
  },
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
  },
  btnText: {
    fontSize: 15,
    fontWeight: '600',
  },
});
