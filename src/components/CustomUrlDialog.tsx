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
  Linking,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { theme } from '../constants/theme';
import { modelDownloader } from '../services/ModelDownloader';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../types/navigation';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { CompositeNavigationProp } from '@react-navigation/native';
import { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { TabParamList } from '../types/navigation';

interface CustomUrlDialogProps {
  visible: boolean;
  onClose: () => void;
  onDownloadStart: (downloadId: number, modelName: string) => void;
  navigation: CompositeNavigationProp<
    BottomTabNavigationProp<TabParamList, 'Model'>,
    NativeStackNavigationProp<RootStackParamList>
  >;
}

interface DownloadState {
  downloadId: number;
  status: string;
  modelName: string;
}

const CustomUrlDialog = ({ visible, onClose, onDownloadStart, navigation }: CustomUrlDialogProps) => {
  const { theme: currentTheme } = useTheme();
  const themeColors = theme[currentTheme as 'light' | 'dark'];
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
    
    // Navigate to Downloads screen immediately
    navigation.navigate('Downloads');
    onClose();
    
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
          'Only direct download links to GGUF models are supported. Please make sure opening the link in a browser downloads a GGUF model file directly.'
        );
        return;
      }
      
      const { downloadId } = await modelDownloader.downloadModel(url, filename);
      
      // Initialize download progress
      const initialProgress = {
        downloadId,
        progress: 0,
        bytesDownloaded: 0,
        totalBytes: 0,
        status: 'downloading'
      };

      // Get existing progress
      const existingProgressJson = await AsyncStorage.getItem('download_progress');
      const existingProgress = existingProgressJson ? JSON.parse(existingProgressJson) : {};

      // Update progress
      const newProgress = {
        ...existingProgress,
        [filename]: initialProgress
      };

      // Save to AsyncStorage
      await AsyncStorage.setItem('download_progress', JSON.stringify(newProgress));
      
      onDownloadStart(downloadId, filename);
      setUrl('');
    } catch (error) {
      console.error('Custom download error:', error);
      Alert.alert('Error', 'Failed to start download');
    } finally {
      setIsLoading(false);
    }
  };

  const openHuggingFace = () => {
    Linking.openURL('https://huggingface.co/models?library=gguf');
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

          <TouchableOpacity 
            style={[styles.hfLink, { backgroundColor: themeColors.borderColor }]}
            onPress={openHuggingFace}
          >
            <View style={styles.hfLinkContent}>
              <Ionicons name="search" size={18} color="#4a0660" />
              <Text style={[styles.hfLinkText, { color: themeColors.text }]}>
                Browse GGUF Models on HuggingFace
              </Text>
            </View>
            <Ionicons name="open-outline" size={18} color={themeColors.secondaryText} />
          </TouchableOpacity>

          <View style={styles.warningContainer}>
            <Ionicons name="warning-outline" size={20} color="#4a0660" />
            <Text style={[styles.warningText, { color: themeColors.secondaryText }]}>
            Only direct download links to GGUF models are supported. Please make sure opening the link in a browser downloads a GGUF model file directly.
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
  hfLink: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
  },
  hfLinkContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  hfLinkText: {
    fontSize: 14,
    fontWeight: '500',
  },
});

export default CustomUrlDialog; 