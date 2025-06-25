import React, { useState, useRef, useMemo, useCallback } from 'react';
import {
  StyleSheet,
  View,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  ActivityIndicator,
  Keyboard,
  Alert,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system';
import { useTheme } from '../../context/ThemeContext';
import { useModel } from '../../context/ModelContext';
import { theme } from '../../constants/theme';
import { getThemeAwareColor } from '../../utils/ColorUtils';
import FileViewerModal from '../../components/FileViewerModal';
import CameraOverlay from '../../components/CameraOverlay';
import { llamaManager } from '../../utils/LlamaManager';
import { Dialog, Portal, Text, Button } from 'react-native-paper';
import { modelDownloader } from '../../services/ModelDownloader';

type ChatInputProps = {
  onSend: (text: string) => void;
  disabled?: boolean;
  isLoading?: boolean;
  isRegenerating?: boolean;
  onCancel?: () => void | Promise<void>;
  style?: any;
  placeholderColor?: string;
};

interface StoredModel {
  name: string;
  path: string;
  size: number;
  modified: string;
}

export default function ChatInput({ 
  onSend, 
  disabled = false,
  isLoading = false,
  isRegenerating = false,
  onCancel = () => {},
  style = {},
  placeholderColor = 'rgba(0, 0, 0, 0.6)'
}: ChatInputProps) {
  const [text, setText] = useState('');
  const [inputHeight, setInputHeight] = useState(48);
  const [fileModalVisible, setFileModalVisible] = useState(false);
  const [cameraVisible, setCameraVisible] = useState(false);
  const [selectedFile, setSelectedFile] = useState<{uri: string, name?: string} | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingPermission, setRecordingPermission] = useState<boolean | null>(null);
  const [mmProjSelectorVisible, setMmProjSelectorVisible] = useState(false);
  const [storedModels, setStoredModels] = useState<StoredModel[]>([]);
  const [pendingMultimodalAction, setPendingMultimodalAction] = useState<'camera' | 'file' | null>(null);
  const inputRef = useRef<TextInput>(null);
  const recordingRef = useRef<Audio.Recording | null>(null);
  const { theme: currentTheme } = useTheme();
  const { selectedModelPath, isModelLoading, loadModel, isMultimodalEnabled } = useModel();
  const themeColors = useMemo(() => theme[currentTheme as 'light' | 'dark'], [currentTheme]);
  const isDark = currentTheme === 'dark';

  const [dialogVisible, setDialogVisible] = useState(false);
  const [dialogTitle, setDialogTitle] = useState('');
  const [dialogMessage, setDialogMessage] = useState('');

  const isGenerating = isLoading || isRegenerating;

  React.useEffect(() => {
    checkAudioPermissions();
  }, []);

  const checkAudioPermissions = async () => {
    try {
      const { granted } = await Audio.getPermissionsAsync();
      setRecordingPermission(granted);
      
      if (!granted) {
        const { granted: newGranted } = await Audio.requestPermissionsAsync();
        setRecordingPermission(newGranted);
      }
    } catch (error) {
      console.error('Error checking audio permissions:', error);
      setRecordingPermission(false);
    }
  };

  const showDialog = (title: string, message: string) => {
    setDialogTitle(title);
    setDialogMessage(message);
    setDialogVisible(true);
  };

  const hideDialog = () => setDialogVisible(false);

  const loadStoredModels = async () => {
    try {
      const models = await modelDownloader.getStoredModels();
      const projectorModels = models.filter(model => 
        model.name.toLowerCase().includes('proj') || 
        model.name.toLowerCase().includes('mmproj') ||
        model.name.toLowerCase().includes('vision')
      );
      setStoredModels(projectorModels);
    } catch (error) {
      console.error('Error loading stored models:', error);
      setStoredModels([]);
    }
  };

  const checkMultimodalSupport = (): boolean => {
    if (!selectedModelPath) return false;
    
    const isOnlineModel = ['gemini', 'chatgpt', 'deepseek', 'claude'].includes(selectedModelPath);
    if (isOnlineModel) {
      return true;
    }
    
    return isMultimodalEnabled;
  };

  const showMmProjSelector = async (action: 'camera' | 'file') => {
    setPendingMultimodalAction(action);
    await loadStoredModels();
    setMmProjSelectorVisible(true);
  };

  const handleMmProjSelect = async (projectorModel: StoredModel) => {
    setMmProjSelectorVisible(false);
    
    if (!selectedModelPath) return;
    
    try {
      const success = await loadModel(selectedModelPath, projectorModel.path);
      if (success) {
        if (pendingMultimodalAction === 'camera') {
          setCameraVisible(true);
        } else if (pendingMultimodalAction === 'file') {
          pickDocument();
        }
      } else {
        showDialog(
          'Loading Failed',
          'Failed to load the model with multimodal support. Please try again.'
        );
      }
    } catch (error) {
      console.error('Error loading model with projector:', error);
      showDialog(
        'Loading Error',
        'An error occurred while loading the model with multimodal support.'
      );
    } finally {
      setPendingMultimodalAction(null);
    }
  };

  const handleMmProjSelectorClose = () => {
    setMmProjSelectorVisible(false);
    setPendingMultimodalAction(null);
  };



  const handleSend = useCallback(() => {
    if (!text.trim()) return;

    if (!selectedModelPath) {
      showDialog(
        'No Model Selected',
        'Please select a model before sending a message.'
      );
      return;
    }

    const isOnlineModel = ['gemini', 'chatgpt', 'deepseek', 'claude'].includes(selectedModelPath);
    if (!isOnlineModel && (!llamaManager.isInitialized() || isModelLoading)) {
      showDialog(
        'Model Not Ready',
        'Please wait for the local model to finish loading before sending a message.'
      );
      return;
    }
    
    onSend(text);
    setText('');
    setInputHeight(48);
  }, [text, onSend, selectedModelPath, isModelLoading]);

  const handleContentSizeChange = useCallback((event: any) => {
    const height = Math.min(120, Math.max(48, event.nativeEvent.contentSize.height));
    setInputHeight(height);
  }, []);

  const handleFileUpload = useCallback((content: string, fileName?: string, userPrompt?: string) => {
    const displayName = fileName || "unnamed file";
    
    const messageObject = {
      type: 'file_upload',
      internalInstruction: `You're reading a file named: ${displayName}\n\n--- FILE START ---\n${content}\n--- FILE END ---`,
      userContent: userPrompt || ''
    };
    
    console.log('File Upload Message:', {
      internalInstruction: messageObject.internalInstruction,
      userContent: messageObject.userContent
    });
    
    onSend(JSON.stringify(messageObject));
  }, [onSend]);

  const handlePhotoTaken = useCallback((photoUri: string) => {
    const messageObject = {
      type: 'multimodal',
      content: [
        {
          type: 'image',
          uri: photoUri
        },
        {
          type: 'text',
          text: 'What do you see in this image?'
        }
      ]
    };
    
    console.log('Photo Upload Message:', messageObject);
    
    onSend(JSON.stringify(messageObject));
  }, [onSend]);

  const handleAudioRecorded = useCallback((audioUri: string) => {
    const messageObject = {
      type: 'multimodal',
      content: [
        {
          type: 'audio',
          uri: audioUri
        },
        {
          type: 'text',
          text: 'Please transcribe or describe this audio.'
        }
      ]
    };
    
    console.log('Audio Upload Message:', messageObject);
    
    onSend(JSON.stringify(messageObject));
  }, [onSend]);

  const startRecording = async () => {
    try {
      if (!recordingPermission) {
        await checkAudioPermissions();
        if (!recordingPermission) {
          showDialog(
            'Permission Required',
            'Microphone permission is required to record audio.'
          );
          return;
        }
      }

      if (!selectedModelPath) {
        showDialog(
          'No Model Selected',
          'Please select a model before recording audio.'
        );
        return;
      }

      const isOnlineModel = ['gemini', 'chatgpt', 'deepseek', 'claude'].includes(selectedModelPath);
      if (!isOnlineModel && !checkMultimodalSupport()) {
        showDialog(
          'Multimodal Support Required',
          'This local model needs a projector (mmproj) file to process audio. Please load a multimodal-capable model first.'
        );
        return;
      }

      console.log('Starting audio recording...');
      
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      const recording = new Audio.Recording();
      await recording.prepareToRecordAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);

      await recording.startAsync();
      recordingRef.current = recording;
      setIsRecording(true);
      console.log('Recording started');
    } catch (error) {
      console.error('Failed to start recording:', error);
      showDialog(
        'Recording Error',
        'Failed to start audio recording. Please try again.'
      );
    }
  };

  const stopRecording = async () => {
    try {
      if (!recordingRef.current) return;

      console.log('Stopping audio recording...');
      await recordingRef.current.stopAndUnloadAsync();
      
      const uri = recordingRef.current.getURI();
      recordingRef.current = null;
      setIsRecording(false);

      if (uri) {
        console.log('Audio recorded to:', uri);
        
        const fileInfo = await FileSystem.getInfoAsync(uri);
        if (fileInfo.exists) {
          const audioDir = `${FileSystem.documentDirectory}audio/`;
          const audioFileName = `recording_${Date.now()}.m4a`;
          const finalUri = `${audioDir}${audioFileName}`;

          await FileSystem.makeDirectoryAsync(audioDir, { intermediates: true });
          await FileSystem.moveAsync({
            from: uri,
            to: finalUri,
          });

          handleAudioRecorded(finalUri);
        } else {
          showDialog(
            'Recording Error',
            'Audio file could not be saved. Please try again.'
          );
        }
      } else {
        showDialog(
          'Recording Error',
          'No audio was recorded. Please try again.'
        );
      }
    } catch (error) {
      console.error('Failed to stop recording:', error);
      showDialog(
        'Recording Error',
        'Failed to save audio recording. Please try again.'
      );
      setIsRecording(false);
      recordingRef.current = null;
    }
  };

  const handleMicrophonePress = useCallback(() => {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  }, [isRecording]);

  const openCamera = useCallback(() => {
    if (!selectedModelPath) {
      showDialog(
        'No Model Selected',
        'Please select a model before taking a photo.'
      );
      return;
    }

    if (!checkMultimodalSupport()) {
      const isOnlineModel = ['gemini', 'chatgpt', 'deepseek', 'claude'].includes(selectedModelPath);
      if (!isOnlineModel) {
        showMmProjSelector('camera');
        return;
      }
    }
    
    setCameraVisible(true);
  }, [selectedModelPath, isMultimodalEnabled]);

  const closeCamera = useCallback(() => {
    setCameraVisible(false);
  }, []);

  const pickDocument = useCallback(async () => {
    if (!selectedModelPath) {
      showDialog(
        'No Model Selected',
        'Please select a model before uploading a file.'
      );
      return;
    }

    const isOnlineModel = ['gemini', 'chatgpt', 'deepseek', 'claude'].includes(selectedModelPath);
    
    if (!isOnlineModel && !checkMultimodalSupport()) {
      showMmProjSelector('file');
      return;
    }
    
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: '*/*',
        copyToCacheDirectory: true,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const file = result.assets[0];
        setSelectedFile({
          uri: file.uri,
          name: file.name
        });
        setFileModalVisible(true);
      }
    } catch (error) {
      console.error('Error picking document:', error);
      showDialog('Error', 'Could not pick the document. Please try again.');
    }
  }, [selectedModelPath, isMultimodalEnabled]);

  const closeFileModal = useCallback(() => {
    setFileModalVisible(false);
  }, []);

  const inputContainerStyle = useMemo(() => [
    styles.input,
    {
      height: inputHeight,
      color: isDark ? '#fff' : '#000',
      backgroundColor: isDark ? '#2a2a2a' : '#f1f1f1',
      paddingRight: 120,
    },
  ], [inputHeight, isDark]);

  const sendButtonStyle = useMemo(() => [
    styles.sendButton,
    !text.trim() && styles.sendButtonDisabled
  ], [text]);

  const sendButtonColor = useMemo(() => 
    text.trim() ? getThemeAwareColor('#660880', currentTheme) : isDark ? themeColors.secondaryText : '#999'
  , [text, currentTheme, isDark, themeColors.secondaryText]);

  const attachmentIconColor = useMemo(() => 
    isDark ? '#ffffff' : "#660880"
  , [isDark]);

  const microphoneIconColor = useMemo(() => {
    if (isRecording) return '#ff4444';
    return isDark ? '#ffffff' : '#660880';
  }, [isRecording, isDark]);

  const handleCancel = () => {
    if (onCancel) {
      onCancel();
    }
  };

  React.useEffect(() => {
    return () => {
      if (recordingRef.current) {
        recordingRef.current.stopAndUnloadAsync().catch(() => {});
      }
    };
  }, []);

  return (
    <View style={styles.wrapper}>
      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <View style={[styles.container, style]}>
          <TouchableOpacity 
            style={styles.attachmentButton} 
            onPress={pickDocument}
            disabled={disabled}
          >
            <MaterialCommunityIcons 
              name="attachment" 
              size={24} 
              color={attachmentIconColor} 
            />
          </TouchableOpacity>

          <View style={styles.inputContainer}>
            <TextInput
              ref={inputRef}
              style={inputContainerStyle}
              placeholder="Type a message..."
              placeholderTextColor={placeholderColor}
              value={text}
              onChangeText={setText}
              onContentSizeChange={handleContentSizeChange}
              multiline
              maxLength={10000}
              editable={!disabled}
              returnKeyType="default"
            />
            <View style={styles.inputIconsContainer}>
              <TouchableOpacity style={styles.inputIcon} onPress={openCamera}>
                <MaterialCommunityIcons name="camera" size={20} color="#999" />
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.inputIcon, isRecording && styles.recordingIcon]} 
                onPress={handleMicrophonePress}
                disabled={disabled}
              >
                <MaterialCommunityIcons 
                  name={isRecording ? "stop" : "microphone"} 
                  size={20} 
                  color={microphoneIconColor} 
                />
              </TouchableOpacity>
            </View>
          </View>

          {isGenerating ? (
            <TouchableOpacity style={styles.cancelButton} onPress={handleCancel}>
              <MaterialCommunityIcons 
                name="stop" 
                size={24} 
                color={getThemeAwareColor('#660880', currentTheme)} 
              />
            </TouchableOpacity>
          ) : (
            <TouchableOpacity 
              style={sendButtonStyle} 
              onPress={handleSend}
              disabled={!text.trim() || disabled}
            >
              <MaterialCommunityIcons 
                name="send" 
                size={24} 
                color={sendButtonColor} 
              />
            </TouchableOpacity>
          )}
        </View>
      </TouchableWithoutFeedback>

      <FileViewerModal
        visible={fileModalVisible}
        onClose={closeFileModal}
        filePath={selectedFile?.uri || ''}
        fileName={selectedFile?.name}
        onUpload={handleFileUpload}
      />

      <CameraOverlay
        visible={cameraVisible}
        onClose={closeCamera}
        onPhotoTaken={handlePhotoTaken}
      />

      <Portal>
        <Dialog visible={dialogVisible} onDismiss={hideDialog}>
          <Dialog.Title>{dialogTitle}</Dialog.Title>
          <Dialog.Content>
            <Text>{dialogMessage}</Text>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={hideDialog}>OK</Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>

      <Portal>
        <Dialog visible={mmProjSelectorVisible} onDismiss={handleMmProjSelectorClose}>
          <Dialog.Title>Select Multimodal Projector</Dialog.Title>
          <Dialog.Content>
            <Text style={{ marginBottom: 16 }}>
              Choose a projector (mmproj) model to enable multimodal capabilities:
            </Text>
            {storedModels.length === 0 ? (
              <View style={{ paddingVertical: 20, alignItems: 'center' }}>
                <MaterialCommunityIcons 
                  name="cube-outline" 
                  size={48} 
                  color={isDark ? '#666' : '#ccc'} 
                />
                <Text style={{ 
                  marginTop: 12, 
                  textAlign: 'center',
                  color: isDark ? '#ccc' : '#666' 
                }}>
                  No projector models found in your stored models.{'\n'}
                  Please download a compatible mmproj file first.
                </Text>
              </View>
            ) : (
              storedModels.map((model) => (
                <TouchableOpacity
                  key={model.path}
                  style={[
                    styles.projectorModelItem,
                    { backgroundColor: isDark ? '#2a2a2a' : '#f1f1f1' }
                  ]}
                  onPress={() => handleMmProjSelect(model)}
                >
                  <MaterialCommunityIcons
                    name="cube-outline"
                    size={20}
                    color={isDark ? '#fff' : '#000'}
                  />
                  <View style={styles.projectorModelInfo}>
                    <Text style={[
                      styles.projectorModelName,
                      { color: isDark ? '#fff' : '#000' }
                    ]}>
                      {model.name}
                    </Text>
                    <Text style={[
                      styles.projectorModelSize,
                      { color: isDark ? '#ccc' : '#666' }
                    ]}>
                      {(model.size / (1024 * 1024)).toFixed(1)} MB
                    </Text>
                  </View>
                </TouchableOpacity>
              ))
            )}
          </Dialog.Content>
          <Dialog.Actions>
            {storedModels.length === 0 ? (
              <Button onPress={handleMmProjSelectorClose}>Close</Button>
            ) : (
              <Button onPress={handleMmProjSelectorClose}>Cancel</Button>
            )}
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  container: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
  },
  attachmentButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'transparent',
  },
  inputContainer: {
    flex: 1,
    position: 'relative',
  },
  input: {
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    maxHeight: 120,
    textAlignVertical: 'center',
  },
  inputIconsContainer: {
    position: 'absolute',
    right: 12,
    bottom: 8,
    flexDirection: 'row',
    gap: 8,
  },
  inputIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.05)',
  },
  recordingIcon: {
    backgroundColor: 'rgba(255, 68, 68, 0.1)',
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'transparent',
  },
  sendButtonDisabled: {
    opacity: 0.5,
  },
  cancelButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'transparent',
  },
  projectorModelItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    marginVertical: 4,
    borderRadius: 8,
  },
  projectorModelInfo: {
    flex: 1,
    marginLeft: 12,
  },
  projectorModelName: {
    fontSize: 16,
    fontWeight: '500',
  },
  projectorModelSize: {
    fontSize: 12,
    marginTop: 2,
  },
}); 