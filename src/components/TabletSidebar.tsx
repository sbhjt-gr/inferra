import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { theme } from '../constants/theme';
import { useResponsive } from '../hooks/useResponsive';
import ModelSelector, { ModelSelectorRef } from './ModelSelector';

interface TabletSidebarProps {
  modelSelectorRef: React.RefObject<ModelSelectorRef | null>;
  shouldOpenModelSelector: boolean;
  onCloseModelSelector: () => void;
  preselectedModelPath: string | null;
  isGenerating: boolean;
  onModelSelect: (provider: 'local' | 'gemini' | 'chatgpt' | 'deepseek' | 'claude', modelPath?: string, projectorPath?: string) => void;
  onNewChat: () => void;
  onChatHistory: () => void;
  activeProvider: 'local' | 'gemini' | 'chatgpt' | 'deepseek' | 'claude' | null;
}

export default function TabletSidebar({
  modelSelectorRef,
  shouldOpenModelSelector,
  onCloseModelSelector,
  preselectedModelPath,
  isGenerating,
  onModelSelect,
  onNewChat,
  onChatHistory,
  activeProvider,
}: TabletSidebarProps) {
  const { theme: currentTheme } = useTheme();
  const themeColors = theme[currentTheme as 'light' | 'dark'];
  const { paddingHorizontal } = useResponsive();

  const getModelDisplayName = () => {
    if (activeProvider === 'local') {
      const modelPath = preselectedModelPath;
      if (modelPath) {
        const modelFileName = modelPath.split('/').pop() || '';
        return modelFileName.split('.')[0];
      }
      return 'Local Model';
    } else if (activeProvider === 'gemini') {
      return 'Gemini';
    } else if (activeProvider === 'chatgpt') {
      return 'GPT-4o';
    } else if (activeProvider === 'deepseek') {
      return 'DeepSeek R1';
    } else if (activeProvider === 'claude') {
      return 'Claude';
    }
    return 'Select Model';
  };

  const getModelIcon = () => {
    if (activeProvider === 'local') {
      return 'cube';
    } else if (activeProvider) {
      return 'cloud';
    }
    return 'cube-outline';
  };

  return (
    <View style={[styles.sidebar, { backgroundColor: themeColors.cardBackground }]}>
      <ScrollView style={styles.sidebarContent} showsVerticalScrollIndicator={false}>
        <View style={[styles.sidebarSection, { paddingHorizontal: paddingHorizontal / 2 }]}>
          <Text style={[styles.sectionTitle, { color: themeColors.text }]}>
            Quick Actions
          </Text>
          
          <TouchableOpacity
            style={[styles.actionButton, { backgroundColor: themeColors.primary }]}
            onPress={onNewChat}
          >
            <MaterialCommunityIcons name="plus" size={20} color="#fff" />
            <Text style={[styles.actionButtonText, { color: '#fff' }]}>
              New Chat
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionButton, { backgroundColor: themeColors.borderColor }]}
            onPress={onChatHistory}
          >
            <MaterialCommunityIcons name="clock-outline" size={20} color={themeColors.text} />
            <Text style={[styles.actionButtonText, { color: themeColors.text }]}>
              Chat History
            </Text>
          </TouchableOpacity>
        </View>

        <View style={[styles.sidebarSection, { paddingHorizontal: paddingHorizontal / 2 }]}>
          <Text style={[styles.sectionTitle, { color: themeColors.text }]}>
            Current Model
          </Text>
          
          <View style={[styles.modelInfo, { backgroundColor: themeColors.background, borderColor: themeColors.borderColor }]}>
            <MaterialCommunityIcons
              name={getModelIcon() as any}
              size={24}
              color={themeColors.primary}
            />
            <View style={styles.modelTextContainer}>
              <Text style={[styles.modelName, { color: themeColors.text }]}>
                {getModelDisplayName()}
              </Text>
              <Text style={[styles.modelType, { color: themeColors.secondaryText }]}>
                {activeProvider === 'local' ? 'Local' : 'Cloud'}
              </Text>
            </View>
          </View>
        </View>

        <View style={[styles.modelSelectorWrapper, { paddingHorizontal: paddingHorizontal / 2 }]}>
          <ModelSelector 
            ref={modelSelectorRef}
            isOpen={shouldOpenModelSelector}
            onClose={onCloseModelSelector}
            preselectedModelPath={preselectedModelPath}
            isGenerating={isGenerating}
            onModelSelect={onModelSelect}
          />
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  sidebar: {
    width: 300,
    borderRightWidth: 1,
    borderRightColor: 'rgba(0, 0, 0, 0.1)',
  },
  sidebarContent: {
    flex: 1,
    paddingTop: 20,
  },
  sidebarSection: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 12,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
  },
  actionButtonText: {
    fontSize: 14,
    fontWeight: '500',
    marginLeft: 8,
  },
  modelInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
  },
  modelTextContainer: {
    flex: 1,
    marginLeft: 12,
  },
  modelName: {
    fontSize: 14,
    fontWeight: '500',
  },
  modelType: {
    fontSize: 12,
    marginTop: 2,
  },
  modelSelectorWrapper: {
    marginTop: 8,
  },
});