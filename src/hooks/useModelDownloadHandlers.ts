import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNavigation } from '@react-navigation/native';
import { huggingFaceService, HFModel, HFModelDetails } from '../services/HuggingFaceService';
import { modelDownloader } from '../services/ModelDownloader';
import { DownloadableModel } from '../components/model/DownloadableModelItem';

export const useModelDownloadHandlers = (
  hfModels: HFModel[],
  selectedModel: HFModelDetails | null,
  setSelectedModel: (model: HFModelDetails | null) => void,
  selectedVisionModel: DownloadableModel | null,
  setSelectedVisionModel: (model: DownloadableModel | null) => void,
  setVisionDialogVisible: (visible: boolean) => void,
  setPendingDownload: (download: any) => void,
  setPendingVisionDownload: (download: any) => void,
  setShowWarningDialog: (show: boolean) => void,
  setSelectedFiles: (files: Set<string>) => void,
  proceedWithDownload: (filename: string, downloadUrl: string, modelId?: string) => Promise<void>,
  proceedWithMultipleDownloads: (files: any[], modelId: string) => Promise<void>,
  proceedWithCuratedDownload: (model: DownloadableModel) => Promise<void>,
  showDialog: (title: string, message: string) => void,
  convertHfModelToDownloadable: (hfModel: HFModel) => DownloadableModel,
  handleModelPress: (model: HFModel) => Promise<void>,
  downloadProgress: any,
  setDownloadProgress: React.Dispatch<React.SetStateAction<any>>
) => {
  const navigation = useNavigation();

  const handleVisionDownload = async (includeVision: boolean, projectionFile?: any) => {
    if (!selectedVisionModel) return;

    const hfModel = hfModels.find(hf => 
      hf.id.includes(selectedVisionModel.name) || 
      selectedVisionModel.name.includes(hf.id.split('/').pop() || '')
    );
    
    if (!hfModel) {
      showDialog('Error', 'Could not find model details');
      return;
    }

    try {
      const details = await huggingFaceService.getModelDetails(hfModel.id);
      
      const mainFile = details.files.find(f => 
        f.filename.endsWith('.gguf') && !f.filename.toLowerCase().includes('mmproj')
      );
      
      if (!mainFile) {
        showDialog('Error', 'Could not find main model file');
        return;
      }

      await startDownloadWithVisionSupport(mainFile.filename, mainFile.downloadUrl, details.id, includeVision, details);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      showDialog('Error', `Failed to load model details: ${errorMessage}`);
    }
  };

  const startDownloadWithVisionSupport = async (
    filename: string, 
    downloadUrl: string, 
    modelId: string, 
    includeVision: boolean,
    modelDetails: HFModelDetails
  ) => {
    const hideWarning = await AsyncStorage.getItem('hideModelWarning');
    
    const downloadFiles = [{ filename, downloadUrl }];
    
    if (includeVision) {
      const mmprojFile = modelDetails.files.find(f => 
        f.filename.toLowerCase().includes('mmproj') && f.filename.endsWith('.gguf')
      );
      
      if (mmprojFile) {
        downloadFiles.push({ 
          filename: mmprojFile.filename, 
          downloadUrl: mmprojFile.downloadUrl 
        });
      }
    }

    const startDownload = async () => {
      navigation.navigate('Downloads' as never);

      const downloadPromises = downloadFiles.map(async (file) => {
        const fullFilename = `${modelId.replace('/', '_')}_${file.filename}`;
        
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

    if (hideWarning === 'true') {
      await startDownload();
    } else {
      setPendingVisionDownload({ filename, downloadUrl, modelId, includeVision, modelDetails });
      setShowWarningDialog(true);
    }
  };

  const handleDownloadFile = async (filename: string, downloadUrl: string) => {
    const modelId = selectedModel?.id || '';
    
    const isVisionModel = selectedModel?.hasVision;
    const isMainModelFile = filename.endsWith('.gguf') && !filename.toLowerCase().includes('mmproj');
    
    if (isVisionModel && isMainModelFile) {
      const hfModel = hfModels.find(hf => hf.id === modelId);
      if (hfModel) {
        const convertedModel = convertHfModelToDownloadable(hfModel);
        setSelectedModel(null);
        setSelectedVisionModel(convertedModel);
        setVisionDialogVisible(true);
        return;
      }
    }
    
    setSelectedModel(null);
    setSelectedFiles(new Set());
    
    try {
      const hideWarning = await AsyncStorage.getItem('hideModelWarning');
      const shouldShowWarning = hideWarning !== 'true';
      
      if (shouldShowWarning) {
        setPendingDownload({ filename, downloadUrl, modelId });
        setShowWarningDialog(true);
        return;
      }
      
      await proceedWithDownload(filename, downloadUrl, modelId);
    } catch (error) {
      setPendingDownload({ filename, downloadUrl, modelId });
      setShowWarningDialog(true);
    }
  };

  const handleDownloadSelected = async (selectedFiles: Set<string>) => {
    if (!selectedModel || selectedFiles.size === 0) return;

    const modelId = selectedModel.id;
    const filesToDownload = selectedModel.files.filter(file => selectedFiles.has(file.filename));
    
    setSelectedModel(null);
    setSelectedFiles(new Set());

    try {
      const hideWarning = await AsyncStorage.getItem('hideModelWarning');
      const shouldShowWarning = hideWarning !== 'true';
      
      if (shouldShowWarning) {
        setPendingDownload({ 
          filename: `${filesToDownload.length} files`, 
          downloadUrl: '', 
          modelId: modelId,
          filesToDownload: filesToDownload
        });
        setShowWarningDialog(true);
        return;
      }
      
      await proceedWithMultipleDownloads(filesToDownload, modelId);
    } catch (error) {
      setPendingDownload({ 
        filename: `${filesToDownload.length} files`, 
        downloadUrl: '', 
        modelId: modelId,
        filesToDownload: filesToDownload
      });
      setShowWarningDialog(true);
    }
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
          curatedModel: model
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
        curatedModel: model
      });
      setShowWarningDialog(true);
    }
  };

  const handleWarningAccept = async (dontShowAgain: boolean, pendingDownload: any, pendingVisionDownload: any) => {
    if (dontShowAgain) {
      try {
        await AsyncStorage.setItem('hideModelWarning', 'true');
      } catch (error) {
      }
    }
    
    setShowWarningDialog(false);
    
    if (pendingVisionDownload) {
      navigation.navigate('Downloads' as never);
      
      const downloadFiles = [{ 
        filename: pendingVisionDownload.filename, 
        downloadUrl: pendingVisionDownload.downloadUrl 
      }];
      
      if (pendingVisionDownload.includeVision) {
        const mmprojFile = pendingVisionDownload.modelDetails.files.find((f: any) => 
          f.filename.toLowerCase().includes('mmproj') && f.filename.endsWith('.gguf')
        );
        
        if (mmprojFile) {
          downloadFiles.push({ 
            filename: mmprojFile.filename, 
            downloadUrl: mmprojFile.downloadUrl 
          });
        }
      }

      const downloadPromises = downloadFiles.map(async (file) => {
        const fullFilename = `${pendingVisionDownload.modelId.replace('/', '_')}_${file.filename}`;
        
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
      
      setPendingVisionDownload(null);
    } else if (pendingDownload) {
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
            licenseLink: '',
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
    setPendingVisionDownload(null);
  };

  return {
    handleVisionDownload,
    handleDownloadFile,
    handleDownloadSelected,
    handleCuratedModelDownload,
    handleWarningAccept,
    handleWarningCancel,
  };
};
