import React from 'react';
import { View, StyleSheet, StatusBar, Dimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
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
  const insets = useSafeAreaInsets();
  const screenHeight = Dimensions.get('window').height;
  
  const currentRoute = state.routes[state.index];
  const CurrentScreen = screenComponents[currentRoute.name as keyof typeof screenComponents];

  return (
    <View style={[
      styles.container, 
      { 
        backgroundColor: themeColors.background,
        height: screenHeight,
      }
    ]}>
      <View 
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: insets.top,
          backgroundColor: '#660880',
          zIndex: 999,
        }}
      />
      <View style={[styles.content, { paddingTop: insets.top }]}>
        <TabletSideNavigation state={state} navigation={navigation} />
        <View style={styles.mainContent}>
          {CurrentScreen && <CurrentScreen navigation={navigation} route={currentRoute} />}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    flexDirection: 'column',
  },
  content: {
    flex: 1,
    flexDirection: 'row',
  },
  mainContent: {
    flex: 1,
  },
});