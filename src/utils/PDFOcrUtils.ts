import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system';
import PdfPageImage from 'react-native-pdf-page-image';
import TextRecognition from '@subhajit-gorai/react-native-ml-kit-text-recognition';

export type PageImage = {
  uri: string;
  width: number;
  height: number;
};

export type ExtractionProgress = (message: string) => void;

export const formatPdfPath = (path: string): string => {
  if (!path) return '';
  
  if (path.startsWith('file://')) {
    return path;
  }
  return Platform.OS === 'ios' ? `file://${path}` : path;
};

export const formatPathForPdfPageImage = (path: string): string => {
  if (!path) return '';
  
  if (Platform.OS === 'android') {
    return path.replace(/^file:\/\//, '');
  }
  
  if (!path.startsWith('file://')) {
    return `file://${path}`;
  }
  
  return path;
};

export const copyImageToPersistentStorage = async (imageUri: string): Promise<string> => {
  try {
    const dirInfo = await FileSystem.getInfoAsync(FileSystem.cacheDirectory + 'pdf_images/');
    if (!dirInfo.exists) {
      await FileSystem.makeDirectoryAsync(FileSystem.cacheDirectory + 'pdf_images/', { intermediates: true });
    }
    
    const timestamp = new Date().getTime();
    const random = Math.floor(Math.random() * 100000);
    const newFileName = `pdf_page_${timestamp}_${random}.png`;
    const newUri = FileSystem.cacheDirectory + 'pdf_images/' + newFileName;
    
    await FileSystem.copyAsync({
      from: imageUri,
      to: newUri
    });
    
    return newUri;
  } catch (err) {
    return imageUri;
  }
};

export const extractPdfPages = async (
  pdfPath: string, 
  setExtractionProgress: ExtractionProgress
): Promise<{ extractedPages: PageImage[], tempFileUris: string[], pageCount: number }> => {
  try {
    setExtractionProgress('Opening PDF document...');
    
    const formattedPdfPath = formatPathForPdfPageImage(pdfPath);
    
    let pdfInfo;
    try {
      pdfInfo = await PdfPageImage.open(formattedPdfPath);
    } catch (err) {
      throw new Error('Failed to open PDF document.');
    }
    
    if (!pdfInfo || !pdfInfo.pageCount || pdfInfo.pageCount <= 0) {
      throw new Error('Invalid PDF: The document has no pages or is corrupted.');
    }
    
    const pageCount = pdfInfo.pageCount;
    const pagesToProcess = pageCount;
    
    setExtractionProgress(`Extracting ${pagesToProcess} pages as images...`);
    
    let extractedPageImages: PageImage[] = [];
    let copiedImageUris: string[] = [];
    
    if (Platform.OS === 'android') {
      for (let i = 0; i < pagesToProcess; i++) {
        const pageIndex = i;
        setExtractionProgress(`Pre-processing page ${i+1} of ${pagesToProcess} locally...`);
        
        if (pageIndex >= pagesToProcess) {
          continue;
        }
        
        try {
          const page = await PdfPageImage.generate(formattedPdfPath, pageIndex, 2.0);
          
          setExtractionProgress(`Pre-processing page ${i+1} of ${pagesToProcess} locally...`);
          const persistentUri = await copyImageToPersistentStorage(page.uri);
          copiedImageUris.push(persistentUri);
          
          extractedPageImages.push({
            ...page,
            uri: persistentUri
          });
        } catch (err) {
          
          try {
            const alternatePage = await PdfPageImage.generate(formattedPdfPath, i+1, 2.0);
            
            setExtractionProgress(`Saving page with alternate index...`);
            const persistentUri = await copyImageToPersistentStorage(alternatePage.uri);
            copiedImageUris.push(persistentUri);
            
            extractedPageImages.push({
              ...alternatePage,
              uri: persistentUri
            });
          } catch (retryErr) {
          }
        }
      }
    } else {
      try {
        
        if (pagesToProcess === 1) {
          try {
            const pageIndex = 0;
            
            try {
              const page = await PdfPageImage.generate(formattedPdfPath, pageIndex, 2.0);
              
              setExtractionProgress('Processing single page...');
              const persistentUri = await copyImageToPersistentStorage(page.uri);
              copiedImageUris.push(persistentUri);
              
              extractedPageImages.push({
                ...page,
                uri: persistentUri
              });
            } catch (index0Err) {
              
              const page = await PdfPageImage.generate(formattedPdfPath, 1, 2.0);
              
              setExtractionProgress('Processing single page...');
              const persistentUri = await copyImageToPersistentStorage(page.uri);
              copiedImageUris.push(persistentUri);
              
              extractedPageImages.push({
                ...page,
                uri: persistentUri
              });
            }
          } catch (singlePageErr) {
            throw new Error('Failed to extract the single page from PDF.');
          }
        } else {
          try {
            const pages = await PdfPageImage.generateAllPages(formattedPdfPath, 2.0);
            
            
            if (pages.length !== pagesToProcess) {
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
          } catch (bulkErr) {
            
            for (let i = 0; i < pagesToProcess; i++) {
              const pageIndex = i;
              setExtractionProgress(`Extracting page ${i+1} of ${pagesToProcess}...`);
              
              try {
                const page = await PdfPageImage.generate(formattedPdfPath, pageIndex, 2.0);
                
                setExtractionProgress(`Saving page ${i+1} image...`);
                const persistentUri = await copyImageToPersistentStorage(page.uri);
                copiedImageUris.push(persistentUri);
                
                extractedPageImages.push({
                  ...page,
                  uri: persistentUri
                });
              } catch (pageErr) {
              }
            }
          }
        }
      } catch (err) {
      }
    }
    
    try {
      await PdfPageImage.close(formattedPdfPath);
    } catch (err) {
    }
    
    if (extractedPageImages.length === 0) {
      throw new Error('Failed to extract any pages from the PDF.');
    }
    
    
    return {
      extractedPages: extractedPageImages,
      tempFileUris: copiedImageUris,
      pageCount
    };
  } catch (err) {
    throw new Error('Failed to extract PDF pages. The file might be corrupted or not accessible.');
  }
};

export const performOCROnPages = async (
  pages: PageImage[],
  selectedPages: number[],
  allPages: PageImage[],
  setExtractionProgress: ExtractionProgress
): Promise<string> => {
  try {
    setExtractionProgress('Processing PDF...');
    
    if (pages.length === 0) {
      return "No pages were extracted from this PDF file.";
    }
    
    let allText = '';
    
    const selectedIndices = selectedPages.length > 0 
      ? selectedPages.sort((a, b) => a - b)
      : allPages.map((_, i) => i);
    
    for (let i = 0; i < pages.length; i++) {
      const actualPageNumber = selectedIndices[i] + 1;
      
      setExtractionProgress(`Reading text from page ${actualPageNumber}...`);
      
      let imageUri = pages[i].uri;
      
      try {
        
        if (Platform.OS === 'android' && !imageUri.startsWith('file://')) {
          imageUri = `file://${imageUri}`;
        }
        
        const fileInfo = await FileSystem.getInfoAsync(imageUri);
        if (!fileInfo.exists) {
          allText += `--- Page ${actualPageNumber} ---\n[Image file not found]\n\n`;
          continue;
        }
        
        
        setExtractionProgress(`Processing page ${actualPageNumber}...`);
        
        const recognitionResult = await TextRecognition.recognize(imageUri);
        
        if (recognitionResult && recognitionResult.text) {
          allText += `--- Page ${actualPageNumber} ---\n${recognitionResult.text}\n\n`;
        } else {
          allText += `--- Page ${actualPageNumber} ---\n[No text detected on this page]\n\n`;
        }
      } catch (err) {
        allText += `--- Page ${actualPageNumber} ---\n[Text recognition failed for this page]\n\n`;
      }
    }
    
    
    if (allText.trim() === '') {
      return "No text could be extracted from this PDF. It may contain only images or be scanned at low quality.";
    }
    
    return allText;
  } catch (error) {
    return "Failed to perform text recognition on the PDF. Please try again or use a different file.";
  }
};

export const cleanupTempFiles = async (tempFileUris: string[]): Promise<void> => {
  try {
    for (const uri of tempFileUris) {
      try {
        const fileInfo = await FileSystem.getInfoAsync(uri);
        if (fileInfo.exists) {
          await FileSystem.deleteAsync(uri, { idempotent: true });
        }
      } catch (err) {
      }
    }
  } catch (err) {
  }
};

export const formatExtractedContent = (extractedText: string): string => {
  if (!extractedText || extractedText.trim().length < 20) {
    return "[No significant content was found in this PDF. It may contain only images or formatting that can't be processed.]";
  }
  
  let formattedText = extractedText;
  
  formattedText = formattedText
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  
  if (!formattedText.includes('--- Page') && !formattedText.includes('Page')) {
    const lines = formattedText.split('\n');
    
    const numPages = lines.length < 3 ? lines.length : 3;
    const pageSize = numPages > 0 ? Math.ceil(lines.length / numPages) : 1;
    
    let result = '';
    for (let i = 0; i < numPages; i++) {
      const startIndex = i * pageSize;
      const endIndex = Math.min((i + 1) * pageSize, lines.length);
      const pageLines = lines.slice(startIndex, endIndex);
      
      if (pageLines.length > 0) {
        result += `--- Page ${i+1} ---\n${pageLines.join('\n')}\n\n`;
      }
    }
    
    formattedText = result || formattedText;
  }
  
  return formattedText;
}; 
