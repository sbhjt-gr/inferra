import React from 'react';
import { View, Text, StyleSheet, Image, TouchableOpacity } from 'react-native';
import { useTheme } from '../context/ThemeContext';
import { theme } from '../constants/theme';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter, usePathname } from 'expo-router';
import chatManager from '../utils/ChatManager';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { OpenSansFont } from '../hooks/OpenSansFont';
import { useResponsiveLayout } from '../hooks/useResponsiveLayout';

type AppHeaderProps = {
  title?: string;
  showBackButton?: boolean;
  showLogo?: boolean;
  onNewChat?: () => void;
  onBackPress?: () => void;
  rightButtons?: React.ReactNode | null;
  customLeftComponent?: React.ReactNode;
  transparent?: boolean;
  leftComponent?: React.ReactNode;
  tintColor?: string;
};

export default function AppHeader({
  title = 'InferrLM',
  showBackButton = false,
  showLogo = true,
  onNewChat,
  onBackPress,
  rightButtons,
  customLeftComponent,
  transparent = false,
  leftComponent,
  tintColor,
}: AppHeaderProps) {
  const { theme: currentTheme } = useTheme();
  const themeColors = theme[currentTheme as 'light' | 'dark'];
  const router = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const { fonts } = OpenSansFont();
  const { useIosHeader } = useResponsiveLayout();
  const navHeight = useIosHeader ? 53 : 52;

  const isHomeScreen = pathname === '/';

  const handleNewChat = async () => {
    if (onNewChat) {
      onNewChat();
    } else {
      await chatManager.createNewChat();
    }
  };

  const handleOpenChatHistory = () => {
    router.push('/chat-history');
  };

  const handleBackPress = () => {
    if (onBackPress) {
      onBackPress();
    } else {
      router.back();
    }
  };

  if (useIosHeader) {
    const iosColor = tintColor ?? (currentTheme === 'light' ? themeColors.primary : themeColors.text);
    return (
      <View style={[styles.iosContainer, { height: navHeight + insets.top }]}>
        <View style={[styles.iosContent, { paddingTop: insets.top }]}>
          <View style={styles.iosLeft}>
            {leftComponent ? (
              leftComponent
            ) : customLeftComponent ? (
              customLeftComponent
            ) : showBackButton ? (
              <TouchableOpacity
                style={styles.iosNavButton}
                onPress={handleBackPress}
                hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
              >
                <MaterialCommunityIcons name="chevron-left" size={30} color={iosColor} />
              </TouchableOpacity>
            ) : null}
          </View>

          <Text
            style={[styles.iosTitle, { color: iosColor }, fonts.bold]}
            numberOfLines={1}
          >
            {title}
          </Text>

          <View style={styles.iosRight}>
            {rightButtons !== undefined ? (
              rightButtons
            ) : (
              <>
                {isHomeScreen && (
                  <TouchableOpacity
                    style={styles.iosNavButton}
                    onPress={handleNewChat}
                    hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
                  >
                    <MaterialCommunityIcons name="plus" size={23} color={iosColor} />
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  style={styles.iosNavButton}
                  onPress={handleOpenChatHistory}
                  hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
                >
                  <MaterialCommunityIcons name="clock-outline" size={22} color={iosColor} />
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>
        <View style={[styles.iosSeparator, { backgroundColor: themeColors.borderColor }]} />
      </View>
    );
  }

  const androidTint = tintColor ?? themeColors.headerText;

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: transparent ? 'transparent' : themeColors.headerBackground,
          paddingTop: insets.top,
          height: navHeight + insets.top,
        },
      ]}
    >
      <View style={styles.headerContent}>
        {leftComponent ? (
          leftComponent
        ) : customLeftComponent ? (
          customLeftComponent
        ) : (
          <View style={styles.leftSection}>
            {showBackButton && (
              <TouchableOpacity
                style={styles.backButton}
                onPress={handleBackPress}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <MaterialCommunityIcons name="arrow-left" size={24} color={androidTint} />
              </TouchableOpacity>
            )}

            {showLogo && (
              <>
                <Image
                  source={require('../../assets/icon.png')}
                  style={styles.icon}
                  resizeMode="cover"
                  fadeDuration={0}
                />
                <Text style={[styles.title, { color: androidTint }, fonts.bold]}>
                  {title}
                </Text>
              </>
            )}

            {!showLogo && (
              <Text style={[styles.title, { color: androidTint }, fonts.bold]}>
                {title}
              </Text>
            )}
          </View>
        )}

        <View style={styles.rightButtons}>
          {rightButtons !== undefined ? (
            rightButtons
          ) : (
            <>
              {isHomeScreen && (
                <TouchableOpacity
                  style={styles.headerButton}
                  onPress={handleNewChat}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <MaterialCommunityIcons name="plus" size={22} color={androidTint} />
                </TouchableOpacity>
              )}
              <TouchableOpacity
                style={styles.headerButton}
                onPress={handleOpenChatHistory}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <MaterialCommunityIcons name="clock-outline" size={22} color={androidTint} />
              </TouchableOpacity>
            </>
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  iosContainer: {
    width: '100%',
    zIndex: 10,
    overflow: 'hidden',
  },
  iosContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  iosLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  iosTitle: {
    flex: 3,
    textAlign: 'center',
    fontSize: 20,
    letterSpacing: -0.3,
  },
  iosRight: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  iosNavButton: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  iosSeparator: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: StyleSheet.hairlineWidth,
  },
  container: {
    width: '100%',
    zIndex: 10,
  },
  headerContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
  },
  leftSection: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  icon: {
    width: 30,
    height: 30,
    marginRight: 8,
    borderRadius: 15,
  },
  title: {
    fontSize: 18,
    letterSpacing: 0.2,
  },
  rightButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  headerButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  backButton: {
    marginRight: 12,
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
