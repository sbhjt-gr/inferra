import { NavigationContainer, DefaultTheme, DarkTheme } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { Platform, StatusBar } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import HomeScreen from './src/screens/HomeScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import ModelScreen from './src/screens/ModelScreen';
import { RootStackParamList } from './src/types/navigation';
import { ThemeProvider, useTheme } from './src/context/ThemeContext';
import { theme } from './src/constants/theme';
import { useEffect } from 'react';
import { llamaManager } from './src/utils/LlamaManager';
import ChatHistoryScreen from './src/screens/ChatHistoryScreen';
import { ModelProvider } from './src/context/ModelContext';

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator<RootStackParamList>();

function TabNavigator() {
  const { theme: currentTheme } = useTheme();
  const themeColors = theme[currentTheme];

  return (
    <>
      <StatusBar
        backgroundColor={themeColors.statusBarBg}
        barStyle={`${themeColors.statusBarStyle}-content`}
      />
      <Tab.Navigator
        screenOptions={({ route }) => ({
          headerShown: false,
          tabBarIcon: ({ focused, color, size }) => {
            let iconName;

            switch (route.name) {
              case 'HomeTab':
                iconName = focused ? 'home' : 'home-outline';
                break;
              case 'Model':
                iconName = focused ? 'cube' : 'cube-outline';
                break;
              case 'Settings':
                iconName = focused ? 'settings' : 'settings-outline';
                break;
              default:
                iconName = 'alert-circle';
            }

            return <Ionicons name={iconName} size={size} color={color} />;
          },
          tabBarActiveTintColor: themeColors.tabBarActiveText,
          tabBarInactiveTintColor: themeColors.tabBarInactiveText,
          tabBarStyle: {
            backgroundColor: themeColors.tabBarBackground,
            height: 75,
            paddingTop: 10,
          },
          tabBarLabelStyle: {
            fontSize: 12,
            marginBottom: Platform.OS === 'ios' ? 0 : 5,
          },
        })}
      >
        <Tab.Screen 
          name="HomeTab" 
          component={HomeScreen} 
          options={{ 
            tabBarLabel: 'Chat'
          }}
        />
        <Tab.Screen 
          name="Model" 
          component={ModelScreen}
          options={{ 
            tabBarLabel: 'Models'
          }}
        />
        <Tab.Screen 
          name="Settings" 
          component={SettingsScreen}
          options={{ 
            tabBarLabel: 'Settings'
          }}
        />
      </Tab.Navigator>
    </>
  );
}

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
        <Stack.Navigator
          screenOptions={{
            headerShown: false,
            navigationBarColor: themeColors.navigationBar,
            navigationBarHidden: false,
          }}
        >
          <Stack.Screen 
            name="MainTabs" 
            component={TabNavigator}
          />
          <Stack.Screen 
            name="ChatHistory" 
            component={ChatHistoryScreen}
          />
        </Stack.Navigator>
      </NavigationContainer>
    </>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <ModelProvider>
        <GestureHandlerRootView style={{ flex: 1 }}>
          <ThemeProvider>
            <Navigation />
          </ThemeProvider>
        </GestureHandlerRootView>
      </ModelProvider>
    </SafeAreaProvider>
  );
}
