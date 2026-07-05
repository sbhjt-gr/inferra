import React, { useState, useRef, useCallback } from 'react';
import { View, StyleSheet, ScrollView, Text, TextInput, TouchableOpacity, RefreshControl, Clipboard, Platform } from 'react-native';
import { AppSwitch } from '../services/adapters/SwitchAdapter';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter, useFocusEffect } from 'expo-router';
import Dialog from '../components/Dialog';
import { useTheme } from '../context/ThemeContext';
import { theme } from '../constants/theme';
import { GradientBg } from '../services/adapters/GradientBgAdapter';
import AppHeader from '../components/AppHeader';
import { logger } from '../utils/logger';
import type { LogMetadata } from '../utils/logger';

interface LogEntry {
  id: string;
  timestamp: string;
  level: string;
  message: string;
  category?: string;
  metadata?: LogMetadata;
}

export default function ServerLogsScreen() {
  const { theme: currentTheme } = useTheme();
  const router = useRouter();
  const themeColors = theme[currentTheme as 'light' | 'dark'];
  const scrollViewRef = useRef<ScrollView>(null);

  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);
  const [clearDialogVisible, setClearDialogVisible] = useState(false);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState<string>('all');
  const prevLogCountRef = useRef(0);

  const FILTERS = ['all', 'inference', 'http', 'server', 'model', 'error'] as const;

  const toggleExpand = useCallback((id: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const maskSensitiveData = useCallback((value: string) => {
    if (!value) {
      return '';
    }

    let masked = value;
    masked = masked.replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, '[email]');
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
            id: log.metadata?.streamId || `${timestampMs}-${index}`,
            timestamp,
            level: (log.level || 'INFO').toUpperCase(),
            message: maskSensitiveData(String(messageSource)),
            category: log.category || 'server',
            metadata: log.metadata || undefined,
          };
        });
      setLogs(formatted);
      setExpandedIds(prev => {
        const next = new Set(prev);
        formatted.forEach(l => { if (l.metadata) next.add(l.id); });
        return next;
      });

      const hasActiveStream = formatted.some(l => l.metadata?.streaming);
      const hasNewLogs = formatted.length > prevLogCountRef.current;
      if (autoScroll && (hasNewLogs || hasActiveStream) && scrollViewRef.current) {
        requestAnimationFrame(() => {
          scrollViewRef.current?.scrollToEnd({ animated: true });
        });
      }
      prevLogCountRef.current = formatted.length;
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

  const truncate = (text: string, max: number) => {
    if (text.length <= max) return text;
    return text.slice(0, max) + '...';
  };

  const filteredLogs = logs.filter(log => {
    if (filter === 'all') return true;
    if (filter === 'error') return log.level === 'ERROR';
    return log.category === filter;
  });

  const renderParams = (params: Record<string, any>) => {
    const entries = Object.entries(params);
    return entries.map(([key, val], i) => {
      const prefix = i < entries.length - 1 ? '  |  ' : '  |  ';
      const value = Array.isArray(val) ? val.join(', ') : String(val);
      return (
        <Text key={key} selectable style={s.mono}>
          <Text style={s.dim}>{prefix}</Text>
          <Text style={s.paramKey}>{key}</Text>
          <Text style={s.dim}>=</Text>
          <Text style={s.text}>{value}</Text>
        </Text>
      );
    });
  };

  const renderMessages = (messages: Array<{ role: string; content: string }>) => {
    return messages.map((msg, i) => {
      const roleColor = msg.role === 'system' ? '#FF9F43' : msg.role === 'assistant' ? '#52D274' : '#4D7BFF';
      const prefix = '  |  ';
      return (
        <View key={`${msg.role}-${i}`}>
          <Text selectable style={s.mono}>
            <Text style={s.dim}>{prefix}</Text>
            <Text style={{ color: roleColor }}>{msg.role}</Text>
            <Text style={s.dim}>: </Text>
          </Text>
          <TextInput
            editable={false}
            multiline
            value={'      ' + truncate(maskSensitiveData(msg.content), 500)}
            style={[s.mono, s.text, s.inputReset]}
          />
        </View>
      );
    });
  };

  const renderInference = (log: LogEntry) => {
    const meta = log.metadata;
    if (!meta) return null;
    const expanded = expandedIds.has(log.id);
    const status = meta.streaming ? 'STREAM' : meta.response ? 'DONE' : 'REQ';
    const statusColor = meta.streaming ? '#FF9F43' : meta.response ? '#52D274' : '#4D7BFF';
    const arrow = expanded ? 'v' : '>';
    const dur = meta.duration != null ? ` ${meta.duration}ms` : '';

    return (
      <View>
        <TouchableOpacity
          activeOpacity={0.8}
          onPress={() => toggleExpand(log.id)}
        >
          <Text selectable style={s.mono}>
            <Text style={s.ts}>[{log.timestamp}]</Text>
            <Text style={{ color: statusColor }}>{` [${status}]`}</Text>
            <Text style={s.dim}>{` ${arrow} `}</Text>
            <Text style={s.text}>{meta.model || 'unknown'}</Text>
            {meta.endpoint && <Text style={s.dim}>{` ${meta.endpoint}`}</Text>}
            {meta.stream && <Text style={s.dim}> stream</Text>}
            {dur ? <Text style={s.green}>{dur}</Text> : null}
          </Text>
        </TouchableOpacity>

        {expanded && (
          <View style={s.details}>
            {meta.endpoint && (
              <Text selectable style={s.mono}>
                <Text style={s.dim}>{'  |-- '}</Text>
                <Text style={s.label}>endpoint </Text>
                <Text style={s.text}>{meta.endpoint}</Text>
              </Text>
            )}

            {meta.status != null && (
              <Text selectable style={s.mono}>
                <Text style={s.dim}>{'  |-- '}</Text>
                <Text style={s.label}>status </Text>
                <Text style={[s.text, { color: meta.status < 400 ? '#52D274' : '#FF5C5C' }]}>{meta.status}</Text>
              </Text>
            )}

            {meta.params && Object.keys(meta.params).length > 0 && (
              <View>
                <Text selectable style={s.mono}>
                  <Text style={s.dim}>{'  |-- '}</Text>
                  <Text style={s.label}>params</Text>
                </Text>
                {renderParams(meta.params)}
              </View>
            )}

            {meta.messages && meta.messages.length > 0 && (
              <View>
                <Text selectable style={s.mono}>
                  <Text style={s.dim}>{'  |-- '}</Text>
                  <Text style={s.label}>messages ({meta.messages.length})</Text>
                </Text>
                {renderMessages(meta.messages)}
              </View>
            )}

            {meta.response && (
              <View>
                <Text selectable style={s.mono}>
                  <Text style={s.dim}>{'  `-- '}</Text>
                  <Text style={s.label}>response </Text>
                </Text>
                <TextInput
                  editable={false}
                  multiline
                  value={'      ' + truncate(maskSensitiveData(meta.response), 1000)}
                  style={[s.mono, s.resp, s.inputReset]}
                />
              </View>
            )}
          </View>
        )}
      </View>
    );
  };

  return (
    <View style={s.container}>
      <GradientBg />
      <AppHeader
        title="Server Logs"
        showBackButton
        onBackPress={() => router.back()}
        rightButtons={
          <View style={s.headerBtns}>
            <TouchableOpacity
              style={s.headerBtn}
              onPress={() => {
                const text = filteredLogs.map(log => {
                  if (log.metadata) {
                    const m = log.metadata;
                    const lines = [`[${log.timestamp}] [${m.streaming ? 'STREAM' : m.response ? 'DONE' : 'REQ'}] ${m.model || ''} ${m.endpoint || ''}${m.duration != null ? ` ${m.duration}ms` : ''}`];
                    if (m.params && Object.keys(m.params).length > 0) {
                      lines.push('  params: ' + JSON.stringify(m.params));
                    }
                    if (m.messages) {
                      m.messages.forEach(msg => lines.push(`  ${msg.role}: ${msg.content}`));
                    }
                    if (m.response) {
                      lines.push('  response: ' + m.response);
                    }
                    return lines.join('\n');
                  }
                  return `[${log.timestamp}] [${log.level}] [${log.category}] ${log.message}`;
                }).join('\n');
                Clipboard.setString(text);
              }}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <MaterialCommunityIcons name="content-copy" size={20} color={Platform.OS === 'ios' && currentTheme === 'light' ? themeColors.primary : '#FFFFFF'} />
            </TouchableOpacity>
            <TouchableOpacity
              style={s.headerBtn}
              onPress={() => setClearDialogVisible(true)}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <MaterialCommunityIcons name="delete-outline" size={20} color={Platform.OS === 'ios' && currentTheme === 'light' ? themeColors.primary : '#FFFFFF'} />
            </TouchableOpacity>
          </View>
        }
      />

      <View style={s.filterBar}>
        {FILTERS.map(f => (
          <TouchableOpacity key={f} onPress={() => setFilter(f)}>
            <Text style={[s.filterTab, filter === f && s.filterTabActive]}>
              {f.toUpperCase()}
            </Text>
          </TouchableOpacity>
        ))}
        <Text style={s.countText}>{filteredLogs.length}</Text>
      </View>

      <ScrollView
        ref={scrollViewRef}
        style={s.logScroll}
        contentContainerStyle={s.logScrollContent}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={handleRefresh}
            tintColor="#555"
            colors={['#555']}
            progressBackgroundColor="#000"
          />
        }
      >
        {filteredLogs.length === 0 ? (
          <Text style={[s.mono, s.dim, { textAlign: 'center', marginTop: 40 }]}>
            {'-- no logs --'}
          </Text>
        ) : (
          filteredLogs.map((log) => {
            if (log.metadata) {
              return <React.Fragment key={log.id}>{renderInference(log)}</React.Fragment>;
            }

            return (
              <Text key={log.id} selectable style={s.mono}>
                <Text style={s.ts}>[{log.timestamp}]</Text>
                <Text style={[s.level, { color: getLevelColor(log.level) }]}>{` [${log.level}]`}</Text>
                {log.category && <Text style={s.cat}>{` [${log.category}]`}</Text>}
                <Text style={s.text}>{` ${log.message}`}</Text>
              </Text>
            );
          })
        )}
      </ScrollView>

      <View style={s.footer}>
        <TouchableOpacity onPress={handleRefresh}>
          <Text style={s.footerLink}>[refresh]</Text>
        </TouchableOpacity>
        <View style={s.autoRow}>
          <Text style={s.dim}>auto-scroll</Text>
          <AppSwitch
            value={autoScroll}
            onValueChange={setAutoScroll}
          />
        </View>
      </View>

      <Dialog
        visible={clearDialogVisible}
        onDismiss={() => setClearDialogVisible(false)}
        title="Clear Logs"
        description="Are you sure you want to clear all server logs?"
        primaryButtonText="Clear"
        onPrimaryPress={handleClearLogs}
        secondaryButtonText="Cancel"
        onSecondaryPress={() => setClearDialogVisible(false)}
      />
    </View>
  );
}

const s = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  headerBtns: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerBtn: {
    width: Platform.OS === 'ios' ? 44 : 36,
    height: Platform.OS === 'ios' ? 44 : 36,
    borderRadius: Platform.OS === 'ios' ? 0 : 18,
    backgroundColor: Platform.OS === 'ios' ? 'transparent' : 'rgba(255, 255, 255, 0.12)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  filterBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1A1A1A',
  },
  filterTab: {
    fontFamily: 'monospace',
    fontSize: 11,
    color: '#555',
  },
  filterTabActive: {
    color: '#FFF',
    textDecorationLine: 'underline',
  },
  countText: {
    fontFamily: 'monospace',
    fontSize: 11,
    color: '#333',
    marginLeft: 'auto',
  },
  logScroll: {
    flex: 1,
    backgroundColor: '#000',
  },
  logScrollContent: {
    flexGrow: 1,
    padding: 10,
    gap: 2,
  },
  mono: {
    fontFamily: 'monospace',
    fontSize: 11,
    lineHeight: 16,
    color: '#CCC',
  },
  ts: {
    color: '#555',
  },
  level: {
    fontWeight: '700',
  },
  cat: {
    color: '#52D274',
  },
  text: {
    color: '#CCC',
  },
  dim: {
    color: '#555',
    fontFamily: 'monospace',
    fontSize: 11,
  },
  label: {
    color: '#4D7BFF',
    fontFamily: 'monospace',
    fontSize: 11,
  },
  green: {
    color: '#52D274',
  },
  paramKey: {
    color: '#4D7BFF',
    fontFamily: 'monospace',
    fontSize: 11,
  },
  resp: {
    color: '#52D274',
  },
  inputReset: {
    padding: 0,
    backgroundColor: 'transparent',
  },
  details: {
    marginBottom: 2,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: '#1A1A1A',
  },
  footerLink: {
    fontFamily: 'monospace',
    fontSize: 12,
    color: '#4D7BFF',
  },
  autoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
});
