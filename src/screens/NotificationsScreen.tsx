import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View, FlatList, RefreshControl, TouchableOpacity } from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../types/navigation';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { theme } from '../constants/theme';

type NotificationsScreenProps = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Notifications'>;
};

type Notification = {
  id: string;
  title: string;
  description: string;
  time: string;
  type: string;
  downloadId?: number;
};

export default function NotificationsScreen({ navigation }: NotificationsScreenProps) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const { theme: currentTheme } = useTheme();
  const themeColors = theme[currentTheme];

  const loadNotifications = async () => {
    try {
      // Get download notifications from AsyncStorage
      const downloadNotificationsJson = await AsyncStorage.getItem('downloadNotifications');
      let downloadNotifications: Notification[] = [];
      
      if (downloadNotificationsJson) {
        const parsedNotifications = JSON.parse(downloadNotificationsJson);
        downloadNotifications = parsedNotifications.map((notification: any) => ({
          id: notification.id,
          title: notification.title,
          description: notification.description,
          time: new Date(notification.timestamp).toLocaleString(),
          type: notification.type,
          downloadId: notification.downloadId
        }));
      }
      
      // Sort notifications by time (newest first)
      const sortedNotifications = [...downloadNotifications].sort((a, b) => {
        return new Date(b.time).getTime() - new Date(a.time).getTime();
      });
      
      setNotifications(sortedNotifications);
    } catch (error) {
      console.error('Error loading notifications:', error);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadNotifications();
    setRefreshing(false);
  };

  const clearAllNotifications = async () => {
    try {
      await AsyncStorage.removeItem('downloadNotifications');
      setNotifications([]);
    } catch (error) {
      console.error('Error clearing notifications:', error);
    }
  };

  useEffect(() => {
    loadNotifications();
    
    // Refresh notifications when the screen comes into focus
    const unsubscribe = navigation.addListener('focus', () => {
      loadNotifications();
    });
    
    return unsubscribe;
  }, [navigation]);

  const getIconForNotificationType = (type: string) => {
    switch (type) {
      case 'download_started':
        return 'cloud-download-outline';
      case 'download_progress':
        return 'refresh-outline';
      case 'download_completed':
        return 'checkmark-circle-outline';
      case 'download_failed':
        return 'alert-circle-outline';
      case 'download_paused':
        return 'pause-outline';
      case 'download_resumed':
        return 'play-outline';
      default:
        return 'notifications-outline';
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: themeColors.background }]}>
      {notifications.length > 0 ? (
        <>
          <View style={styles.header}>
            <Text style={[styles.headerTitle, { color: themeColors.text }]}>Notifications</Text>
            <TouchableOpacity onPress={clearAllNotifications}>
              <Text style={styles.clearButton}>Clear All</Text>
            </TouchableOpacity>
          </View>
          <FlatList
            data={notifications}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <View style={[styles.notificationItem, { borderBottomColor: themeColors.borderColor }]}>
                <View style={styles.iconContainer}>
                  <Ionicons 
                    name={getIconForNotificationType(item.type)} 
                    size={24} 
                    color={themeColors.primary} 
                  />
                </View>
                <View style={styles.notificationContent}>
                  <Text style={[styles.title, { color: themeColors.text }]}>{item.title}</Text>
                  <Text style={[styles.description, { color: themeColors.secondaryText }]}>{item.description}</Text>
                  <Text style={[styles.time, { color: themeColors.tertiaryText }]}>{item.time}</Text>
                </View>
              </View>
            )}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                colors={[themeColors.primary]}
                tintColor={themeColors.primary}
              />
            }
          />
        </>
      ) : (
        <View style={styles.emptyContainer}>
          <Ionicons name="notifications-off-outline" size={64} color={themeColors.tertiaryText} />
          <Text style={[styles.emptyText, { color: themeColors.tertiaryText }]}>No notifications yet</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  clearButton: {
    color: '#007AFF',
    fontSize: 14,
  },
  notificationItem: {
    flexDirection: 'row',
    padding: 15,
    borderBottomWidth: 1,
  },
  iconContainer: {
    marginRight: 15,
    justifyContent: 'center',
  },
  notificationContent: {
    flex: 1,
  },
  title: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  description: {
    marginTop: 4,
  },
  time: {
    fontSize: 12,
    marginTop: 4,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  emptyText: {
    fontSize: 16,
    marginTop: 10,
  },
}); 