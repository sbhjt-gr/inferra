import React, { useState, useRef, useMemo, useCallback } from 'react';
import {
  StyleSheet,
  View,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  Keyboard,
  Animated,
  Platform,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import { useAudioRecorder, AudioModule, RecordingPresets } from 'expo-audio';
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
  placeholderColor
}: ChatInputProps) {
  const [text, setText] = useState('');
  const [inputHeight, setInputHeight] = useState(52);
  const [fileModalVisible, setFileModalVisible] = useState(false);
  const [cameraVisible, setCameraVisible] = useState(false);
  const [selectedFile, setSelectedFile] = useState<{uri: string, name?: string} | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingPermission, setRecordingPermission] = useState<boolean | null>(null);
  const [mmProjSelectorVisible, setMmProjSelectorVisible] = useState(false);
  const [storedModels, setStoredModels] = useState<StoredModel[]>([]);
  const [pendingMultimodalAction, setPendingMultimodalAction] = useState<'camera' | 'file' | null>(null);
  const [pendingFileForMultimodal, setPendingFileForMultimodal] = useState<{uri: string, name?: string} | null>(null);
  const [showAttachmentMenu, setShowAttachmentMenu] = useState(false);
  
  const inputRef = useRef<TextInput>(null);
  const audioRecorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const attachmentMenuAnim = useRef(new Animated.Value(0)).current;
  
  const { theme: currentTheme } = useTheme();
  const { selectedModelPath, isModelLoading, loadModel, isMultimodalEnabled } = useModel();
  const themeColors = useMemo(() => theme[currentTheme as 'light' | 'dark'], [currentTheme]);
  const isDark = currentTheme === 'dark';

  const [dialogVisible, setDialogVisible] = useState(false);
  const [dialogTitle, setDialogTitle] = useState('');
  const [dialogMessage, setDialogMessage] = useState('');

  const isGenerating = isLoading || isRegenerating;
  const hasText = text.trim().length > 0;



  React.useEffect(() => {
    if (isRecording) {
      startPulseAnimation();
    } else {
      stopPulseAnimation();
    }
  }, [isRecording]);

  React.useEffect(() => {
    if (showAttachmentMenu) {
      Animated.spring(attachmentMenuAnim, {
        toValue: 1,
        useNativeDriver: true,
        tension: 100,
        friction: 8,
      }).start();
    } else {
      Animated.spring(attachmentMenuAnim, {
        toValue: 0,
        useNativeDriver: true,
        tension: 100,
        friction: 8,
      }).start();
    }
  }, [showAttachmentMenu]);

  const startPulseAnimation = () => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.2,
          duration: 800,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 800,
          useNativeDriver: true,
        }),
      ])
    ).start();
  };

  const stopPulseAnimation = () => {
    Animated.timing(pulseAnim, {
      toValue: 1,
      duration: 200,
      useNativeDriver: true,
    }).start();
  };

  const checkAudioPermissions = async (): Promise<boolean> => {
    try {
      const { granted } = await AudioModule.getRecordingPermissionsAsync();
      setRecordingPermission(granted);
      return granted;
    } catch (error) {
      console.error('Error checking audio permissions:', error);
      setRecordingPermission(false);
      return false;
    }
  };

  const requestAudioPermissions = async (): Promise<boolean> => {
    try {
      const { granted } = await AudioModule.requestRecordingPermissionsAsync();
      setRecordingPermission(granted);
      return granted;
    } catch (error) {
      console.error('Error requesting audio permissions:', error);
      setRecordingPermission(false);
      return false;
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

  const isImageFile = (fileName: string): boolean => {
    const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.tiff', '.tif'];
    const lowerCaseName = fileName.toLowerCase();
    return imageExtensions.some(ext => lowerCaseName.endsWith(ext));
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
          if (pendingFileForMultimodal) {
            setSelectedFile(pendingFileForMultimodal);
            setFileModalVisible(true);
            setPendingFileForMultimodal(null);
          } else {
            pickDocument();
          }
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

  const handleMmProjSkip = () => {
    setMmProjSelectorVisible(false);
    
    if (pendingMultimodalAction === 'camera') {
      setCameraVisible(true);
    } else if (pendingMultimodalAction === 'file') {
      if (pendingFileForMultimodal) {
        setSelectedFile(pendingFileForMultimodal);
        setFileModalVisible(true);
        setPendingFileForMultimodal(null);
      } else {
        pickDocument();
      }
    }
    
    setPendingMultimodalAction(null);
  };

  const handleMmProjSelectorClose = () => {
    setMmProjSelectorVisible(false);
    setPendingMultimodalAction(null);
    setPendingFileForMultimodal(null);
  };

  const toggleAttachmentMenu = () => {
    setShowAttachmentMenu(!showAttachmentMenu);
  };

  const handleSend = useCallback(() => {
    if (!hasText) return;

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
    setInputHeight(52);
    setShowAttachmentMenu(false);
  }, [text, onSend, selectedModelPath, isModelLoading, hasText]);

  const handleContentSizeChange = useCallback((event: any) => {
    const height = Math.min(120, Math.max(52, event.nativeEvent.contentSize.height + 8));
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
    setShowAttachmentMenu(false);
  }, [onSend]);

  const handlePhotoTaken = useCallback((photoUri: string, messageContent: string) => {
    console.log('Photo Upload Message:', messageContent);
    
    onSend(messageContent);
    setShowAttachmentMenu(false);
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
    setShowAttachmentMenu(false);
  }, [onSend]);

  const startRecording = async () => {
    try {
      let hasPermission = recordingPermission;
      
      if (hasPermission === null) {
        hasPermission = await checkAudioPermissions();
      }
      
      if (!hasPermission) {
        hasPermission = await requestAudioPermissions();
        if (!hasPermission) {
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
      
      await AudioModule.setAudioModeAsync({
        allowsRecording: true,
        playsInSilentMode: true,
      });

      await audioRecorder.prepareToRecordAsync();
      audioRecorder.record();
      setIsRecording(true);
      setShowAttachmentMenu(false);
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
      if (!audioRecorder.isRecording) return;

      console.log('Stopping audio recording...');
      await audioRecorder.stop();
      
      const uri = audioRecorder.uri;
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
    setShowAttachmentMenu(false);
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
    
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: '*/*',
        copyToCacheDirectory: true,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const file = result.assets[0];
        
        if (isImageFile(file.name) && !checkMultimodalSupport()) {
          const isOnlineModel = ['gemini', 'chatgpt', 'deepseek', 'claude'].includes(selectedModelPath);
          if (!isOnlineModel) {
            setPendingFileForMultimodal({
              uri: file.uri,
              name: file.name
            });
            showMmProjSelector('file');
            return;
          }
        }
        
        setSelectedFile({
          uri: file.uri,
          name: file.name
        });
        setFileModalVisible(true);
        setShowAttachmentMenu(false);
      }
    } catch (error) {
      console.error('Error picking document:', error);
      showDialog('Error', 'Could not pick the document. Please try again.');
    }
  }, [selectedModelPath, isMultimodalEnabled]);

  const closeFileModal = useCallback(() => {
    setFileModalVisible(false);
  }, []);

  const handleCancel = () => {
    if (onCancel) {
      onCancel();
    }
  };

  React.useEffect(() => {
    return () => {
      if (audioRecorder.isRecording) {
        audioRecorder.stop().catch(() => {});
      }
    };
  }, []);

  const inputContainerStyle = useMemo(() => [
    styles.inputContainer,
    {
      backgroundColor: isDark ? themeColors.background : '#ffffff',
      borderColor: isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)',
      minHeight: inputHeight,
    },
  ], [inputHeight, isDark, themeColors.background]);

  const inputStyle = useMemo(() => [
    styles.input,
    {
      color: isDark ? themeColors.text : '#000000',
      height: Math.max(40, inputHeight - 12),
    },
  ], [inputHeight, isDark, themeColors.text]);

  const defaultPlaceholderColor = useMemo(() => 
    isDark ? 'rgba(255, 255, 255, 0.6)' : 'rgba(0, 0, 0, 0.4)'
  , [isDark]);

  const sendButtonStyle = useMemo(() => [
    styles.sendButton,
    {
      backgroundColor: hasText 
        ? getThemeAwareColor('#4a0660', currentTheme)
        : isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.05)',
    }
  ], [hasText, currentTheme, isDark]);

  const sendIconColor = useMemo(() => 
    hasText ? '#ffffff' : isDark ? 'rgba(255, 255, 255, 0.4)' : 'rgba(0, 0, 0, 0.3)'
  , [hasText, isDark]);

  const attachmentButtonStyle = useMemo(() => [
    styles.attachmentButton,
    {
      backgroundColor: showAttachmentMenu 
        ? getThemeAwareColor('#4a0660', currentTheme)
        : isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.05)',
    }
  ], [showAttachmentMenu, currentTheme, isDark]);

  const attachmentIconColor = useMemo(() => 
    showAttachmentMenu ? '#ffffff' : isDark ? 'rgba(255, 255, 255, 0.7)' : 'rgba(0, 0, 0, 0.6)'
  , [showAttachmentMenu, isDark]);

  const recordingButtonStyle = useMemo(() => [
    styles.recordingButton,
    {
      backgroundColor: isRecording ? '#ff4444' : 'transparent',
      transform: [{ scale: pulseAnim }],
    }
  ], [isRecording, pulseAnim]);

  return (
    <View style={styles.wrapper}>
      <TouchableWithoutFeedback onPress={() => {
        Keyboard.dismiss();
        setShowAttachmentMenu(false);
      }}>
        <View style={[styles.container, style]}>
          {showAttachmentMenu && (
            <Animated.View
              style={[
                                 styles.attachmentMenu,
                 {
                   backgroundColor: isDark ? themeColors.background : '#ffffff',
                   borderColor: isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)',
                  transform: [
                    {
                      translateY: attachmentMenuAnim.interpolate({
                        inputRange: [0, 1],
                        outputRange: [20, 0],
                      }),
                    },
                    {
                      scale: attachmentMenuAnim,
                    },
                  ],
                  opacity: attachmentMenuAnim,
                },
              ]}
            >
              <TouchableOpacity style={styles.attachmentMenuItem} onPress={pickDocument}>
                <View style={[styles.attachmentMenuIcon, { backgroundColor: '#4285f4' }]}>
                  <MaterialCommunityIcons name="file-document-outline" size={20} color="#ffffff" />
                </View>
                <Text style={[styles.attachmentMenuText, { color: isDark ? themeColors.text : '#000000' }]}>
                  File
                </Text>
              </TouchableOpacity>
              
              <TouchableOpacity style={styles.attachmentMenuItem} onPress={openCamera}>
                <View style={[styles.attachmentMenuIcon, { backgroundColor: '#34a853' }]}>
                  <MaterialCommunityIcons name="camera-outline" size={20} color="#ffffff" />
                </View>
                <Text style={[styles.attachmentMenuText, { color: isDark ? themeColors.text : '#000000' }]}>
                  Camera
                </Text>
              </TouchableOpacity>
              
              <TouchableOpacity style={styles.attachmentMenuItem} onPress={handleMicrophonePress}>
                <View style={[styles.attachmentMenuIcon, { backgroundColor: '#ea4335' }]}>
                  <MaterialCommunityIcons 
                    name={isRecording ? "stop" : "microphone-outline"} 
                    size={20} 
                    color="#ffffff" 
                  />
                </View>
                <Text style={[styles.attachmentMenuText, { color: isDark ? themeColors.text : '#000000' }]}>
                  {isRecording ? 'Stop' : 'Audio'}
                </Text>
              </TouchableOpacity>
            </Animated.View>
          )}

          <View style={styles.inputWrapper}>
            <TouchableOpacity 
              style={attachmentButtonStyle} 
              onPress={toggleAttachmentMenu}
              disabled={disabled}
            >
              <MaterialCommunityIcons 
                name={showAttachmentMenu ? "close" : "plus"} 
                size={20} 
                color={attachmentIconColor} 
              />
            </TouchableOpacity>

            <View style={inputContainerStyle}>
              <TextInput
                ref={inputRef}
                style={inputStyle}
                placeholder="Type a message..."
                placeholderTextColor={placeholderColor || defaultPlaceholderColor}
                value={text}
                onChangeText={setText}
                onContentSizeChange={handleContentSizeChange}
                multiline
                maxLength={10000}
                editable={!disabled}
                returnKeyType="default"
                textAlignVertical="center"
              />
            </View>

            {isRecording && (
              <Animated.View style={recordingButtonStyle}>
                <TouchableOpacity 
                  style={styles.recordingButtonInner} 
                  onPress={stopRecording}
                >
                  <MaterialCommunityIcons name="stop" size={20} color="#ffffff" />
                </TouchableOpacity>
              </Animated.View>
            )}

            {isGenerating ? (
              <TouchableOpacity style={styles.cancelButton} onPress={handleCancel}>
                <MaterialCommunityIcons name="stop-circle-outline" size={24} color="#ff4444" />
              </TouchableOpacity>
            ) : (
              <TouchableOpacity 
                style={sendButtonStyle} 
                onPress={handleSend}
                disabled={!hasText || disabled}
                activeOpacity={0.7}
              >
                <MaterialCommunityIcons 
                  name="send" 
                  size={20} 
                  color={sendIconColor} 
                />
              </TouchableOpacity>
            )}
          </View>
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
          <Dialog.Title style={{ color: isDark ? '#ffffff' : '#000000' }}>
            {dialogTitle}
          </Dialog.Title>
          <Dialog.Content>
            <Text style={{ color: isDark ? '#ffffff' : '#000000' }}>
              {dialogMessage}
            </Text>
          </Dialog.Content>
          <Dialog.Actions>
                         <Button onPress={hideDialog} textColor={getThemeAwareColor('#4a0660', currentTheme)}>
               OK
             </Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>

      <Portal>
        <Dialog visible={mmProjSelectorVisible} onDismiss={handleMmProjSelectorClose}>
          <Dialog.Title style={{ color: isDark ? '#ffffff' : '#000000' }}>
            Select Multimodal Projector
          </Dialog.Title>
          <Dialog.Content>
            <Text style={{ marginBottom: 16, color: isDark ? '#ffffff' : '#000000' }}>
              Choose a projector (mmproj) model to enable multimodal capabilities:
            </Text>
            {storedModels.length === 0 ? (
              <View style={styles.emptyState}>
                <MaterialCommunityIcons 
                  name="cube-outline" 
                  size={48} 
                  color={isDark ? '#666' : '#ccc'} 
                />
                <Text style={[
                  styles.emptyStateText,
                  { color: isDark ? '#ccc' : '#666' }
                ]}>
                  No projector models found in your stored models.{'\n'}
                </Text>
              </View>
            ) : (
              storedModels.map((model) => (
                <TouchableOpacity
                  key={model.path}
                  style={[
                    styles.projectorModelItem,
                    { backgroundColor: isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.05)' }
                  ]}
                  onPress={() => handleMmProjSelect(model)}
                >
                                     <View style={[styles.projectorModelIcon, { backgroundColor: getThemeAwareColor('#4a0660', currentTheme) }]}>
                     <MaterialCommunityIcons
                       name="cube-outline"
                       size={16}
                       color="#ffffff"
                     />
                   </View>
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
                  <MaterialCommunityIcons
                    name="chevron-right"
                    size={20}
                    color={isDark ? '#666' : '#ccc'}
                  />
                </TouchableOpacity>
              ))
            )}
          </Dialog.Content>
          <Dialog.Actions>
            <Button 
              onPress={handleMmProjSkip}
              textColor={getThemeAwareColor('#4a0660', currentTheme)}
            >
              Skip
            </Button>
            <Button 
              onPress={handleMmProjSelectorClose}
              textColor={getThemeAwareColor('#4a0660', currentTheme)}
            >
              Cancel
            </Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    paddingHorizontal: 16,
    paddingBottom: 0,
    paddingTop: 8,
  },
  container: {
    position: 'relative',
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  attachmentButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  inputContainer: {
    flex: 1,
    borderRadius: 24,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 6,
    justifyContent: 'center',
  },
  input: {
    fontSize: 16,
    lineHeight: 20,
    textAlignVertical: 'center',
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cancelButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  recordingButton: {
    position: 'absolute',
    right: 56,
    bottom: 0,
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  recordingButtonInner: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
  },
  attachmentMenu: {
    position: 'absolute',
    bottom: 56,
    left: 0,
    flexDirection: 'row',
    backgroundColor: '#ffffff',
    borderRadius: 16,
    borderWidth: 1,
    paddingVertical: 8,
    paddingHorizontal: 12,
    gap: 16,
  },
  attachmentMenuItem: {
    alignItems: 'center',
    gap: 6,
  },
  attachmentMenuIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  attachmentMenuText: {
    fontSize: 12,
    fontWeight: '500',
  },
  projectorModelItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    marginVertical: 2,
    borderRadius: 12,
  },
  projectorModelIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  projectorModelInfo: {
    flex: 1,
    marginLeft: 12,
  },
  projectorModelName: {
    fontSize: 16,
    fontWeight: '500',
    lineHeight: 20,
  },
  projectorModelSize: {
    fontSize: 12,
    marginTop: 2,
    lineHeight: 16,
  },
  emptyState: {
    paddingVertical: 24,
    alignItems: 'center',
  },
  emptyStateText: {
    marginTop: 12,
    textAlign: 'center',
    lineHeight: 20,
  },
}); 