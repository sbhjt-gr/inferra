import React, { useState } from 'react';
import {
  StyleSheet,
  View,
  Modal,
  TouchableOpacity,
  TextInput,
  Image,
  ScrollView,
  Dimensions,
  SafeAreaView,
  ActivityIndicator,
  Switch,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Button, Text } from 'react-native-paper';
import { useTheme } from '../context/ThemeContext';
import { theme } from '../constants/theme';
import { getThemeAwareColor } from '../utils/ColorUtils';
import ImageProcessingSelector from './ImageProcessingSelector';
import { 
  ImageProcessingMode, 
  performOCROnImage, 
  createOCRMessage, 
  createMultimodalMessage 
} from '../utils/ImageProcessingUtils';

type ImageViewerModalProps = {
  visible: boolean;
  onClose: () => void;
  imagePath: string;
  fileName?: string;
  onUpload?: (content: string, fileName: string, userPrompt: string, useRag: boolean) => void;
  onImageUpload?: (messageContent: string) => void;
  useRag: boolean;
  onToggleRag: (value: boolean) => void;
};

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');

export default function ImageViewerModal({
  visible,
  onClose,
  imagePath,
  fileName,
  onUpload,
  onImageUpload,
  useRag,
  onToggleRag,
}: ImageViewerModalProps) {
  const [userPrompt, setUserPrompt] = useState('Describe this image in detail.');
  const [processingMode, setProcessingMode] = useState<ImageProcessingMode>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingProgress, setProcessingProgress] = useState('');
  const { theme: currentTheme } = useTheme();
  const themeColors = theme[currentTheme as 'light' | 'dark'];
  const isDark = currentTheme === 'dark';

  const handleSend = async () => {
    if ((!onUpload && !onImageUpload) || !imagePath || isProcessing || !processingMode) return;

    try {
      setIsProcessing(true);
      
      if (processingMode === 'ocr') {
        const extractedText = await performOCROnImage(imagePath, setProcessingProgress);
        const ocrMessage = createOCRMessage(extractedText, imagePath, fileName, userPrompt);
        if (onImageUpload) {
          onImageUpload(ocrMessage);
        } else {
          onUpload?.(ocrMessage, fileName || 'image', userPrompt, useRag);
        }
      } else if (processingMode === 'multimodal') {
        const multimodalMessage = createMultimodalMessage(imagePath, userPrompt);
        if (onImageUpload) {
          onImageUpload(multimodalMessage);
        } else {
          onUpload?.(multimodalMessage, fileName || 'image', userPrompt, useRag);
        }
      }
      
      onClose();
    } catch (error) {
    } finally {
      setIsProcessing(false);
      setProcessingProgress('');
    }
  };

  const handleClose = () => {
    if (isProcessing) return;
    setUserPrompt('Describe this image in detail.');
    setProcessingMode(null);
    setProcessingProgress('');
    onClose();
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={handleClose}
    >
      <SafeAreaView style={[styles.container, { backgroundColor: themeColors.background }]}>
        <View style={[styles.header, { backgroundColor: themeColors.background, borderBottomColor: isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)' }]}>
          <TouchableOpacity 
            style={[styles.headerButton, { backgroundColor: isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.05)' }]}
            onPress={handleClose}
          >
            <MaterialCommunityIcons 
              name="close" 
              size={20} 
              color={isDark ? '#ffffff' : '#000000'} 
            />
          </TouchableOpacity>
          
          <Text style={[styles.headerTitle, { color: themeColors.text }]}>
            {fileName || 'Image'}
          </Text>
          
          <TouchableOpacity 
            style={[
              styles.headerButton, 
              { 
                backgroundColor: getThemeAwareColor('#4a0660', currentTheme),
                opacity: (userPrompt.trim() && !isProcessing) ? 1 : 0.5
              }
            ]}
            onPress={handleSend}
            disabled={!userPrompt.trim() || isProcessing}
          >
            {isProcessing ? (
              <ActivityIndicator size={20} color="#ffffff" />
            ) : (
              <MaterialCommunityIcons 
                name="send" 
                size={20} 
                color="#ffffff" 
              />
            )}
          </TouchableOpacity>
        </View>

        <ScrollView 
          style={styles.content}
          contentContainerStyle={styles.contentContainer}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.imageContainer}>
            <Image
              source={{ uri: imagePath }}
              style={styles.image}
              resizeMode="contain"
            />
          </View>
        </ScrollView>

        <View style={[styles.inputSection, { backgroundColor: themeColors.background, borderTopColor: isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)' }]}> 
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
            <Switch
              value={useRag}
              onValueChange={onToggleRag}
              trackColor={{ false: isDark ? '#444444' : '#dddddd', true: '#66088080' }}
              thumbColor={useRag ? '#660880' : isDark ? '#222222' : '#f2f2f2'}
            />
          </View>
          <ImageProcessingSelector
            selectedMode={processingMode}
            onModeChange={setProcessingMode}
            disabled={isProcessing}
          />
          
          <Text style={[styles.inputLabel, { color: themeColors.text }]}>
            {processingMode === 'ocr' 
              ? 'Additional instructions for text processing:' 
              : 'What would you like to ask about this image?'
            }
          </Text>
          
          <View style={[
            styles.inputContainer,
            { 
              backgroundColor: isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.02)',
              borderColor: isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)'
            }
          ]}>
            <TextInput
              style={[styles.textInput, { color: themeColors.text }]}
              value={userPrompt}
              onChangeText={setUserPrompt}
              placeholder={processingMode === 'ocr' 
                ? 'Enter instructions for processing the extracted text...' 
                : 'Enter your question or instruction...'
              }
              placeholderTextColor={isDark ? 'rgba(255, 255, 255, 0.6)' : 'rgba(0, 0, 0, 0.4)'}
              multiline
              textAlignVertical="top"
              maxLength={1000}
              editable={!isProcessing}
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

          <View style={styles.actionButtons}>
            <Button
              mode="outlined"
              onPress={handleClose}
              style={[styles.button, { borderColor: isDark ? 'rgba(255, 255, 255, 0.2)' : 'rgba(0, 0, 0, 0.2)' }]}
              labelStyle={{ color: themeColors.text }}
            >
              Cancel
            </Button>
            
            <Button
              mode="contained"
              onPress={handleSend}
              disabled={!userPrompt.trim() || isProcessing || !processingMode}
              style={[
                styles.button,
                { 
                  backgroundColor: getThemeAwareColor('#4a0660', currentTheme),
                  opacity: (userPrompt.trim() && !isProcessing && processingMode) ? 1 : 0.5
                }
              ]}
              labelStyle={{ color: '#ffffff' }}
              loading={isProcessing}
            >
              {processingMode === 'ocr' ? 'Extract Text' : processingMode === 'multimodal' ? 'Analyze Image' : 'Select Processing Mode'}
            </Button>
          </View>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  headerButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 18,
    fontWeight: '600',
    marginHorizontal: 16,
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 20,
  },
  imageContainer: {
    width: screenWidth - 32,
    height: screenHeight * 0.5,
    borderRadius: 12,
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  inputSection: {
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderTopWidth: 1,
  },
  ragRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 16,
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
  inputLabel: {
    fontSize: 16,
    fontWeight: '500',
    marginBottom: 12,
  },
  inputContainer: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
    minHeight: 80,
    marginBottom: 16,
  },
  textInput: {
    fontSize: 16,
    lineHeight: 22,
    minHeight: 56,
  },
  actionButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  button: {
    flex: 1,
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
}); 
