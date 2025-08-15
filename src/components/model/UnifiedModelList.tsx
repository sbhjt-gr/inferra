import React, { useState } from 'react';
import { View, ScrollView, StyleSheet, TouchableOpacity, Dimensions } from 'react-native';
import { useResponsive } from '../../hooks/useResponsive';
import { Text, Button, ActivityIndicator, Searchbar, Portal, Dialog, Checkbox } from 'react-native-paper';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import { theme } from '../../constants/theme';
import { useNavigation } from '@react-navigation/native';
import { getThemeAwareColor } from '../../utils/ColorUtils';
import { huggingFaceService, HFModel, HFModelDetails } from '../../services/HuggingFaceService';
import { modelDownloader } from '../../services/ModelDownloader';
import DownloadableModelList from './DownloadableModelList';
import DownloadableModelItem, { DownloadableModel } from './DownloadableModelItem';
import ModelFilter, { FilterOptions } from '../ModelFilter';

interface UnifiedModelListProps {
  curatedModels: DownloadableModel[];
  storedModels: any[];
  downloadProgress: any;
  setDownloadProgress: React.Dispatch<React.SetStateAction<any>>;
  filters: FilterOptions;
  onFiltersChange: (filters: FilterOptions) => void;
  getAvailableFilterOptions: () => { tags: string[], modelFamilies: string[], quantizations: string[] };
  onCustomUrlPress: () => void;
  onGuidancePress: () => void;
  gridColumns?: number;
}

interface ModelWarningDialogProps {
  visible: boolean;
  onAccept: (dontShowAgain: boolean) => void;
  onCancel: () => void;
}

const ModelWarningDialog: React.FC<ModelWarningDialogProps> = ({
  visible,
  onAccept,
  onCancel
}) => {
  const { theme: currentTheme } = useTheme();
  const themeColors = theme[currentTheme];
  const [dontShowAgain, setDontShowAgain] = useState(false);

  return (
    <Portal>
      <Dialog visible={visible} onDismiss={onCancel} style={styles.warningDialog}>
        <Dialog.Title style={[styles.warningTitle, { color: themeColors.text }]}>
          <MaterialCommunityIcons name="alert-circle-outline" size={20} color={themeColors.text} style={{ marginRight: 8 }} />
          Content Warning
        </Dialog.Title>
        
        <Dialog.Content style={styles.warningContent}>
          <Text style={[styles.warningText, { color: themeColors.text }]}>
            <Text style={{ fontWeight: 'bold' }}>Important:</Text> We do not own these models. They may generate harmful, biased, or inappropriate content. Use responsibly and at your own discretion.
          </Text>
          
          <View style={styles.checkboxContainer}>
            <Checkbox
              status={dontShowAgain ? 'checked' : 'unchecked'}
              onPress={() => setDontShowAgain(!dontShowAgain)}
              color={themeColors.primary}
            />
            <Text style={[styles.checkboxText, { color: themeColors.text }]}>
              Don't show again
            </Text>
          </View>
        </Dialog.Content>
        
        <Dialog.Actions style={styles.warningActions}>
          <Button mode="outlined" onPress={onCancel}>Cancel</Button>
          <Button mode="contained" onPress={() => onAccept(dontShowAgain)}>Continue</Button>
        </Dialog.Actions>
      </Dialog>
    </Portal>
  );
};

const UnifiedModelList: React.FC<UnifiedModelListProps> = ({
  curatedModels,
  storedModels,
  downloadProgress,
  setDownloadProgress,
  onFiltersChange,
  getAvailableFilterOptions,
  onCustomUrlPress,
  onGuidancePress,
  gridColumns = 1
}) => {
  const { theme: currentTheme } = useTheme();
  const themeColors = theme[currentTheme];
  const navigation = useNavigation();
  const { isTablet, orientation, paddingHorizontal } = useResponsive();
  const screenWidth = Dimensions.get('window').width;
  const availableWidth = screenWidth - (paddingHorizontal * 2);
  const needsHorizontalScroll = isTablet && orientation === 'portrait' && availableWidth < 700;
  const adjustedGridColumns = isTablet && availableWidth < 800 ? 1 : gridColumns;


  const [searchQuery, setSearchQuery] = useState('');
  const [hfModels, setHfModels] = useState<HFModel[]>([]);
  const [hfLoading, setHfLoading] = useState(false);
  const [selectedModel, setSelectedModel] = useState<HFModelDetails | null>(null);
  const [modelDetailsLoading, setModelDetailsLoading] = useState(false);
  const [dialogVisible, setDialogVisible] = useState(false);
  const [dialogTitle, setDialogTitle] = useState('');
  const [dialogMessage, setDialogMessage] = useState('');
  const [showingHfResults, setShowingHfResults] = useState(false);
  const [showWarningDialog, setShowWarningDialog] = useState(false);
  const [pendingDownload, setPendingDownload] = useState<{filename: string, downloadUrl: string, modelId: string} | null>(null);

  const showDialog = (title: string, message: string) => {
    setDialogTitle(title);
    setDialogMessage(message);
    setDialogVisible(true);
  };

  const hideDialog = () => setDialogVisible(false);

  const convertHfModelToDownloadable = (hfModel: HFModel): DownloadableModel => {
    const modelId = hfModel.id;
    const modelName = modelId.split('/').pop() || modelId;
    
    const getModelFamily = (id: string) => {
      const lowerName = id.toLowerCase();
      if (lowerName.includes('llama')) return 'Llama';
      if (lowerName.includes('mistral')) return 'Mistral';
      if (lowerName.includes('phi')) return 'Phi';
      if (lowerName.includes('gemma')) return 'Gemma';
      if (lowerName.includes('qwen')) return 'Qwen';
      if (lowerName.includes('vicuna')) return 'Vicuna';
      if (lowerName.includes('orca')) return 'Orca';
      if (lowerName.includes('falcon')) return 'Falcon';
      if (lowerName.includes('alpaca')) return 'Alpaca';
      if (lowerName.includes('codellama')) return 'CodeLlama';
      return 'Other';
    };

    const getQuantization = (name: string) => {
      const lowerName = name.toLowerCase();
      if (lowerName.includes('q8_0')) return 'Q8_0';
      if (lowerName.includes('q6_k')) return 'Q6_K';
      if (lowerName.includes('q5_k_m')) return 'Q5_K_M';
      if (lowerName.includes('q5_0')) return 'Q5_0';
      if (lowerName.includes('q4_k_m')) return 'Q4_K_M';
      if (lowerName.includes('q4_0')) return 'Q4_0';
      if (lowerName.includes('q3_k_m')) return 'Q3_K_M';
      if (lowerName.includes('q2_k')) return 'Q2_K';
      if (lowerName.includes('iq4_nl')) return 'IQ4_NL';
      if (lowerName.includes('iq3_m')) return 'IQ3_M';
      if (lowerName.includes('iq2_m')) return 'IQ2_M';
      if (lowerName.includes('f16')) return 'F16';
      if (lowerName.includes('f32')) return 'F32';
      return 'Mixed';
    };


    return {
      name: modelName,
      description: `HuggingFace model • ${hfModel.downloads || 0} downloads • ${hfModel.likes || 0} likes`,
      size: `${hfModel.downloads || 0} downloads`,
      huggingFaceLink: `https://huggingface.co/${modelId}`,
      licenseLink: '',
      modelFamily: getModelFamily(modelId),
      quantization: getQuantization(modelId),
      tags: [],
    };
  };

  const searchHuggingFace = async (query: string) => {
    if (!query.trim()) {
      setHfModels([]);
      setShowingHfResults(false);
      return;
    }

    setHfLoading(true);
    try {
      const results = await huggingFaceService.searchModels({
        query: query.trim(),
        limit: 20
      });
      setHfModels(results);
      setShowingHfResults(true);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      showDialog('Search Error', `Failed to search HuggingFace models: ${errorMessage}`);
      setHfModels([]);
      setShowingHfResults(false);
    } finally {
      setHfLoading(false);
    }
  };

  const handleSearch = (query: string) => {
    setSearchQuery(query);
    if (query.trim()) {
      searchHuggingFace(query);
    } else {
      setHfModels([]);
      setShowingHfResults(false);
    }
  };

  const clearSearch = () => {
    setSearchQuery('');
    setHfModels([]);
    setShowingHfResults(false);
  };

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

  const handleHfModelDownload = async (model: DownloadableModel) => {
    const hfModel = hfModels.find(hf => hf.id.includes(model.name) || model.name.includes(hf.id.split('/').pop() || ''));
    if (!hfModel) {
      showDialog('Error', 'Could not find model details');
      return;
    }

    await handleModelPress(hfModel);
  };

  const handleDownloadFile = async (filename: string, downloadUrl: string) => {
    const modelId = selectedModel?.id || '';
    
    setSelectedModel(null);
    
    try {
      const hideWarning = await AsyncStorage.getItem('hideModelWarning');
      const shouldShowWarning = hideWarning !== 'true';
      
      if (shouldShowWarning) {
        setPendingDownload({ filename, downloadUrl, modelId });
        setShowWarningDialog(true);
        return;
      }
      
      await proceedWithDownload(filename, downloadUrl, modelId);
    } catch (error) {
      setPendingDownload({ filename, downloadUrl, modelId });
      setShowWarningDialog(true);
    }
  };

  const proceedWithDownload = async (filename: string, downloadUrl: string, modelId?: string) => {
    const modelName = modelId || '';
    const fullFilename = `${modelName.replace('/', '_')}_${filename}`;
    
    if (isModelDownloaded(fullFilename)) {
      showDialog('Already Downloaded', 'This model file is already in your collection.');
      return;
    }

    navigation.navigate('Downloads' as never);

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

  const handleWarningAccept = async (dontShowAgain: boolean) => {
    if (dontShowAgain) {
      try {
        await AsyncStorage.setItem('hideModelWarning', 'true');
      } catch (error) {
        console.warn('Failed to save warning preference:', error);
      }
    }
    
    setShowWarningDialog(false);
    
    if (pendingDownload) {
      const isHuggingFaceModel = pendingDownload.modelId.includes('/');
      
      if (isHuggingFaceModel) {
        await proceedWithDownload(pendingDownload.filename, pendingDownload.downloadUrl, pendingDownload.modelId);
      } else {
        const curatedModel: DownloadableModel = {
          name: pendingDownload.filename,
          huggingFaceLink: pendingDownload.downloadUrl,
          licenseLink: '',
          size: 'Unknown',
          modelFamily: 'Unknown',
          quantization: 'Unknown'
        };
        await proceedWithCuratedDownload(curatedModel);
      }
      setPendingDownload(null);
    }
  };

  const handleWarningCancel = () => {
    setShowWarningDialog(false);
    setPendingDownload(null);
  };

  const handleCuratedModelDownload = async (model: DownloadableModel) => {
    try {
      const hideWarning = await AsyncStorage.getItem('hideModelWarning');
      const shouldShowWarning = hideWarning !== 'true';
      
      if (shouldShowWarning) {
        setPendingDownload({ 
          filename: model.name, 
          downloadUrl: model.huggingFaceLink, 
          modelId: model.name 
        });
        setShowWarningDialog(true);
        return;
      }
      
      await proceedWithCuratedDownload(model);
    } catch (error) {
      setPendingDownload({ 
        filename: model.name, 
        downloadUrl: model.huggingFaceLink, 
        modelId: model.name 
      });
      setShowWarningDialog(true);
    }
  };

  const proceedWithCuratedDownload = async (model: DownloadableModel) => {
    if (isModelDownloaded(model.name)) {
      showDialog('Already Downloaded', 'This model is already in your collection.');
      return;
    }

    navigation.navigate('Downloads' as never);

    try {
      setDownloadProgress((prev: any) => ({
        ...prev,
        [model.name]: {
          progress: 0,
          bytesDownloaded: 0,
          totalBytes: 0,
          status: 'starting',
          downloadId: 0
        }
      }));

      const { downloadId } = await modelDownloader.downloadModel(model.huggingFaceLink, model.name);
      
      setDownloadProgress((prev: any) => ({
        ...prev,
        [model.name]: {
          ...prev[model.name],
          downloadId
        }
      }));

    } catch (error) {
      setDownloadProgress((prev: any) => {
        const newProgress = { ...prev };
        delete newProgress[model.name];
        return newProgress;
      });
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      showDialog('Download Error', `Failed to start download: ${errorMessage}`);
    }
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
          </Dialog.Title>
          
          <Dialog.ScrollArea style={styles.dialogScrollArea}>
            <ScrollView style={styles.detailContent} showsVerticalScrollIndicator={false} contentContainerStyle={styles.dialogContentContainer}>
              <View style={styles.filesHeader}>
                <Text style={styles.sectionTitle}>Available Model Files</Text>
                <Text style={[styles.sectionSubtitle, { color: themeColors.textSecondary }]}>
                  {selectedModel.files.length} file{selectedModel.files.length !== 1 ? 's' : ''} available for download
                </Text>
              </View>
              
              {selectedModel.files.map((file, index) => (
                <View key={index} style={[styles.fileItem, { backgroundColor: themeColors.cardBackground }]}>
                  <View style={styles.fileContent}>
                    <View style={styles.fileMainInfo}>
                      <Text style={[styles.fileName, { color: themeColors.text }]} numberOfLines={1}>
                        {file.filename}
                      </Text>
                      <View style={styles.fileMetaContainer}>
                        <View style={styles.fileMetaItem}>
                          <MaterialCommunityIcons name="download" size={14} color={themeColors.textSecondary} />
                          <Text style={[styles.fileMetaText, { color: themeColors.textSecondary }]}>
                            {huggingFaceService.formatModelSize(file.size)}
                          </Text>
                        </View>
                        <View style={styles.fileMetaItem}>
                          <MaterialCommunityIcons name="cog" size={14} color={themeColors.textSecondary} />
                          <Text style={[styles.fileMetaText, { color: themeColors.textSecondary }]}>
                            {huggingFaceService.extractQuantization(file.filename)}
                          </Text>
                        </View>
                      </View>
                    </View>
                    
                    <Button
                      mode="contained"
                      style={[styles.downloadButton, { backgroundColor: themeColors.primary }]}
                      contentStyle={styles.downloadButtonContent}
                      onPress={() => handleDownloadFile(file.filename, file.downloadUrl)}
                      icon="download"
                      compact
                    >
                      Download
                    </Button>
                  </View>
                  
                  {index < selectedModel.files.length - 1 && (
                    <View style={[styles.fileDivider, { backgroundColor: themeColors.borderColor + '40' }]} />
                  )}
                </View>
              ))}
            </ScrollView>
          </Dialog.ScrollArea>
          
          <Dialog.Actions style={styles.dialogActions}>
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

  const renderHeader = () => (
    <>
      <TouchableOpacity
        style={[styles.customUrlButton, { backgroundColor: themeColors.borderColor }, { marginBottom: 16 }]}
        onPress={onCustomUrlPress}
      >
        <View style={styles.customUrlButtonContent}>
          <View style={styles.customUrlIconContainer}>
            <MaterialCommunityIcons name="plus-circle-outline" size={24} color={getThemeAwareColor('#4a0660', currentTheme)} />
          </View>
          <View style={styles.customUrlTextContainer}>
            <Text style={[styles.customUrlButtonTitle, { color: themeColors.text }]}>
              Download from URL
            </Text>
            <Text style={[styles.customUrlButtonSubtitle, { color: themeColors.secondaryText }]}>
              Download a custom GGUF model from a URL
            </Text>
          </View>
        </View>
      </TouchableOpacity>

      <Searchbar
        placeholder="Search HuggingFace models..."
        onChangeText={handleSearch}
        value={searchQuery}
        style={[styles.searchBar, { backgroundColor: themeColors.cardBackground }]}
        inputStyle={{ color: themeColors.text }}
        iconColor={themeColors.text}
      />

      {searchQuery.length > 0 && (
        <View style={styles.searchActions}>
          <Button
            mode="outlined"
            onPress={clearSearch}
            style={styles.clearButton}
            icon="close"
          >
            Clear Search
          </Button>
        </View>
      )}

      <ModelFilter
        onFiltersChange={onFiltersChange}
        availableTags={getAvailableFilterOptions().tags}
        availableModelFamilies={getAvailableFilterOptions().modelFamilies}
        availableQuantizations={getAvailableFilterOptions().quantizations}
      />
      
      <TouchableOpacity
        style={[styles.guidanceButton, { backgroundColor: themeColors.borderColor }]}
        onPress={onGuidancePress}
      >
        <View style={styles.guidanceButtonContent}>
          <MaterialCommunityIcons name="help-circle-outline" size={24} color={getThemeAwareColor('#4a0660', currentTheme)} />
          <Text style={[styles.guidanceButtonText, { color: themeColors.text }]}>
            I don't know what to download
          </Text>
        </View>
      </TouchableOpacity>
      
      <View style={styles.sectionHeader}>
        <Text style={[styles.sectionHeaderTitle, { color: themeColors.text }]}>
          Curated Models ({curatedModels.length})
        </Text>
      </View>
    </>
  );

  if (showingHfResults) {
    return (
      <View style={styles.container}>
        <ScrollView 
          style={{ flex: 1 }}
          contentContainerStyle={{ padding: 16, paddingTop: 8 }}
          showsVerticalScrollIndicator={false}
        >
          {renderHeader()}
          <View style={styles.hfSection}>
            <View style={styles.sectionHeader}>
              <Text style={[styles.sectionHeaderTitle, { color: themeColors.text }]}>
                HuggingFace Models ({hfModels.length})
              </Text>
              {hfLoading && <ActivityIndicator size="small" color={themeColors.primary} />}
            </View>
            
            {hfModels.length > 0 ? (
              hfModels.map((hfModel) => {
                const convertedModel = convertHfModelToDownloadable(hfModel);
                const isDownloaded = isModelDownloaded(hfModel.id);
                
                return (
                  <DownloadableModelItem
                    key={hfModel.id}
                    model={convertedModel}
                    isDownloaded={isDownloaded}
                    isDownloading={false}
                    isInitializing={false}
                    onDownload={handleHfModelDownload}
                  />
                );
              })
            ) : (
              !hfLoading && (
                <Text style={[styles.noResultsText, { color: themeColors.textSecondary }]}>
                  No GGUF models found for "{searchQuery}"
                </Text>
              )
            )}
          </View>
        </ScrollView>

        {modelDetailsLoading && (
          <Portal>
            <Dialog visible={true}>
              <Dialog.Content style={styles.loadingDialog}>
                <ActivityIndicator size="large" />
                <Text style={[styles.loadingDialogText, { color: themeColors.text }]}>Loading model details...</Text>
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

        <ModelWarningDialog
          visible={showWarningDialog}
          onAccept={handleWarningAccept}
          onCancel={handleWarningCancel}
        />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <DownloadableModelList 
        models={curatedModels}
        storedModels={storedModels}
        downloadProgress={downloadProgress}
        setDownloadProgress={setDownloadProgress}
        onDownload={handleCuratedModelDownload}
        gridColumns={adjustedGridColumns}
        needsHorizontalScroll={needsHorizontalScroll}
        ListHeaderComponent={renderHeader}
      />

      {modelDetailsLoading && (
        <Portal>
          <Dialog visible={true}>
            <Dialog.Content style={styles.loadingDialog}>
              <ActivityIndicator size="large" />
              <Text style={[styles.loadingDialogText, { color: themeColors.text }]}>Loading model details...</Text>
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

      <ModelWarningDialog
        visible={showWarningDialog}
        onAccept={handleWarningAccept}
        onCancel={handleWarningCancel}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
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
  searchBar: {
    marginBottom: 16,
  },
  searchActions: {
    marginBottom: 16,
  },
  clearButton: {
    alignSelf: 'flex-start',
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
  hfSection: {
    marginBottom: 24,
  },
  curatedSection: {
    marginTop: 8,
  },
  noResultsText: {
    textAlign: 'center',
    fontSize: 16,
    fontStyle: 'italic',
    marginTop: 20,
  },
  guidanceButton: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 12,
    marginBottom: 16,
  },
  guidanceButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  guidanceButtonText: {
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 12,
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
  dialogScrollArea: {
    paddingHorizontal: 0,
  },
  detailContent: {
    paddingHorizontal: 0,
  },
  dialogContentContainer: {
    paddingHorizontal: 16,
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
  fileItem: {
    marginHorizontal: 4,
    marginBottom: 8,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  fileContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  fileMainInfo: {
    flex: 1,
    marginRight: 12,
  },
  fileName: {
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 6,
  },
  fileMetaContainer: {
    flexDirection: 'row',
    gap: 16,
  },
  fileMetaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  fileMetaText: {
    fontSize: 13,
    fontWeight: '500',
  },
  downloadButton: {
    minWidth: 100,
  },
  downloadButtonContent: {
    height: 36,
  },
  fileDivider: {
    height: 1,
    marginTop: 16,
  },
  dialogActions: {
    paddingTop: 16,
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
  warningDialog: {
    maxWidth: 320,
    width: '85%',
    alignSelf: 'center',
    margin: 20,
  },
  warningTitle: {
    textAlign: 'center',
    fontSize: 16,
    fontWeight: '600',
    paddingBottom: 8,
  },
  warningContent: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  warningText: {
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
  },
  checkboxContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
    marginBottom: 4,
    paddingHorizontal: 4,
  },
  checkboxText: {
    fontSize: 13,
    marginLeft: 8,
    flex: 1,
  },
  warningActions: {
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 0,
    paddingBottom: 20,
    gap: 12,
  },
});

export default UnifiedModelList;