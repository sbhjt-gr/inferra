import React, { useEffect, useRef } from 'react';
import { NavigationContainer, DefaultTheme, DarkTheme } from '@react-navigation/native';
import { AppState, AppStateStatus, Text, TextInput } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';
import { ThemeProvider, useTheme } from './src/context/ThemeContext';
import { RemoteModelProvider } from './src/context/RemoteModelContext';
import { theme } from './src/constants/theme';
import { llamaManager } from './src/utils/LlamaManager';
import { ModelProvider } from './src/context/ModelContext';
import RootNavigator from './src/navigation/RootNavigator';
import { DownloadProvider } from './src/context/DownloadContext';
import { modelDownloader } from './src/services/ModelDownloader';
import * as TaskManager from 'expo-task-manager';
import * as BackgroundFetch from 'expo-background-task';
import { ThemeColors } from './src/types/theme';
import { notificationService } from './src/services/NotificationService';
import { getFirebaseServices } from './src/services/FirebaseService';
import { initGeminiService } from './src/services/GeminiInitializer';
import { initOpenAIService } from './src/services/OpenAIInitializer';
import { initDeepSeekService } from './src/services/DeepSeekInitializer';
import { initClaudeService } from './src/services/ClaudeInitializer';
import { PaperProvider } from 'react-native-paper';
import { DialogProvider } from './src/context/DialogContext';
import { ShowDialog } from './src/components/ShowDialog';

SplashScreen.preventAutoHideAsync();

try {
  getFirebaseServices();
} catch (error) {
  console.error('Firebase initialization failed:', error);
}

initGeminiService();
initOpenAIService();
initDeepSeekService();
initClaudeService();

const BACKGROUND_DOWNLOAD_TASK = 'background-download-check';

if (!TaskManager.isTaskDefined(BACKGROUND_DOWNLOAD_TASK)) {
  try {
    TaskManager.defineTask(BACKGROUND_DOWNLOAD_TASK, async () => {
      try {
        await modelDownloader.checkBackgroundDownloads();
        return BackgroundFetch.BackgroundFetchResult.NewData;
      } catch (error) {
        return BackgroundFetch.BackgroundFetchResult.Failed;
      }
    });
  } catch (error) {
    // do nothing
  }
}

async function registerBackgroundFetchAsync() {
  try {
    const isRegistered = await TaskManager.isTaskRegisteredAsync(BACKGROUND_DOWNLOAD_TASK);
    
    if (isRegistered) {
      return;
    }
    
    await BackgroundFetch.registerTaskAsync(BACKGROUND_DOWNLOAD_TASK, {
      minimumInterval: 900,
      stopOnTerminate: false, 
      startOnBoot: true 
    });
    
  } catch (err) {
          // do nothing
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
        // do nothing
      });
    }, 2000);

    let subscription: { remove: () => void } | undefined;
    try {
      subscription = AppState.addEventListener('change', (nextAppState: AppStateStatus) => {
        try {
          if (appState.current.match(/inactive|background/) && nextAppState === 'active') {
            modelDownloader.checkBackgroundDownloads();
          } else if (appState.current === 'active' && nextAppState.match(/inactive|background/)) {
            // do nothing
          }
          
          appState.current = nextAppState;
        } catch (error) {
          // do nothing
        }
      });
    } catch (error) {
      const changeHandler = (nextAppState: AppStateStatus) => {
        try {
          if (appState.current.match(/inactive|background/) && nextAppState === 'active') {
            modelDownloader.checkBackgroundDownloads();
          } else if (appState.current === 'active' && nextAppState.match(/inactive|background/)) {
            // do nothing
          }
          
          appState.current = nextAppState;
        } catch (error) {
          // do nothing
        }
      };
      
      try {
        subscription = AppState.addEventListener('change', changeHandler);
      } catch (err) {
        console.error('Failed to add app state event listener:', err);
      }
    }

    return () => {
      clearTimeout(timer);
      try {
        llamaManager.release();
        if (subscription && typeof subscription.remove === 'function') {
          subscription.remove();
        }
      } catch (error) {
        // do nothing
      }
    };
  }, []);

  useEffect(() => {
    async function initializeNotifications() {
      try {
        await notificationService.initialize();
      } catch (error) {
        // do nothing
      }
    }

    initializeNotifications();

    return () => {
      try {
        BackgroundFetch.unregisterTaskAsync(BACKGROUND_DOWNLOAD_TASK);
      } catch (error) {
        // do nothing
      }
    };
  }, []);

  return (
      <NavigationContainer 
        theme={currentTheme === 'dark' ? customDarkTheme : customDefaultTheme}
      >
        <StatusBar style="light" backgroundColor="transparent" translucent />
        <RootNavigator />
        <ShowDialog />
      </NavigationContainer>
  );
}

export default function App() {
  const [fontsLoaded, fontError] = useFonts({
    'Inter-Light': require('./assets/fonts/Inter-Light.ttf'),
    'Inter-Regular': require('./assets/fonts/Inter-Regular.ttf'),
    'Inter-Medium': require('./assets/fonts/Inter-Medium.ttf'),
    'Inter-SemiBold': require('./assets/fonts/Inter-SemiBold.ttf'),
    'Inter-Bold': require('./assets/fonts/Inter-Bold.ttf'),
    'Inter-ExtraBold': require('./assets/fonts/Inter-ExtraBold.ttf'),
  });

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  useEffect(() => {
    if (fontsLoaded) {
      const oldTextRender = Text.render;
      const oldTextInputRender = TextInput.render;

      Text.render = function (props, ref) {
        return oldTextRender.call(this, {
          ...props,
          style: [{ fontFamily: 'Inter-Regular' }, props.style],
        }, ref);
      };

      TextInput.render = function (props, ref) {
        return oldTextInputRender.call(this, {
          ...props,
          style: [{ fontFamily: 'Inter-Regular' }, props.style],
        }, ref);
      };
    }
  }, [fontsLoaded]);

  if (!fontsLoaded && !fontError) {
    return null;
  }

  return (
    <SafeAreaProvider>
      <PaperProvider>
        <ModelProvider>
          <DownloadProvider>
            <RemoteModelProvider>
              <GestureHandlerRootView style={{ flex: 1 }}>
                <ThemeProvider>
                  <DialogProvider>
                    <Navigation />
                  </DialogProvider>
                </ThemeProvider>
              </GestureHandlerRootView>
            </RemoteModelProvider>
          </DownloadProvider>
        </ModelProvider>
      </PaperProvider>
    </SafeAreaProvider>
  );
}
