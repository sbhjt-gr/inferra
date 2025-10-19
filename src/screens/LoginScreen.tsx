import React, { useEffect, useState } from 'react';
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
import { loginWithEmail, signInWithGoogle, signInWithApple } from '../services/FirebaseService';
import * as AppleAuthentication from 'expo-apple-authentication';

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
  const [isAppleSignInAvailable, setIsAppleSignInAvailable] = useState(false);

  const redirectAfterLogin = route.params?.redirectTo || 'MainTabs';
  const redirectParams = route.params?.redirectParams || { screen: 'HomeTab' };

  const navigateToRegister = () => {
    navigation.navigate('Register', {
      redirectTo: route.params?.redirectTo,
      redirectParams: route.params?.redirectParams
    });
  };

  useEffect(() => {
    let active = true;
    if (Platform.OS !== 'ios') {
      return () => {
        active = false;
      };
    }
    AppleAuthentication.isAvailableAsync()
      .then((available: boolean) => {
        if (active) {
          setIsAppleSignInAvailable(available);
        }
      })
      .catch(() => {
        if (active) {
          setIsAppleSignInAvailable(false);
        }
      });
    return () => {
      active = false;
    };
  }, []);


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

      const result = await loginWithEmail(email.trim().toLowerCase(), password.trim());
      
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
      
      const result = await signInWithGoogle();
      
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

  const handleAppleSignIn = async () => {
    try {
      if (isLoading) {
        return;
      }
      setIsLoading(true);
      setError(null);

      const result = await signInWithApple();

      if (result.success) {
        await checkLoginStatus();

        if (redirectAfterLogin === 'MainTabs') {
          navigation.replace('MainTabs', redirectParams as any);
        } else {
          navigation.replace(redirectAfterLogin as any);
        }
      } else {
        setError(result.error || 'Apple sign-in failed. Please try again.');
      }
    } catch (err) {
      setError('Apple sign-in failed. Please try again.');
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
                
                <Button
                  mode="outlined"
                  icon="google"
                  style={styles.socialButton}
                  contentStyle={styles.socialButtonContent}
                  onPress={handleGoogleSignIn}
                  disabled={isLoading}
                >
                  Google
                </Button>
                {isAppleSignInAvailable && (
                  <AppleAuthentication.AppleAuthenticationButton
                    buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
                    buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
                    cornerRadius={8}
                    style={styles.appleButton}
                    onPress={handleAppleSignIn}
                  />
                )}
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
  socialButton: {
    width: '100%',
    marginBottom: 12,
    borderColor: '#8A2BE2',
    borderRadius: 8,
  },
  socialButtonContent: {
    height: 43,
  },
  appleButton: {
    width: '100%',
    height: 48,
  },
}); 
