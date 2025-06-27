import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system';
import TextRecognition from '@react-native-ml-kit/text-recognition';

export type ImageProcessingMode = 'ocr' | 'multimodal' | null;

export interface ProcessingProgress {
  onProgress: (message: string) => void;
}

export const performOCROnImage = async (
  imageUri: string,
  onProgress?: (message: string) => void
): Promise<string> => {
  try {
    onProgress?.('Initializing text recognition...');
    
    if (!imageUri) {
      throw new Error('No image provided for OCR processing');
    }

    let processedImageUri = imageUri;
    
    if (Platform.OS === 'android' && !imageUri.startsWith('file://')) {
      processedImageUri = `file://${imageUri}`;
    }
    
    onProgress?.('Checking image accessibility...');
    const fileInfo = await FileSystem.getInfoAsync(processedImageUri);
    if (!fileInfo.exists) {
      throw new Error('Image file not found or inaccessible');
    }
    
    onProgress?.('Performing text recognition...');
    const recognitionResult = await TextRecognition.recognize(processedImageUri);
    
    if (recognitionResult && recognitionResult.text && recognitionResult.text.trim()) {
      onProgress?.('Text extraction completed successfully');
      return recognitionResult.text.trim();
    } else {
      return "No text was detected in this image. The image may not contain readable text or the text quality might be too low for recognition.";
    }
  } catch (error) {
    console.error('OCR Error:', error);
    if (error instanceof Error) {
      return `Text recognition failed: ${error.message}`;
    }
    return "Failed to perform text recognition on the image. Please try again or ensure the image contains clear, readable text.";
  }
};

export const formatExtractedImageText = (extractedText: string, fileName?: string): string => {
  if (!extractedText || extractedText.trim().length === 0) {
    return "[No text content was found in this image.]";
  }
  
  let formattedText = extractedText;
  
  formattedText = formattedText
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  
  const header = fileName ? `--- Text from ${fileName} ---\n` : '--- Extracted Text ---\n';
  
  return `${header}${formattedText}`;
};

export const createOCRMessage = (extractedText: string, imageUri: string, fileName?: string, userPrompt?: string): string => {
  const formattedText = formatExtractedImageText(extractedText, fileName);
  
  const messageObject = {
    type: 'ocr_result',
    extractedText: formattedText,
    userPrompt: userPrompt || 'Please process this extracted text',
    imageUri: imageUri,
    fileName: fileName,
    internalInstruction: `You are processing text that was extracted from an image${fileName ? ` named: ${fileName}` : ''}. Here is the extracted text:\n\n${formattedText}\n\nPlease respond to the user's request about this text.`
  };
  
  return JSON.stringify(messageObject);
};

export const createMultimodalMessage = (imageUri: string, userPrompt: string): string => {
  const messageObject = {
    type: 'multimodal',
    content: [
      {
        type: 'image',
        uri: imageUri
      },
      {
        type: 'text',
        text: userPrompt
      }
    ]
  };
  
  return JSON.stringify(messageObject);
}; 