import React, { useState } from 'react';
import {
  StyleSheet,
  View,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  TouchableOpacity,
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
  Dialog,
  Portal,
} from 'react-native-paper';
import { registerWithEmail, signInWithGoogle, signInWithGithub } from '../services/FirebaseService';

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
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [dialogVisible, setDialogVisible] = useState(false);

  const redirectAfterRegister = route.params?.redirectTo || 'MainTabs';
  const redirectParams = route.params?.redirectParams || { screen: 'HomeTab' };

  const validateEmail = (email: string) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  const handleRegister = async () => {
    setError(null);
    
    if (!name.trim()) {
      setError('Name is required');
      return;
    }

    if (!email.trim()) {
      setError('Email is required');
      return;
    }

    if (!validateEmail(email)) {
      setError('Please enter a valid email address');
      return;
    }

    if (!password.trim()) {
      setError('Password is required');
      return;
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    try {
      setIsLoading(true);
      
      const result = await registerWithEmail(name, email, password);
      
      if (result.success) {
        await checkLoginStatus();
        
        setDialogVisible(true);
      } else {
        setError(result.error || 'Registration failed. Please try again.');
      }
    } catch (err) {
      setError('Registration failed. Please try again.');
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

  const handleGithubSignIn = async () => {
    try {
      setIsLoading(true);
      setError(null);
      
      const result = await signInWithGithub();
      
      if (result.success) {
        await checkLoginStatus();
        
        if (redirectAfterRegister === 'MainTabs') {
          navigation.replace('MainTabs', redirectParams as any);
        } else {
          navigation.replace(redirectAfterRegister as any);
        }
      } else {
        setError(result.error || 'GitHub sign-in failed. Please try again.');
      }
    } catch (err) {
      setError('GitHub sign-in failed. Please try again.');
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
              <MaterialCommunityIcons
                name="brain"
                size={48}
                color="#660880"
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

              <Button
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
                    mode="outlined"
                    icon="google"
                    style={styles.socialButton}
                    contentStyle={styles.socialButtonContent}
                    onPress={handleGoogleSignIn}
                    disabled={isLoading}
                  >
                    Google
                  </Button>
                  
                  <Button
                    mode="outlined"
                    icon="github"
                    style={styles.socialButton}
                    contentStyle={styles.socialButtonContent}
                    onPress={handleGithubSignIn}
                    disabled={isLoading}
                  >
                    GitHub
                  </Button>
                </View>
              </View>
              
              <Divider style={styles.divider} />
              
              <View style={styles.loginContainer}>
                <Text variant="bodyMedium">
                  Already have an account?
                </Text>
                <Button 
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
            <Button onPress={() => {
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
}); 