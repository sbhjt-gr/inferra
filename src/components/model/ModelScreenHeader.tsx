import React from 'react';
import { View, TouchableOpacity, StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import { theme } from '../../constants/theme';
import AppHeader from '../AppHeader';

interface ModelScreenHeaderProps {
  isLoggedIn: boolean;
  onProfilePress: () => void;
}

export const ModelScreenHeader: React.FC<ModelScreenHeaderProps> = ({
  isLoggedIn,
  onProfilePress
}) => {
  const { theme: currentTheme } = useTheme();

  return (
    <AppHeader 
      title="Models" 
      rightButtons={
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <TouchableOpacity
            style={styles.headerButton}
            onPress={onProfilePress}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <MaterialCommunityIcons 
              name={isLoggedIn ? "account-circle" : "login"} 
              size={22} 
              color={theme[currentTheme].headerText} 
            />
          </TouchableOpacity>
        </View>
      }
    />
  );
};

const styles = StyleSheet.create({
  headerButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
});
