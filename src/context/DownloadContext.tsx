import React, { createContext, useContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface DownloadState {
  progress: number;
  bytesDownloaded: number;
  totalBytes: number;
  status: 'queued' | 'downloading' | 'paused' | 'completed' | 'failed';
  downloadId: number;
  isPaused?: boolean;
  error?: string;
  lastUpdated: number;
}

interface DownloadProgress {
  [key: string]: DownloadState;
}

interface DownloadContextType {
  downloadProgress: DownloadProgress;
  updateDownload: (modelName: string, update: Partial<DownloadState>) => void;
  removeDownload: (modelName: string) => void;
  setDownloadProgress: React.Dispatch<React.SetStateAction<DownloadProgress>>;
}

const DownloadContext = createContext<DownloadContextType | undefined>(undefined);

export function DownloadProvider({ children }: { children: React.ReactNode }) {
  const [downloadProgress, setDownloadProgress] = useState<DownloadProgress>({});

  // Load saved download states
  useEffect(() => {
    const loadSavedDownloads = async () => {
      try {
        const savedStates = await AsyncStorage.getItem('active_downloads');
        if (savedStates) {
          const parsedStates = JSON.parse(savedStates);
          
          // Filter out completed or failed downloads and reset timestamps
          const activeStates = Object.entries(parsedStates).reduce((acc, [name, state]) => {
            const downloadState = state as DownloadState;
            if (downloadState.status !== 'completed' && downloadState.status !== 'failed') {
              acc[name] = {
                ...downloadState,
                lastUpdated: Date.now() // Reset timestamp on load
              };
            }
            return acc;
          }, {} as DownloadProgress);
          
          setDownloadProgress(activeStates);
        }
      } catch (error) {
        console.error('Error loading saved download states:', error);
      }
    };
    
    loadSavedDownloads();
  }, []);

  // Save current download progress whenever it changes
  useEffect(() => {
    const saveDownloadProgress = async () => {
      try {
        await AsyncStorage.setItem('active_downloads', JSON.stringify(downloadProgress));
      } catch (error) {
        console.error('Error saving download progress:', error);
      }
    };
    
    saveDownloadProgress();
  }, [downloadProgress]);

  const updateDownload = (modelName: string, update: Partial<DownloadState>) => {
    setDownloadProgress(prev => {
      const current = prev[modelName];
      
      // If no current state exists, only create new entry if we have required fields
      if (!current) {
        if (!update.downloadId || update.status === undefined) {
          return prev;
        }
        return {
          ...prev,
          [modelName]: {
            progress: 0,
            bytesDownloaded: 0,
            totalBytes: 0,
            status: update.status,
            downloadId: update.downloadId,
            lastUpdated: Date.now(),
            ...update
          }
        };
      }
      
      // For existing downloads, only update if the new state is newer
      if (update.lastUpdated && update.lastUpdated <= current.lastUpdated) {
        return prev;
      }
      
      // Special handling for pause state
      if (update.status === 'downloading' && current.isPaused) {
        // Preserve pause state unless explicitly changed
        if (update.isPaused === undefined) {
          update.status = 'paused';
          update.isPaused = true;
        }
      }
      
      return {
        ...prev,
        [modelName]: {
          ...current,
          ...update,
          lastUpdated: update.lastUpdated || Date.now()
        }
      };
    });
  };

  const removeDownload = (modelName: string) => {
    setDownloadProgress(prev => {
      const newProgress = { ...prev };
      delete newProgress[modelName];
      return newProgress;
    });
  };

  return (
    <DownloadContext.Provider value={{
      downloadProgress,
      updateDownload,
      removeDownload,
      setDownloadProgress
    }}>
      {children}
    </DownloadContext.Provider>
  );
}

export function useDownloads() {
  const context = useContext(DownloadContext);
  if (!context) {
    throw new Error('useDownloads must be used within a DownloadProvider');
  }
  return context;
} 