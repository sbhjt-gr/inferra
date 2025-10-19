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
import * as WebBrowser from 'expo-web-browser';
import { 
  TextInput, 
  Text, 
  Surface, 
  Button, 
  HelperText,
  Divider,
  Dialog,
  Portal,
  Checkbox,
} from 'react-native-paper';
import { registerWithEmail, signInWithGoogle, isEmailFromTrustedProvider, signInWithApple } from '../services/FirebaseService';
import * as AppleAuthentication from 'expo-apple-authentication';

type RegisterScreenProps = {
  navigation: NativeStackNavigationProp<RootStackParamList>;
  route: { params: { redirectTo?: string; redirectParams?: any } };
};

export default function RegisterScreen({ navigation, route }: RegisterScreenProps) {
  const { theme: currentTheme } = useTheme();
  const { checkLoginStatus } = useRemoteModel();
  const themeColors = theme[currentTheme];

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [passwordWarning, setPasswordWarning] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [dialogVisible, setDialogVisible] = useState(false);
  const [isEmailTrusted, setIsEmailTrusted] = useState(true);
  const [isEmailFocused, setIsEmailFocused] = useState(false);
  const [emailTouched, setEmailTouched] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [termsError, setTermsError] = useState<string | null>(null);
  const [isAppleSignInAvailable, setIsAppleSignInAvailable] = useState(false);

  const redirectAfterRegister = route.params?.redirectTo || 'MainTabs';
  const redirectParams = route.params?.redirectParams || { screen: 'HomeTab' };

  const handleOpenTerms = async () => {
    try {
      await WebBrowser.openBrowserAsync('https://inferra.me/terms-conditions');
    } catch (error) {
      setError('Failed to open Terms & Conditions. Please try again.');
    }
  };

  const handleOpenPrivacy = async () => {
    try {
      await WebBrowser.openBrowserAsync('https://inferra.me/privacy-policy');
    } catch (error) {
      setError('Failed to open Privacy Policy. Please try again.');
    }
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

  const validateEmail = (email: string) => {
    const emailRegex = /^[a-zA-Z0-9.!#$%&'*=?^_`{|}~-]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  const handleEmailChange = (text: string) => {
    const trimmedText = text.trim();
    setEmail(trimmedText);
    setIsEmailTrusted(isEmailFromTrustedProvider(trimmedText));
    setEmailTouched(true);
  };


  const handleRegister = async () => {
    if (!name.trim()) {
      setError('Full name is required');
      return;
    }

    if (!email.trim()) {
      setError('Email is required');
      return;
    }

    if (!validateEmail(email.trim().toLowerCase())) {
      setError('Please enter a valid email address');
      return;
    }

    if (!password.trim()) {
      setError('Password is required');
      return;
    }

    if (password.trim() !== confirmPassword.trim()) {
      setError('Passwords do not match');
      return;
    }

    if (!termsAccepted) {
      setTermsError('You must accept the Terms & Conditions and Privacy Policy to continue');
      return;
    }

    setIsLoading(true);
    setError('');
    setPasswordWarning('');
    setTermsError(null);

    try {
      const result = await registerWithEmail(name.trim(), email.trim().toLowerCase(), password.trim());
      
      if (result.success) {
        await checkLoginStatus();
        setDialogVisible(true);
      } else {
        setError(result.error || 'Registration failed');
      }
    } catch (error: any) {
      setError('Registration failed. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    try {
      if (!termsAccepted) {
        setTermsError('You must accept the Terms & Conditions and Privacy Policy to continue');
        return;
      }

      setIsLoading(true);
      setError(null);
      setTermsError(null);
      
      const result = await signInWithGoogle();
      
      if (result.success) {
        await checkLoginStatus();
        
        if (redirectAfterRegister === 'MainTabs') {
          navigation.replace('MainTabs', redirectParams as any);
        } else {
          navigation.replace(redirectAfterRegister as any);
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
      if (!termsAccepted) {
        setTermsError('You must accept the Terms & Conditions and Privacy Policy to continue');
        return;
      }
      if (isLoading) {
        return;
      }
      setIsLoading(true);
      setError(null);
      setTermsError(null);

      const result = await signInWithApple();

      if (result.success) {
        await checkLoginStatus();

        if (redirectAfterRegister === 'MainTabs') {
          navigation.replace('MainTabs', redirectParams as any);
        } else {
          navigation.replace(redirectAfterRegister as any);
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

  const navigateToLogin = () => {
    navigation.navigate('Login', {
      redirectTo: route.params?.redirectTo,
      redirectParams: route.params?.redirectParams
    });
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
                Join Inferra
              </Text>
              <Text style={styles.subtitle} variant="bodyMedium">
                Create your account to get started
              </Text>
            </View>

            <View style={styles.formContainer}>
              <TextInput
                label="Full Name"
                value={name}
                onChangeText={setName}
                mode="outlined"
                style={styles.input}
                autoCapitalize="words"
                left={<TextInput.Icon icon="account" />}
              />

              <TextInput
                label="Email"
                value={email}
                onChangeText={handleEmailChange}
                mode="outlined"
                style={styles.input}
                autoCapitalize="none"
                keyboardType="email-address"
                left={<TextInput.Icon icon="email" />}
                onFocus={() => setIsEmailFocused(true)}
                onBlur={() => setIsEmailFocused(false)}
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

              <TextInput
                label="Confirm Password"
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                mode="outlined"
                style={styles.input}
                secureTextEntry={!showConfirmPassword}
                right={
                  <TextInput.Icon 
                    icon={showConfirmPassword ? "eye-off" : "eye"} 
                    onPress={() => setShowConfirmPassword(!showConfirmPassword)} 
                  />
                }
                left={<TextInput.Icon icon="lock-check" />}
              />

              {error && (
                <HelperText type="error" visible={!!error}>
                  {error}
                </HelperText>
              )}

              {passwordWarning && (
                <HelperText type="info" visible={!!passwordWarning} style={styles.warningText}>
                  {passwordWarning}
                </HelperText>
              )}

              <View style={styles.termsContainer}>
                <View style={styles.checkboxContainer}>
                  <Checkbox.Android
                    status={termsAccepted ? 'checked' : 'unchecked'}
                    onPress={() => {
                      setTermsAccepted(!termsAccepted);
                      setTermsError(null);
                    }}
                    color="#8A2BE2"
                  />
                  <View style={styles.termsTextContainer}>
                    <Text variant="bodySmall">
                      I agree to the{' '}
                      <Text
                        variant="bodySmall"
                        style={styles.linkText}
                        onPress={handleOpenTerms}
                      >
                        Terms & Conditions
                      </Text>
                      {' '}and{' '}
                      <Text
                        variant="bodySmall"
                        style={styles.linkText}
                        onPress={handleOpenPrivacy}
                      >
                        Privacy Policy
                      </Text>
                    </Text>
                  </View>
                </View>
                {termsError && (
                  <HelperText type="error" visible={!!termsError}>
                    {termsError}
                  </HelperText>
                )}
              </View>

              <Button
                key={`register-button-${isLoading}`}
                mode="contained"
                onPress={handleRegister}
                disabled={isLoading}
                style={styles.registerButton}
                contentStyle={styles.buttonContent}
                loading={isLoading}
                buttonColor="#8A2BE2"
                textColor={currentTheme === 'dark' ? '#FFFFFF' : undefined}
              >
                Create Account
              </Button>
              
              <View style={styles.socialContainer}>
                <Text variant="bodySmall" style={styles.dividerText}>Or sign up with</Text>
                
                <Button
                  key={`google-button-${isLoading}`}
                  mode="outlined"
                  icon="google"
                  style={styles.socialButton}
                  contentStyle={styles.socialButtonContent}
                  onPress={() => {
                    if (typeof handleGoogleSignIn === 'function') {
                      handleGoogleSignIn();
                    } else {
                      setError('Google sign-in is not available');
                    }
                  }}
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
              
              <View style={styles.loginContainer}>
                <Text variant="bodyMedium">
                  Already have an account?
                </Text>
                <Button 
                  key="sign-in-button"
                  mode="text" 
                  onPress={navigateToLogin}
                  style={styles.loginButton}
                  textColor={currentTheme === 'dark' ? '#FFFFFF' : undefined}
                >
                  Sign In
                </Button>
              </View>
            </View>
          </Surface>

        </ScrollView>
      </KeyboardAvoidingView>

      <Portal>
        <Dialog visible={dialogVisible} onDismiss={() => {
          setDialogVisible(false);
          if (redirectAfterRegister === 'MainTabs') {
            navigation.replace('MainTabs', redirectParams as any);
          } else {
            navigation.replace(redirectAfterRegister as any);
          }
        }}>
          <Dialog.Title>Email Verification</Dialog.Title>
          <Dialog.Content>
            <Text variant="bodyMedium">
              A verification email has been sent to your email address. Please verify your email before continuing.
            </Text>
          </Dialog.Content>
          <Dialog.Actions>
            <Button 
              key="dialog-ok-button"
              onPress={() => {
                setDialogVisible(false);
                if (redirectAfterRegister === 'MainTabs') {
                  navigation.replace('MainTabs', redirectParams as any);
                } else {
                  navigation.replace(redirectAfterRegister as any);
                }
              }}>OK</Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
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
  registerButton: {
    marginTop: 8,
    borderRadius: 8,
  },
  buttonContent: {
    height: 48,
  },
  divider: {
    marginVertical: 24,
  },
  loginContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  loginButton: {
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
  warningText: {
    marginBottom: 16,
    color: '#FF9800',
  },
  termsContainer: {
    marginBottom: 16,
  },
  checkboxContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'transparent',
    marginVertical: 4,
  },
  termsTextContainer: {
    flex: 1,
    marginLeft: 8,
  },
  linkText: {
    color: '#8A2BE2',
    textDecorationLine: 'underline',
  },
}); 
