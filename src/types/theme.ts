export type ThemeColors = 'light' | 'dark';

export type ThemeType = ThemeColors | 'system';

export interface ThemeContextType {
  theme: ThemeColors;
  setTheme: (theme: ThemeType) => void;
} 