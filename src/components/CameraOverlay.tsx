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
} from 'react-native';
import { CameraView, CameraType, useCameraPermissions } from 'expo-camera';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { theme } from '../constants/theme';
import * as MediaLibrary from 'expo-media-library';

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');

type CameraOverlayProps = {
  visible: boolean;
  onClose: () => void;
  onPhotoTaken: (uri: string, prompt: string) => void;
};

export default function CameraOverlay({ visible, onClose, onPhotoTaken }: CameraOverlayProps) {
  const [facing, setFacing] = useState<CameraType>('back');
  const [permission, requestPermission] = useCameraPermissions();
  const [mediaLibraryPermission, requestMediaLibraryPermission] = MediaLibrary.usePermissions();
  const [showPromptDialog, setShowPromptDialog] = useState(false);
  const [capturedPhotoUri, setCapturedPhotoUri] = useState<string>('');
  const [userPrompt, setUserPrompt] = useState('');
  const cameraRef = useRef<CameraView>(null);
  const { theme: currentTheme } = useTheme();
  const themeColors = theme[currentTheme as 'light' | 'dark'];
  const isDark = currentTheme === 'dark';
  useEffect(() => {
    if (visible) {
      if (!permission?.granted) {
        requestPermission();
      }
      if (!mediaLibraryPermission?.granted) {
        requestMediaLibraryPermission();
      }
    }
  }, [visible]);

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
        console.error('Error taking picture:', error);
      }
    }
  };

  const handleSendPhoto = () => {
    if (capturedPhotoUri && userPrompt.trim()) {
      onPhotoTaken(capturedPhotoUri, userPrompt.trim());
      setShowPromptDialog(false);
      setCapturedPhotoUri('');
      setUserPrompt('');
      onClose();
    }
  };

  const handleCancelPhoto = () => {
    setShowPromptDialog(false);
    setCapturedPhotoUri('');
    setUserPrompt('');
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
        <StatusBar hidden={true} />
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
      <StatusBar hidden={true} />
      <View style={styles.fullScreenContainer}>
        <View style={styles.header}>
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

        <View style={styles.controls}>
          <TouchableOpacity style={styles.captureButton} onPress={takePicture}>
            <View style={styles.captureButtonInner} />
          </TouchableOpacity>
        </View>

        {showPromptDialog && (
          <View style={styles.promptOverlay}>
            <View style={[styles.promptDialog, { backgroundColor: themeColors.background }]}>
              <Text style={[styles.promptTitle, { color: themeColors.text }]}>
                Add a prompt for your image
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
                placeholder="What would you like to ask about this image?"
                placeholderTextColor={isDark ? 'rgba(255, 255, 255, 0.5)' : 'rgba(0, 0, 0, 0.5)'}
                value={userPrompt}
                onChangeText={setUserPrompt}
                multiline
                autoFocus
                maxLength={500}
              />
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
                  disabled={!userPrompt.trim()}
                >
                  <Text style={[
                    styles.sendPromptButtonText,
                    { opacity: userPrompt.trim() ? 1 : 0.5 }
                  ]}>
                    Send
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
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
    paddingTop: Platform.OS === 'ios' ? 50 : 30,
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
    paddingBottom: Platform.OS === 'ios' ? 50 : 30,
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
}); 