import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { AppSwitch } from '../../services/adapters/SwitchAdapter';
import { useTheme } from '../../context/ThemeContext';
import { theme } from '../../constants/theme';
import { onlineModelService } from '../../services/OnlineModelService';
import { Surface } from 'react-native-paper';
import Dialog from '../Dialog';
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
  baseUrl: string;
  defaultBaseUrl: string;
  isClone: boolean;
  baseProvider: string;
  systemInstruction: string;
}

const openAIPresetUrls = [
  { label: 'OpenAI', url: 'https://api.openai.com/v1' },
  { label: 'OpenRouter', url: 'https://openrouter.ai/api/v1' },
  { label: 'Groq', url: 'https://api.groq.com/openai/v1' },
  { label: 'Together', url: 'https://api.together.xyz/v1' }
];

const BASE_PROVIDERS = [
  { id: 'chatgpt', name: 'OpenAI API', placeholder: 'Enter your OpenAI API key', url: 'https://platform.openai.com/api-keys' },
  { id: 'gemini', name: 'Gemini API', placeholder: 'Enter your Gemini API key', url: 'https://ai.google.dev/' },
  { id: 'claude', name: 'Claude API', placeholder: 'Enter your Claude API key', url: 'https://www.anthropic.com' },
];

const ApiKeySection: React.FC = () => {
  const { theme: currentTheme } = useTheme();
  const themeColors = theme[currentTheme as 'light' | 'dark'];
  const [isLoadingApiKeys, setIsLoadingApiKeys] = useState(false);
  const [dialogVisible, setDialogVisible] = useState(false);
  const [dialogTitle, setDialogTitle] = useState('');
  const [dialogMessage, setDialogMessage] = useState('');
  const [apiKeyItems, setApiKeyItems] = useState<ApiKeyItem[]>([]);
  const [saving, setSaving] = useState<string | null>(null);
  const [keyVisibility, setKeyVisibility] = useState<Record<string, boolean>>({});

  const isValidUrl = (value: string) => /^https?:\/\//i.test(value.trim());

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
      setSaving(id);
      
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
    } finally {
      setSaving(null);
    }
  };

  const updateApiKey = (id: string, value: string) => {
    setApiKeyItems(prev => prev.map(i => i.id === id ? { ...i, key: value } : i));
  };

  const updateModelName = (id: string, value: string) => {
    setApiKeyItems(prev => prev.map(i => i.id === id ? { ...i, modelName: value } : i));
  };

  const updateBaseUrl = (id: string, value: string) => {
    setApiKeyItems(prev => prev.map(i => i.id === id ? { ...i, baseUrl: value } : i));
  };

  const updateDisplayName = (id: string, value: string) => {
    setApiKeyItems(prev => prev.map(i => i.id === id ? { ...i, name: value } : i));
  };

  const updateSystemInstruction = (id: string, value: string) => {
    setApiKeyItems(prev => prev.map(i => i.id === id ? { ...i, systemInstruction: value } : i));
  };

  const loadApiKeys = async () => {
    setIsLoadingApiKeys(true);
    try {
      const hydratedBase = await Promise.all(
        BASE_PROVIDERS.map(async (bp) => {
          const isUsingDefault = await onlineModelService.isUsingDefaultKey(bp.id);
          const customKey = await onlineModelService.getApiKey(bp.id);
          const modelName = await onlineModelService.getModelName(bp.id);
          const defaultModelName = onlineModelService.getDefaultModelName(bp.id);
          const customBaseUrl = await onlineModelService.getCustomBaseUrl(bp.id);
          const defaultBaseUrl = onlineModelService.getDefaultBaseUrl(bp.id);
          const systemInstruction = await onlineModelService.getSystemInstruction(bp.id);
          return {
            id: bp.id,
            name: bp.name,
            key: customKey || '',
            placeholder: bp.placeholder,
            url: bp.url,
            expanded: false,
            defaultKeyAvailable: onlineModelService.hasDefaultKey(bp.id),
            usingDefaultKey: isUsingDefault,
            useCustomKey: !isUsingDefault,
            modelName: modelName || defaultModelName,
            defaultModelName,
            baseUrl: customBaseUrl || '',
            defaultBaseUrl,
            isClone: false,
            baseProvider: bp.id,
            systemInstruction: systemInstruction || '',
          } as ApiKeyItem;
        })
      );

      const clones = await onlineModelService.listClones();
      const hydratedClones = await Promise.all(
        clones.map(async (clone) => {
          const isUsingDefault = await onlineModelService.isUsingDefaultKey(clone.id);
          const customKey = await onlineModelService.getApiKey(clone.id);
          const modelName = await onlineModelService.getModelName(clone.id);
          const defaultModelName = onlineModelService.getDefaultModelName(clone.id);
          const customBaseUrl = await onlineModelService.getCustomBaseUrl(clone.id);
          const defaultBaseUrl = onlineModelService.getDefaultBaseUrl(clone.id);
          const systemInstruction = await onlineModelService.getSystemInstruction(clone.id);
          const baseMeta = BASE_PROVIDERS.find(b => b.id === clone.baseProvider);
          return {
            id: clone.id,
            name: clone.displayName,
            key: customKey || '',
            placeholder: baseMeta?.placeholder || 'Enter your API key',
            url: baseMeta?.url || '',
            expanded: false,
            defaultKeyAvailable: onlineModelService.hasDefaultKey(clone.id),
            usingDefaultKey: isUsingDefault,
            useCustomKey: !isUsingDefault,
            modelName: modelName || defaultModelName,
            defaultModelName,
            baseUrl: customBaseUrl || '',
            defaultBaseUrl,
            isClone: true,
            baseProvider: clone.baseProvider,
            systemInstruction: systemInstruction || '',
          } as ApiKeyItem;
        })
      );

      const ordered: ApiKeyItem[] = [];
      for (const base of hydratedBase) {
        ordered.push(base);
        ordered.push(...hydratedClones.filter(c => c.baseProvider === base.id));
      }
      setApiKeyItems(ordered);
    } catch {
      showDialog('Error', 'Failed to load API keys');
    } finally {
      setIsLoadingApiKeys(false);
    }
  };

  const saveAll = async (id: string) => {
    setSaving(id);
    try {
      const item = apiKeyItems.find(i => i.id === id);
      if (!item) return;

      const trimmedUrl = item.baseUrl.trim();
      if (trimmedUrl && !isValidUrl(trimmedUrl)) {
        showDialog('Error', 'Enter a valid URL starting with http:// or https://');
        return;
      }

      if (item.isClone) {
        const trimmedName = item.name.trim();
        if (trimmedName) {
          await onlineModelService.saveDisplayName(id, trimmedName);
        }
      }

      if (item.useCustomKey) {
        if (item.key.trim()) {
          await onlineModelService.saveApiKey(id, item.key.trim());
        } else {
          if (item.defaultKeyAvailable) {
            await onlineModelService.useDefaultKey(id, true);
            setApiKeyItems(prev => prev.map(i => i.id === id ? { ...i, usingDefaultKey: true, useCustomKey: false } : i));
          } else {
            await onlineModelService.clearApiKey(id);
          }
        }
      }

      if (item.modelName.trim()) {
        await onlineModelService.saveModelName(id, item.modelName.trim());
      } else {
        await onlineModelService.clearModelName(id);
        setApiKeyItems(prev => prev.map(i => i.id === id ? { ...i, modelName: i.defaultModelName } : i));
      }

      if (trimmedUrl) {
        await onlineModelService.saveBaseUrl(id, trimmedUrl);
        setApiKeyItems(prev => prev.map(i => i.id === id ? { ...i, baseUrl: trimmedUrl } : i));
      } else {
        await onlineModelService.clearBaseUrl(id);
        setApiKeyItems(prev => prev.map(i => i.id === id ? { ...i, baseUrl: '' } : i));
      }

      const trimmedInstruction = item.systemInstruction.trim();
      if (trimmedInstruction) {
        await onlineModelService.saveSystemInstruction(id, trimmedInstruction);
        setApiKeyItems(prev => prev.map(i => i.id === id ? { ...i, systemInstruction: trimmedInstruction } : i));
      } else {
        await onlineModelService.clearSystemInstruction(id);
        setApiKeyItems(prev => prev.map(i => i.id === id ? { ...i, systemInstruction: '' } : i));
      }

      showDialog('Success', `${item.name} settings saved`);
    } catch {
      const item = apiKeyItems.find(i => i.id === id);
      showDialog('Error', `Failed to save ${item?.name || id} settings`);
    } finally {
      setSaving(null);
    }
  };

  const handleCloneApi = async (baseId: string) => {
    try {
      const base = apiKeyItems.find(i => i.id === baseId);
      if (!base) return;
      const count = apiKeyItems.filter(i => i.baseProvider === baseId && i.isClone).length;
      const displayName = `${base.name} (${count + 2})`;
      const cloneId = await onlineModelService.createClone(baseId, displayName);
      const newClone: ApiKeyItem = {
        id: cloneId,
        name: displayName,
        key: '',
        placeholder: base.placeholder,
        url: base.url,
        expanded: true,
        defaultKeyAvailable: onlineModelService.hasDefaultKey(cloneId),
        usingDefaultKey: false,
        useCustomKey: true,
        modelName: base.defaultModelName,
        defaultModelName: base.defaultModelName,
        baseUrl: '',
        defaultBaseUrl: base.defaultBaseUrl,
        isClone: true,
        baseProvider: baseId,
        systemInstruction: '',
      };
      setApiKeyItems(prev => {
        const lastIdx = [...prev].reduce((acc, item, idx) => {
          if (item.baseProvider === baseId || item.id === baseId) return idx;
          return acc;
        }, -1);
        const next = [...prev];
        next.splice(lastIdx + 1, 0, newClone);
        return next;
      });
    } catch {
      showDialog('Error', 'Failed to create clone');
    }
  };

  const handleDeleteClone = async (cloneId: string) => {
    try {
      await onlineModelService.deleteClone(cloneId);
      setApiKeyItems(prev => prev.filter(i => i.id !== cloneId));
    } catch {
      showDialog('Error', 'Failed to delete configuration');
    }
  };

  const getDescriptionText = (item: ApiKeyItem): string => {
    if (item.useCustomKey) return item.key ? 'Custom key configured' : 'Enter your API key';
    return item.usingDefaultKey ? 'Using built-in key' : 'No API key available';
  };

  const getDescriptionColor = (item: ApiKeyItem): string => {
    if ((item.useCustomKey && item.key) || item.usingDefaultKey) {
      return item.useCustomKey ? themeColors.primary : 'orange';
    }
    return 'red';
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
      <View style={styles.containerContent}>
      {apiKeyItems.map((item) => (
        <View key={item.id} style={styles.accordionWrapper}>
          <TouchableOpacity
            style={[styles.accordionHeader, { backgroundColor: 'rgba(150, 150, 150, 0.08)' }]}
            onPress={() => toggleExpand(item.id)}
            activeOpacity={0.7}
          >
            <View style={styles.accordionHeaderLeft}>
              <MaterialCommunityIcons
                name={getModelIcon(item.baseProvider)}
                size={24}
                color={item.isClone ? themeColors.secondaryText : themeColors.primary}
                style={styles.accordionIcon}
              />
              <View style={styles.accordionTitleBlock}>
                <Text style={[styles.accordionTitle, { color: themeColors.text }]} numberOfLines={1}>
                  {item.name}
                </Text>
                <Text style={[styles.accordionDesc, { color: getDescriptionColor(item) }]} numberOfLines={1}>
                  {getDescriptionText(item)}
                </Text>
              </View>
            </View>
            <View style={styles.accordionHeaderRight}>
              {item.isClone ? (
                <TouchableOpacity
                  onPress={() => handleDeleteClone(item.id)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  style={styles.headerActionBtn}
                >
                  <MaterialCommunityIcons name="trash-can-outline" size={18} color="#d32f2f" />
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  onPress={() => handleCloneApi(item.id)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  style={styles.headerActionBtn}
                >
                  <MaterialCommunityIcons name="plus-circle-outline" size={18} color={themeColors.primary} />
                </TouchableOpacity>
              )}
              <MaterialCommunityIcons
                name={item.expanded ? 'chevron-up' : 'chevron-down'}
                size={22}
                color={themeColors.secondaryText}
              />
            </View>
          </TouchableOpacity>

          {item.expanded && (
            <Surface style={[styles.accordionContent, { backgroundColor: themeColors.background }]}>
              {item.isClone && (
                <View style={styles.inputContainer}>
                  <Text style={[styles.inputLabel, { color: themeColors.text }]}>Display Name</Text>
                  <TextInput
                    style={[styles.input, { color: themeColors.text, backgroundColor: themeColors.background, borderColor: themeColors.borderColor }]}
                    placeholder="e.g., Groq, LM Studio, OpenRouter"
                    placeholderTextColor={themeColors.secondaryText}
                    value={item.name}
                    onChangeText={(text) => updateDisplayName(item.id, text)}
                    autoCapitalize="none"
                  />
                </View>
              )}

              {item.defaultKeyAvailable && !item.isClone && (
                <View style={styles.toggleContainer}>
                  <Text style={[styles.toggleLabel, { color: themeColors.text }]}>Use your own API key</Text>
                  <AppSwitch
                    value={item.useCustomKey}
                    onValueChange={() => toggleUseCustomKey(item.id)}
                    disabled={saving === item.id}
                  />
                </View>
              )}

              {(item.useCustomKey || !item.defaultKeyAvailable) && (
                <View style={styles.inputContainer}>
                  <TextInput
                    style={[styles.input, { color: themeColors.text, backgroundColor: themeColors.background, borderColor: themeColors.borderColor }]}
                    placeholder={item.placeholder}
                    placeholderTextColor={themeColors.secondaryText}
                    value={item.key}
                    onChangeText={(text) => updateApiKey(item.id, text)}
                    autoCapitalize="none"
                    secureTextEntry={!keyVisibility[item.id]}
                  />
                  <TouchableOpacity style={styles.visibilityButton} onPress={() => toggleKeyVisibility(item.id)}>
                    <MaterialCommunityIcons
                      name={keyVisibility[item.id] ? 'eye-off' : 'eye'}
                      size={24}
                      color={themeColors.secondaryText}
                    />
                  </TouchableOpacity>
                </View>
              )}

              <View style={styles.inputContainer}>
                <Text style={[styles.inputLabel, { color: themeColors.text }]}>Model Name</Text>
                <TextInput
                  style={[styles.input, { color: themeColors.text, backgroundColor: themeColors.background, borderColor: themeColors.borderColor }]}
                  placeholder={`Default: ${item.defaultModelName}`}
                  placeholderTextColor={themeColors.secondaryText}
                  value={item.modelName}
                  onChangeText={(text) => updateModelName(item.id, text)}
                  autoCapitalize="none"
                />
              </View>

              <View style={styles.inputContainer}>
                <Text style={[styles.inputLabel, { color: themeColors.text }]}>Base URL</Text>
                <TextInput
                  style={[styles.input, { color: themeColors.text, backgroundColor: themeColors.background, borderColor: themeColors.borderColor, paddingRight: 12 }]}
                  placeholder={`Default: ${item.defaultBaseUrl || 'None'}`}
                  placeholderTextColor={themeColors.secondaryText}
                  value={item.baseUrl}
                  onChangeText={(text) => updateBaseUrl(item.id, text)}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="url"
                />
              </View>

              <View style={styles.inputContainer}>
                <Text style={[styles.inputLabel, { color: themeColors.text }]}>System Instruction</Text>
                <TextInput
                  style={[
                    styles.input,
                    styles.systemInstructionInput,
                    {
                      color: themeColors.text,
                      backgroundColor: themeColors.background,
                      borderColor: themeColors.borderColor,
                    }
                  ]}
                  placeholder="Default: Settings → Model Settings → System Prompt"
                  placeholderTextColor={themeColors.secondaryText}
                  value={item.systemInstruction}
                  onChangeText={(text) => updateSystemInstruction(item.id, text)}
                  multiline
                  textAlignVertical="top"
                />
              </View>

              {(item.id === 'chatgpt' || item.baseProvider === 'chatgpt') && (
                <View style={styles.presetContainer}>
                  <Text style={[styles.presetLabel, { color: themeColors.text }]}>Popular endpoints</Text>
                  <View style={styles.presetChips}>
                    {openAIPresetUrls.map(preset => (
                      <TouchableOpacity
                        key={preset.label}
                        style={[styles.presetChip, { borderColor: themeColors.borderColor }]}
                        onPress={() => updateBaseUrl(item.id, preset.url)}
                      >
                        <Text style={[styles.presetChipText, { color: themeColors.primary }]}>{preset.label}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              )}

              <View style={styles.actionRow}>
                <TouchableOpacity
                  style={[styles.saveButton, { backgroundColor: themeColors.primary }]}
                  onPress={() => saveAll(item.id)}
                  disabled={saving === item.id}
                >
                  {saving === item.id ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Text style={styles.saveButtonText}>Save</Text>
                  )}
                </TouchableOpacity>
              </View>
            </Surface>
          )}
        </View>
      ))}
      </View>

      <Dialog
        visible={dialogVisible}
        onDismiss={hideDialog}
        title={dialogTitle}
        description={dialogMessage}
        buttonText="OK"
        onClose={hideDialog}
      />
    </Surface>
  );
};

const getModelIcon = (id: string): string => {
  switch (id) {
    case 'gemini': return 'cube';
    case 'chatgpt': return 'cube';
    case 'claude': return 'cube';
    default: return 'key';
  }
};

const styles = StyleSheet.create({
  container: {
    marginBottom: 25,
    borderRadius: 16,
    elevation: 2,
  },
  containerContent: {
    borderRadius: 16,
    overflow: 'hidden',
  },
  accordionWrapper: {
    marginHorizontal: 8,
    marginVertical: 4,
    borderRadius: 8,
    overflow: 'hidden',
  },
  accordionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 8,
  },
  accordionHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    minWidth: 0,
  },
  accordionIcon: {
    marginRight: 12,
  },
  accordionTitleBlock: {
    flex: 1,
    minWidth: 0,
  },
  accordionTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
  accordionDesc: {
    fontSize: 13,
    marginTop: 2,
  },
  accordionHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginLeft: 8,
  },
  headerActionBtn: {
    padding: 4,
  },
  accordionContent: {
    padding: 16,
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
  systemInstructionInput: {
    minHeight: 88,
    height: 'auto',
    paddingTop: 12,
    paddingRight: 12,
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
    justifyContent: 'flex-end',
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 8,
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
  },
  saveButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  presetContainer: {
    marginBottom: 12,
  },
  presetLabel: {
    fontSize: 14,
    fontWeight: '500',
    marginBottom: 8,
  },
  presetChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  presetChip: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
  },
  presetChipText: {
    fontSize: 13,
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
