import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Platform, TouchableOpacity, View, Text, StyleSheet, Keyboard } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import React, { useState, useEffect } from 'react';
import HomeScreen from '../screens/HomeScreen';
import SettingsScreen from '../screens/SettingsScreen';
import ModelScreen from '../screens/ModelScreen';
import { TabParamList } from '../types/navigation';
import { useTheme } from '../context/ThemeContext';
import { theme } from '../constants/theme';
import { OpenSansFont } from '../hooks/OpenSansFont';
import { useResponsive } from '../hooks/useResponsive';
import TabletLayout from '../components/TabletLayout';

const Tab = createBottomTabNavigator<TabParamList>();

// a custom tab bar to avoid the ripple effect on android

function CustomTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const { theme: currentTheme } = useTheme();
  const themeColors = theme[currentTheme];
  const insets = useSafeAreaInsets();
  const [isKeyboardVisible, setKeyboardVisible] = useState(false);
  const { fonts } = OpenSansFont();
  const { tabBarHeight, fontSize, isTablet } = useResponsive();

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

  if (isKeyboardVisible) {
    return null;
  }

  return (
    <View style={[
      styles.tabBar,
      {
        backgroundColor: themeColors.tabBarBackground,
        height: tabBarHeight + insets.bottom,
        paddingBottom: insets.bottom,
      }
    ]}>
      {state.routes.map((route, index) => {
        const { options } = descriptors[route.key];
        const label = options.tabBarLabel || route.name;
        const isFocused = state.index === index;

        let iconName: string;
        switch (route.name) {
          case 'HomeTab':
            iconName = isFocused ? 'home' : 'home-outline';
            break;
          case 'ModelTab':
            iconName = isFocused ? 'cube' : 'cube-outline';
            break;
          case 'SettingsTab':
            iconName = isFocused ? 'cog' : 'cog-outline';
            break;
          default:
            iconName = 'alert-circle';
        }

        const onPress = () => {
          const event = navigation.emit({
            type: 'tabPress',
            target: route.key,
            canPreventDefault: true,
          });

          if (!isFocused && !event.defaultPrevented) {
            navigation.navigate(route.name);
          }
        };

        return (
          <TouchableOpacity
            key={index}
            activeOpacity={1}
            onPress={onPress}
            style={styles.tabItem}
          >
            <MaterialCommunityIcons
              name={iconName as any}
              size={isTablet ? 28 : 24}
              color={isFocused ? themeColors.tabBarActiveText : themeColors.tabBarInactiveText}
            />
            <Text
              style={[
                {
                  color: isFocused ? themeColors.tabBarActiveText : themeColors.tabBarInactiveText,
                  fontSize: fontSize.small,
                  marginTop: isTablet ? 6 : 4,
                },
                fonts.medium
              ]}
            >
              {label as string}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

function TabletTabBar({ state, navigation }: BottomTabBarProps) {
  return (
    <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}>
      <TabletLayout state={state} navigation={navigation}>
        {null}
      </TabletLayout>
    </View>
  );
}

// Empty component for tablet screens since TabletLayout handles rendering
function EmptyScreen() {
  return null;
}

export default function MainTabNavigator() {
  const { isTablet } = useResponsive();

  return (
    <Tab.Navigator
      tabBar={props => isTablet ? <TabletTabBar {...props} /> : <CustomTabBar {...props} />}
      screenOptions={{
        headerShown: false,
      }}
    >
      <Tab.Screen 
        name="HomeTab" 
        component={isTablet ? EmptyScreen : HomeScreen} 
        options={{ 
          tabBarLabel: 'Chat'
        }}
      />
      <Tab.Screen 
        name="ModelTab" 
        component={isTablet ? EmptyScreen : ModelScreen}
        options={{ 
          tabBarLabel: 'Models'
        }}
      />
      <Tab.Screen 
        name="SettingsTab" 
        component={isTablet ? EmptyScreen : SettingsScreen}
        options={{ 
          tabBarLabel: 'Settings'
        }}
      />
    </Tab.Navigator>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    flexDirection: 'row',
    borderTopWidth: 0,
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
}); 