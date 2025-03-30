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
  primary: '#4a0660',
};

const darkTheme = {
  background: '#1E1326',
  text: '#fff',
  headerBackground: '#5A1277',
  headerText: '#fff',
  tabBarBackground: '#660880',
  tabBarActiveText: '#fff',
  tabBarInactiveText: 'rgba(255, 255, 255, 0.7)',
  borderColor: '#3D2D4A',
  statusBarStyle: 'light' as const,
  statusBarBg: '#4D0F61',
  navigationBar: '#660880',
  secondaryText: '#BDB7C4',
  primary: '#9C38C0',
};

export const theme: Record<ThemeColors, typeof lightTheme> = {
  light: lightTheme,
  dark: darkTheme,
}; 