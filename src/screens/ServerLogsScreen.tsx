import React, { useState, useRef, useCallback } from 'react';
import { View, StyleSheet, ScrollView, Text, TouchableOpacity, RefreshControl } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Dialog, Portal, Button } from 'react-native-paper';
import { useTheme } from '../context/ThemeContext';
import { theme } from '../constants/theme';
import { RootStackParamList } from '../types/navigation';
import AppHeader from '../components/AppHeader';
import { logger } from '../utils/logger';

interface LogEntry {
  id: string;
  timestamp: string;
  level: string;
  message: string;
  category?: string;
}

export default function ServerLogsScreen() {
  const { theme: currentTheme } = useTheme();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const themeColors = theme[currentTheme as 'light' | 'dark'];
  const scrollViewRef = useRef<ScrollView>(null);

  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);
  const [clearDialogVisible, setClearDialogVisible] = useState(false);

  const maskSensitiveData = useCallback((value: string) => {
    if (!value) {
      return '';
    }

    let masked = value;
    masked = masked.replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, '[email]');
    masked = masked.replace(/\b\d{1,3}(?:\.\d{1,3}){3}\b/g, '[ip]');
    masked = masked.replace(/(Bearer|Token)\s+[A-Za-z0-9\-._~+/]+=*/gi, (_, label) => `${label} [redacted]`);
    masked = masked.replace(/(api[_-]?key|access[_-]?token|secret|password)\s*[:=]\s*([^\s]+)/gi, (match, label) => `${label.toLowerCase()}: [redacted]`);
    masked = masked.replace(/([?&](?:token|key|apikey|api_key|access_token|secret)=)([^&\s]+)/gi, (_, prefix) => `${prefix}[redacted]`);
    return masked;
  }, []);

  const loadLogs = useCallback(async () => {
    try {
      const serverLogs = await logger.getLogs();
      const normalizeNumber = (value: number) => {
        const formatted = value.toString();
        return formatted.padStart(2, '0');
      };
      const formatted = [...serverLogs]
        .reverse()
        .map((log: any, index: number) => {
          const timestampMs = typeof log.timestamp === 'number' ? log.timestamp : Date.now();
          const date = new Date(timestampMs);
          const year = date.getFullYear();
          const month = normalizeNumber(date.getMonth() + 1);
          const day = normalizeNumber(date.getDate());
          const hours = normalizeNumber(date.getHours());
          const minutes = normalizeNumber(date.getMinutes());
          const seconds = normalizeNumber(date.getSeconds());
          const timestamp = `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
          const messageSource = log.msg || log.message || String(log);

          return {
            id: `${timestampMs}-${index}`,
            timestamp,
            level: (log.level || 'INFO').toUpperCase(),
            message: maskSensitiveData(String(messageSource)),
            category: log.category || 'server',
          };
        });
      setLogs(formatted);

      if (autoScroll && scrollViewRef.current) {
        requestAnimationFrame(() => {
          scrollViewRef.current?.scrollToEnd({ animated: true });
        });
      }
    } catch (error) {
      console.error('Failed to load logs:', error);
    }
  }, [autoScroll, maskSensitiveData]);

  useFocusEffect(
    useCallback(() => {
      loadLogs();
      const interval = setInterval(loadLogs, 1000);
      return () => {
        clearInterval(interval);
      };
    }, [loadLogs])
  );

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    await loadLogs();
    setIsRefreshing(false);
  }, [loadLogs]);

  const handleClearLogs = async () => {
    try {
      await logger.clearLogs();
      setLogs([]);
      setClearDialogVisible(false);
    } catch (error) {
      setClearDialogVisible(false);
    }
  };

  const getLevelColor = (level: string) => {
    const normalized = level.toUpperCase();

    switch (normalized) {
      case 'ERROR':
        return '#FF5C5C';
      case 'WARN':
        return '#FFC15C';
      case 'INFO':
        return themeColors.primary;
      case 'DEBUG':
        return '#9E9E9E';
      default:
        return '#FFFFFF';
    }
  };

  const getLevelIcon = (level: string) => {
    const normalized = level.toUpperCase();

    switch (normalized) {
      case 'ERROR':
        return 'alert-circle';
      case 'WARN':
        return 'alert';
      case 'INFO':
        return 'information';
      case 'DEBUG':
        return 'bug';
      default:
        return 'circle';
    }
  };

  return (
    <View style={styles.container}>
      <AppHeader
        title="Server Logs"
        showBackButton
        onBackPress={() => navigation.goBack()}
        rightButtons={
          <View style={styles.headerActions}>
            <TouchableOpacity
              style={styles.headerButton}
              onPress={() => setAutoScroll((prev) => !prev)}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <MaterialCommunityIcons
                name={autoScroll ? 'arrow-down-bold' : 'arrow-down-bold-outline'}
                size={20}
                color={autoScroll ? themeColors.primary : '#FFFFFF'}
              />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.headerButton}
              onPress={() => setClearDialogVisible(true)}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <MaterialCommunityIcons name="delete-outline" size={20} color="#FFFFFF" />
            </TouchableOpacity>
          </View>
        }
      />

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{`SERVER LOGS (${logs.length})`}</Text>
        <ScrollView
          ref={scrollViewRef}
          style={styles.logsContainer}
          contentContainerStyle={styles.logsContent}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={handleRefresh}
              tintColor="#FFFFFF"
              colors={['#FFFFFF']}
              progressBackgroundColor="#101010"
            />
          }
          showsVerticalScrollIndicator
          onContentSizeChange={() => {
            if (autoScroll && scrollViewRef.current) {
              scrollViewRef.current.scrollToEnd({ animated: true });
            }
          }}
        >
          {logs.length === 0 ? (
            <View style={styles.emptyContainer}>
              <MaterialCommunityIcons name="text-box-outline" size={48} color="#FFFFFF" />
              <Text style={styles.emptyText}>No logs available</Text>
              <Text style={styles.emptySubtext}>
                Server logs will appear here when generated
              </Text>
            </View>
          ) : (
            logs.map((log) => (
              <View key={log.id} style={[styles.logEntry, { borderLeftColor: getLevelColor(log.level) }]}> 
                <Text style={styles.logLine}>
                  <Text style={styles.logTimestamp}>[{log.timestamp}]</Text>
                  <Text style={[styles.logLevelTag, { color: getLevelColor(log.level) }]}>{` [${log.level}]`}</Text>
                  {log.category && (
                    <Text style={styles.logCategoryTag}>{` [${log.category}]`}</Text>
                  )}
                  <Text style={styles.logMessage}>{` ${log.message}`}</Text>
                </Text>
              </View>
            ))
          )}
        </ScrollView>
      </View>

      <View style={styles.footer}>
        <TouchableOpacity style={styles.footerButton} onPress={handleRefresh}>
          <MaterialCommunityIcons name="refresh" size={20} color="#FFFFFF" />
          <Text style={styles.footerButtonText}>Refresh</Text>
        </TouchableOpacity>
        <Text style={styles.autoScrollText}>Auto-scroll: {autoScroll ? 'ON' : 'OFF'}</Text>
      </View>

      <Portal>
        <Dialog visible={clearDialogVisible} onDismiss={() => setClearDialogVisible(false)}>
          <Dialog.Title style={{ color: themeColors.text }}>Clear Logs</Dialog.Title>
          <Dialog.Content>
            <Text style={{ color: themeColors.text }}>
              Are you sure you want to clear all server logs?
            </Text>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setClearDialogVisible(false)}>Cancel</Button>
            <Button onPress={handleClearLogs} textColor="#FF5C5C">Clear</Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  headerActions: {
    flexDirection: 'row',
    gap: 8,
  },
  headerButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  section: {
    flex: 1,
    marginHorizontal: 16,
    marginTop: 12,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 1,
    color: '#5C8DFF',
    marginBottom: 12,
  },
  logsContainer: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#111111',
    backgroundColor: '#050505',
  },
  logsContent: {
    flexGrow: 1,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 80,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#FFFFFF',
    marginTop: 16,
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
    lineHeight: 20,
    color: '#A0A0A0',
    textAlign: 'center',
    paddingHorizontal: 24,
  },
  logEntry: {
    paddingVertical: 6,
    borderLeftWidth: 2,
    marginBottom: 4,
  },
  logLine: {
    fontFamily: 'monospace',
    fontSize: 12,
    lineHeight: 16,
    color: '#E4E4E4',
  },
  logTimestamp: {
    color: '#4D7BFF',
  },
  logLevelTag: {
    fontWeight: '700',
  },
  logCategoryTag: {
    color: '#52D273',
  },
  logMessage: {
    color: '#E4E4E4',
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: '#1F1F1F',
    backgroundColor: '#050505',
  },
  footerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1A1A1A',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 24,
  },
  footerButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
    marginLeft: 8,
  },
  autoScrollText: {
    color: '#A0A0A0',
    fontSize: 12,
    fontWeight: '500',
  },
});
