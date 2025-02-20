import React from 'react';
import { View, Text, StyleSheet, Image, Platform } from 'react-native';
import { useTheme } from '../context/ThemeContext';
import { theme } from '../constants/theme';

export default function AppHeader() {
  const { theme: currentTheme } = useTheme();
  const themeColors = theme[currentTheme];

  return (
    <View style={[styles.header, { backgroundColor: themeColors.background }]}>
      <Image 
        source={require('../../assets/icon.png')} 
        style={styles.icon} 
        resizeMode="contain"
      />
      <Text style={[styles.title, { color: themeColors.text }]}>
        Ragionare
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    paddingTop: Platform.OS === 'ios' ? 60 : 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0, 0, 0, 0.1)',
  },
  icon: {
    width: 32,
    height: 32,
    marginRight: 8,
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
  },
}); 