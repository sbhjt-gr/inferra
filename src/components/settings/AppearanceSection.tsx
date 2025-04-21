import React from 'react';
import SettingsSection from './SettingsSection';
import ThemeOption from './ThemeOption';

type ThemeOptionType = 'system' | 'light' | 'dark';

type AppearanceSectionProps = {
  selectedTheme: ThemeOptionType;
  onThemeChange: (theme: ThemeOptionType) => void;
};

const AppearanceSection = ({ selectedTheme, onThemeChange }: AppearanceSectionProps) => {
  return (
    <SettingsSection title="APPEARANCE">
      <ThemeOption
        title="System Default"
        description="Follow system theme settings"
        value="system"
        icon="cellphone"
        onSelect={onThemeChange}
        selectedTheme={selectedTheme}
      />
      <ThemeOption
        title="Light Mode"
        description="Classic light appearance"
        value="light"
        icon="white-balance-sunny"
        onSelect={onThemeChange}
        selectedTheme={selectedTheme}
      />
      <ThemeOption
        title="Dark Mode"
        description="Easier on the eyes in low light"
        value="dark"
        icon="moon-waning-crescent"
        onSelect={onThemeChange}
        selectedTheme={selectedTheme}
      />
    </SettingsSection>
  );
};

export default AppearanceSection; 