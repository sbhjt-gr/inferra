import React, { createContext, useContext, useState, useEffect, useRef, useMemo } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState } from 'react-native';
import { modelDownloader } from '../services/ModelDownloader';
import { isActiveDownload } from '../utils/ModelUtils';

interface DownloadProgressData {
  progress: number;
  bytesDownloaded: number;
  totalBytes: number;
  status: string;
  downloadId: number;
  isPaused?: boolean;
  error?: string;
  speed?: string;
  rawSpeed?: number;
}

interface DownloadProgress {
  [key: string]: DownloadProgressData;
}

type SetDownloadProgress = React.Dispatch<React.SetStateAction<DownloadProgress>>;

const DownloadProgressContext = createContext<DownloadProgress>({});
const DownloadDispatchContext = createContext<SetDownloadProgress>(() => {});

const removeProgressEntries = (
  prev: DownloadProgress,
  data: { modelName?: string; displayName?: string; downloadId?: number },
): DownloadProgress => {
  const next = { ...prev };
  const names = new Set<string>();
  if (data.modelName) {
    names.add(data.modelName);
  }
  if (data.displayName) {
    names.add(data.displayName);
  }

  for (const [key, value] of Object.entries(next)) {
    const nameMatch = names.has(key);
    const idMatch = Boolean(data.downloadId && value.downloadId === data.downloadId);
    if (nameMatch || idMatch) {
      delete next[key];
    }
  }

  return next;
};

export const DownloadProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [downloadProgress, setDownloadProgress] = useState<DownloadProgress>({});
  const isLoadedRef = useRef(false);
  const cancelledRef = useRef<Set<string>>(new Set());
  const lastUpdateRef = useRef<Record<string, number>>({});
  const pendingRef = useRef<Record<string, any>>({});
  const timerRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  useEffect(() => {
    const loadSavedStates = async () => {
      try {
        await modelDownloader.getActiveDownloadsList();
        const savedProgress = await AsyncStorage.getItem('download_progress');
        let merged: DownloadProgress = {};

        if (savedProgress) {
          const parsedProgress = JSON.parse(savedProgress);
          merged = Object.entries(parsedProgress).reduce((acc, [key, value]) => {
            if (key.startsWith('com.inferra.transfer.')) {
              return acc;
            }
            if (value && typeof value === 'object' && 'status' in value && isActiveDownload(value)) {
              acc[key] = value as DownloadProgressData;
            }
            return acc;
          }, {} as DownloadProgress);
        }

        try {
          const taskDownloads = await modelDownloader.getActiveDownloadsList();
          console.log('restore_ui_downloads', taskDownloads.length);

          const activeById = new Map(
            taskDownloads
              .filter(dl =>
                dl.modelName &&
                !dl.modelName.startsWith('com.inferra.transfer.') &&
                dl.status !== 'completed' &&
                dl.status !== 'failed' &&
                dl.status !== 'cancelled'
              )
              .map(dl => [dl.downloadId, dl])
          );

          const activeNames = new Set(
            Array.from(activeById.values()).map(dl => dl.modelName)
          );

          Object.keys(merged).forEach(key => {
            const entry = merged[key];
            const nameMatch = activeNames.has(key);
            const idMatch = entry?.downloadId
              ? activeById.has(entry.downloadId)
              : false;
            if (!nameMatch && !idMatch) {
              delete merged[key];
            }
          });

          for (const dl of activeById.values()) {
            const existing = merged[dl.modelName];
            merged[dl.modelName] = {
              progress: dl.progress || existing?.progress || 0,
              bytesDownloaded: dl.bytesDownloaded || existing?.bytesDownloaded || 0,
              totalBytes: dl.totalBytes || existing?.totalBytes || 0,
              status: dl.status || 'downloading',
              downloadId: dl.downloadId || existing?.downloadId || 0,
              isPaused: dl.status === 'paused',
              speed: dl.status === 'paused' ? '0 B/s' : (existing?.speed || '0 B/s'),
              rawSpeed: dl.status === 'paused' ? 0 : (existing?.rawSpeed || 0),
            };
          }
        } catch (_) {
          console.log('restore_ui_fail');
        }

        setDownloadProgress(merged);
        isLoadedRef.current = true;
        console.log('ui_downloads_ready', Object.keys(merged).length);
      } catch (error) {
        isLoadedRef.current = true;
      }
    };
    
    loadSavedStates();

    const handleDownloadStarted = (data: any) => {
      if (!data.modelName || data.modelName.startsWith('com.inferra.transfer.')) {
        return;
      }

      if (timerRef.current[data.modelName]) {
        clearTimeout(timerRef.current[data.modelName]);
        delete timerRef.current[data.modelName];
      }
      delete pendingRef.current[data.modelName];
      delete lastUpdateRef.current[data.modelName];

      setDownloadProgress(prev => ({
        ...prev,
        [data.modelName]: {
          progress: 0,
          bytesDownloaded: 0,
          totalBytes: 0,
          status: 'downloading',
          downloadId: data.downloadId || 0,
          isPaused: false,
          speed: '0 B/s',
          rawSpeed: 0,
        }
      }));
    };

    const handleDownloadCompleted = (data: any) => {
      if (!data.modelName || data.modelName.startsWith('com.inferra.transfer.')) {
        return;
      }

      if (timerRef.current[data.modelName]) {
        clearTimeout(timerRef.current[data.modelName]);
        delete timerRef.current[data.modelName];
      }
      if (data.displayName && timerRef.current[data.displayName]) {
        clearTimeout(timerRef.current[data.displayName]);
        delete timerRef.current[data.displayName];
      }
      delete pendingRef.current[data.modelName];
      delete pendingRef.current[data.displayName ?? ''];
      delete lastUpdateRef.current[data.modelName];
      delete lastUpdateRef.current[data.displayName ?? ''];

      setDownloadProgress(prev => removeProgressEntries(prev, data));
    };

    const handleDownloadFailed = (data: any) => {
      if (!data.modelName || data.modelName.startsWith('com.inferra.transfer.')) {
        return;
      }

      const uiKey = data.displayName ?? data.modelName;

      if (timerRef.current[uiKey]) {
        clearTimeout(timerRef.current[uiKey]);
        delete timerRef.current[uiKey];
      }
      if (data.modelName !== uiKey && timerRef.current[data.modelName]) {
        clearTimeout(timerRef.current[data.modelName]);
        delete timerRef.current[data.modelName];
      }
      delete pendingRef.current[uiKey];
      delete pendingRef.current[data.modelName];
      delete lastUpdateRef.current[uiKey];
      delete lastUpdateRef.current[data.modelName];

      setDownloadProgress(prev => {
        const existing =
          prev[uiKey] ??
          prev[data.modelName] ??
          (data.displayName ? prev[data.displayName] : undefined);

        const next = removeProgressEntries(prev, data);
        next[uiKey] = {
          progress: existing?.progress ?? 0,
          bytesDownloaded: existing?.bytesDownloaded ?? 0,
          totalBytes: existing?.totalBytes ?? 0,
          status: 'failed',
          downloadId: data.downloadId || existing?.downloadId || 0,
          error: data.error,
        };
        return next;
      });

      setTimeout(() => {
        setDownloadProgress(prev => removeProgressEntries(prev, data));
      }, 3000);
    };

    const handleDownloadCancelled = (data: any) => {
      if (!data.modelName || data.modelName.startsWith('com.inferra.transfer.')) {
        return;
      }

      if (timerRef.current[data.modelName]) {
        clearTimeout(timerRef.current[data.modelName]);
        delete timerRef.current[data.modelName];
      }
      delete pendingRef.current[data.modelName];
      delete lastUpdateRef.current[data.modelName];

      cancelledRef.current.add(data.modelName);
      setTimeout(() => cancelledRef.current.delete(data.modelName), 30000);
      setDownloadProgress(prev => {
        const newProgress = { ...prev };
        delete newProgress[data.modelName];
        return newProgress;
      });
    };

    const handleProgress = (data: any) => {
      if (!data.modelName || data.modelName.startsWith('com.inferra.transfer.')) {
        return;
      }
      if (data.status === 'completed' || data.status === 'failed' || data.status === 'cancelled') {
        return;
      }
      if (cancelledRef.current.has(data.modelName)) {
        return;
      }

      const now = Date.now();
      const last = lastUpdateRef.current[data.modelName] || 0;
      const minInterval = 1000;

      pendingRef.current[data.modelName] = data;

      if (now - last >= minInterval) {
        lastUpdateRef.current[data.modelName] = now;
        flushPending(data.modelName);
      } else if (!timerRef.current[data.modelName]) {
        const delay = minInterval - (now - last);
        timerRef.current[data.modelName] = setTimeout(() => {
          lastUpdateRef.current[data.modelName] = Date.now();
          delete timerRef.current[data.modelName];
          flushPending(data.modelName);
        }, delay);
      }
    };

    const flushPending = (modelName: string) => {
      const data = pendingRef.current[modelName];
      if (!data) return;
      delete pendingRef.current[modelName];

      setDownloadProgress(prev => ({
        ...prev,
        [modelName]: {
          progress: data.progress || 0,
          bytesDownloaded: data.bytesDownloaded || 0,
          totalBytes: data.totalBytes || 0,
          status: data.status || 'downloading',
          downloadId: data.downloadId || prev[modelName]?.downloadId || 0,
          isPaused: data.isPaused ?? data.status === 'paused',
          speed: data.isPaused || data.status === 'paused'
            ? '0 B/s'
            : (data.speed || prev[modelName]?.speed || '0 B/s'),
          rawSpeed: data.isPaused || data.status === 'paused'
            ? 0
            : (data.rawSpeed ?? prev[modelName]?.rawSpeed ?? 0),
        }
      }));
    };

    modelDownloader.on('downloadStarted', handleDownloadStarted);
    modelDownloader.on('downloadCompleted', handleDownloadCompleted);
    modelDownloader.on('downloadFailed', handleDownloadFailed);
    modelDownloader.on('downloadCancelled', handleDownloadCancelled);
    modelDownloader.on('downloadProgress', handleProgress);

    const pruneStaleProgress = async () => {
      if (!isLoadedRef.current) {
        return;
      }

      try {
        const activeList = await modelDownloader.getActiveDownloadsList();

        setDownloadProgress(prev => {
          let changed = false;
          const next = { ...prev };

          for (const [key, value] of Object.entries(next)) {
            if (!isActiveDownload(value)) {
              delete next[key];
              changed = true;
              continue;
            }

            const stillRunning = activeList.some(item =>
              item.modelName === key ||
              (value.downloadId > 0 && item.downloadId === value.downloadId),
            );

            if (!stillRunning && value.progress >= 99) {
              delete next[key];
              changed = true;
            }
          }

          return changed ? next : prev;
        });
      } catch {
      }
    };

    void pruneStaleProgress();
    const pruneInterval = setInterval(() => {
      void pruneStaleProgress();
    }, 5000);

    const appStateSub = AppState.addEventListener('change', nextState => {
      if (nextState === 'active') {
        void pruneStaleProgress();
      }
    });

    return () => {
      modelDownloader.off('downloadStarted', handleDownloadStarted);
      modelDownloader.off('downloadCompleted', handleDownloadCompleted);
      modelDownloader.off('downloadFailed', handleDownloadFailed);
      modelDownloader.off('downloadCancelled', handleDownloadCancelled);
      modelDownloader.off('downloadProgress', handleProgress);

      clearInterval(pruneInterval);
      appStateSub.remove();

      Object.values(timerRef.current).forEach(clearTimeout);
      timerRef.current = {};
      pendingRef.current = {};
      lastUpdateRef.current = {};
    };
  }, []);

  const progressValue = useMemo(() => downloadProgress, [downloadProgress]);

  return (
    <DownloadProgressContext.Provider value={progressValue}>
      <DownloadDispatchContext.Provider value={setDownloadProgress}>
        {children}
      </DownloadDispatchContext.Provider>
    </DownloadProgressContext.Provider>
  );
};

export const useDownloadProgress = () => useContext(DownloadProgressContext);

export const useDownloadDispatch = () => useContext(DownloadDispatchContext);

/*
  Legacy hook for backward compatibility.
  Prefer useDownloadProgress or useDownloadDispatch individually
  to avoid unnecessary re-renders.
*/
export const useDownloads = () => {
  const downloadProgress = useContext(DownloadProgressContext);
  const setDownloadProgress = useContext(DownloadDispatchContext);
  return { downloadProgress, setDownloadProgress };
};
