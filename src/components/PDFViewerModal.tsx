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
  ScrollView,
  Image,
  Alert,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import PdfRendererView from 'react-native-pdf-renderer';
import { useTheme } from '../context/ThemeContext';
import { theme } from '../constants/theme';
import TextRecognition from '@react-native-ml-kit/text-recognition';
import * as FileSystem from 'expo-file-system';
import PdfPageImage from 'react-native-pdf-page-image';

type PageImage = {
  uri: string;
  width: number;
  height: number;
};

type PdfViewerModalProps = {
  visible: boolean;
  onClose: () => void;
  pdfSource: string;
  fileName?: string;
  onUpload?: (pdfPath: string, fileName: string, userPrompt: string, extractedContent?: string) => void;
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
  const [extractedText, setExtractedText] = useState<string>('');
  const [showTextPreview, setShowTextPreview] = useState(false);

  const formatPdfPath = (path: string): string => {
    if (!path) return '';
    
    if (path.startsWith('file://')) {
      return path;
    }
    return Platform.OS === 'ios' ? `file://${path}` : path;
  };
  
  const formatPathForPdfPageImage = (path: string): string => {
    if (!path) return '';
    
    if (Platform.OS === 'android') {
      return path.replace(/^file:\/\//, '');
    }
    
    if (!path.startsWith('file://')) {
      return `file://${path}`;
    }
    
    return path;
  };

  const displayFileName = fileName || pdfSource.split('/').pop() || "Document";

  const copyImageToPersistentStorage = async (imageUri: string): Promise<string> => {
    try {
      const dirInfo = await FileSystem.getInfoAsync(FileSystem.cacheDirectory + 'pdf_images/');
      if (!dirInfo.exists) {
        await FileSystem.makeDirectoryAsync(FileSystem.cacheDirectory + 'pdf_images/', { intermediates: true });
      }
      
      const timestamp = new Date().getTime();
      const random = Math.floor(Math.random() * 100000);
      const newFileName = `pdf_page_${timestamp}_${random}.png`;
      const newUri = FileSystem.cacheDirectory + 'pdf_images/' + newFileName;
      
      console.log(`Copying image from ${imageUri} to ${newUri}`);
      await FileSystem.copyAsync({
        from: imageUri,
        to: newUri
      });
      
      console.log(`Successfully copied image to ${newUri}`);
      return newUri;
    } catch (err) {
      console.error('Error copying image file:', err);
      return imageUri;
    }
  };

  const extractPdfPages = async (pdfPath: string) => {
    try {
      setLoading(true);
      setExtractionProgress('Opening PDF document...');
      
      const formattedPdfPath = formatPathForPdfPageImage(pdfPath);
      console.log('Opening PDF at path:', formattedPdfPath);
      
      let pdfInfo;
      try {
        pdfInfo = await PdfPageImage.open(formattedPdfPath);
        console.log('PDF info retrieved:', JSON.stringify(pdfInfo));
      } catch (err) {
        console.error('Error opening PDF:', err);
        throw new Error('Failed to open PDF document.');
      }
      
      if (!pdfInfo || !pdfInfo.pageCount || pdfInfo.pageCount <= 0) {
        console.error('Invalid PDF page count:', pdfInfo?.pageCount);
        throw new Error('Invalid PDF: The document has no pages or is corrupted.');
      }
      
      setPageCount(pdfInfo.pageCount);
      
      const pagesToProcess = Math.max(0, pdfInfo.pageCount - 1);
      console.log(`Processing PDF with ${pdfInfo.pageCount} reported pages, accessing pages 1-${pagesToProcess}`);
      
      setExtractionProgress(`Extracting ${pagesToProcess} pages as images...`);
      
      let extractedPageImages: PageImage[] = [];
      let copiedImageUris: string[] = [];
      
      if (Platform.OS === 'android') {
        // Android uses one-by-one page extraction to avoid memory issues
        // Important: PdfPageImage uses 1-based indexing for page numbers
        for (let i = 0; i < pagesToProcess; i++) {
          const pageIndex = i + 1; // Convert 0-based index to 1-based for API
          setExtractionProgress(`Extracting page ${pageIndex} of ${pagesToProcess}...`);
          
          if (pageIndex > pagesToProcess) {
            console.warn(`Skipping page ${pageIndex} as it exceeds accessible page count ${pagesToProcess}`);
            continue;
          }
          
          try {
            console.log(`Attempting to extract page ${pageIndex}`);
            const page = await PdfPageImage.generate(formattedPdfPath, pageIndex, 2.0);
            console.log(`Page ${pageIndex} extracted:`, page.uri);
            
            setExtractionProgress(`Saving page ${pageIndex} image...`);
            const persistentUri = await copyImageToPersistentStorage(page.uri);
            copiedImageUris.push(persistentUri);
            
            extractedPageImages.push({
              ...page,
              uri: persistentUri
            });
          } catch (err) {
            console.error(`Error extracting page ${pageIndex}:`, err);
          }
        }
      } else {
        try {
          console.log('Generating all pages at once for iOS');
          const pages = await PdfPageImage.generateAllPages(formattedPdfPath, 2.0);
          
          console.log(`Extracted ${pages.length} pages from iOS bulk extraction`);
          
          if (pages.length !== pagesToProcess) {
            console.warn(`Warning: Expected ${pagesToProcess} pages but got ${pages.length} pages`);
          }
          
          for (let i = 0; i < pages.length; i++) {
            setExtractionProgress(`Saving page ${i+1} of ${pages.length}...`);
            const persistentUri = await copyImageToPersistentStorage(pages[i].uri);
            copiedImageUris.push(persistentUri);
            
            extractedPageImages.push({
              ...pages[i],
              uri: persistentUri
            });
          }
        } catch (err) {
          console.error('Error generating all pages:', err);
        }
      }
      
      try {
        await PdfPageImage.close(formattedPdfPath);
        console.log('PDF closed successfully');
      } catch (err) {
        console.error('Error closing PDF:', err);
      }
      
      if (extractedPageImages.length === 0) {
        console.error('No pages were extracted from the PDF');
        throw new Error('Failed to extract any pages from the PDF.');
      }
      
      console.log(`Successfully extracted ${extractedPageImages.length} pages`);
      setExtractedPages(extractedPageImages);
      setTempFileUris(copiedImageUris);
      setLoading(false);
    } catch (err) {
      console.error('Error extracting PDF pages:', err);
      setError('Failed to extract PDF pages. The file might be corrupted or not accessible.');
      setLoading(false);
    } finally {
      setExtractionProgress('');
    }
  };

  const performOCROnPages = async (pages: PageImage[]): Promise<string> => {
    try {
      setExtractionProgress('Preparing for text recognition...');
      console.log('Starting OCR on', pages.length, 'pages');
      
      if (pages.length === 0) {
        console.error('No pages available for OCR');
        return "No pages were extracted from this PDF file.";
      }
      
      let allText = '';
      
      for (let i = 0; i < pages.length; i++) {
        setExtractionProgress(`Reading text from page ${i+1} of ${pages.length}...`);
        
        let imageUri = pages[i].uri;
        
        try {
          console.log(`OCR - Processing image at: ${imageUri}`);
          
          if (Platform.OS === 'android' && !imageUri.startsWith('file://')) {
            imageUri = `file://${imageUri}`;
          }
          
          const fileInfo = await FileSystem.getInfoAsync(imageUri);
          if (!fileInfo.exists) {
            console.error(`OCR - Image file does not exist: ${imageUri}`);
            allText += `--- Page ${i+1} ---\n[Image file not found]\n\n`;
            continue;
          }
          
          console.log(`OCR - Image exists, size: ${fileInfo.size} bytes`);
          
          setExtractionProgress(`Analyzing text on page ${i+1}...`);
          console.log(`OCR - Starting text recognition for page ${i+1}`);
          
          const recognitionResult = await TextRecognition.recognize(imageUri);
          console.log(`OCR - Recognition completed for page ${i+1}:`, recognitionResult ? 'Success' : 'No result');
          
          if (recognitionResult && recognitionResult.text) {
            console.log(`OCR - Text found on page ${i+1}, length:`, recognitionResult.text.length);
            console.log(`OCR - Sample text:`, recognitionResult.text.substring(0, 100));
            allText += `--- Page ${i+1} ---\n${recognitionResult.text}\n\n`;
          } else {
            console.warn(`OCR - No text detected on page ${i+1}`);
            allText += `--- Page ${i+1} ---\n[No text detected on this page]\n\n`;
          }
        } catch (err) {
          console.error(`OCR - Error recognizing text on page ${i+1}:`, err);
          allText += `--- Page ${i+1} ---\n[Text recognition failed for this page]\n\n`;
        }
      }
      
      console.log(`OCR - All pages processed, total text length:`, allText.length);
      
      if (allText.trim() === '') {
        console.warn('OCR - No text extracted from any page');
        return "No text could be extracted from this PDF. It may contain only images or be scanned at low quality.";
      }
      
      return allText;
    } catch (error) {
      console.error("Error in OCR text recognition:", error);
      return "Failed to perform text recognition on the PDF. Please try again or use a different file.";
    }
  };

  const cleanupTempFiles = async () => {
    try {
      for (const uri of tempFileUris) {
        try {
          const fileInfo = await FileSystem.getInfoAsync(uri);
          if (fileInfo.exists) {
            await FileSystem.deleteAsync(uri, { idempotent: true });
            console.log(`Deleted temp file: ${uri}`);
          }
        } catch (err) {
          console.log(`Error deleting file ${uri}:`, err);
        }
      }
    } catch (err) {
      console.error('Error cleaning up temp files:', err);
    }
  };

  const safeUpload = (pdfPath: string, fileName: string, userPromptText: string, extractedText?: string): boolean => {
    try {
      console.log('Attempting to upload with extracted content');
      
      if (onUpload && typeof onUpload === 'function') {
        console.log('Using onUpload with extracted content');
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
      "Preparing for text recognition...",
      "Processing PDF content...",
      "Analyzing text in document...",
      "Extracting semantic information...",
      "Preparing content for analysis...",
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
      console.log('Starting OCR on', extractedPages.length, 'extracted pages');
      
      setExtractionProgress('Starting text recognition...');
      
      let rawExtractedContent = await performOCROnPages(extractedPages);
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
      
      console.log('Content ready for preview, final text length:', formattedContent.length);
      console.log('Sample content:', formattedContent.substring(0, 100) + '...');
      
      setExtractedText(formattedContent);
      setShowTextPreview(true);
      
      setExtractionResult({
        success: true,
        message: `Successfully extracted ${formattedContent.length} characters of text.`,
        timestamp: Date.now()
      });
    } catch (err) {
      console.error('Error performing OCR on PDF content:', err);
      
      if (progressTimer) clearInterval(progressTimer);
      
      const fallbackExtractedContent = "[PDF content extraction failed. This PDF may contain complex formatting, be scanned, or primarily contain images.]";
      
      console.log('Using fallback content due to error');
      
      setExtractedText(fallbackExtractedContent);
      setShowTextPreview(true);
      
      setExtractionResult({
        success: false,
        message: 'Failed to extract text from the PDF. The file may be corrupted or in an unsupported format.',
        timestamp: Date.now()
      });
    } finally {
      if (progressTimer) clearInterval(progressTimer);
      setIsExtracting(false);
      setExtractionProgress('');
    }
  };

  const handleUpload = () => {
    if (!extractedText) {
      Alert.alert(
        'No Text Available',
        'Please extract text from the PDF first before uploading.',
        [{ text: 'OK' }]
      );
      return;
    }
    
    const uploadSuccess = safeUpload(pdfSource, displayFileName, userPrompt.trim(), extractedText);
    
    if (uploadSuccess) {
      console.log('Upload complete, closing modal');
      onClose();
    } else {
      console.log('Upload not completed, keeping modal open');
    }
  };

  const renderTextPreview = () => {
    if (!showTextPreview || !extractedText) return null;
    
    return (
      <View style={[
        styles.textPreviewContainer, 
        { backgroundColor: isDark ? '#222222' : '#f9f9f9' }
      ]}>
        <View style={styles.textPreviewHeader}>
          <Text style={[styles.textPreviewTitle, { color: isDark ? '#ffffff' : '#333333' }]}>
            Extracted Text Preview
          </Text>
          <TouchableOpacity 
            style={styles.textPreviewCloseButton}
            onPress={() => setShowTextPreview(false)}
          >
            <MaterialCommunityIcons 
              name="close" 
              size={20} 
              color={isDark ? '#ffffff' : '#333333'} 
            />
          </TouchableOpacity>
        </View>
        <ScrollView style={styles.textPreviewContent}>
          <Text style={[styles.textPreviewText, { color: isDark ? '#dddddd' : '#333333' }]}>
            {extractedText}
          </Text>
        </ScrollView>
        <View style={styles.textPreviewActions}>
          <TouchableOpacity
            style={[styles.textPreviewButton, { backgroundColor: isDark ? '#444444' : '#eeeeee' }]}
            onPress={() => setShowTextPreview(false)}
          >
            <Text style={[styles.textPreviewButtonText, { color: isDark ? '#ffffff' : '#333333' }]}>
              Edit Prompt
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.textPreviewButton, { backgroundColor: '#660880' }]}
            onPress={handleUpload}
          >
            <Text style={[styles.textPreviewButtonText, { color: '#ffffff' }]}>
              Send to Chat
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  const renderProcessingIndicator = () => {
    let progressPercent = 10;
    
    if (extractionProgress.includes('Starting')) {
      progressPercent = 10;
    } else if (extractionProgress.includes('Preparing')) {
      progressPercent = 25;
    } else if (extractionProgress.includes('Processing') || extractionProgress.includes('Converting')) {
      progressPercent = 40;
    } else if (extractionProgress.includes('Analyzing') || extractionProgress.includes('Reading')) {
      progressPercent = 60;
    } else if (extractionProgress.includes('Extracting')) {
      progressPercent = 80;
    } else if (extractionProgress.includes('Almost')) {
      progressPercent = 95;
    }
    
    return (
      <View style={styles.processingContainer}>
        <ActivityIndicator size="small" color="#660880" />
        <Text style={[styles.processingText, { color: isDark ? '#ffffff' : '#333333' }]}>
          {extractionProgress || "Processing..."}
        </Text>
        <View style={styles.progressBar}>
        <View 
          style={[
              styles.progressFill, 
              { width: `${progressPercent}%`, backgroundColor: '#660880' }
            ]} 
          />
        </View>
      </View>
    );
  };

  const formatExtractedContent = (extractedText: string): string => {
    if (!extractedText || extractedText.trim().length < 20) {
      return "[No significant text was extracted from this PDF. It may contain primarily images or formatting that couldn't be processed.]";
    }
    
    let formattedText = extractedText;
    
    formattedText = formattedText
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
    
    if (!formattedText.includes('--- Page') && !formattedText.includes('Page')) {
      const lines = formattedText.split('\n');
      const pageSize = Math.ceil(lines.length / 3);
      
      let result = '';
      for (let i = 0; i < Math.min(3, Math.ceil(lines.length / pageSize)); i++) {
        const pageLines = lines.slice(i * pageSize, (i + 1) * pageSize);
        result += `--- Page ${i+1} ---\n${pageLines.join('\n')}\n\n`;
      }
      
      formattedText = result;
    }
    
    return formattedText;
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
        onPress={handleExtractText}
        disabled={isDisabled}
      >
        {isExtracting ? (
          <>
            <ActivityIndicator size="small" color="#ffffff" style={styles.uploadIcon} />
            <Text style={styles.uploadButtonText}>
              {extractionProgress || "Analyzing text..."}
            </Text>
          </>
        ) : (
          <>
            <MaterialCommunityIcons 
              name="text-recognition" 
              size={20} 
              color="#ffffff" 
              style={styles.uploadIcon} 
            />
            <Text style={styles.uploadButtonText}>
              {extractedPages.length > 0 ? "Extract Text" : "PDF preparation failed"}
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

      try {
        if (!pdfSource || typeof pdfSource !== 'string') {
          throw new Error('Invalid PDF source');
        }
        
        extractPdfPages(pdfSource);
      } catch (err) {
        setLoading(false);
        setError('Failed to load PDF. The file might be corrupted or not accessible.');
        console.error('PDF loading error:', err);
      }
    } else {
      cleanupTempFiles();
    }
  }, [visible, pdfSource]);
  
  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={false}
      onRequestClose={() => {
        cleanupTempFiles();
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
              cleanupTempFiles();
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
            ) : showTextPreview ? (
              renderTextPreview()
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
                    renderProcessingIndicator()
                  ) : (
                    <>
                      {extractionResult ? renderExtractionResult() : (
                        <View style={styles.statusContainer}>
                          <Text style={[styles.statusText, { color: isDark ? '#aaaaaa' : '#666666' }]}>
                            {pageCount > 0 
                              ? `PDF ready: ${extractedPages.length} of ${pageCount} pages prepared for text recognition`
                              : 'PDF processing failed. Please try another document.'
                            }
                          </Text>
                        </View>
                      )}
                    </>
                  )}
                  
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
                      placeholder="What would you like to ask about this PDF?"
                      placeholderTextColor={isDark ? '#888888' : '#999999'}
                      value={userPrompt}
                      onChangeText={(text) => {
                        setUserPrompt(text);
                        if (text.trim()) setPromptError(false);
                      }}
                      multiline={true}
                      numberOfLines={3}
                      editable={!isExtracting}
                    />
                    {promptError && (
                      <Text style={styles.errorPromptText}>
                        Please enter a prompt before extracting text
                      </Text>
                    )}
                  </View>
                  
                  {renderExtractButton()}
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
  noteContainer: {
    marginBottom: 10,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: 'rgba(0, 0, 0, 0.05)',
    borderRadius: 6,
    borderLeftWidth: 3,
    borderLeftColor: '#660880',
  },
  noteText: {
    fontSize: 12,
    lineHeight: 16,
    fontStyle: 'italic',
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
  },
  textPreviewContainer: {
    flex: 1,
    borderRadius: 8,
    margin: 8,
    overflow: 'hidden',
  },
  textPreviewHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0, 0, 0, 0.1)',
  },
  textPreviewTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
  textPreviewCloseButton: {
    padding: 4,
  },
  textPreviewContent: {
    flex: 1,
    padding: 16,
  },
  textPreviewText: {
    fontSize: 14,
    lineHeight: 20,
  },
  textPreviewActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0, 0, 0, 0.1)',
  },
  textPreviewButton: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    marginLeft: 12,
  },
  textPreviewButtonText: {
    fontSize: 14,
    fontWeight: '600',
  },
});