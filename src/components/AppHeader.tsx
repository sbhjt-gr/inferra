import React from 'react';
import { View, Text, StyleSheet, Image, TouchableOpacity, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
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
  const insets = useSafeAreaInsets();
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
    <View 
      style={[
        styles.header, 
        { 
          backgroundColor: themeColors.headerBackground,
          paddingTop: insets.top + 8,
        }
      ]}
    >
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
            <Ionicons name="add-outline" size={24} color="#fff" />
          </TouchableOpacity>
        )}
        
        <TouchableOpacity
          style={styles.headerButton}
          onPress={handleOpenChatHistory}
        >
          <Ionicons name="time-outline" size={24} color="#fff" />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 10,
    paddingTop: 8,
    paddingHorizontal: 20,
    borderBottomColor: 'rgba(0, 0, 0, 0.1)',
  },
  leftSection: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  icon: {
    width: 32,
    height: 32,
    marginRight: 8,
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
  },
  rightButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  headerButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
}); 