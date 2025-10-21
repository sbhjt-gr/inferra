import { useState, useEffect, useCallback } from 'react';
import { APIKeysService } from '../services/APIKeysService';
import { ChatLifecycleService } from '../services/ChatLifecycleService';
import { onlineModelService } from '../services/OnlineModelService';
import type { ProviderType } from '../services/ModelManagementService';

export const useHomeScreenSettings = (
  activeProvider: ProviderType | null,
  enableRemoteModels: boolean,
  isLoggedIn: boolean,
  navigation: any,
  showDialog: (title: string, message: string, actions: any[]) => void,
  hideDialog: () => void
) => {
  const [selectedModelPath, setSelectedModelPath] = useState<string | null>(null);

  const getEffectiveSettings = useCallback(async () => {
    return await ChatLifecycleService.getEffectiveSettings(activeProvider);
  }, [activeProvider]);

  useEffect(() => {
    const validateProvider = async () => {
      if (activeProvider && activeProvider !== 'local' && activeProvider !== 'apple-foundation') {
        const validation = await APIKeysService.validateApiKey(
          activeProvider, 
          enableRemoteModels, 
          isLoggedIn
        );

        if (!validation.isValid) {
          let title = '';
          let message = '';
          let actions: any[] = [];

          if (validation.errorType === 'remote_disabled') {
            title = 'Remote Models Disabled';
            message = validation.errorMessage || '';
            actions = [
              {
                key: 'cancel',
                text: 'Cancel',
                onPress: hideDialog
              },
              {
                key: 'settings',
                text: 'Go to Settings',
                onPress: () => {
                  hideDialog();
                  navigation.navigate('MainTabs', { screen: 'SettingsTab' });
                }
              }
            ];
          } else if (validation.errorType === 'no_key') {
            title = 'API Key Required';
            message = validation.errorMessage || '';
            actions = [
              {
                key: 'settings',
                text: 'Go to Settings',
                onPress: () => {
                  hideDialog();
                  navigation.navigate('MainTabs', { screen: 'SettingsTab' });
                }
              },
              {
                key: 'cancel',
                text: 'Cancel',
                onPress: hideDialog
              }
            ];
          }

          showDialog(title, message, actions);
        }
      }
    };

    validateProvider();
  }, [activeProvider, enableRemoteModels, isLoggedIn, navigation, showDialog, hideDialog]);

  useEffect(() => {
    const recheckApiKeys = async () => {
      await ChatLifecycleService.recheckApiKeys(
        activeProvider,
        enableRemoteModels,
        isLoggedIn,
        onlineModelService,
        (provider) => {
          setSelectedModelPath(provider);
        }
      );
    };

    recheckApiKeys();
  }, [activeProvider, enableRemoteModels, isLoggedIn]);

  return {
    getEffectiveSettings,
    selectedModelPath,
    setSelectedModelPath
  };
};
