import React, { useState, useEffect } from 'react';
import PDFViewerModal from './PDFViewerModal';
import TextFileViewerModal from './TextFileViewerModal';
import ImageViewerModal from './ImageViewerModal';
import { getFileType, FileType } from '../utils/fileUtils';

type FileViewerModalProps = {
  visible: boolean;
  onClose: () => void;
  filePath: string;
  fileName?: string;
  onUpload?: (content: string, fileName: string, userPrompt: string) => void;
  onImageUpload?: (messageContent: string) => void;
};

export default function FileViewerModal({
  visible,
  onClose,
  filePath,
  fileName,
  onUpload,
  onImageUpload,
}: FileViewerModalProps) {
  const [fileType, setFileType] = useState<FileType>('unknown');
  
  useEffect(() => {
    if (visible && filePath) {
      const name = fileName || filePath.split('/').pop() || '';
      setFileType(getFileType(name));
    }
  }, [visible, filePath, fileName]);

  if (!visible) return null;

  switch (fileType) {
    case 'pdf':
      return (
        <PDFViewerModal
          visible={visible}
          onClose={onClose}
          pdfSource={filePath}
          fileName={fileName}
          onUpload={onUpload}
        />
      );
    case 'image':
      return (
        <ImageViewerModal
          visible={visible}
          onClose={onClose}
          imagePath={filePath}
          fileName={fileName}
          onUpload={onUpload}
          onImageUpload={onImageUpload}
        />
      );
    case 'text':
      return (
        <TextFileViewerModal
          visible={visible}
          onClose={onClose}
          filePath={filePath}
          fileName={fileName}
          onUpload={onUpload}
        />
      );
    case 'unknown':
    default:
      return (
        <TextFileViewerModal
          visible={visible}
          onClose={onClose}
          filePath={filePath}
          fileName={fileName}
          onUpload={onUpload}
        />
      );
  }
} 
