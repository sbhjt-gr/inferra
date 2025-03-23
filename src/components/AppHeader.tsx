import React from 'react';
import { View, Text, StyleSheet, Image, TouchableOpacity, Platform, StatusBar } from 'react-native';
import { useTheme } from '../context/ThemeContext';
import { theme } from '../constants/theme';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../types/navigation';
import chatManager from '../utils/ChatManager';

type AppHeaderProps = {
  onNewChat?: () => void;
};

export default function AppHeader({ onNewChat }: AppHeaderProps) {
  const { theme: currentTheme } = useTheme();
  const themeColors = theme[currentTheme];
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute();

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

  return (
    <View style={[
      styles.container, 
      { backgroundColor: themeColors.headerBackground }
    ]}>
      <View style={styles.headerContent}>
        <View style={styles.leftSection}>
          <Image 
            source={require('../../assets/icon.png')} 
            style={styles.icon} 
            resizeMode="contain"
          />
          <Text style={[styles.title, { color: themeColors.headerText }]}>
            Ragionare
          </Text>
        </View>

        <View style={styles.rightButtons}>
          {isHomeScreen && (
            <TouchableOpacity
              style={styles.headerButton}
              onPress={handleNewChat}
            >
              <Ionicons name="add-outline" size={22} color="#fff" />
            </TouchableOpacity>
          )}
          
          <TouchableOpacity
            style={styles.headerButton}
            onPress={handleOpenChatHistory}
          >
            <Ionicons name="time-outline" size={22} color="#fff" />
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    height: 52,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
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
}); 