import React, { useState } from 'react';
import { BottomNavigation } from 'react-native-paper';
import { useTheme } from '../context/ThemeContext';
import { theme } from '../constants/theme';
import { Platform, Keyboard, StyleSheet } from 'react-native';
import HomeScreen from '../screens/HomeScreen';
import SettingsScreen from '../screens/SettingsScreen';
import ModelScreen from '../screens/ModelScreen';
import { useEffect } from 'react';
import { NavigationProp, useNavigation, ParamListBase } from '@react-navigation/native';
import { TabParamList, RootStackParamList } from '../types/navigation';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';

// Create wrapper components to pass required props to each screen
const HomeRoute = () => {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  return (
    <HomeScreen 
      navigation={navigation} 
      route={{ 
        key: 'home', 
        name: 'HomeTab', 
        params: {} 
      }} 
    />
  );
};

const ModelsRoute = () => {
  const navigation = useNavigation<NavigationProp<ParamListBase>>();
  return <ModelScreen navigation={navigation as any} />;
};

const SettingsRoute = () => {
  const navigation = useNavigation<NavigationProp<ParamListBase>>();
  return <SettingsScreen navigation={navigation as any} />;
};

export default function MainTabNavigator() {
  const { theme: currentTheme } = useTheme();
  const themeColors = theme[currentTheme];
  const [index, setIndex] = useState(0);
  const [isKeyboardVisible, setKeyboardVisible] = useState(false);

  // Setup routes for bottom navigation
  const [routes] = useState([
    { 
      key: 'home', 
      title: 'Chat', 
      focusedIcon: 'home',
      unfocusedIcon: 'home-outline'
    },
    { 
      key: 'models', 
      title: 'Models', 
      focusedIcon: 'cube',
      unfocusedIcon: 'cube-outline'
    },
    { 
      key: 'settings', 
      title: 'Settings', 
      focusedIcon: 'cog',
      unfocusedIcon: 'cog-outline'
    },
  ]);

  useEffect(() => {
    const keyboardWillShowListener = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      () => {
        setKeyboardVisible(true);
      }
    );
    const keyboardWillHideListener = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      () => {
        setKeyboardVisible(false);
      }
    );

    return () => {
      keyboardWillShowListener.remove();
      keyboardWillHideListener.remove();
    };
  }, []);

  // Use wrapper components that provide proper navigation props
  const renderScene = BottomNavigation.SceneMap({
    home: HomeRoute,
    models: ModelsRoute,
    settings: SettingsRoute,
  });

  const handleIndexChange = (newIndex: number) => {
    setIndex(newIndex);
  };

  return (
    <BottomNavigation
      navigationState={{ index, routes }}
      onIndexChange={handleIndexChange}
      renderScene={renderScene}
      shifting={false}
      labeled={true}
      keyboardHidesNavigationBar={true}
      activeColor={themeColors.tabBarActiveText}
      inactiveColor={themeColors.tabBarInactiveText}
      barStyle={{
        backgroundColor: themeColors.tabBarBackground,
      }}
      style={styles.bottomNav}
    />
  );
}

const styles = StyleSheet.create({
  bottomNav: {
    flex: 1,
  },
}); 