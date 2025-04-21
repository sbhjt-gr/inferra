import { createNativeStackNavigator } from '@react-navigation/native-stack';
import MainTabNavigator from './MainTabNavigator';
import SettingsScreen from '../screens/SettingsScreen';
import ChatHistoryScreen from '../screens/ChatHistoryScreen';
import DownloadsScreen from '../screens/DownloadsScreen';
import { useTheme } from '../context/ThemeContext';
import { theme } from '../constants/theme';
import { RootStackParamList } from '../types/navigation';
import React from 'react';

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function RootNavigator() {
  const { theme: currentTheme } = useTheme();
  const themeColors = theme[currentTheme];

  return (
      <Stack.Navigator
        screenOptions={{
          headerShown: false,
        }}
      >
        <Stack.Screen name="MainTabs" component={MainTabNavigator} />
        <Stack.Screen name="Settings" component={SettingsScreen} />
        <Stack.Screen 
          name="ChatHistory" 
          component={ChatHistoryScreen}
          options={{
            animation: 'slide_from_right'
          }}
        />
        <Stack.Screen name="Downloads" component={DownloadsScreen} />
      </Stack.Navigator>
  );
} 