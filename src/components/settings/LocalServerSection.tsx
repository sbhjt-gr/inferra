import React, { useState, useEffect } from 'react';
import { View, StyleSheet, TouchableOpacity, Text, Alert, Share, Modal } from 'react-native';
import { WebView } from 'react-native-webview';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as WebBrowser from 'expo-web-browser';
import { localServer } from '../../services/LocalServer';
import { useTheme } from '../../context/ThemeContext';
import { theme } from '../../constants/theme';

interface LocalServerSectionProps {
  onNavigateToServer?: () => void;
}

interface ServerStatus {
  isRunning: boolean;
  url?: string;
  port: number;
  connections: number;
}

export default function LocalServerSection({ onNavigateToServer }: LocalServerSectionProps) {
  const { theme: currentTheme } = useTheme();
  const themeColors = theme[currentTheme];
  const [serverStatus, setServerStatus] = useState<ServerStatus>({
    isRunning: false,
    port: 8080,
    connections: 0,
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showWebViewModal, setShowWebViewModal] = useState(false);

  useEffect(() => {
    const server = localServer;
    
    const handleServerStarted = (data: any) => {
      setServerStatus(prev => {
        const newStatus = {
          ...prev,
          isRunning: true,
          url: data.url || 'Server starting...',
          port: data.port || 0,
          connections: 0,
        };
        return newStatus;
      });
      setIsLoading(false);
    };
    
    const handleServerStopped = () => {
      setServerStatus(prev => ({
        ...prev,
        isRunning: false,
      }));
      setIsLoading(false);
    };
    
    const handleServerError = (error: string) => {
      setError(error);
    };
    
    const handleContentServerStarted = (data: any) => {
      Alert.alert(
        data.title || 'HTTP Server Running!',
        data.message + '\n\nOther devices on your WiFi network can now access this URL.',
        [
          {
            text: 'Copy URL',
            onPress: async () => {
              if (data.serverInfo?.url) {
                await Share.share({
                  message: `Check out my Hello World server!\n\n${data.serverInfo.url}\n\nMake sure you're on the same WiFi network.`,
                  title: 'Hello World Server'
                });
              }
            },
          },
          {
            text: 'View Now',
            onPress: () => handleViewServer(),
          },
          { text: 'OK', style: 'default' }
        ]
      );
    };
    
    server.on('serverStarted', handleServerStarted);
    server.on('serverStopped', handleServerStopped);
    server.on('serverError', handleServerError);
    server.on('contentServerStarted', handleContentServerStarted);
    
    const status = server.getStatus();
    setServerStatus(prev => ({
      ...prev,
      isRunning: status.isRunning,
      url: status.url || (status.isRunning ? 'Content available in-app' : undefined),
      port: status.port,
      connections: status.connections,
    }));
    
    return () => {
      server.off('serverStarted', handleServerStarted);
      server.off('serverStopped', handleServerStopped);
      server.off('serverError', handleServerError);
      server.off('contentServerStarted', handleContentServerStarted);
    };
  }, []);

  const handleToggleServer = async () => {
    setIsLoading(true);
    
    const timeoutId = setTimeout(() => {
      console.log('Loading timeout reached, clearing loading state');
      setIsLoading(false);
    }, 10000);
    
    try {
      if (serverStatus.isRunning) {
        const result = await localServer.stop();
        if (!result.success) {
          Alert.alert('Error', result.error || 'Failed to stop server');
        }
      } else {
        const result = await localServer.start();
        if (result.success) {
          console.log('Server started successfully, waiting for network server confirmation...');
        } else {
          Alert.alert('Error', result.error || 'Failed to start HTTP server');
        }
      }
    } catch (error) {
      Alert.alert('Error', 'An unexpected error occurred');
    } finally {
      clearTimeout(timeoutId);
      setIsLoading(false);
    }
  };

  const handleShareServer = async () => {
    if (!serverStatus.url) {
      Alert.alert('Server Not Running', 'Please start the server first');
      return;
    }

    try {
      const localPath = localServer.getLocalServerPath();
      if (localPath) {
        await Share.share({
          url: `file://${localPath}`,
          message: `Check out my Hello World page from Inferra!\n\nThis HTML file contains a local server page created on my mobile device.`,
          title: 'Inferra Hello World Page'
        });
      } else {
        await Share.share({
          message: `Check out my local content server on Inferra!\n\nServer info: ${serverStatus.url}\n\nThis content is served directly from my mobile app.`,
          title: 'Inferra Content Server'
        });
      }
    } catch (error) {
    }
  };

  const refreshServerStatus = () => {
    const currentStatus = localServer.getStatus();
    setServerStatus(prev => ({
      ...prev,
      isRunning: currentStatus.isRunning,
      url: currentStatus.url || (currentStatus.isRunning ? 'Content available in-app' : undefined),
      port: currentStatus.port,
      connections: currentStatus.connections,
    }));
  };

  const handleViewServer = async () => {

    const actuallyRunning = localServer.isServerRunning();
    if (!actuallyRunning) {
      Alert.alert('Content Not Available', 'Please start the content server first');
      return;
    }

    if (!serverStatus.isRunning) {
      console.log('UI state out of sync - refreshing status');
      refreshServerStatus();
    }

    try {
      if (onNavigateToServer) {
        console.log('Using onNavigateToServer callback');
        onNavigateToServer();
      } else {
        console.log('No navigation callback - showing content options');
        Alert.alert(
          'View Content Options',
          'Choose how you would like to view the Hello World content:',
          [
            {
              text: 'In WebView',
              onPress: () => {
                setShowWebViewModal(true);
              }
            },
            {
              text: 'Open URL in Browser',
              onPress: async () => {
                if (serverStatus.url && serverStatus.url.startsWith('http')) {
                  try {
                    await WebBrowser.openBrowserAsync(serverStatus.url);
                  } catch (error) {
                    console.error('WebBrowser error:', error);
                    Alert.alert('Error', 'Failed to open URL in browser');
                  }
                } else {
                  Alert.alert('Error', 'Server URL not available');
                }
              }
            },
            {
              text: 'Share File',
              onPress: () => handleShareServer()
            },
            { text: 'Cancel', style: 'cancel' }
          ]
        );
      }
    } catch (error) {
      console.error('handleViewServer error:', error);
      Alert.alert('Error', 'Failed to view server content');
    }
  };

  const getStatusColor = () => {
    if (isLoading) return themeColors.secondaryText;
    return serverStatus.isRunning ? '#28a745' : themeColors.secondaryText;
  };

  const getStatusText = () => {
    console.log('getStatusText called - isLoading:', isLoading, 'serverStatus.isRunning:', serverStatus.isRunning);
    if (isLoading) return 'Loading...';
    return serverStatus.isRunning ? 'Running' : 'Stopped';
  };

  const getButtonText = () => {
    console.log('getButtonText called - isLoading:', isLoading, 'serverStatus.isRunning:', serverStatus.isRunning);
    if (isLoading) return 'Loading...';
    return serverStatus.isRunning ? 'Stop Server' : 'Start Server';
  };

  return (
    <View style={styles.section}>
      <Text style={[styles.sectionTitle, { color: themeColors.text }]}>
        Local Server
      </Text>
      
      <View style={[styles.serverCard, { backgroundColor: themeColors.borderColor }]}>
        <View style={styles.serverHeader}>
          <View style={styles.serverInfo}>
            <MaterialCommunityIcons 
              name="server" 
              size={24} 
              color={themeColors.primary} 
            />
            <View style={styles.serverDetails}>
              <Text style={[styles.serverTitle, { color: themeColors.text }]}>
                HTTP Server
              </Text>
              <View style={styles.statusRow}>
                <View style={[styles.statusIndicator, { backgroundColor: getStatusColor() }]} />
                <Text style={[styles.statusText, { color: getStatusColor() }]}>
                  {getStatusText()}
                </Text>
              </View>
            </View>
          </View>
        </View>

        {serverStatus.url && (
          <View style={styles.urlContainer}>
            <Text style={[styles.urlLabel, { color: themeColors.secondaryText }]}>
              Server URL:
            </Text>
            <Text style={[styles.urlText, { color: themeColors.primary }]} selectable>
              {serverStatus.url}
            </Text>
            {serverStatus.url.startsWith('http') && (
              <Text style={[styles.urlSubtext, { color: themeColors.secondaryText }]}>
                📶 Accessible from any device on your WiFi network
              </Text>
            )}
          </View>
        )}

        <View style={styles.serverActions}>
          <TouchableOpacity
            style={[
              styles.actionButton,
              styles.primaryButton,
              { backgroundColor: serverStatus.isRunning ? '#dc3545' : themeColors.primary },
              isLoading && styles.disabledButton
            ]}
            onPress={handleToggleServer}
            disabled={isLoading}
          >
            <MaterialCommunityIcons 
              name={serverStatus.isRunning ? 'stop' : 'play'} 
              size={16} 
              color="#fff" 
            />
            <Text style={styles.buttonText}>
              {getButtonText()}
            </Text>
          </TouchableOpacity>

          {serverStatus.isRunning && (
            <>
              <TouchableOpacity
                style={[styles.actionButton, styles.secondaryButton, { borderColor: themeColors.primary }]}
                onPress={handleViewServer}
              >
                <MaterialCommunityIcons 
                  name="eye" 
                  size={16} 
                  color={themeColors.primary} 
                />
                <Text style={[styles.secondaryButtonText, { color: themeColors.primary }]}>
                  View
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.actionButton, styles.secondaryButton, { borderColor: themeColors.primary }]}
                onPress={handleShareServer}
              >
                <MaterialCommunityIcons 
                  name="share-variant" 
                  size={16} 
                  color={themeColors.primary} 
                />
                <Text style={[styles.secondaryButtonText, { color: themeColors.primary }]}>
                  Share
                </Text>
              </TouchableOpacity>
              
            </>
          )}
        </View>

        <View style={styles.infoContainer}>
          <Text style={[styles.infoText, { color: themeColors.secondaryText }]}>
            Start a real HTTP server that serves a Hello World page. Other devices on your WiFi network will be able to access the server URL in their browsers.
          </Text>
        </View>
      </View>

      {/* WebView Modal */}
      <Modal
        visible={showWebViewModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowWebViewModal(false)}
      >
        <View style={[styles.modalContainer, { backgroundColor: themeColors.background }]}>
          <View style={[styles.modalHeader, { backgroundColor: themeColors.headerBackground }]}>
            <Text style={[styles.modalTitle, { color: themeColors.headerText }]}>
              Hello World Content
            </Text>
            <TouchableOpacity
              style={styles.closeButton}
              onPress={() => setShowWebViewModal(false)}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <MaterialCommunityIcons
                name="close"
                size={24}
                color={themeColors.headerText}
              />
            </TouchableOpacity>
          </View>

          {serverStatus.isRunning ? (
            <WebView
              source={localServer.getWebViewSource() || { html: '<p>Content not available</p>' }}
              style={styles.modalWebView}
              startInLoadingState={true}
              javaScriptEnabled={true}
              domStorageEnabled={true}
              onError={(error) => {
                console.error('Modal WebView error:', error);
              }}
              onLoadEnd={() => {
                console.log('Modal WebView loaded');
              }}
            />
          ) : (
            <View style={styles.modalCenterContent}>
              <MaterialCommunityIcons
                name="server-off"
                size={64}
                color={themeColors.secondaryText}
              />
              <Text style={[styles.modalStatusText, { color: themeColors.text }]}>
                Content Server Not Running
              </Text>
            </View>
          )}
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    marginHorizontal: 16,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 12,
  },
  serverCard: {
    borderRadius: 12,
    padding: 16,
  },
  serverHeader: {
    marginBottom: 16,
  },
  serverInfo: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  serverDetails: {
    marginLeft: 12,
    flex: 1,
  },
  serverTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusIndicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 8,
  },
  statusText: {
    fontSize: 14,
    fontWeight: '500',
  },
  urlContainer: {
    marginBottom: 16,
    padding: 12,
    backgroundColor: 'rgba(0, 0, 0, 0.05)',
    borderRadius: 8,
  },
  urlLabel: {
    fontSize: 12,
    fontWeight: '500',
    marginBottom: 4,
  },
  urlText: {
    fontSize: 13,
    fontFamily: 'monospace',
  },
  urlSubtext: {
    fontSize: 11,
    marginTop: 4,
    fontStyle: 'italic',
  },
  serverActions: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    gap: 6,
  },
  primaryButton: {
    flex: 1,
  },
  secondaryButton: {
    borderWidth: 1,
  },
  disabledButton: {
    opacity: 0.6,
  },
  buttonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  secondaryButtonText: {
    fontSize: 14,
    fontWeight: '600',
  },
  infoContainer: {
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0, 0, 0, 0.05)',
  },
  infoText: {
    fontSize: 13,
    lineHeight: 18,
  },
  modalContainer: {
    flex: 1,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    paddingTop: 50, // Account for status bar
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0, 0, 0, 0.1)',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalWebView: {
    flex: 1,
  },
  modalCenterContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  modalStatusText: {
    fontSize: 18,
    fontWeight: '600',
    marginTop: 16,
    textAlign: 'center',
  },
});
