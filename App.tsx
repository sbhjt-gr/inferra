import React, { useEffect, useRef, useState } from 'react';
import { NavigationContainer, DefaultTheme, DarkTheme } from '@react-navigation/native';
import { AppState, AppStateStatus, Text, TextInput, LogBox, BackHandler, ToastAndroid } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
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
import { engineService } from './src/services/inference-engine-service';
import * as TaskManager from 'expo-task-manager';
import * as BackgroundTask from 'expo-background-task';
import { notificationService } from './src/services/NotificationService';
import { initializeAuth } from './src/services/AuthService';
import { initGeminiService } from './src/services/GeminiInitializer';
import { initOpenAIService } from './src/services/OpenAIInitializer';
import { initClaudeService } from './src/services/ClaudeInitializer';
import { PaperProvider, MD3DarkTheme, MD3LightTheme } from 'react-native-paper';
import { DialogProvider } from './src/context/DialogContext';
import { ShowDialog } from './src/components/ShowDialog';
import { initializeBindings } from './src/utils/llamaBinding';
import UpdateDialog from './src/components/UpdateDialog';
import SkillRuntimeHost from './src/components/skills/SkillRuntimeHost';
import { updateService } from './src/services/UpdateService';
import { StatusBarHost } from './src/services/adapters/StatusBarAdapter';
import { skillManager } from './src/services/SkillManager';
import { registerWebSearch } from './src/services/tools/WebSearchTool';
import { initReminderNotifications } from './src/services/adapters/ReminderNotificationAdapter';

SplashScreen.preventAutoHideAsync();

initReminderNotifications().catch(() => {});

initializeBindings().catch(() => {});

const initializeServices = async () => {
  try {
    await initializeAuth();
  } catch (error) {
  }
  
  try {
    await engineService.load();
  } catch (error) {
  }
  
  initGeminiService();
  initOpenAIService();
  initClaudeService();

  try {
    registerWebSearch();
    await skillManager.syncTools();
  } catch {
  }
};

initializeServices();

const BACKGROUND_DOWNLOAD_TASK = 'background-download-check';

if (!TaskManager.isTaskDefined(BACKGROUND_DOWNLOAD_TASK)) {
  try {
    TaskManager.defineTask(BACKGROUND_DOWNLOAD_TASK, async () => {
      try {
        await modelDownloader.checkBackgroundDownloads();
        return BackgroundTask.BackgroundTaskResult.NewData;
      } catch (error) {
        return BackgroundTask.BackgroundTaskResult.Failed;
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
    
    await BackgroundTask.registerTaskAsync(BACKGROUND_DOWNLOAD_TASK, {
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
  const appState = useRef(AppState.currentState);
  const navigationRef = useRef<any>(null);
  const lastBackPressRef = useRef(0);

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
    const backSubscription = BackHandler.addEventListener('hardwareBackPress', () => {
      const nav = navigationRef.current;
      if (!nav || typeof nav.isReady !== 'function' || !nav.isReady()) {
        return false;
      }

      if (nav.canGoBack()) {
        return false;
      }

      const currentRoute = nav.getCurrentRoute?.();
      if (currentRoute?.name !== 'HomeTab') {
        nav.navigate('MainTabs', { screen: 'HomeTab' });
        return true;
      }

      const now = Date.now();
      if (now - lastBackPressRef.current < 1500) {
        return false;
      }

      lastBackPressRef.current = now;
      ToastAndroid.show('Press back again to exit', ToastAndroid.SHORT);
      return true;
    });

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
            initializeServices();
            modelDownloader.checkBackgroundDownloads();
          } else if (appState.current === 'active' && nextAppState.match(/inactive|background/)) {
            
          }
          
          appState.current = nextAppState;
        } catch (error) {
          
        }
      });
    } catch (error) {
      const changeHandler = (nextAppState: AppStateStatus) => {
        try {
          if (appState.current.match(/inactive|background/) && nextAppState === 'active') {
            initializeServices();
            modelDownloader.checkBackgroundDownloads();
          } else if (appState.current === 'active' && nextAppState.match(/inactive|background/)) {
            
          }
          
          appState.current = nextAppState;
        } catch (error) {
          
        }
      };
      
      try {
        subscription = AppState.addEventListener('change', changeHandler);
      } catch (err) {
      }
    }

    return () => {
      clearTimeout(timer);
      backSubscription.remove();
      try {
        llamaManager.release();
        if (subscription && typeof subscription.remove === 'function') {
          subscription.remove();
        }
      } catch (error) {
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
        BackgroundTask.unregisterTaskAsync(BACKGROUND_DOWNLOAD_TASK);
      } catch (error) {
        // do nothing
      }
    };
  }, []);

  return (
      <NavigationContainer 
        ref={navigationRef}
        theme={currentTheme === 'dark' ? customDarkTheme : customDefaultTheme}
      >
        <StatusBarHost themeName={currentTheme} translucent />
        <RootNavigator />
        <ShowDialog />
      </NavigationContainer>
  );
}

export default function App() {
  const [fontsLoaded, fontError] = useFonts({
    'OpenSans-Light': require('./assets/fonts/OpenSans-Light.ttf'),
    'OpenSans-Regular': require('./assets/fonts/OpenSans-Regular.ttf'),
    'OpenSans-Medium': require('./assets/fonts/OpenSans-Medium.ttf'),
    'OpenSans-SemiBold': require('./assets/fonts/OpenSans-SemiBold.ttf'),
    'OpenSans-Bold': require('./assets/fonts/OpenSans-Bold.ttf'),
    'OpenSans-ExtraBold': require('./assets/fonts/OpenSans-ExtraBold.ttf'),
  });
  const [autoUpdated, setAutoUpdated] = useState(false);

  useEffect(() => {
    async function handleAutoUpdate() {
      try {
        const result = await Promise.race([
          updateService.checkForUpdate(),
          new Promise<null>(resolve => setTimeout(() => resolve(null), 5000)),
        ]);
        if (result?.manifest && updateService.isManifestAutoUpdate(result.manifest)) {
          await Promise.race([
            updateService.fetchAndReload(),
            new Promise<never>((_, reject) =>
              setTimeout(() => reject(new Error('fetch_timeout')), 15000)
            ),
          ]);
          return;
        }
      } catch {
      }
      setAutoUpdated(true);
    }
    handleAutoUpdate();
  }, []);

  useEffect(() => {
    if ((fontsLoaded || fontError) && autoUpdated) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError, autoUpdated]);

  useEffect(() => {
    if (fontsLoaded) {
      const oldTextRender = Text.render;
      const oldTextInputRender = TextInput.render;

      Text.render = function (props, ref) {
        return oldTextRender.call(this, {
          ...props,
          style: [{ fontFamily: 'OpenSans-Regular' }, props.style],
        }, ref);
      };

      TextInput.render = function (props, ref) {
        return oldTextInputRender.call(this, {
          ...props,
          style: [{ fontFamily: 'OpenSans-Regular' }, props.style],
        }, ref);
      };
    }
  }, [fontsLoaded]);

  if (!fontsLoaded && !fontError) {
    return null;
  }

  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <ThemedPaper>
          <ModelProvider>
            <DownloadProvider>
              <RemoteModelProvider>
                <GestureHandlerRootView style={{ flex: 1 }}>
                  <DialogProvider>
                    <Navigation />
                  </DialogProvider>
                  <SkillRuntimeHost />
                  <UpdateDialog />
                </GestureHandlerRootView>
              </RemoteModelProvider>
            </DownloadProvider>
          </ModelProvider>
        </ThemedPaper>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

function ThemedPaper({ children }: { children: React.ReactNode }) {
  const { theme: currentTheme } = useTheme();
  const paperTheme = currentTheme === 'dark' ? MD3DarkTheme : MD3LightTheme;
  return <PaperProvider theme={paperTheme}>{children}</PaperProvider>;
}
