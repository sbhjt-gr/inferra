import React, { useState } from 'react';
import { View, StyleSheet, TouchableOpacity, Text } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import HomeScreen from '../screens/HomeScreen';
import SettingsScreen from '../screens/SettingsScreen';
import ModelScreen from '../screens/ModelScreen';
import { useTheme } from '../context/ThemeContext';
import { LayoutProvider } from '../context/LayoutContext';
import { theme } from '../constants/theme';
import { OpenSansFont } from '../hooks/OpenSansFont';
import { useResponsiveLayout } from '../hooks/useResponsiveLayout';

type TabType = 'models' | 'settings';

interface WideScreenLayoutProps {
  // Navigation props can be passed down if needed
}

export default function WideScreenLayout({}: WideScreenLayoutProps) {
  const { theme: currentTheme } = useTheme();
  const themeColors = theme[currentTheme];
  const insets = useSafeAreaInsets();
  const { fonts } = OpenSansFont();
  const { sidebarWidth, chatWidth } = useResponsiveLayout();
  const [activeTab, setActiveTab] = useState<TabType>('models');
  const navigation = useNavigation();
  const route = useRoute();

  const TabButton = ({ 
    tab, 
    icon, 
    label, 
    isActive 
  }: { 
    tab: TabType; 
    icon: string; 
    label: string; 
    isActive: boolean;
  }) => (
    <TouchableOpacity
      style={styles.tabItem}
      onPress={() => setActiveTab(tab)}
    >
      <MaterialCommunityIcons
        name={icon as any}
        size={24}
        color={isActive ? themeColors.tabBarActiveText : themeColors.tabBarInactiveText}
      />
      <Text
        style={[
          styles.tabLabel,
          {
            color: isActive ? themeColors.tabBarActiveText : themeColors.tabBarInactiveText,
          },
          fonts.medium
        ]}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );

  const renderSidebarContent = () => {
    switch (activeTab) {
      case 'models':
        return <ModelScreen navigation={navigation as any} />;
      case 'settings':
        return <SettingsScreen navigation={navigation as any} />;
      default:
        return <ModelScreen navigation={navigation as any} />;
    }
  };

  return (
    <LayoutProvider constrainToChat={true}>
      <View style={[styles.container, { backgroundColor: themeColors.background }]}>
        {/* Sidebar */}
        <View style={[
          styles.sidebar,
          {
            width: sidebarWidth,
            backgroundColor: themeColors.background,
          }
        ]}>
          {/* Tab content */}
          <View style={styles.tabContent}>
            {renderSidebarContent()}
          </View>

          {/* Tab bar at bottom */}
          <View style={[
            styles.tabBar,
            {
              backgroundColor: themeColors.tabBarBackground,
              height: 70 + insets.bottom,
              paddingBottom: insets.bottom,
            }
          ]}>
            <TabButton
              tab="models"
              icon={activeTab === 'models' ? 'cube' : 'cube-outline'}
              label="Models"
              isActive={activeTab === 'models'}
            />
            <TabButton
              tab="settings"
              icon={activeTab === 'settings' ? 'cog' : 'cog-outline'}
              label="Settings"
              isActive={activeTab === 'settings'}
            />
          </View>
        </View>

        {/* Chat area */}
        <View style={[
          styles.chatArea,
          {
            width: chatWidth,
            backgroundColor: themeColors.background,
          }
        ]}>
          <HomeScreen navigation={navigation as any} route={route as any} />
        </View>
      </View>
    </LayoutProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    flexDirection: 'row',
  },
  sidebar: {
  },
  tabContent: {
    flex: 1,
  },
  tabBar: {
    flexDirection: 'row',
    borderTopWidth: 0,
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabLabel: {
    fontSize: 12,
    marginTop: 4,
  },
  chatArea: {
    flex: 1,
  },
});
