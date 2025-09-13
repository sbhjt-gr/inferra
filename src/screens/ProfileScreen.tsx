import React, { useEffect, useState, useRef, useCallback } from 'react';
import { StyleSheet, View, Text, ScrollView, TouchableOpacity, AppState, AppStateStatus, ActivityIndicator } from 'react-native';
import { useTheme } from '../context/ThemeContext';
import { theme } from '../constants/theme';
import AppHeader from '../components/AppHeader';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../types/navigation';
import { getCurrentUser, logoutUser, waitForAuthReady, onAuthStateChange, sendVerificationEmail, getUserProfile, initializeFirebase } from '../services/FirebaseAuth';
import { getUserFromSecureStorage } from '../services/AuthStorage';
import { useRemoteModel } from '../context/RemoteModelContext';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useDialog } from '../context/DialogContext';
import { User as FirebaseUser } from 'firebase/auth';

type ProfileScreenProps = {
  navigation: NativeStackNavigationProp<RootStackParamList>;
};

export default function ProfileScreen({ navigation }: ProfileScreenProps) {
  const { theme: currentTheme } = useTheme();
  const themeColors = theme[currentTheme];
  const insets = useSafeAreaInsets();
  const { checkLoginStatus } = useRemoteModel();
  const { showDialog } = useDialog();
  const [userData, setUserData] = useState({
    displayName: '',
    email: '',
    emailVerified: false,
    creationTime: '',
    lastSignInTime: ''
  });
  const [isLoading, setIsLoading] = useState(true);
  const loadingRef = useRef(false);
  const isInitialMount = useRef(true);

  const verificationCheckIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  
  const formatFirestoreDate = (timestamp: any): string => {
    if (!timestamp) return '';
    
    try {
      if (timestamp.toDate) {
        return timestamp.toDate().toISOString();
      }
      
      if (timestamp.seconds) {
        return new Date(timestamp.seconds * 1000).toISOString();
      }
      
      if (typeof timestamp === 'string') {
        return timestamp;
      }
      
      return new Date(timestamp).toISOString();
    } catch (error) {

      return '';
    }
  };
  
  const refreshUserData = useCallback(async (showLoader: boolean = false) => {
    try {
      if (showLoader && !loadingRef.current) {
        loadingRef.current = true;
        setIsLoading(true);
      }
      
      await waitForAuthReady();
      
      const user = getCurrentUser();
      const profile = user ? await getUserProfile(user.uid) : null;
      
      if (profile) {
        setUserData({
          displayName: profile.displayName || user?.displayName || 'User',
          email: profile.email || user?.email || '',
          emailVerified: user?.emailVerified ?? false,
          creationTime: formatFirestoreDate(profile.createdAt),
          lastSignInTime: formatFirestoreDate(profile.lastLoginAt || (user?.metadata?.lastSignInTime ? new Date(user.metadata.lastSignInTime).toISOString() : profile.updatedAt))
        });
      } else if (user) {
        setUserData({
          displayName: user.displayName || 'User',
          email: user.email || '',
          emailVerified: user.emailVerified,
          creationTime: user.metadata.creationTime || '',
          lastSignInTime: user.metadata.lastSignInTime || ''
        });
      }
    } catch (error) {
      await loadUserData(false);
    } finally {
      if (showLoader) {
        loadingRef.current = false;
        setIsLoading(false);
      }
    }
  }, []);
  
  useEffect(() => {
    const handleAppStateChange = async (nextAppState: AppStateStatus) => {
      if (appStateRef.current.match(/inactive|background/) && nextAppState === 'active') {
        await initializeFirebase();
        await refreshUserData(false);
      }
      appStateRef.current = nextAppState;
    };

    let subscription: { remove: () => void } | undefined;
    
    try {
      subscription = AppState.addEventListener('change', handleAppStateChange);
    } catch (error) {
    }

    return () => {
      if (subscription && typeof subscription.remove === 'function') {
        subscription.remove();
      }
    };
  }, [refreshUserData]);
  
  useEffect(() => {
    const initializeAndLoad = async () => {
      await initializeFirebase();
      await loadUserData(true);
    };
    
    initializeAndLoad();
    
    const unsubscribe = onAuthStateChange(async (user: FirebaseUser | null) => {
      if (user && !loadingRef.current) {
        try {
        } catch (error) {
        }
        
        const updatedProfile = user ? await getUserProfile(user.uid) : null;
        if (updatedProfile) {
          setUserData({
            displayName: updatedProfile.displayName || user.displayName || 'User',
            email: updatedProfile.email || user.email || '',
            emailVerified: user.emailVerified,
            creationTime: formatFirestoreDate(updatedProfile.createdAt),
            lastSignInTime: formatFirestoreDate(updatedProfile.lastLoginAt || updatedProfile.updatedAt)
          });
        } else {
          setUserData({
            displayName: user.displayName || 'User',
            email: user.email || '',
            emailVerified: user.emailVerified,
            creationTime: user.metadata.creationTime || '',
            lastSignInTime: user.metadata.lastSignInTime || ''
          });
        }
      }
    });
    
    return () => {
      unsubscribe();
      if (verificationCheckIntervalRef.current) {
        clearInterval(verificationCheckIntervalRef.current);
      }
    };
  }, []);
  
  useFocusEffect(
    useCallback(() => {
      if (isInitialMount.current) {
        isInitialMount.current = false;
        return;
      }
      
      refreshUserData(false);
      
      verificationCheckIntervalRef.current = setInterval(async () => {
        const user = getCurrentUser();
        if (user && !user.emailVerified) {
          try {
            await user.reload();
            refreshUserData(false);
          } catch (error) {
            refreshUserData(false);
          }
        } else if (user && user.emailVerified) {
          if (verificationCheckIntervalRef.current) {
            clearInterval(verificationCheckIntervalRef.current);
            verificationCheckIntervalRef.current = null;
          }
        }
      }, 5000);
      
      return () => {
        if (verificationCheckIntervalRef.current) {
          clearInterval(verificationCheckIntervalRef.current);
          verificationCheckIntervalRef.current = null;
        }
      };
    }, [])
  );

  const loadUserData = async (showLoader: boolean = true) => {
    try {
      if (showLoader && !loadingRef.current) {
        loadingRef.current = true;
        setIsLoading(true);
      }
      
      await waitForAuthReady();
      
      const profile = await getUserFromSecureStorage();
      const user = getCurrentUser();
      
      if (user) {
        try {
          await user.reload();
        } catch (error) {
        }
      }
      
      if (profile) {
        setUserData({
          displayName: profile.displayName || user?.displayName || 'User',
          email: profile.email || user?.email || '',
          emailVerified: user?.emailVerified ?? profile.emailVerified ?? false,
          creationTime: formatFirestoreDate(profile.createdAt),
          lastSignInTime: formatFirestoreDate(profile.lastLoginAt || (user?.metadata?.lastSignInTime ? new Date(user.metadata.lastSignInTime).toISOString() : profile.updatedAt))
        });
      } else if (user) {
        setUserData({
          displayName: user.displayName || 'User',
          email: user.email || '',
          emailVerified: user.emailVerified,
          creationTime: user.metadata.creationTime || '',
          lastSignInTime: user.metadata.lastSignInTime || ''
        });
      }
    } catch (error) {
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
    } finally {
      if (showLoader) {
        loadingRef.current = false;
        setIsLoading(false);
      }
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

  const [emailSentTimestamp, setEmailSentTimestamp] = useState<number | null>(null);
  const [isResendingEmail, setIsResendingEmail] = useState(false);
  const EMAIL_COOLDOWN_PERIOD = 60000;

  const resendVerificationEmail = async () => {
    if (isResendingEmail) return;
    
    try {
      const user = getCurrentUser();
      if (!user) {
        showDialog({
          title: 'Error',
          message: 'You must be logged in to verify your email.'
        });
        return;
      }
      
      if (user.emailVerified) {
        showDialog({
          title: 'Already Verified',
          message: 'Your email is already verified.'
        });
        return;
      }

      const currentTime = Date.now();
      if (emailSentTimestamp && (currentTime - emailSentTimestamp < EMAIL_COOLDOWN_PERIOD)) {
        const remainingSeconds = Math.ceil((EMAIL_COOLDOWN_PERIOD - (currentTime - emailSentTimestamp)) / 1000);
        showDialog({
          title: 'Rate Limited',
          message: `Please wait ${remainingSeconds} seconds before requesting another verification email.`
        });
        return;
      }

      setIsResendingEmail(true);
      
      showDialog({
        message: 'Resending verification email...',
        showLoading: true,
        showTitle: false
      });

      const result = await sendVerificationEmail();
      
      if (result.success) {
        setEmailSentTimestamp(currentTime);
        
        showDialog({
          title: 'Verification Email Sent',
          message: 'Please check your email and click the verification link. The status will update automatically once verified.'
        });
      }
      
    } catch (error: any) {
      showDialog({
        title: 'Error',
        message: 'An unexpected error occurred. Please try again.'
      });
    } finally {
      setIsResendingEmail(false);
    }
  };

  const handleSignOut = async () => {
    showDialog({
      title: 'Sign Out',
      message: 'Are you sure you want to sign out?',
      confirmText: 'Sign Out',
      cancelText: 'Cancel',
      onConfirm: async () => {
        const result = await logoutUser();
        if (result.success) {
          await checkLoginStatus();
          navigation.navigate('MainTabs', { screen: 'SettingsTab' });
        } else {
          showDialog({
            title: 'Error',
            message: result.error || 'Failed to sign out'
          });
        }
      }
    });
  };

  if (isLoading) {
    return (
      <View style={[styles.container, { backgroundColor: themeColors.background }]}>
        <AppHeader 
          title="My Profile"
          showBackButton={true}
          showLogo={false}
          rightButtons={[]}
        />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={themeColors.primary} />
          <Text style={[styles.loadingText, { color: themeColors.text }]}>
            Loading profile...
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: themeColors.background }]}>
      <AppHeader 
        title="My Profile"
        showBackButton={true}
        showLogo={false}
        rightButtons={[]}
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
            {!userData.emailVerified && (
              <TouchableOpacity 
                style={[styles.resendButton, isResendingEmail && styles.resendButtonDisabled]}
                onPress={resendVerificationEmail}
                disabled={isResendingEmail}
                accessibilityLabel="Resend verification email"
                accessibilityHint="Sends a new verification email to your address"
              >
                {isResendingEmail ? (
                  <View style={styles.resendButtonContent}>
                    <ActivityIndicator size="small" color="#fff" style={styles.resendButtonLoader} />
                    <Text style={styles.resendButtonText}>Sending...</Text>
                  </View>
                ) : (
                  <Text style={styles.resendButtonText}>Resend Email</Text>
                )}
              </TouchableOpacity>
            )}
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
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
  },
  loadingText: {
    fontSize: 16,
    fontWeight: '500',
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
    flexWrap: 'wrap',
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
  resendButton: {
    marginLeft: 10,
    backgroundColor: '#FFC107',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    marginTop: 5,
  },
  resendButtonDisabled: {
    backgroundColor: '#FFC107',
    opacity: 0.7,
  },
  resendButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  resendButtonLoader: {
    marginRight: 4,
  },
  resendButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 12,
  },
});
