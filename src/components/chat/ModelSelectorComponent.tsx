import React from 'react';
import { View } from 'react-native';
import ModelSelector from '../ModelSelector';
import { ModelManagementService } from '../../services/ModelManagementService';

type ProviderOption = 'local' | 'apple' | 'gemini' | 'chatgpt' | 'deepseek' | 'claude';

interface ModelSelectorComponentProps {
  modelSelectorRef: React.RefObject<any>;
  shouldOpenModelSelector: boolean;
  onClose: () => void;
  activeProvider: ProviderOption | null;
  isLoading: boolean;
  isRegenerating: boolean;
  onModelSelect: (model: ProviderOption, modelPath?: string, projectorPath?: string) => Promise<void> | void;
  style?: any;
}

const ModelSelectorComponent: React.FC<ModelSelectorComponentProps> = ({
  modelSelectorRef,
  shouldOpenModelSelector,
  onClose,
  activeProvider,
  isLoading,
  isRegenerating,
  onModelSelect,
  style
}) => {
  const modelInfo = ModelManagementService.getModelInfo(activeProvider);

  return (
    <View style={style}>
      <ModelSelector 
        ref={modelSelectorRef}
        isOpen={shouldOpenModelSelector}
        onClose={onClose}
        preselectedModelPath={modelInfo.currentModelPath}
        isGenerating={isLoading || isRegenerating}
        onModelSelect={onModelSelect}
      />
    </View>
  );
};

export default ModelSelectorComponent;
