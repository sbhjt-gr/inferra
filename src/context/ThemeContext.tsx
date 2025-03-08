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

  // Effect to handle system theme changes
  useEffect(() => {
    // Function to update theme based on system color scheme
    const updateTheme = ({ colorScheme }: { colorScheme: string | null }) => {
      if (selectedTheme === 'system') {
        const newTheme = (colorScheme as ThemeColors) || 'light';
        setTheme(newTheme);

        // On Android, we need to force the appearance
        if (Platform.OS === 'android') {
          Appearance.setColorScheme(newTheme);
        }
      }
    };

    // Register listener for theme changes
    const subscription = Appearance.addChangeListener(updateTheme);
    
    // Initial update
    updateTheme({ colorScheme: systemColorScheme });

    return () => {
      subscription.remove();
    };
  }, [selectedTheme, systemColorScheme]);

  // Effect to load saved theme preference
  useEffect(() => {
    loadThemePreference();
  }, []);

  // Effect to update active theme when selected theme changes
  useEffect(() => {
    if (selectedTheme === 'system') {
      // For system theme, use the device's color scheme
      const newTheme = (systemColorScheme as ThemeColors) || 'light';
      setTheme(newTheme);
      
      // Only force Android theme if not using system default
      if (Platform.OS === 'android') {
        Appearance.setColorScheme(null); // Reset to system default
      }
    } else {
      // For explicit light/dark selections
      setTheme(selectedTheme as ThemeColors);
      
      // Force explicit theme on Android
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