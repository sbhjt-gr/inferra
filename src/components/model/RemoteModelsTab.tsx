import React from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { useTheme } from '../../context/ThemeContext';
import { theme } from '../../constants/theme';
import ApiKeySection from './ApiKeySection';

export const RemoteModelsTab: React.FC = () => {
  const { theme: currentTheme } = useTheme();
  const themeColors = theme[currentTheme as 'light' | 'dark'];

  return (
    <View style={styles.container}>
      <ScrollView 
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 16, paddingTop: 8 }}
        showsVerticalScrollIndicator={false}
      >
        <Text style={[styles.sectionTitle, { color: themeColors.text, marginBottom: 16 }]}>
          API Settings for Remote Models
        </Text>
        <ApiKeySection />
        <View style={{ height: 20 }} />
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 16,
  },
});
