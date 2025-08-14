import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../../context/ThemeContext';
import { theme } from '../../constants/theme';
import { useResponsive } from '../../hooks/useResponsive';
import { getResponsiveValue } from '../../utils/ResponsiveUtils';

type SettingsSectionProps = {
  title: string;
  children: React.ReactNode;
};

const SettingsSection = ({ title, children }: SettingsSectionProps) => {
  const { theme: currentTheme } = useTheme();
  const themeColors = theme[currentTheme];
  const { fontSize } = useResponsive();
  const marginHorizontal = getResponsiveValue(16, 32);

  return (
    <View style={[styles.section, { marginHorizontal }]}>
      <Text style={[styles.sectionTitle, { color: themeColors.secondaryText, fontSize: fontSize.small }]}>
        {title}
      </Text>
      <View style={[styles.sectionContent, { backgroundColor: themeColors.borderColor }]}>
        {children}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontWeight: '600',
    marginBottom: 8,
    marginLeft: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  sectionContent: {
    borderRadius: 16,
    overflow: 'hidden',
  },
});

export default SettingsSection; 