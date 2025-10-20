import React from 'react';
import { View, TouchableOpacity, Text, StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import { theme } from '../../constants/theme';
import { llamaManager } from '../../utils/LlamaManager';
import path from 'path';

type ProviderOption = 'local' | 'apple' | 'gemini' | 'chatgpt' | 'deepseek' | 'claude';

interface ModelSelectorButtonProps {
  activeProvider: ProviderOption | null;
  onPress: () => void;
  disabled?: boolean;
}

const ModelSelectorButton: React.FC<ModelSelectorButtonProps> = ({
  activeProvider,
  onPress,
  disabled = false,
}) => {
  const { theme: currentTheme } = useTheme();
  const themeColors = theme[currentTheme as 'light' | 'dark'];

  const getModelInfo = () => {
    let modelName = 'Select a Model';
    let iconName: keyof typeof MaterialCommunityIcons.glyphMap = "cube-outline";
    let currentModelPath = activeProvider === 'local' ? llamaManager.getModelPath() : activeProvider;
    
    if (activeProvider === 'local') {
      if (currentModelPath) {
        const filename = path.basename(currentModelPath);
        modelName = filename.replace(/\.(gguf|bin)$/, '');
        if (modelName.length > 25) {
          modelName = modelName.substring(0, 22) + '...';
        }
        iconName = 'cube';
      } else {
        modelName = 'Local Model';
        iconName = 'cube-outline';
      }
    } else if (activeProvider === 'apple') {
      modelName = 'Apple Foundation';
      iconName = 'apple';
    } else if (activeProvider === 'gemini') {
      modelName = 'Gemini';
      iconName = 'google';
    } else if (activeProvider === 'chatgpt') {
      modelName = 'ChatGPT';
      iconName = 'robot';
    } else if (activeProvider === 'deepseek') {
      modelName = 'DeepSeek';
      iconName = 'brain';
    } else if (activeProvider === 'claude') {
      modelName = 'Claude';
      iconName = 'account-tie';
    }
    
    return { modelName, iconName };
  };

  const { modelName, iconName } = getModelInfo();

  return (
    <View style={styles.modelSelectorContainer}>
      <View style={styles.modelSelectorWrapper}>
        <TouchableOpacity
          style={[
            styles.modelSelector,
            { backgroundColor: themeColors.cardBackground }
          ]}
          onPress={onPress}
          disabled={disabled}
        >
          <View style={styles.modelSelectorContent}>
            <MaterialCommunityIcons
              name={iconName}
              size={20}
              color={themeColors.text}
              style={styles.modelIcon}
            />
            <Text 
              style={[
                styles.modelText, 
                { color: themeColors.text }
              ]}
              numberOfLines={1}
              ellipsizeMode="tail"
            >
              {modelName}
            </Text>
            <MaterialCommunityIcons
              name="chevron-down"
              size={20}
              color={themeColors.text}
            />
          </View>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  modelSelectorContainer: {
    paddingBottom: 13,
  },
  modelSelectorWrapper: {
    marginBottom: 2,
    borderRadius: 12,
    overflow: 'hidden',
    marginTop: 15,
    marginHorizontal: 16,
  },
  modelSelector: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
  },
  modelSelectorContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  modelIcon: {
    marginRight: 8,
  },
  modelText: {
    flex: 1,
    fontSize: 16,
    fontWeight: '500',
  },
});

export default ModelSelectorButton;
