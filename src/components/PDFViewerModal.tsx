import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  View,
  Modal,
  TouchableOpacity,
  SafeAreaView,
  Platform,
  Text,
  ActivityIndicator,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import PdfRendererView from 'react-native-pdf-renderer';
import { useTheme } from '../context/ThemeContext';
import { theme } from '../constants/theme';

type PdfViewerModalProps = {
  visible: boolean;
  onClose: () => void;
  pdfSource: string;
  fileName?: string;
};

export default function PDFViewerModal({
  visible,
  onClose,
  pdfSource,
  fileName = "Document",
}: PdfViewerModalProps) {
  const { theme: currentTheme } = useTheme();
  const themeColors = theme[currentTheme as 'light' | 'dark'];
  const isDark = currentTheme === 'dark';
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const formatPdfPath = (path: string): string => {
    if (path.startsWith('file://')) {
      return path;
    }
    return Platform.OS === 'ios' ? `file://${path}` : path;
  };

  const displayFileName = fileName || pdfSource.split('/').pop() || "Document";

  useEffect(() => {
    if (visible) {
      setLoading(true);
      setError(null);

      setTimeout(() => {
        try {
          if (!pdfSource || typeof pdfSource !== 'string') {
            throw new Error('Invalid PDF source');
          }
          setLoading(false);
        } catch (err) {
          setLoading(false);
          setError('Failed to load PDF. The file might be corrupted or not accessible.');
          console.error('PDF loading error:', err);
        }
      }, 500);
    }
  }, [visible, pdfSource]);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={false}
      onRequestClose={onClose}
    >
      <SafeAreaView style={[styles.container, { backgroundColor: isDark ? '#121212' : '#fff' }]}>
        <View style={styles.header}>
          <Text 
            style={[
              styles.fileNameText, 
              { color: isDark ? '#ffffff' : '#660880' }
            ]}
            numberOfLines={1}
            ellipsizeMode="middle"
          >
            {displayFileName}
          </Text>
          <TouchableOpacity style={styles.closeButton} onPress={onClose}>
            <MaterialCommunityIcons 
              name="close" 
              size={24} 
              color={isDark ? '#ffffff' : "#660880"} 
            />
          </TouchableOpacity>
        </View>
        
        <View style={[styles.pdfContainer, { backgroundColor: isDark ? '#1e1e1e' : '#f5f5f5' }]}>
          {loading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color="#660880" />
              <Text style={[styles.loadingText, { color: isDark ? '#ffffff' : '#333333' }]}>
                Loading PDF...
              </Text>
            </View>
          ) : error ? (
            <View style={styles.errorContainer}>
              <MaterialCommunityIcons 
                name="alert-circle-outline" 
                size={48} 
                color={isDark ? '#ffffff' : "#660880"} 
              />
              <Text style={[styles.errorText, { color: isDark ? '#ffffff' : '#333333' }]}>
                {error}
              </Text>
            </View>
          ) : (
            <PdfRendererView
              style={styles.pdfView}
              source={formatPdfPath(pdfSource)}
              distanceBetweenPages={16}
              maxZoom={5}
            />
          )}
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    height: 50,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  fileNameText: {
    fontSize: 16,
    fontWeight: '500',
    flex: 1,
    marginRight: 16,
  },
  closeButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 20,
  },
  pdfContainer: {
    flex: 1,
  },
  pdfView: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  errorText: {
    marginTop: 16,
    fontSize: 16,
    textAlign: 'center',
  },
  infoText: {
    marginTop: 8,
    fontSize: 14,
    textAlign: 'center',
  },
}); 