import { ThemeColors } from '../types/theme';

const lightTheme = {
  background: '#fff',
  text: '#000',
  headerBackground: '#660880',
  headerText: '#fff',
  tabBarBackground: '#660880',
  tabBarActiveText: '#fff',
  tabBarInactiveText: 'rgba(255, 255, 255, 0.6)',
  borderColor: '#eee',
  statusBarStyle: 'light' as const,
  statusBarBg: '#4d0461',
  navigationBar: '#660880',
  secondaryText: '#666',
  textSecondary: '#666',
  primary: '#4a0660',
  cardBackground: '#f8f8f8',
  success: '#28a745',
};

const darkTheme = {
  background: '#1E1326',
  text: '#fff',
  headerBackground: '#660880',
  headerText: '#fff',
  tabBarBackground: '#660880',
  tabBarActiveText: '#fff',
  tabBarInactiveText: 'rgba(255, 255, 255, 0.7)',
  borderColor: '#3D2D4A',
  statusBarStyle: 'light' as const,
  statusBarBg: '#4D0F61',
  navigationBar: '#660880',
  secondaryText: '#BDB7C4',
  textSecondary: '#BDB7C4',
  primary: '#9C38C0',
  cardBackground: '#2A1F37',
  success: '#28a745',
};

export const theme: Record<ThemeColors, typeof lightTheme> = {
  light: lightTheme,
  dark: darkTheme,
}; 
