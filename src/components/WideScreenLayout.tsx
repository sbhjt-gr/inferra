import React, { useState, useRef, useEffect } from 'react';
import { View, StyleSheet, TouchableOpacity, Text, Animated } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { PanGestureHandler, State } from 'react-native-gesture-handler';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams } from 'expo-router';
import HomeScreen from '../screens/HomeScreen';
import SettingsScreen from '../screens/SettingsScreen';
import ModelScreen from '../screens/ModelScreen';
import BenchmarkScreen from '../screens/BenchmarkScreen';
import { useTheme } from '../context/ThemeContext';
import { LayoutProvider } from '../context/LayoutContext';
import { theme } from '../constants/theme';
import { OpenSansFont } from '../hooks/OpenSansFont';
import { useResponsiveLayout } from '../hooks/useResponsiveLayout';

type TabType = 'models' | 'benchmark' | 'settings';

const SIDEBAR_WIDTH_STORAGE_KEY = 'widescreen_sidebar_width';
const TAB_BAR_W = 75;
const MIN_SIDEBAR_WIDTH = 200;

export default function WideScreenLayout() {
  const { theme: currentTheme } = useTheme();
  const themeColors = theme[currentTheme];
  const insets = useSafeAreaInsets();
  const { fonts } = OpenSansFont();
  const { screenWidth } = useResponsiveLayout();
  const [activeTab, setActiveTab] = useState<TabType>('models');
  const params = useLocalSearchParams<{ screen?: string; params?: string }>();

  const targetScreen = params?.screen;
  const maxSidebarWidth = screenWidth * 0.6;

  const [sidebarWidth, setSidebarWidth] = useState(screenWidth * 0.45);
  const [isDragging, setIsDragging] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);
  const dragStartW = useRef(sidebarWidth);

  const clampW = (width: number) =>
    Math.max(MIN_SIDEBAR_WIDTH, Math.min(maxSidebarWidth, width));

  const loadSidebarWidth = async () => {
    try {
      const savedWidth = await AsyncStorage.getItem(SIDEBAR_WIDTH_STORAGE_KEY);
      if (savedWidth) {
        const width = parseFloat(savedWidth);
        if (width >= MIN_SIDEBAR_WIDTH && width <= maxSidebarWidth) {
          setSidebarWidth(width);
          console.log('sidebar_width_loaded', width);
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
      console.log('sidebar_width_saved', width);
    } catch (error) {
      console.log('sidebar_width_save_error', error);
    }
  };

  useEffect(() => {
    loadSidebarWidth();
  }, []);

  useEffect(() => {
    if (targetScreen === 'ModelTab') {
      setActiveTab('models');
      return;
    }

    if (targetScreen === 'SettingsTab') {
      setActiveTab('settings');
    }

    if (targetScreen === 'BenchmarkTab') {
      setActiveTab('benchmark');
    }
  }, [targetScreen]);

  const onPanGestureEvent = (event: any) => {
    const next = clampW(dragStartW.current + event.nativeEvent.translationX);
    setSidebarWidth(next);
  };

  const onPanHandlerStateChange = (event: any) => {
    const state = event.nativeEvent.state;

    if (state === State.BEGAN) {
      dragStartW.current = sidebarWidth;
      setIsDragging(true);
      console.log('sidebar_drag_start', sidebarWidth);
      return;
    }

    if (state === State.END || state === State.CANCELLED || state === State.FAILED) {
      const next = clampW(dragStartW.current + event.nativeEvent.translationX);
      setSidebarWidth(next);
      setIsDragging(false);
      console.log('sidebar_drag_end', next);

      if (state === State.END && isInitialized) {
        saveSidebarWidth(next);
      }
    }
  };

  const activeColor = currentTheme === 'light' ? themeColors.primary : themeColors.text;
  const inactiveColor = themeColors.textSecondary;

  const TabButton = ({
    tab,
    icon,
    label,
    isActive,
    showBeta = false,
  }: {
    tab: TabType;
    icon: string;
    label: string;
    isActive: boolean;
    showBeta?: boolean;
  }) => (
    <TouchableOpacity
      style={[
        styles.tabItem,
        isActive && { backgroundColor: themeColors.cardBackground, borderRadius: 10 },
      ]}
      onPress={() => {
        console.log('sidebar_tab', tab);
        setActiveTab(tab);
      }}
    >
      <View style={styles.iconContainer}>
        <MaterialCommunityIcons
          name={icon as any}
          size={22}
          color={isActive ? activeColor : inactiveColor}
        />
        {showBeta && (
          <View style={styles.betaBadge}>
            <Text style={styles.betaText}>Beta</Text>
          </View>
        )}
      </View>
      <Text
        style={[
          styles.tabLabel,
          { color: isActive ? activeColor : inactiveColor },
          fonts.medium,
        ]}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );

  const renderSidebarContent = () => {
    switch (activeTab) {
      case 'models':
        return <ModelScreen />;
      case 'benchmark':
        return <BenchmarkScreen />;
      case 'settings':
        return <SettingsScreen />;
      default:
        return <ModelScreen />;
    }
  };

  return (
    <LayoutProvider constrainToChat={true}>
      <View style={[styles.container, { backgroundColor: themeColors.background }]}>
        <View
          style={[
            styles.verticalTabBar,
            {
              width: TAB_BAR_W,
              backgroundColor: themeColors.background,
              paddingTop: insets.top + 12,
              paddingBottom: insets.bottom + 12,
            },
          ]}
        >
          <View style={styles.tabList}>
            <TabButton
              tab="models"
              icon={activeTab === 'models' ? 'cube' : 'cube-outline'}
              label="Models"
              isActive={activeTab === 'models'}
            />
            <TabButton
              tab="benchmark"
              icon="tools"
              label="Tools"
              isActive={activeTab === 'benchmark'}
            />
            <TabButton
              tab="settings"
              icon={activeTab === 'settings' ? 'cog' : 'cog-outline'}
              label="Settings"
              isActive={activeTab === 'settings'}
            />
          </View>
          <View style={[styles.tabSeparator, { backgroundColor: themeColors.borderColor }]} />
        </View>

        <View
          style={[
            styles.sidebar,
            {
              width: sidebarWidth,
              backgroundColor: themeColors.background,
            },
          ]}
        >
          <View style={styles.tabContent}>{renderSidebarContent()}</View>
        </View>

        <PanGestureHandler
          onGestureEvent={onPanGestureEvent}
          onHandlerStateChange={onPanHandlerStateChange}
        >
          <Animated.View
            style={[
              styles.dragHandle,
              { left: TAB_BAR_W + sidebarWidth - 6 },
            ]}
          >
            <View style={[styles.doorHandle, { backgroundColor: themeColors.borderColor }]} />
          </Animated.View>
        </PanGestureHandler>

        {isDragging && (
          <View
            style={[
              styles.dragStripLine,
              {
                left: TAB_BAR_W + sidebarWidth,
                backgroundColor: themeColors.borderColor,
              },
            ]}
          />
        )}

        <View style={[styles.chatArea, { backgroundColor: themeColors.background }]}>
          <HomeScreen />
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
  sidebar: {},
  tabContent: {
    flex: 1,
  },
  verticalTabBar: {
    justifyContent: 'flex-start',
    alignItems: 'center',
  },
  tabSeparator: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    width: StyleSheet.hairlineWidth,
  },
  tabList: {
    gap: 8,
    alignItems: 'center',
  },
  tabItem: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: 8,
  },
  iconContainer: {
    position: 'relative',
  },
  betaBadge: {
    position: 'absolute',
    top: -6,
    right: -14,
    backgroundColor: '#FF6B00',
    borderRadius: 4,
    paddingHorizontal: 3,
    paddingVertical: 1,
  },
  betaText: {
    color: '#FFFFFF',
    fontSize: 7,
    fontWeight: '700',
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
  chatArea: {
    flex: 1,
  },
});
