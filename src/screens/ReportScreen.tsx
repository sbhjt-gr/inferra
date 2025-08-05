import React, { useState } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { TextInput, Button } from 'react-native-paper';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system';
import { useTheme } from '../context/ThemeContext';
import { theme } from '../constants/theme';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../types/navigation';
import { submitReport } from '../services/ReportService';
import { getCurrentUser } from '../services/FirebaseService';

type ReportScreenProps = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Report'>;
  route: {
    params: {
      messageContent: string;
      provider: string;
    };
  };
};

const REPORT_CATEGORIES = [
  { id: 'harmful', label: 'Harmful or unsafe content' },
  { id: 'inappropriate', label: 'Inappropriate or explicit content' },
  { id: 'misinformation', label: 'Misinformation or false claims' },
  { id: 'bias', label: 'Bias or discrimination' },
  { id: 'privacy', label: 'Privacy concerns' },
  { id: 'quality', label: 'Poor quality or irrelevant response' },
  { id: 'other', label: 'Other' },
];

export default function ReportScreen({ navigation, route }: ReportScreenProps) {
  const { messageContent, provider } = route.params;
  const { theme: currentTheme } = useTheme();
  const themeColors = theme[currentTheme];
  
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [description, setDescription] = useState('');
  const [email, setEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [attachedMedia, setAttachedMedia] = useState<Array<{
    uri: string;
    type: 'image' | 'video';
    fileName: string;
    fileSize: number;
  }>>([]);

  const MAX_FILE_SIZE = 40 * 1024 * 1024;
  const MAX_ATTACHMENTS = 3;

  const requestPermissions = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission Required', 'We need media library permissions to attach files.');
      return false;
    }
    
    return true;
  };

  const pickMedia = async () => {
    if (attachedMedia.length >= MAX_ATTACHMENTS) {
      Alert.alert('Limit Reached', `You can attach up to ${MAX_ATTACHMENTS} files.`);
      return;
    }

    const hasPermission = await requestPermissions();
    if (!hasPermission) return;

    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.All,
        allowsEditing: true,
        quality: 0.8,
        videoMaxDuration: 60,
      });

      if (!result.canceled && result.assets[0]) {
        const asset = result.assets[0];
        const type = asset.type === 'video' ? 'video' : 'image';
        await addMediaFile(asset, type);
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to pick media');
    }
  };



  const addMediaFile = async (asset: ImagePicker.ImagePickerAsset, type: 'image' | 'video') => {
    try {
      const fileInfo = await FileSystem.getInfoAsync(asset.uri);
      
      if (!fileInfo.exists) {
        Alert.alert('Error', 'File not found');
        return;
      }

      const fileSize = fileInfo.size || 0;
      
      if (fileSize > MAX_FILE_SIZE) {
        const sizeMB = (fileSize / (1024 * 1024)).toFixed(1);
        Alert.alert('File Too Large', `File size (${sizeMB}MB) exceeds the 40MB limit.`);
        return;
      }

      const fileName = asset.fileName || `${type}_${Date.now()}.${type === 'image' ? 'jpg' : 'mp4'}`;
      
      setAttachedMedia(prev => [...prev, {
        uri: asset.uri,
        type,
        fileName,
        fileSize
      }]);
    } catch (error) {
      Alert.alert('Error', 'Failed to process file');
    }
  };

  const removeMediaFile = (index: number) => {
    setAttachedMedia(prev => prev.filter((_, i) => i !== index));
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const handleSubmit = async () => {
    if (!selectedCategory) {
      Alert.alert('Error', 'Please select a category for your report.');
      return;
    }

    if (!description.trim()) {
      Alert.alert('Error', 'Please provide details about your report.');
      return;
    }

    if (!email.trim()) {
      Alert.alert('Error', 'Please provide your email address.');
      return;
    }

    setIsSubmitting(true);

    try {
      const user = await getCurrentUser();
      
      const reportData = {
        messageContent,
        provider,
        category: selectedCategory,
        description: description.trim(),
        email: email.trim(),
        userId: user?.uid || null,
        timestamp: new Date().toISOString(),
        appVersion: '2.5.7', 
        platform: Platform.OS,
        attachments: attachedMedia,
      };

      await submitReport(reportData);
      
      Alert.alert(
        'Report Submitted',
        'Thank you for your report. We will review it and take appropriate action.',
        [
          {
            text: 'OK',
            onPress: () => navigation.goBack(),
          },
        ]
      );
    } catch (error) {
      console.error('Error submitting report:', error);
      Alert.alert(
        'Error',
        'Failed to submit your report. Please try again later.'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const renderCategoryButton = (category: { id: string; label: string }) => (
    <TouchableOpacity
      key={category.id}
      style={[
        styles.categoryButton,
        {
          backgroundColor: selectedCategory === category.id 
            ? themeColors.primary 
            : themeColors.borderColor,
          borderColor: selectedCategory === category.id 
            ? themeColors.primary 
            : themeColors.borderColor,
        },
      ]}
      onPress={() => setSelectedCategory(category.id)}
    >
      <Text
        style={[
          styles.categoryButtonText,
          {
            color: selectedCategory === category.id 
              ? '#fff' 
              : themeColors.text,
          },
        ]}
      >
        {category.label}
      </Text>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: themeColors.background }]}>
      <KeyboardAvoidingView 
        style={styles.keyboardAvoidingView}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View style={[styles.header, { borderBottomColor: themeColors.borderColor }]}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => navigation.goBack()}
          >
            <MaterialCommunityIcons
              name="arrow-left"
              size={24}
              color={themeColors.text}
            />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: themeColors.text }]}>
            Report Content
          </Text>
          <View style={styles.placeholder} />
        </View>

        <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: themeColors.text }]}>
              Select a Category <Text style={styles.required}>*</Text>
            </Text>
            <View style={styles.categoriesContainer}>
              {REPORT_CATEGORIES.map(renderCategoryButton)}
            </View>
          </View>

          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: themeColors.text }]}>
              Provide More Details <Text style={styles.required}>*</Text>
            </Text>
            <TextInput
              style={[
                styles.textInput,
                {
                  backgroundColor: themeColors.borderColor,
                  color: themeColors.text,
                },
              ]}
              value={description}
              onChangeText={setDescription}
              placeholder="Please provide as many details as possible about your issue so that we can assist you quickly."
              placeholderTextColor={themeColors.secondaryText}
              multiline
              numberOfLines={6}
              textAlignVertical="top"
              maxLength={2000}
            />
            <Text style={[styles.charCount, { color: themeColors.secondaryText }]}>
              {description.length}/2000
            </Text>
          </View>

          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: themeColors.text }]}>
              Your Email <Text style={styles.required}>*</Text>
            </Text>
            <TextInput
              style={[
                styles.emailInput,
                {
                  backgroundColor: themeColors.borderColor,
                  color: themeColors.text,
                },
              ]}
              value={email}
              onChangeText={setEmail}
              placeholder="Enter your email for response"
              placeholderTextColor={themeColors.secondaryText}
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
            />
          </View>

          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: themeColors.text }]}>
              Attach Screenshot or Video (Optional)
            </Text>
            <Text style={[styles.sectionSubtext, { color: themeColors.secondaryText }]}>
              Add up to {MAX_ATTACHMENTS} files, max 40MB each
            </Text>
            
            <TouchableOpacity
              style={[styles.mediaButton, { backgroundColor: themeColors.borderColor }]}
              onPress={pickMedia}
              disabled={attachedMedia.length >= MAX_ATTACHMENTS}
            >
              <MaterialCommunityIcons 
                name="attachment" 
                size={24} 
                color={themeColors.text} 
              />
              <Text style={[styles.mediaButtonText, { color: themeColors.text }]}>
                Add Media
              </Text>
            </TouchableOpacity>

            {attachedMedia.length > 0 && (
              <View style={styles.attachedMediaContainer}>
                {attachedMedia.map((media, index) => (
                  <View key={index} style={[styles.mediaItem, { backgroundColor: themeColors.borderColor }]}>
                    <View style={styles.mediaItemLeft}>
                      {media.type === 'image' ? (
                        <Image source={{ uri: media.uri }} style={styles.mediaThumbnail} />
                      ) : (
                        <View style={[styles.videoThumbnail, { backgroundColor: themeColors.background }]}>
                          <MaterialCommunityIcons 
                            name="play-circle" 
                            size={32} 
                            color={themeColors.primary} 
                          />
                        </View>
                      )}
                      <View style={styles.mediaInfo}>
                        <Text style={[styles.mediaFileName, { color: themeColors.text }]} numberOfLines={1}>
                          {media.fileName}
                        </Text>
                        <Text style={[styles.mediaFileSize, { color: themeColors.secondaryText }]}>
                          {formatFileSize(media.fileSize)} • {media.type}
                        </Text>
                      </View>
                    </View>
                    <TouchableOpacity
                      style={styles.removeMediaButton}
                      onPress={() => removeMediaFile(index)}
                    >
                      <MaterialCommunityIcons 
                        name="close-circle" 
                        size={24} 
                        color="#ef4444" 
                      />
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            )}
          </View>

          <View style={styles.section}>
            <Text style={[styles.infoText, { color: themeColors.secondaryText }]}>
              Screenshots and screen recordings help us understand your issue better.
            </Text>
          </View>

          <Button
            mode="contained"
            onPress={handleSubmit}
            loading={isSubmitting}
            disabled={isSubmitting}
            style={[
              styles.submitButton,
              { backgroundColor: themeColors.primary },
            ]}
            labelStyle={styles.submitButtonText}
          >
            {isSubmitting ? 'Submitting...' : 'Submit'}
          </Button>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  keyboardAvoidingView: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  backButton: {
    padding: 8,
  },
  headerTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: '600',
    textAlign: 'center',
    marginRight: 40,
  },
  placeholder: {
    width: 40,
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
  },
  section: {
    marginVertical: 20,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 12,
  },
  required: {
    color: '#ef4444',
  },
  categoriesContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  categoryButton: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 1,
    marginBottom: 8,
  },
  categoryButtonText: {
    fontSize: 14,
    fontWeight: '500',
  },
  textInput: {
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    minHeight: 120,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  charCount: {
    textAlign: 'right',
    fontSize: 12,
    marginTop: 4,
  },
  emailInput: {
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  infoText: {
    fontSize: 14,
    lineHeight: 20,
  },
  submitButton: {
    marginVertical: 20,
    borderRadius: 8,
  },
  submitButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  sectionSubtext: {
    fontSize: 12,
    marginBottom: 12,
  },
  mediaButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    gap: 8,
    marginBottom: 12,
  },
  mediaButtonText: {
    fontSize: 14,
    fontWeight: '500',
  },
  attachedMediaContainer: {
    marginTop: 12,
    gap: 8,
  },
  mediaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    borderRadius: 8,
  },
  mediaItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  mediaThumbnail: {
    width: 48,
    height: 48,
    borderRadius: 6,
    marginRight: 12,
  },
  videoThumbnail: {
    width: 48,
    height: 48,
    borderRadius: 6,
    marginRight: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mediaInfo: {
    flex: 1,
  },
  mediaFileName: {
    fontSize: 14,
    fontWeight: '500',
    marginBottom: 2,
  },
  mediaFileSize: {
    fontSize: 12,
  },
  removeMediaButton: {
    padding: 4,
  },
});
