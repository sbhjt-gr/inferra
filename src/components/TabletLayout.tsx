import React from 'react';
import { View, StyleSheet } from 'react-native';
import { useTheme } from '../context/ThemeContext';
import { theme } from '../constants/theme';
import TabletSideNavigation from './TabletSideNavigation';
import HomeScreen from '../screens/HomeScreen';
import ModelScreen from '../screens/ModelScreen';
import SettingsScreen from '../screens/SettingsScreen';

interface TabletLayoutProps {
  state: any;
  navigation: any;
  children: React.ReactNode;
}

const screenComponents = {
  HomeTab: HomeScreen,
  ModelTab: ModelScreen,
  SettingsTab: SettingsScreen,
};

export default function TabletLayout({
  state,
  navigation,
  children,
}: TabletLayoutProps) {
  const { theme: currentTheme } = useTheme();
  const themeColors = theme[currentTheme as 'light' | 'dark'];
  
  const currentRoute = state.routes[state.index];
  const CurrentScreen = screenComponents[currentRoute.name as keyof typeof screenComponents];

  return (
    <View style={[styles.container, { backgroundColor: themeColors.background }]}>
      <TabletSideNavigation state={state} navigation={navigation} />
      <View style={styles.content}>
        {CurrentScreen && <CurrentScreen navigation={navigation} route={currentRoute} />}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    flexDirection: 'row',
  },
  content: {
    flex: 1,
  },
});