import React, { useState, useEffect } from 'react';
import { Platform } from 'react-native';
import PDFViewerModal from './PDFViewerModal';
import TextFileViewerModal from './TextFileViewerModal';
import { getFileType, FileType } from '../utils/fileUtils';

type FileViewerModalProps = {
  visible: boolean;
  onClose: () => void;
  filePath: string;
  fileName?: string;
  onUpload?: (content: string, fileName: string, userPrompt: string) => void;
};

export default function FileViewerModal({
  visible,
  onClose,
  filePath,
  fileName,
  onUpload,
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
      // Try to open unknown files as text - if they're binary, the text viewer will show an error
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