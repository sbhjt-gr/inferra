import React from 'react';
import { Switch as RNSwitch, SwitchProps } from 'react-native';
import { useTheme } from '../../context/ThemeContext';
import { theme } from '../../constants/theme';

type AppSwitchProps = SwitchProps;

export function AppSwitch({
  value = false,
  trackColor,
  thumbColor,
  ios_backgroundColor,
  ...rest
}: AppSwitchProps) {
  const { theme: currentTheme } = useTheme();
  const themeColors = theme[currentTheme];

  const resolvedTrackColor = trackColor ?? {
    false: themeColors.borderColor,
    true: themeColors.primary + '80',
  };

  const resolvedThumbColor =
    thumbColor ?? (value ? themeColors.primary : themeColors.background);

  const resolvedIosBg = ios_backgroundColor ?? themeColors.borderColor;

  console.log('switch_render', value);

  return (
    <RNSwitch
      value={value}
      trackColor={resolvedTrackColor}
      thumbColor={resolvedThumbColor}
      ios_backgroundColor={resolvedIosBg}
      {...rest}
    />
  );
}
