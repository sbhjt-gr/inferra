import React, { useState } from 'react';
import { StyleSheet, View, Text, TouchableOpacity, ActivityIndicator, Animated } from 'react-native';
import { CompositeNavigationProp } from '@react-navigation/native';
import { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList, TabParamList } from '../types/navigation';
import { useTheme } from '../context/ThemeContext';
import { theme } from '../constants/theme';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Dialog, Portal, Button } from 'react-native-paper';
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


type ModelScreenProps = {
  navigation: CompositeNavigationProp<
    BottomTabNavigationProp<TabParamList, 'ModelTab'>,
    NativeStackNavigationProp<RootStackParamList>
  >;
};

export default function ModelScreen({ navigation }: ModelScreenProps) {
  const { theme: currentTheme } = useTheme();
  const themeColors = theme[currentTheme as 'light' | 'dark'];
  
  const [dialogVisible, setDialogVisible] = useState(false);
  const [dialogTitle, setDialogTitle] = useState('');
  const [dialogMessage, setDialogMessage] = useState('');
  const [dialogActions, setDialogActions] = useState<React.ReactNode[]>([]);

  const logic = useModelScreenLogic(navigation);

  const hideDialog = () => setDialogVisible(false);

  const showDialog = (title: string, message: string, actions: React.ReactNode[]) => {
    setDialogTitle(title);
    setDialogMessage(message);
    setDialogActions(actions);
    setDialogVisible(true);
  };

  const handleProfilePress = () => {
    if (logic.isLoggedIn) {
      navigation.navigate('Profile');
    } else {
      navigation.navigate('Login', {
        redirectTo: 'MainTabs',
        redirectParams: { screen: 'ModelTab' }
      });
    }
  };

  const handleTabPress = (tab: TabType) => {
    logic.handleTabPress(tab, showDialog, hideDialog);
  };

  const handleDelete = (model: StoredModel) => {
    showDialog(
      'Delete Model',
      `Are you sure you want to delete ${model.name}?`,
      [
        <Button key="cancel" onPress={hideDialog} textColor={themeColors.text}>Cancel</Button>,
        <Button
          key="delete"
          onPress={async () => {
            hideDialog();
            await logic.confirmDelete(model, showDialog);
          }}
          textColor="#FF5C5C"
        >
          Delete
        </Button>
      ]
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
          { transform: [{ scale: logic.buttonScale }] }
        ]}
      >
        <TouchableOpacity
          style={[styles.floatingButtonContent, { backgroundColor: themeColors.primary }]}
          onPress={() => navigation.navigate('Downloads')}
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
          {logic.activeTab === 'stored' ? (
            <StoredModelsTab
              storedModels={logic.storedModels}
              isLoading={logic.isLoadingStoredModels}
              isRefreshing={logic.isRefreshingStoredModels}
              onRefresh={logic.refreshStoredModels}
              onImportModel={handleLinkModel}
              onDelete={handleDelete}
              onExport={handleExport}
              onSettings={logic.handleModelSettings}
            />
          ) : logic.activeTab === 'downloadable' ? (
            <DownloadableModelsTab
              storedModels={logic.storedModels}
              downloadProgress={logic.downloadProgress}
              setDownloadProgress={logic.setDownloadProgress}
              navigation={navigation}
              onCustomDownload={logic.handleCustomDownload}
            />
          ) : (
            <RemoteModelsTab />
          )}
        </View>
      </View>
      
      <ModelDownloadsDialog
        visible={logic.isDownloadsVisible}
        onClose={() => logic.setIsDownloadsVisible(false)}
        downloads={logic.downloadProgress}
        onCancelDownload={cancelDownload}
      />

      <Portal>
        <Dialog visible={dialogVisible} onDismiss={hideDialog}>
          <Dialog.Title style={{ color: themeColors.text }}>{dialogTitle}</Dialog.Title>
          <Dialog.Content>
            <Text style={{ color: themeColors.text }}>{dialogMessage}</Text>
          </Dialog.Content>
          <Dialog.Actions>
            {dialogActions.length > 0 
              ? dialogActions.map((ActionComponent, index) =>
                  React.isValidElement(ActionComponent) ? React.cloneElement(ActionComponent, { key: index }) : null
                )
              : <Button key="ok" onPress={hideDialog} textColor={themeColors.text}>OK</Button>
            }
          </Dialog.Actions>
        </Dialog>
      </Portal>

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
