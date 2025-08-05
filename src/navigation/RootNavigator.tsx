import { createNativeStackNavigator } from '@react-navigation/native-stack';
import MainTabNavigator from './MainTabNavigator';
import SettingsScreen from '../screens/SettingsScreen';
import ChatHistoryScreen from '../screens/ChatHistoryScreen';
import DownloadsScreen from '../screens/DownloadsScreen';
import LoginScreen from '../screens/LoginScreen';
import RegisterScreen from '../screens/RegisterScreen';
import ProfileScreen from '../screens/ProfileScreen';
import LicensesScreen from '../screens/LicensesScreen';
import ReportScreen from '../screens/ReportScreen';
import { RootStackParamList } from '../types/navigation';

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function RootNavigator() {

  return (
      <Stack.Navigator
        screenOptions={{
          headerShown: false,
          gestureEnabled: false,
        }}
      >
        <Stack.Screen name="MainTabs" component={MainTabNavigator} />
        <Stack.Screen name="Settings" component={SettingsScreen} />
        <Stack.Screen 
          name="ChatHistory" 
          component={ChatHistoryScreen}
          options={{
            animation: 'slide_from_right'
          }}
        />
        <Stack.Screen name="Downloads" component={DownloadsScreen} />
        <Stack.Screen 
          name="Login" 
          component={LoginScreen}
          options={{
            animation: 'slide_from_bottom'
          }}
        />
        <Stack.Screen 
          name="Register" 
          component={RegisterScreen}
          options={{
            animation: 'slide_from_bottom'
          }}
        />
        <Stack.Screen 
          name="Profile" 
          component={ProfileScreen}
          options={{
            animation: 'slide_from_right'
          }}
        />
        <Stack.Screen 
          name="Licenses" 
          component={LicensesScreen}
          options={{
            animation: 'slide_from_right'
          }}
        />
        <Stack.Screen 
          name="Report" 
          component={ReportScreen}
          options={{
            animation: 'slide_from_bottom'
          }}
        />
      </Stack.Navigator>
  );
} 