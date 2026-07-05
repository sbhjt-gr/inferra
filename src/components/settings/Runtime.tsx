import React, { useMemo, useState } from 'react';
import { StyleSheet, View, TouchableOpacity, Platform, Modal, ScrollView } from 'react-native';
import { AppSwitch } from '../../services/adapters/SwitchAdapter';
import { Text } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { useTheme } from '../../context/ThemeContext';
import { theme } from '../../constants/theme';
import { EngineId } from '../../managers/inference-manager';
import InferenceIcon from '../icons/InferenceIcon';
import LlamaCppIcon from '../icons/LlamaCppIcon';
import MlxIcon from '../icons/MlxIcon';
import LiteRtIcon from '../icons/LiteRtIcon';

interface RuntimeProps {
  enabled: Record<EngineId, boolean>;
  onToggle: (engine: EngineId, enabled: boolean) => void;
}

const RuntimeSection: React.FC<RuntimeProps> = ({
  enabled,
  onToggle,
}) => {
  const { theme: currentTheme } = useTheme();
  const [modalVisible, setModalVisible] = useState(false);

  const supportsMLX = Platform.OS === 'ios' && parseInt(String(Platform.Version), 10) >= 16;

  const engines = useMemo(() => [
    {
      id: 'llama' as const,
      name: 'Llama.cpp',
      description: 'Widest GGUF model support with llama.cpp',
      icon: 'chip',
      enabled: true,
    },
    {
      id: 'mlx' as const,
      name: 'MLX',
      description: "Machine Learning Framework developed by Apple",
      icon: 'apple',
      enabled: true,
      requiresMLX: true,
      beta: true,
    },
    {
      id: 'litert' as const,
      name: 'LiteRT-LM',
      description: 'LiteRT-LM runtime for .litertlm and .task models',
      icon: 'lightning-bolt-outline',
      enabled: true,
      beta: true,
    },
  ], []);

  const renderEngineItem = (engine: (typeof engines)[number]) => {
    const isDisabled = !engine.enabled || (engine.requiresMLX && !supportsMLX);
    const themeColors = theme[currentTheme];

    return (
      <View
        key={engine.id}
        style={[
          styles.engineItem,
          { backgroundColor: themeColors.borderColor },
          isDisabled && styles.engineItemDisabled,
        ]}
      >
        <View style={[styles.engineIconContainer, { backgroundColor: currentTheme === 'dark' ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.06)' }]}>
          {engine.id === 'llama' ? (
            <LlamaCppIcon size={20} />
          ) : engine.id === 'mlx' ? (
            <MlxIcon size={20} color={currentTheme === 'dark' ? '#FFFFFF' : undefined} secondaryColor={currentTheme === 'dark' ? '#999999' : undefined} />
          ) : (
            <LiteRtIcon size={20} />
          )}
        </View>
        <View style={styles.engineInfo}>
          <View style={styles.engineHeader}>
            <Text
              style={[
                styles.engineName,
                {
                  color: isDisabled
                    ? (currentTheme === 'dark' ? '#666' : themeColors.secondaryText)
                    : (currentTheme === 'dark' ? '#fff' : themeColors.text),
                  fontWeight: '500',
                },
              ]}
            >
              {engine.name}
            </Text>
            {engine.beta && (
              <View style={[styles.tag, { backgroundColor: themeColors.primary + '20' }]}>
                <Text style={[styles.tagText, { color: themeColors.primary }]}>Beta</Text>
              </View>
            )}
          </View>
          <Text
            style={[
              styles.engineDescription,
              { color: isDisabled ? (currentTheme === 'dark' ? '#666' : themeColors.secondaryText) : (currentTheme === 'dark' ? '#aaa' : themeColors.secondaryText) },
            ]}
          >
            {engine.description}
          </Text>
          {engine.requiresMLX && !supportsMLX && (
            <Text style={[styles.requirementText, { color: currentTheme === 'dark' ? '#FF9494' : '#d32f2f' }]}>Requires iOS 26+</Text>
          )}
        </View>
        <AppSwitch
          value={Boolean(enabled[engine.id])}
          onValueChange={(value) => {
            if (isDisabled) return;
            onToggle(engine.id, value);
          }}
          disabled={isDisabled}
        />
      </View>
    );
  };

  const themeColors = theme[currentTheme];
  const iconColor = currentTheme === 'dark' ? '#FFFFFF' : themeColors.primary;

  return (
    <>
      <TouchableOpacity
        style={styles.settingItem}
        onPress={() => setModalVisible(true)}
      >
        <View style={styles.settingLeft}>
          <View style={[styles.iconContainer, { backgroundColor: currentTheme === 'dark' ? 'rgba(255, 255, 255, 0.2)' : themeColors.primary + '20' }]}>
            <InferenceIcon size={22} color={iconColor} />
          </View>
          <View style={styles.settingTextContainer}>
            <Text style={[styles.settingText, { color: themeColors.text }]}>Inference</Text>
            <Text style={[styles.settingDescription, { color: themeColors.secondaryText }]}>
              Enable or disable local runtimes
            </Text>
          </View>
        </View>
        <MaterialCommunityIcons name="chevron-right" size={24} color={themeColors.secondaryText} />
      </TouchableOpacity>

      <Modal
        visible={modalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: themeColors.background }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: themeColors.text }]}>Enable or disable runtimes</Text>
              <TouchableOpacity style={styles.closeButton} onPress={() => setModalVisible(false)}>
                <MaterialCommunityIcons name="close" size={24} color={themeColors.text} />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.engineList} showsVerticalScrollIndicator={false}>
              {engines.map(renderEngineItem)}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </>
  );
};

const styles = StyleSheet.create({
  settingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
  },
  settingItemBorder: {
    borderTopWidth: 1,
    borderTopColor: 'rgba(150, 150, 150, 0.1)',
  },
  settingItemBottomBorder: {
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(150, 150, 150, 0.1)',
  },
  settingLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  iconContainer: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  settingTextContainer: {
    flex: 1,
  },
  settingText: {
    fontSize: 16,
    fontWeight: '500',
    marginBottom: 2,
  },
  settingDescription: {
    fontSize: 13,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    maxHeight: '70%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '600',
  },
  closeButton: {
    padding: 8,
  },
  engineList: {
    paddingBottom: 20,
  },
  engineItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 12,
    marginBottom: 12,
  },
  engineIconContainer: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  engineItemDisabled: {
    opacity: 0.5,
  },
  engineInfo: {
    flex: 1,
  },
  engineHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
    gap: 8,
  },
  engineName: {
    fontSize: 16,
    fontWeight: '500',
  },
  tag: {
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  tagText: {
    fontSize: 11,
    fontWeight: '600',
  },
  engineDescription: {
    fontSize: 14,
  },
  requirementText: {
    fontSize: 12,
    marginTop: 2,
    fontWeight: '500',
  },
});

export default RuntimeSection;
