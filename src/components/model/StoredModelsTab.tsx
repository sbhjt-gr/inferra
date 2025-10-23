import React from 'react';
import { View, Text, FlatList, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import { theme } from '../../constants/theme';
import { getThemeAwareColor } from '../../utils/ColorUtils';
import StoredModelItem from './StoredModelItem';
import { StoredModel } from '../../services/ModelDownloaderTypes';

interface StoredModelsTabProps {
  storedModels: StoredModel[];
  isLoading: boolean;
  isRefreshing: boolean;
  onRefresh: () => void;
  onImportModel: () => void;
  onDelete: (model: StoredModel) => void;
  onExport: (modelPath: string, modelName: string) => Promise<void>;
  onSettings: (modelPath: string, modelName: string) => void;
}

export const StoredModelsTab: React.FC<StoredModelsTabProps> = ({
  storedModels,
  isLoading,
  isRefreshing,
  onRefresh,
  onImportModel,
  onDelete,
  onExport,
  onSettings
}) => {
  const { theme: currentTheme } = useTheme();
  const themeColors = theme[currentTheme as 'light' | 'dark'];

  const StoredModelsHeader = () => (
    <View style={styles.storedModelsHeader}>
      <View style={styles.storedHeaderActions}>
        <Text style={[styles.storedHeaderTitle, { color: themeColors.text }]}>Stored Models</Text>
        <TouchableOpacity
          style={[styles.refreshButton, { backgroundColor: themeColors.borderColor }]}
          onPress={onRefresh}
          disabled={isRefreshing}
        >
          {isRefreshing ? (
            <ActivityIndicator size="small" color={getThemeAwareColor('#4a0660', currentTheme)} />
          ) : (
            <MaterialCommunityIcons name="refresh" size={20} color={themeColors.text} />
          )}
        </TouchableOpacity>
      </View>
      <TouchableOpacity
        style={[styles.customUrlButton, { backgroundColor: themeColors.borderColor }]}
        onPress={onImportModel}
      >
        <View style={styles.customUrlButtonContent}>
          <View style={styles.customUrlIconContainer}>
            <MaterialCommunityIcons name="link" size={24} color={getThemeAwareColor('#4a0660', currentTheme)} />
          </View>
          <View style={styles.customUrlTextContainer}>
            <Text style={[styles.customUrlButtonTitle, { color: themeColors.text }]}>
              Import Model
            </Text>
            <Text style={[styles.customUrlButtonSubtitle, { color: themeColors.secondaryText }]}>
              Import a GGUF model from the storage
            </Text>
          </View>
        </View>
      </TouchableOpacity>
    </View>
  );

  const renderItem = ({ item }: { item: StoredModel }) => {
    const isProjectorModel = item.name.toLowerCase().includes('mmproj') ||
                            item.name.toLowerCase().includes('.proj');
    
    return (
      <StoredModelItem
        id={item.path}
        name={item.name}
        path={item.path}
        size={item.size}
        isProjector={isProjectorModel}
        onDelete={() => onDelete(item)}
        onExport={onExport}
        onSettings={onSettings}
      />
    );
  };

  return (
    <FlatList
      data={storedModels}
      renderItem={renderItem}
      keyExtractor={item => item.path}
      contentContainerStyle={styles.list}
      ListHeaderComponent={StoredModelsHeader}
      ListEmptyComponent={
        isLoading ? (
          <View style={styles.emptyContainer}>
            <ActivityIndicator size="large" color={getThemeAwareColor('#4a0660', currentTheme)} />
            <Text style={[styles.emptyText, { color: themeColors.secondaryText, marginTop: 16 }]}>
              Loading models...
            </Text>
          </View>
        ) : (
          <View style={styles.emptyContainer}>
            <MaterialCommunityIcons 
              name="folder-open" 
              size={48} 
              color={themeColors.secondaryText}
            />
            <Text style={[styles.emptyText, { color: themeColors.secondaryText }]}>
              No models downloaded yet. Go to the "Download Models" tab to get started.
            </Text>
          </View>
        )
      }
    />
  );
};

const styles = StyleSheet.create({
  list: {
    padding: 16,
    paddingTop: 8,
  },
  storedModelsHeader: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 16,
  },
  storedHeaderActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  storedHeaderTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
  refreshButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  customUrlButton: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 12,
  },
  customUrlButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  customUrlIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(74, 6, 96, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  customUrlTextContainer: {
    flex: 1,
  },
  customUrlButtonTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
  customUrlButtonSubtitle: {
    fontSize: 14,
    marginTop: 2,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 60,
  },
  emptyText: {
    textAlign: 'center',
    fontSize: 16,
    marginTop: 8,
  },
});
