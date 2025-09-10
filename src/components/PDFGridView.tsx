import React from 'react';
import {
  StyleSheet,
  View,
  Modal,
  TouchableOpacity,
  SafeAreaView,
  Text,
  TextInput,
  FlatList,
  Image,
  Dimensions,
  Alert,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

type PageImage = {
  uri: string;
  width: number;
  height: number;
};

type PDFGridViewProps = {
  visible: boolean;
  onClose: () => void;
  displayFileName: string;
  isDark: boolean;
  extractedPages: PageImage[];
  selectedPages: number[];
  togglePageSelection: (index: number) => void;
  handleSelectAllPages: () => void;
  userPrompt: string;
  setUserPrompt: (text: string) => void;
  promptError: boolean;
  setPromptError: (hasError: boolean) => void;
  handleStartOCR: () => void;
};

export default function PDFGridView({
  visible,
  onClose,
  displayFileName,
  isDark,
  extractedPages,
  selectedPages,
  togglePageSelection,
  handleSelectAllPages,
  userPrompt,
  setUserPrompt,
  promptError,
  setPromptError,
  handleStartOCR,
}: PDFGridViewProps) {
  const screenWidth = Dimensions.get('window').width;
  const numColumns = 3;
  const itemWidth = (screenWidth - 40) / numColumns;

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
            {displayFileName} - Select Pages
          </Text>
          <TouchableOpacity style={styles.closeButton} onPress={onClose}>
            <MaterialCommunityIcons 
              name="close" 
              size={24} 
              color={isDark ? '#ffffff' : "#660880"} 
            />
          </TouchableOpacity>
        </View>

        <View style={[styles.gridHeader, { backgroundColor: isDark ? '#1a1a1a' : '#f9f9f9' }]}>
          <Text style={[styles.selectionText, { color: isDark ? '#ffffff' : '#333333' }]}>
            Selected: <Text style={{ color: '#660880', fontWeight: 'bold' }}>{selectedPages.length}</Text> of {extractedPages.length} pages
          </Text>
          <TouchableOpacity 
            style={styles.selectAllButton} 
            onPress={handleSelectAllPages}
          >
            <Text style={{ color: '#660880', fontWeight: '600' }}>
              {selectedPages.length === extractedPages.length ? 'Deselect All' : 'Select All'}
            </Text>
          </TouchableOpacity>
        </View>

        <View style={[styles.gridContainer, { backgroundColor: isDark ? '#1e1e1e' : '#f5f5f5' }]}>
          <FlatList
            data={extractedPages}
            renderItem={({ item, index }) => {
              const isSelected = selectedPages.includes(index);
              return (
                <TouchableOpacity 
                  style={[
                    styles.gridItem, 
                    { 
                      width: itemWidth, 
                      height: itemWidth * 1.4,
                      borderWidth: isSelected ? 3 : 0,
                      borderColor: '#660880'
                    }
                  ]}
                  onPress={() => togglePageSelection(index)}
                  activeOpacity={0.7}
                >
                  <Image
                    source={{ uri: item.uri }}
                    style={styles.pageImage}
                    resizeMode="contain"
                  />
                  <View style={styles.pageNumberContainer}>
                    <Text style={styles.pageNumberText}>Page {index + 1}</Text>
                  </View>
                  {isSelected && (
                    <View style={styles.selectionBadge}>
                      <MaterialCommunityIcons 
                        name="check-circle" 
                        size={24} 
                        color="#660880" 
                      />
                    </View>
                  )}
                </TouchableOpacity>
              );
            }}
            keyExtractor={(_, index) => `page-${index}`}
            numColumns={numColumns}
            contentContainerStyle={styles.gridContent}
          />
        </View>

        <View style={[styles.gridFooter, { backgroundColor: isDark ? '#1a1a1a' : '#ffffff' }]}>
          <View style={styles.promptContainer}>
            <Text style={[styles.promptLabel, { color: isDark ? '#ffffff' : '#333333' }]}>
              Add your prompt:
            </Text>
            <TextInput
              style={[
                styles.promptInput,
                { 
                  color: isDark ? '#ffffff' : '#333333',
                  backgroundColor: isDark ? '#2a2a2a' : '#f1f1f1',
                  borderColor: promptError ? '#ff6b6b' : isDark ? '#444444' : '#dddddd'
                }
              ]}
              placeholder="What would you like to ask about this PDF?"
              placeholderTextColor={isDark ? '#888888' : '#999999'}
              value={userPrompt}
              onChangeText={(text) => {
                setUserPrompt(text);
                if (text.trim()) setPromptError(false);
              }}
              multiline={true}
              numberOfLines={2}
            />
            {promptError && (
              <Text style={styles.errorPromptText}>
                Please enter a prompt before extracting text
              </Text>
            )}
          </View>
          <TouchableOpacity
            style={[
              styles.extractButton, 
              { 
                backgroundColor: selectedPages.length > 0 ? '#660880' : '#999',
                opacity: selectedPages.length > 0 ? 1 : 0.7
              }
            ]}
            onPress={handleStartOCR}
            disabled={selectedPages.length === 0}
          >
            <MaterialCommunityIcons
              name="send"
              size={20}
              color="#ffffff"
              style={styles.sendIcon}
            />
            <Text style={styles.sendButtonText}>
              Send Selected Pages {selectedPages.length > 0 ? `(${selectedPages.length})` : ''} 
            </Text>
          </TouchableOpacity>
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
  gridHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0, 0, 0, 0.1)',
  },
  selectionText: {
    fontSize: 14,
    fontWeight: '500',
  },
  selectAllButton: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#660880',
  },
  gridContainer: {
    flex: 1,
  },
  gridContent: {
    padding: 10,
  },
  gridItem: {
    margin: 5,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#ffffff',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 1.5,
  },
  pageImage: {
    width: '100%',
    height: '100%',
    backgroundColor: '#f0f0f0',
  },
  pageNumberContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 5,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    alignItems: 'center',
  },
  pageNumberText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '500',
  },
  selectionBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 24,
    height: 24,
    backgroundColor: 'white',
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 2,
    elevation: 3,
  },
  gridFooter: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
  },
  promptContainer: {
    marginBottom: 12,
  },
  promptLabel: {
    fontSize: 14,
    fontWeight: '500',
    marginBottom: 8,
  },
  promptInput: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    minHeight: 80,
    textAlignVertical: 'top',
  },
  errorPromptText: {
    color: '#ff6b6b',
    fontSize: 12,
    marginTop: 4,
  },
  extractButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    marginTop: 8,
  },
  sendButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  sendIcon: {
    marginRight: 8,
  },
}); 
