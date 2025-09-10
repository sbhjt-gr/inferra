import { ThemeColors } from '../types/theme';




const darkModeColorMap: Record<string, string> = {
  
  '#4a0660': '#9C38C0',
  '#660880': '#8E25B0',
  
  
  '#ff4444': '#FF6B6B',
  '#FF3B30': '#FF6B6B',
  
  
  '#FFA726': '#FFB74D',
  
  
  '#666': '#BDB7C4',
  '#999': '#D8D5DD',
  
  
  '#0084ff': '#4DABFF',
  '#4a90e2': '#60A5F5', 
};


export const getThemeAwareColor = (color: string, currentTheme: ThemeColors): string => {
  if (currentTheme === 'dark' && darkModeColorMap[color]) {
    return darkModeColorMap[color];
  }
  return color;
};


export const getContrastTextColor = (currentTheme: ThemeColors): string => {
  return currentTheme === 'dark' ? '#000' : '#fff';
};


export const getIconColor = (currentTheme: ThemeColors): string => {
  return currentTheme === 'dark' ? '#D8D5DD' : '#687076';
};


export const getDocumentIconColor = (currentTheme: ThemeColors): string => {
  return currentTheme === 'dark' ? '#9C38C0' : '#4a0660';
};


export const getBrowserDownloadTextColor = (currentTheme: ThemeColors): string => {
  return currentTheme === 'dark' ? '#FFFFFF' : getThemeAwareColor('#660880', currentTheme);
}; 
