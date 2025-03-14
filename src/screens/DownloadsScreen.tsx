import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as RN from 'react-native';
import { useTheme } from '../context/ThemeContext';
import { theme } from '../constants/theme';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../types/navigation';
import { modelDownloader } from '../services/ModelDownloader';
import { useDownloads } from '../context/DownloadContext';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface DownloadItem {
  id: number;
  name: string;
  progress: number;
  bytesDownloaded: number;
  totalBytes: number;
  status: 'queued' | 'downloading' | 'paused' | 'completed' | 'failed';
  isPaused?: boolean;
  error?: string;
  lastUpdated: number;
}

const formatBytes = (bytes: number) => {
  if (bytes === undefined || bytes === null || isNaN(bytes) || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
};

export default function DownloadsScreen() {
  const { theme: currentTheme } = useTheme();
  const themeColors = theme[currentTheme as 'light' | 'dark'];
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { downloadProgress, updateDownload, removeDownload } = useDownloads();
  const insets = useSafeAreaInsets();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const fadeAnim = useRef(new RN.Animated.Value(1)).current;

  // Memoize the downloads array to prevent unnecessary re-renders
  const downloads = React.useMemo<DownloadItem[]>(() => {
    const downloadMap = new Map<string, DownloadItem>();
    
    Object.entries(downloadProgress).forEach(([name, data]) => {
      // Normalize the name to handle path separators
      const normalizedName = name.split(/[\/\\]/).pop() || name;
      
      // Check if this is an active download
      const isActive = data.status === 'downloading' || 
                      data.status === 'paused' ||
                      data.status === 'queued';
      
      if (isActive) {
        // Create download item
        const downloadItem: DownloadItem = {
          id: data.downloadId,
        name: normalizedName,
          progress: data.progress,
          bytesDownloaded: data.bytesDownloaded,
          totalBytes: data.totalBytes,
          status: data.status,
          isPaused: data.isPaused,
          error: data.error,
          lastUpdated: data.lastUpdated
        };
        
        // Only update if this is a newer version of the same download
        const existing = downloadMap.get(normalizedName);
        if (!existing || data.lastUpdated > existing.lastUpdated) {
          // For paused downloads, preserve the pause state
          if (existing?.isPaused && data.status === 'downloading') {
            downloadItem.isPaused = true;
            downloadItem.status = 'paused';
          }
          downloadMap.set(normalizedName, downloadItem);
        }
      }
    });
    
    // Convert map to array and sort by name
    return Array.from(downloadMap.values())
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [downloadProgress]);

  // Handle app state changes
  useEffect(() => {
    const handleAppStateChange = async (nextAppState: RN.AppStateStatus) => {
      if (nextAppState === 'active') {
        await refreshDownloads();
      }
    };

    const subscription = RN.AppState.addEventListener('change', handleAppStateChange);
    return () => {
      subscription.remove();
    };
  }, []);

  // Subscribe to download events
  useEffect(() => {
    const handleDownloadProgress = (data: any) => {
      // Ignore non-download events
      if (!data || !data.modelName) return;
      
      const modelName = data.modelName;
      console.log(`Progress update for ${modelName}: ${data.progress}% - Status: ${data.status || 'unknown'}, Source: ${data.source || 'app'}, ID: ${data.downloadId}`);
      
      // Check if this is from a notification or the app
      const isFromNotification = data.source && data.source.startsWith('notification');
      
      // Handle notification resume event
      if (data.source === 'notification_resume') {
        console.log(`[DownloadsScreen] Handling notification resume for ${modelName} with ID ${data.downloadId}`);
        
        // Update download state with all available information
        updateDownload(modelName, {
          progress: data.progress || 0,
          bytesDownloaded: data.bytesDownloaded || 0,
          totalBytes: data.totalBytes || 0,
          status: 'downloading',
          isPaused: false,
          downloadId: parseInt(data.downloadId),
          lastUpdated: Date.now()
        });
        
        // Force refresh downloads list
        setTimeout(() => {
          refreshDownloads().catch(error => 
            console.error('Error refreshing downloads after resume:', error)
          );
        }, 500);
        
        return;
      }
      
      // Handle notification pause event
      if (data.source === 'notification_pause') {
        console.log(`[DownloadsScreen] Handling notification pause for ${modelName}`);
        updateDownload(modelName, {
          progress: data.progress || 0,
          bytesDownloaded: data.bytesDownloaded || 0,
          totalBytes: data.totalBytes || 0,
          status: 'paused',
          isPaused: true,
          downloadId: parseInt(data.downloadId),
          lastUpdated: Date.now()
        });
        return;
      }
      
      // Handle notification cancel event
      if (data.source === 'notification_cancel') {
        console.log(`[DownloadsScreen] Handling notification cancel for ${modelName}`);
        removeDownload(modelName);
        return;
      }
      
      // Handle download ID changed event
      if (data.oldDownloadId && data.newDownloadId) {
        console.log(`[DownloadsScreen] Download ID changed from ${data.oldDownloadId} to ${data.newDownloadId} for ${modelName}`);
        
        // Update with new download ID
        updateDownload(modelName, {
          downloadId: parseInt(data.newDownloadId),
          isPaused: false,
          status: 'downloading',
          lastUpdated: Date.now()
        });
        
        return;
      }
      
      // Update download progress with complete info
      updateDownload(modelName, {
        progress: data.progress,
        bytesDownloaded: data.bytesDownloaded,
        totalBytes: data.totalBytes,
        status: data.status,
        downloadId: parseInt(data.downloadId),
        isPaused: data.isPaused,
        error: data.error,
        lastUpdated: Date.now()
      });
    };
    
    const handleDownloadIdChanged = (data: any) => {
      console.log(`[DownloadsScreen] Download ID changed from ${data.oldDownloadId} to ${data.newDownloadId}`);
      
      updateDownload(data.modelName, {
        downloadId: data.newDownloadId,
        isPaused: false,
        status: 'downloading'
      });
    };
    
    const handleDownloadCanceled = (data: any) => {
      if (!data || !data.modelName) return;
      
      console.log(`[DownloadsScreen] Download canceled for ${data.modelName}, source: ${data.source || 'app'}`);
      
      // Remove from download progress
      removeDownload(data.modelName);
    };
    
    modelDownloader.on('downloadProgress', handleDownloadProgress);
    modelDownloader.on('downloadIdChanged', handleDownloadIdChanged);
    modelDownloader.on('downloadCanceled', handleDownloadCanceled);
    
    return () => {
      modelDownloader.off('downloadProgress', handleDownloadProgress);
      modelDownloader.off('downloadIdChanged', handleDownloadIdChanged);
      modelDownloader.off('downloadCanceled', handleDownloadCanceled);
    };
  }, [updateDownload, removeDownload]);

  // Refresh downloads status
  const refreshDownloads = async () => {
    try {
      setIsRefreshing(true);
      
      // Animate fade out
      RN.Animated.timing(fadeAnim, {
        toValue: 0.5,
        duration: 200,
        useNativeDriver: true,
      }).start();

      // Check for completed downloads
      await modelDownloader.checkBackgroundDownloads();
      
      // Load saved states
      const savedStates = await AsyncStorage.getItem('active_downloads');
      if (savedStates) {
        const parsedStates = JSON.parse(savedStates);
        
        // Process each download state
        for (const [modelName, state] of Object.entries(parsedStates)) {
          const downloadState = state as any;
          
          // Skip if already being tracked
          if (downloadProgress[modelName] && 
              downloadProgress[modelName].status !== 'completed' && 
              downloadProgress[modelName].status !== 'failed') {
            continue;
          }
          
          try {
            // Check model existence
            const modelPath = `${FileSystem.documentDirectory}models/${modelName}`;
            const modelInfo = await FileSystem.getInfoAsync(modelPath, { size: true });
            
            if (modelInfo.exists) {
              // Model exists in final location
              updateDownload(modelName, {
              progress: 100,
                bytesDownloaded: (modelInfo as any).size || 0,
                totalBytes: (modelInfo as any).size || 0,
              status: 'completed',
              downloadId: downloadState.downloadId
              });
            
            // Remove from active downloads
            const updatedStates = { ...parsedStates };
            delete updatedStates[modelName];
            await AsyncStorage.setItem('active_downloads', JSON.stringify(updatedStates));
          } else {
            // Check temp directory
            const tempPath = `${FileSystem.documentDirectory}temp/${modelName}`;
            const tempInfo = await FileSystem.getInfoAsync(tempPath);
            
            if (tempInfo.exists) {
              try {
                  // Move from temp to final location
                const destPath = `${FileSystem.documentDirectory}models/${modelName}`;
                await FileSystem.makeDirectoryAsync(
                  `${FileSystem.documentDirectory}models`, 
                  { intermediates: true }
                  );
                
                await FileSystem.moveAsync({
                  from: tempPath,
                  to: destPath
                });
                
                  // Update progress
                  const finalInfo = await FileSystem.getInfoAsync(destPath, { size: true });
                  updateDownload(modelName, {
                  progress: 100,
                    bytesDownloaded: (finalInfo as any).size || 0,
                    totalBytes: (finalInfo as any).size || 0,
                  status: 'completed',
                  downloadId: downloadState.downloadId
                  });
                
                // Remove from active downloads
                const updatedStates = { ...parsedStates };
                delete updatedStates[modelName];
                await AsyncStorage.setItem('active_downloads', JSON.stringify(updatedStates));
              } catch (error) {
                  console.error(`Error moving temp file for ${modelName}:`, error);
                  updateDownload(modelName, {
                    ...downloadProgress[modelName],
                    status: 'failed',
                    error: 'Failed to move downloaded file'
                  });
                }
              }
            }
          } catch (error) {
            console.error(`Error processing download state for ${modelName}:`, error);
          }
        }
      }
    } catch (error) {
      console.error('Error refreshing downloads:', error);
    } finally {
      setIsRefreshing(false);
      
      // Animate fade in
      RN.Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }).start();
    }
  };

  // Handle cancel
  const handleCancel = useCallback(async (downloadId: number, modelName: string) => {
    if (isProcessing) return;
    
    RN.Alert.alert(
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
              setIsProcessing(true);
              await modelDownloader.cancelDownload(downloadId);
              removeDownload(modelName);
            } catch (error) {
              console.error('Error canceling download:', error);
              RN.Alert.alert('Error', 'Failed to cancel download');
            } finally {
              setIsProcessing(false);
            }
          }
        }
      ]
    );
  }, [isProcessing, removeDownload]);

  // Handle pause/resume
  const handlePauseResume = useCallback(async (downloadId: number, modelName: string, isPaused: boolean) => {
    if (isProcessing) return;
    
    try {
      setIsProcessing(true);
      
      if (isPaused) {
        const result = await modelDownloader.resumeDownload(downloadId);
        
        // Update state with new download ID if provided
        if (result?.downloadId) {
          updateDownload(modelName, {
            downloadId: result.downloadId,
            isPaused: false,
            status: 'downloading',
            lastUpdated: Date.now()
          });
        } else {
          // Just update pause state if no new ID
          updateDownload(modelName, {
            isPaused: false,
            status: 'downloading',
            lastUpdated: Date.now()
          });
        }
      } else {
        await modelDownloader.pauseDownload(downloadId);
        updateDownload(modelName, {
          isPaused: true,
          status: 'paused',
          lastUpdated: Date.now()
        });
      }
    } catch (error) {
      console.error('Error pausing/resuming download:', error);
      RN.Alert.alert('Error', 'Failed to pause/resume download');
    } finally {
      setIsProcessing(false);
    }
  }, [isProcessing, updateDownload]);

  // Render download item
  const renderItem = useCallback(({ item }: { item: DownloadItem }) => (
    <RN.Animated.View 
      style={[
        styles.downloadItem, 
        { 
          backgroundColor: themeColors.borderColor,
          opacity: fadeAnim 
        }
      ]}
    >
      <RN.View style={styles.downloadHeader}>
        <RN.Text style={[styles.downloadName, { color: themeColors.text }]}>
          {item.name}
        </RN.Text>
        <RN.View style={styles.downloadActions}>
          <RN.TouchableOpacity
            style={styles.actionButton}
            onPress={() => handleCancel(item.id, item.name)}
            disabled={isProcessing}
          >
            <Ionicons 
              name="close-circle" 
              size={24} 
              color={isProcessing ? "#ff444480" : "#ff4444"} 
            />
          </RN.TouchableOpacity>
        </RN.View>
      </RN.View>
      
      <RN.Text style={[styles.downloadProgress, { color: themeColors.secondaryText }]}>
        {item.isPaused ? 'Paused • ' : ''}
        {`${item.progress}% • ${formatBytes(item.bytesDownloaded)} / ${formatBytes(item.totalBytes)}`}
      </RN.Text>
      
      <RN.View style={[styles.progressBar, { backgroundColor: themeColors.background }]}>
        <RN.View 
          style={[
            styles.progressFill, 
            { 
              width: `${item.progress}%`, 
              backgroundColor: item.isPaused ? '#888888' : '#4a0660' 
            }
          ]} 
        />
      </RN.View>
      
      {item.error && (
        <RN.Text style={styles.errorText}>
          Error: {item.error}
        </RN.Text>
      )}
    </RN.Animated.View>
  ), [themeColors, isProcessing, handleCancel, fadeAnim]);

  return (
    <RN.View style={[styles.container, { backgroundColor: themeColors.headerBackground }]}>
      <RN.StatusBar
        backgroundColor="transparent"
        barStyle="light-content"
        translucent={true}
      />
      
      <RN.View style={[
        styles.header, 
        { 
          backgroundColor: themeColors.headerBackground,
          paddingTop: insets.top + 10,
        }
      ]}>
        <RN.TouchableOpacity 
          style={styles.backButton}
          onPress={() => navigation.goBack()}
          disabled={isProcessing}
        >
          <Ionicons 
            name="arrow-back" 
            size={24} 
            color={isProcessing ? "rgba(255,255,255,0.5)" : "#fff"} 
          />
        </RN.TouchableOpacity>
        <RN.Text style={styles.headerTitle}>Active Downloads</RN.Text>
        <RN.TouchableOpacity 
          style={styles.refreshButton}
          onPress={refreshDownloads}
          disabled={isRefreshing || isProcessing}
        >
          <Ionicons 
            name="refresh" 
            size={24} 
            color={isRefreshing || isProcessing ? "rgba(255,255,255,0.5)" : "#fff"} 
          />
        </RN.TouchableOpacity>
      </RN.View>
      
      <RN.View style={[styles.content, { backgroundColor: themeColors.background }]}>
        <RN.FlatList
          data={downloads}
          renderItem={renderItem}
          keyExtractor={item => `${item.name}-${item.id}`}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={() => (
            <RN.View style={styles.emptyContainer}>
              <Ionicons 
                name="cloud-download-outline" 
                size={48} 
                color={themeColors.secondaryText}
              />
              <RN.Text style={[styles.emptyText, { color: themeColors.secondaryText }]}>
                No active downloads
              </RN.Text>
            </RN.View>
          )}
        />
      </RN.View>
      
      {isProcessing && (
        <RN.View style={styles.processingOverlay}>
          <RN.View style={styles.loadingIndicator}>
            <Ionicons name="refresh" size={24} color="#fff" />
          </RN.View>
        </RN.View>
      )}
    </RN.View>
  );
}

const styles = RN.StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    paddingBottom: 12,
  },
  backButton: {
    padding: 8,
    marginRight: 16,
  },
  refreshButton: {
    padding: 8,
    marginLeft: 'auto',
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
    flex: 1,
    marginRight: 16,
  },
  downloadActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  actionButton: {
    padding: 4,
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
    marginTop: 16,
    textAlign: 'center',
  },
  errorText: {
    color: '#ff4444',
    fontSize: 14,
    marginTop: 8,
  },
  processingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.3)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingIndicator: {
    backgroundColor: '#4a0660',
    padding: 16,
    borderRadius: 12,
  },
}); 