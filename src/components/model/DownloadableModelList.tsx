import React, { useState } from 'react';
import { ScrollView, StyleSheet, View, Alert } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import DownloadableModelItem, { DownloadableModel } from './DownloadableModelItem';
import { modelDownloader } from '../../services/ModelDownloader';

interface DownloadableModelListProps {
  models: DownloadableModel[];
  storedModels: any[];
  downloadProgress: any;
  setDownloadProgress: React.Dispatch<React.SetStateAction<any>>;
}

const DownloadableModelList: React.FC<DownloadableModelListProps> = ({ 
  models,
  storedModels,
  downloadProgress, 
  setDownloadProgress
}) => {
  const navigation = useNavigation();
  const [downloadingModels, setDownloadingModels] = useState<{ [key: string]: boolean }>({});
  const [initializingDownloads, setInitializingDownloads] = useState<{ [key: string]: boolean }>({});

  const isModelDownloaded = (modelName: string) => {
    return storedModels.some(storedModel => {
      const storedModelName = storedModel.name.split('.')[0];
      const downloadableModelName = modelName.split('.')[0];
      return storedModelName.toLowerCase() === downloadableModelName.toLowerCase();
    });
  };

  const handleDownload = async (model: DownloadableModel) => {
    if (isModelDownloaded(model.name)) {
      Alert.alert(
        'Model Already Downloaded',
        'This model is already in your stored models.',
        [{ text: 'OK' }]
      );
      return;
    }

    navigation.navigate('Downloads' as never);
    
    try {
      setInitializingDownloads(prev => ({ ...prev, [model.name]: true }));
      
      setDownloadProgress((prev: any) => ({
        ...prev,
        [model.name]: {
          progress: 0,
          bytesDownloaded: 0,
          totalBytes: 0,
          status: 'starting',
          downloadId: 0
        }
      }));
      
      const { downloadId } = await modelDownloader.downloadModel(
        model.huggingFaceLink, 
        model.name
      );
      
      setDownloadProgress((prev: any) => ({
        ...prev,
        [model.name]: {
          ...prev[model.name],
          downloadId
        }
      }));

    } catch (error) {
      console.error('Download error:', error);
      setDownloadProgress((prev: any) => {
        const newProgress = { ...prev };
        delete newProgress[model.name];
        return newProgress;
      });
      Alert.alert('Error', 'Failed to start download');
    } finally {
      setInitializingDownloads(prev => ({ ...prev, [model.name]: false }));
    }
  };

  return (
    <ScrollView 
      style={styles.container}
      contentContainerStyle={styles.contentContainer}
      showsVerticalScrollIndicator={false}
    >
      {models.map(model => (
        <DownloadableModelItem
          key={model.name}
          model={model}
          isDownloaded={isModelDownloaded(model.name)}
          isDownloading={Boolean(downloadProgress[model.name])}
          isInitializing={Boolean(initializingDownloads[model.name])}
          downloadProgress={downloadProgress[model.name]}
          onDownload={handleDownload}
        />
      ))}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  contentContainer: {
    padding: 16,
    paddingTop: 0,
  },
});

export default DownloadableModelList; 