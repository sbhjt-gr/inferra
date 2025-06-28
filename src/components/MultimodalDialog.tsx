import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Button, Dialog, Portal } from 'react-native-paper';
import * as DocumentPicker from 'expo-document-picker';
import { AudioModule } from 'expo-audio';
import { useTheme } from '../context/ThemeContext';
import { useModel } from '../context/ModelContext';
import { llamaManager } from '../utils/LlamaManager';

interface MultimodalDialogProps {
  visible: boolean;
  onDismiss: () => void;
}

export default function MultimodalDialog({ visible, onDismiss }: MultimodalDialogProps) {
  const { theme: currentTheme } = useTheme();
  const { selectedModelPath, isMultimodalEnabled } = useModel();
  const [testResult, setTestResult] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);

  const isDarkMode = currentTheme === 'dark';

  const colors = {
    background: isDarkMode ? '#1A1A1A' : '#FFFFFF',
    surface: isDarkMode ? '#2A2A2A' : '#F5F5F5',
    text: isDarkMode ? '#FFFFFF' : '#000000',
    textSecondary: isDarkMode ? '#B0B0B0' : '#666666',
    primary: '#4A90E2',
    success: '#4CAF50',
    warning: '#FF9800',
    error: '#F44336',
  };

  const testVisionSupport = async () => {
    try {
      setIsLoading(true);
      setTestResult('Testing vision support...');

      if (!llamaManager.hasVisionSupport()) {
        setTestResult('AI Vision support not available with current model configuration.\n\nTo use AI Vision:\n• Load a vision-capable model (e.g., LLaVA)\n• Add a multimodal projector (mmproj)\n\nNote: OCR text extraction is still available and works independently of AI vision support.');
        return;
      }

      const result = await DocumentPicker.getDocumentAsync({
        type: ['image/*'],
        copyToCacheDirectory: true,
      });

      if (!result.canceled && result.assets[0]) {
        const imageUri = result.assets[0].uri;
        
        const photoMessage = JSON.stringify({
          type: 'photo_upload',
          internalInstruction: `Photo URI: ${imageUri}`,
          userContent: 'What do you see in this image? Describe it in detail.',
        });

        const response = await llamaManager.generateResponse([
          { role: 'user', content: photoMessage }
        ]);

        setTestResult(`Vision test successful!\n\nImage: ${imageUri}\n\nAI Response: ${response}`);
      } else {
        setTestResult('No image selected');
      }
    } catch (error) {
      setTestResult(`Vision test failed: ${error}`);
    } finally {
      setIsLoading(false);
    }
  };

  const testAudioSupport = async () => {
    try {
      setIsLoading(true);
      setTestResult('Testing audio support...');

      if (!llamaManager.hasAudioSupport()) {
        setTestResult('Audio support not available. Please load a multimodal model with audio capabilities.');
        return;
      }

      const permissionResult = await AudioModule.requestRecordingPermissionsAsync();
      if (!permissionResult.granted) {
        setTestResult('Audio permission denied');
        return;
      }

      const result = await DocumentPicker.getDocumentAsync({
        type: ['audio/*'],
        copyToCacheDirectory: true,
      });

      if (!result.canceled && result.assets[0]) {
        const audioUri = result.assets[0].uri;
        
        const audioMessage = JSON.stringify({
          type: 'audio_upload',
          internalInstruction: `Audio URI: ${audioUri}`,
          userContent: 'Please transcribe or describe this audio file.',
        });

        const response = await llamaManager.generateResponse([
          { role: 'user', content: audioMessage }
        ]);

        setTestResult(`Audio test successful!\n\nAudio: ${audioUri}\n\nAI Response: ${response}`);
      } else {
        setTestResult('No audio file selected');
      }
    } catch (error) {
      setTestResult(`Audio test failed: ${error}`);
    } finally {
      setIsLoading(false);
    }
  };

  const testTokenization = async () => {
    try {
      setIsLoading(true);
      setTestResult('Testing tokenization with media...');

      const result = await llamaManager.tokenizeWithMedia(
        'Describe this image: <__media__>',
        []
      );

      setTestResult(`Tokenization test:\n\nTokens: ${result.tokens?.length || 0}\nHas Media: ${result.hasMedia}\nMedia Positions: ${JSON.stringify(result.mediaPositions)}`);
    } catch (error) {
      setTestResult(`Tokenization test failed: ${error}`);
    } finally {
      setIsLoading(false);
    }
  };

  const getMultimodalStatus = () => {
    if (!selectedModelPath) {
      return 'No model loaded';
    }

    if (!isMultimodalEnabled) {
      return 'Multimodal not enabled';
    }

    const support = llamaManager.getMultimodalSupport();
    return `Multimodal enabled\nVision: ${support.vision ? 'Supported' : 'Not supported'}\nAudio: ${support.audio ? 'Supported' : 'Not supported'}`;
  };

  return (
    <Portal>
      <Dialog visible={visible} onDismiss={onDismiss} style={[styles.dialog, { backgroundColor: colors.background }]}>
        <Dialog.Title style={[styles.title, { color: colors.text }]}>
          Multimodal Test Suite
        </Dialog.Title>
        <Dialog.Content>
          <View style={styles.content}>
            <Text style={[styles.statusText, { color: colors.text }]}>
              {getMultimodalStatus()}
            </Text>

            <View style={styles.buttonContainer}>
              <TouchableOpacity
                style={[styles.testButton, { backgroundColor: colors.primary }]}
                onPress={testVisionSupport}
                disabled={isLoading}
              >
                <MaterialCommunityIcons name="camera" size={24} color="white" />
                <Text style={styles.buttonText}>Test Vision</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.testButton, { backgroundColor: colors.primary }]}
                onPress={testAudioSupport}
                disabled={isLoading}
              >
                <MaterialCommunityIcons name="microphone" size={24} color="white" />
                <Text style={styles.buttonText}>Test Audio</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.testButton, { backgroundColor: colors.primary }]}
                onPress={testTokenization}
                disabled={isLoading}
              >
                <MaterialCommunityIcons name="code-tags" size={24} color="white" />
                <Text style={styles.buttonText}>Test Tokenization</Text>
              </TouchableOpacity>
            </View>

            {testResult ? (
              <View style={[styles.resultContainer, { backgroundColor: colors.surface }]}>
                <Text style={[styles.resultText, { color: colors.text }]}>
                  {testResult}
                </Text>
              </View>
            ) : null}
          </View>
        </Dialog.Content>
        <Dialog.Actions>
          <Button onPress={onDismiss}>Close</Button>
        </Dialog.Actions>
      </Dialog>
    </Portal>
  );
}

const styles = StyleSheet.create({
  dialog: {
    margin: 20,
    borderRadius: 12,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  content: {
    paddingVertical: 16,
  },
  statusText: {
    fontSize: 16,
    marginBottom: 20,
    lineHeight: 24,
  },
  buttonContainer: {
    flexDirection: 'column',
    gap: 12,
    marginBottom: 20,
  },
  testButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 12,
    borderRadius: 8,
    gap: 8,
  },
  buttonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  resultContainer: {
    padding: 16,
    borderRadius: 8,
    marginTop: 12,
  },
  resultText: {
    fontSize: 14,
    lineHeight: 20,
  },
}); 