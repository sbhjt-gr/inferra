import React, { useState } from 'react';
import { ScrollView, StyleSheet, FlatList, View, Dimensions } from 'react-native';
import { useResponsive } from '../../hooks/useResponsive';
import { useNavigation } from '@react-navigation/native';
import DownloadableModelItem, { DownloadableModel } from './DownloadableModelItem';
import { modelDownloader } from '../../services/ModelDownloader';
import { Dialog, Portal, PaperProvider, Text, Button } from 'react-native-paper';

interface DownloadableModelListProps {
  models: DownloadableModel[];
  storedModels: any[];
  downloadProgress: any;
  setDownloadProgress: React.Dispatch<React.SetStateAction<any>>;
  onDownload?: (model: DownloadableModel) => void;
  gridColumns?: number;
  needsHorizontalScroll?: boolean;
  ListHeaderComponent?: () => React.JSX.Element;
}

const DownloadableModelList: React.FC<DownloadableModelListProps> = ({ 
  models,
  storedModels,
  downloadProgress, 
  setDownloadProgress,
  onDownload,
  gridColumns = 1,
  needsHorizontalScroll: propNeedsHorizontalScroll,
  ListHeaderComponent
}) => {
  const navigation = useNavigation();
  const [initializingDownloads, setInitializingDownloads] = useState<{ [key: string]: boolean }>({});
  const { isTablet, orientation, paddingHorizontal } = useResponsive();
  const screenWidth = Dimensions.get('window').width;
  const availableWidth = screenWidth - (paddingHorizontal * 2);
  const localNeedsHorizontalScroll = isTablet && orientation === 'portrait' && availableWidth < 700;
  const needsHorizontalScroll = propNeedsHorizontalScroll ?? localNeedsHorizontalScroll;
  
  const safeNeedsHorizontalScroll = needsHorizontalScroll && availableWidth > 200;

  const [dialogVisible, setDialogVisible] = useState(false);
  const [dialogTitle, setDialogTitle] = useState('');
  const [dialogMessage, setDialogMessage] = useState('');

  const showDialog = (title: string, message: string) => {
    setDialogTitle(title);
    setDialogMessage(message);
    setDialogVisible(true);
  };

  const hideDialog = () => setDialogVisible(false);

  const isModelDownloaded = (modelName: string) => {
    return storedModels.some(storedModel => {
      const storedModelName = storedModel.name.split('.')[0];
      const downloadableModelName = modelName.split('.')[0];
      return storedModelName.toLowerCase() === downloadableModelName.toLowerCase();
    });
  };

  const handleDownload = async (model: DownloadableModel) => {
    if (isModelDownloaded(model.name)) {
      showDialog(
        'Model Already Downloaded',
        'This model is already in your stored models.'
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

      if (model.additionalFiles && model.additionalFiles.length > 0) {
        for (const additionalFile of model.additionalFiles) {
          try {
            await modelDownloader.downloadModel(
              additionalFile.url,
              additionalFile.name
            );
          } catch (error) {
            console.error(`Failed to download additional file ${additionalFile.name}:`, error);
          }
        }
      }

    } catch (error) {
      console.error('Download error:', error);
      setDownloadProgress((prev: any) => {
        const newProgress = { ...prev };
        delete newProgress[model.name];
        return newProgress;
      });
      showDialog('Error', 'Failed to start download');
    } finally {
      setInitializingDownloads(prev => ({ ...prev, [model.name]: false }));
    }
  };

  const renderItem = ({ item }: { item: DownloadableModel }) => (
    <DownloadableModelItem
      model={item}
      isDownloaded={isModelDownloaded(item.name)}
      isDownloading={Boolean(downloadProgress[item.name])}
      isInitializing={Boolean(initializingDownloads[item.name])}
      downloadProgress={downloadProgress[item.name]}
      onDownload={onDownload || handleDownload}
    />
  );

  if (safeNeedsHorizontalScroll) {
    return (
      <View style={styles.container}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={true}
          contentContainerStyle={styles.horizontalScrollContainer}
          style={styles.horizontalScrollView}
        >
          {models.map((item) => (
            <View key={item.name} style={styles.horizontalItemWrapper}>
              {renderItem({ item })}
            </View>
          ))}
        </ScrollView>

        <Portal>
          <Dialog visible={dialogVisible} onDismiss={hideDialog}>
            <Dialog.Title>{dialogTitle}</Dialog.Title>
            <Dialog.Content>
              <Text>{dialogMessage}</Text>
            </Dialog.Content>
            <Dialog.Actions>
              <Button onPress={hideDialog}>OK</Button>
            </Dialog.Actions>
          </Dialog>
        </Portal>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList 
        data={models}
        renderItem={renderItem}
        keyExtractor={item => item.name}
        numColumns={gridColumns}
        key={gridColumns}
        contentContainerStyle={styles.contentContainer}
        columnWrapperStyle={gridColumns > 1 ? styles.gridRow : undefined}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={ListHeaderComponent}
      />

      <Portal>
        <Dialog visible={dialogVisible} onDismiss={hideDialog}>
          <Dialog.Title>{dialogTitle}</Dialog.Title>
          <Dialog.Content>
            <Text>{dialogMessage}</Text>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={hideDialog}>OK</Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    minHeight: 200,
  },
  contentContainer: {
    padding: 16,
  },
  gridRow: {
    justifyContent: 'space-between',
    paddingHorizontal: 6,
  },
  horizontalScrollContainer: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    flexDirection: 'row',
  },
  horizontalScrollView: {
    flexGrow: 0,
  },
  horizontalItemWrapper: {
    width: 320,
    marginRight: 16,
    minWidth: 280,
  },
});

export default DownloadableModelList; 