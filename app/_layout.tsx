import React, { useEffect, useRef, useState } from 'react';
import { AppState, AppStateStatus, BackHandler, Platform, Text, TextInput, ToastAndroid, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import * as NavigationBar from 'expo-navigation-bar';
import { useFonts } from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';
import { Stack, useRouter } from 'expo-router';
import * as TaskManager from 'expo-task-manager';
import * as BackgroundTask from 'expo-background-task';
import { PaperProvider, MD3DarkTheme, MD3LightTheme } from 'react-native-paper';

import { ThemeProvider, useTheme } from '../src/context/ThemeContext';
import { RemoteModelProvider } from '../src/context/RemoteModelContext';
import { theme } from '../src/constants/theme';
import { llamaManager } from '../src/utils/LlamaManager';
import { ModelProvider } from '../src/context/ModelContext';
import { DownloadProvider } from '../src/context/DownloadContext';
import { modelDownloader } from '../src/services/ModelDownloader';
import { engineService } from '../src/services/inference-engine-service';
import { notificationService } from '../src/services/NotificationService';
import { initializeAuth } from '../src/services/AuthService';
import { initGeminiService } from '../src/services/GeminiInitializer';
import { initOpenAIService } from '../src/services/OpenAIInitializer';
import { initClaudeService } from '../src/services/ClaudeInitializer';
import { DialogProvider } from '../src/context/DialogContext';
import { ShowDialog } from '../src/components/ShowDialog';
import { initializeBindings } from '../src/utils/llamaBinding';
import UpdateDialog from '../src/components/UpdateDialog';
import SkillRuntimeHost from '../src/components/skills/SkillRuntimeHost';
import CapabilityHost from '../src/components/capabilities/CapabilityHost';
import { updateService } from '../src/services/UpdateService';
import { useResponsiveLayout } from '../src/hooks/useResponsiveLayout';
import { StatusBarHost } from '../src/services/adapters/StatusBarAdapter';

SplashScreen.preventAutoHideAsync();
initializeBindings().catch(() => {});

const BACKGROUND_DOWNLOAD_TASK = 'background-download-check';

if (!TaskManager.isTaskDefined(BACKGROUND_DOWNLOAD_TASK)) {
  try {
    TaskManager.defineTask(BACKGROUND_DOWNLOAD_TASK, async () => {
      try {
        await modelDownloader.checkBackgroundDownloads();
        return BackgroundTask.BackgroundTaskResult.NewData;
      } catch {
        return BackgroundTask.BackgroundTaskResult.Failed;
      }
    });
  } catch {}
}

const initializeServices = async () => {
  try {
    await initializeAuth();
  } catch {}
  try {
    await engineService.load();
  } catch {}
  initGeminiService();
  initOpenAIService();
  initClaudeService();
};

initializeServices();

async function registerBackgroundFetch() {
  try {
    const isRegistered = await TaskManager.isTaskRegisteredAsync(BACKGROUND_DOWNLOAD_TASK);
    if (isRegistered) return;
    await BackgroundTask.registerTaskAsync(BACKGROUND_DOWNLOAD_TASK, {
      minimumInterval: 900,
      stopOnTerminate: false,
      startOnBoot: true,
    });
  } catch {}
}

function ThemedPaper({ children }: { children: React.ReactNode }) {
  const { theme: currentTheme } = useTheme();
  const paperTheme = currentTheme === 'dark' ? MD3DarkTheme : MD3LightTheme;
  return <PaperProvider theme={paperTheme}>{children}</PaperProvider>;
}

function InnerLayout() {
  const { theme: currentTheme } = useTheme();
  const { isWideScreen } = useResponsiveLayout();
  const themeColors = theme[currentTheme];
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const appStateRef = useRef(AppState.currentState);
  const lastBackPressRef = useRef(0);

  useEffect(() => {
    const backSubscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (router.canGoBack()) {
        return false;
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
      registerBackgroundFetch();
    }, 2000);

    const subscription = AppState.addEventListener('change', (nextAppState: AppStateStatus) => {
      try {
        if (appStateRef.current.match(/inactive|background/) && nextAppState === 'active') {
          initializeServices();
          modelDownloader.checkBackgroundDownloads();
        }
        appStateRef.current = nextAppState;
      } catch {}
    });

    return () => {
      clearTimeout(timer);
      backSubscription.remove();
      try {
        llamaManager.release();
        subscription.remove();
      } catch {}
    };
  }, []);

  useEffect(() => {
    notificationService.initialize().catch(() => {});

    return () => {
      TaskManager.isTaskRegisteredAsync(BACKGROUND_DOWNLOAD_TASK).then((registered) => {
        if (registered) BackgroundTask.unregisterTaskAsync(BACKGROUND_DOWNLOAD_TASK).catch(() => {});
      }).catch(() => {});
    };
  }, []);

  useEffect(() => {
    if (Platform.OS !== 'android') return;
    NavigationBar.setBackgroundColorAsync?.(themeColors.navigationBar);
    NavigationBar.setButtonStyleAsync?.('light');
  }, [themeColors]);

  return (
    <>
      <View
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: insets.top,
          backgroundColor: 'transparent',
          zIndex: 999,
        }}
        pointerEvents="none"
      />
      <StatusBarHost
        themeName={currentTheme}
        forceLight={Platform.OS === 'android' && !isWideScreen}
        translucent
      />
      <Stack
        screenOptions={{
          headerShown: false,
          statusBarStyle: Platform.OS === 'ios' ? 'auto' : undefined,
        }}
      >
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="login" options={{ animation: 'slide_from_bottom' }} />
        <Stack.Screen name="register" options={{ animation: 'slide_from_bottom' }} />
        <Stack.Screen name="chat-history" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="downloads" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="profile" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="delete-account" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="licenses" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="content-terms" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="report" options={{ animation: 'slide_from_bottom' }} />
        <Stack.Screen name="model-settings" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="benchmark" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="prompt-lab" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="skill-manager" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="advanced-capabilities" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="audio-scribe" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="mobile-actions" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="llama-cpp-settings" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="mlx-settings" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="litert-settings" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="server-logs" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="api-setup" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="local-server" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="settings" options={{ animation: 'slide_from_right' }} />
      </Stack>
      <ShowDialog />
    </>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    'OpenSans-Light': require('../assets/fonts/OpenSans-Light.ttf'),
    'OpenSans-Regular': require('../assets/fonts/OpenSans-Regular.ttf'),
    'OpenSans-Medium': require('../assets/fonts/OpenSans-Medium.ttf'),
    'OpenSans-SemiBold': require('../assets/fonts/OpenSans-SemiBold.ttf'),
    'OpenSans-Bold': require('../assets/fonts/OpenSans-Bold.ttf'),
    'OpenSans-ExtraBold': require('../assets/fonts/OpenSans-ExtraBold.ttf'),
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
      } catch {}
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

      Text.render = function (props: any, ref: any) {
        return oldTextRender.call(this, {
          ...props,
          style: [{ fontFamily: 'OpenSans-Regular' }, props.style],
        }, ref);
      };

      TextInput.render = function (props: any, ref: any) {
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
                    <InnerLayout />
                    <CapabilityHost />
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
