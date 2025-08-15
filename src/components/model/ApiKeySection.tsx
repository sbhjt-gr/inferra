import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, Switch } from 'react-native';
import { useTheme } from '../../context/ThemeContext';
import { theme } from '../../constants/theme';
import { onlineModelService } from '../../services/OnlineModelService';
import { Dialog, Portal, Button, List, Surface, HelperText } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';

interface ApiKeyItem {
  id: string;
  name: string;
  key: string;
  placeholder: string;
  url: string;
  expanded: boolean;
  defaultKeyAvailable: boolean;
  usingDefaultKey: boolean;
  useCustomKey: boolean;
  modelName: string;
  defaultModelName: string;
}

const ApiKeySection: React.FC = () => {
  const { theme: currentTheme } = useTheme();
  const themeColors = theme[currentTheme as 'light' | 'dark'];
  const [isLoadingApiKeys, setIsLoadingApiKeys] = useState(false);
  const [dialogVisible, setDialogVisible] = useState(false);
  const [dialogTitle, setDialogTitle] = useState('');
  const [dialogMessage, setDialogMessage] = useState('');
  
  const [apiKeyItems, setApiKeyItems] = useState<ApiKeyItem[]>([
    { 
      id: 'gemini', 
      name: 'Gemini', 
      key: '', 
      placeholder: 'Enter your Gemini API key', 
      url: 'https://ai.google.dev/', 
      expanded: false,
      defaultKeyAvailable: onlineModelService.hasDefaultKey('gemini'),
      usingDefaultKey: false,
      useCustomKey: true,
      modelName: '',
      defaultModelName: ''
    },
    { 
      id: 'chatgpt', 
      name: 'OpenAI', 
      key: '', 
      placeholder: 'Enter your OpenAI API key', 
      url: 'https://platform.openai.com/api-keys', 
      expanded: false,
      defaultKeyAvailable: onlineModelService.hasDefaultKey('chatgpt'),
      usingDefaultKey: false,
      useCustomKey: true,
      modelName: '',
      defaultModelName: ''
    },
    { 
      id: 'deepseek', 
      name: 'DeepSeek', 
      key: '', 
      placeholder: 'Enter your DeepSeek API key', 
      url: 'https://platform.deepseek.com', 
      expanded: false,
      defaultKeyAvailable: onlineModelService.hasDefaultKey('deepseek'),
      usingDefaultKey: false,
      useCustomKey: true,
      modelName: '',
      defaultModelName: ''
    },
    { 
      id: 'claude', 
      name: 'Claude', 
      key: '', 
      placeholder: 'Enter your Claude API key', 
      url: 'https://console.anthropic.com/', 
      expanded: false,
      defaultKeyAvailable: onlineModelService.hasDefaultKey('claude'),
      usingDefaultKey: false,
      useCustomKey: true,
      modelName: '',
      defaultModelName: ''
    },
  ]);
  
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [savingModel, setSavingModel] = useState<string | null>(null);
  const [keyVisibility, setKeyVisibility] = useState<Record<string, boolean>>({});

  const showDialog = (title: string, message: string) => {
    setDialogTitle(title);
    setDialogMessage(message);
    setDialogVisible(true);
  };

  const hideDialog = () => setDialogVisible(false);

  useEffect(() => {
    loadApiKeys();
  }, []);

  const toggleExpand = (id: string) => {
    setApiKeyItems(prevItems =>
      prevItems.map(item => ({
        ...item,
        expanded: item.id === id ? !item.expanded : item.expanded
      }))
    );
  };

  const toggleKeyVisibility = (id: string) => {
    setKeyVisibility(prev => ({
      ...prev,
      [id]: !prev[id]
    }));
  };

  const toggleUseCustomKey = async (id: string) => {
    const item = apiKeyItems.find(i => i.id === id);
    if (!item) return;
    
    const useCustom = !item.useCustomKey;
    
    try {
      setSavingKey(id);
      
      await onlineModelService.useDefaultKey(id, !useCustom);
      
      setApiKeyItems(prevItems =>
        prevItems.map(item => {
          if (item.id === id) {
            return {
              ...item,
              useCustomKey: useCustom,
              usingDefaultKey: !useCustom && item.defaultKeyAvailable,
              key: useCustom ? '' : item.key
            };
          }
          return item;
        })
      );
      
    } catch (error) {
      // do nothing
    } finally {
      setSavingKey(null);
    }
  };

  const updateApiKey = (id: string, value: string) => {
    setApiKeyItems(prevItems =>
      prevItems.map(item => 
        item.id === id ? { ...item, key: value } : item
      )
    );
  };

  const updateModelName = (id: string, value: string) => {
    setApiKeyItems(prevItems =>
      prevItems.map(item => 
        item.id === id ? { ...item, modelName: value } : item
      )
    );
  };

  const loadApiKeys = async () => {
    setIsLoadingApiKeys(true);
    try {
      const updatedItems = await Promise.all(
        apiKeyItems.map(async (item) => {
          const isUsingDefault = await onlineModelService.isUsingDefaultKey(item.id);
          const customKey = await onlineModelService.getApiKey(item.id);
          const modelName = await onlineModelService.getModelName(item.id);
          const defaultModelName = onlineModelService.getDefaultModelName(item.id);
          
          return { 
            ...item, 
            key: customKey || '',
            modelName: modelName || defaultModelName,
            defaultModelName,
            useCustomKey: !isUsingDefault,
            usingDefaultKey: isUsingDefault,
            defaultKeyAvailable: onlineModelService.hasDefaultKey(item.id)
          };
        })
      );
      setApiKeyItems(updatedItems);
    } catch (error) {
      showDialog('Error', 'Failed to load API keys');
    } finally {
      setIsLoadingApiKeys(false);
    }
  };

  const saveApiKey = async (id: string) => {
    setSavingKey(id);
    try {
      const item = apiKeyItems.find(item => item.id === id);
      if (!item) return;

      if (item.useCustomKey) {
        if (item.key.trim()) {
          await onlineModelService.saveApiKey(id, item.key.trim());
          showDialog('Success', `Custom ${item.name} API key saved successfully`);
        } else {
          if (item.defaultKeyAvailable) {
            await onlineModelService.useDefaultKey(id, true);
            setApiKeyItems(prevItems =>
              prevItems.map(prevItem => 
                prevItem.id === id ? {
                  ...prevItem,
                  usingDefaultKey: true,
                  useCustomKey: false
                } : prevItem
              )
            );
            showDialog('Success', `Switched to built-in ${item.name} API key`);
          } else {
            await onlineModelService.clearApiKey(id);
            showDialog('Success', `${item.name} API key cleared`);
          }
        }
      }
    } catch (error) {
      showDialog('Error', `Failed to save ${id} API key`);
    } finally {
      setSavingKey(null);
    }
  };

  const saveModelName = async (id: string) => {
    setSavingModel(id);
    try {
      const item = apiKeyItems.find(item => item.id === id);
      if (!item) return;

      if (item.modelName.trim()) {
        await onlineModelService.saveModelName(id, item.modelName.trim());
        showDialog('Success', `${item.name} model name saved successfully`);
      } else {
        await onlineModelService.clearModelName(id);
        setApiKeyItems(prevItems =>
          prevItems.map(prevItem => 
            prevItem.id === id ? {
              ...prevItem,
              modelName: prevItem.defaultModelName
            } : prevItem
          )
        );
        showDialog('Success', `${item.name} model name reset to default`);
      }
    } catch (error) {
      showDialog('Error', `Failed to save ${id} model name`);
    } finally {
      setSavingModel(null);
    }
  };

  if (isLoadingApiKeys) {
    return (
      <Surface style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={themeColors.primary} />
        <Text style={[styles.loadingText, { color: themeColors.text }]}>Loading API keys...</Text>
      </Surface>
    );
  }

  return (
    <Surface style={[styles.container, { backgroundColor: themeColors.background }]}>

      {apiKeyItems.map((item) => (
        <List.Accordion
          key={item.id}
          title={item.name}
          description={
            item.useCustomKey 
              ? (item.key ? "Custom key configured" : "Enter your API key") 
              : (item.usingDefaultKey ? "Using built-in key" : "No API key available")
          }
          descriptionStyle={{ 
            color: (item.useCustomKey && item.key) || item.usingDefaultKey 
              ? (item.useCustomKey ? themeColors.primary : 'orange') 
              : 'red' 
          }}
          left={props => 
            <List.Icon
              {...props}
              icon={getModelIcon(item.id)}
              color={themeColors.primary}
            />
          }
          expanded={item.expanded}
          onPress={() => toggleExpand(item.id)}
          style={[styles.accordion, { backgroundColor: 'rgba(150, 150, 150, 0.08)' }]}
          titleStyle={{ color: themeColors.text }}
        >
          <Surface style={[styles.accordionContent, { backgroundColor: themeColors.background }]}>
            {item.defaultKeyAvailable && (
              <View style={styles.toggleContainer}>
                <Text style={[styles.toggleLabel, { color: themeColors.text }]}>
                  Use your own API key
                </Text>
                <Switch
                  value={item.useCustomKey}
                  onValueChange={() => toggleUseCustomKey(item.id)}
                  trackColor={{ false: "#767577", true: themeColors.primary }}
                  disabled={savingKey === item.id}
                />
              </View>
            )}
            
            {(item.useCustomKey || !item.defaultKeyAvailable) && (
              <View style={styles.inputContainer}>
                <TextInput
                  style={[
                    styles.input,
                    { 
                      color: themeColors.text,
                      backgroundColor: themeColors.background,
                      borderColor: themeColors.borderColor
                    }
                  ]}
                  placeholder={item.placeholder}
                  placeholderTextColor={themeColors.secondaryText}
                  value={item.key}
                  onChangeText={(text) => updateApiKey(item.id, text)}
                  autoCapitalize="none"
                  secureTextEntry={!keyVisibility[item.id]}
                />
                <TouchableOpacity 
                  style={styles.visibilityButton}
                  onPress={() => toggleKeyVisibility(item.id)}
                >
                  <MaterialCommunityIcons
                    name={keyVisibility[item.id] ? "eye-off" : "eye"}
                    size={24}
                    color={themeColors.secondaryText}
                  />
                </TouchableOpacity>
              </View>
            )}
            
            <View style={styles.inputContainer}>
              <Text style={[styles.inputLabel, { color: themeColors.text }]}>
                Model Name
              </Text>
              <TextInput
                style={[
                  styles.input,
                  { 
                    color: themeColors.text,
                    backgroundColor: themeColors.background,
                    borderColor: themeColors.borderColor
                  }
                ]}
                placeholder={`Default: ${item.defaultModelName}`}
                placeholderTextColor={themeColors.secondaryText}
                value={item.modelName}
                onChangeText={(text) => updateModelName(item.id, text)}
                autoCapitalize="none"
              />
            </View>
            
            <View style={styles.actionRow}>
              
              {(item.useCustomKey || !item.defaultKeyAvailable) && (
                <TouchableOpacity
                  style={[
                    styles.saveButton,
                    { backgroundColor: themeColors.primary }
                  ]}
                  onPress={() => saveApiKey(item.id)}
                  disabled={savingKey === item.id}
                >
                  {savingKey === item.id ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Text style={styles.saveButtonText}>Save API Key</Text>
                  )}
                </TouchableOpacity>
              )}
              
              <TouchableOpacity
                style={[
                  styles.saveButton,
                  { backgroundColor: themeColors.primary }
                ]}
                onPress={() => saveModelName(item.id)}
                disabled={savingModel === item.id}
              >
                {savingModel === item.id ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.saveButtonText}>Save Model</Text>
                )}
              </TouchableOpacity>
            </View>
            
            <HelperText type="info" style={{ color: themeColors.secondaryText }}>
              {item.useCustomKey 
                ? (item.key 
                    ? `Your custom API key is configured. Current model: ${item.modelName || item.defaultModelName}` 
                    : `Enter your API key to use ${item.name} models. You can also customize the model name above.`)
                : (item.defaultKeyAvailable 
                    ? `Currently using built-in API key with model: ${item.modelName || item.defaultModelName}. Toggle switch above to use your own key for better privacy and control.` 
                    : "No built-in API key available. You need to provide your own API key.")}
            </HelperText>
          </Surface>
        </List.Accordion>
      ))}

      <Portal>
        <Dialog visible={dialogVisible} onDismiss={hideDialog}>
          <Dialog.Title>{dialogTitle}</Dialog.Title>
          <Dialog.Content>
            <Text style={{ color: themeColors.text }}>{dialogMessage}</Text>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={hideDialog}>OK</Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </Surface>
  );
};

const getModelIcon = (): string => {
  return 'cube';
};

const styles = StyleSheet.create({
  container: {
    marginBottom: 25,
    borderRadius: 16,
    elevation: 2,
    overflow: 'hidden',
  },
  headerContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
  },
  subtitle: {
    fontSize: 14,
    marginBottom: 16,
    paddingHorizontal: 16,
  },
  accordion: {
    marginVertical: 4,
    borderRadius: 8,
    marginHorizontal: 8,
    overflow: 'hidden',
  },
  accordionContent: {
    padding: 16,
    marginHorizontal: 8,
    marginBottom: 8,
    borderRadius: 8,
  },
  toggleContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  toggleLabel: {
    fontSize: 16,
    fontWeight: '500',
  },
  inputContainer: {
    position: 'relative',
    marginBottom: 8,
  },
  input: {
    height: 50,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingRight: 48,
    fontSize: 16,
  },
  inputLabel: {
    fontSize: 16,
    fontWeight: '500',
    marginBottom: 8,
  },
  visibilityButton: {
    position: 'absolute',
    right: 8,
    top: 13,
    padding: 4,
  },
  actionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
    flexWrap: 'wrap',
    gap: 8,
  },
  linkButton: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 8,
  },
  linkText: {
    marginLeft: 4,
    fontSize: 14,
    fontWeight: '600',
  },
  saveButton: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 100,
    height: 40,
    flex: 1,
    maxWidth: 150,
  },
  saveButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  loadingContainer: {
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 16,
    marginBottom: 25,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
  },
});

export default ApiKeySection; 