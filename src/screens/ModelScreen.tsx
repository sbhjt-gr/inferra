import React, { useState } from 'react';
import { StyleSheet, View, Text, TouchableOpacity, ActivityIndicator, Animated, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useResponsiveLayout } from '../hooks/useResponsiveLayout';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useTheme } from '../context/ThemeContext';
import { theme } from '../constants/theme';
import { GradientBg } from '../services/adapters/GradientBgAdapter';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { ShowDialogFn } from '../hooks/useDialog';
import Dialog from '../components/Dialog';
import { StorageWarningDialog } from '../components/model/StorageWarningDialog';
import { ModelScreenHeader } from '../components/model/ModelScreenHeader';
import { ModelScreenTabs, TabType } from '../components/model/ModelScreenTabs';
import { StoredModelsTab } from '../components/model/StoredModelsTab';
import { DownloadableModelsTab } from '../components/model/DownloadableModelsTab';
import { RemoteModelsTab } from '../components/model/RemoteModelsTab';
import ModelDownloadsDialog from '../components/model/ModelDownloadsDialog';
import { useModelScreenLogic } from '../hooks/useModelScreenLogic';
import { getActiveDownloadsCount } from '../utils/ModelUtils';
import { StoredModel } from '../services/ModelDownloaderTypes';


export default function ModelScreen() {
  const { theme: currentTheme } = useTheme();
  const insets = useSafeAreaInsets();
  const { isWideScreen } = useResponsiveLayout();
  const themeColors = theme[currentTheme as 'light' | 'dark'];
  const router = useRouter();
  const params = useLocalSearchParams<{ autoEnableRemoteModels?: string; openRemoteTab?: string }>();

  const [dialogVisible, setDialogVisible] = useState(false);
  const [dialogTitle, setDialogTitle] = useState('');
  const [dialogMessage, setDialogMessage] = useState('');
  const [dialogPrimaryText, setDialogPrimaryText] = useState<string | undefined>(undefined);
  const [dialogPrimaryPress, setDialogPrimaryPress] = useState<(() => void) | undefined>(undefined);
  const [dialogSecondaryText, setDialogSecondaryText] = useState<string | undefined>(undefined);
  const [dialogSecondaryPress, setDialogSecondaryPress] = useState<(() => void) | undefined>(undefined);

  const routeParams = {
    autoEnableRemoteModels: params.autoEnableRemoteModels === 'true',
    openRemoteTab: params.openRemoteTab === 'true',
  };

  const logic = useModelScreenLogic(routeParams);

  const hideDialog = () => setDialogVisible(false);

  const showDialog: ShowDialogFn = (title, message, primary?, secondary?) => {
    setDialogTitle(title);
    setDialogMessage(message);
    const autoClose = () => setDialogVisible(false);
    setDialogPrimaryText(primary?.label ?? 'OK');
    setDialogPrimaryPress(() => primary ? primary.onPress : autoClose);
    setDialogSecondaryText(secondary?.label);
    setDialogSecondaryPress(secondary ? () => secondary.onPress : undefined);
    setDialogVisible(true);
  };

  const handleProfilePress = () => {
    if (logic.isLoggedIn) {
      router.push('/profile');
    } else {
      router.push({ pathname: '/login', params: { redirectTo: '/(tabs)/models' } });
    }
  };

  const handleTabPress = (tab: TabType) => {
    logic.handleTabPress(tab, showDialog, hideDialog);
  };

  const handleDelete = (model: StoredModel) => {
    showDialog(
      'Delete Model',
      `Are you sure you want to delete ${model.name}?`,
      {
        label: 'Delete',
        onPress: async () => {
          hideDialog();
          await logic.confirmDelete(model, showDialog);
        }
      },
      { label: 'Cancel', onPress: hideDialog }
    );
  };

  const handleExport = async (modelPath: string, modelName: string) => {
    await logic.handleExport(modelPath, modelName, showDialog);
  };

  const proceedWithImport = async () => {
    await logic.proceedWithModelImport(showDialog);
  };

  const handleLinkModel = async () => {
    await logic.handleLinkModel(proceedWithImport);
  };

  const handleStorageWarningAccept = async (dontShowAgain: boolean) => {
    await logic.handleStorageWarningAccept(dontShowAgain, proceedWithImport);
  };

  const cancelDownload = async (modelName: string) => {
    await logic.cancelDownload(modelName, showDialog);
  };

  const renderDownloadsButton = () => {
    const activeCount = getActiveDownloadsCount(logic.downloadProgress);
    if (activeCount === 0) return null;

    return (
      <Animated.View
        style={[
          styles.floatingButton,
          { transform: [{ scale: logic.buttonScale }] },
          Platform.OS === 'ios' && !isWideScreen && { bottom: 20 + insets.bottom },
        ]}
      >
        <TouchableOpacity
          style={[styles.floatingButtonContent, { backgroundColor: themeColors.primary }]}
          onPress={() => router.push('/downloads')}
        >
          <MaterialCommunityIcons name="cloud-download" size={24} color={themeColors.headerText} />
          <View style={styles.downloadCount}>
            <Text style={styles.downloadCountText}>{activeCount}</Text>
          </View>
        </TouchableOpacity>
      </Animated.View>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: themeColors.background }]}>
      <GradientBg />
      <ModelScreenHeader 
        isLoggedIn={logic.isLoggedIn}
        onProfilePress={handleProfilePress}
      />
      
      <View style={styles.content}>
        <ModelScreenTabs
          activeTab={logic.activeTab}
          onTabPress={handleTabPress}
          enableRemoteModels={logic.enableRemoteModels}
        />

        <View style={styles.contentContainer}>
          <View style={[styles.tabPane, logic.activeTab !== 'stored' && styles.hiddenPane]}>
            <StoredModelsTab
              storedModels={logic.storedModels}
              isLoading={logic.isLoadingStoredModels}
              isRefreshing={logic.isRefreshingStoredModels}
              onRefresh={logic.rescanStoredModels}
              onImportModel={handleLinkModel}
              onDelete={handleDelete}
              onExport={handleExport}
              onSettings={logic.handleModelSettings}
            />
          </View>

          <View style={[styles.tabPane, logic.activeTab !== 'downloadable' && styles.hiddenPane]}>
            <DownloadableModelsTab
              storedModels={logic.storedModels}
              downloadProgress={logic.downloadProgress}
              setDownloadProgress={logic.setDownloadProgress}
              onCustomDownload={logic.handleCustomDownload}
            />
          </View>

          <View style={[styles.tabPane, logic.activeTab !== 'remote' && styles.hiddenPane]}>
            <RemoteModelsTab />
          </View>
        </View>
      </View>
      
      <ModelDownloadsDialog
        visible={logic.isDownloadsVisible}
        onClose={() => logic.setIsDownloadsVisible(false)}
        downloads={logic.downloadProgress}
        onCancelDownload={cancelDownload}
      />

      <Dialog
        visible={dialogVisible}
        onDismiss={hideDialog}
        title={dialogTitle || undefined}
        description={dialogMessage || undefined}
        primaryButtonText={dialogPrimaryText}
        onPrimaryPress={dialogPrimaryPress}
        secondaryButtonText={dialogSecondaryText}
        onSecondaryPress={dialogSecondaryPress}
      />

      {(logic.isLoading || logic.importingModelName) && (
        <View style={styles.loadingOverlay}>
          <View style={[styles.loadingContainer, { backgroundColor: themeColors.borderColor }]}>
            <ActivityIndicator size="large" color={themeColors.primary} />
            <Text style={[styles.loadingText, { color: themeColors.text, textAlign: 'center' }]}>
              {logic.isExporting ? 'Exporting model...' : (logic.importingModelName ? `Importing ${logic.importingModelName}...` : 'Importing model...')}
            </Text>
            <Text style={[styles.loadingSubtext, { color: themeColors.secondaryText, textAlign: 'center' }]}>
              {logic.isExporting ? 'Preparing model for sharing' : (logic.importingModelName ? 'Moving model to app storage' : 'This may take a while for large models')}
            </Text>
          </View>
        </View>
      )}

      {renderDownloadsButton()}

      <StorageWarningDialog
        visible={logic.showStorageWarningDialog}
        onAccept={handleStorageWarningAccept}
        onCancel={() => logic.setShowStorageWarningDialog(false)}
      />
    </View>
  );
}


const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    flex: 1,
    paddingTop: 8,
  },
  tabPane: {
    flex: 1,
  },
  hiddenPane: {
    display: 'none',
  },
  floatingButton: {
    position: 'absolute',
    bottom: 20,
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#4a0660',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 5,
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
  },
  downloadCount: {
    position: 'absolute',
    top: -4,
    right: -4,
    backgroundColor: '#ff4444',
    borderRadius: 12,
    minWidth: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  downloadCountText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  floatingButtonContent: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000,
  },
  loadingContainer: {
    padding: 20,
    borderRadius: 10,
    alignItems: 'center',
    width: '80%',
  },
  loadingText: {
    fontSize: 16,
    fontWeight: '600',
    marginTop: 16,
  },
  loadingSubtext: {
    fontSize: 14,
    marginTop: 8,
    textAlign: 'center',
  },
});
