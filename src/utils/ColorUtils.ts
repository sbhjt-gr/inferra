import { ThemeColors } from '../types/theme';

/**
 * Color utility functions to handle theme-aware coloring
 */

// Map of hard-coded colors to use in dark mode
const darkModeColorMap: Record<string, string> = {
  // Primary brand purple colors
  '#4a0660': '#9C38C0',
  '#660880': '#8E25B0',
  
  // Red/Error colors - made more visible in dark mode
  '#ff4444': '#FF6B6B',
  '#FF3B30': '#FF6B6B',
  
  // Warning colors
  '#FFA726': '#FFB74D',
  
  // Text colors
  '#666': '#BDB7C4',
  '#999': '#D8D5DD',
  
  // Blue colors
  '#0084ff': '#4DABFF',
  '#4a90e2': '#60A5F5', // Brighter blue for document icons in dark mode
};

/**
 * Get theme-aware color - if in dark mode, return the dark mode color if available
 * @param color Original color
 * @param currentTheme Current theme ('light' or 'dark')
 * @returns Appropriate color for the current theme
 */
export const getThemeAwareColor = (color: string, currentTheme: ThemeColors): string => {
  if (currentTheme === 'dark' && darkModeColorMap[color]) {
    return darkModeColorMap[color];
  }
  return color;
};

/**
 * Returns light text color ('#fff') in light mode and dark text color ('#000') in dark mode
 * For use with colored backgrounds that have a different contrast needs in each theme
 */
export const getContrastTextColor = (currentTheme: ThemeColors): string => {
  return currentTheme === 'dark' ? '#000' : '#fff';
};

/**
 * Returns appropriate icon color based on theme
 */
export const getIconColor = (currentTheme: ThemeColors): string => {
  return currentTheme === 'dark' ? '#D8D5DD' : '#687076';
};

/**
 * Returns document icon color based on theme
 */
export const getDocumentIconColor = (currentTheme: ThemeColors): string => {
  return currentTheme === 'dark' ? '#9C38C0' : '#4a0660';
};

/**
 * Returns the appropriate browser download text color based on theme
 */
export const getBrowserDownloadTextColor = (currentTheme: ThemeColors): string => {
  return currentTheme === 'dark' ? '#FFFFFF' : getThemeAwareColor('#660880', currentTheme);
}; 