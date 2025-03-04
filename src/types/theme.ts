export type ThemeColors = 'light' | 'dark';

export type ThemeType = ThemeColors | 'system';

export interface ThemeContextType {
  theme: ThemeColors;  // The actual theme being applied (light/dark)
  selectedTheme: ThemeType;  // The user's preference (system/light/dark)
  toggleTheme: (theme: ThemeType) => void;
} 