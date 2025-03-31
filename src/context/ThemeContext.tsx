import React, { createContext, useContext, useEffect, useState } from 'react';
import { useColorScheme, Appearance, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ThemeType, ThemeColors } from '../types/theme';

interface ThemeContextType {
  theme: ThemeColors;
  selectedTheme: ThemeType;
  toggleTheme: (theme: ThemeType) => void;
}

const ThemeContext = createContext<ThemeContextType>({
  theme: 'light',
  selectedTheme: 'system',
  toggleTheme: () => {},
});

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const systemColorScheme = useColorScheme();
  const [selectedTheme, setSelectedTheme] = useState<ThemeType>('system');
  const [theme, setTheme] = useState<ThemeColors>(systemColorScheme as ThemeColors || 'light');

  useEffect(() => {
    const updateTheme = ({ colorScheme }: { colorScheme: string | null }) => {
      if (selectedTheme === 'system') {
        const newTheme = (colorScheme as ThemeColors) || 'light';
        setTheme(newTheme);

        if (Platform.OS === 'android') {
          Appearance.setColorScheme(newTheme);
        }
      }
    };

    const subscription = Appearance.addChangeListener(updateTheme);
    
    updateTheme({ colorScheme: systemColorScheme });

    return () => {
      subscription.remove();
    };
  }, [selectedTheme, systemColorScheme]);

  useEffect(() => {
    loadThemePreference();
  }, []);

  useEffect(() => {
    if (selectedTheme === 'system') {
      const newTheme = (systemColorScheme as ThemeColors) || 'light';
      setTheme(newTheme);
      
      if (Platform.OS === 'android') {
        Appearance.setColorScheme(null); 
      }
    } else {
      setTheme(selectedTheme as ThemeColors);
      
      if (Platform.OS === 'android') {
        Appearance.setColorScheme(selectedTheme as ThemeColors);
      }
    }
  }, [selectedTheme, systemColorScheme]);

  const loadThemePreference = async () => {
    try {
      const savedTheme = await AsyncStorage.getItem('@theme_preference');
      if (savedTheme) {
        setSelectedTheme(savedTheme as ThemeType);
      }
    } catch (error) {
      console.error('Error loading theme preference:', error);
    }
  };

  const toggleTheme = async (newTheme: ThemeType) => {
    setSelectedTheme(newTheme);
    try {
      await AsyncStorage.setItem('@theme_preference', newTheme);
    } catch (error) {
      console.error('Error saving theme preference:', error);
    }
  };

  return (
    <ThemeContext.Provider value={{ 
      theme,
      selectedTheme,
      toggleTheme 
    }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}; 