import React, { useState } from 'react';
import { View, TouchableOpacity, StyleSheet, Linking } from 'react-native';
import { Text } from 'react-native-paper';
import Dialog from '../Dialog';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import { theme } from '../../constants/theme';
import { getBrowserDownloadTextColor } from '../../utils/ColorUtils';

interface ModelWarningDialogProps {
  visible: boolean;
  licenseLink?: string;
  onAccept: (dontShowAgain: boolean) => void;
  onCancel: () => void;
}

export const ModelWarningDialog: React.FC<ModelWarningDialogProps> = ({
  visible,
  licenseLink,
  onAccept,
  onCancel
}) => {
  const { theme: currentTheme } = useTheme();
  const themeColors = theme[currentTheme];
  const [dontShowAgain, setDontShowAgain] = useState(false);

  const openLicense = async () => {
    if (!licenseLink) {
      return;
    }
    try {
      await Linking.openURL(licenseLink);
      console.log('license_open');
    } catch {
      console.log('license_open_fail');
    }
  };

  return (
    <Dialog visible={visible} onDismiss={onCancel}
      primaryButtonText="Continue"
      onPrimaryPress={() => onAccept(dontShowAgain)}
      secondaryButtonText="Cancel"
      onSecondaryPress={onCancel}
    >
        <Dialog.Title style={{ color: themeColors.text }}>
          Content Warning
        </Dialog.Title>
        
        <Dialog.Content>
          <Text style={{ color: themeColors.text, marginBottom: 16 }}>
            We do not own these models. They may generate harmful, biased, or inappropriate content. Use responsibly and at your own discretion.
          </Text>

          {!!licenseLink && (
            <TouchableOpacity
              style={styles.licenseRow}
              onPress={openLicense}
              hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
            >
              <MaterialCommunityIcons
                name="file-document-outline"
                size={16}
                color={getBrowserDownloadTextColor(currentTheme)}
                style={{ marginRight: 6 }}
              />
              <Text style={[styles.licenseText, { color: getBrowserDownloadTextColor(currentTheme) }]}>
                View model license
              </Text>
            </TouchableOpacity>
          )}
          
          <TouchableOpacity 
            style={styles.checkboxContainer}
            onPress={() => setDontShowAgain(!dontShowAgain)}
          >
            <View style={[
              styles.checkboxSquare,
              { 
                borderColor: themeColors.primary,
                backgroundColor: dontShowAgain ? themeColors.primary : 'transparent'
              }
            ]}>
              {dontShowAgain && (
                <MaterialCommunityIcons 
                  name="check" 
                  size={16} 
                  color="white" 
                />
              )}
            </View>
            <Text style={[styles.checkboxText, { color: themeColors.text }]}>
              Don't show again
            </Text>
          </TouchableOpacity>
        </Dialog.Content>
      </Dialog>
  );
};

const styles = StyleSheet.create({
  licenseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    paddingVertical: 4,
  },
  licenseText: {
    fontSize: 14,
    fontWeight: '500',
  },
  checkboxContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
    marginBottom: 4,
    paddingHorizontal: 8,
    paddingVertical: 8,
    borderRadius: 6,
  },
  checkboxSquare: {
    width: 20,
    height: 20,
    borderRadius: 3,
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxText: {
    fontSize: 13,
    marginLeft: 8,
    flex: 1,
  },
});
