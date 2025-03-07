import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, TextInput, Dimensions } from 'react-native';
import { useTheme } from '../context/ThemeContext';
import { theme } from '../constants/theme';
import { Ionicons } from '@expo/vector-icons';

interface ModelSettingDialogProps {
  visible: boolean;
  onClose: () => void;
  onSave: (value: number) => void;
  label: string;
  value: number;
  defaultValue: number;
  minimumValue: number;
  maximumValue: number;
  step: number;
  description: string;
}

export default function ModelSettingDialog({
  visible,
  onClose,
  onSave,
  label,
  value = 0,
  defaultValue = 0,
  minimumValue = 0,
  maximumValue = 100,
  step = 1,
  description,
}: ModelSettingDialogProps) {
  const { theme: currentTheme } = useTheme();
  const themeColors = theme[currentTheme];
  const [currentValue, setCurrentValue] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (visible) {
      setCurrentValue(formatValue(value));
      setError(null);
    }
  }, [visible, value]);

  const handleSave = () => {
    const numValue = parseFloat(currentValue);
    if (isNaN(numValue)) {
      setError('Please enter a valid number');
      return;
    }
    if (numValue < minimumValue || numValue > maximumValue) {
      setError(`Value must be between ${formatValue(minimumValue)} and ${formatValue(maximumValue)}`);
      return;
    }
    onSave(numValue);
    onClose();
  };

  const handleReset = () => {
    setCurrentValue(formatValue(defaultValue));
    setError(null);
  };

  const formatValue = (val: number) => {
    return step >= 1 ? val.toFixed(0) : val.toFixed(2);
  };

  const handleChangeText = (text: string) => {
    setCurrentValue(text);
    setError(null);
  };

  const showResetButton = parseFloat(currentValue) !== defaultValue;

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
            <Text style={[styles.title, { color: themeColors.text }]}>{label}</Text>
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
                borderColor: error ? '#FF3B30' : themeColors.borderColor,
              },
            ]}
            value={currentValue}
            onChangeText={handleChangeText}
            placeholder={`Enter value (${formatValue(minimumValue)}-${formatValue(maximumValue)})`}
            placeholderTextColor={themeColors.secondaryText}
            keyboardType="numeric"
          />

          {error && (
            <Text style={styles.errorText}>
              {error}
            </Text>
          )}

          <View style={styles.rangeContainer}>
            <Text style={[styles.rangeText, { color: themeColors.secondaryText }]}>
              Range: {formatValue(minimumValue)} - {formatValue(maximumValue)}
            </Text>
            <Text style={[styles.rangeText, { color: themeColors.secondaryText }]}>
              Default: {formatValue(defaultValue)}
            </Text>
          </View>

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
    height: 48,
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    fontSize: 16,
    marginBottom: 8,
    textAlign: 'center',
  },
  errorText: {
    fontSize: 12,
    color: '#FF3B30',
    marginBottom: 8,
  },
  rangeContainer: {
    marginBottom: 24,
    alignItems: 'center',
    gap: 4,
  },
  rangeText: {
    fontSize: 14,
  },
  footer: {
    gap: 12,
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
}); 