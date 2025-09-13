import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, Platform } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { theme } from '../constants/theme';

interface MemoryWarningDialogProps {
  visible: boolean;
  memoryWarningType: string;
  onClose: () => void;
}

const MemoryWarningDialog: React.FC<MemoryWarningDialogProps> = ({
  visible,
  memoryWarningType,
  onClose,
}) => {
  const { theme: currentTheme } = useTheme();
  const themeColors = theme[currentTheme as 'light' | 'dark'];

  const getWarningContent = () => {
    if (memoryWarningType === 'very_low_memory') {
      return {
        title: 'Very Low Memory Device',
        message: 'Your device has less than 2GB of RAM. Performance may be severely limited:',
        points: [
          '• Large models may not run at all',
          '• App may crash frequently',
          '• Generation will be very slow',
          '• Consider using smaller models only',
        ],
      };
    } else {
      return {
        title: 'Low Memory Device',
        message: 'Your device has limited RAM (less than 4GB). You may experience:',
        points: [
          '• Slower model loading times',
          '• Limited support for large models',
          '• Occasional app crashes with large models',
          '• Better performance with smaller models',
        ],
      };
    }
  };

  const { title, message, points } = getWarningContent();

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.modalOverlay}>
        <View style={[styles.modalContent, { backgroundColor: themeColors.background }]}>
          <View style={styles.modalHeader}>
            <MaterialCommunityIcons 
              name="memory" 
              size={24} 
              color={memoryWarningType === 'very_low_memory' ? '#F44336' : '#FF9800'} 
            />
            <Text style={[styles.modalTitle, { color: themeColors.text }]}>{title}</Text>
          </View>
          
          <Text style={[styles.modalText, { color: themeColors.text }]}>
            {message}
          </Text>
          
          <View style={styles.bulletPoints}>
            {points.map((point, index) => (
              <Text key={index} style={[styles.bulletPoint, { color: themeColors.text }]}>
                {point}
              </Text>
            ))}
          </View>
          
          <TouchableOpacity
            style={[styles.modalButton, { 
              backgroundColor: memoryWarningType === 'very_low_memory' ? '#F44336' : '#FF9800' 
            }]}
            onPress={onClose}
          >
            <Text style={styles.modalButtonText}>Got it</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    width: '100%',
    maxWidth: 400,
    borderRadius: 16,
    padding: 24,
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    gap: 12,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '600',
  },
  modalText: {
    fontSize: 15,
    lineHeight: 22,
    marginBottom: 8,
  },
  bulletPoints: {
    marginVertical: 12,
    paddingLeft: 8,
  },
  bulletPoint: {
    fontSize: 15,
    lineHeight: 24,
  },
  modalButton: {
    marginTop: 20,
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
    alignItems: 'center',
  },
  modalButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});

export default MemoryWarningDialog;
