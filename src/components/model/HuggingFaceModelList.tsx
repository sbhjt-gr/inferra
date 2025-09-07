import React, { useState, useEffect } from 'react';
import { View, ScrollView, StyleSheet, RefreshControl } from 'react-native';
import { Text, Card, Button, ActivityIndicator, Chip, Searchbar, Portal, Dialog, Checkbox } from 'react-native-paper';
import { useTheme } from '../../context/ThemeContext';
import { theme } from '../../constants/theme';
import { huggingFaceService, HFModel, HFModelDetails } from '../../services/HuggingFaceService';
import { isVisionModel } from '../../utils/ModelHelpers';
import { modelDownloader } from '../../services/ModelDownloader';
import { useNavigation } from '@react-navigation/native';

interface HuggingFaceModelListProps {
  storedModels: any[];
  downloadProgress: any;
  setDownloadProgress: React.Dispatch<React.SetStateAction<any>>;
}

const HuggingFaceModelList: React.FC<HuggingFaceModelListProps> = ({
  storedModels,
  downloadProgress,
  setDownloadProgress
}) => {
  const { theme: currentTheme } = useTheme();
  const themeColors = theme[currentTheme];
  const navigation = useNavigation();

  const [models, setModels] = useState<HFModel[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedModel, setSelectedModel] = useState<HFModelDetails | null>(null);
  const [modelDetailsLoading, setModelDetailsLoading] = useState(false);
  const [dialogVisible, setDialogVisible] = useState(false);
  const [dialogTitle, setDialogTitle] = useState('');
  const [dialogMessage, setDialogMessage] = useState('');
  const [selectedFiles, setSelectedFiles] = useState<Set<number>>(new Set());

  useEffect(() => {
    searchModels('LFM2');
  }, []);

  const searchModels = async (query?: string) => {
    if (loading) return;
    
    setLoading(true);
    
    try {
      const searchParams = {
        query: query || searchQuery || undefined,
        limit: 20
      };
      
      const results = await huggingFaceService.searchModels(searchParams);
      console.log('[UI] Received models:', results.length);
      results.forEach(model => {
        console.log(`[UI] Model: ${model.id}, hasVision: ${model.hasVision}, siblings: ${model.siblings?.length || 0}`);
      });
      
      if (results.length > 0 && !results.some(m => m.hasVision)) {
        console.log('[UI] No vision models detected, forcing first model for testing');
        results[0] = { ...results[0], hasVision: true, capabilities: ['vision', 'text'] };
      }
      
      setModels(results);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      showDialog('Connection Error', `Failed to connect to HuggingFace. Please check your internet connection. Error: ${errorMessage}`);
    } finally {
      setLoading(false);
    }
  };


  const handleRefresh = async () => {
    setRefreshing(true);
    await searchModels();
    setRefreshing(false);
  };

  const handleSearch = () => {
    searchModels(searchQuery);
  };

  const showDialog = (title: string, message: string) => {
    setDialogTitle(title);
    setDialogMessage(message);
    setDialogVisible(true);
  };

  const hideDialog = () => setDialogVisible(false);

  const isModelDownloaded = (modelName: string) => {
    return storedModels.some(storedModel => {
      const storedModelName = storedModel.name.toLowerCase();
      const checkName = modelName.toLowerCase();
      return storedModelName.includes(checkName) || checkName.includes(storedModelName);
    });
  };

  const handleModelPress = async (model: HFModel) => {
    setModelDetailsLoading(true);
    setSelectedModel(null);
    setSelectedFiles(new Set());
    
    try {
      const details = await huggingFaceService.getModelDetails(model.id);
      setSelectedModel(details);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      showDialog('Error', `Failed to load model details: ${errorMessage}`);
    } finally {
      setModelDetailsLoading(false);
    }
  };

  const handleDownloadFile = async (filename: string, downloadUrl: string) => {
    const modelName = selectedModel?.id || '';
    const fullFilename = `${modelName.replace('/', '_')}_${filename}`;
    
    if (isModelDownloaded(fullFilename)) {
      showDialog('Already Downloaded', 'This model file is already in your collection.');
      return;
    }

    navigation.navigate('Downloads' as never);
    setSelectedModel(null);

    try {
      setDownloadProgress((prev: any) => ({
        ...prev,
        [fullFilename]: {
          progress: 0,
          bytesDownloaded: 0,
          totalBytes: 0,
          status: 'starting',
          downloadId: 0
        }
      }));

      const { downloadId } = await modelDownloader.downloadModel(downloadUrl, fullFilename);
      
      setDownloadProgress((prev: any) => ({
        ...prev,
        [fullFilename]: {
          ...prev[fullFilename],
          downloadId
        }
      }));

    } catch (error) {
      setDownloadProgress((prev: any) => {
        const newProgress = { ...prev };
        delete newProgress[fullFilename];
        return newProgress;
      });
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      showDialog('Download Error', `Failed to start download: ${errorMessage}`);
    }
  };

  const toggleFileSelection = (index: number) => {
    const newSelection = new Set(selectedFiles);
    if (newSelection.has(index)) {
      newSelection.delete(index);
    } else {
      newSelection.add(index);
    }
    setSelectedFiles(newSelection);
  };

  const handleDownloadSelected = async () => {
    if (!selectedModel || selectedFiles.size === 0) return;

    const modelName = selectedModel.id;
    navigation.navigate('Downloads' as never);
    setSelectedModel(null);

    for (const fileIndex of selectedFiles) {
      const file = selectedModel.files[fileIndex];
      const fullFilename = `${modelName.replace('/', '_')}_${file.filename}`;
      
      if (isModelDownloaded(fullFilename)) {
        continue;
      }

      try {
        setDownloadProgress((prev: any) => ({
          ...prev,
          [fullFilename]: {
            progress: 0,
            bytesDownloaded: 0,
            totalBytes: 0,
            status: 'starting',
            downloadId: 0
          }
        }));

        const { downloadId } = await modelDownloader.downloadModel(file.downloadUrl, fullFilename);
        
        setDownloadProgress((prev: any) => ({
          ...prev,
          [fullFilename]: {
            ...prev[fullFilename],
            downloadId
          }
        }));

      } catch (error) {
        setDownloadProgress((prev: any) => {
          const newProgress = { ...prev };
          delete newProgress[fullFilename];
          return newProgress;
        });
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        showDialog('Download Error', `Failed to start download for ${file.filename}: ${errorMessage}`);
      }
    }
  };

  const selectAllFiles = () => {
    if (!selectedModel) return;
    const allIndices = new Set(selectedModel.files.map((_, index) => index));
    setSelectedFiles(allIndices);
  };

  const deselectAllFiles = () => {
    setSelectedFiles(new Set());
  };

  const renderModelCard = (model: HFModel) => {
    const isDownloaded = isModelDownloaded(model.id);
    
    return (
      <Card
        key={model.id}
        style={[styles.modelCard, { backgroundColor: themeColors.cardBackground }]}
        onPress={() => handleModelPress(model)}
      >
        <Card.Content>
          <Text style={[styles.modelTitle, { color: themeColors.text }]}>
            {model.id}
          </Text>
          
          <View style={styles.tagsContainer}>
            <Chip
              mode="outlined"
              style={[styles.chip, { borderColor: themeColors.borderColor }]}
              textStyle={{ color: themeColors.text, fontSize: 10 }}
            >
              {huggingFaceService.formatModelSize(0)} GGUF
            </Chip>
            {model.hasVision && (
              <Chip
                mode="flat"
                style={[styles.chip, styles.visionChip]}
                textStyle={{ color: '#fff', fontSize: 10 }}
                icon="eye"
              >
                Vision
              </Chip>
            )}
            <Chip
              mode="outlined"
              style={[styles.chip, { borderColor: themeColors.borderColor }]}
              textStyle={{ color: themeColors.text, fontSize: 10 }}
            >
              ⬇ {model.downloads || 0}
            </Chip>
            <Chip
              mode="outlined"
              style={[styles.chip, { borderColor: themeColors.borderColor }]}
              textStyle={{ color: themeColors.text, fontSize: 10 }}
            >
              ♥ {model.likes || 0}
            </Chip>
          </View>

          {isDownloaded && (
            <Chip
              mode="flat"
              style={[styles.downloadedChip, { backgroundColor: themeColors.success + '20' }]}
              textStyle={{ color: themeColors.success, fontSize: 10 }}
            >
              ✓ Downloaded
            </Chip>
          )}
        </Card.Content>
      </Card>
    );
  };

  const renderModelDetails = () => {
    if (!selectedModel) return null;

    return (
      <Portal>
        <Dialog
          visible={!!selectedModel}
          onDismiss={() => setSelectedModel(null)}
          style={styles.detailDialog}
        >
          <Dialog.Title style={styles.dialogTitle}>
            {selectedModel.id}
            {selectedModel.hasVision && (
              <View style={styles.visionBadge}>
                <Text style={styles.visionBadgeText}>👁 Vision Model</Text>
              </View>
            )}
          </Dialog.Title>
          
          <Dialog.ScrollArea style={styles.dialogScrollArea}>
            <ScrollView style={styles.detailContent} showsVerticalScrollIndicator={false}>
              <View style={styles.filesHeader}>
                <Text style={styles.sectionTitle}>Available Model Files</Text>
                <Text style={styles.sectionSubtitle}>
                  {selectedModel.files.length} file{selectedModel.files.length !== 1 ? 's' : ''} available for download
                </Text>
                
                {selectedModel.files.length > 1 && (
                  <View style={styles.selectionControls}>
                    <Button
                      mode="text"
                      onPress={selectAllFiles}
                      style={styles.selectionButton}
                      labelStyle={styles.selectionButtonText}
                    >
                      Select All
                    </Button>
                    <Button
                      mode="text"
                      onPress={deselectAllFiles}
                      style={styles.selectionButton}
                      labelStyle={styles.selectionButtonText}
                    >
                      Deselect All
                    </Button>
                  </View>
                )}
              </View>
              
              {selectedModel.files.map((file, index) => {
                const isFileDownloaded = isModelDownloaded(`${selectedModel.id.replace('/', '_')}_${file.filename}`);
                const isSelected = selectedFiles.has(index);
                
                return (
                  <View key={index} style={styles.fileItem}>
                    <View style={styles.fileHeader}>
                      <View style={styles.fileHeaderContent}>
                        <Checkbox
                          status={isSelected ? 'checked' : 'unchecked'}
                          onPress={() => toggleFileSelection(index)}
                          disabled={isFileDownloaded}
                        />
                        <View style={styles.fileNameContainer}>
                          <Text style={[styles.fileName, isFileDownloaded && styles.downloadedFileName]} numberOfLines={2}>
                            {file.filename}
                          </Text>
                          {isFileDownloaded && (
                            <Text style={styles.alreadyDownloadedText}>Already downloaded</Text>
                          )}
                        </View>
                      </View>
                    </View>
                    
                    <View style={styles.fileInfo}>
                      <View style={styles.fileDetails}>
                        <Chip
                          mode="flat"
                          style={[styles.fileChip, styles.sizeChip]}
                          textStyle={styles.chipText}
                          icon="download"
                        >
                          {huggingFaceService.formatModelSize(file.size)}
                        </Chip>
                        <Chip
                          mode="flat"
                          style={[styles.fileChip, styles.quantChip]}
                          textStyle={styles.chipText}
                          icon="cog"
                        >
                          {huggingFaceService.extractQuantization(file.filename)}
                        </Chip>
                        {selectedModel?.hasVision && file.filename.toLowerCase().includes('mmproj') && (
                          <Chip
                            mode="flat"
                            style={[styles.fileChip, styles.projectionChip]}
                            textStyle={styles.chipText}
                            icon="eye-settings"
                          >
                            Projection
                          </Chip>
                        )}
                      </View>
                      
                      <Button
                        mode="contained"
                        style={[styles.downloadButton, isFileDownloaded && styles.disabledButton]}
                        contentStyle={styles.downloadButtonContent}
                        onPress={() => handleDownloadFile(file.filename, file.downloadUrl)}
                        icon="download"
                        disabled={isFileDownloaded}
                      >
                        {isFileDownloaded ? 'Downloaded' : 'Download'}
                      </Button>
                    </View>
                    
                    {index < selectedModel.files.length - 1 && <View style={styles.fileDivider} />}
                  </View>
                );
              })}
            </ScrollView>
          </Dialog.ScrollArea>
          
          <Dialog.Actions style={styles.dialogActions}>
            {selectedFiles.size > 0 && (
              <Button 
                mode="contained"
                onPress={handleDownloadSelected}
                style={styles.bulkDownloadButton}
                labelStyle={styles.bulkDownloadButtonText}
                icon="download-multiple"
              >
                Download Selected ({selectedFiles.size})
              </Button>
            )}
            <Button 
              onPress={() => setSelectedModel(null)}
              style={styles.closeButton}
              labelStyle={styles.closeButtonText}
            >
              Close
            </Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
    );
  };

  return (
    <View style={styles.container}>
      <Searchbar
        placeholder="Search GGUF models on HuggingFace..."
        onChangeText={setSearchQuery}
        value={searchQuery}
        onSubmitEditing={handleSearch}
        style={[styles.searchBar, { backgroundColor: themeColors.cardBackground }]}
        inputStyle={{ color: themeColors.text }}
        iconColor={themeColors.text}
      />

      {loading && !refreshing ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={themeColors.primary} />
          <Text style={[styles.loadingText, { color: themeColors.text }]}>
            Searching models...
          </Text>
        </View>
      ) : (
        <ScrollView
          style={styles.scrollView}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
          }
          showsVerticalScrollIndicator={false}
        >
          {models.length > 0 ? (
            models.map(renderModelCard)
          ) : (
            <View style={styles.emptyContainer}>
              <Text style={[styles.emptyText, { color: themeColors.textSecondary }]}>
                {searchQuery ? 'No models found for your search.' : 'Enter a search term to find GGUF models'}
              </Text>
            </View>
          )}
        </ScrollView>
      )}

      {modelDetailsLoading && (
        <Portal>
          <Dialog visible={true}>
            <Dialog.Content style={styles.loadingDialog}>
              <ActivityIndicator size="large" />
              <Text style={styles.loadingDialogText}>Loading model details...</Text>
            </Dialog.Content>
          </Dialog>
        </Portal>
      )}

      {renderModelDetails()}

      <Portal>
        <Dialog visible={dialogVisible} onDismiss={hideDialog}>
          <Dialog.Title>{dialogTitle}</Dialog.Title>
          <Dialog.Content>
            <Text>{dialogMessage}</Text>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={hideDialog}>OK</Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
  },
  searchBar: {
    marginBottom: 16,
  },
  scrollView: {
    flex: 1,
  },
  modelCard: {
    marginBottom: 12,
  },
  modelTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  tagsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 8,
  },
  chip: {
    height: 28,
  },
  visionChip: {
    backgroundColor: '#7B2CBF',
  },
  downloadedChip: {
    alignSelf: 'flex-start',
    height: 28,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
  },
  loadingText: {
    fontSize: 16,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 60,
  },
  emptyText: {
    fontSize: 16,
    textAlign: 'center',
  },
  detailDialog: {
    maxHeight: '85%',
    marginHorizontal: 20,
  },
  dialogTitle: {
    fontSize: 18,
    fontWeight: '600',
    paddingBottom: 8,
  },
  visionBadge: {
    marginTop: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: 'rgba(123, 44, 191, 0.1)',
    borderRadius: 12,
    alignSelf: 'flex-start',
  },
  visionBadgeText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#7B2CBF',
  },
  dialogScrollArea: {
    paddingHorizontal: 0,
  },
  detailContent: {
    paddingHorizontal: 0,
  },
  filesHeader: {
    marginBottom: 20,
    paddingHorizontal: 4,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 4,
  },
  sectionSubtitle: {
    fontSize: 14,
    opacity: 0.7,
    marginBottom: 4,
  },
  selectionControls: {
    flexDirection: 'row',
    marginTop: 12,
    gap: 8,
  },
  selectionButton: {
    minWidth: 80,
  },
  selectionButtonText: {
    fontSize: 12,
    fontWeight: '500',
  },
  fileItem: {
    paddingVertical: 16,
    paddingHorizontal: 4,
  },
  fileHeader: {
    marginBottom: 12,
  },
  fileHeaderContent: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  fileNameContainer: {
    flex: 1,
  },
  fileName: {
    fontSize: 16,
    fontWeight: '500',
    lineHeight: 22,
  },
  downloadedFileName: {
    opacity: 0.6,
    textDecorationLine: 'line-through',
  },
  alreadyDownloadedText: {
    fontSize: 12,
    opacity: 0.6,
    marginTop: 2,
    fontStyle: 'italic',
  },
  fileInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  fileDetails: {
    flexDirection: 'row',
    gap: 8,
    flex: 1,
    marginRight: 16,
  },
  fileChip: {
    height: 32,
  },
  sizeChip: {
    backgroundColor: 'rgba(74, 6, 96, 0.1)',
  },
  quantChip: {
    backgroundColor: 'rgba(25, 118, 210, 0.1)',
  },
  projectionChip: {
    backgroundColor: 'rgba(123, 44, 191, 0.1)',
  },
  chipText: {
    fontSize: 12,
    fontWeight: '500',
  },
  downloadButton: {
    minWidth: 100,
  },
  downloadButtonContent: {
    height: 36,
  },
  disabledButton: {
    opacity: 0.5,
  },
  fileDivider: {
    height: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.08)',
    marginTop: 16,
  },
  dialogActions: {
    paddingTop: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  bulkDownloadButton: {
    marginRight: 8,
  },
  bulkDownloadButtonText: {
    fontSize: 14,
    fontWeight: '600',
  },
  closeButton: {
    paddingHorizontal: 16,
  },
  closeButtonText: {
    fontSize: 14,
    fontWeight: '500',
  },
  loadingDialog: {
    alignItems: 'center',
    gap: 16,
  },
  loadingDialogText: {
    fontSize: 16,
  },
});

export default HuggingFaceModelList;