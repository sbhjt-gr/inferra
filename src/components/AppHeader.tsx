import React from 'react';
import { View, Text, StyleSheet, Image, TouchableOpacity, StatusBar } from 'react-native';
import { useTheme } from '../context/ThemeContext';
import { theme } from '../constants/theme';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../types/navigation';
import chatManager from '../utils/ChatManager';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type AppHeaderProps = {
  title?: string;
  showBackButton?: boolean;
  showLogo?: boolean;
  onNewChat?: () => void;
  onBackPress?: () => void;
  rightButtons?: React.ReactNode;
  customLeftComponent?: React.ReactNode;
  transparent?: boolean;
  leftComponent?: React.ReactNode;
};

export default function AppHeader({ 
  title = 'Ragionare', 
  showBackButton = false,
  showLogo = true,
  onNewChat,
  onBackPress,
  rightButtons,
  customLeftComponent,
  transparent = false,
  leftComponent
}: AppHeaderProps) {
  const { theme: currentTheme } = useTheme();
  const themeColors = theme[currentTheme as 'light' | 'dark'];
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute();
  const insets = useSafeAreaInsets();

  const isHomeScreen = route.name === 'HomeTab';

  const handleNewChat = async () => {
    if (onNewChat) {
      onNewChat();
    } else {
      await chatManager.createNewChat();
    }
  };

  const handleOpenChatHistory = () => {
    navigation.navigate('ChatHistory');
  };

  const handleBackPress = () => {
    if (onBackPress) {
      onBackPress();
    } else {
      navigation.goBack();
    }
  };

  // Set status bar style
  React.useEffect(() => {
    StatusBar.setBarStyle('light-content');
    if (!transparent) {
      StatusBar.setBackgroundColor(themeColors.headerBackground);
    } else {
      StatusBar.setBackgroundColor('transparent');
    }
    StatusBar.setTranslucent(true);
    
    return () => {
      // Reset to default when unmounting
      StatusBar.setBarStyle(themeColors.statusBarStyle === 'light' ? 'light-content' : 'dark-content');
      StatusBar.setBackgroundColor(themeColors.statusBarBg);
    };
  }, [currentTheme, transparent, themeColors]);

  return (
    <View style={[
      styles.container, 
      { 
        backgroundColor: transparent ? 'transparent' : themeColors.headerBackground,
        paddingTop: insets.top,
        height: 52 + insets.top,
      }
    ]}>
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
                <Ionicons name="arrow-back" size={24} color={themeColors.headerText} />
              </TouchableOpacity>
            )}
            
            {showLogo && (
              <>
                <Image 
                  source={require('../../assets/icon.png')} 
                  style={styles.icon} 
                  resizeMode="contain"
                />
                <Text style={[styles.title, { color: themeColors.headerText }]}>
                  {title}
                </Text>
              </>
            )}
            
            {!showLogo && (
              <Text style={[styles.title, { color: themeColors.headerText }]}>
                {title}
              </Text>
            )}
          </View>
        )}

        <View style={styles.rightButtons}>
          {rightButtons ? (
            rightButtons
          ) : (
            <>
              {isHomeScreen && (
                <TouchableOpacity
                  style={styles.headerButton}
                  onPress={handleNewChat}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <Ionicons name="add-outline" size={22} color={themeColors.headerText} />
                </TouchableOpacity>
              )}
              
              <TouchableOpacity
                style={styles.headerButton}
                onPress={handleOpenChatHistory}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Ionicons name="time-outline" size={22} color={themeColors.headerText} />
              </TouchableOpacity>
            </>
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
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
    width: 24,
    height: 24,
    marginRight: 8,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
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