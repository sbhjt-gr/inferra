import { useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { huggingFaceService, HFModel, HFModelDetails } from '../services/HuggingFaceService';
import { modelDownloader } from '../services/ModelDownloader';
import { DownloadableModel } from '../components/model/DownloadableModelItem';
import { ModelFormat } from '../types/models';
import { ModelManager } from '@inferrlm/react-native-mlx';
import { fs as FileSystem } from '../services/fs';
import { afterModalClose } from '../services/adapters/ModalStackAdapter';

export const useUnifiedModelList = (
  storedModels: any[],
  downloadProgress: any,
  setDownloadProgress: React.Dispatch<React.SetStateAction<any>>
) => {
  const router = useRouter();

  const [searchQuery, setSearchQuery] = useState('');
  const [hfModels, setHfModels] = useState<HFModel[]>([]);
  const [hfLoading, setHfLoading] = useState(false);
  const [selectedModel, setSelectedModel] = useState<HFModelDetails | null>(null);
  const [modelDetailsLoading, setModelDetailsLoading] = useState(false);
  const [loadingModelId, setLoadingModelId] = useState<string | null>(null);
  const [dialogVisible, setDialogVisible] = useState(false);
  const [dialogTitle, setDialogTitle] = useState('');
  const [dialogMessage, setDialogMessage] = useState('');
  const [showingHfResults, setShowingHfResults] = useState(false);
  const [showWarningDialog, setShowWarningDialog] = useState(false);
  const [pendingDownload, setPendingDownload] = useState<{
    filename: string, 
    downloadUrl: string, 
    modelId: string, 
    curatedModel?: DownloadableModel,
    filesToDownload?: any[],
    licenseLink?: string,
  } | null>(null);
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());
  const [forceRender, setForceRender] = useState(0);
  const [mlxDirDialogVisible, setMlxDirDialogVisible] = useState(false);
  const [mlxDirName, setMlxDirName] = useState('');
  const [pendingMLXDownload, setPendingMLXDownload] = useState<{
    modelId: string;
    files: Array<{ filename: string; downloadUrl: string; size: number }>;
  } | null>(null);

  const showDialog = (title: string, message: string) => {
    setDialogTitle(title);
    setDialogMessage(message);
    setDialogVisible(true);
  };

  const showDialogAfterModalClose = (title: string, message: string) => {
    afterModalClose(() => showDialog(title, message));
  };

  const hideDialog = () => setDialogVisible(false);

  const handleFilterExpandChange = (isExpanded: boolean) => {
    if (!isExpanded) {
      setForceRender(prev => prev + 1);
    }
  };

  const formatDownloads = (count: number): string => {
    if (count >= 1000000) {
      return `${(count / 1000000).toFixed(1)}M`;
    } else if (count >= 1000) {
      return `${(count / 1000).toFixed(1)}K`;
    }
    return count.toString();
  };

  const convertHfModelToDownloadable = (hfModel: HFModel): DownloadableModel => {
    const modelId = hfModel.id;
    const modelName = modelId.split('/').pop() || modelId;
    
    const tags = [];
    if (hfModel.hasVision) {
      tags.push('vision');
    }
    
    const modelFormat = hfModel.modelFormat || ModelFormat.UNKNOWN;
    if (modelFormat === ModelFormat.MLX) {
      tags.push('mlx');
    } else if (modelFormat === ModelFormat.GGUF) {
      tags.push('llamacpp');
    }

    return {
      name: modelName,
      description: '',
      size: `${formatDownloads(hfModel.downloads || 0)} downloads`,
      huggingFaceLink: `https://huggingface.co/${modelId}`,
      licenseLink: `https://huggingface.co/${modelId}`,
      modelFamily: '',
      quantization: '',
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
    if (!query.trim()) {
      setHfModels([]);
      setShowingHfResults(false);
    }
  };

  const handleSearchSubmit = () => {
    if (searchQuery.trim()) {
      searchHuggingFace(searchQuery);
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
    setLoadingModelId(model.id);
    setSelectedModel(null);
    setSelectedFiles(new Set());
    
    try {
      const details = await huggingFaceService.getModelDetails(model.id);
      setSelectedModel(details);
      setModelDetailsLoading(false);
      setLoadingModelId(null);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      setModelDetailsLoading(false);
      setLoadingModelId(null);
      setSelectedModel(null);
      showDialogAfterModalClose('Error', `Failed to load model details: ${errorMessage}`);
    }
  };

  const closeModelFilesDialog = () => {
    setModelDetailsLoading(false);
    setLoadingModelId(null);
    setSelectedModel(null);
    setSelectedFiles(new Set());
  };

  const handleHfModelDownload = async (model: DownloadableModel) => {
    const hfModel = hfModels.find(hf => hf.id.includes(model.name) || model.name.includes(hf.id.split('/').pop() || ''));
    if (!hfModel) {
      showDialog('Error', 'Could not find model details');
      return;
    }

    if (hfModel.modelFormat === ModelFormat.MLX) {
      if (Platform.OS !== 'ios') {
        showDialog('Not Supported', 'MLX downloads are only available on iOS.');
        return;
      }

      const modelId = hfModel.id;
      
      const isAlreadyDownloaded = await ModelManager.isDownloaded(modelId);
      if (isAlreadyDownloaded) {
        showDialog('Already Downloaded', 'This MLX model is already in your collection.');
        return;
      }

      try {
        const details = await huggingFaceService.getModelDetails(modelId);
        const mlxFiles = details.mlxFileGroup?.required || [];
        
        if (mlxFiles.length === 0) {
          showDialog('Error', 'No MLX files found for this model');
          return;
        }

        const filesToDownload = mlxFiles.map(file => ({
          filename: file.rfilename,
          downloadUrl: file.url || `https://huggingface.co/${modelId}/resolve/main/${file.rfilename}`,
          size: file.size || 0,
        }));

        requestMLXDownload(modelId, filesToDownload);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        showDialog('Download Error', `Failed to download MLX model: ${errorMessage}`);
      }
      return;
    }

    await handleModelPress(hfModel);
  };

  const requestMLXDownload = (
    modelId: string,
    files: Array<{ filename: string; downloadUrl: string; size: number }>
  ) => {
    const defaultDir = modelId.split('/').pop() || modelId;
    afterModalClose(() => {
      setMlxDirName(defaultDir);
      setPendingMLXDownload({ modelId, files });
      setMlxDirDialogVisible(true);
    });
  };

  const hideMLXDirDialog = () => {
    setMlxDirDialogVisible(false);
    setPendingMLXDownload(null);
    setMlxDirName('');
  };

  const confirmMLXDirDownload = async () => {
    if (!pendingMLXDownload) {
      return;
    }

    const dirName = mlxDirName.trim();
    if (!dirName) {
      showDialog('Invalid Directory', 'Please enter a folder name for MLX model files.');
      return;
    }

    const { modelId, files } = pendingMLXDownload;
    hideMLXDirDialog();
    router.push('/downloads');

    try {
      await modelDownloader.downloadMLXModel(
        modelId,
        files,
        huggingFaceService.getAccessToken(),
        dirName
      );
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      showDialog('Download Error', `Failed to start MLX model download: ${errorMessage}`);
    }
  };

  const proceedWithDownload = async (filename: string, downloadUrl: string, modelId?: string) => {
    const modelName = modelId || '';
    const fullFilename = `${modelName.replace('/', '_')}_${filename}`;
    
    if (isModelDownloaded(fullFilename)) {
      showDialog('Already Downloaded', 'This model file is already in your collection.');
      return;
    }

    router.push('/downloads');

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
    router.push('/downloads');

    const downloadPromises = files.map(async (file) => {
      const fullFilename = file.filename;
      
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
    const mainFilename = model.huggingFaceLink.split('/').pop() || model.name;

    if (isModelDownloaded(mainFilename)) {
      showDialog('Already Downloaded', 'This model is already in your collection.');
      return;
    }

    router.push('/downloads');

    const filesToDownload = [
      { filename: mainFilename, downloadUrl: model.huggingFaceLink }
    ];

    if (model.additionalFiles && model.additionalFiles.length > 0) {
      model.additionalFiles.forEach(file => {
        filesToDownload.push({
          filename: file.url.split('/').pop() || file.name,
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
    loadingModelId,
    dialogVisible,
    dialogTitle,
    dialogMessage,
    showingHfResults,
    showWarningDialog,
    pendingDownload,
    selectedFiles,
    forceRender,
    mlxDirDialogVisible,
    mlxDirName,
    pendingMLXDownload,
    showDialog,
    hideDialog,
    handleFilterExpandChange,
    convertHfModelToDownloadable,
    handleSearch,
    handleSearchSubmit,
    clearSearch,
    isModelDownloaded,
    handleModelPress,
    closeModelFilesDialog,
    handleHfModelDownload,
    requestMLXDownload,
    hideMLXDirDialog,
    confirmMLXDirDownload,
    proceedWithDownload,
    proceedWithMultipleDownloads,
    proceedWithCuratedDownload,
    setSelectedModel,
    setSelectedFiles,
    setShowWarningDialog,
    setPendingDownload,
    setMlxDirName,
  };
};
