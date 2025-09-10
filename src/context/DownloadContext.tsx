import React, { createContext, useContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface DownloadProgress {
  [key: string]: {
    progress: number;
    bytesDownloaded: number;
    totalBytes: number;
    status: string;
    downloadId: number;
    isPaused?: boolean;
  };
}

interface DownloadContextType {
  downloadProgress: DownloadProgress;
  setDownloadProgress: React.Dispatch<React.SetStateAction<DownloadProgress>>;
}

const DownloadContext = createContext<DownloadContextType | undefined>(undefined);

export const DownloadProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [downloadProgress, setDownloadProgress] = useState<DownloadProgress>({});

  useEffect(() => {
    const loadSavedStates = async () => {
      try {
        const savedProgress = await AsyncStorage.getItem('download_progress');
        if (savedProgress) {
          const parsedProgress = JSON.parse(savedProgress);
          
          const filteredProgress = Object.entries(parsedProgress).reduce((acc, [key, value]) => {
            if (value && typeof value === 'object' && 
                'status' in value && 
                value.status !== 'completed' && 
                value.status !== 'failed') {
              acc[key] = value as {
                progress: number;
                bytesDownloaded: number;
                totalBytes: number;
                status: string;
                downloadId: number;
                isPaused?: boolean;
              };
            }
            return acc;
          }, {} as DownloadProgress);
          
          setDownloadProgress(filteredProgress);
        }
      } catch (error) {
      }
    };
    loadSavedStates();
  }, []);

  useEffect(() => {
    const saveStates = async () => {
      try {
        if (Object.keys(downloadProgress).length > 0) {
          await AsyncStorage.setItem('download_progress', JSON.stringify(downloadProgress));
        } else {
          await AsyncStorage.removeItem('download_progress');
        }
      } catch (error) {
      }
    };
    saveStates();
  }, [downloadProgress]);

  return (
    <DownloadContext.Provider value={{ downloadProgress, setDownloadProgress }}>
      {children}
    </DownloadContext.Provider>
  );
};

export const useDownloads = () => {
  const context = useContext(DownloadContext);
  if (context === undefined) {
    throw new Error('useDownloads must be used within a DownloadProvider');
  }
  return context;
}; 
