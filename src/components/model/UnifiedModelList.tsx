import React from 'react';
import { View, ScrollView, StyleSheet, TouchableOpacity, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text, TextInput } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import { theme } from '../../constants/theme';
import { getThemeAwareColor } from '../../utils/ColorUtils';
import { DownloadableModel } from './DownloadableModelItem';
import ModelFilesDialog from '../ModelFilesDialog';
import Dialog from '../Dialog';
import { FilterOptions } from '../ModelFilter';
import { ModelWarningDialog } from './ModelWarningDialog';
import { HuggingFaceSearchBar } from './HuggingFaceSearchBar';
import { HuggingFaceModelsList } from './HuggingFaceModelsList';
import { CuratedModelsList } from './CuratedModelsList';
import { useUnifiedModelList } from '../../hooks/useUnifiedModelList';
import { useModelDownloadHandlers } from '../../hooks/useModelDownloadHandlers';


interface UnifiedModelListProps {
  curatedModels: DownloadableModel[];
  storedModels: any[];
  downloadProgress: any;
  setDownloadProgress: React.Dispatch<React.SetStateAction<any>>;
  filters: FilterOptions;
  onFiltersChange: (filters: FilterOptions) => void;
  getAvailableFilterOptions: () => { tags: string[], modelFamilies: string[], quantizations: string[], runtimes: string[] };
  onCustomUrlPress: () => void;
  onGuidancePress: () => void;
}

const UnifiedModelList: React.FC<UnifiedModelListProps> = ({
  curatedModels,
  storedModels,
  downloadProgress,
  setDownloadProgress,
  filters,
  onFiltersChange,
  getAvailableFilterOptions,
  onCustomUrlPress,
  onGuidancePress
}) => {
  const insets = useSafeAreaInsets();
  const { theme: currentTheme } = useTheme();
  const themeColors = theme[currentTheme];

  const logic = useUnifiedModelList(storedModels, downloadProgress, setDownloadProgress);
  
  const handlers = useModelDownloadHandlers(
    logic.hfModels,
    logic.selectedModel,
    logic.setSelectedModel,
    logic.setPendingDownload,
    logic.setShowWarningDialog,
    logic.setSelectedFiles,
    logic.proceedWithDownload,
    logic.proceedWithMultipleDownloads,
    logic.requestMLXDownload,
    logic.proceedWithCuratedDownload,
    logic.showDialog,
    logic.convertHfModelToDownloadable,
    logic.handleModelPress,
    downloadProgress,
    setDownloadProgress
  );

  const handleWarningAccept = async (dontShowAgain: boolean) => {
    await handlers.handleWarningAccept(dontShowAgain, logic.pendingDownload);
  };

  const modelFilesOpen = logic.modelDetailsLoading || !!logic.selectedModel;

  return (
    <View style={styles.container}>
      <ScrollView 
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 16, paddingTop: 8, paddingBottom: Platform.OS === 'ios' ? insets.bottom : 16 }}
        showsVerticalScrollIndicator={false}
      >
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
                Download a custom GGUF or LiteRT model from a URL
              </Text>
            </View>
          </View>
        </TouchableOpacity>

        <HuggingFaceSearchBar
          searchQuery={logic.searchQuery}
          onSearchChange={logic.handleSearch}
          onSearchSubmit={logic.handleSearchSubmit}
          onClearSearch={logic.clearSearch}
          isLoading={logic.hfLoading}
        />

        {logic.showingHfResults ? (
          <HuggingFaceModelsList
            models={logic.hfModels}
            isLoading={logic.hfLoading}
            searchQuery={logic.searchQuery}
            onModelPress={logic.handleModelPress}
            isModelDownloaded={logic.isModelDownloaded}
            convertHfModelToDownloadable={logic.convertHfModelToDownloadable}
          />
        ) : (
          <CuratedModelsList
            models={curatedModels}
            storedModels={storedModels}
            downloadProgress={downloadProgress}
            setDownloadProgress={setDownloadProgress}
            filters={filters}
            onFiltersChange={onFiltersChange}
            getAvailableFilterOptions={getAvailableFilterOptions}
            onGuidancePress={onGuidancePress}
            onDownload={handlers.handleCuratedModelDownload}
            forceRender={logic.forceRender}
            onFilterExpandChange={logic.handleFilterExpandChange}
          />
        )}
      </ScrollView>

      <ModelFilesDialog
        visible={modelFilesOpen}
        isLoading={logic.modelDetailsLoading}
        loadingModelId={logic.loadingModelId}
        onClose={logic.closeModelFilesDialog}
        modelDetails={logic.selectedModel}
        onDownloadFile={handlers.handleDownloadFile}
        onDownloadMLXModel={handlers.handleDownloadMLXModel}
      />

      <Dialog
        visible={logic.dialogVisible && !modelFilesOpen}
        onDismiss={logic.hideDialog}
        title={logic.dialogTitle}
        description={logic.dialogMessage}
        buttonText="OK"
        onClose={logic.hideDialog}
      />

      <ModelWarningDialog
        visible={logic.showWarningDialog && !modelFilesOpen}
        licenseLink={logic.pendingDownload?.licenseLink || logic.pendingDownload?.curatedModel?.licenseLink}
        onAccept={handleWarningAccept}
        onCancel={handlers.handleWarningCancel}
      />

      <Dialog
        visible={logic.mlxDirDialogVisible && !modelFilesOpen}
        onClose={logic.hideMLXDirDialog}
        title="MLX Folder Name"
        description="Enter a folder name for this MLX model package. All required MLX files will be downloaded into this folder."
        primaryButtonText="Download"
        onPrimaryPress={logic.confirmMLXDirDownload}
        secondaryButtonText="Cancel"
        onSecondaryPress={logic.hideMLXDirDialog}
      >
        <TextInput
          mode="outlined"
          label="Folder Name"
          value={logic.mlxDirName}
          onChangeText={logic.setMlxDirName}
          autoCapitalize="none"
          autoCorrect={false}
        />
      </Dialog>
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
});

export default UnifiedModelList;
