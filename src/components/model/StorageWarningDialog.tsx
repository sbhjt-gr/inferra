import React, { useState } from 'react';
import { View, TouchableOpacity, StyleSheet } from 'react-native';
import { Dialog, Portal, Button, Text as PaperText } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import { theme } from '../../constants/theme';
import { getThemeAwareColor } from '../../utils/ColorUtils';

interface StorageWarningDialogProps {
  visible: boolean;
  onAccept: (dontShowAgain: boolean) => void;
  onCancel: () => void;
}

export const StorageWarningDialog: React.FC<StorageWarningDialogProps> = ({
  visible,
  onAccept,
  onCancel
}) => {
  const { theme: currentTheme } = useTheme();
  const themeColors = theme[currentTheme as 'light' | 'dark'];
  const [dontShowAgain, setDontShowAgain] = useState(false);

  return (
    <Portal>
      <Dialog 
        visible={visible} 
        onDismiss={onCancel}
        style={{
          zIndex: 10000,
          elevation: 10000
        }}
      >
        <Dialog.Title>File Manager Warning</Dialog.Title>
        <Dialog.Content>
          <PaperText variant="bodyMedium" style={{ marginBottom: 16 }}>
            Large model files may cause the file manager to become temporarily stuck on some devices. Please be patient and wait for the file manager to respond once you click on a file.
          </PaperText>
          
          <TouchableOpacity 
            style={styles.checkboxContainer}
            onPress={() => setDontShowAgain(!dontShowAgain)}
          >
            <View style={[
              styles.checkboxSquare,
              { 
                borderColor: getThemeAwareColor('#4a0660', currentTheme),
                backgroundColor: dontShowAgain ? getThemeAwareColor('#4a0660', currentTheme) : 'transparent'
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
            <PaperText style={[styles.checkboxText, { color: themeColors.text }]}>
              Don't show again
            </PaperText>
          </TouchableOpacity>
        </Dialog.Content>
        <Dialog.Actions>
          <Button onPress={onCancel}>Cancel</Button>
          <Button onPress={() => onAccept(dontShowAgain)}>Continue</Button>
        </Dialog.Actions>
      </Dialog>
    </Portal>
  );
};

const styles = StyleSheet.create({
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
