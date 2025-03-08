import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useTheme } from '../context/ThemeContext';
import { theme } from '../constants/theme';
import { Ionicons } from '@expo/vector-icons';

interface SettingSliderProps {
  label: string;
  value: number;
  defaultValue: number;
  onValueChange: (value: number) => void;
  minimumValue: number;
  maximumValue: number;
  step: number;
  description: string;
  onPressChange: () => void;
}

export default function SettingSlider({
  label,
  value,
  defaultValue,
  onValueChange,
  minimumValue,
  maximumValue,
  step,
  description,
  onPressChange,
}: SettingSliderProps) {
  const { theme: currentTheme } = useTheme();
  const themeColors = theme[currentTheme];
  const iconColor = currentTheme === 'dark' ? '#FFFFFF' : themeColors.primary;

  const handleReset = () => {
    onValueChange(defaultValue);
  };

  const isDefaultValue = value === defaultValue;

  return (
    <TouchableOpacity 
      style={[styles.settingItem, styles.settingItemBorder]}
      onPress={onPressChange}
    >
      <View style={styles.settingLeft}>
        <View style={[styles.iconContainer, { backgroundColor: currentTheme === 'dark' ? 'rgba(255, 255, 255, 0.2)' : themeColors.primary + '20' }]}>
          <Ionicons name="options-outline" size={22} color={iconColor} />
        </View>
        <View style={styles.settingTextContainer}>
          <View style={styles.labelRow}>
            <Text style={[styles.settingText, { color: themeColors.text }]}>
              {label}
            </Text>
            <Text style={[styles.valueText, { color: themeColors.text }]}>
              {value.toFixed(2)}
            </Text>
          </View>
          <Text style={[styles.settingDescription, { color: themeColors.secondaryText }]}>
            {description}
          </Text>
          {!isDefaultValue && (
            <TouchableOpacity
              onPress={handleReset}
              style={[styles.resetButton, { backgroundColor: currentTheme === 'dark' ? 'rgba(255, 255, 255, 0.2)' : themeColors.primary + '20' }]}
            >
              <Ionicons name="refresh-outline" size={14} color={iconColor} />
              <Text style={[styles.resetText, { color: iconColor }]}>Reset to Default</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
      <Ionicons name="chevron-forward" size={20} color={themeColors.secondaryText} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  settingItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    padding: 16,
  },
  settingItemBorder: {
    borderTopWidth: 1,
    borderTopColor: 'rgba(150, 150, 150, 0.1)',
  },
  settingLeft: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    flex: 1,
    marginRight: 12,
  },
  iconContainer: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  settingTextContainer: {
    flex: 1,
  },
  labelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 2,
  },
  settingText: {
    fontSize: 16,
    fontWeight: '500',
  },
  valueText: {
    fontSize: 16,
    fontWeight: '500',
  },
  settingDescription: {
    fontSize: 13,
    marginBottom: 8,
  },
  resetButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
    padding: 4,
    borderRadius: 4,
  },
  resetText: {
    fontSize: 12,
    fontWeight: '500',
  },
}); 