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
import { registerWithEmail, signInWithGoogle, isEmailFromTrustedProvider, testFirebaseConnection, debugGoogleOAuthConfig } from '../services/FirebaseService';

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

  const validateEmail = (email: string) => {
    const emailRegex = /^[a-zA-Z0-9.!#$%&'*=?^_`{|}~-]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  const handleEmailChange = (text: string) => {
    setEmail(text);
    setIsEmailTrusted(isEmailFromTrustedProvider(text));
    setEmailTouched(true);
  };

  const handleRegister = async () => {
    if (password !== confirmPassword) {
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
      console.log('Testing Firebase connection...');
      const connectionTest = await testFirebaseConnection();
      
      if (!connectionTest.connected) {
        console.error('Firebase connection failed:', connectionTest.error);
        setError(`Firebase configuration error: ${connectionTest.error}`);
        setIsLoading(false);
        return;
      }
      
      console.log('Firebase connection OK, proceeding with registration...');
      
      const result = await registerWithEmail(name, email, password);
      
      if (result.success) {
        console.log('Registration successful');
        await checkLoginStatus();
        
        if (result.passwordWarning) {
          setPasswordWarning(result.passwordWarning);
        }
        
        setDialogVisible(true);
      } else {
        console.error('Registration failed:', result.error);
        setError(result.error || 'Registration failed');
        
        if (result.passwordWarning) {
          setPasswordWarning(result.passwordWarning);
        }
      }
    } catch (error: any) {
      console.error('Registration error:', error);
      setError(error.message || 'Registration failed');
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
      
      debugGoogleOAuthConfig();
      
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
      console.error('Google sign-in error:', err);
      setError('Google sign-in failed. Please try again.');
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
                
                <View style={styles.socialButtonsRow}>
                  <Button
                    key={`google-button-${isLoading}`}
                    mode="outlined"
                    icon="google"
                    style={[styles.socialButton, { marginHorizontal: 0 }]}
                    contentStyle={styles.socialButtonContent}
                    onPress={() => {
                      if (typeof handleGoogleSignIn === 'function') {
                        handleGoogleSignIn();
                      } else {
                        console.error('Google sign-in handler is not defined');
                        setError('Google sign-in is not available');
                      }
                    }}
                    disabled={isLoading}
                  >
                    Google
                  </Button>
                </View>
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