import React, { useEffect, useState } from 'react';
import { View, StyleSheet, Text, TouchableOpacity, Alert, Share } from 'react-native';
import { WebView } from 'react-native-webview';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { localServer } from '../services/LocalServer';
import { useTheme } from '../context/ThemeContext';
import { theme } from '../constants/theme';
import AppHeader from './AppHeader';

interface LocalServerViewProps {
  onClose: () => void;
}

export default function LocalServerView({ onClose }: LocalServerViewProps) {
  const { theme: currentTheme } = useTheme();
  const themeColors = theme[currentTheme];
  const [serverStatus, setServerStatus] = useState(localServer.getStatus());
  const [webViewSource, setWebViewSource] = useState<{ html: string } | null>(null);

  useEffect(() => {
    const updateStatus = () => {
      setServerStatus(localServer.getStatus());
      const source = localServer.getWebViewSource();
      setWebViewSource(source);
    };

    const handleServerStarted = () => updateStatus();
    const handleServerStopped = () => updateStatus();

    localServer.on('serverStarted', handleServerStarted);
    localServer.on('serverStopped', handleServerStopped);

    updateStatus();

    return () => {
      localServer.off('serverStarted', handleServerStarted);
      localServer.off('serverStopped', handleServerStopped);
    };
  }, []);

  const handleShare = async () => {
    if (!serverStatus.url) {
      Alert.alert('Server Not Running', 'Please start the server first');
      return;
    }

    try {
      await Share.share({
        url: serverStatus.url,
        message: `Check out my local content server on Inferra!\n\nServer URL: ${serverStatus.url}\n\nThis content is served directly from my mobile app.`,
        title: 'Inferra Content Server'
      });
    } catch (error) {
    }
  };

  const handleRefresh = () => {
    const source = localServer.getWebViewSource();
    setWebViewSource(null);
    setTimeout(() => setWebViewSource(source), 100);
  };

  if (!serverStatus.isRunning || !webViewSource) {
    return (
      <View style={[styles.container, { backgroundColor: themeColors.background }]}>
        <AppHeader 
          title="Local Server" 
          showBackButton
          onBackPress={onClose}
        />
        <View style={styles.centerContent}>
          <MaterialCommunityIcons 
            name="server-off" 
            size={64} 
            color={themeColors.secondaryText} 
          />
          <Text style={[styles.statusText, { color: themeColors.secondaryText }]}>
            Content server not available
          </Text>
          <Text style={[styles.instructionText, { color: themeColors.secondaryText }]}>
            Start the content server from Settings to view the Hello World page
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: themeColors.background }]}>
      <AppHeader 
        title="Local Server" 
        showBackButton
        onBackPress={onClose}
        rightButtons={
          <View style={styles.headerButtons}>
            <TouchableOpacity
              style={styles.headerButton}
              onPress={handleRefresh}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <MaterialCommunityIcons 
                name="refresh" 
                size={22} 
                color={themeColors.headerText} 
              />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.headerButton}
              onPress={handleShare}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <MaterialCommunityIcons 
                name="share-variant" 
                size={22} 
                color={themeColors.headerText} 
              />
            </TouchableOpacity>
          </View>
        }
      />
      
      <View style={styles.statusBar}>
        <View style={styles.statusInfo}>
          <View style={[styles.statusIndicator, { backgroundColor: '#28a745' }]} />
          <Text style={[styles.statusBarText, { color: themeColors.text }]}>
            Server Running
          </Text>
        </View>
        {serverStatus.isRunning && (
          <Text style={[styles.urlText, { color: themeColors.secondaryText }]}>
            Content available in WebView
          </Text>
        )}
      </View>

      <WebView
        source={webViewSource}
        style={styles.webview}
        startInLoadingState={true}
        javaScriptEnabled={true}
        domStorageEnabled={true}
        allowsInlineMediaPlayback={true}
        mediaPlaybackRequiresUserAction={false}
        onError={(error) => {
        }}
        onLoadEnd={() => {
        }}
        renderLoading={() => (
          <View style={[styles.centerContent, { backgroundColor: themeColors.background }]}>
            <MaterialCommunityIcons
              name="loading"
              size={32}
              color={themeColors.primary}
            />
            <Text style={[styles.loadingText, { color: themeColors.text }]}>
              Loading content...
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
  centerContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  headerButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  headerButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  statusBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0, 0, 0, 0.1)',
  },
  statusInfo: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusIndicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 8,
  },
  statusBarText: {
    fontSize: 14,
    fontWeight: '500',
  },
  urlText: {
    fontSize: 12,
    fontFamily: 'monospace',
  },
  statusText: {
    fontSize: 18,
    fontWeight: '600',
    marginTop: 16,
    textAlign: 'center',
  },
  instructionText: {
    fontSize: 14,
    marginTop: 8,
    textAlign: 'center',
  },
  loadingText: {
    fontSize: 14,
    marginTop: 12,
  },
  webview: {
    flex: 1,
  },
});
