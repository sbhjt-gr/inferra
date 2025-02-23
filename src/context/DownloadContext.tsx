import React, { createContext, useContext, useState, useEffect } from 'react';
import { modelDownloader, DownloadProgress } from '../services/ModelDownloader';

interface DownloadContextType {
  downloadProgress: DownloadProgress;
  setDownloadProgress: React.Dispatch<React.SetStateAction<DownloadProgress>>;
  activeDownloadsCount: number;
}

const DownloadContext = createContext<DownloadContextType | undefined>(undefined);

export function DownloadProvider({ children }: { children: React.ReactNode }) {
  const [downloadProgress, setDownloadProgress] = useState<DownloadProgress>({});
  const activeDownloadsCount = Object.keys(downloadProgress).length;

  useEffect(() => {
    const handleProgress = ({ modelName, ...progress }) => {
      const filename = modelName.split('/').pop() || modelName;
      
      setDownloadProgress(prev => {
        const newProgress = { ...prev };
        
        if (progress.status === 'completed' || progress.status === 'failed') {
          delete newProgress[filename];
        } else {
          newProgress[filename] = {
            progress: progress.progress,
            bytesDownloaded: progress.bytesDownloaded,
            totalBytes: progress.totalBytes,
            status: progress.status,
            downloadId: progress.downloadId
          };
        }
        
        return newProgress;
      });
    };

    modelDownloader.on('downloadProgress', handleProgress);
    return () => {
      modelDownloader.removeListener('downloadProgress', handleProgress);
    };
  }, []);

  return (
    <DownloadContext.Provider value={{ 
      downloadProgress, 
      setDownloadProgress,
      activeDownloadsCount 
    }}>
      {children}
    </DownloadContext.Provider>
  );
}

export function useDownloads() {
  const context = useContext(DownloadContext);
  if (context === undefined) {
    throw new Error('useDownloads must be used within a DownloadProvider');
  }
  return context;
} 