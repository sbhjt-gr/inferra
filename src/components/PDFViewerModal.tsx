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
  TextInput,
  KeyboardAvoidingView,
  Alert,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import PdfRendererView from 'react-native-pdf-renderer';
import { useTheme } from '../context/ThemeContext';
import { theme } from '../constants/theme';

import PDFGridView from './PDFGridView';
import {
  PageImage,
  formatPdfPath,
  extractPdfPages,
  performOCROnPages,
  cleanupTempFiles,
  formatExtractedContent
} from '../utils/PDFOcrUtils';

type PdfViewerModalProps = {
  visible: boolean;
  onClose: () => void;
  pdfSource: string;
  fileName?: string;
  onUpload?: (content: string, fileName: string, userPrompt: string) => void;
};

export default function PDFViewerModal({
  visible,
  onClose,
  pdfSource,
  fileName = "Document",
  onUpload,
}: PdfViewerModalProps) {
  const { theme: currentTheme } = useTheme();
  const themeColors = theme[currentTheme as 'light' | 'dark'];
  const isDark = currentTheme === 'dark';
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [userPrompt, setUserPrompt] = useState('');
  const [promptError, setPromptError] = useState(false);
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractionProgress, setExtractionProgress] = useState('');
  const [extractedPages, setExtractedPages] = useState<PageImage[]>([]);
  const [pageCount, setPageCount] = useState(0);
  const [tempFileUris, setTempFileUris] = useState<string[]>([]);
  const [extractionResult, setExtractionResult] = useState<{
    success: boolean;
    message: string;
    timestamp: number;
  } | null>(null);
  const [showGridView, setShowGridView] = useState(false);
  const [extractedContent, setExtractedContent] = useState('');
  const [selectedPages, setSelectedPages] = useState<number[]>([]);

  const displayFileName = fileName || pdfSource.split('/').pop() || "Document";

  const safeUpload = (pdfPath: string, fileName: string, userPromptText: string, extractedText?: string): boolean => {
    try {
      console.log('Attempting to upload with extracted content');
      
      if (onUpload && typeof onUpload === 'function') {
        console.log('Using onUpload with extracted content, text length:', extractedText?.length || 0);
        onUpload(extractedText || '', fileName, userPromptText);
        return true;
      } else {
        console.warn('No onUpload function provided, using fallback...');
        
        const timestampStr = new Date().toISOString();
        const infoStr = `PDF: ${fileName}\nExtracted on: ${timestampStr}\n\n`;
        const contentStr = extractedText || 'No content extracted';
        const promptStr = userPromptText || 'No prompt provided';
        
        const completeContent = `${infoStr}${contentStr}\n\n${promptStr}`;
        
        console.log('PDF content extracted successfully, but no upload function available.');
        console.log('Content:', completeContent.substring(0, 200) + '...');
        
        Alert.alert(
          'Upload Not Available',
          'Text was successfully extracted from the PDF, but cannot be uploaded to chat. The app may need to be configured properly.',
          [
            { text: 'OK', onPress: () => console.log('Alert closed') }
          ]
        );
        
        return false;
      }
    } catch (err) {
      console.error('Error in safeUpload:', err);
      Alert.alert(
        'Upload Failed',
        'Failed to upload the PDF content. Please try again.',
        [
          { text: 'OK', onPress: () => console.log('Error alert closed') }
        ]
      );
      return false;
    }
  };

  const handleExtractText = async () => {
    if (!userPrompt.trim()) {
      setPromptError(true);
      return;
    }
    
    setPromptError(false);
    setIsExtracting(true);
    setExtractionResult(null);
    console.log('Beginning OCR process');
    
    let progressTimer: NodeJS.Timeout | null = null;
    const progressMessages = [
      "Preparing...",
      "Processing PDF...",
      "Processing PDF...",
      "Processing PDF...",
      "Processing PDF...",
      "Almost done..."
    ];
    
    let progressIndex = 0;
    progressTimer = setInterval(() => {
      if (progressIndex < progressMessages.length) {
        setExtractionProgress(progressMessages[progressIndex]);
        progressIndex++;
      } else {
        if (progressTimer) clearInterval(progressTimer);
      }
    }, 3000);
    
    try {
      const pagesToProcess = selectedPages.length > 0 
        ? extractedPages.filter((_, index) => selectedPages.includes(index))
        : extractedPages;
      
      console.log('Starting OCR on', pagesToProcess.length, 'selected pages');
      
      setExtractionProgress(`Starting text recognition on ${pagesToProcess.length} page(s)...`);
      
      let rawExtractedContent = await performOCROnPages(
        pagesToProcess, 
        selectedPages, 
        extractedPages, 
        setExtractionProgress
      );
      console.log('OCR completed, raw text length:', rawExtractedContent.length);
      
      let formattedContent = formatExtractedContent(rawExtractedContent);
      console.log('Formatted text length:', formattedContent.length);
      
      if (progressTimer) clearInterval(progressTimer);
      
      if (formattedContent.includes("No significant text") || 
          formattedContent.includes("No text could be extracted") || 
          formattedContent.includes("Failed to") ||
          formattedContent.trim().length < 50) {
        formattedContent += "\n\n[Note: The text extraction may be incomplete. This PDF might contain complex formatting, scanned pages, or primarily image content.]";
      }
      
      console.log('Content ready for upload, final text length:', formattedContent.length);
      console.log('Sample content:', formattedContent.substring(0, 100) + '...');
      
      setExtractedContent(formattedContent);
      
      const uploadSuccess = safeUpload(pdfSource, displayFileName, userPrompt, formattedContent);
      
      if (uploadSuccess) {
        console.log('Upload completed, closing PDF viewer');
        onClose();
      } else {
        setExtractionResult({
          success: false,
          message: 'Failed to upload the extracted content to chat. Please try again.',
          timestamp: Date.now()
        });
        setShowGridView(false);
      }
    } catch (err) {
      console.error('Error performing OCR on PDF content:', err);
      
      if (progressTimer) clearInterval(progressTimer);
      
      const fallbackExtractedContent = "[PDF content extraction failed. This PDF may contain complex formatting, be scanned, or primarily contain images.]";
      
      console.log('Using fallback content due to error');
      
      setExtractedContent(fallbackExtractedContent);
      setExtractionResult({
        success: false,
        message: 'Text extraction failed. The PDF might be complex or scanned.',
        timestamp: Date.now()
      });
      setShowGridView(false);
    } finally {
      if (progressTimer) clearInterval(progressTimer);
      setIsExtracting(false);
      setExtractionProgress('');
    }
  };

  const handleStartOCR = () => {
    if (!userPrompt.trim()) {
      Alert.alert(
        "Prompt Required",
        "Please enter a prompt about what you'd like to know from this PDF.",
        [{ text: "OK" }]
      );
      return;
    }
    
    if (selectedPages.length === 0) {
      Alert.alert(
        "No Pages Selected",
        "Please select at least one page to extract text from.",
        [{ text: "OK" }]
      );
      return;
    }
    
    setIsExtracting(true);
    setShowGridView(false);
    
    handleExtractText();
  };

  const togglePageSelection = (index: number) => {
    setSelectedPages(prevSelected => {
      if (prevSelected.includes(index)) {
        return prevSelected.filter(i => i !== index);
      } else {
        return [...prevSelected, index];
      }
    });
  };

  const handleSelectAllPages = () => {
    if (selectedPages.length === extractedPages.length) {
      setSelectedPages([]);
    } else {
      setSelectedPages(extractedPages.map((_, index) => index));
    }
  };

  const renderExtractButton = () => {
    const isDisabled = !pdfSource || loading || !!error || isExtracting || extractedPages.length === 0;
    
    return (
      <TouchableOpacity
        style={[
          styles.uploadButton, 
          { 
            backgroundColor: '#660880',
            opacity: isDisabled ? 0.5 : 1
          }
        ]}
        onPress={() => setShowGridView(true)}
        disabled={isDisabled}
      >
        {isExtracting ? (
          <>
            <ActivityIndicator size="small" color="#ffffff" style={styles.uploadIcon} />
            <Text style={styles.uploadButtonText}>
              {extractionProgress || "Processing..."}
            </Text>
          </>
        ) : (
          <>
            <MaterialCommunityIcons 
              name="grid" 
              size={20} 
              color="#ffffff" 
              style={styles.uploadIcon} 
            />
            <Text style={styles.uploadButtonText}>
              {extractedPages.length > 0 ? "Select Pages" : "PDF preparation failed"}
            </Text>
          </>
        )}
      </TouchableOpacity>
    );
  };

  const renderExtractionResult = () => {
    if (!extractionResult) return null;
    
    return (
      <View style={[
        styles.resultContainer, 
        { 
          backgroundColor: extractionResult.success ? 'rgba(39, 174, 96, 0.1)' : 'rgba(231, 76, 60, 0.1)',
          borderLeftColor: extractionResult.success ? '#27ae60' : '#e74c3c'
        }
      ]}>
        <MaterialCommunityIcons 
          name={extractionResult.success ? "check-circle-outline" : "alert-circle-outline"} 
          size={20} 
          color={extractionResult.success ? '#27ae60' : '#e74c3c'}
          style={styles.resultIcon}
        />
        <Text style={[
          styles.resultText, 
          { 
            color: isDark ? '#ffffff' : '#333333',
            fontWeight: '500'
          }
        ]}>
          {extractionResult.message}
        </Text>
      </View>
    );
  };

  useEffect(() => {
    if (visible) {
      setLoading(true);
      setError(null);
      setUserPrompt('');
      setPromptError(false);
      setIsExtracting(false);
      setExtractionProgress('');
      setExtractedPages([]);
      setPageCount(0);
      setTempFileUris([]);
      setShowGridView(false);
      setExtractedContent('');
      setSelectedPages([]);

      try {
        if (!pdfSource || typeof pdfSource !== 'string') {
          throw new Error('Invalid PDF source');
        }
        
        const loadPdf = async () => {
          try {
            const { extractedPages: pages, tempFileUris: uris, pageCount: count } = 
              await extractPdfPages(pdfSource, setExtractionProgress);
              
            setExtractedPages(pages);
            setTempFileUris(uris);
            setPageCount(count);
            setSelectedPages(pages.map((_, index) => index));
            setLoading(false);
          } catch (err) {
            console.error('Error in loadPdf:', err);
            setError('Failed to load PDF. The file might be corrupted or not accessible.');
            setLoading(false);
          }
        };
        
        loadPdf();
      } catch (err) {
        setLoading(false);
        setError('Failed to load PDF. The file might be corrupted or not accessible.');
        console.error('PDF loading error:', err);
      }
    } else {
      cleanupTempFiles(tempFileUris);
    }
  }, [visible, pdfSource]);
  
  return (
    <>
      <Modal
        visible={visible && !showGridView}
        animationType="slide"
        transparent={false}
        onRequestClose={() => {
          cleanupTempFiles(tempFileUris);
          onClose();
        }}
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
              <TouchableOpacity style={styles.closeButton} onPress={() => {
                cleanupTempFiles(tempFileUris);
                onClose();
              }}>
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
                    {extractionProgress || "Loading PDF..."}
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
                </View>
              ) : (
                <View style={styles.fileContentWrapper}>
                  <View style={styles.pdfContainer}>
                    <PdfRendererView
                      style={styles.pdfView}
                      source={formatPdfPath(pdfSource)}
                      distanceBetweenPages={16}
                      maxZoom={5}
                    />
                  </View>
                  
                  <View style={[styles.uploadButtonContainer, { 
                    backgroundColor: isDark ? '#1a1a1a' : '#ffffff',
                    borderTopColor: isDark ? '#333333' : '#e0e0e0'
                  }]}>
                    {isExtracting ? (
                      <View style={styles.processingContainer}>
                        <ActivityIndicator size="small" color="#660880" />
                        <Text style={[styles.processingText, { color: isDark ? '#ffffff' : '#333333' }]}>
                          {extractionProgress || "Processing..."}
                        </Text>
                        <View style={styles.progressBar}>
                          <View 
                            style={[
                              styles.progressFill, 
                              { width: '100%', backgroundColor: '#660880' }
                            ]} 
                          />
                        </View>
                      </View>
                    ) : (
                      <>
                        {extractionResult ? renderExtractionResult() : (
                          <View style={styles.statusContainer}>
                            <Text style={[styles.statusText, { color: isDark ? '#aaaaaa' : '#666666' }]}>
                              {pageCount > 0 
                                ? `PDF ready: ${extractedPages.length} of ${pageCount} pages are ready to be sent` +
                                  (selectedPages.length > 0 && selectedPages.length < extractedPages.length 
                                    ? ` (${selectedPages.length} pages selected for extraction)`
                                    : '')
                                : 'PDF processing failed. Please try another document.'
                              }
                            </Text>
                          </View>
                        )}
                      </>
                    )}
                    
                    {renderExtractButton()}
                  </View>
                </View>
              )}
            </View>
          </SafeAreaView>
        </KeyboardAvoidingView>
      </Modal>
      
      <PDFGridView 
        visible={showGridView}
        onClose={() => setShowGridView(false)}
        displayFileName={displayFileName}
        isDark={isDark}
        extractedPages={extractedPages}
        selectedPages={selectedPages}
        togglePageSelection={togglePageSelection}
        handleSelectAllPages={handleSelectAllPages}
        userPrompt={userPrompt}
        setUserPrompt={setUserPrompt}
        promptError={promptError}
        setPromptError={setPromptError}
        handleStartOCR={handleStartOCR}
      />
    </>
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
  pdfContainer: {
    flex: 1,
  },
  pdfView: {
    flex: 1,
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
  uploadButtonContainer: {
    width: '100%',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderTopWidth: 1,
  },
  statusContainer: {
    marginBottom: 10,
    paddingVertical: 6,
    paddingHorizontal: 12,
    backgroundColor: 'rgba(102, 8, 128, 0.1)',
    borderRadius: 6,
  },
  statusText: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '500',
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
    minHeight: 80,
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
  processingContainer: {
    marginBottom: 12,
    alignItems: 'center',
    padding: 12,
    backgroundColor: 'rgba(102, 8, 128, 0.1)',
    borderRadius: 8,
  },
  processingText: {
    fontSize: 14,
    marginTop: 8,
    marginBottom: 8,
    fontWeight: '500',
  },
  progressBar: {
    height: 6,
    width: '100%',
    backgroundColor: 'rgba(0, 0, 0, 0.1)',
    borderRadius: 3,
    overflow: 'hidden',
    marginTop: 4,
  },
  progressFill: {
    height: '100%',
    borderRadius: 3,
  },
  resultContainer: {
    marginBottom: 12,
    padding: 12,
    borderRadius: 8,
    borderLeftWidth: 4,
    flexDirection: 'row',
    alignItems: 'center',
  },
  resultIcon: {
    marginRight: 8,
  },
  resultText: {
    fontSize: 14,
    flex: 1,
  }
});