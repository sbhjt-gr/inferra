import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Platform,
  Alert,
  AppState,
  AppStateStatus
} from 'react-native';
import { useTheme } from '../context/ThemeContext';
import { theme } from '../constants/theme';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../types/navigation';
import { modelDownloader } from '../services/ModelDownloader';
import { useDownloads } from '../context/DownloadContext';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { DownloadProgress } from '../services/ModelDownloader';
import type { DownloadTask } from '@kesha-antonov/react-native-background-downloader';
import * as FileSystem from 'expo-file-system';

const formatBytes = (bytes: number) => {
  if (bytes === undefined || bytes === null || isNaN(bytes) || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
};

interface DownloadItem {
  id: number;
  name: string;
  progress: number;
  bytesDownloaded: number;
  totalBytes: number;
  status: string;
}

interface DownloadState {
  downloadId: number;
  status: string;
  modelName: string;
}

interface StoredDownloadProgress {
  downloadId: number;
  progress: number;
  bytesDownloaded: number;
  totalBytes: number;
  status: string;
}

interface DownloadTaskInfo {
  task: DownloadTask;
  downloadId: number;
  modelName: string;
  progress?: number;
  bytesDownloaded?: number;
  totalBytes?: number;
  destination?: string;
  url?: string;
}

export default function DownloadsScreen() {
  const { theme: currentTheme } = useTheme();
  const themeColors = theme[currentTheme as 'light' | 'dark'];
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { downloadProgress, setDownloadProgress } = useDownloads();
  const buttonProcessingRef = useRef<Set<string>>(new Set());

  // Convert downloadProgress object to array for FlatList and filter out completed downloads
  const downloads: DownloadItem[] = Object.entries(downloadProgress)
    .filter(([_, data]) => {
      // Filter out completed, failed, or 100% progress downloads
      return data.status !== 'completed' && 
             data.status !== 'failed' && 
             data.progress < 100;
    })
    .map(([name, data]) => ({
      id: data.downloadId || 0,  // Ensure id is never undefined
      name,
      progress: data.progress || 0,
      bytesDownloaded: data.bytesDownloaded || 0,
      totalBytes: data.totalBytes || 0,
      status: data.status || 'unknown'
    }));

  // Load saved state on mount
  useEffect(() => {
    const handleAppStateChange = async (nextAppState: AppStateStatus) => {
      if (nextAppState === 'active') {
        // Reload download states when app comes to foreground
        await loadSavedDownloadStates();
      }
    };

    // Subscribe to app state changes
    const subscription = AppState.addEventListener('change', handleAppStateChange);

    // Initial load
    loadSavedDownloadStates();

    return () => {
      subscription.remove();
    };
  }, []);

  // Update the loadSavedDownloadStates function
  const loadSavedDownloadStates = async () => {
    try {
      console.log('[DownloadsScreen] Loading saved download states...');
      
      // Load saved download states from AsyncStorage
      const savedStates = await AsyncStorage.getItem('active_downloads');
      if (savedStates) {
        const parsedStates = JSON.parse(savedStates);
        
        // Check each download state
        for (const [modelName, state] of Object.entries(parsedStates)) {
          const downloadState = state as DownloadState;
          
          // Check if the model exists in the models directory
          const modelPath = `${FileSystem.documentDirectory}models/${modelName}`;
          let fileSize = 0;
          try {
            const fileInfo = await FileSystem.getInfoAsync(modelPath, { size: true });
            if (fileInfo.exists) {
              fileSize = (fileInfo as any).size || 0;
            }
          } catch (error) {
            console.error(`[DownloadsScreen] Error getting file size for ${modelName}:`, error);
          }
          
          if (fileSize > 0) {
            // Model exists, mark as completed
            console.log(`[DownloadsScreen] Found completed model: ${modelName}`);
            
            // Update download progress
            setDownloadProgress(prev => ({
              ...prev,
              [modelName]: {
                progress: 100,
                bytesDownloaded: fileSize,
                totalBytes: fileSize,
                status: 'completed',
                downloadId: downloadState.downloadId
              }
            }));
            
            // Remove from active downloads
            const updatedStates = { ...parsedStates };
            delete updatedStates[modelName];
            await AsyncStorage.setItem('active_downloads', JSON.stringify(updatedStates));
          } else {
            // Check temp directory
            const tempPath = `${FileSystem.documentDirectory}temp/${modelName}`;
            const tempInfo = await FileSystem.getInfoAsync(tempPath);
            
            if (tempInfo.exists) {
              // Temp file exists, try to move it
              try {
                const destPath = `${FileSystem.documentDirectory}models/${modelName}`;
                await FileSystem.makeDirectoryAsync(
                  `${FileSystem.documentDirectory}models`, 
                  { intermediates: true }
                ).catch(() => {});
                
                await FileSystem.moveAsync({
                  from: tempPath,
                  to: destPath
                });
                
                console.log(`[DownloadsScreen] Moved completed download: ${modelName}`);
                
                // Get file size safely
                let fileSize = 0;
                try {
                  const fileInfo = await FileSystem.getInfoAsync(destPath, { size: true });
                  if (fileInfo.exists) {
                    fileSize = (fileInfo as any).size || 0;
                  }
                } catch (error) {
                  console.error(`[DownloadsScreen] Error getting file size for ${modelName}:`, error);
                }
                
                // Update download progress
                setDownloadProgress(prev => ({
                  ...prev,
                  [modelName]: {
                    progress: 100,
                    bytesDownloaded: fileSize,
                    totalBytes: fileSize,
                    status: 'completed',
                    downloadId: downloadState.downloadId
                  }
                }));
                
                // Remove from active downloads
                const updatedStates = { ...parsedStates };
                delete updatedStates[modelName];
                await AsyncStorage.setItem('active_downloads', JSON.stringify(updatedStates));
              } catch (error) {
                console.error(`[DownloadsScreen] Error moving temp file for ${modelName}:`, error);
              }
            } else {
              // Add to download progress if not already there
              if (!downloadProgress[modelName]) {
                setDownloadProgress(prev => ({
                  ...prev,
                  [modelName]: {
                    progress: 0,
                    bytesDownloaded: 0,
                    totalBytes: 0,
                    status: downloadState.status || 'unknown',
                    downloadId: downloadState.downloadId
                  }
                }));
              }
            }
          }
        }
      }
    } catch (error) {
      console.error('[DownloadsScreen] Error loading saved download states:', error);
    }
  };

  // Add this effect to load saved state on mount
  useEffect(() => {
    loadSavedDownloadStates();
  }, []);

  // Add this effect to save state whenever it changes
  useEffect(() => {
    const saveDownloadProgress = async () => {
      try {
        if (Object.keys(downloadProgress).length > 0) {
          await AsyncStorage.setItem('download_progress', JSON.stringify(downloadProgress));
        } else {
          await AsyncStorage.removeItem('download_progress');
        }
      } catch (error) {
        console.error('Error saving download progress:', error);
      }
    };

    saveDownloadProgress();
  }, [downloadProgress]);

  const handleCancel = async (downloadId: number, modelName: string) => {
    Alert.alert(
      'Cancel Download',
      'Are you sure you want to cancel this download?',
      [
        {
          text: 'No',
          style: 'cancel'
        },
        {
          text: 'Yes',
          style: 'destructive',
          onPress: async () => {
            try {
              await modelDownloader.cancelDownload(downloadId);
              setDownloadProgress(prev => {
                const newProgress = { ...prev };
                delete newProgress[modelName];
                return newProgress;
              });
            } catch (error) {
              console.error('Error canceling download:', error);
              Alert.alert('Error', 'Failed to cancel download');
            }
          }
        }
      ]
    );
  };

  const renderItem = ({ item }: { item: DownloadItem }) => (
    <View style={[styles.downloadItem, { backgroundColor: themeColors.borderColor }]}>
      <View style={styles.downloadHeader}>
        <Text style={[styles.downloadName, { color: themeColors.text }]}>
          {item.name}
        </Text>
        <View style={styles.downloadActions}>
          <TouchableOpacity
            style={styles.cancelButton}
            onPress={() => handleCancel(item.id, item.name)}
          >
            <Ionicons name="close-circle" size={24} color="#ff4444" />
          </TouchableOpacity>
        </View>
      </View>
      
      <Text style={[styles.downloadProgress, { color: themeColors.secondaryText }]}>
        {`${item.progress || 0}% • ${formatBytes(item.bytesDownloaded || 0)} / ${formatBytes(item.totalBytes || 0)}`}
      </Text>
      
      <View style={[styles.progressBar, { backgroundColor: themeColors.background }]}>
        <View 
          style={[
            styles.progressFill, 
            { width: `${item.progress}%`, backgroundColor: '#4a0660' }
          ]} 
        />
      </View>
    </View>
  );

  return (
    <View style={[styles.container, { backgroundColor: themeColors.background }]}>
      <View style={[styles.header, { backgroundColor: themeColors.headerBackground }]}>
        <TouchableOpacity 
          style={styles.backButton}
          onPress={() => navigation.goBack()}
        >
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Active Downloads</Text>
      </View>
      
      <FlatList
        data={downloads}
        renderItem={renderItem}
        keyExtractor={item => `download-${item.id || item.name}`}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={() => (
          <View style={styles.emptyContainer}>
            <Text style={[styles.emptyText, { color: themeColors.secondaryText }]}>
              No active downloads
            </Text>
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    paddingTop: Platform.OS === 'ios' ? 60 : 16,
  },
  backButton: {
    marginRight: 16,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#fff',
  },
  listContent: {
    padding: 16,
  },
  downloadItem: {
    padding: 16,
    borderRadius: 12,
    marginBottom: 8,
  },
  downloadHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  downloadName: {
    fontSize: 16,
    fontWeight: '500',
    marginBottom: 4,
  },
  downloadActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  downloadProgress: {
    fontSize: 14,
    marginBottom: 8,
  },
  progressBar: {
    height: 4,
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 2,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 32,
  },
  emptyText: {
    fontSize: 16,
  },
  cancelButton: {
    padding: 4,
  },
}); 