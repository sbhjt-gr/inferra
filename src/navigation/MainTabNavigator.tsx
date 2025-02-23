import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Platform, StatusBar } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
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

            return <Ionicons name={iconName as any} size={size} color={color} />;
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