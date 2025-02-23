import { NavigationContainer, DefaultTheme, DarkTheme } from '@react-navigation/native';
import { Platform, StatusBar } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ThemeProvider, useTheme } from './src/context/ThemeContext';
import { theme } from './src/constants/theme';
import { useEffect } from 'react';
import { llamaManager } from './src/utils/LlamaManager';
import { ModelProvider } from './src/context/ModelContext';
import RootNavigator from './src/navigation/RootNavigator';
import { DownloadProvider } from './src/context/DownloadContext';

function Navigation() {
  const { theme: currentTheme } = useTheme();
  const themeColors = theme[currentTheme];

  const customDefaultTheme = {
    ...DefaultTheme,
    colors: {
      ...DefaultTheme.colors,
      background: theme.light.background,
      text: theme.light.text,
      card: theme.light.headerBackground,
      border: theme.light.borderColor,
      primary: theme.light.tabBarActiveText,
      notification: theme.light.tabBarActiveText,
    },
  };

  const customDarkTheme = {
    ...DarkTheme,
    colors: {
      ...DarkTheme.colors,
      background: theme.dark.background,
      text: theme.dark.text,
      card: theme.dark.headerBackground,
      border: theme.dark.borderColor,
      primary: theme.dark.tabBarActiveText,
      notification: theme.dark.tabBarActiveText,
    },
  };

  useEffect(() => {
    return () => {
      // Cleanup llama context when app closes
      llamaManager.release();
    };
  }, []);

  return (
    <>
      <StatusBar
        backgroundColor={themeColors.statusBarBg}
        barStyle={`${themeColors.statusBarStyle}-content`}
      />
      <NavigationContainer 
        theme={currentTheme === 'dark' ? customDarkTheme : customDefaultTheme}
      >
        <RootNavigator />
      </NavigationContainer>
    </>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <ModelProvider>
        <DownloadProvider>
          <GestureHandlerRootView style={{ flex: 1 }}>
            <ThemeProvider>
              <Navigation />
            </ThemeProvider>
          </GestureHandlerRootView>
        </DownloadProvider>
      </ModelProvider>
    </SafeAreaProvider>
  );
}
