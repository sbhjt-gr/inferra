import React, { useState } from 'react';
import { View, StyleSheet, ScrollView } from 'react-native';
import { Text, TextInput, Button, HelperText, RadioButton, Portal, Dialog } from 'react-native-paper';
import { useTheme } from '../../context/ThemeContext';
import { theme } from '../../constants/theme';
import { validateAge, storeAgeVerification } from '../../services/PrivacyService';
import { MINIMUM_AGE } from '../../types/privacy';

interface AgeVerificationModalProps {
  visible: boolean;
  onVerified: (isMinor: boolean) => void;
  onDismiss: () => void;
}

export default function AgeVerificationModal({ visible, onVerified, onDismiss }: AgeVerificationModalProps) {
  const { theme: currentTheme } = useTheme();
  const themeColors = theme[currentTheme];
  
  const [birthDate, setBirthDate] = useState('');
  const [selectedMethod, setSelectedMethod] = useState<'birthdate' | 'confirm'>('birthdate');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const handleVerifyAge = async () => {
    setIsLoading(true);
    setError('');

    try {
      if (selectedMethod === 'birthdate') {
        if (!birthDate) {
          setError('Please enter your birth date');
          setIsLoading(false);
          return;
        }

        const validation = validateAge(birthDate, MINIMUM_AGE);
        
        if (!validation.isValid) {
          setError(`You must be at least ${MINIMUM_AGE} years old to use this app`);
          setIsLoading(false);
          return;
        }

        await storeAgeVerification({
          birthDate,
          isVerified: true,
          isMinor: validation.isMinor
        });

        onVerified(validation.isMinor);
      } else {
        await storeAgeVerification({
          birthDate: '',
          isVerified: true,
          isMinor: false
        });

        onVerified(false);
      }
    } catch (error) {
      setError('Failed to verify age. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Portal>
      <Dialog visible={visible} dismissable={false} style={{ backgroundColor: themeColors.background }}>
        <Dialog.Title style={{ color: themeColors.text }}>Age Verification Required</Dialog.Title>
        <Dialog.Content>
          <ScrollView style={styles.content}>
            <Text style={[styles.description, { color: themeColors.secondaryText }]}>
              To comply with privacy regulations and ensure appropriate content, we need to verify your age.
            </Text>

            <View style={styles.methodSelector}>
              <Text style={[styles.methodTitle, { color: themeColors.text }]}>
                Verification Method:
              </Text>
              
              <RadioButton.Group
                onValueChange={(value) => setSelectedMethod(value as 'birthdate' | 'confirm')}
                value={selectedMethod}
              >
                <View style={styles.radioOption}>
                  <RadioButton value="birthdate" />
                  <Text style={[styles.radioLabel, { color: themeColors.text }]}>
                    Enter Birth Date
                  </Text>
                </View>
                
                <RadioButton.Group
                  onValueChange={() => {}}
                  value="confirm"
                >
                  <View style={styles.radioOption}>
                    <RadioButton value="confirm" />
                    <Text style={[styles.radioLabel, { color: themeColors.text }]}>
                      I confirm I am 18 or older
                    </Text>
                  </View>
                </RadioButton.Group>
              </RadioButton.Group>
            </View>

            {selectedMethod === 'birthdate' && (
              <View style={styles.inputContainer}>
                <TextInput
                  label="Birth Date (YYYY-MM-DD)"
                  value={birthDate}
                  onChangeText={setBirthDate}
                  placeholder="1990-01-01"
                  mode="outlined"
                  style={styles.input}
                />
                <HelperText type="info">
                  Your birth date is used only for age verification and is stored locally.
                </HelperText>
              </View>
            )}

            {selectedMethod === 'confirm' && (
              <Text style={[styles.confirmText, { color: themeColors.secondaryText }]}>
                By selecting this option, you confirm that you are 18 years or older.
              </Text>
            )}

            {error ? (
              <HelperText type="error" visible={!!error}>
                {error}
              </HelperText>
            ) : null}
          </ScrollView>
        </Dialog.Content>
        
        <Dialog.Actions>
          <Button
            mode="contained"
            onPress={handleVerifyAge}
            loading={isLoading}
            disabled={isLoading}
            buttonColor={themeColors.primary}
          >
            Verify Age
          </Button>
        </Dialog.Actions>
      </Dialog>
    </Portal>
  );
}

const styles = StyleSheet.create({
  content: {
    maxHeight: 400,
  },
  description: {
    fontSize: 14,
    marginBottom: 20,
    lineHeight: 20,
  },
  methodSelector: {
    marginBottom: 20,
  },
  methodTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 12,
  },
  radioOption: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  radioLabel: {
    fontSize: 14,
    marginLeft: 8,
  },
  inputContainer: {
    marginTop: 16,
  },
  input: {
    marginBottom: 8,
  },
  confirmText: {
    fontSize: 14,
    marginTop: 16,
    fontStyle: 'italic',
  },
});
