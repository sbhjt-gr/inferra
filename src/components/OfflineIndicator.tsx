import React from 'react';
import { StyleSheet, View, TouchableOpacity } from 'react-native';
import { Text, Surface, Button } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { useNetworkState } from '../hooks/useNetworkState';
import { theme } from '../constants/theme';

interface OfflineIndicatorProps {
  onRetry?: () => void;
  showRetryButton?: boolean;
}

export const OfflineIndicator: React.FC<OfflineIndicatorProps> = ({ 
  onRetry, 
  showRetryButton = true 
}) => {
  const { theme: currentTheme } = useTheme();
  const themeColors = theme[currentTheme];
  const { isOffline, hasOfflineData, isAuthenticatedOffline, checkNetworkState } = useNetworkState();

  if (!isOffline) {
    return null;
  }

  const handleRetry = async () => {
    await checkNetworkState();
    if (onRetry) {
      onRetry();
    }
  };

  const getStatusMessage = () => {
    if (isAuthenticatedOffline) {
      return "You're offline, but you can still use the app with your cached data.";
    } else if (hasOfflineData) {
      return "You're offline. Some features may be limited.";
    } else {
      return "You're offline. Please check your internet connection.";
    }
  };

  const getStatusIcon = () => {
    if (isAuthenticatedOffline) {
      return "wifi-off";
    } else {
      return "cloud-off-outline";
    }
  };

  const getStatusColor = () => {
    if (isAuthenticatedOffline) {
      return themeColors.warning || '#FF9800';
    } else {
      return themeColors.error || '#F44336';
    }
  };

  return (
    <Surface style={[styles.container, { backgroundColor: getStatusColor() }]} elevation={2}>
      <View style={styles.content}>
        <MaterialCommunityIcons 
          name={getStatusIcon()} 
          size={20} 
          color="#FFFFFF" 
          style={styles.icon}
        />
        <Text style={[styles.message, { color: '#FFFFFF' }]}>
          {getStatusMessage()}
        </Text>
        {showRetryButton && (
          <TouchableOpacity onPress={handleRetry} style={styles.retryButton}>
            <MaterialCommunityIcons name="refresh" size={16} color="#FFFFFF" />
          </TouchableOpacity>
        )}
      </View>
    </Surface>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 1000,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  icon: {
    marginRight: 8,
  },
  message: {
    flex: 1,
    fontSize: 14,
    fontWeight: '500',
  },
  retryButton: {
    padding: 4,
    marginLeft: 8,
  },
}); 