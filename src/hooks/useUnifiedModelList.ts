import { useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNavigation } from '@react-navigation/native';
import { huggingFaceService, HFModel, HFModelDetails } from '../services/HuggingFaceService';
import { modelDownloader } from '../services/ModelDownloader';
import { DownloadableModel } from '../components/model/DownloadableModelItem';

export const useUnifiedModelList = (
  storedModels: any[],
  downloadProgress: any,
  setDownloadProgress: React.Dispatch<React.SetStateAction<any>>
) => {
  const navigation = useNavigation();

  const [searchQuery, setSearchQuery] = useState('');
  const [hfModels, setHfModels] = useState<HFModel[]>([]);
  const [hfLoading, setHfLoading] = useState(false);
  const [selectedModel, setSelectedModel] = useState<HFModelDetails | null>(null);
  const [modelDetailsLoading, setModelDetailsLoading] = useState(false);
  const [dialogVisible, setDialogVisible] = useState(false);
  const [dialogTitle, setDialogTitle] = useState('');
  const [dialogMessage, setDialogMessage] = useState('');
  const [visionDialogVisible, setVisionDialogVisible] = useState(false);
  const [selectedVisionModel, setSelectedVisionModel] = useState<DownloadableModel | null>(null);
  const [showingHfResults, setShowingHfResults] = useState(false);
  const [showWarningDialog, setShowWarningDialog] = useState(false);
  const [pendingDownload, setPendingDownload] = useState<{
    filename: string, 
    downloadUrl: string, 
    modelId: string, 
    curatedModel?: DownloadableModel,
    filesToDownload?: any[]
  } | null>(null);
  const [pendingVisionDownload, setPendingVisionDownload] = useState<{
    filename: string, 
    downloadUrl: string, 
    modelId: string, 
    includeVision: boolean,
    modelDetails: HFModelDetails
  } | null>(null);
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());
  const [forceRender, setForceRender] = useState(0);

  const showDialog = (title: string, message: string) => {
    setDialogTitle(title);
    setDialogMessage(message);
    setDialogVisible(true);
  };

  const hideDialog = () => setDialogVisible(false);

  const handleFilterExpandChange = (isExpanded: boolean) => {
    if (!isExpanded) {
      setForceRender(prev => prev + 1);
    }
  };

  const convertHfModelToDownloadable = (hfModel: HFModel): DownloadableModel => {
    const modelId = hfModel.id;
    const modelName = modelId.split('/').pop() || modelId;
    
    const getModelFamily = (id: string) => {
      const lowerName = id.toLowerCase();
      if (lowerName.includes('llama')) return 'Llama';
      if (lowerName.includes('mistral')) return 'Mistral';
      if (lowerName.includes('phi')) return 'Phi';
      if (lowerName.includes('gemma')) return 'Gemma';
      if (lowerName.includes('qwen')) return 'Qwen';
      if (lowerName.includes('vicuna')) return 'Vicuna';
      if (lowerName.includes('orca')) return 'Orca';
      if (lowerName.includes('falcon')) return 'Falcon';
      if (lowerName.includes('alpaca')) return 'Alpaca';
      if (lowerName.includes('codellama')) return 'CodeLlama';
      return 'Other';
    };

    const getQuantization = (name: string) => {
      const lowerName = name.toLowerCase();
      if (lowerName.includes('q8_0')) return 'Q8_0';
      if (lowerName.includes('q6_k')) return 'Q6_K';
      if (lowerName.includes('q5_k_m')) return 'Q5_K_M';
      if (lowerName.includes('q5_0')) return 'Q5_0';
      if (lowerName.includes('q4_k_m')) return 'Q4_K_M';
      if (lowerName.includes('q4_0')) return 'Q4_0';
      if (lowerName.includes('q3_k_m')) return 'Q3_K_M';
      if (lowerName.includes('q2_k')) return 'Q2_K';
      if (lowerName.includes('iq4_nl')) return 'IQ4_NL';
      if (lowerName.includes('iq3_m')) return 'IQ3_M';
      if (lowerName.includes('iq2_m')) return 'IQ2_M';
      if (lowerName.includes('f16')) return 'F16';
      if (lowerName.includes('f32')) return 'F32';
      return 'Mixed';
    };

    const tags = [];
    if (hfModel.hasVision) {
      tags.push('vision');
    }

    return {
      name: modelName,
      description: `HuggingFace model • ${hfModel.downloads || 0} downloads • ${hfModel.likes || 0} likes`,
      size: `${hfModel.downloads || 0} downloads`,
      huggingFaceLink: `https://huggingface.co/${modelId}`,
      licenseLink: '',
      modelFamily: getModelFamily(modelId),
      quantization: getQuantization(modelId),
      tags: tags,
      modelType: hfModel.hasVision ? 'vision' as any : undefined,
      capabilities: hfModel.capabilities,
      supportsMultimodal: hfModel.hasVision,
    };
  };

  const searchHuggingFace = async (query: string) => {
    if (!query.trim()) {
      setHfModels([]);
      setShowingHfResults(false);
      return;
    }

    setHfLoading(true);
    try {
      const results = await huggingFaceService.searchModels({
        query: query.trim(),
        limit: 20
      });
      
      setHfModels(results);
      setShowingHfResults(true);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      showDialog('Search Error', `Failed to search HuggingFace models: ${errorMessage}`);
      setHfModels([]);
      setShowingHfResults(false);
    } finally {
      setHfLoading(false);
    }
  };

  const handleSearch = (query: string) => {
    setSearchQuery(query);
    if (query.trim()) {
      searchHuggingFace(query);
    } else {
      setHfModels([]);
      setShowingHfResults(false);
    }
  };

  const clearSearch = () => {
    setSearchQuery('');
    setHfModels([]);
    setShowingHfResults(false);
  };

  const isModelDownloaded = (modelName: string) => {
    return storedModels.some(storedModel => {
      const storedModelName = storedModel.name.toLowerCase();
      const checkName = modelName.toLowerCase();
      return storedModelName.includes(checkName) || checkName.includes(storedModelName);
    });
  };

  const handleModelPress = async (model: HFModel) => {
    setModelDetailsLoading(true);
    setSelectedModel(null);
    setSelectedFiles(new Set());
    
    try {
      const details = await huggingFaceService.getModelDetails(model.id);
      setSelectedModel(details);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      showDialog('Error', `Failed to load model details: ${errorMessage}`);
    } finally {
      setModelDetailsLoading(false);
    }
  };

  const handleHfModelDownload = async (model: DownloadableModel) => {
    const hfModel = hfModels.find(hf => hf.id.includes(model.name) || model.name.includes(hf.id.split('/').pop() || ''));
    if (!hfModel) {
      showDialog('Error', 'Could not find model details');
      return;
    }

    await handleModelPress(hfModel);
  };

  const proceedWithDownload = async (filename: string, downloadUrl: string, modelId?: string) => {
    const modelName = modelId || '';
    const fullFilename = `${modelName.replace('/', '_')}_${filename}`;
    
    if (isModelDownloaded(fullFilename)) {
      showDialog('Already Downloaded', 'This model file is already in your collection.');
      return;
    }

    navigation.navigate('Downloads' as never);

    try {
      setDownloadProgress((prev: any) => ({
        ...prev,
        [fullFilename]: {
          progress: 0,
          bytesDownloaded: 0,
          totalBytes: 0,
          status: 'starting',
          downloadId: 0
        }
      }));

      const { downloadId } = await modelDownloader.downloadModel(
        downloadUrl,
        fullFilename,
        huggingFaceService.getAccessToken(),
      );
      
      setDownloadProgress((prev: any) => ({
        ...prev,
        [fullFilename]: {
          ...prev[fullFilename],
          downloadId
        }
      }));

    } catch (error) {
      setDownloadProgress((prev: any) => {
        const newProgress = { ...prev };
        delete newProgress[fullFilename];
        return newProgress;
      });
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      showDialog('Download Error', `Failed to start download: ${errorMessage}`);
    }
  };

  const proceedWithMultipleDownloads = async (files: any[], modelId: string) => {
    navigation.navigate('Downloads' as never);

    const downloadPromises = files.map(async (file) => {
      const fullFilename = `${modelId.replace('/', '_')}_${file.filename}`;
      
      if (isModelDownloaded(fullFilename)) {
        return;
      }

      try {
        setDownloadProgress((prev: any) => ({
          ...prev,
          [fullFilename]: {
            progress: 0,
            bytesDownloaded: 0,
            totalBytes: 0,
            status: 'starting',
            downloadId: 0
          }
        }));

        const { downloadId } = await modelDownloader.downloadModel(
          file.downloadUrl,
          fullFilename,
          huggingFaceService.getAccessToken(),
        );
        
        setDownloadProgress((prev: any) => ({
          ...prev,
          [fullFilename]: {
            ...prev[fullFilename],
            downloadId
          }
        }));

      } catch (error) {
        setDownloadProgress((prev: any) => {
          const newProgress = { ...prev };
          delete newProgress[fullFilename];
          return newProgress;
        });
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        showDialog('Download Error', `Failed to start download for ${file.filename}: ${errorMessage}`);
      }
    });

    await Promise.allSettled(downloadPromises);
  };

  const proceedWithCuratedDownload = async (model: DownloadableModel) => {
    if (isModelDownloaded(model.name)) {
      showDialog('Already Downloaded', 'This model is already in your collection.');
      return;
    }

    navigation.navigate('Downloads' as never);

    const filesToDownload = [
      { filename: model.name, downloadUrl: model.huggingFaceLink }
    ];

    if (model.additionalFiles && model.additionalFiles.length > 0) {
      model.additionalFiles.forEach(file => {
        filesToDownload.push({
          filename: file.name,
          downloadUrl: file.url
        });
      });
    }

    const downloadPromises = filesToDownload.map(async (file) => {
      try {
        setDownloadProgress((prev: any) => ({
          ...prev,
          [file.filename]: {
            progress: 0,
            bytesDownloaded: 0,
            totalBytes: 0,
            status: 'starting',
            downloadId: 0
          }
        }));

        const { downloadId } = await modelDownloader.downloadModel(
          file.downloadUrl,
          file.filename,
          huggingFaceService.getAccessToken(),
        );
        
        setDownloadProgress((prev: any) => ({
          ...prev,
          [file.filename]: {
            ...prev[file.filename],
            downloadId
          }
        }));

      } catch (error) {
        setDownloadProgress((prev: any) => {
          const newProgress = { ...prev };
          delete newProgress[file.filename];
          return newProgress;
        });
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        showDialog('Download Error', `Failed to start download for ${file.filename}: ${errorMessage}`);
      }
    });

    await Promise.allSettled(downloadPromises);
  };

  return {
    searchQuery,
    hfModels,
    hfLoading,
    selectedModel,
    modelDetailsLoading,
    dialogVisible,
    dialogTitle,
    dialogMessage,
    visionDialogVisible,
    selectedVisionModel,
    showingHfResults,
    showWarningDialog,
    pendingDownload,
    pendingVisionDownload,
    selectedFiles,
    forceRender,
    showDialog,
    hideDialog,
    handleFilterExpandChange,
    convertHfModelToDownloadable,
    handleSearch,
    clearSearch,
    isModelDownloaded,
    handleModelPress,
    handleHfModelDownload,
    proceedWithDownload,
    proceedWithMultipleDownloads,
    proceedWithCuratedDownload,
    setSelectedModel,
    setSelectedFiles,
    setVisionDialogVisible,
    setSelectedVisionModel,
    setShowWarningDialog,
    setPendingDownload,
    setPendingVisionDownload,
  };
};
