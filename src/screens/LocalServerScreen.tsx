import React, { useState, useEffect, useCallback } from 'react';
import { View, StyleSheet, ScrollView, Text, TouchableOpacity, Alert, Switch, Clipboard, Share, Platform } from 'react-native';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import QRCodeStyled from 'react-native-qrcode-styled';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTheme } from '../context/ThemeContext';
import { useRemoteModel } from '../context/RemoteModelContext';
import { theme } from '../constants/theme';
import { RootStackParamList } from '../types/navigation';
import AppHeader from '../components/AppHeader';
import SettingsSection from '../components/settings/SettingsSection';
import { localServer } from '../services/LocalServer';
import { localServerPlatformBackground } from '../services/LocalServerBackground';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface ServerStatus {
  isRunning: boolean;
  signalingURL?: string;
  peerCount: number;
  startTime?: Date;
}

const AUTO_START_KEY = 'local_server_auto_start';
const KEEP_AWAKE_KEY = 'local_server_keep_awake';
const KEEP_AWAKE_TAG = 'local-server';

const parsePortFromURL = (value?: string) => {
  if (!value) return undefined;
  try {
    const parsed = new URL(value);
    if (parsed.port) {
      const resolved = Number(parsed.port);
      return Number.isFinite(resolved) ? resolved : undefined;
    }
    return parsed.protocol === 'https:' ? 443 : 80;
  } catch (error) {
    return undefined;
  }
};

export default function LocalServerScreen() {
  const { theme: currentTheme } = useTheme();
  const { isLoggedIn } = useRemoteModel();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const themeColors = theme[currentTheme as 'light' | 'dark'];
  const iconColor = currentTheme === 'dark' ? '#FFFFFF' : themeColors.primary;

  const [serverStatus, setServerStatus] = useState<ServerStatus>({
    isRunning: false,
    peerCount: 0,
  });
  const [isLoading, setIsLoading] = useState(false);
  const [autoStart, setAutoStart] = useState(false);
  const [allowExternalAccess, setAllowExternalAccess] = useState(true);
  const [keepAwake, setKeepAwake] = useState(false);

  useEffect(() => {
    const server = localServer;

    const handleServerStarted = (data: any) => {
      setServerStatus(prev => ({
        ...prev,
        isRunning: true,
        signalingURL: data.signalingURL,
        peerCount: 0,
        startTime: new Date(),
      }));
      setIsLoading(false);
    };

    const handleServerStopped = () => {
      setServerStatus(prev => ({
        ...prev,
        isRunning: false,
        signalingURL: undefined,
        startTime: undefined,
      }));
      setIsLoading(false);
    };

    server.on('serverStarted', handleServerStarted);
    server.on('serverStopped', handleServerStopped);

    const status = server.getStatus();
    setServerStatus(status);

    return () => {
      server.off('serverStarted', handleServerStarted);
      server.off('serverStopped', handleServerStopped);
    };
  }, []);

  const startServer = useCallback(async () => {
    if (isLoading) {
      return localServer.isServerRunning();
    }

    if (localServer.isServerRunning()) {
      return true;
    }

    setIsLoading(true);

    try {
      const result = await localServer.start();
      if (!result.success) {
        Alert.alert('Error', result.error || 'Failed to start server');
        return false;
      }

      if (allowExternalAccess && Platform.OS === 'android' && result.signalingURL) {
        const port = parsePortFromURL(result.signalingURL);
        await localServerPlatformBackground.start({ port, url: result.signalingURL });
      }

      return true;
    } catch (error) {
      Alert.alert('Error', 'An unexpected error occurred');
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [allowExternalAccess, isLoading]);

  const stopServer = useCallback(async () => {
    if (isLoading) {
      return !localServer.isServerRunning();
    }

    if (!localServer.isServerRunning()) {
      return true;
    }

    setIsLoading(true);

    try {
      await localServerPlatformBackground.stop();
      const result = await localServer.stop();
      if (!result.success) {
        Alert.alert('Error', result.error || 'Failed to stop server');
        return false;
      }
      return true;
    } catch (error) {
      Alert.alert('Error', 'An unexpected error occurred');
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [isLoading]);

  const handleToggleServer = useCallback(async () => {
    if (isLoading) {
      return;
    }

    if (serverStatus.isRunning) {
      await stopServer();
    } else {
      await startServer();
    }
  }, [isLoading, serverStatus.isRunning, startServer, stopServer]);

  const handleAutoStartChange = useCallback(async (value: boolean) => {
    setAutoStart(value);
    try {
      await AsyncStorage.setItem(AUTO_START_KEY, value ? 'true' : 'false');
    } catch {
      // Swallow persistence errors silently
    }

    if (value && !serverStatus.isRunning) {
      const started = await startServer();
      if (!started) {
        setAutoStart(false);
        try {
          await AsyncStorage.setItem(AUTO_START_KEY, 'false');
        } catch {
          // Ignore storage rollback error
        }
      }
    }
  }, [serverStatus.isRunning, startServer]);

  const handleKeepAwakeChange = useCallback(async (value: boolean) => {
    setKeepAwake(value);
    try {
      await AsyncStorage.setItem(KEEP_AWAKE_KEY, value ? 'true' : 'false');
    } catch {}
  }, []);

  useEffect(() => {
    let cancelled = false;

    const loadAutoStartPreference = async () => {
      try {
        const stored = await AsyncStorage.getItem(AUTO_START_KEY);
        if (cancelled) {
          return;
        }

        const enabled = stored === 'true';
        setAutoStart(enabled);

        if (enabled && !localServer.isServerRunning()) {
          const started = await startServer();
          if (!started && !cancelled) {
            setAutoStart(false);
            try {
              await AsyncStorage.setItem(AUTO_START_KEY, 'false');
            } catch {
              // Ignore storage rollback error
            }
          }
        }
      } catch {
        // Ignore preference load failures
      }
    };

    loadAutoStartPreference();

    return () => {
      cancelled = true;
    };
  }, [startServer]);

  useEffect(() => {
    let cancelled = false;

    const loadKeepAwakePreference = async () => {
      try {
        const stored = await AsyncStorage.getItem(KEEP_AWAKE_KEY);
        if (cancelled) {
          return;
        }
        setKeepAwake(stored === 'true');
      } catch {}
    };

    loadKeepAwakePreference();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const syncKeepAwake = async () => {
      try {
        if (keepAwake && serverStatus.isRunning) {
          await activateKeepAwakeAsync(KEEP_AWAKE_TAG);
        } else {
          await deactivateKeepAwake(KEEP_AWAKE_TAG);
        }
      } catch {}
    };

    syncKeepAwake();

    return () => {
      deactivateKeepAwake(KEEP_AWAKE_TAG).catch(() => {});
    };
  }, [keepAwake, serverStatus.isRunning]);

  useEffect(() => {
    if (!serverStatus.isRunning) {
      localServerPlatformBackground.stop().catch(() => {});
      return;
    }
    if (allowExternalAccess && Platform.OS === 'android' && serverStatus.signalingURL) {
      const port = parsePortFromURL(serverStatus.signalingURL);
      localServerPlatformBackground.start({ port, url: serverStatus.signalingURL }).catch(() => {});
    } else {
      localServerPlatformBackground.stop().catch(() => {});
    }
  }, [allowExternalAccess, serverStatus.isRunning, serverStatus.signalingURL]);

  useEffect(() => {
    if (!serverStatus.isRunning || Platform.OS !== 'android' || !serverStatus.signalingURL) {
      return;
    }
    const port = parsePortFromURL(serverStatus.signalingURL);
    localServerPlatformBackground.update({ peerCount: serverStatus.peerCount, url: serverStatus.signalingURL, port }).catch(() => {});
  }, [serverStatus.peerCount, serverStatus.isRunning, serverStatus.signalingURL]);

  useEffect(() => {
    return () => {
      localServerPlatformBackground.stop().catch(() => {});
    };
  }, []);

  const getStatusText = () => {
    if (isLoading) return 'Starting...';
    return serverStatus.isRunning ? 'Running' : 'Stopped';
  };

  const getStatusColor = () => {
    if (isLoading) return themeColors.secondaryText;
    return serverStatus.isRunning ? '#28a745' : themeColors.secondaryText;
  };

  const formatUptime = () => {
    if (!serverStatus.startTime) return 'N/A';

    const now = new Date();
    const diff = now.getTime() - serverStatus.startTime.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(minutes / 60);

    if (hours > 0) {
      return `${hours}h ${minutes % 60}m`;
    }
    return `${minutes}m`;
  };

  const ProfileButton = () => {
    return (
      <TouchableOpacity
        style={styles.headerButton}
        onPress={() => {
          if (isLoggedIn) {
            navigation.navigate('Profile');
          } else {
            navigation.navigate('Login', {
              redirectTo: 'MainTabs',
              redirectParams: { screen: 'LocalServerTab' }
            });
          }
        }}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      >
        <MaterialCommunityIcons
          name={isLoggedIn ? "account-circle" : "login"}
          size={22}
          color={themeColors.headerText}
        />
      </TouchableOpacity>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: themeColors.background }]}>
      <AppHeader
        title="Server"
        rightButtons={<ProfileButton />}
      />

      <ScrollView
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={false}
      >
        <SettingsSection title="SERVER STATUS">
          <View style={styles.settingItem}>
            <View style={styles.settingLeft}>
              <View style={[styles.iconContainer, { backgroundColor: currentTheme === 'dark' ? 'rgba(255, 255, 255, 0.2)' : themeColors.primary + '20' }]}>
                <MaterialCommunityIcons name="server" size={22} color={iconColor} />
              </View>
              <View style={styles.settingTextContainer}>
                <Text style={[styles.settingText, { color: themeColors.text }]}>
                  Inferra Local Server
                </Text>
                <View style={styles.statusRow}>
                  <View style={[styles.statusIndicator, { backgroundColor: getStatusColor() }]} />
                  <Text style={[styles.statusText, { color: getStatusColor() }]}>
                    {getStatusText()}
                  </Text>
                </View>
              </View>
            </View>
            <Switch
              value={serverStatus.isRunning}
              onValueChange={handleToggleServer}
              disabled={isLoading}
              thumbColor={serverStatus.isRunning ? themeColors.primary : themeColors.secondaryText}
              trackColor={{ false: themeColors.borderColor, true: themeColors.primary + '40' }}
            />
          </View>

          {serverStatus.isRunning && serverStatus.signalingURL && (
            <>
              <View style={[styles.separator, { backgroundColor: themeColors.background }]} />
              <TouchableOpacity style={styles.settingItem} onPress={() => {
                Clipboard.setString(serverStatus.signalingURL || '');
                Alert.alert('Copied', 'Server URL copied to clipboard');
              }}>
                <View style={styles.settingLeft}>
                  <View style={[styles.iconContainer, { backgroundColor: currentTheme === 'dark' ? 'rgba(255, 255, 255, 0.2)' : themeColors.primary + '20' }]}>
                    <MaterialCommunityIcons name="content-copy" size={22} color={iconColor} />
                  </View>
                  <View style={styles.settingTextContainer}>
                    <Text style={[styles.settingText, { color: themeColors.text }]}>
                      Copy Server URL
                    </Text>
                    <Text style={[styles.settingDescription, { color: themeColors.secondaryText }]}> 
                      Share with other devices on WiFi
                    </Text>
                    {serverStatus.signalingURL ? (
                      <Text style={[styles.settingDescription, { color: themeColors.secondaryText }]} numberOfLines={1}>
                        {serverStatus.signalingURL}
                      </Text>
                    ) : null}
                  </View>
                </View>
                <MaterialCommunityIcons name="chevron-right" size={20} color={themeColors.secondaryText} />
              </TouchableOpacity>

              <View style={[styles.separator, { backgroundColor: themeColors.background }]} />
              <TouchableOpacity style={styles.settingItem} onPress={() => {
                Share.share({
                  message: serverStatus.signalingURL || '',
                  title: 'Inferra Local Server'
                });
              }}>
                <View style={styles.settingLeft}>
                  <View style={[styles.iconContainer, { backgroundColor: currentTheme === 'dark' ? 'rgba(255, 255, 255, 0.2)' : themeColors.primary + '20' }]}>
                    <MaterialCommunityIcons name="share-variant" size={22} color={iconColor} />
                  </View>
                  <View style={styles.settingTextContainer}>
                    <Text style={[styles.settingText, { color: themeColors.text }]}>
                      Share Server Link
                    </Text>
                    <Text style={[styles.settingDescription, { color: themeColors.secondaryText }]}> 
                      Open from any browser on the network
                    </Text>
                  </View>
                </View>
                <MaterialCommunityIcons name="chevron-right" size={20} color={themeColors.secondaryText} />
              </TouchableOpacity>

            </>
          )}
        </SettingsSection>

        {serverStatus.isRunning && (
          <SettingsSection title="CONNECTION INFO">
            <View style={styles.settingItem}>
              <View style={styles.settingLeft}>
                <View style={[styles.iconContainer, { backgroundColor: currentTheme === 'dark' ? 'rgba(255, 255, 255, 0.2)' : themeColors.primary + '20' }]}>
                  <MaterialCommunityIcons name="connection" size={22} color={iconColor} />
                </View>
                <View style={styles.settingTextContainer}>
                  <Text style={[styles.settingText, { color: themeColors.text }]}>
                    Connected Peers
                  </Text>
                  <Text style={[styles.settingDescription, { color: themeColors.secondaryText }]}>
                    {serverStatus.peerCount}
                  </Text>
                </View>
              </View>
            </View>

            <View style={[styles.separator, { backgroundColor: themeColors.background }]} />
            <View style={styles.settingItem}>
              <View style={styles.settingLeft}>
                <View style={[styles.iconContainer, { backgroundColor: currentTheme === 'dark' ? 'rgba(255, 255, 255, 0.2)' : themeColors.primary + '20' }]}>
                  <MaterialCommunityIcons name="clock-outline" size={22} color={iconColor} />
                </View>
                <View style={styles.settingTextContainer}>
                  <Text style={[styles.settingText, { color: themeColors.text }]}>
                    Uptime
                  </Text>
                  <Text style={[styles.settingDescription, { color: themeColors.secondaryText }]}>
                    {formatUptime()}
                  </Text>
                </View>
              </View>
            </View>
          </SettingsSection>
        )}

        <SettingsSection title="LOGS">
          <TouchableOpacity
            style={styles.settingItem}
            onPress={() => navigation.navigate('ServerLogs')}
          >
            <View style={styles.settingLeft}>
              <View style={[styles.iconContainer, { backgroundColor: currentTheme === 'dark' ? 'rgba(255, 255, 255, 0.2)' : themeColors.primary + '20' }]}>
                <MaterialCommunityIcons name="text-box-outline" size={22} color={iconColor} />
              </View>
              <View style={styles.settingTextContainer}>
                <Text style={[styles.settingText, { color: themeColors.text }]}>
                  Server Logs
                </Text>
                <Text style={[styles.settingDescription, { color: themeColors.secondaryText }]}>
                  View real-time server logs and activity
                </Text>
              </View>
            </View>
            <MaterialCommunityIcons name="chevron-right" size={20} color={themeColors.secondaryText} />
          </TouchableOpacity>
        </SettingsSection>

        {serverStatus.isRunning && serverStatus.signalingURL && (
          <SettingsSection title="CONNECTION QR CODE">
            <View style={styles.qrDisplayContainer}>
              <View style={[styles.qrWrapper, { backgroundColor: '#FFFFFF' }]}>
                <QRCodeStyled
                  data={serverStatus.signalingURL || ''}
                  style={styles.qrCode}
                  size={160}
                  color={themeColors.primary}
                />
              </View>
              <Text style={[styles.qrTitle, { color: themeColors.text }]}>
                Open in Browser
              </Text>
              <Text style={[styles.qrDescription, { color: themeColors.secondaryText }]}>
                Scan to open the local server in your browser
              </Text>
            </View>
          </SettingsSection>
        )}

        <SettingsSection title="CONFIGURATION">
          <View style={styles.settingItem}>
            <View style={styles.settingLeft}>
              <View style={[styles.iconContainer, { backgroundColor: currentTheme === 'dark' ? 'rgba(255, 255, 255, 0.2)' : themeColors.primary + '20' }]}>
                <MaterialCommunityIcons name="wifi" size={22} color={iconColor} />
              </View>
              <View style={styles.settingTextContainer}>
                <Text style={[styles.settingText, { color: themeColors.text }]}>
                  Network Access
                </Text>
                <Text style={[styles.settingDescription, { color: themeColors.secondaryText }]}>
                  Allow access from other devices on WiFi
                </Text>
              </View>
            </View>
            <Switch
              value={allowExternalAccess}
              onValueChange={setAllowExternalAccess}
              thumbColor={allowExternalAccess ? themeColors.primary : themeColors.secondaryText}
              trackColor={{ false: themeColors.borderColor, true: themeColors.primary + '40' }}
            />
          </View>

          <View style={[styles.separator, { backgroundColor: themeColors.background }]} />
          <View style={styles.settingItem}>
            <View style={styles.settingLeft}>
              <View style={[styles.iconContainer, { backgroundColor: currentTheme === 'dark' ? 'rgba(255, 255, 255, 0.2)' : themeColors.primary + '20' }]}> 
                <MaterialCommunityIcons name="brightness-7" size={22} color={iconColor} />
              </View>
              <View style={styles.settingTextContainer}>
                <Text style={[styles.settingText, { color: themeColors.text }]}> 
                  Keep Screen Awake
                </Text>
                <Text style={[styles.settingDescription, { color: themeColors.secondaryText }]}> 
                  Prevent sleep while the server is active
                </Text>
              </View>
            </View>
            <Switch
              value={keepAwake}
              onValueChange={handleKeepAwakeChange}
              thumbColor={keepAwake ? themeColors.primary : themeColors.secondaryText}
              trackColor={{ false: themeColors.borderColor, true: themeColors.primary + '40' }}
            />
          </View>

          <View style={[styles.separator, { backgroundColor: themeColors.background }]} />
          <View style={styles.settingItem}>
            <View style={styles.settingLeft}>
              <View style={[styles.iconContainer, { backgroundColor: currentTheme === 'dark' ? 'rgba(255, 255, 255, 0.2)' : themeColors.primary + '20' }]}>
                <MaterialCommunityIcons name="play-circle-outline" size={22} color={iconColor} />
              </View>
              <View style={styles.settingTextContainer}>
                <Text style={[styles.settingText, { color: themeColors.text }]}>
                  Auto Start
                </Text>
                <Text style={[styles.settingDescription, { color: themeColors.secondaryText }]}>
                  Start server automatically when app opens
                </Text>
              </View>
            </View>
            <Switch
              value={autoStart}
              onValueChange={handleAutoStartChange}
              thumbColor={autoStart ? themeColors.primary : themeColors.secondaryText}
              trackColor={{ false: themeColors.borderColor, true: themeColors.primary + '40' }}
            />
          </View>
        </SettingsSection>

        <SettingsSection title="ABOUT">
          <View style={styles.settingItem}>
            <View style={styles.settingLeft}>
              <View style={[styles.iconContainer, { backgroundColor: currentTheme === 'dark' ? 'rgba(255, 255, 255, 0.2)' : themeColors.primary + '20' }]}>
                <MaterialCommunityIcons name="help-circle-outline" size={22} color={iconColor} />
              </View>
              <View style={styles.settingTextContainer}>
                <Text style={[styles.settingText, { color: themeColors.text }]}>
                  What is this?
                </Text>
                <Text style={[styles.settingDescription, { color: themeColors.secondaryText }]}>
                  Share your Inferra chat interface with other devices on your WiFi network. Perfect for accessing your AI assistant from computers, tablets, or other phones.
                </Text>
              </View>
            </View>
          </View>
        </SettingsSection>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  contentContainer: {
    paddingTop: 16,
    paddingBottom: 32,
  },
  settingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  settingLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 16,
  },
  iconContainer: {
    width: 36,
    height: 36,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
  },
  settingTextContainer: {
    flex: 1,
  },
  settingText: {
    fontSize: 16,
    fontWeight: '500',
    marginBottom: 2,
  },
  settingDescription: {
    fontSize: 14,
    lineHeight: 20,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
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
  separator: {
    height: 1,
    marginHorizontal: 16,
  },
  headerButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  qrDisplayContainer: {
    alignItems: 'center',
    paddingVertical: 24,
    paddingHorizontal: 16,
  },
  qrWrapper: {
    padding: 20,
    borderRadius: 16,
    alignItems: 'center',
    marginBottom: 16,
  },
  qrCode: {
    marginBottom: 8,
  },
  qrTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 8,
    textAlign: 'center',
  },
  qrDescription: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
});