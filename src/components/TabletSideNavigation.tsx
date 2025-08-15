import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Animated,
  PanResponder,
  Image,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
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
  const [navigationWidth, setNavigationWidth] = useState(240);
  const [isResizing, setIsResizing] = useState(false);
  const widthAnimation = useRef(new Animated.Value(240)).current;
  const startWidth = useRef(240);

  useEffect(() => {
    const loadNavigationState = async () => {
      try {
        const savedWidth = await AsyncStorage.getItem('tabletNavigationWidth');
        
        if (savedWidth) {
          const width = parseInt(savedWidth, 10);
          if (width >= 180 && width <= 400) {
            setNavigationWidth(width);
            widthAnimation.setValue(width);
            startWidth.current = width;
          }
        }
      } catch (error) {
        console.error('Error loading navigation state:', error);
      }
    };
    
    loadNavigationState();
  }, []);

  useEffect(() => {
    Animated.timing(widthAnimation, {
      toValue: navigationWidth,
      duration: 100,
      useNativeDriver: false,
    }).start();
  }, [navigationWidth, widthAnimation]);

  useEffect(() => {
    const saveNavigationWidth = async () => {
      try {
        await AsyncStorage.setItem('tabletNavigationWidth', navigationWidth.toString());
      } catch (error) {
        console.error('Error saving navigation width:', error);
      }
    };
    
    saveNavigationWidth();
  }, [navigationWidth]);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: (evt, gestureState) => true,
      onMoveShouldSetPanResponder: (evt, gestureState) => {
        return Math.abs(gestureState.dx) > 2;
      },
      onPanResponderGrant: (evt, gestureState) => {
        startWidth.current = navigationWidth;
        setIsResizing(true);
      },
      onPanResponderMove: (evt, gestureState) => {
        const newWidth = Math.max(180, Math.min(400, startWidth.current + gestureState.dx));
        widthAnimation.setValue(newWidth);
      },
      onPanResponderRelease: (evt, gestureState) => {
        const newWidth = Math.max(180, Math.min(400, startWidth.current + gestureState.dx));
        setNavigationWidth(newWidth);
        setIsResizing(false);
        
        Animated.timing(widthAnimation, {
          toValue: newWidth,
          duration: 100,
          useNativeDriver: false,
        }).start();
      },
      onPanResponderTerminate: (evt, gestureState) => {
        const newWidth = Math.max(180, Math.min(400, startWidth.current + gestureState.dx));
        setNavigationWidth(newWidth);
        setIsResizing(false);
        
        Animated.timing(widthAnimation, {
          toValue: newWidth,
          duration: 100,
          useNativeDriver: false,
        }).start();
      },
    })
  ).current;

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
    <View style={styles.navigationContainer}>
      <Animated.View style={[
        styles.container,
        {
          backgroundColor: themeColors.tabBarBackground,
          paddingHorizontal: paddingHorizontal / 2,
          width: widthAnimation
        }
      ]}>
        <ScrollView 
          style={styles.scrollContainer}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.contentContainer}
        >
          <View style={styles.header}>
            <Image
              source={require('../../assets/icon.png')}
              style={styles.appLogo}
              resizeMode="contain"
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
                    name={isFocused ? item.activeIcon as any : item.icon as any}
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
        
        <View
          style={styles.resizeEdge}
          {...panResponder.panHandlers}
        >
          <View style={[styles.resizeIndicator, { backgroundColor: themeColors.borderColor }]} />
          {isResizing && (
            <View style={[styles.resizeHighlight, { backgroundColor: themeColors.primary }]} />
          )}
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  navigationContainer: {
    position: 'relative',
    height: '100%',
    overflow: 'visible',
  },
  container: {
    height: '100%',
    borderRightWidth: 1,
    borderRightColor: 'rgba(255, 255, 255, 0.1)',
    overflow: 'hidden',
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
  appLogo: {
    width: 32,
    height: 32,
    borderRadius: 16,
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
  resizeEdge: {
    position: 'absolute',
    top: 0,
    right: -15,
    bottom: 0,
    width: 30,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'transparent',
    zIndex: 1000,
  },
  resizeIndicator: {
    width: 2,
    height: 30,
    borderRadius: 1,
    opacity: 0.4,
  },
  resizeHighlight: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    right: 15,
    width: 3,
    opacity: 0.8,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 0,
    },
    shadowOpacity: 0.3,
    shadowRadius: 2,
    elevation: 2,
  },
});