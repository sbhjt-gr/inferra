import React, { useEffect, useState } from 'react';
import { StyleSheet, View, Text, ScrollView, TouchableOpacity, Alert } from 'react-native';
import { useTheme } from '../context/ThemeContext';
import { theme } from '../constants/theme';
import AppHeader from '../components/AppHeader';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../types/navigation';
import { getCurrentUser, logoutUser } from '../services/FirebaseService';
import { useRemoteModel } from '../context/RemoteModelContext';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type ProfileScreenProps = {
  navigation: NativeStackNavigationProp<RootStackParamList>;
};

export default function ProfileScreen({ navigation }: ProfileScreenProps) {
  const { theme: currentTheme } = useTheme();
  const themeColors = theme[currentTheme];
  const insets = useSafeAreaInsets();
  const { checkLoginStatus } = useRemoteModel();
  const [userData, setUserData] = useState({
    displayName: '',
    email: '',
    emailVerified: false,
    creationTime: '',
    lastSignInTime: ''
  });

  useEffect(() => {
    loadUserData();
  }, []);

  const loadUserData = () => {
    const user = getCurrentUser();
    if (user) {
      setUserData({
        displayName: user.displayName || 'User',
        email: user.email || '',
        emailVerified: user.emailVerified,
        creationTime: user.metadata.creationTime || '',
        lastSignInTime: user.metadata.lastSignInTime || ''
      });
    }
  };

  const formatDate = (dateString: string) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const handleSignOut = async () => {
    Alert.alert(
      'Sign Out',
      'Are you sure you want to sign out?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign Out',
          style: 'destructive',
          onPress: async () => {
            const result = await logoutUser();
            if (result.success) {
              await checkLoginStatus();
              navigation.navigate('MainTabs', { screen: 'SettingsTab' });
            } else {
              Alert.alert('Error', result.error || 'Failed to sign out');
            }
          }
        }
      ]
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: themeColors.background }]}>
      <AppHeader 
        title="My Profile"
        showBackButton={true}
        showLogo={false}
      />
      <ScrollView contentContainerStyle={[styles.contentContainer, { paddingBottom: insets.bottom + 20 }]}>
        <View style={[styles.profileHeader, { backgroundColor: themeColors.background }]}>
          <View style={[styles.avatarContainer, { backgroundColor: themeColors.primary + '20' }]}>
            <MaterialCommunityIcons 
              name="account" 
              size={60} 
              color={themeColors.primary} 
            />
          </View>
          <Text style={[styles.displayName, { color: themeColors.text }]}>
            {userData.displayName}
          </Text>
          <Text style={[styles.email, { color: themeColors.secondaryText }]}>
            {userData.email}
          </Text>
          <View style={styles.verificationContainer}>
            <MaterialCommunityIcons 
              name={userData.emailVerified ? "check-circle" : "alert-circle"} 
              size={16} 
              color={userData.emailVerified ? "#4CAF50" : "#FFC107"} 
            />
            <Text style={[styles.verificationText, { 
              color: userData.emailVerified ? "#4CAF50" : "#FFC107" 
            }]}>
              {userData.emailVerified ? "Email Verified" : "Email Not Verified"}
            </Text>
          </View>
        </View>

        <View style={[styles.section, { backgroundColor: themeColors.background }]}>
          <Text style={[styles.sectionTitle, { color: themeColors.text }]}>
            Account Information
          </Text>
          <View style={styles.infoRow}>
            <Text style={[styles.infoLabel, { color: themeColors.secondaryText }]}>
              Account Created
            </Text>
            <Text style={[styles.infoValue, { color: themeColors.text }]}>
              {formatDate(userData.creationTime)}
            </Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={[styles.infoLabel, { color: themeColors.secondaryText }]}>
              Last Sign In
            </Text>
            <Text style={[styles.infoValue, { color: themeColors.text }]}>
              {formatDate(userData.lastSignInTime)}
            </Text>
          </View>
        </View>

        <TouchableOpacity 
          style={[styles.signOutButton, { backgroundColor: '#FF5252' + '20' }]}
          onPress={handleSignOut}
        >
          <MaterialCommunityIcons name="logout" size={20} color="#FF5252" />
          <Text style={[styles.signOutText, { color: '#FF5252' }]}>
            Sign Out
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  contentContainer: {
    padding: 16,
    gap: 16,
  },
  profileHeader: {
    padding: 20,
    borderRadius: 12,
    alignItems: 'center',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  avatarContainer: {
    width: 100,
    height: 100,
    borderRadius: 50,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  displayName: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  email: {
    fontSize: 16,
    marginBottom: 12,
  },
  verificationContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  verificationText: {
    fontSize: 14,
    fontWeight: '500',
  },
  section: {
    borderRadius: 12,
    padding: 16,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 16,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(150, 150, 150, 0.1)',
  },
  infoLabel: {
    fontSize: 15,
  },
  infoValue: {
    fontSize: 15,
    fontWeight: '500',
  },
  signOutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    borderRadius: 12,
    gap: 8,
  },
  signOutText: {
    fontSize: 16,
    fontWeight: '600',
  },
});
