import React, { useState, useRef, useEffect } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  Dimensions,
  Animated,
  Platform,
  Modal,
  StatusBar,
  TextInput,
  ActivityIndicator,
  KeyboardAvoidingView,
  ScrollView,
  Image,
} from 'react-native';
import { AppSwitch } from '../services/adapters/SwitchAdapter';
import { CameraView, CameraType, useCameraPermissions } from 'expo-camera';
import Slider from '@react-native-community/slider';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../context/ThemeContext';
import { theme } from '../constants/theme';
import { getThemeAwareColor } from '../utils/ColorUtils';
import * as MediaLibrary from 'expo-media-library';
import ImageProcessingSelector from './ImageProcessingSelector';
import { 
  ImageProcessingMode, 
  performOCROnImage, 
  createOCRMessage, 
  createMultimodalMessage 
} from '../utils/ImageProcessingUtils';

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');

type CameraOverlayProps = {
  visible: boolean;
  onClose: () => void;
  onPhotoTaken: (uri: string, messageContent: string) => void;
  useRag?: boolean;
  onToggleRag?: (value: boolean) => void;
  ragEnabled?: boolean;
  ragToggleDisabled?: boolean;
};

export default function CameraOverlay({ visible, onClose, onPhotoTaken, useRag = true, onToggleRag, ragEnabled = true, ragToggleDisabled = false }: CameraOverlayProps) {
  const [facing, setFacing] = useState<CameraType>('back');
  const [permission, requestPermission] = useCameraPermissions();
  const [mediaLibraryPermission, requestMediaLibraryPermission] = MediaLibrary.usePermissions();
  const [showPromptDialog, setShowPromptDialog] = useState(false);
  const [capturedPhotoUri, setCapturedPhotoUri] = useState<string>('');
  const [userPrompt, setUserPrompt] = useState('');
  const [processingMode, setProcessingMode] = useState<ImageProcessingMode>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingProgress, setProcessingProgress] = useState('');
  const [imgCompress, setImgCompress] = useState(0.6);
  const [scrollEnabled, setScrollEnabled] = useState(true);
  const cameraRef = useRef<CameraView>(null);
  const { theme: currentTheme } = useTheme();
  const themeColors = theme[currentTheme as 'light' | 'dark'];
  const isDark = currentTheme === 'dark';
  const insets = useSafeAreaInsets();

  const getImgSize = (uri: string): Promise<{ width: number; height: number }> => {
    return new Promise((resolve, reject) => {
      Image.getSize(
        uri,
        (width, height) => resolve({ width, height }),
        error => reject(error)
      );
    });
  };


  const toggleCameraFacing = () => {
    setFacing(current => (current === 'back' ? 'front' : 'back'));
  };

  const takePicture = async () => {
    if (cameraRef.current) {
      try {
        const photo = await cameraRef.current.takePictureAsync({
          quality: 0.8,
          base64: false,
        });
        
        if (photo?.uri) {
          if (mediaLibraryPermission?.granted) {
            await MediaLibrary.saveToLibraryAsync(photo.uri);
          }
          setCapturedPhotoUri(photo.uri);
          setUserPrompt('What do you see in this image?');
          setShowPromptDialog(true);
        }
      } catch (error) {
      }
    }
  };

  const handleSendPhoto = async () => {
    if (!capturedPhotoUri || !userPrompt.trim() || isProcessing || !processingMode) return;

    try {
      setIsProcessing(true);
      setProcessingProgress('Optimizing image...');

      const { width, height } = await getImgSize(capturedPhotoUri);
      const sizePct = Math.max(0.01, Math.min(1, imgCompress));
      const sizeRatio = (sizePct - 0.01) / 0.99;
      const targetHeight = Math.round(100 + Math.max(0, height - 100) * sizeRatio);
      const targetWidth = Math.min(width, Math.max(1, Math.round((width / height) * targetHeight)));
      const quality = 0.2 + sizePct * 0.8;
      const actions = (targetWidth !== width || targetHeight !== height)
        ? [{ resize: { width: targetWidth, height: targetHeight } }]
        : [];

      const processed = await manipulateAsync(
        capturedPhotoUri,
        actions,
        {
          compress: quality,
          format: SaveFormat.JPEG,
        }
      );

      const imgUri = processed?.uri || capturedPhotoUri;
      
      if (processingMode === 'ocr') {
        const extractedText = await performOCROnImage(imgUri, setProcessingProgress);
        const ocrMessage = createOCRMessage(extractedText, imgUri, 'camera_photo', userPrompt);
        onPhotoTaken(imgUri, ocrMessage);
      } else if (processingMode === 'multimodal') {
        const multimodalMessage = createMultimodalMessage(imgUri, userPrompt);
        onPhotoTaken(imgUri, multimodalMessage);
      }
      
      setShowPromptDialog(false);
      setCapturedPhotoUri('');
      setUserPrompt('');
      setProcessingProgress('');
      onClose();
    } catch (error) {
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCancelPhoto = () => {
    if (isProcessing) return;
    setShowPromptDialog(false);
    setCapturedPhotoUri('');
    setUserPrompt('');
    setProcessingMode(null);
    setProcessingProgress('');
  };

  if (!visible) {
    return null;
  }

  if (!permission) {
    return null;
  }

  if (!permission.granted) {
    return (
      <Modal
        visible={visible}
        animationType="fade"
        transparent={false}
        statusBarTranslucent={true}
        onRequestClose={onClose}
      >
        {Platform.OS === 'android' && <StatusBar hidden={true} />}
        <View style={[styles.fullScreenContainer, { backgroundColor: themeColors.background }]}>
          <View style={styles.permissionContainer}>
            <MaterialCommunityIcons 
              name="camera" 
              size={48} 
              color={themeColors.text} 
              style={styles.permissionIcon}
            />
            <Text style={[styles.permissionTitle, { color: themeColors.text }]}>
              Camera Permission Required
            </Text>
            <Text style={[styles.permissionText, { color: themeColors.secondaryText }]}>
              Grant camera access to take photos
            </Text>
            <View style={styles.permissionButtons}>
              <TouchableOpacity
                style={[styles.permissionButton, styles.cancelButton]}
                onPress={onClose}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.permissionButton, styles.grantButton]}
                onPress={requestPermission}
              >
                <Text style={styles.grantButtonText}>Grant</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    );
  }

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent={false}
      statusBarTranslucent={true}
        onRequestClose={onClose}
      >
        {Platform.OS === 'android' && <StatusBar hidden={true} />}
        <View style={styles.fullScreenContainer}>
          <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
          <TouchableOpacity style={styles.headerButton} onPress={onClose}>
            <MaterialCommunityIcons name="close" size={24} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Camera</Text>
          <TouchableOpacity style={styles.headerButton} onPress={toggleCameraFacing}>
            <MaterialCommunityIcons name="camera-flip" size={24} color="#fff" />
          </TouchableOpacity>
        </View>
        
        <View style={styles.cameraWrapper}>
          <CameraView
            ref={cameraRef}
            style={styles.cameraView}
            facing={facing}
          />
        </View>

        <View style={[styles.controls, { paddingBottom: insets.bottom + 30 }]}>
          <TouchableOpacity style={styles.captureButton} onPress={takePicture}>
            <View style={styles.captureButtonInner} />
          </TouchableOpacity>
        </View>

        {showPromptDialog && (
          <KeyboardAvoidingView
            style={styles.promptOverlay}
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            keyboardVerticalOffset={Platform.OS === 'ios' ? 40 : 0}
          >
            <ScrollView 
              contentContainerStyle={styles.scrollContainer}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              scrollEnabled={scrollEnabled}
            >
              <View style={[styles.promptDialog, { backgroundColor: themeColors.background }]}>
                <Text style={[styles.promptTitle, { color: themeColors.text }]}>
                  Configure Image Processing
                </Text>

                {onToggleRag && (
                  ragEnabled ? (
                    <View
                      style={[
                        styles.ragRow,
                        {
                          backgroundColor: isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.02)',
                          borderColor: isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.05)',
                        },
                      ]}
                    >
                      <View style={styles.ragTextContainer}>
                        <Text style={[styles.ragTitle, { color: themeColors.text }]}>Use RAG</Text>
                        <Text style={[styles.ragDescription, { color: isDark ? '#bbbbbb' : '#666666' }]}>Store this file for smarter answers in this chat.</Text>
                      </View>
                      <AppSwitch
                        value={useRag}
                        onValueChange={onToggleRag}
                        disabled={ragToggleDisabled}
                      />
                    </View>
                  ) : (
                    <View
                      style={[
                        styles.ragRow,
                        {
                          backgroundColor: isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.02)',
                          borderColor: isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.05)',
                        },
                      ]}
                    >
                      <MaterialCommunityIcons name="information-outline" size={20} color={isDark ? '#888888' : '#666666'} />
                      <View style={[styles.ragTextContainer, { paddingLeft: 8 }]}>
                        <Text style={[styles.ragTitle, { color: isDark ? '#888888' : '#666666' }]}>RAG not available</Text>
                        <Text style={[styles.ragDescription, { color: isDark ? '#888888' : '#666666' }]}>Local RAG is not available for remote models.</Text>
                      </View>
                    </View>
                  )
                )}
                
                <ImageProcessingSelector
                  selectedMode={processingMode}
                  onModeChange={setProcessingMode}
                  disabled={isProcessing}
                />
                
                <Text style={[styles.promptSubtitle, { color: themeColors.text }]}>
                  {processingMode === 'ocr' 
                    ? 'Instructions for text processing:' 
                    : 'What would you like to ask about this image?'
                  }
                </Text>

                <TextInput
                  style={[
                    styles.promptInput,
                    {
                      color: themeColors.text,
                      borderColor: isDark ? 'rgba(255, 255, 255, 0.2)' : 'rgba(0, 0, 0, 0.2)',
                      backgroundColor: isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.05)',
                    }
                  ]}
                  placeholder={processingMode === 'ocr' 
                    ? 'Enter instructions for processing the extracted text...' 
                    : 'What would you like to ask about this image?'
                  }
                  placeholderTextColor={isDark ? 'rgba(255, 255, 255, 0.5)' : 'rgba(0, 0, 0, 0.5)'}
                  value={userPrompt}
                  onChangeText={setUserPrompt}
                  multiline
                  autoFocus
                  maxLength={500}
                  editable={!isProcessing}
                />

                <View style={styles.compWrap}>
                  <View style={styles.compHead}>
                    <Text style={[styles.compLabel, { color: themeColors.text }]}>Image Size + Quality</Text>
                    <Text style={[styles.compValue, { color: themeColors.secondaryText }]}>{Math.round(imgCompress * 100)}%</Text>
                  </View>
                  <Slider
                    minimumValue={0.01}
                    maximumValue={1}
                    step={0.01}
                    value={imgCompress}
                    onValueChange={setImgCompress}
                    onSlidingStart={() => setScrollEnabled(false)}
                    onSlidingComplete={() => setScrollEnabled(true)}
                    disabled={isProcessing}
                    minimumTrackTintColor={getThemeAwareColor('#4a0660', currentTheme)}
                    thumbTintColor={getThemeAwareColor('#4a0660', currentTheme)}
                  />
                </View>

                {isProcessing && (
                  <View style={styles.processingContainer}>
                    <ActivityIndicator size="small" color={getThemeAwareColor('#4a0660', currentTheme)} />
                    <Text style={[styles.processingText, { color: themeColors.text }]}>
                      {processingProgress || 'Processing image...'}
                    </Text>
                  </View>
                )}
                <View style={styles.promptButtons}>
                  <TouchableOpacity
                    style={[styles.promptButton, styles.cancelPromptButton]}
                    onPress={handleCancelPhoto}
                  >
                    <Text style={styles.cancelPromptButtonText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.promptButton, styles.sendPromptButton]}
                    onPress={handleSendPhoto}
                    disabled={!userPrompt.trim() || isProcessing || !processingMode}
                  >
                    {isProcessing ? (
                      <ActivityIndicator size="small" color="#ffffff" />
                    ) : (
                    <Text style={[
                      styles.sendPromptButtonText,
                        { opacity: (userPrompt.trim() && !isProcessing && processingMode) ? 1 : 0.5 }
                    ]}>
                        {processingMode === 'ocr' ? 'Extract' : processingMode === 'multimodal' ? 'Analyze' : 'Select Mode'}
                    </Text>
                    )}
                  </TouchableOpacity>
                </View>
              </View>
            </ScrollView>
          </KeyboardAvoidingView>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fullScreenContainer: {
    flex: 1,
    backgroundColor: '#000',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 15,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 1,
  },
  headerButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  cameraWrapper: {
    flex: 1,
    backgroundColor: '#000',
  },
  cameraView: {
    flex: 1,
  },
  controls: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 30,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
  },
  captureButton: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 4,
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },
  captureButtonInner: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#fff',
  },
  permissionContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  permissionIcon: {
    marginBottom: 15,
  },
  permissionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 8,
    textAlign: 'center',
  },
  permissionText: {
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 20,
    lineHeight: 18,
  },
  permissionButtons: {
    flexDirection: 'row',
    gap: 10,
  },
  permissionButton: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 6,
    minWidth: 80,
    alignItems: 'center',
  },
  cancelButton: {
    backgroundColor: '#ccc',
  },
  grantButton: {
    backgroundColor: '#660880',
  },
  cancelButtonText: {
    color: '#333',
    fontSize: 14,
    fontWeight: '600',
  },
  grantButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  promptOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  promptDialog: {
    width: '80%',
    padding: 20,
    borderRadius: 10,
    backgroundColor: '#fff',
  },
  promptTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 10,
  },
  ragRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 12,
    gap: 16,
  },
  ragTextContainer: {
    flex: 1,
  },
  ragTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  ragDescription: {
    fontSize: 13,
    lineHeight: 18,
  },
  promptInput: {
    width: '100%',
    height: 100,
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.2)',
    padding: 10,
    marginBottom: 10,
  },
  promptButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  promptButton: {
    padding: 10,
    borderRadius: 6,
    minWidth: 80,
    alignItems: 'center',
  },
  cancelPromptButton: {
    backgroundColor: '#ccc',
  },
  sendPromptButton: {
    backgroundColor: '#660880',
  },
  cancelPromptButtonText: {
    color: '#333',
    fontSize: 14,
    fontWeight: '600',
  },
  sendPromptButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  promptSubtitle: {
    fontSize: 16,
    fontWeight: '500',
    marginBottom: 8,
    marginTop: 12,
  },
  processingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    gap: 8,
  },
  processingText: {
    fontSize: 14,
    fontStyle: 'italic',
  },
  scrollContainer: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 20,
    minWidth: '100%',
  },
  compWrap: {
    marginTop: 8,
    marginBottom: 10,
  },
  compHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  compLabel: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 4,
  },
  compValue: {
    fontSize: 13,
    fontWeight: '500',
    marginBottom: 4,
  },
}); 