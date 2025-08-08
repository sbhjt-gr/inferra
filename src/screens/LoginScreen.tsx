import React, { useState } from 'react';
import {
  StyleSheet,
  View,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  TouchableOpacity,
  Image,
} from 'react-native';
import { useTheme } from '../context/ThemeContext';
import { theme } from '../constants/theme';
import { useRemoteModel } from '../context/RemoteModelContext';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../types/navigation';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { 
  TextInput, 
  Text, 
  Surface, 
  Button, 
  HelperText, 
  Divider,
} from 'react-native-paper';
import { loginWithEmail, signInWithGoogleLogin, debugGoogleOAuthConfig } from '../services/FirebaseService';

type LoginScreenProps = {
  navigation: NativeStackNavigationProp<RootStackParamList>;
  route: { params: { redirectTo?: string; redirectParams?: any } };
};

export default function LoginScreen({ navigation, route }: LoginScreenProps) {
  const { theme: currentTheme } = useTheme();
  const { checkLoginStatus } = useRemoteModel();
  const themeColors = theme[currentTheme];

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [googleButtonEnabled, setGoogleButtonEnabled] = useState(false);

  const redirectAfterLogin = route.params?.redirectTo || 'MainTabs';
  const redirectParams = route.params?.redirectParams || { screen: 'HomeTab' };

  const navigateToRegister = () => {
    navigation.navigate('Register', {
      redirectTo: route.params?.redirectTo,
      redirectParams: route.params?.redirectParams
    });
  };

  const handlePasswordEyeLongPress = () => {
    setGoogleButtonEnabled(true);
    setTimeout(() => {
      setGoogleButtonEnabled(false);
    }, 30000);
  };

  const handleLogin = async () => {
    if (!email.trim()) {
      setError('Email is required');
      return;
    }

    if (!password.trim()) {
      setError('Password is required');
      return;
    }

    try {
      setIsLoading(true);
      setError(null);
      
      const result = await loginWithEmail(email, password);
      
      if (result.success) {
        await checkLoginStatus();
        
        if (redirectAfterLogin === 'MainTabs') {
          navigation.replace('MainTabs', redirectParams as any);
        } else {
          navigation.replace(redirectAfterLogin as any);
        }
      } else {
        setError(result.error || 'Login failed. Please try again.');
      }
    } catch (err) {
      setError('Login failed. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    try {
      setIsLoading(true);
      setError(null);
      
      debugGoogleOAuthConfig();
      
      const result = await signInWithGoogleLogin();
      
      if (result.success) {
        await checkLoginStatus();
        
        if (redirectAfterLogin === 'MainTabs') {
          navigation.replace('MainTabs', redirectParams as any);
        } else {
          navigation.replace(redirectAfterLogin as any);
        }
      } else {
        setError(result.error || 'Google sign-in failed. Please try again.');
      }
    } catch (err) {
      setError('Google sign-in failed. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: '#660880' }]}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView 
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.headerContainer}>
            <TouchableOpacity 
              style={styles.backButton}
              onPress={() => navigation.goBack()}
            >
              <MaterialCommunityIcons 
                name="arrow-left" 
                size={24} 
                color="#FFFFFF" 
              />
            </TouchableOpacity>
          </View>

          <Surface style={styles.formSurface} elevation={2}>
            <View style={styles.logoContainer}>
              <Image
                source={require('../../assets/icon.png')}
                style={styles.logoImage}
                
              />
              <Text style={styles.logoText} variant="headlineMedium">
                Welcome Back
              </Text>
              <Text style={styles.subtitle} variant="bodyMedium">
                Sign in to your account
              </Text>
            </View>

            <View style={styles.formContainer}>
              <TextInput
                label="Email"
                value={email}
                onChangeText={setEmail}
                mode="outlined"
                style={styles.input}
                autoCapitalize="none"
                keyboardType="email-address"
                left={<TextInput.Icon icon="email" />}
              />

              <TextInput
                label="Password"
                value={password}
                onChangeText={setPassword}
                mode="outlined"
                style={styles.input}
                secureTextEntry={!showPassword}
                right={
                  <TextInput.Icon 
                    icon={showPassword ? "eye-off" : "eye"} 
                    onPress={() => setShowPassword(!showPassword)}
                    onLongPress={handlePasswordEyeLongPress}
                  />
                }
                left={<TextInput.Icon icon="lock" />}
              />

              {error && (
                <HelperText type="error" visible={!!error}>
                  {error}
                </HelperText>
              )}

              <Button
                mode="contained"
                onPress={handleLogin}
                disabled={isLoading}
                style={styles.loginButton}
                contentStyle={styles.buttonContent}
                loading={isLoading}
                buttonColor="#8A2BE2"
                textColor={currentTheme === 'dark' ? '#FFFFFF' : undefined}
              >
                Sign In
              </Button>
              
              <View style={styles.socialContainer}>
                <Text variant="bodySmall" style={styles.dividerText}>Or sign in with</Text>
                
                <View style={styles.socialButtonsRow}>
                  <Button
                    mode="outlined"
                    icon="google"
                    style={[styles.socialButton, { marginHorizontal: 0 }]}
                    contentStyle={styles.socialButtonContent}
                    onPress={handleGoogleSignIn}
                    disabled={!googleButtonEnabled || isLoading}
                  >
                    Google
                  </Button>
                </View>
              </View>
              
              <Divider style={styles.divider} />
              
              <View style={styles.registerContainer}>
                <Text variant="bodyMedium">
                  Don't have an account?
                </Text>
                <Button 
                  mode="text" 
                  onPress={navigateToRegister}
                  style={styles.registerButton}
                >
                  Sign Up
                </Button>
              </View>
            </View>
          </Surface>

        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    padding: 20,
  },
  headerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
    paddingTop: 10,
  },
  backButton: {
    padding: 8,
  },
  formSurface: {
    borderRadius: 16,
    padding: 24,
    marginVertical: 10,
  },
  logoContainer: {
    alignItems: 'center',
    marginBottom: 24,
  },
  logoImage: {
    width: 80,
    height: 80,
    resizeMode: 'contain',
    borderRadius: 40,
  },
  logoText: {
    fontWeight: 'bold',
    marginTop: 12,
    marginBottom: 4,
  },
  subtitle: {
    opacity: 0.7,
    textAlign: 'center',
  },
  formContainer: {
    width: '100%',
  },
  input: {
    marginBottom: 16,
  },
  loginButton: {
    marginTop: 8,
    borderRadius: 8,
  },
  buttonContent: {
    height: 48,
  },
  divider: {
    marginVertical: 24,
  },
  registerContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  registerButton: {
    marginLeft: 4,
  },
  demoNote: {
    textAlign: 'center',
    opacity: 0.9,
    marginTop: 24,
    marginBottom: 16,
    color: '#FFFFFF',
    fontWeight: '300',
  },
  socialContainer: {
    marginTop: 24,
    alignItems: 'center',
  },
  dividerText: {
    marginBottom: 16,
    opacity: 0.7,
  },
  socialButtonsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
  },
  socialButton: {
    flex: 1,
    marginHorizontal: 6,
    borderColor: '#8A2BE2',
  },
  socialButtonContent: {
    height: 40,
  },
}); 