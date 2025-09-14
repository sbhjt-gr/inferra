import React, { useState, useEffect } from 'react';
import { View, StyleSheet, ScrollView, Text, TouchableOpacity, Alert, Switch, Clipboard, Share } from 'react-native';
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

interface ServerStatus {
  isRunning: boolean;
  url?: string;
  port: number;
  connections: number;
  startTime?: Date;
}

export default function LocalServerScreen() {
  const { theme: currentTheme } = useTheme();
  const { isLoggedIn } = useRemoteModel();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const themeColors = theme[currentTheme as 'light' | 'dark'];
  const iconColor = currentTheme === 'dark' ? '#FFFFFF' : themeColors.primary;

  const [serverStatus, setServerStatus] = useState<ServerStatus>({
    isRunning: false,
    port: 0,
    connections: 0,
  });
  const [isLoading, setIsLoading] = useState(false);
  const [autoStart, setAutoStart] = useState(false);
  const [allowExternalAccess, setAllowExternalAccess] = useState(true);

  useEffect(() => {
    const server = localServer;

    const handleServerStarted = (data: any) => {
      setServerStatus(prev => ({
        ...prev,
        isRunning: true,
        url: data.url || 'Server running',
        port: data.port || 0,
        connections: 0,
        startTime: new Date(),
      }));
      setIsLoading(false);
    };

    const handleServerStopped = () => {
      setServerStatus(prev => ({
        ...prev,
        isRunning: false,
        startTime: undefined,
      }));
      setIsLoading(false);
    };

    server.on('serverStarted', handleServerStarted);
    server.on('serverStopped', handleServerStopped);

    const status = server.getStatus();
    setServerStatus(prev => ({
      ...prev,
      isRunning: status.isRunning,
      url: status.url,
      port: status.port,
      connections: status.connections,
      startTime: status.startTime,
    }));

    return () => {
      server.off('serverStarted', handleServerStarted);
      server.off('serverStopped', handleServerStopped);
    };
  }, []);

  const handleToggleServer = async () => {
    setIsLoading(true);

    try {
      if (serverStatus.isRunning) {
        const result = await localServer.stop();
        if (!result.success) {
          Alert.alert('Error', result.error || 'Failed to stop server');
        }
      } else {
        const result = await localServer.start();
        if (!result.success) {
          Alert.alert('Error', result.error || 'Failed to start server');
        }
      }
    } catch (error) {
      Alert.alert('Error', 'An unexpected error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  const openInBrowser = () => {
    if (serverStatus.url) {
      Alert.alert(
        'Server URL',
        `${serverStatus.url}\n\nCopy this URL to access your HomeScreen from any device on the same WiFi network.`,
        [
          { text: 'OK', style: 'default' }
        ]
      );
    }
  };

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
        rightButtons={
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <ProfileButton />
          </View>
        }
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
            <Switch
              value={serverStatus.isRunning}
              onValueChange={handleToggleServer}
              disabled={isLoading}
              thumbColor={serverStatus.isRunning ? themeColors.primary : themeColors.secondaryText}
              trackColor={{ false: themeColors.borderColor, true: themeColors.primary + '40' }}
            />
          </View>

          {serverStatus.isRunning && (
            <>
              <View style={[styles.separator, { backgroundColor: themeColors.background }]} />
              <TouchableOpacity style={styles.settingItem} onPress={openInBrowser}>
                <View style={styles.settingLeft}>
                  <View style={[styles.iconContainer, { backgroundColor: currentTheme === 'dark' ? 'rgba(255, 255, 255, 0.2)' : themeColors.primary + '20' }]}>
                    <MaterialCommunityIcons name="web" size={22} color={iconColor} />
                  </View>
                  <View style={styles.settingTextContainer}>
                    <Text style={[styles.settingText, { color: themeColors.text }]}>
                      Access URL
                    </Text>
                    <Text style={[styles.settingDescription, { color: themeColors.primary }]} numberOfLines={1}>
                      {serverStatus.url || 'Not available'}
                    </Text>
                  </View>
                </View>
                <MaterialCommunityIcons name="chevron-right" size={20} color={themeColors.secondaryText} />
              </TouchableOpacity>
            </>
          )}
        </SettingsSection>

        {serverStatus.isRunning && (
          <SettingsSection title="SERVER INFO">
            <View style={styles.settingItem}>
              <View style={styles.settingLeft}>
                <View style={[styles.iconContainer, { backgroundColor: currentTheme === 'dark' ? 'rgba(255, 255, 255, 0.2)' : themeColors.primary + '20' }]}>
                  <MaterialCommunityIcons name="information-outline" size={22} color={iconColor} />
                </View>
                <View style={styles.settingTextContainer}>
                  <Text style={[styles.settingText, { color: themeColors.text }]}>
                    Port
                  </Text>
                  <Text style={[styles.settingDescription, { color: themeColors.secondaryText }]}>
                    {serverStatus.port}
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

        {serverStatus.isRunning && (
          <SettingsSection title="QR CODE">
            <View style={styles.qrDisplayContainer}>
              <View style={[styles.qrWrapper, { backgroundColor: '#FFFFFF' }]}>
                {serverStatus.url && (
                  <QRCodeStyled
                    data={serverStatus.url}
                    style={styles.qrCode}
                    size={160}
                    color={themeColors.primary}
                  />
                )}
              </View>
              <Text style={[styles.qrTitle, { color: themeColors.text }]}>
                Scan to Access Server
              </Text>
              <Text style={[styles.qrDescription, { color: themeColors.secondaryText }]}>
                Scan this QR code with any device on the same WiFi network to open the Inferra chat interface
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
              onValueChange={setAutoStart}
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