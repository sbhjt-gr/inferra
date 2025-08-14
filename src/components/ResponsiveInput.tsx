import React from 'react';
import {
  TextInput,
  StyleSheet,
  TextInputProps,
  ViewStyle,
} from 'react-native';
import { useTheme } from '../context/ThemeContext';
import { theme } from '../constants/theme';
import { useResponsive } from '../hooks/useResponsive';

interface ResponsiveInputProps extends TextInputProps {
  variant?: 'standard' | 'multiline';
  error?: boolean;
  containerStyle?: ViewStyle;
}

export default function ResponsiveInput({
  variant = 'standard',
  error = false,
  style,
  containerStyle,
  ...props
}: ResponsiveInputProps) {
  const { theme: currentTheme } = useTheme();
  const themeColors = theme[currentTheme as 'light' | 'dark'];
  const { dialog } = useResponsive();

  const inputStyle = [
    styles.input,
    {
      color: themeColors.text,
      backgroundColor: themeColors.cardBackground,
      borderColor: error ? themeColors.error : themeColors.borderColor,
      height: variant === 'multiline' ? dialog.inputHeight * 4 : dialog.inputHeight,
      paddingHorizontal: dialog.inputPadding,
      paddingVertical: variant === 'multiline' ? dialog.inputPadding : 0,
      borderRadius: dialog.borderRadius / 2,
      fontSize: 16,
    },
    style,
  ];

  return (
    <TextInput
      style={inputStyle}
      placeholderTextColor={themeColors.secondaryText}
      multiline={variant === 'multiline'}
      textAlignVertical={variant === 'multiline' ? 'top' : 'center'}
      {...props}
    />
  );
}

const styles = StyleSheet.create({
  input: {
    borderWidth: 1,
    minHeight: 44,
  },
});