import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import HomeScreen from '../screens/HomeScreen';
import SettingsScreen from '../screens/SettingsScreen';
import ModelScreen from '../screens/ModelScreen';
import { TabParamList } from '../types/navigation';
import { useTheme } from '../context/ThemeContext';
import { theme } from '../constants/theme';

const Tab = createBottomTabNavigator<TabParamList>();

export default function MainTabNavigator() {
  const { theme: currentTheme } = useTheme();
  const themeColors = theme[currentTheme];
  const insets = useSafeAreaInsets();

  return (
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

          return <Ionicons name={iconName as any} size={size} color={color} />;
        },
        tabBarActiveTintColor: themeColors.tabBarActiveText,
        tabBarInactiveTintColor: themeColors.tabBarInactiveText,
        tabBarStyle: {
          backgroundColor: themeColors.tabBarBackground,
          height: 60 + insets.bottom,
          paddingTop: 10,
          paddingBottom: insets.bottom,
          borderTopWidth: 0,
          display: 'flex',
        },
        tabBarHideOnKeyboard: false,
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
  );
} 