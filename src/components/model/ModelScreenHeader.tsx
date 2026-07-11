import React from 'react';
import { View, TouchableOpacity } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import { theme } from '../../constants/theme';
import AppHeader from '../AppHeader';
import { useResponsiveLayout } from '../../hooks/useResponsiveLayout';
import { headerBtn, headerTint } from '../../utils/headerChrome';

interface ModelScreenHeaderProps {
  isLoggedIn: boolean;
  onProfilePress: () => void;
}

export const ModelScreenHeader: React.FC<ModelScreenHeaderProps> = ({
  isLoggedIn,
  onProfilePress
}) => {
  const { theme: currentTheme } = useTheme();
  const { isWideScreen, useIosHeader } = useResponsiveLayout();
  const colors = theme[currentTheme];

  return (
    <AppHeader 
      title="Models" 
      rightButtons={
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <TouchableOpacity
            style={headerBtn(isWideScreen)}
            onPress={onProfilePress}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <MaterialCommunityIcons 
              name={isLoggedIn ? "account-circle" : "login"} 
              size={22} 
              color={headerTint(
                isWideScreen,
                currentTheme === 'light',
                colors.primary,
                colors.headerText,
              )}
            />
          </TouchableOpacity>
        </View>
      }
    />
  );
};
