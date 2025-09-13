import React from 'react';
import { View } from 'react-native';
import ModelSelector from '../ModelSelector';
import { ModelManagementService } from '../../services/ModelManagementService';

interface ModelSelectorComponentProps {
  modelSelectorRef: React.RefObject<any>;
  shouldOpenModelSelector: boolean;
  onClose: () => void;
  activeProvider: string | null;
  isLoading: boolean;
  isRegenerating: boolean;
  onModelSelect: (model: string, modelPath?: string, projectorPath?: string) => void;
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
