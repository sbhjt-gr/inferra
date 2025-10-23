import React, { createContext, useContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { modelDownloader } from '../services/ModelDownloader';

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
                value.status !== 'failed' &&
                value.status !== 'cancelled') {
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
        console.error('DownloadContext: Error loading saved states:', error);
      }
    };
    
    loadSavedStates();

    const handleDownloadStarted = (data: any) => {
      console.log('DownloadContext: download_started:', data);
      setDownloadProgress(prev => ({
        ...prev,
        [data.modelName]: {
          progress: 0,
          bytesDownloaded: 0,
          totalBytes: 0,
          status: 'downloading',
          downloadId: data.downloadId || 0,
          isPaused: false
        }
      }));
    };

    const handleDownloadCompleted = (data: any) => {
      console.log('DownloadContext: download_completed:', data);
      setDownloadProgress(prev => {
        const newProgress = { ...prev };
        if (newProgress[data.modelName]) {
          newProgress[data.modelName] = {
            ...newProgress[data.modelName],
            progress: 100,
            status: 'completed'
          };
        }
        return newProgress;
      });
    };

    const handleDownloadFailed = (data: any) => {
      console.log('DownloadContext: download_failed:', data);
      setDownloadProgress(prev => {
        const newProgress = { ...prev };
        if (newProgress[data.modelName]) {
          newProgress[data.modelName] = {
            ...newProgress[data.modelName],
            status: 'failed'
          };
        }
        return newProgress;
      });
    };

    const handleDownloadCancelled = (data: any) => {
      setDownloadProgress(prev => {
        const newProgress = { ...prev };
        delete newProgress[data.modelName];
        return newProgress;
      });
    };

    modelDownloader.on('downloadStarted', handleDownloadStarted);
    modelDownloader.on('downloadCompleted', handleDownloadCompleted);
    modelDownloader.on('downloadFailed', handleDownloadFailed);
    modelDownloader.on('downloadCancelled', handleDownloadCancelled);

    return () => {
      modelDownloader.off('downloadStarted', handleDownloadStarted);
      modelDownloader.off('downloadCompleted', handleDownloadCompleted);
      modelDownloader.off('downloadFailed', handleDownloadFailed);
      modelDownloader.off('downloadCancelled', handleDownloadCancelled);
    };
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
