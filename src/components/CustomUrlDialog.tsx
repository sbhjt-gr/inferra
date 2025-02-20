import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  TextInput,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { theme } from '../constants/theme';

interface CustomUrlDialogProps {
  visible: boolean;
  onClose: () => void;
  onDownloadStart: (downloadId: number, modelName: string) => void;
}

const CustomUrlDialog = ({ visible, onClose, onDownloadStart }: CustomUrlDialogProps) => {
  const { theme: currentTheme } = useTheme();
  const themeColors = theme[currentTheme];
  const [url, setUrl] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isValid, setIsValid] = useState(false);

  const validateUrl = (input: string) => {
    setUrl(input);
    const isValid = input.trim().length > 0 && 
      (input.startsWith('http://') || input.startsWith('https://'));
    setIsValid(isValid);
  };

  const handleDownload = async () => {
    if (!isValid) return;
    
    setIsLoading(true);
    try {
      const response = await fetch(url, { method: 'HEAD' });
      const contentDisposition = response.headers.get('content-disposition');
      
      let filename = '';
      if (contentDisposition) {
        const matches = /filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/.exec(contentDisposition);
        if (matches != null && matches[1]) {
          filename = matches[1].replace(/['"]/g, '');
        }
      }

      if (!filename) {
        filename = url.split('/').pop() || 'custom_model.gguf';
      }

      if (!filename.toLowerCase().endsWith('.gguf')) {
        Alert.alert(
          'Invalid File',
          'Only GGUF model files are supported. Please make sure you are downloading a GGUF model file.'
        );
        return;
      }
      
      const { downloadId } = await NativeModules.ModelDownloader.downloadModel(url, filename);
      onDownloadStart(downloadId, filename);
      setUrl('');
      onClose();
    } catch (error) {
      console.error('Custom download error:', error);
      Alert.alert('Error', 'Failed to start download');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={[styles.container, { backgroundColor: themeColors.background }]}>
          <View style={styles.header}>
            <Text style={[styles.title, { color: themeColors.text }]}>
              Download Custom Model
            </Text>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={24} color={themeColors.text} />
            </TouchableOpacity>
          </View>

          <View style={styles.warningContainer}>
            <Ionicons name="warning-outline" size={20} color="#4a0660" />
            <Text style={[styles.warningText, { color: themeColors.secondaryText }]}>
              Only GGUF format models are supported.
            </Text>
          </View>

          <View style={[styles.inputContainer, { backgroundColor: themeColors.borderColor }]}>
            <Ionicons name="link" size={20} color={themeColors.secondaryText} />
            <TextInput
              style={[styles.input, { color: themeColors.text }]}
              placeholder="Enter model URL"
              placeholderTextColor={themeColors.secondaryText}
              value={url}
              onChangeText={validateUrl}
              autoCapitalize="none"
              autoCorrect={false}
              editable={!isLoading}
            />
          </View>

          <TouchableOpacity
            style={[
              styles.downloadButton,
              { 
                backgroundColor: '#4a0660',
                opacity: isValid && !isLoading ? 1 : 0.5
              }
            ]}
            onPress={handleDownload}
            disabled={!isValid || isLoading}
          >
            {isLoading ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.buttonText}>Start Download</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  container: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
  },
  warningContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: 'rgba(74, 6, 96, 0.1)',
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
  },
  warningText: {
    flex: 1,
    marginLeft: 8,
    fontSize: 14,
    lineHeight: 18,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 12,
    marginBottom: 20,
  },
  input: {
    flex: 1,
    marginLeft: 10,
    fontSize: 16,
  },
  downloadButton: {
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});

export default CustomUrlDialog; 