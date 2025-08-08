import React, { useState } from 'react';
import { StyleSheet, View, TouchableOpacity, Platform, Modal } from 'react-native';
import { Text } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import { theme } from '../../constants/theme';
import SettingsSection from './SettingsSection';
import * as Device from 'expo-device';

type InferenceEngine = 'llama.cpp' | 'mediapipe' | 'mlc-llm' | 'mlx';

interface InferenceEngineProps {
  selectedEngine: InferenceEngine;
  onEngineChange: (engine: InferenceEngine) => void;
}

const InferenceEngineSection: React.FC<InferenceEngineProps> = ({
  selectedEngine,
  onEngineChange,
}) => {
  const { theme: currentTheme } = useTheme();
  const [modalVisible, setModalVisible] = useState(false);

  const isAppleSilicon = Platform.OS === 'ios' && (
    Device.modelName?.includes('M1') || 
    Device.modelName?.includes('M2') || 
    Device.modelName?.includes('M3') ||
    Device.modelName?.includes('M4')
  );

  const engines = [
    {
      id: 'llama.cpp' as InferenceEngine,
      name: 'llama.cpp',
      description: 'The most popular inference engine with broad model support',
      icon: 'language-cpp',
      enabled: true,
    },
    {
      id: 'mediapipe' as InferenceEngine,
      name: 'Google AI Edge Gallery (MediaPipe)',
      description: 'MediaPipe LLM inference of AI Edge Gallery (not yet implemented)',
      icon: 'google',
      enabled: false,
    },
    {
      id: 'mlc-llm' as InferenceEngine,
      name: 'MLC LLM',
      description: 'Machine Learning Compilation for LLMs (not yet implemented)',
      icon: 'flash',
      enabled: false,
    },
    {
      id: 'mlx' as InferenceEngine,
      name: 'MLX',
      description: 'Apple Silicon optimized inference (not yet implemented)',
      icon: 'apple',
      enabled: false,
      requiresAppleSilicon: true,
    },
  ];

  const getEngineDisplayName = (engineId: InferenceEngine): string => {
    const engine = engines.find(e => e.id === engineId);
    return engine?.name || engineId;
  };

  const handleEngineSelect = (engine: typeof engines[0]) => {
    if (!engine.enabled || (engine.requiresAppleSilicon && !isAppleSilicon)) {
      return;
    }
    onEngineChange(engine.id);
    setModalVisible(false);
  };

  const renderEngineItem = (engine: typeof engines[0]) => {
    const isSelected = selectedEngine === engine.id;
    const isDisabled = !engine.enabled || (engine.requiresAppleSilicon && !isAppleSilicon);

    return (
      <TouchableOpacity
        key={engine.id}
        style={[
          styles.engineItem,
          { backgroundColor: theme[currentTheme].borderColor },
          isSelected && styles.selectedEngineItem,
          isDisabled && styles.engineItemDisabled
        ]}
        onPress={() => handleEngineSelect(engine)}
        disabled={isDisabled}
      >
        <View style={styles.engineIconContainer}>
          <MaterialCommunityIcons 
            name={engine.icon as any}
            size={28} 
            color={isDisabled ? theme[currentTheme].secondaryText : (isSelected ? theme[currentTheme].primary : theme[currentTheme].text)} 
          />
        </View>
        <View style={styles.engineInfo}>
          <Text 
            style={[
              styles.engineName, 
              { 
                color: isDisabled ? theme[currentTheme].secondaryText : theme[currentTheme].text,
                fontWeight: isSelected ? '600' : '500',
              }
            ]}
          >
            {engine.name}
          </Text>
          <Text 
            style={[
              styles.engineDescription, 
              { color: isDisabled ? theme[currentTheme].secondaryText : theme[currentTheme].secondaryText }
            ]}
          >
            {engine.description}
          </Text>
          {engine.requiresAppleSilicon && !isAppleSilicon && (
            <Text style={[styles.requirementText, { color: '#FF3B30' }]}>
              Requires Apple Silicon
            </Text>
          )}
        </View>
        {isSelected && (
          <View style={styles.selectedIndicator}>
            <MaterialCommunityIcons 
              name="check-circle" 
              size={24} 
              color={theme[currentTheme].primary} 
            />
          </View>
        )}
      </TouchableOpacity>
    );
  };

  return (
    <>
      <SettingsSection title="INFERENCE ENGINE">
        <TouchableOpacity
          style={styles.settingItem}
          onPress={() => setModalVisible(true)}
        >
          <View style={styles.settingLeft}>
            <View style={[styles.iconContainer, { backgroundColor: currentTheme === 'dark' ? 'rgba(255, 255, 255, 0.2)' : theme[currentTheme].primary + '20' }]}>
              <MaterialCommunityIcons 
                name="engine"
                size={22} 
                color={currentTheme === 'dark' ? '#FFFFFF' : theme[currentTheme].primary} 
              />
            </View>
            <View style={styles.settingTextContainer}>
              <Text style={[styles.settingText, { color: theme[currentTheme].text }]}>
                Inference Engine
              </Text>
              <Text style={[styles.settingDescription, { color: theme[currentTheme].secondaryText }]}>
                {getEngineDisplayName(selectedEngine)}
              </Text>
            </View>
          </View>
          <MaterialCommunityIcons 
            name="chevron-right" 
            size={20} 
            color={theme[currentTheme].secondaryText} 
          />
        </TouchableOpacity>
      </SettingsSection>

      <Modal
        visible={modalVisible}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: theme[currentTheme].background }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: theme[currentTheme].text }]}>
                Select Inference Engine
              </Text>
              <TouchableOpacity 
                onPress={() => setModalVisible(false)}
                style={styles.closeButton}
              >
                <MaterialCommunityIcons 
                  name="close" 
                  size={24} 
                  color={theme[currentTheme].text} 
                />
              </TouchableOpacity>
            </View>

            <View style={styles.engineList}>
              {engines.map(renderEngineItem)}
            </View>
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
    marginBottom: 20,
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
    marginBottom: 8,
  },
  selectedEngineItem: {
    backgroundColor: 'rgba(74, 6, 96, 0.1)',
  },
  engineItemDisabled: {
    opacity: 0.5,
  },
  engineIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(74, 6, 96, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  engineInfo: {
    flex: 1,
  },
  engineName: {
    fontSize: 16,
    marginBottom: 4,
  },
  engineDescription: {
    fontSize: 14,
  },
  requirementText: {
    fontSize: 12,
    marginTop: 2,
    fontWeight: '500',
  },
  selectedIndicator: {
    marginLeft: 12,
  },
});

export default InferenceEngineSection; 