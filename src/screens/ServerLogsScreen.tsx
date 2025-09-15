import React, { useState, useEffect, useRef } from 'react';
import { View, StyleSheet, ScrollView, Text, TouchableOpacity, Alert, RefreshControl } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTheme } from '../context/ThemeContext';
import { theme } from '../constants/theme';
import { RootStackParamList } from '../types/navigation';
import AppHeader from '../components/AppHeader';
import SettingsSection from '../components/settings/SettingsSection';
import { logger } from '../utils/logger';

interface LogEntry {
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

  useEffect(() => {
    loadLogs();
  }, []);

  const loadLogs = async () => {
    try {
      const serverLogs = await logger.getLogs();
      const formattedLogs = serverLogs.map((log: any) => ({
        timestamp: new Date(log.timestamp || Date.now()).toLocaleString(),
        level: log.level || 'INFO',
        message: log.msg || log.message || String(log),
        category: log.category || 'server'
      }));
      setLogs(formattedLogs);
      
      if (autoScroll && scrollViewRef.current) {
        setTimeout(() => {
          scrollViewRef.current?.scrollToEnd({ animated: true });
        }, 100);
      }
    } catch (error) {
      console.error('Failed to load logs:', error);
    }
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await loadLogs();
    setIsRefreshing(false);
  };

  const clearLogs = () => {
    Alert.alert(
      'Clear Logs',
      'Are you sure you want to clear all server logs?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: async () => {
            try {
              await logger.clearLogs();
              setLogs([]);
            } catch (error) {
              Alert.alert('Error', 'Failed to clear logs');
            }
          }
        }
      ]
    );
  };

  const getLevelColor = (level: string) => {
    switch (level.toUpperCase()) {
      case 'ERROR':
        return '#FF4444';
      case 'WARN':
        return '#FFA500';
      case 'INFO':
        return themeColors.primary;
      case 'DEBUG':
        return themeColors.secondaryText;
      default:
        return themeColors.text;
    }
  };

  const getLevelIcon = (level: string) => {
    switch (level.toUpperCase()) {
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
    <View style={[styles.container, { backgroundColor: themeColors.background }]}>
      <AppHeader
        title="Server Logs"
        showBackButton={true}
        onBackPress={() => navigation.goBack()}
        rightButtons={
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TouchableOpacity
              style={styles.headerButton}
              onPress={() => setAutoScroll(!autoScroll)}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <MaterialCommunityIcons
                name={autoScroll ? "arrow-down-bold" : "arrow-down-bold-outline"}
                size={20}
                color={autoScroll ? themeColors.primary : themeColors.headerText}
              />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.headerButton}
              onPress={clearLogs}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <MaterialCommunityIcons
                name="delete-outline"
                size={20}
                color={themeColors.headerText}
              />
            </TouchableOpacity>
          </View>
        }
      />

      <SettingsSection title={`SERVER LOGS (${logs.length})`}>
        <ScrollView
          ref={scrollViewRef}
          style={[styles.logsContainer, { backgroundColor: themeColors.cardBackground }]}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={handleRefresh}
              tintColor={themeColors.primary}
            />
          }
          showsVerticalScrollIndicator={true}
        >
          {logs.length === 0 ? (
            <View style={styles.emptyContainer}>
              <MaterialCommunityIcons
                name="text-box-outline"
                size={48}
                color={themeColors.secondaryText}
              />
              <Text style={[styles.emptyText, { color: themeColors.secondaryText }]}>
                No logs available
              </Text>
              <Text style={[styles.emptySubtext, { color: themeColors.secondaryText }]}>
                Server logs will appear here when generated
              </Text>
            </View>
          ) : (
            logs.map((log, index) => (
              <View key={index} style={[styles.logEntry, { borderBottomColor: themeColors.borderColor }]}>
                <View style={styles.logHeader}>
                  <View style={styles.logLevelContainer}>
                    <MaterialCommunityIcons
                      name={getLevelIcon(log.level)}
                      size={14}
                      color={getLevelColor(log.level)}
                    />
                    <Text style={[styles.logLevel, { color: getLevelColor(log.level) }]}>
                      {log.level.toUpperCase()}
                    </Text>
                  </View>
                  <Text style={[styles.logTimestamp, { color: themeColors.secondaryText }]}>
                    {log.timestamp}
                  </Text>
                </View>
                <Text style={[styles.logMessage, { color: themeColors.text }]}>
                  {log.message}
                </Text>
                {log.category && (
                  <Text style={[styles.logCategory, { color: themeColors.secondaryText }]}>
                    [{log.category}]
                  </Text>
                )}
              </View>
            ))
          )}
        </ScrollView>
      </SettingsSection>

      <View style={[styles.footer, { backgroundColor: themeColors.cardBackground, borderTopColor: themeColors.borderColor }]}>
        <TouchableOpacity
          style={[styles.footerButton, { backgroundColor: themeColors.primary + '20' }]}
          onPress={handleRefresh}
        >
          <MaterialCommunityIcons name="refresh" size={20} color={themeColors.primary} />
          <Text style={[styles.footerButtonText, { color: themeColors.primary }]}>
            Refresh
          </Text>
        </TouchableOpacity>
        
        <Text style={[styles.autoScrollText, { color: themeColors.secondaryText }]}>
          Auto-scroll: {autoScroll ? 'ON' : 'OFF'}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  logsContainer: {
    flex: 1,
    maxHeight: 500,
    marginHorizontal: 16,
    marginTop: 8,
    borderRadius: 8,
    paddingVertical: 8,
  },
  headerButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    marginTop: 16,
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
  logEntry: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  logHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  logLevelContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  logLevel: {
    fontSize: 12,
    fontWeight: '600',
    marginLeft: 6,
    minWidth: 50,
  },
  logTimestamp: {
    fontSize: 12,
    fontFamily: 'monospace',
  },
  logMessage: {
    fontSize: 14,
    lineHeight: 20,
    fontFamily: 'monospace',
    marginBottom: 4,
  },
  logCategory: {
    fontSize: 12,
    fontStyle: 'italic',
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
  },
  footerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  footerButtonText: {
    fontSize: 14,
    fontWeight: '500',
    marginLeft: 6,
  },
  autoScrollText: {
    fontSize: 12,
    fontWeight: '500',
  },
});
