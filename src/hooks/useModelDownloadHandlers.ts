import AsyncStorage from '@react-native-async-storage/async-storage';
import { huggingFaceService, HFModel, HFModelDetails } from '../services/HuggingFaceService';
import { modelDownloader } from '../services/ModelDownloader';
import { DownloadableModel } from '../components/model/DownloadableModelItem';
import { afterModalClose } from '../services/adapters/ModalStackAdapter';

export const useModelDownloadHandlers = (
  hfModels: HFModel[],
  selectedModel: HFModelDetails | null,
  setSelectedModel: (model: HFModelDetails | null) => void,
  setPendingDownload: (download: any) => void,
  setShowWarningDialog: (show: boolean) => void,
  setSelectedFiles: (files: Set<string>) => void,
  proceedWithDownload: (filename: string, downloadUrl: string, modelId?: string) => Promise<void>,
  proceedWithMultipleDownloads: (files: any[], modelId: string) => Promise<void>,
  requestMLXDownload: (modelId: string, files: Array<{ filename: string; downloadUrl: string; size: number }>) => void,
  proceedWithCuratedDownload: (model: DownloadableModel) => Promise<void>,
  showDialog: (title: string, message: string) => void,
  convertHfModelToDownloadable: (hfModel: HFModel) => DownloadableModel,
  handleModelPress: (model: HFModel) => Promise<void>,
  downloadProgress: any,
  setDownloadProgress: React.Dispatch<React.SetStateAction<any>>
) => {
  const openWarningDialog = (download: {
    filename: string;
    downloadUrl: string;
    modelId: string;
    curatedModel?: DownloadableModel;
    filesToDownload?: any[];
    licenseLink?: string;
  }) => {
    setPendingDownload(download);
    afterModalClose(() => setShowWarningDialog(true));
  };

  const handleDownloadFile = async (filename: string, downloadUrl: string) => {
    const modelId = selectedModel?.id || '';
    const licenseLink = modelId ? `https://huggingface.co/${modelId}` : undefined;
    
    setSelectedModel(null);
    setSelectedFiles(new Set());
    
    try {
      const hideWarning = await AsyncStorage.getItem('hideModelWarning');
      const shouldShowWarning = hideWarning !== 'true';
      
      if (shouldShowWarning) {
        openWarningDialog({ filename, downloadUrl, modelId, licenseLink });
        return;
      }
      
      await proceedWithDownload(filename, downloadUrl, modelId);
    } catch (error) {
      openWarningDialog({ filename, downloadUrl, modelId, licenseLink });
    }
  };

  const handleDownloadSelected = async (selectedFiles: Set<string>) => {
    if (!selectedModel || selectedFiles.size === 0) return;

    const modelId = selectedModel.id;
    const licenseLink = `https://huggingface.co/${modelId}`;
    const filesToDownload = selectedModel.files.filter(file => selectedFiles.has(file.filename));
    
    setSelectedModel(null);
    setSelectedFiles(new Set());

    try {
      const hideWarning = await AsyncStorage.getItem('hideModelWarning');
      const shouldShowWarning = hideWarning !== 'true';
      
      if (shouldShowWarning) {
        openWarningDialog({
          filename: `${filesToDownload.length} files`,
          downloadUrl: '',
          modelId: modelId,
          filesToDownload: filesToDownload,
          licenseLink,
        });
        return;
      }
      
      await proceedWithMultipleDownloads(filesToDownload, modelId);
    } catch (error) {
      openWarningDialog({
        filename: `${filesToDownload.length} files`,
        downloadUrl: '',
        modelId: modelId,
        filesToDownload: filesToDownload,
        licenseLink,
      });
    }
  };

  const handleDownloadMLXModel = async (
    modelId: string,
    files: Array<{ filename: string; downloadUrl: string; size: number }>
  ) => {
    setSelectedModel(null);
    setSelectedFiles(new Set());
    requestMLXDownload(modelId, files);
  };

  const handleCuratedModelDownload = async (model: DownloadableModel) => {
    try {
      const hideWarning = await AsyncStorage.getItem('hideModelWarning');
      const shouldShowWarning = hideWarning !== 'true';
      
      if (shouldShowWarning) {
        setPendingDownload({ 
          filename: model.name, 
          downloadUrl: model.huggingFaceLink, 
          modelId: model.name,
          curatedModel: model,
          licenseLink: model.licenseLink || undefined,
        });
        setShowWarningDialog(true);
        return;
      }
      
      await proceedWithCuratedDownload(model);
    } catch (error) {
      setPendingDownload({ 
        filename: model.name, 
        downloadUrl: model.huggingFaceLink, 
        modelId: model.name,
        curatedModel: model,
        licenseLink: model.licenseLink || undefined,
      });
      setShowWarningDialog(true);
    }
  };

  const handleWarningAccept = async (dontShowAgain: boolean, pendingDownload: any) => {
    if (dontShowAgain) {
      try {
        await AsyncStorage.setItem('hideModelWarning', 'true');
      } catch (error) {
      }
    }
    
    setShowWarningDialog(false);
    
    if (pendingDownload) {
      const isHuggingFaceModel = pendingDownload.modelId.includes('/');
      const isMultipleFiles = Boolean(pendingDownload.filesToDownload);
      
      if (isMultipleFiles) {
        await proceedWithMultipleDownloads(pendingDownload.filesToDownload!, pendingDownload.modelId);
      } else if (isHuggingFaceModel) {
        await proceedWithDownload(pendingDownload.filename, pendingDownload.downloadUrl, pendingDownload.modelId);
      } else {
        if (pendingDownload.curatedModel) {
          await proceedWithCuratedDownload(pendingDownload.curatedModel);
        } else {
          const curatedModel: DownloadableModel = {
            name: pendingDownload.filename,
            huggingFaceLink: pendingDownload.downloadUrl,
            licenseLink: pendingDownload.licenseLink || '',
            size: 'Unknown',
            modelFamily: 'Unknown',
            quantization: 'Unknown'
          };
          await proceedWithCuratedDownload(curatedModel);
        }
      }
      setPendingDownload(null);
    }
  };

  const handleWarningCancel = () => {
    setShowWarningDialog(false);
    setPendingDownload(null);
  };

  return {
    handleDownloadFile,
    handleDownloadMLXModel,
    handleDownloadSelected,
    handleCuratedModelDownload,
    handleWarningAccept,
    handleWarningCancel,
  };
};
