import React, { useEffect, useRef } from 'react';
import { NavigationContainer, DefaultTheme, DarkTheme } from '@react-navigation/native';
import { Platform, StatusBar, AppState, AppStateStatus, StatusBarStyle } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ThemeProvider, useTheme } from './src/context/ThemeContext';
import { theme } from './src/constants/theme';
import { llamaManager } from './src/utils/LlamaManager';
import { ModelProvider } from './src/context/ModelContext';
import RootNavigator from './src/navigation/RootNavigator';
import { DownloadProvider } from './src/context/DownloadContext';
import { modelDownloader } from './src/services/ModelDownloader';
import * as TaskManager from 'expo-task-manager';
import * as BackgroundFetch from 'expo-background-fetch';
import { ThemeColors } from './src/types/theme';
import { notificationService } from './src/services/NotificationService';

// Define a background task for checking downloads
const BACKGROUND_DOWNLOAD_TASK = 'background-download-check';

// Register the task
try {
  TaskManager.defineTask(BACKGROUND_DOWNLOAD_TASK, async () => {
    try {
      console.log('[Background] Checking downloads status');
      // This will be called when the app is in the background
      await modelDownloader.checkBackgroundDownloads();
      return BackgroundFetch.BackgroundFetchResult.NewData;
    } catch (error) {
      console.error('[Background] Error checking downloads:', error);
      return BackgroundFetch.BackgroundFetchResult.Failed;
    }
  });
} catch (error) {
  console.error('Error defining background task:', error);
}

// Register the background fetch task
async function registerBackgroundFetchAsync() {
  try {
    // Register with more aggressive settings
    await BackgroundFetch.registerTaskAsync(BACKGROUND_DOWNLOAD_TASK, {
      minimumInterval: 30, // Check every 30 seconds
      stopOnTerminate: false, // Continue running even if the app is terminated
      startOnBoot: true // Start the task when the device restarts
    });
    
    console.log('Background fetch task registered with enhanced settings');
  } catch (err) {
    console.error('Background fetch registration failed:', err);
  }
}

function Navigation() {
  const { theme: currentTheme } = useTheme();
  const themeColors = theme[currentTheme as ThemeColors];
  const appState = useRef(AppState.currentState);

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
    // Register background fetch task when the app starts
    try {
      registerBackgroundFetchAsync();
    } catch (error) {
      console.error('Error registering background fetch:', error);
    }

    // Handle app state changes
    const subscription = AppState.addEventListener('change', (nextAppState: AppStateStatus) => {
      try {
        if (appState.current.match(/inactive|background/) && nextAppState === 'active') {
          // App has come to the foreground
          console.log('App has come to the foreground!');
          modelDownloader.checkBackgroundDownloads();
        } else if (appState.current === 'active' && nextAppState.match(/inactive|background/)) {
          // App has gone to the background
          console.log('App has gone to the background!');
        }
        
        appState.current = nextAppState;
      } catch (error) {
        console.error('Error handling app state change:', error);
      }
    });

    return () => {
      // Cleanup llama context when app closes
      try {
        llamaManager.release();
        subscription.remove();
      } catch (error) {
        console.error('Error cleaning up resources:', error);
      }
    };
  }, []);

  useEffect(() => {
    // Initialize the notification service
    async function initializeNotifications() {
      try {
        await notificationService.initialize();
        console.log('Notification service initialized');
      } catch (error) {
        console.error('Error initializing notifications:', error);
      }
    }

    initializeNotifications();

    return () => {
      // Cleanup when component unmounts
      try {
        // Unregister the background fetch task
        BackgroundFetch.unregisterTaskAsync(BACKGROUND_DOWNLOAD_TASK);
      } catch (error) {
        console.error('Error cleaning up background fetch:', error);
      }
    };
  }, []);

  return (
    <>
      <StatusBar
        backgroundColor={themeColors.statusBarBg}
        barStyle={(themeColors.statusBarStyle + '-content') as StatusBarStyle}
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
