import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Text, ActivityIndicator } from 'react-native-paper';
import { useTheme } from '../../context/ThemeContext';
import { theme } from '../../constants/theme';
import { HFModel } from '../../services/HuggingFaceService';
import DownloadableModelItem, { DownloadableModel } from './DownloadableModelItem';

interface HuggingFaceModelsListProps {
  models: HFModel[];
  isLoading: boolean;
  searchQuery: string;
  onModelPress: (model: HFModel) => void;
  onModelDownload: (model: DownloadableModel) => void;
  isModelDownloaded: (modelId: string) => boolean;
  convertHfModelToDownloadable: (hfModel: HFModel) => DownloadableModel;
}

export const HuggingFaceModelsList: React.FC<HuggingFaceModelsListProps> = ({
  models,
  isLoading,
  searchQuery,
  onModelPress,
  onModelDownload,
  isModelDownloaded,
  convertHfModelToDownloadable
}) => {
  const { theme: currentTheme } = useTheme();
  const themeColors = theme[currentTheme];

  return (
    <View style={styles.container}>
      <View style={styles.sectionHeader}>
        <Text style={[styles.sectionHeaderTitle, { color: themeColors.text }]}>
          HuggingFace Models ({models.length})
        </Text>
        {isLoading && <ActivityIndicator size="small" color={themeColors.primary} />}
      </View>
      
      {models.length > 0 ? (
        models.map((hfModel) => {
          const convertedModel = convertHfModelToDownloadable(hfModel);
          const isDownloaded = isModelDownloaded(hfModel.id);
          
          return (
            <DownloadableModelItem
              key={hfModel.id}
              model={convertedModel}
              isDownloaded={isDownloaded}
              isDownloading={false}
              isInitializing={false}
              onDownload={onModelDownload}
              onPress={() => onModelPress(hfModel)}
            />
          );
        })
      ) : (
        !isLoading && (
          <Text style={[styles.noResultsText, { color: themeColors.textSecondary }]}>
            No GGUF models found for "{searchQuery}"
          </Text>
        )
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginBottom: 24,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    gap: 8,
  },
  sectionHeaderTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
  noResultsText: {
    textAlign: 'center',
    fontSize: 16,
    fontStyle: 'italic',
    marginTop: 20,
  },
});
