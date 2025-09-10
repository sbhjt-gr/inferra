import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  View,
  Modal,
  TouchableOpacity,
  SafeAreaView,
  Platform,
  Text,
  ActivityIndicator,
  ScrollView,
  TextInput,
  KeyboardAvoidingView,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as FileSystem from 'expo-file-system';
import { useTheme } from '../context/ThemeContext';
import { theme } from '../constants/theme';

type TextFileViewerModalProps = {
  visible: boolean;
  onClose: () => void;
  filePath: string;
  fileName?: string;
  onUpload?: (content: string, fileName: string, userPrompt: string) => void;
};

export default function TextFileViewerModal({
  visible,
  onClose,
  filePath,
  fileName = "Document",
  onUpload,
}: TextFileViewerModalProps) {
  const { theme: currentTheme } = useTheme();
  const themeColors = theme[currentTheme as 'light' | 'dark'];
  const isDark = currentTheme === 'dark';
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState<string>('');
  const [userPrompt, setUserPrompt] = useState('');
  const [promptError, setPromptError] = useState(false);

  const displayFileName = fileName || filePath.split('/').pop() || "Document";

  const isBinaryContent = (content: string): boolean => {
    const nonPrintablePattern = /[\x00-\x08\x0B\x0C\x0E-\x1F]/;
    
    if (content.length === 0) return false;
    
    const sampleLength = Math.min(content.length, 1000);
    const sample = content.substring(0, sampleLength);
    
    let nonPrintableCount = 0;
    for (let i = 0; i < sample.length; i++) {
      if (nonPrintablePattern.test(sample[i])) {
        nonPrintableCount++;
      }
    }
    
    return (nonPrintableCount / sampleLength) > 0.1;
  };

  const handleUpload = () => {
    if (!userPrompt.trim()) {
      setPromptError(true);
      return;
    }
    
    setPromptError(false);
    
    if (onUpload && fileContent) {
      onUpload(fileContent, displayFileName, userPrompt.trim());
      onClose();
    }
  };

  useEffect(() => {
    if (visible) {
      setLoading(true);
      setError(null);
      setFileContent('');
      setUserPrompt('');
      setPromptError(false);

      const readFile = async () => {
        try {
          if (!filePath || typeof filePath !== 'string') {
            throw new Error('Invalid file path');
          }

          const formattedPath = filePath.startsWith('file://') 
            ? filePath 
            : Platform.OS === 'ios' ? `file://${filePath}` : filePath;
            
          const content = await FileSystem.readAsStringAsync(formattedPath);
          
          if (isBinaryContent(content)) {
            setError('This appears to be a binary file and cannot be displayed as text.');
            setLoading(false);
            return;
          }
          
          setFileContent(content);
          setLoading(false);
        } catch (err) {
          setLoading(false);
          setError('Failed to load file. The file might be corrupted or not accessible.');
        }
      };

      readFile();
    }
  }, [visible, filePath]);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={false}
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView 
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 64 : 0}
      >
        <SafeAreaView style={[styles.container, { backgroundColor: isDark ? '#121212' : '#fff' }]}>
          <View style={styles.header}>
            <Text 
              style={[
                styles.fileNameText, 
                { color: isDark ? '#ffffff' : '#660880' }
              ]}
              numberOfLines={1}
              ellipsizeMode="middle"
            >
              {displayFileName}
            </Text>
            <TouchableOpacity style={styles.closeButton} onPress={onClose}>
              <MaterialCommunityIcons 
                name="close" 
                size={24} 
                color={isDark ? '#ffffff' : "#660880"} 
              />
            </TouchableOpacity>
          </View>
          
          <View style={[styles.contentContainer, { backgroundColor: isDark ? '#1e1e1e' : '#f5f5f5' }]}>
            {loading ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color="#660880" />
                <Text style={[styles.loadingText, { color: isDark ? '#ffffff' : '#333333' }]}>
                  Loading file...
                </Text>
              </View>
            ) : error ? (
              <View style={styles.errorContainer}>
                <MaterialCommunityIcons 
                  name="alert-circle-outline" 
                  size={48} 
                  color={isDark ? '#ffffff' : "#660880"} 
                />
                <Text style={[styles.errorText, { color: isDark ? '#ffffff' : '#333333' }]}>
                  {error}
                </Text>
                <Text style={[styles.infoText, { color: isDark ? '#bbbbbb' : '#666666' }]}>
                  File format: {displayFileName.split('.').pop()?.toUpperCase() || 'Unknown'}
                </Text>
              </View>
            ) : (
              <View style={styles.fileContentWrapper}>
                <ScrollView 
                  style={styles.textScrollView}
                  contentContainerStyle={styles.textContentContainer}
                  scrollIndicatorInsets={{ right: 1 }}
                >
                  <Text 
                    style={[styles.fileContentText, { color: isDark ? '#e6e6e6' : '#333333' }]}
                    selectable={true}
                    textBreakStrategy="simple"
                  >
                    {fileContent}
                  </Text>
                </ScrollView>
                
                <View style={[styles.uploadButtonContainer, { 
                  backgroundColor: isDark ? '#1a1a1a' : '#ffffff',
                  borderTopColor: isDark ? '#333333' : '#e0e0e0'
                }]}>
                  <View style={styles.promptContainer}>
                    <Text style={[styles.promptLabel, { color: isDark ? '#ffffff' : '#333333' }]}>
                      Add your prompt:
                    </Text>
                    <TextInput
                      style={[
                        styles.promptInput,
                        { 
                          color: isDark ? '#ffffff' : '#333333',
                          backgroundColor: isDark ? '#2a2a2a' : '#f1f1f1',
                          borderColor: promptError ? '#ff6b6b' : isDark ? '#444444' : '#dddddd'
                        }
                      ]}
                      placeholder="What would you like to ask about this file?"
                      placeholderTextColor={isDark ? '#888888' : '#999999'}
                      value={userPrompt}
                      onChangeText={(text) => {
                        setUserPrompt(text);
                        if (text.trim()) setPromptError(false);
                      }}
                      multiline={true}
                      numberOfLines={3}
                    />
                    {promptError && (
                      <Text style={styles.errorPromptText}>
                        Please enter a prompt before uploading
                      </Text>
                    )}
                  </View>
                  
                  <TouchableOpacity
                    style={[
                      styles.uploadButton, 
                      { 
                        backgroundColor: '#660880',
                        opacity: !fileContent || loading || !!error ? 0.5 : 1
                      }
                    ]}
                    onPress={handleUpload}
                    disabled={!fileContent || loading || !!error}
                  >
                    <MaterialCommunityIcons name="upload" size={20} color="#ffffff" style={styles.uploadIcon} />
                    <Text style={styles.uploadButtonText}>Upload to Chat</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </View>
        </SafeAreaView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    height: 50,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  fileNameText: {
    fontSize: 16,
    fontWeight: '500',
    flex: 1,
    marginRight: 16,
  },
  closeButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 20,
  },
  contentContainer: {
    flex: 1,
  },
  fileContentWrapper: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
  },
  textScrollView: {
    flex: 1,
  },
  textContentContainer: {
    padding: 16,
    paddingBottom: 40,
  },
  fileContentText: {
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontSize: 14,
    lineHeight: 20,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  errorText: {
    marginTop: 16,
    fontSize: 16,
    textAlign: 'center',
  },
  infoText: {
    marginTop: 8,
    fontSize: 14,
    textAlign: 'center',
  },
  uploadButtonContainer: {
    width: '100%',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderTopWidth: 1,
  },
  promptContainer: {
    marginBottom: 12,
  },
  promptLabel: {
    fontSize: 14,
    fontWeight: '500',
    marginBottom: 8,
  },
  promptInput: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    minHeight: 100,
    textAlignVertical: 'top',
  },
  errorPromptText: {
    color: '#ff6b6b',
    fontSize: 12,
    marginTop: 4,
  },
  uploadButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
  },
  uploadButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  uploadIcon: {
    marginRight: 8,
  },
}); 
