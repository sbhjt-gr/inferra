import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Text, Chip } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import { theme } from '../../constants/theme';

interface AIContentLabelProps {
  type: 'local' | 'remote' | 'ocr';
  modelName?: string;
  style?: any;
}

export default function AIContentLabel({ type, modelName, style }: AIContentLabelProps) {
  const { theme: currentTheme } = useTheme();
  const themeColors = theme[currentTheme];

  const getIconAndText = () => {
    switch (type) {
      case 'local':
        return {
          icon: 'robot',
          text: `AI Generated${modelName ? ` • ${modelName}` : ''}`,
          color: '#2196F3'
        };
      case 'remote':
        return {
          icon: 'cloud-outline',
          text: `AI Generated${modelName ? ` • ${modelName}` : ''}`,
          color: '#4CAF50'
        };
      case 'ocr':
        return {
          icon: 'text-recognition',
          text: 'OCR Extracted Text',
          color: '#FF9800'
        };
      default:
        return {
          icon: 'robot',
          text: 'AI Generated',
          color: '#2196F3'
        };
    }
  };

  const { icon, text, color } = getIconAndText();

  return (
    <View style={[styles.container, style]}>
      <Chip
        icon={({ size }) => (
          <MaterialCommunityIcons 
            name={icon as any} 
            size={size * 0.8} 
            color={color} 
          />
        )}
        textStyle={[styles.chipText, { color }]}
        style={[styles.chip, { backgroundColor: color + '15' }]}
        compact
      >
        {text}
      </Chip>
    </View>
  );
}

export function AIDisclosureNotice() {
  const { theme: currentTheme } = useTheme();
  const themeColors = theme[currentTheme];

  return (
    <View style={[styles.noticeContainer, { backgroundColor: themeColors.primary + '10' }]}>
      <MaterialCommunityIcons 
        name="information-outline" 
        size={16} 
        color={themeColors.primary} 
        style={styles.noticeIcon}
      />
      <Text style={[styles.noticeText, { color: themeColors.text }]}>
        This app uses AI to generate responses. AI-generated content may contain inaccuracies.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignSelf: 'flex-start',
    marginBottom: 8,
  },
  chip: {
    height: 24,
    borderRadius: 12,
  },
  chipText: {
    fontSize: 11,
    fontWeight: '500',
  },
  noticeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 8,
    margin: 16,
  },
  noticeIcon: {
    marginRight: 8,
  },
  noticeText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 16,
  },
});
