import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system';
import * as ImageManipulator from 'expo-image-manipulator';
import { getFirestoreInstance } from './FirebaseInstances';
import { 
  collection, 
  addDoc
} from '@react-native-firebase/firestore';

interface ReportData {
  messageContent: string;
  provider: string;
  modelName?: string
  category: string;
  description: string;
  email: string;
  userId?: string | null;
  timestamp: string;
  appVersion: string;
  platform: string;
  attachments?: {
    uri: string;
    type: 'image';
    fileName: string;
    fileSize: number;
  }[];
}

interface FirebaseAttachment {
  fileName: string;
  fileSize: number;
  fileType: string;
  type: 'image';
  url: string; // Contains the full data:image/jpeg;base64,... URL
  uploadedAt: string;
}

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB maximum input size
const TARGET_FILE_SIZE = 800 * 1024; // 800KB target after compression
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];

const getFileType = (fileName: string): string => {
  const extension = fileName.toLowerCase().split('.').pop();
  
  switch (extension) {
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg';
    case 'png':
      return 'image/png';
    case 'gif':
      return 'image/gif';
    case 'webp':
      return 'image/webp';
    default:
      return 'image/jpeg';
  }
};

const validateFile = (fileSize: number, fileType: string): void => {
  if (fileSize > MAX_FILE_SIZE) {
    const sizeMB = (fileSize / (1024 * 1024)).toFixed(1);
    throw new Error(`File size (${sizeMB}MB) exceeds the 5MB limit`);
  }

  if (!ALLOWED_IMAGE_TYPES.includes(fileType)) {
    throw new Error(`File type ${fileType} is not allowed. Only images are supported.`);
  }
};

const compressImage = async (uri: string): Promise<{ uri: string; base64: string; size: number }> => {
  try {
    const originalInfo = await FileSystem.getInfoAsync(uri);
    if (!originalInfo.exists) {
      throw new Error('File does not exist');
    }
    
    let quality = 0.8;
    let compressedResult;
    let attempts = 0;
    const maxAttempts = 5;
    
    do {
      attempts++;
      
      compressedResult = await ImageManipulator.manipulateAsync(
        uri,
        [{ resize: { width: 1920 } }],
        {
          compress: quality,
          format: ImageManipulator.SaveFormat.JPEG,
          base64: true,
        }
      );
      
      const compressedSize = compressedResult.base64?.length || 0;
      const estimatedFileSize = (compressedSize * 3) / 4;
      
      if (estimatedFileSize <= TARGET_FILE_SIZE || quality <= 0.1 || attempts >= maxAttempts) {
        break;
      }
      
      quality -= 0.15;
    } while (true);
    
    if (!compressedResult.base64) {
      throw new Error('Failed to generate base64 data');
    }
    
    const finalSize = (compressedResult.base64.length * 3) / 4;
    
    return {
      uri: compressedResult.uri,
      base64: compressedResult.base64,
      size: finalSize
    };
  } catch (error) {
    throw new Error('Failed to compress image');
  }
};

const convertFileToBase64 = async (uri: string): Promise<string> => {
  try {
    const base64String = await FileSystem.readAsStringAsync(uri, {
      encoding: FileSystem.EncodingType.Base64,
    });
    return base64String;
  } catch (error) {
    throw new Error('Failed to convert file to base64');
  }
};

const processImageAttachment = async (
  uri: string, 
  fileName: string
): Promise<{ url: string; base64Data: string; finalSize: number }> => {
  try {
    const compressed = await compressImage(uri);
    const base64WithPrefix = `data:image/jpeg;base64,${compressed.base64}`;
    
    return {
      url: base64WithPrefix,
      base64Data: base64WithPrefix,
      finalSize: compressed.size
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    throw new Error(`Failed to process image: ${fileName} - ${errorMessage}`);
  }
};

export const submitReport = async (reportData: ReportData): Promise<void> => {
  try {
    const firestore = getFirestoreInstance();
    
    const processedAttachments: FirebaseAttachment[] = [];
    
    if (reportData.attachments && reportData.attachments.length > 0) {
      for (const attachment of reportData.attachments) {
        const fileType = getFileType(attachment.fileName);
        validateFile(attachment.fileSize, fileType);
        
        const { url, base64Data, finalSize } = await processImageAttachment(
          attachment.uri,
          attachment.fileName
        );
        
        const processedAttachment: FirebaseAttachment = {
          fileName: attachment.fileName || 'unknown.jpg',
          fileSize: Math.round(finalSize),
          fileType: 'image/jpeg',
          type: 'image',
          url,
          uploadedAt: new Date().toISOString()
        };
        
        processedAttachments.push(processedAttachment);
      }
    }
    
    const reportDocument: any = {
      messageContent: String(reportData.messageContent),
      provider: String(reportData.provider),
      category: String(reportData.category),
      email: String(reportData.email),
      submittedAt: new Date().toISOString(),
      status: 'pending',
      description: String(reportData.description || ''),
      modelName: reportData.modelName ? String(reportData.modelName) : '',
      userId: reportData.userId ? String(reportData.userId) : '',
      appVersion: String(reportData.appVersion || ''),
      platform: String(reportData.platform || Platform.OS),
      timestamp: String(reportData.timestamp || new Date().toISOString()),
      attachmentCount: processedAttachments.length,
      hasAttachments: processedAttachments.length > 0,
      source: 'mobile-app',
      clientVersion: '1.0'
    };
    
    if (processedAttachments.length > 0) {
      reportDocument.attachments = processedAttachments;
    }

    await addDoc(collection(firestore, 'reports'), reportDocument);
  } catch (error: any) {
    const errorMessage = error instanceof Error ? error.message : 'Failed to submit report';
    throw new Error(errorMessage);
  }
};


