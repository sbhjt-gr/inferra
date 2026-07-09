import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
  InteractionManager,
} from 'react-native';
import { fs as FileSystem } from '../services/fs';
import { getStorageInfo } from '../utils/storageUtils';
import { useTheme } from '../context/ThemeContext';
import { theme } from '../constants/theme';
import { GradientBg } from '../services/adapters/GradientBgAdapter';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { modelDownloader } from '../services/ModelDownloader';
import { huggingFaceService } from '../services/HuggingFaceService';
import { useDownloadProgress, useDownloadDispatch } from '../context/DownloadContext';
import AppHeader from '../components/AppHeader';
import { getThemeAwareColor } from '../utils/ColorUtils';
import { Text } from 'react-native-paper';
import Dialog from '../components/Dialog';
import { isActiveDownload } from '../utils/ModelUtils';

const formatBytes = (bytes: number) => {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(k)), sizes.length - 1);
  return `${(bytes / Math.pow(k, index)).toFixed(2)} ${sizes[index]}`;
};

const listFilesDeep = async (rootDir: string, currentDir: string = rootDir): Promise<string[]> => {
  const entries = await FileSystem.readDirectoryAsync(currentDir);
  const files: string[] = [];

  for (const entry of entries) {
    const fullPath = `${currentDir}/${entry}`;
    const info = await FileSystem.getInfoAsync(fullPath);

    if (!info.exists) {
      continue;
    }

    if (info.isDirectory) {
      const nested = await listFilesDeep(rootDir, fullPath);
      files.push(...nested);
    } else {
      const relative = fullPath.replace(`${rootDir}/`, '');
      files.push(relative);
    }
  }

  return files;
};

interface DownloadItem {
  id: number;
  name: string;
  progress: number;
  bytesDownloaded: number;
  totalBytes: number;
  status: string;
  progressText: string;
  isTransferring: boolean;
  speed: string;
  rawSpeed: number;
}

export default function DownloadsScreen() {
  const { theme: currentTheme } = useTheme();
  const themeColors = theme[currentTheme as 'light' | 'dark'];
  const downloadProgress = useDownloadProgress();
  const setDownloadProgress = useDownloadDispatch();
  const buttonProcessingRef = useRef<Set<string>>(new Set());
  const prevStatusRef = useRef<Record<string, string>>({});
  const storageWarnedRef = useRef(false);
  const renderCountRef = useRef(0);
  renderCountRef.current += 1;
  if (renderCountRef.current % 5 === 0) {
    console.log('render_downloads_screen', renderCountRef.current, 'downloads', Object.keys(downloadProgress).length);
  }

  const [dialogVisible, setDialogVisible] = useState(false);
  const [dialogTitle, setDialogTitle] = useState('');
  const [dialogMessage, setDialogMessage] = useState('');
  const [dialogPrimaryText, setDialogPrimaryText] = useState<string | undefined>(undefined);
  const [dialogPrimaryPress, setDialogPrimaryPress] = useState<(() => void) | undefined>(undefined);
  const [dialogSecondaryText, setDialogSecondaryText] = useState<string | undefined>(undefined);
  const [dialogSecondaryPress, setDialogSecondaryPress] = useState<(() => void) | undefined>(undefined);
  const [cancelDialogVisible, setCancelDialogVisible] = useState(false);
  const [cancelModelName, setCancelModelName] = useState('');
  const [restartDialogVisible, setRestartDialogVisible] = useState(false);
  const [restartModelName, setRestartModelName] = useState('');
  const [isRestarting, setIsRestarting] = useState(false);
  const [isCancellingAll, setIsCancellingAll] = useState(false);
  const [mlxPackageFiles, setMlxPackageFiles] = useState<Record<string, string[]>>({});
  const [expandedPackages, setExpandedPackages] = useState<Set<string>>(new Set());
  const mlxCacheRef = useRef<string>('');

  const hideDialog = useCallback(() => setDialogVisible(false), []);

  const hideCancelDialog = () => {
    setCancelDialogVisible(false);
    setCancelModelName('');
  };

  const hideRestartDialog = () => {
    if (isRestarting) {
      return;
    }
    setRestartDialogVisible(false);
    setRestartModelName('');
  };

  interface BtnCfg { label: string; onPress: () => void }

  const showDialog = useCallback((title: string, message: string, primary?: BtnCfg, secondary?: BtnCfg) => {
    setDialogTitle(title);
    setDialogMessage(message);
    const autoClose = () => setDialogVisible(false);
    setDialogPrimaryText(primary?.label ?? 'OK');
    setDialogPrimaryPress(() => primary ? primary.onPress : autoClose);
    setDialogSecondaryText(secondary?.label);
    setDialogSecondaryPress(secondary ? () => secondary.onPress : undefined);
    setDialogVisible(true);
  }, []);

  const downloads: DownloadItem[] = useMemo(() => {
    return Object.entries(downloadProgress)
      .filter(([_, data]) => isActiveDownload(data))
      .map(([name, data]) => {
        const progress = data.progress || 0;
        const bytesDownloaded = data.bytesDownloaded || 0;
        const totalBytes = data.totalBytes || 0;
        const isTransferring = data.status === 'transferring';
        const progressText = isTransferring
          ? 'Transferring to models...'
          : `${Math.floor(progress)}% • ${formatBytes(bytesDownloaded)} / ${formatBytes(totalBytes)}`;
        return {
          id: data.downloadId || 0,
          name,
          progress,
          bytesDownloaded,
          totalBytes,
          status: data.status || 'unknown',
          progressText,
          isTransferring,
          speed: data.speed || '0 B/s',
          rawSpeed: data.rawSpeed || 0,
        };
      });
  }, [downloadProgress]);

  /*
    iOS background URLSession throttles didWriteData delegate callbacks, so native
    progress events arrive infrequently. Polling synchronizeWithActiveTransfers via
    ensureDownloadsAreRunning() queries the URLSession task byte counts directly,
    giving real-time progress regardless of delegate callback frequency.
  */
  const hasActive = downloads.length > 0;
  const hasActiveRef = useRef(hasActive);
  hasActiveRef.current = hasActive;

  useEffect(() => {
    const run = () => modelDownloader.ensureDownloadsAreRunning().catch(() => {});
    InteractionManager.runAfterInteractions(run);

    if (Platform.OS !== 'ios') return;

    const id = setInterval(() => {
      if (hasActiveRef.current) {
        InteractionManager.runAfterInteractions(run);
      }
    }, 1000);

    return () => clearInterval(id);
  }, []);

  const isStorageError = (error?: string): boolean => {
    if (!error) return false;
    const msg = error.toLowerCase();
    return (
      msg.includes('enospc') ||
      msg.includes('no space') ||
      msg.includes('not enough space') ||
      msg.includes('insufficient storage') ||
      msg === '28' ||
      /code[=\s]28\b/.test(msg)
    );
  };

  useEffect(() => {
    const prev = prevStatusRef.current;

    for (const [name, data] of Object.entries(downloadProgress)) {
      if (data.status === 'failed' && prev[name] && prev[name] !== 'failed') {
        console.log('download_failed', name, data.error);
        if (isStorageError(data.error)) {
          showDialog('Not Enough Storage', 'Download stopped because the device ran out of storage space. Free up storage and try again.');
        } else {
          showDialog('Download Failed', `"${name}" could not be downloaded. Please try again.`);
        }
      }
    }

    const next: Record<string, string> = {};
    for (const [name, data] of Object.entries(downloadProgress)) {
      next[name] = data.status;
    }
    prevStatusRef.current = next;
  }, [downloadProgress, showDialog]);

  useEffect(() => {
    if (!hasActive) {
      storageWarnedRef.current = false;
      return;
    }

    const check = async () => {
      if (storageWarnedRef.current) return;
      const { hasEnoughSpace } = await getStorageInfo();
      if (!hasEnoughSpace) {
        storageWarnedRef.current = true;
        showDialog('Low Storage', 'Your device is running low on storage space. Active downloads may fail.');
      }
    };

    check();
    const id = setInterval(check, 30000);
    return () => clearInterval(id);
  }, [hasActive, showDialog]);

  const mlxActiveNames = useMemo(
    () => Object.keys(downloadProgress).filter(n => n.startsWith('temp_mlx_')),
    [downloadProgress]
  );
  const mlxActiveCount = mlxActiveNames.length;

  useEffect(() => {
    const loadMlxPackageFiles = async () => {
      try {
        const activeList = await modelDownloader.getActiveDownloadsList();
        const grouped: Record<string, Set<string>> = {};

        for (const item of activeList) {
          const match = item.modelName.match(/^temp_mlx_(.+)_\d+_(.+)$/);
          if (!match) {
            continue;
          }

          const packageName = match[1];
          const fileName = match[2];

          if (!grouped[packageName]) {
            grouped[packageName] = new Set<string>();
          }

          grouped[packageName].add(fileName);
        }

        const activePackageNames = Object.entries(downloadProgress)
          .filter(([, data]) => data.status !== 'completed' && data.status !== 'failed' && data.status !== 'cancelled')
          .map(([name]) => name);

        for (const packageName of activePackageNames) {
          try {
            const manifestFiles = await modelDownloader.getMLXPackageManifest(packageName);
            if (!grouped[packageName]) {
              grouped[packageName] = new Set<string>();
            }
            for (const file of manifestFiles) {
              grouped[packageName].add(file);
            }
          } catch {
          }

          const packageDir = `${FileSystem.documentDirectory}models/mlx/${packageName}`;
          try {
            const dirInfo = await FileSystem.getInfoAsync(packageDir);
            if (dirInfo.exists && dirInfo.isDirectory) {
              const files = await listFilesDeep(packageDir);
              if (!grouped[packageName]) {
                grouped[packageName] = new Set<string>();
              }
              for (const file of files) {
                grouped[packageName].add(file);
              }
            }
          } catch {
          }
        }

        const normalized: Record<string, string[]> = {};
        Object.entries(grouped).forEach(([packageName, files]) => {
          normalized[packageName] = Array.from(files).sort((a, b) => a.localeCompare(b));
        });

        const cacheKey = JSON.stringify(normalized);
        if (cacheKey !== mlxCacheRef.current) {
          mlxCacheRef.current = cacheKey;
          setMlxPackageFiles(normalized);
        }
      } catch {
      }
    };

    const hasActiveMlx = mlxActiveNames.length > 0;
    
    let intervalId: ReturnType<typeof setInterval>;
    if (hasActiveMlx) {
      InteractionManager.runAfterInteractions(() => {
        loadMlxPackageFiles();
      });
      intervalId = setInterval(loadMlxPackageFiles, 15000);
    }

    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [mlxActiveNames.join(',')]);

  const togglePackage = (packageName: string) => {
    setExpandedPackages(prev => {
      const next = new Set(prev);
      if (next.has(packageName)) {
        next.delete(packageName);
      } else {
        next.add(packageName);
      }
      return next;
    });
  };



  const handleCancel = (modelName: string) => {
    setCancelModelName(modelName);
    setCancelDialogVisible(true);
  };

  const handleRestart = (modelName: string) => {
    setRestartModelName(modelName);
    setRestartDialogVisible(true);
  };

  const confirmRestart = async () => {
    const modelName = restartModelName;

    if (!modelName || buttonProcessingRef.current.has(modelName)) {
      return;
    }

    buttonProcessingRef.current.add(modelName);
    setIsRestarting(true);
    console.log('restart_confirmed', modelName);

    try {
      setDownloadProgress(prev => ({
        ...prev,
        [modelName]: {
          ...prev[modelName],
          progress: 0,
          bytesDownloaded: 0,
          status: 'starting',
          speed: '0 B/s',
          rawSpeed: 0,
        },
      }));

      await modelDownloader.restartDownload(modelName, huggingFaceService.getAccessToken());
    } catch {
      showDialog('Error', 'Failed to restart download');
    } finally {
      buttonProcessingRef.current.delete(modelName);
      setIsRestarting(false);
      setRestartDialogVisible(false);
      setRestartModelName('');
    }
  };

  const confirmCancellation = async () => {
    const modelName = cancelModelName;
    hideCancelDialog();

    if (!modelName || buttonProcessingRef.current.has(modelName)) {
      return;
    }

    buttonProcessingRef.current.add(modelName);

    try {
      await modelDownloader.cancelDownload(modelName);
      setDownloadProgress(prev => {
        const newProgress = { ...prev };
        delete newProgress[modelName];
        return newProgress;
      });
    } catch {
      showDialog('Error', 'Failed to cancel download');
    } finally {
      buttonProcessingRef.current.delete(modelName);
    }
  };

  const handleCancelAll = () => {
    if (isCancellingAll) {
      return;
    }

    const activeNames = Array.from(new Set(downloads.map(item => item.name)));
    if (activeNames.length === 0) {
      return;
    }

    const confirmCancelAll = async () => {
      hideDialog();
      setIsCancellingAll(true);

      const cancelledNames: string[] = [];

      try {
        for (const modelName of activeNames) {
          if (buttonProcessingRef.current.has(modelName)) {
            continue;
          }

          buttonProcessingRef.current.add(modelName);
          try {
            await modelDownloader.cancelDownload(modelName);
            cancelledNames.push(modelName);
          } catch {
          } finally {
            buttonProcessingRef.current.delete(modelName);
          }
        }

        if (cancelledNames.length > 0) {
          setDownloadProgress(prev => {
            const next = { ...prev };
            for (const modelName of cancelledNames) {
              delete next[modelName];
            }
            return next;
          });
        }

        if (cancelledNames.length !== activeNames.length) {
          showDialog('Error', 'Some downloads could not be cancelled. Please try again.');
        }
      } finally {
        setIsCancellingAll(false);
      }
    };

    showDialog(
      'Cancel All Downloads',
      `Are you sure you want to cancel ${activeNames.length} active downloads?`,
      { label: 'Yes', onPress: confirmCancelAll },
      { label: 'No', onPress: hideDialog }
    );
  };

  const headerRightButtons = useMemo(() => {
    if (downloads.length === 0) return null;
    return (
      <TouchableOpacity
        style={[styles.headerButton, isCancellingAll && styles.headerButtonDisabled]}
        onPress={handleCancelAll}
        disabled={isCancellingAll}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      >
        <MaterialCommunityIcons
          name="close-circle-outline"
          size={22}
          color={Platform.OS === 'ios' && currentTheme === 'light' ? themeColors.primary : themeColors.headerText}
        />
      </TouchableOpacity>
    );
  }, [downloads.length, isCancellingAll, currentTheme, themeColors]);

  const renderItem = useCallback(({ item }: { item: DownloadItem }) => {
    const packageFiles = mlxPackageFiles[item.name] || [];
    const isMLXDownload = packageFiles.length > 0;
    const isExpanded = expandedPackages.has(item.name);
    
    return (
      <View style={[styles.downloadItem, { backgroundColor: themeColors.borderColor }]}>
        <View style={styles.downloadHeader}>
          <View style={styles.downloadTitleContainer}>
            <Text style={[styles.downloadName, { color: themeColors.text }]} numberOfLines={1}>
              {item.name}
            </Text>
            {isMLXDownload && (
              <TouchableOpacity
                style={styles.expandButton}
                onPress={() => togglePackage(item.name)}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <MaterialCommunityIcons
                  name={isExpanded ? 'chevron-up' : 'chevron-down'}
                  size={18}
                  color={themeColors.secondaryText}
                />
              </TouchableOpacity>
            )}
          </View>
          {!item.isTransferring && (
            <View style={styles.downloadActions}>
              <TouchableOpacity
                style={styles.actionButton}
                onPress={() => handleRestart(item.name)}
              >
                <MaterialCommunityIcons name="restart" size={24} color={getThemeAwareColor('#4a0660', currentTheme)} />
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.actionButton}
                onPress={() => handleCancel(item.name)}
              >
                <MaterialCommunityIcons name="close-circle" size={24} color={getThemeAwareColor('#ff4444', currentTheme)} />
              </TouchableOpacity>
            </View>
          )}
        </View>
        
        <View style={styles.transferRow}>
          {item.isTransferring && (
            <ActivityIndicator size="small" color={getThemeAwareColor('#4a0660', currentTheme)} style={styles.transferSpinner} />
          )}
          <Text style={[styles.downloadProgress, { color: themeColors.secondaryText }]}>
            {item.progressText}
          </Text>
          {!item.isTransferring && item.rawSpeed > 0 && (
            <Text style={[styles.downloadSpeed, { color: themeColors.secondaryText }]}>
              {item.speed}
            </Text>
          )}
        </View>

        {isMLXDownload && isExpanded && (
          <View style={styles.packageFilesContainer}>
            {packageFiles.map(fileName => (
              <Text key={`${item.name}-${fileName}`} style={[styles.packageFileText, { color: themeColors.secondaryText }]} numberOfLines={1}>
                • {fileName}
              </Text>
            ))}
          </View>
        )}
        
        <View style={[styles.progressBar, { backgroundColor: themeColors.background }]}>
          <View 
            style={[
              styles.progressFill, 
              { width: `${item.progress}%`, backgroundColor: getThemeAwareColor('#4a0660', currentTheme) }
            ]} 
          />
        </View>
      </View>
    );
  }, [mlxPackageFiles, expandedPackages, themeColors, currentTheme, togglePackage, handleCancel, handleRestart]);

  return (
    <View style={{ flex: 1, backgroundColor: themeColors.background }}>
      <GradientBg />
      <AppHeader
        title="Active Downloads"
        showBackButton
        showLogo={false}
        rightButtons={headerRightButtons}
      />
      
      <View style={[styles.container, { backgroundColor: themeColors.background }]}>
        <FlatList
          data={downloads}
          renderItem={renderItem}
          keyExtractor={item => `download-${item.name}`}
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

      <Dialog
        visible={dialogVisible}
        onDismiss={hideDialog}
        title={dialogTitle}
        description={dialogMessage}
        primaryButtonText={dialogPrimaryText}
        onPrimaryPress={dialogPrimaryPress}
        secondaryButtonText={dialogSecondaryText}
        onSecondaryPress={dialogSecondaryPress}
      />

      <Dialog
        visible={cancelDialogVisible}
        onClose={hideCancelDialog}
        title="Cancel Download"
        description="Are you sure you want to cancel this download?"
        iconName="close-circle-outline"
        primaryButtonText="Yes"
        onPrimaryPress={confirmCancellation}
        secondaryButtonText="No"
        onSecondaryPress={hideCancelDialog}
      />

      <Dialog
        visible={restartDialogVisible}
        onClose={hideRestartDialog}
        title="Restart Download"
        description="This will stop the current download, and start over the download from the beginning. Continue?"
        iconName="restart"
        primaryButtonText="Yes"
        onPrimaryPress={confirmRestart}
        primaryButtonLoading={isRestarting}
        primaryButtonDisabled={isRestarting}
        secondaryButtonText="No"
        onSecondaryPress={hideRestartDialog}
      />
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
  downloadTitleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 8,
  },
  downloadName: {
    fontSize: 16,
    fontWeight: '500',
    marginBottom: 4,
    flex: 1,
  },
  expandButton: {
    padding: 2,
    marginLeft: 6,
  },
  downloadActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  downloadProgress: {
    fontSize: 14,
    marginBottom: 8,
    flex: 1,
  },
  downloadSpeed: {
    fontSize: 13,
    marginBottom: 8,
    marginLeft: 8,
    fontVariant: ['tabular-nums'],
  },
  transferRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  transferSpinner: {
    marginRight: 6,
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
  packageFilesContainer: {
    marginBottom: 8,
    paddingVertical: 4,
  },
  packageFileText: {
    fontSize: 12,
    marginBottom: 2,
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
  actionButton: {
    padding: 4,
  },
  headerButton: {
    width: Platform.OS === 'ios' ? 44 : 36,
    height: Platform.OS === 'ios' ? 44 : 36,
    borderRadius: Platform.OS === 'ios' ? 0 : 18,
    backgroundColor: Platform.OS === 'ios' ? 'transparent' : 'rgba(255, 255, 255, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerButtonDisabled: {
    opacity: 0.5,
  },
}); 
