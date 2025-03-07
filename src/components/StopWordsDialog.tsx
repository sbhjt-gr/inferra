import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, TextInput, Dimensions } from 'react-native';
import { useTheme } from '../context/ThemeContext';
import { theme } from '../constants/theme';
import { Ionicons } from '@expo/vector-icons';

interface StopWordsDialogProps {
  visible: boolean;
  onClose: () => void;
  onSave: (stopWords: string[]) => void;
  value: string[];
  defaultValue: string[];
  description: string;
}

export default function StopWordsDialog({
  visible,
  onClose,
  onSave,
  value,
  defaultValue,
  description,
}: StopWordsDialogProps) {
  const { theme: currentTheme } = useTheme();
  const themeColors = theme[currentTheme];
  const [currentValue, setCurrentValue] = useState('');

  // Update currentValue when the dialog becomes visible or value changes
  useEffect(() => {
    if (visible) {
      setCurrentValue(value.join('\n'));
    }
  }, [visible, value]);

  const handleSave = () => {
    const newStopWords = currentValue
      .split('\n')
      .map(word => word.trim())
      .filter(word => word.length > 0);
    onSave(newStopWords);
    onClose();
  };

  const handleReset = () => {
    setCurrentValue(defaultValue.join('\n'));
  };

  const showResetButton = JSON.stringify(currentValue.split('\n').map(s => s.trim()).filter(s => s.length > 0)) !== 
                         JSON.stringify(defaultValue);

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.modalOverlay}>
        <View style={[styles.modalContent, { backgroundColor: themeColors.background }]}>
          <View style={styles.header}>
            <Text style={[styles.title, { color: themeColors.text }]}>Stop Words</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Ionicons name="close" size={24} color={themeColors.text} />
            </TouchableOpacity>
          </View>
          
          <Text style={[styles.description, { color: themeColors.secondaryText }]}>
            {description}
          </Text>

          <TextInput
            style={[
              styles.input,
              {
                color: themeColors.text,
                backgroundColor: themeColors.borderColor + '40',
                borderColor: themeColors.borderColor,
              },
            ]}
            value={currentValue}
            onChangeText={setCurrentValue}
            placeholder="Enter stop words (one per line)"
            placeholderTextColor={themeColors.secondaryText}
            multiline
            numberOfLines={6}
            textAlignVertical="top"
          />

          <View style={styles.footer}>
            {showResetButton && (
              <TouchableOpacity
                style={[styles.resetButton, { backgroundColor: themeColors.primary + '20' }]}
                onPress={handleReset}
              >
                <Ionicons name="refresh-outline" size={20} color={themeColors.primary} />
                <Text style={[styles.resetText, { color: themeColors.primary }]}>Reset to Default</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={[styles.saveButton, { backgroundColor: themeColors.primary }]}
              onPress={handleSave}
            >
              <Text style={styles.saveButtonText}>Save Changes</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.defaultValueContainer}>
            <Text style={[styles.defaultValueLabel, { color: themeColors.secondaryText }]}>
              Default Values:
            </Text>
            <Text style={[styles.defaultValueText, { color: themeColors.text }]}>
              {defaultValue.join('\n')}
            </Text>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    width: Dimensions.get('window').width - 48,
    borderRadius: 16,
    padding: 24,
    maxHeight: Dimensions.get('window').height - 100,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
  },
  closeButton: {
    padding: 4,
  },
  description: {
    fontSize: 14,
    marginBottom: 24,
  },
  input: {
    width: '100%',
    height: 120,
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    fontSize: 16,
    marginBottom: 24,
  },
  footer: {
    gap: 12,
    marginBottom: 24,
  },
  resetButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: 12,
    borderRadius: 12,
  },
  resetText: {
    fontSize: 16,
    fontWeight: '500',
  },
  saveButton: {
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  saveButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  defaultValueContainer: {
    padding: 12,
    backgroundColor: 'rgba(150, 150, 150, 0.1)',
    borderRadius: 12,
  },
  defaultValueLabel: {
    fontSize: 14,
    fontWeight: '500',
    marginBottom: 8,
  },
  defaultValueText: {
    fontSize: 14,
    lineHeight: 20,
  },
}); 