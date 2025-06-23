import React, { useState, useRef, useEffect } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  Dimensions,
  Animated,
  Platform,
} from 'react-native';
import { CameraView, CameraType, useCameraPermissions } from 'expo-camera';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { theme } from '../constants/theme';
import * as MediaLibrary from 'expo-media-library';

const { width: screenWidth } = Dimensions.get('window');

type CameraOverlayProps = {
  visible: boolean;
  onClose: () => void;
  onPhotoTaken: (uri: string) => void;
};

export default function CameraOverlay({ visible, onClose, onPhotoTaken }: CameraOverlayProps) {
  const [facing, setFacing] = useState<CameraType>('back');
  const [permission, requestPermission] = useCameraPermissions();
  const [mediaLibraryPermission, requestMediaLibraryPermission] = MediaLibrary.usePermissions();
  const cameraRef = useRef<CameraView>(null);
  const { theme: currentTheme } = useTheme();
  const themeColors = theme[currentTheme as 'light' | 'dark'];
  const isDark = currentTheme === 'dark';
  const slideAnimation = useRef(new Animated.Value(0)).current;

  const cameraHeight = 300;
  const cameraWidth = screenWidth - 20;

  useEffect(() => {
    if (visible) {
      if (!permission?.granted) {
        requestPermission();
      }
      if (!mediaLibraryPermission?.granted) {
        requestMediaLibraryPermission();
      }
      
      Animated.spring(slideAnimation, {
        toValue: 1,
        useNativeDriver: true,
        tension: 100,
        friction: 8,
      }).start();
    } else {
      Animated.spring(slideAnimation, {
        toValue: 0,
        useNativeDriver: true,
        tension: 100,
        friction: 8,
      }).start();
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
          onPhotoTaken(photo.uri);
          onClose();
        }
      } catch (error) {
        console.error('Error taking picture:', error);
      }
    }
  };

  if (!visible) {
    return null;
  }

  if (!permission) {
    return null;
  }

  if (!permission.granted) {
    return (
      <Animated.View 
        style={[
          styles.container,
          {
            transform: [{
              translateY: slideAnimation.interpolate({
                inputRange: [0, 1],
                outputRange: [cameraHeight, 0],
              }),
            }],
          }
        ]}
      >
        <View style={[styles.permissionContainer, { backgroundColor: themeColors.background }]}>
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
      </Animated.View>
    );
  }

  return (
    <Animated.View 
      style={[
        styles.container,
        {
          height: cameraHeight,
          width: cameraWidth,
          transform: [{
            translateY: slideAnimation.interpolate({
              inputRange: [0, 1],
              outputRange: [cameraHeight, 0],
            }),
          }],
        }
      ]}
    >
      <View style={styles.cameraContainer}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.headerButton} onPress={onClose}>
            <MaterialCommunityIcons name="close" size={20} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Camera</Text>
          <TouchableOpacity style={styles.headerButton} onPress={toggleCameraFacing}>
            <MaterialCommunityIcons name="camera-flip" size={20} color="#fff" />
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
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 0,
    left: 10,
    right: 10,
    zIndex: 1000,
    borderRadius: 12,
    overflow: 'hidden',
    elevation: 10,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: -2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 8,
  },
  cameraContainer: {
    flex: 1,
    backgroundColor: '#000',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 15,
    paddingVertical: 10,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    height: 50,
  },
  headerButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    color: '#fff',
    fontSize: 16,
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
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 20,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    height: 70,
  },
  captureButton: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },
  captureButtonInner: {
    width: 36,
    height: 36,
    borderRadius: 18,
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
}); 