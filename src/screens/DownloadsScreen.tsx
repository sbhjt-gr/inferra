import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Platform,
  Alert,
} from 'react-native';
import { useTheme } from '../context/ThemeContext';
import { theme } from '../constants/theme';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../types/navigation';
import { modelDownloader } from '../services/ModelDownloader';
import { useDownloads } from '../context/DownloadContext';

const formatBytes = (bytes: number) => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
};

export default function DownloadsScreen() {
  const { theme: currentTheme } = useTheme();
  const themeColors = theme[currentTheme as 'light' | 'dark'];
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { downloadProgress, setDownloadProgress } = useDownloads();

  // Convert downloadProgress object to array for FlatList
  const downloads = Object.entries(downloadProgress).map(([name, data]) => ({
    id: data.downloadId,
    name,
    progress: data.progress,
    bytesDownloaded: data.bytesDownloaded,
    totalBytes: data.totalBytes,
    status: data.status
  }));

  const handleCancel = async (downloadId: number, modelName: string) => {
    Alert.alert(
      'Cancel Download',
      'Are you sure you want to cancel this download?',
      [
        {
          text: 'No',
          style: 'cancel'
        },
        {
          text: 'Yes',
          style: 'destructive',
          onPress: async () => {
            try {
              await modelDownloader.cancelDownload(downloadId);
              setDownloadProgress(prev => {
                const newProgress = { ...prev };
                delete newProgress[modelName];
                return newProgress;
              });
            } catch (error) {
              console.error('Error canceling download:', error);
              Alert.alert('Error', 'Failed to cancel download');
            }
          }
        }
      ]
    );
  };

  const renderItem = ({ item }) => (
    <View style={[styles.downloadItem, { backgroundColor: themeColors.borderColor }]}>
      <View style={styles.downloadHeader}>
        <Text style={[styles.downloadName, { color: themeColors.text }]}>
          {item.name}
        </Text>
        <TouchableOpacity
          style={styles.cancelButton}
          onPress={() => handleCancel(item.id, item.name)}
        >
          <Ionicons name="close-circle" size={24} color="#ff4444" />
        </TouchableOpacity>
      </View>
      
      <Text style={[styles.downloadProgress, { color: themeColors.secondaryText }]}>
        {`${item.progress}% • ${formatBytes(item.bytesDownloaded)} / ${formatBytes(item.totalBytes)}`}
      </Text>
      
      <View style={[styles.progressBar, { backgroundColor: themeColors.background }]}>
        <View 
          style={[
            styles.progressFill, 
            { width: `${item.progress}%`, backgroundColor: '#4a0660' }
          ]} 
        />
      </View>
    </View>
  );

  return (
    <View style={[styles.container, { backgroundColor: themeColors.background }]}>
      <View style={[styles.header, { backgroundColor: themeColors.headerBackground }]}>
        <TouchableOpacity 
          style={styles.backButton}
          onPress={() => navigation.goBack()}
        >
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Active Downloads</Text>
      </View>
      
      <FlatList
        data={downloads}
        renderItem={renderItem}
        keyExtractor={item => item.id.toString()}
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
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    paddingTop: Platform.OS === 'ios' ? 60 : 16,
  },
  backButton: {
    marginRight: 16,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#fff',
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
  },
  downloadName: {
    fontSize: 16,
    fontWeight: '500',
    marginBottom: 4,
  },
  downloadProgress: {
    fontSize: 14,
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
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 32,
  },
  emptyText: {
    fontSize: 16,
  },
  cancelButton: {
    padding: 4,
  },
}); 