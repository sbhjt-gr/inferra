import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system';
import PdfPageImage from 'react-native-pdf-page-image';
import TextRecognition from '@react-native-ml-kit/text-recognition';

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

export const extractPdfPages = async (
  pdfPath: string, 
  setExtractionProgress: ExtractionProgress
): Promise<{ extractedPages: PageImage[], tempFileUris: string[], pageCount: number }> => {
  try {
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
    
    const pageCount = pdfInfo.pageCount;
    const pagesToProcess = pageCount;
    console.log(`Processing PDF with ${pageCount} reported pages, accessing pages 1-${pagesToProcess}`);
    
    setExtractionProgress(`Extracting ${pagesToProcess} pages as images...`);
    
    let extractedPageImages: PageImage[] = [];
    let copiedImageUris: string[] = [];
    
    if (Platform.OS === 'android') {
      for (let i = 0; i < pagesToProcess; i++) {
        const pageIndex = i;
        setExtractionProgress(`Pre-processing page ${i+1} of ${pagesToProcess} locally...`);
        
        if (pageIndex >= pagesToProcess) {
          console.warn(`Skipping page ${pageIndex} as it exceeds accessible page count ${pagesToProcess}`);
          continue;
        }
        
        try {
          console.log(`Attempting to extract page ${i+1} (index ${pageIndex})`);
          const page = await PdfPageImage.generate(formattedPdfPath, pageIndex, 2.0);
          console.log(`Page ${i+1} extracted:`, page.uri);
          
          setExtractionProgress(`Saving page ${i+1} image...`);
          const persistentUri = await copyImageToPersistentStorage(page.uri);
          copiedImageUris.push(persistentUri);
          
          extractedPageImages.push({
            ...page,
            uri: persistentUri
          });
        } catch (err) {
          console.error(`Error extracting page ${i+1} (index ${pageIndex}):`, err);
          
          try {
            console.log(`Retry with 1-based index (${i+1})`);
            const alternatePage = await PdfPageImage.generate(formattedPdfPath, i+1, 2.0);
            console.log(`Page extracted with alternate index:`, alternatePage.uri);
            
            setExtractionProgress(`Saving page with alternate index...`);
            const persistentUri = await copyImageToPersistentStorage(alternatePage.uri);
            copiedImageUris.push(persistentUri);
            
            extractedPageImages.push({
              ...alternatePage,
              uri: persistentUri
            });
          } catch (retryErr) {
            console.error(`Error on retry:`, retryErr);
          }
        }
      }
    } else {
      try {
        console.log('Generating all pages at once for iOS');
        
        if (pagesToProcess === 1) {
          console.log('Single page PDF detected, using direct page generation');
          try {
            const pageIndex = 0;
            console.log(`Trying to extract with page index ${pageIndex}`);
            
            try {
              const page = await PdfPageImage.generate(formattedPdfPath, pageIndex, 2.0);
              console.log('Single page extraction successful with index 0:', page.uri);
              
              setExtractionProgress('Saving single page image...');
              const persistentUri = await copyImageToPersistentStorage(page.uri);
              copiedImageUris.push(persistentUri);
              
              extractedPageImages.push({
                ...page,
                uri: persistentUri
              });
            } catch (index0Err) {
              console.error('Error extracting with index 0, trying index 1:', index0Err);
              
              const page = await PdfPageImage.generate(formattedPdfPath, 1, 2.0);
              console.log('Single page extraction successful with index 1:', page.uri);
              
              setExtractionProgress('Saving single page image...');
              const persistentUri = await copyImageToPersistentStorage(page.uri);
              copiedImageUris.push(persistentUri);
              
              extractedPageImages.push({
                ...page,
                uri: persistentUri
              });
            }
          } catch (singlePageErr) {
            console.error('Error extracting single page after retry:', singlePageErr);
            throw new Error('Failed to extract the single page from PDF.');
          }
        } else {
          try {
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
          } catch (bulkErr) {
            console.error('Bulk extraction failed, falling back to page-by-page:', bulkErr);
            
            for (let i = 0; i < pagesToProcess; i++) {
              const pageIndex = i;
              setExtractionProgress(`Extracting page ${i+1} of ${pagesToProcess}...`);
              
              try {
                console.log(`Attempting to extract page ${i+1} with index ${pageIndex}`);
                const page = await PdfPageImage.generate(formattedPdfPath, pageIndex, 2.0);
                console.log(`Page ${i+1} extracted:`, page.uri);
                
                setExtractionProgress(`Saving page ${i+1} image...`);
                const persistentUri = await copyImageToPersistentStorage(page.uri);
                copiedImageUris.push(persistentUri);
                
                extractedPageImages.push({
                  ...page,
                  uri: persistentUri
                });
              } catch (pageErr) {
                console.error(`Error extracting page ${i+1}:`, pageErr);
              }
            }
          }
        }
      } catch (err) {
        console.error('Error generating pages:', err);
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
    
    return {
      extractedPages: extractedPageImages,
      tempFileUris: copiedImageUris,
      pageCount
    };
  } catch (err) {
    console.error('Error extracting PDF pages:', err);
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
    setExtractionProgress('Preparing for text recognition...');
    console.log('Starting OCR on', pages.length, 'pages');
    
    if (pages.length === 0) {
      console.error('No pages available for OCR');
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
        console.log(`OCR - Processing image at: ${imageUri}`);
        
        if (Platform.OS === 'android' && !imageUri.startsWith('file://')) {
          imageUri = `file://${imageUri}`;
        }
        
        const fileInfo = await FileSystem.getInfoAsync(imageUri);
        if (!fileInfo.exists) {
          console.error(`OCR - Image file does not exist: ${imageUri}`);
          allText += `--- Page ${actualPageNumber} ---\n[Image file not found]\n\n`;
          continue;
        }
        
        console.log(`OCR - Image exists, size: ${fileInfo.size} bytes`);
        
        setExtractionProgress(`Analyzing text on page ${actualPageNumber}...`);
        console.log(`OCR - Starting text recognition for page ${actualPageNumber}`);
        
        const recognitionResult = await TextRecognition.recognize(imageUri);
        console.log(`OCR - Recognition completed for page ${actualPageNumber}:`, recognitionResult ? 'Success' : 'No result');
        
        if (recognitionResult && recognitionResult.text) {
          console.log(`OCR - Text found on page ${actualPageNumber}, length:`, recognitionResult.text.length);
          console.log(`OCR - Sample text:`, recognitionResult.text.substring(0, 100));
          allText += `--- Page ${actualPageNumber} ---\n${recognitionResult.text}\n\n`;
        } else {
          console.warn(`OCR - No text detected on page ${actualPageNumber}`);
          allText += `--- Page ${actualPageNumber} ---\n[No text detected on this page]\n\n`;
        }
      } catch (err) {
        console.error(`OCR - Error recognizing text on page ${actualPageNumber}:`, err);
        allText += `--- Page ${actualPageNumber} ---\n[Text recognition failed for this page]\n\n`;
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

export const cleanupTempFiles = async (tempFileUris: string[]): Promise<void> => {
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

export const formatExtractedContent = (extractedText: string): string => {
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