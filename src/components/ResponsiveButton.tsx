import React from 'react';
import {
  TouchableOpacity,
  Text,
  StyleSheet,
  ViewStyle,
  TextStyle,
  TouchableOpacityProps,
} from 'react-native';
import { useTheme } from '../context/ThemeContext';
import { theme } from '../constants/theme';
import { useResponsive } from '../hooks/useResponsive';

interface ResponsiveButtonProps extends TouchableOpacityProps {
  title: string;
  variant?: 'primary' | 'secondary' | 'outline';
  size?: 'small' | 'medium' | 'large';
  buttonStyle?: ViewStyle;
  textStyle?: TextStyle;
}

export default function ResponsiveButton({
  title,
  variant = 'primary',
  size = 'medium',
  buttonStyle,
  textStyle,
  disabled,
  ...props
}: ResponsiveButtonProps) {
  const { theme: currentTheme } = useTheme();
  const themeColors = theme[currentTheme as 'light' | 'dark'];
  const { dialog } = useResponsive();

  const getBackgroundColor = () => {
    if (disabled) return themeColors.borderColor;
    
    switch (variant) {
      case 'primary':
        return themeColors.primary;
      case 'secondary':
        return themeColors.cardBackground;
      case 'outline':
        return 'transparent';
      default:
        return themeColors.primary;
    }
  };

  const getTextColor = () => {
    if (disabled) return themeColors.secondaryText;
    
    switch (variant) {
      case 'primary':
        return '#fff';
      case 'secondary':
        return themeColors.text;
      case 'outline':
        return themeColors.primary;
      default:
        return '#fff';
    }
  };

  const getHeight = () => {
    switch (size) {
      case 'small':
        return dialog.buttonHeight * 0.8;
      case 'large':
        return dialog.buttonHeight * 1.2;
      default:
        return dialog.buttonHeight;
    }
  };

  const containerStyle = [
    styles.button,
    {
      backgroundColor: getBackgroundColor(),
      borderColor: variant === 'outline' ? themeColors.primary : 'transparent',
      borderWidth: variant === 'outline' ? 1 : 0,
      height: getHeight(),
      borderRadius: dialog.borderRadius / 2,
      opacity: disabled ? 0.6 : 1,
    },
    buttonStyle,
  ];

  const titleStyle = [
    styles.text,
    {
      color: getTextColor(),
      fontSize: size === 'small' ? 14 : size === 'large' ? 18 : 16,
    },
    textStyle,
  ];

  return (
    <TouchableOpacity
      style={containerStyle}
      disabled={disabled}
      activeOpacity={0.8}
      {...props}
    >
      <Text style={titleStyle}>{title}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  text: {
    fontWeight: '600',
  },
});