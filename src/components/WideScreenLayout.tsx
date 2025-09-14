import React, { useState, useRef, useEffect } from 'react';
import { View, StyleSheet, TouchableOpacity, Text, Animated } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { PanGestureHandler, State } from 'react-native-gesture-handler';
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

const SIDEBAR_WIDTH_STORAGE_KEY = 'widescreen_sidebar_width';

interface WideScreenLayoutProps {
  // Navigation props 
}

export default function WideScreenLayout({}: WideScreenLayoutProps) {
  const { theme: currentTheme } = useTheme();
  const themeColors = theme[currentTheme];
  const insets = useSafeAreaInsets();
  const { fonts } = OpenSansFont();
  const { screenWidth } = useResponsiveLayout();
  const [activeTab, setActiveTab] = useState<TabType>('models');
  const navigation = useNavigation();
  const route = useRoute();

  const [sidebarWidth, setSidebarWidth] = useState(screenWidth * 0.3);
  const [isDragging, setIsDragging] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);
  const translateX = useRef(new Animated.Value(0)).current;
  const MIN_SIDEBAR_WIDTH = 200;
  const MAX_SIDEBAR_WIDTH = screenWidth * 0.6;

  const chatWidth = screenWidth - sidebarWidth;

  const loadSidebarWidth = async () => {
    try {
      const savedWidth = await AsyncStorage.getItem(SIDEBAR_WIDTH_STORAGE_KEY);
      if (savedWidth) {
        const width = parseFloat(savedWidth);
        if (width >= MIN_SIDEBAR_WIDTH && width <= MAX_SIDEBAR_WIDTH) {
          setSidebarWidth(width);
        }
      }
    } catch (error) {
      console.log('sidebar_width_load_error', error);
    } finally {
      setIsInitialized(true);
    }
  };

  const saveSidebarWidth = async (width: number) => {
    try {
      await AsyncStorage.setItem(SIDEBAR_WIDTH_STORAGE_KEY, width.toString());
    } catch (error) {
      console.log('sidebar_width_save_error', error);
    }
  };

  useEffect(() => {
    loadSidebarWidth();
  }, []);

  useEffect(() => {
    if (isInitialized) {
      saveSidebarWidth(sidebarWidth);
    }
  }, [sidebarWidth, isInitialized]);

  useEffect(() => {
    setIsDragging(false);
  }, [sidebarWidth]);

  const onPanGestureEvent = (event: any) => {
    const { translationX } = event.nativeEvent;
    const newWidth = sidebarWidth + translationX;
    
    if (newWidth >= MIN_SIDEBAR_WIDTH && newWidth <= MAX_SIDEBAR_WIDTH) {
      translateX.setValue(translationX);
    }
  };

  const onPanHandlerStateChange = (event: any) => {
    const state = event.nativeEvent.state;
    
    if (state === State.BEGAN) {
      setIsDragging(true);
    } else if (state === State.END || state === State.CANCELLED || state === State.FAILED) {
      if (state === State.END) {
        const { translationX } = event.nativeEvent;
        const newWidth = Math.max(
          MIN_SIDEBAR_WIDTH,
          Math.min(MAX_SIDEBAR_WIDTH, sidebarWidth + translationX)
        );
        
        setSidebarWidth(newWidth);
      }
      
      translateX.setValue(0);
      setIsDragging(false);
    }
  };

  const handleTouchEnd = () => {
    setIsDragging(false);
  };

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
        <Animated.View style={[
          styles.sidebar,
          {
            width: sidebarWidth,
            backgroundColor: themeColors.background,
            transform: [{ translateX }],
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
        </Animated.View>

        <PanGestureHandler
          onGestureEvent={onPanGestureEvent}
          onHandlerStateChange={onPanHandlerStateChange}
        >
          <Animated.View 
            style={[
              styles.dragHandle,
              {
                left: sidebarWidth - 6,
                transform: [{ translateX }],
              }
            ]}
            onTouchEnd={handleTouchEnd}
            onTouchCancel={handleTouchEnd}
          >
            <View style={[styles.doorHandle, { backgroundColor: themeColors.borderColor }]} />
          </Animated.View>
        </PanGestureHandler>

        {isDragging && (
          <Animated.View style={[
            styles.dragStripLine,
            {
              left: sidebarWidth,
              transform: [{ translateX }],
              backgroundColor: themeColors.borderColor,
            }
          ]} />
        )}

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
  dragHandle: {
    position: 'absolute',
    top: '50%',
    marginTop: -30,
    width: 12,
    height: 60,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000,
  },
  doorHandle: {
    width: 6,
    height: 40,
    borderRadius: 3,
    opacity: 0.6,
  },
  dragStripLine: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 1,
    zIndex: 999,
    opacity: 0.8,
  },
  dragIndicator: {
    width: 2,
    height: 40,
    borderRadius: 1,
  },
  chatArea: {
    flex: 1,
  },
});
