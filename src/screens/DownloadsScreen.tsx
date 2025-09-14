import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  AppState,
  AppStateStatus,
} from 'react-native';
import { useTheme } from '../context/ThemeContext';
import { theme } from '../constants/theme';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../types/navigation';
import { modelDownloader } from '../services/ModelDownloader';
import { useDownloads } from '../context/DownloadContext';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { DownloadTask } from '@kesha-antonov/react-native-background-downloader';
import * as FileSystem from 'expo-file-system';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AppHeader from '../components/AppHeader';
import { getThemeAwareColor } from '../utils/ColorUtils';
import { Dialog, Portal, PaperProvider, Text, Button } from 'react-native-paper';

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
  const appState = useRef(AppState.currentState);
  const insets = useSafeAreaInsets();

  const [dialogVisible, setDialogVisible] = useState(false);
  const [dialogTitle, setDialogTitle] = useState('');
  const [dialogMessage, setDialogMessage] = useState('');
  const [dialogActions, setDialogActions] = useState<React.ReactNode[]>([]);

  const hideDialog = () => setDialogVisible(false);

  const showDialog = (title: string, message: string, actions: React.ReactNode[]) => {
    setDialogTitle(title);
    setDialogMessage(message);
    setDialogActions(actions);
    setDialogVisible(true);
  };

  const downloads: DownloadItem[] = Object.entries(downloadProgress)
    .filter(([_, data]) => {
      return data.status !== 'completed' &&
             data.status !== 'failed' &&
             data.status !== 'cancelled' &&
             data.progress < 100;
    })
    .map(([name, data]) => ({
      id: data.downloadId || 0,
      name,
      progress: data.progress || 0,
      bytesDownloaded: data.bytesDownloaded || 0,
      totalBytes: data.totalBytes || 0,
      status: data.status || 'unknown'
    }));

  useEffect(() => {
    const handleAppStateChange = async (nextAppState: AppStateStatus) => {
      if (appState.current !== nextAppState) {
        if (nextAppState === 'active') {
          await loadSavedDownloadStates();
        }
        appState.current = nextAppState;
      }
    };

    let subscription: { remove: () => void } | undefined;
    
    try {
      subscription = AppState.addEventListener('change', handleAppStateChange);
    } catch (error) {
    }
    
    loadSavedDownloadStates();

    return () => {
      if (subscription && typeof subscription.remove === 'function') {
        subscription.remove();
      }
    };
  }, []);

  const loadSavedDownloadStates = async () => {
    try {
      
      const savedStates = await AsyncStorage.getItem('active_downloads');
      if (savedStates) {
        const parsedStates = JSON.parse(savedStates);
        
        for (const [modelName, state] of Object.entries(parsedStates)) {
          const downloadState = state as DownloadState;
          
          const modelPath = `${FileSystem.documentDirectory}models/${modelName}`;
          let fileSize = 0;
          try {
            const fileInfo = await FileSystem.getInfoAsync(modelPath, { size: true });
            if (fileInfo.exists) {
              fileSize = (fileInfo as any).size || 0;
            }
          } catch (error) {
          }
          
          if (fileSize > 0) {
            
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
            
            const updatedStates = { ...parsedStates };
            delete updatedStates[modelName];
            await AsyncStorage.setItem('active_downloads', JSON.stringify(updatedStates));
          } else {
            const tempPath = `${FileSystem.documentDirectory}temp/${modelName}`;
            const tempInfo = await FileSystem.getInfoAsync(tempPath);
            
            if (tempInfo.exists) {
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
                
                
                let fileSize = 0;
                try {
                  const fileInfo = await FileSystem.getInfoAsync(destPath, { size: true });
                  if (fileInfo.exists) {
                    fileSize = (fileInfo as any).size || 0;
                  }
                } catch (error) {
                }
                
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
                
                const updatedStates = { ...parsedStates };
                delete updatedStates[modelName];
                await AsyncStorage.setItem('active_downloads', JSON.stringify(updatedStates));
              } catch (error) {
              }
            } else {
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
    }
  };

  useEffect(() => {
    const saveDownloadProgress = async () => {
      try {
        if (Object.keys(downloadProgress).length > 0) {
          await AsyncStorage.setItem('download_progress', JSON.stringify(downloadProgress));
        } else {
          await AsyncStorage.removeItem('download_progress');
        }
      } catch (error) {
      }
    };

    saveDownloadProgress();
  }, [downloadProgress]);

  const handleCancel = async (downloadId: number, modelName: string) => {
    showDialog(
      'Cancel Download',
      'Are you sure you want to cancel this download?',
      [
        <Button key="cancel" onPress={hideDialog}>No</Button>,
        <Button
          key="confirm"
          onPress={async () => {
            hideDialog();
            try {
              await modelDownloader.cancelDownload(downloadId);
            } catch (error) {
              showDialog('Error', 'Failed to cancel download', [
                <Button key="ok" onPress={hideDialog}>OK</Button>
              ]);
            }
          }}
        >
          Yes
        </Button>
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
            <MaterialCommunityIcons name="close-circle" size={24} color={getThemeAwareColor('#ff4444', currentTheme)} />
          </TouchableOpacity>
        </View>
      </View>
      
      <Text style={[styles.downloadProgress, { color: themeColors.secondaryText }]}>
        {`${Math.floor(item.progress || 0)}% • ${formatBytes(item.bytesDownloaded || 0)} / ${formatBytes(item.totalBytes || 0)}`}
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
    <View style={{ flex: 1, backgroundColor: themeColors.background }}>
      <AppHeader
        title="Active Downloads"
        showBackButton
        showLogo={false}
        rightButtons={[]}
      />
      
      <View style={[styles.container, { backgroundColor: themeColors.background }]}>
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

      <Portal>
        <Dialog visible={dialogVisible} onDismiss={hideDialog}>
          <Dialog.Title>{dialogTitle}</Dialog.Title>
          <Dialog.Content>
            <Text>{dialogMessage}</Text>
          </Dialog.Content>
          <Dialog.Actions>
            {dialogActions}
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
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
