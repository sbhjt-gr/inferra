import React, { useState } from 'react';
import { StyleSheet, View, TextInput, TouchableOpacity } from 'react-native';
import { Dialog, Portal, Button, Text } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { theme } from '../constants/theme';

type LoginDialogProps = {
  visible: boolean;
  onDismiss: () => void;
  onLogin: (email: string, password: string) => void;
  isLoading: boolean;
};

export default function LoginDialog({ 
  visible, 
  onDismiss, 
  onLogin,
  isLoading
}: LoginDialogProps) {
  const { theme: currentTheme } = useTheme();
  const themeColors = theme[currentTheme as 'light' | 'dark'];
  
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const handleLogin = () => {
    onLogin(email, password);
  };

  const toggleShowPassword = () => {
    setShowPassword(!showPassword);
  };

  return (
    <Portal>
      <Dialog
        visible={visible}
        onDismiss={onDismiss}
        style={{ backgroundColor: themeColors.background }}
      >
        <Dialog.Title style={{ color: themeColors.text }}>Login</Dialog.Title>
        <Dialog.Content>
          <Text style={[styles.subtitle, { color: themeColors.secondaryText }]}>
            Please sign in to continue
          </Text>
          
          {/* Email Input */}
          <View style={[styles.inputContainer, { backgroundColor: themeColors.background }]}>
            <MaterialCommunityIcons
              name="email-outline"
              size={20}
              color={themeColors.secondaryText}
              style={styles.inputIcon}
            />
            <TextInput
              style={[styles.input, { color: themeColors.text }]}
              placeholder="Email"
              placeholderTextColor={themeColors.secondaryText}
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
            />
          </View>

          {/* Password Input */}
          <View style={[styles.inputContainer, { backgroundColor: themeColors.background }]}>
            <MaterialCommunityIcons
              name="lock-outline"
              size={20}
              color={themeColors.secondaryText}
              style={styles.inputIcon}
            />
            <TextInput
              style={[styles.input, { color: themeColors.text }]}
              placeholder="Password"
              placeholderTextColor={themeColors.secondaryText}
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!showPassword}
            />
            <TouchableOpacity onPress={toggleShowPassword} style={styles.eyeIcon}>
              <MaterialCommunityIcons
                name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                size={20}
                color={themeColors.secondaryText}
              />
            </TouchableOpacity>
          </View>

          {/* Forgot Password */}
          <TouchableOpacity style={styles.forgotPasswordContainer}>
            <Text style={[styles.forgotPasswordText, { color: themeColors.primary }]}>
              Forgot Password?
            </Text>
          </TouchableOpacity>
        </Dialog.Content>
        <Dialog.Actions>
          <Button onPress={onDismiss} textColor={themeColors.secondaryText}>Cancel</Button>
          <Button 
            onPress={handleLogin} 
            loading={isLoading}
            disabled={isLoading || !email || !password}
            textColor={themeColors.primary}
          >
            Login
          </Button>
        </Dialog.Actions>
      </Dialog>
    </Portal>
  );
}

const styles = StyleSheet.create({
  subtitle: {
    fontSize: 14,
    marginBottom: 16,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 8,
    marginBottom: 16,
    height: 48,
    paddingHorizontal: 12,
  },
  inputIcon: {
    marginRight: 12,
  },
  input: {
    flex: 1,
    height: '100%',
    fontSize: 16,
  },
  eyeIcon: {
    padding: 4,
  },
  forgotPasswordContainer: {
    alignSelf: 'flex-end',
    marginTop: -8,
  },
  forgotPasswordText: {
    fontSize: 14,
  },
}); 