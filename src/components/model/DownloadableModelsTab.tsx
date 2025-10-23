import React, { useState, useCallback, useEffect } from 'react';
import { View, ScrollView, StyleSheet } from 'react-native';
import { Dialog, Portal, Button, Text as PaperText } from 'react-native-paper';
import UnifiedModelList from './UnifiedModelList';
import CustomUrlDialog from '../CustomUrlDialog';
import { DownloadableModel } from './DownloadableModelItem';
import { StoredModel } from '../../services/ModelDownloaderTypes';
import { DOWNLOADABLE_MODELS } from '../../constants/DownloadableModels';
import { FilterOptions } from '../ModelFilter';

interface DownloadableModelsTabProps {
  storedModels: StoredModel[];
  downloadProgress: Record<string, any>;
  setDownloadProgress: (progress: any) => void;
  navigation: any;
  onCustomDownload: (downloadId: number, modelName: string) => void;
}

export const DownloadableModelsTab: React.FC<DownloadableModelsTabProps> = ({
  storedModels,
  downloadProgress,
  setDownloadProgress,
  navigation,
  onCustomDownload
}) => {
  const [customUrlDialogVisible, setCustomUrlDialogVisible] = useState(false);
  const [guidanceDialogVisible, setGuidanceDialogVisible] = useState(false);
  const [filters, setFilters] = useState<FilterOptions>({
    tags: [],
    modelFamilies: [],
    quantizations: [],
  });
  const [filteredModels, setFilteredModels] = useState<DownloadableModel[]>([]);

  useEffect(() => {
    setFilteredModels(DOWNLOADABLE_MODELS);
  }, []);

  const applyFilters = useCallback((newFilters: FilterOptions) => {
    setFilters(newFilters);
    
    let filtered = [...DOWNLOADABLE_MODELS];
    
    if (newFilters.tags.length > 0) {
      filtered = filtered.filter(model => 
        model.tags && model.tags.some(tag => newFilters.tags.includes(tag))
      );
    }
    
    if (newFilters.modelFamilies.length > 0) {
      filtered = filtered.filter(model => 
        newFilters.modelFamilies.includes(model.modelFamily)
      );
    }
    
    if (newFilters.quantizations.length > 0) {
      filtered = filtered.filter(model => 
        newFilters.quantizations.includes(model.quantization)
      );
    }
    
    setFilteredModels(filtered);
  }, []);

  const getAvailableFilterOptions = () => {
    const allTags = [...new Set(DOWNLOADABLE_MODELS.flatMap(model => model.tags || []))];
    const allModelFamilies = [...new Set(DOWNLOADABLE_MODELS.map(model => model.modelFamily))];
    const allQuantizations = [...new Set(DOWNLOADABLE_MODELS.map(model => model.quantization))];
    
    return {
      tags: allTags,
      modelFamilies: allModelFamilies,
      quantizations: allQuantizations,
    };
  };

  return (
    <View style={styles.container}>
      <UnifiedModelList
        curatedModels={filteredModels}
        storedModels={storedModels}
        downloadProgress={downloadProgress}
        setDownloadProgress={setDownloadProgress}
        filters={filters}
        onFiltersChange={applyFilters}
        getAvailableFilterOptions={getAvailableFilterOptions}
        onCustomUrlPress={() => setCustomUrlDialogVisible(true)}
        onGuidancePress={() => setGuidanceDialogVisible(true)}
      />

      <CustomUrlDialog
        visible={customUrlDialogVisible}
        onClose={() => setCustomUrlDialogVisible(false)}
        onDownloadStart={onCustomDownload}
        navigation={navigation}
      />

      <Portal>
        <Dialog visible={guidanceDialogVisible} onDismiss={() => setGuidanceDialogVisible(false)}>
          <Dialog.Title>Model Download Guidance</Dialog.Title>
          <Dialog.Content>
            <ScrollView style={{ maxHeight: 400 }} showsVerticalScrollIndicator={false}>
              <PaperText style={{ fontSize: 16, fontWeight: '600', marginBottom: 8 }}>
                Unsure what to download?
              </PaperText>
              <PaperText style={{ marginBottom: 16, lineHeight: 20 }}>
                If you don't know what to download first, start with Gemma 3 Instruct - 1B.
              </PaperText>

              <PaperText style={{ fontSize: 16, fontWeight: '600', marginBottom: 8 }}>
                Understanding Model Sizes
              </PaperText>
              <PaperText style={{ marginBottom: 16, lineHeight: 20 }}>
                • <PaperText style={{ fontWeight: '600' }}>1B-3B models:</PaperText> Fast and lightweight, great for simple tasks{'\n'}
                • <PaperText style={{ fontWeight: '600' }}>7B-9B models:</PaperText> Good balance of speed and capability{'\n'}
                • <PaperText style={{ fontWeight: '600' }}>13B+ models:</PaperText> More capable but slower, need more memory
              </PaperText>

              <PaperText style={{ fontSize: 16, fontWeight: '600', marginBottom: 8 }}>
                Quantization Explained
              </PaperText>
              <PaperText style={{ marginBottom: 12, lineHeight: 20 }}>
                Quantization reduces model size while trying to preserve quality:
              </PaperText>

              <PaperText style={{ fontWeight: '600', marginBottom: 4 }}>Quality Levels (Best to Fastest):</PaperText>
              <PaperText style={{ marginBottom: 12, lineHeight: 18 }}>
                • <PaperText style={{ fontWeight: '600' }}>Q8_0:</PaperText> Highest quality, largest size{'\n'}
                • <PaperText style={{ fontWeight: '600' }}>Q6_K:</PaperText> Very good quality{'\n'}
                • <PaperText style={{ fontWeight: '600' }}>Q5_K_M:</PaperText> Good balance{'\n'}
                • <PaperText style={{ fontWeight: '600' }}>Q4_K_M:</PaperText> Decent quality, smaller size{'\n'}
                • <PaperText style={{ fontWeight: '600' }}>Q3_K_M:</PaperText> Lower quality but very fast
              </PaperText>

              <PaperText style={{ fontWeight: '600', marginBottom: 4 }}>Advanced Types:</PaperText>
              <PaperText style={{ marginBottom: 12, lineHeight: 18 }}>
                • <PaperText style={{ fontWeight: '600' }}>IQ types:</PaperText> More precise but slower than Q types{'\n'}
                • <PaperText style={{ fontWeight: '600' }}>_XS:</PaperText> Extra small, more compressed{'\n'}
                • <PaperText style={{ fontWeight: '600' }}>_NL:</PaperText> Non-linear, better results with more compute{'\n'}
                • <PaperText style={{ fontWeight: '600' }}>_K types:</PaperText> Mixed precision for better quality
              </PaperText>
            </ScrollView>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setGuidanceDialogVisible(false)}>Got it!</Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
