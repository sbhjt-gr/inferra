import React, { useEffect, useRef } from 'react';
import { NavigationContainer, DefaultTheme, DarkTheme } from '@react-navigation/native';
import { AppState, AppStateStatus } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ThemeProvider, useTheme } from './src/context/ThemeContext';
import { RemoteModelProvider } from './src/context/RemoteModelContext';
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
import { initGeminiService } from './src/services/GeminiInitializer';
import { initOpenAIService } from './src/services/OpenAIInitializer';
import { initDeepSeekService } from './src/services/DeepSeekInitializer';
import { initClaudeService } from './src/services/ClaudeInitializer';
import { PaperProvider } from 'react-native-paper';

initGeminiService();
initOpenAIService();
initDeepSeekService();
initClaudeService();

const BACKGROUND_DOWNLOAD_TASK = 'background-download-check';

if (!TaskManager.isTaskDefined(BACKGROUND_DOWNLOAD_TASK)) {
  try {
    TaskManager.defineTask(BACKGROUND_DOWNLOAD_TASK, async () => {
      try {
        console.log('[Background] Checking downloads status');
        await modelDownloader.checkBackgroundDownloads();
        return BackgroundFetch.BackgroundFetchResult.NewData;
      } catch (error) {
        console.error('[Background] Error checking downloads:', error);
        return BackgroundFetch.BackgroundFetchResult.Failed;
      }
    });
    console.log('Background task defined successfully');
  } catch (error) {
    console.error('Error defining background task:', error);
  }
}

async function registerBackgroundFetchAsync() {
  try {
    const isRegistered = await TaskManager.isTaskRegisteredAsync(BACKGROUND_DOWNLOAD_TASK);
    
    if (isRegistered) {
      console.log('Background fetch task already registered');
      return;
    }
    
    await BackgroundFetch.registerTaskAsync(BACKGROUND_DOWNLOAD_TASK, {
      minimumInterval: 900,
      stopOnTerminate: false, 
      startOnBoot: true 
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
    const timer = setTimeout(() => {
      registerBackgroundFetchAsync().catch(error => {
        console.error('Error registering background fetch:', error);
      });
    }, 2000);

    const subscription = AppState.addEventListener('change', (nextAppState: AppStateStatus) => {
      try {
        if (appState.current.match(/inactive|background/) && nextAppState === 'active') {
          console.log('App has come to the foreground!');
          modelDownloader.checkBackgroundDownloads();
        } else if (appState.current === 'active' && nextAppState.match(/inactive|background/)) {
          console.log('App has gone to the background!');
        }
        
        appState.current = nextAppState;
      } catch (error) {
        console.error('Error handling app state change:', error);
      }
    });

    return () => {
      clearTimeout(timer);
      try {
        llamaManager.release();
        subscription.remove();
      } catch (error) {
        console.error('Error cleaning up resources:', error);
      }
    };
  }, []);

  useEffect(() => {
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
      try {
        BackgroundFetch.unregisterTaskAsync(BACKGROUND_DOWNLOAD_TASK);
      } catch (error) {
        console.error('Error cleaning up background fetch:', error);
      }
    };
  }, []);

  return (
      <NavigationContainer 
        theme={currentTheme === 'dark' ? customDarkTheme : customDefaultTheme}
      >
        <RootNavigator />
      </NavigationContainer>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <PaperProvider>
        <ModelProvider>
          <DownloadProvider>
            <RemoteModelProvider>
              <GestureHandlerRootView style={{ flex: 1 }}>
                <ThemeProvider>
                  <Navigation />
                </ThemeProvider>
              </GestureHandlerRootView>
            </RemoteModelProvider>
          </DownloadProvider>
        </ModelProvider>
      </PaperProvider>
    </SafeAreaProvider>
  );
}
