import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { theme } from '../constants/theme';
import { useResponsive } from '../hooks/useResponsive';
import { NavigationHelpers, ParamListBase } from '@react-navigation/native';
import { BottomTabNavigationEventMap } from '@react-navigation/bottom-tabs';

interface TabletSideNavigationProps {
  state: any;
  navigation: NavigationHelpers<ParamListBase, BottomTabNavigationEventMap>;
}

interface NavigationItem {
  name: string;
  label: string;
  icon: string;
  activeIcon: string;
}

const navigationItems: NavigationItem[] = [
  {
    name: 'HomeTab',
    label: 'Chat',
    icon: 'home-outline',
    activeIcon: 'home',
  },
  {
    name: 'ModelTab',
    label: 'Models',
    icon: 'cube-outline',
    activeIcon: 'cube',
  },
  {
    name: 'SettingsTab',
    label: 'Settings',
    icon: 'cog-outline',
    activeIcon: 'cog',
  },
];

export default function TabletSideNavigation({
  state,
  navigation,
}: TabletSideNavigationProps) {
  const { theme: currentTheme } = useTheme();
  const themeColors = theme[currentTheme as 'light' | 'dark'];
  const { paddingHorizontal, fontSize } = useResponsive();

  const handleTabPress = (routeName: string, index: number) => {
    const event = navigation.emit({
      type: 'tabPress',
      target: state.routes[index].key,
      canPreventDefault: true,
    });

    if (!event.defaultPrevented) {
      navigation.navigate(routeName);
    }
  };

  return (
    <View style={[
      styles.container,
      {
        backgroundColor: themeColors.tabBarBackground,
        paddingHorizontal: paddingHorizontal / 2,
      }
    ]}>
      <ScrollView 
        style={styles.scrollContainer}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.contentContainer}
      >
        <View style={styles.header}>
          <MaterialCommunityIcons
            name="cube"
            size={32}
            color={themeColors.tabBarActiveText}
          />
          <Text style={[
            styles.appTitle,
            {
              color: themeColors.tabBarActiveText,
              fontSize: fontSize.large,
            }
          ]}>
            Inferra
          </Text>
        </View>

        <View style={styles.navigationItems}>
          {navigationItems.map((item, index) => {
            const isFocused = state.index === index;
            const route = state.routes[index];

            return (
              <TouchableOpacity
                key={item.name}
                style={[
                  styles.navigationItem,
                  {
                    backgroundColor: isFocused 
                      ? themeColors.tabBarActiveText + '15' 
                      : 'transparent',
                  }
                ]}
                onPress={() => handleTabPress(route.name, index)}
                activeOpacity={0.7}
              >
                <MaterialCommunityIcons
                  name={isFocused ? item.activeIcon : item.icon}
                  size={24}
                  color={
                    isFocused 
                      ? themeColors.tabBarActiveText 
                      : themeColors.tabBarInactiveText
                  }
                />
                <Text
                  style={[
                    styles.navigationLabel,
                    {
                      color: isFocused 
                        ? themeColors.tabBarActiveText 
                        : themeColors.tabBarInactiveText,
                      fontSize: fontSize.medium,
                      fontWeight: isFocused ? '600' : '400',
                    }
                  ]}
                >
                  {item.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: 240,
    height: '100%',
    borderRightWidth: 1,
    borderRightColor: 'rgba(255, 255, 255, 0.1)',
  },
  scrollContainer: {
    flex: 1,
  },
  contentContainer: {
    paddingVertical: 20,
    flexGrow: 1,
  },
  header: {
    alignItems: 'center',
    paddingVertical: 20,
    marginBottom: 20,
  },
  appTitle: {
    fontWeight: '700',
    marginTop: 8,
    letterSpacing: 0.5,
  },
  navigationItems: {
    flex: 1,
    paddingVertical: 10,
  },
  navigationItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginVertical: 2,
    borderRadius: 12,
  },
  navigationLabel: {
    marginLeft: 16,
    flex: 1,
  },
  footer: {
    paddingTop: 20,
    alignItems: 'center',
  },
  divider: {
    height: 1,
    width: '60%',
    marginBottom: 12,
  },
  footerText: {
    fontWeight: '500',
    opacity: 0.7,
  },
});