import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Alert,
  AppState,
  AppStateStatus,
  StatusBar,
  ActivityIndicator,
  Animated,
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
import * as FileSystem from 'expo-file-system';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface DownloadItem {
  id: number;
  name: string;
  progress: number;
  bytesDownloaded: number;
  totalBytes: number;
  status: string;
  isPaused?: boolean;
  error?: string;
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
  const { downloadProgress, setDownloadProgress } = useDownloads();
  const insets = useSafeAreaInsets();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const fadeAnim = useRef(new Animated.Value(1)).current;

  // Memoize the downloads array to prevent unnecessary re-renders
  const downloads = React.useMemo<DownloadItem[]>(() => {
    return Object.entries(downloadProgress)
      .filter(([_, data]) => {
        if (!data) return false;
        
        // Show downloads that are in progress or paused
        const isActive = data.status === 'downloading' || 
                        data.status === 'paused' ||
                        (data.status === 'starting' && data.progress < 100);
        
        return isActive && typeof data.downloadId === 'number';
      })
      .map(([name, data]) => {
        // Normalize the name - remove any path components
        const normalizedName = name.split(/[\/\\]/).pop() || name;
        
        return {
          id: data.downloadId || 0,
          name: normalizedName,
          progress: data.progress || 0,
          bytesDownloaded: data.bytesDownloaded || 0,
          totalBytes: data.totalBytes || 0,
          status: data.status || 'unknown',
          isPaused: data.isPaused || false,
          error: data.error
        };
      })
      // Remove duplicates based on name
      .filter((item, index, self) => 
        index === self.findIndex((t) => t.name === item.name)
      );
  }, [downloadProgress]);

  // Handle app state changes
  useEffect(() => {
    const handleAppStateChange = async (nextAppState: AppStateStatus) => {
      if (nextAppState === 'active') {
        await refreshDownloads();
      }
    };

    const subscription = AppState.addEventListener('change', handleAppStateChange);
    return () => {
      subscription.remove();
    };
  }, []);

  // Refresh downloads status
  const refreshDownloads = async () => {
    try {
      setIsRefreshing(true);
      
      // Animate fade out
      Animated.timing(fadeAnim, {
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
              setDownloadProgress(prev => ({
                ...prev,
                [modelName]: {
                  progress: 100,
                  bytesDownloaded: (modelInfo as any).size || 0,
                  totalBytes: (modelInfo as any).size || 0,
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
                  setDownloadProgress(prev => ({
                    ...prev,
                    [modelName]: {
                      progress: 100,
                      bytesDownloaded: (finalInfo as any).size || 0,
                      totalBytes: (finalInfo as any).size || 0,
                      status: 'completed',
                      downloadId: downloadState.downloadId
                    }
                  }));
                  
                  // Remove from active downloads
                  const updatedStates = { ...parsedStates };
                  delete updatedStates[modelName];
                  await AsyncStorage.setItem('active_downloads', JSON.stringify(updatedStates));
                } catch (error) {
                  console.error(`Error moving temp file for ${modelName}:`, error);
                  setDownloadProgress(prev => ({
                    ...prev,
                    [modelName]: {
                      ...prev[modelName],
                      status: 'failed',
                      error: 'Failed to move downloaded file'
                    }
                  }));
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
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }).start();
    }
  };

  // Handle download cancellation
  const handleCancel = useCallback(async (downloadId: number, modelName: string) => {
    if (isProcessing) return;
    
    Alert.alert(
      'Cancel Download',
      'Are you sure you want to cancel this download?',
      [
        { text: 'No', style: 'cancel' },
        {
          text: 'Yes',
          style: 'destructive',
          onPress: async () => {
            try {
              setIsProcessing(true);
              await modelDownloader.cancelDownload(downloadId);
              
              setDownloadProgress(prev => {
                const newProgress = { ...prev };
                delete newProgress[modelName];
                return newProgress;
              });
              
              // Remove from saved states
              const savedStates = await AsyncStorage.getItem('active_downloads');
              if (savedStates) {
                const parsedStates = JSON.parse(savedStates);
                delete parsedStates[modelName];
                await AsyncStorage.setItem('active_downloads', JSON.stringify(parsedStates));
              }
            } catch (error) {
              console.error('Error canceling download:', error);
              Alert.alert('Error', 'Failed to cancel download');
            } finally {
              setIsProcessing(false);
            }
          }
        }
      ]
    );
  }, [isProcessing, setDownloadProgress]);

  // Handle pause/resume
  const handlePauseResume = useCallback(async (downloadId: number, modelName: string, isPaused: boolean) => {
    if (isProcessing) return;
    
    try {
      setIsProcessing(true);
      
      if (isPaused) {
        await modelDownloader.resumeDownload(downloadId);
        setDownloadProgress(prev => ({
          ...prev,
          [modelName]: {
            ...prev[modelName],
            isPaused: false,
            status: 'downloading'
          }
        }));
      } else {
        await modelDownloader.pauseDownload(downloadId);
        setDownloadProgress(prev => ({
          ...prev,
          [modelName]: {
            ...prev[modelName],
            isPaused: true,
            status: 'paused'
          }
        }));
      }
    } catch (error) {
      console.error('Error pausing/resuming download:', error);
      Alert.alert('Error', 'Failed to pause/resume download');
    } finally {
      setIsProcessing(false);
    }
  }, [isProcessing, setDownloadProgress]);

  // Render download item
  const renderItem = useCallback(({ item }: { item: DownloadItem }) => (
    <Animated.View 
      style={[
        styles.downloadItem, 
        { 
          backgroundColor: themeColors.borderColor,
          opacity: fadeAnim 
        }
      ]}
    >
      <View style={styles.downloadHeader}>
        <Text style={[styles.downloadName, { color: themeColors.text }]}>
          {item.name}
        </Text>
        <View style={styles.downloadActions}>
          <TouchableOpacity
            style={[styles.actionButton, { marginRight: 8 }]}
            onPress={() => handlePauseResume(item.id, item.name, item.isPaused || false)}
            disabled={isProcessing}
          >
            <Ionicons 
              name={item.isPaused ? "play" : "pause"} 
              size={20} 
              color={isProcessing ? themeColors.secondaryText : themeColors.text} 
            />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.actionButton}
            onPress={() => handleCancel(item.id, item.name)}
            disabled={isProcessing}
          >
            <Ionicons 
              name="close-circle" 
              size={24} 
              color={isProcessing ? "#ff444480" : "#ff4444"} 
            />
          </TouchableOpacity>
        </View>
      </View>
      
      <Text style={[styles.downloadProgress, { color: themeColors.secondaryText }]}>
        {item.isPaused ? 'Paused • ' : ''}
        {`${item.progress}% • ${formatBytes(item.bytesDownloaded)} / ${formatBytes(item.totalBytes)}`}
      </Text>
      
      <View style={[styles.progressBar, { backgroundColor: themeColors.background }]}>
        <View 
          style={[
            styles.progressFill, 
            { 
              width: `${item.progress}%`, 
              backgroundColor: item.isPaused ? '#888888' : '#4a0660' 
            }
          ]} 
        />
      </View>
      
      {item.error && (
        <Text style={styles.errorText}>
          Error: {item.error}
        </Text>
      )}
    </Animated.View>
  ), [themeColors, isProcessing, handleCancel, handlePauseResume, fadeAnim]);

  return (
    <View style={[styles.container, { backgroundColor: themeColors.headerBackground }]}>
      <StatusBar
        backgroundColor="transparent"
        barStyle="light-content"
        translucent={true}
      />
      
      <View style={[
        styles.header, 
        { 
          backgroundColor: themeColors.headerBackground,
          paddingTop: insets.top + 10,
        }
      ]}>
        <TouchableOpacity 
          style={styles.backButton}
          onPress={() => navigation.goBack()}
          disabled={isProcessing}
        >
          <Ionicons 
            name="arrow-back" 
            size={24} 
            color={isProcessing ? "rgba(255,255,255,0.5)" : "#fff"} 
          />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Active Downloads</Text>
        <TouchableOpacity 
          style={styles.refreshButton}
          onPress={refreshDownloads}
          disabled={isRefreshing || isProcessing}
        >
          <Ionicons 
            name="refresh" 
            size={24} 
            color={isRefreshing || isProcessing ? "rgba(255,255,255,0.5)" : "#fff"} 
          />
        </TouchableOpacity>
      </View>
      
      <View style={[styles.content, { backgroundColor: themeColors.background }]}>
        <FlatList
          data={downloads}
          renderItem={renderItem}
          keyExtractor={item => `${item.name}-${item.id}`}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={() => (
            <View style={styles.emptyContainer}>
              <Ionicons 
                name="cloud-download-outline" 
                size={48} 
                color={themeColors.secondaryText}
              />
              <Text style={[styles.emptyText, { color: themeColors.secondaryText }]}>
                No active downloads
              </Text>
            </View>
          )}
        />
      </View>
      
      {isProcessing && (
        <View style={styles.processingOverlay}>
          <ActivityIndicator size="large" color="#fff" />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
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
}); 