import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { useTheme } from '../../context/ThemeContext';
import { theme } from '../../constants/theme';
import { onlineModelService } from '../../services/OnlineModelService';

const ApiKeySection: React.FC = () => {
  const { theme: currentTheme } = useTheme();
  const themeColors = theme[currentTheme as 'light' | 'dark'];
  const [geminiApiKey, setGeminiApiKey] = useState('');
  const [openAIApiKey, setOpenAIApiKey] = useState('');
  const [deepSeekApiKey, setDeepSeekApiKey] = useState('');
  const [claudeApiKey, setClaudeApiKey] = useState('');
  const [isLoadingApiKeys, setIsLoadingApiKeys] = useState(false);

  useEffect(() => {
    loadApiKeys();
  }, []);

  const loadApiKeys = async () => {
    setIsLoadingApiKeys(true);
    try {
      const geminiKey = await onlineModelService.getApiKey('gemini');
      setGeminiApiKey(geminiKey || '');
      
      const openAIKey = await onlineModelService.getApiKey('chatgpt');
      setOpenAIApiKey(openAIKey || '');
      
      const deepSeekKey = await onlineModelService.getApiKey('deepseek');
      setDeepSeekApiKey(deepSeekKey || '');
      
      const claudeKey = await onlineModelService.getApiKey('claude');
      setClaudeApiKey(claudeKey || '');
    } catch (error) {
      console.error('Error loading API keys:', error);
    } finally {
      setIsLoadingApiKeys(false);
    }
  };

  const saveGeminiApiKey = async () => {
    try {
      if (geminiApiKey.trim()) {
        await onlineModelService.saveApiKey('gemini', geminiApiKey.trim());
        Alert.alert('Success', 'Gemini API key saved successfully');
      } else {
        await onlineModelService.clearApiKey('gemini');
        Alert.alert('Success', 'Gemini API key cleared');
      }
    } catch (error) {
      console.error('Error saving Gemini API key:', error);
      Alert.alert('Error', 'Failed to save Gemini API key');
    }
  };

  const saveOpenAIApiKey = async () => {
    try {
      if (openAIApiKey.trim()) {
        await onlineModelService.saveApiKey('chatgpt', openAIApiKey.trim());
        Alert.alert('Success', 'OpenAI API key saved successfully');
      } else {
        await onlineModelService.clearApiKey('chatgpt');
        Alert.alert('Success', 'OpenAI API key cleared');
      }
    } catch (error) {
      console.error('Error saving OpenAI API key:', error);
      Alert.alert('Error', 'Failed to save OpenAI API key');
    }
  };

  const saveDeepSeekApiKey = async () => {
    try {
      if (deepSeekApiKey.trim()) {
        await onlineModelService.saveApiKey('deepseek', deepSeekApiKey.trim());
        Alert.alert('Success', 'DeepSeek API key saved successfully');
      } else {
        await onlineModelService.clearApiKey('deepseek');
        Alert.alert('Success', 'DeepSeek API key cleared');
      }
    } catch (error) {
      console.error('Error saving DeepSeek API key:', error);
      Alert.alert('Error', 'Failed to save DeepSeek API key');
    }
  };

  const saveClaudeApiKey = async () => {
    try {
      if (claudeApiKey.trim()) {
        await onlineModelService.saveApiKey('claude', claudeApiKey.trim());
        Alert.alert('Success', 'Claude API key saved successfully');
      } else {
        await onlineModelService.clearApiKey('claude');
        Alert.alert('Success', 'Claude API key cleared');
      }
    } catch (error) {
      console.error('Error saving Claude API key:', error);
      Alert.alert('Error', 'Failed to save Claude API key');
    }
  };

  return (
    <View style={styles.apiKeysContainer}>
      <Text style={[styles.apiKeysTitle, { color: themeColors.text }]}>
        API Keys for Online Models
      </Text>
      
      <View style={styles.apiKeyContainer}>
        <Text style={[styles.apiKeyLabel, { color: themeColors.text }]}>
          Gemini API Key
        </Text>
        <TextInput
          style={[
            styles.apiKeyInput,
            { 
              color: themeColors.text,
              backgroundColor: themeColors.borderColor,
              borderColor: themeColors.borderColor
            }
          ]}
          placeholder="Enter Gemini API key"
          placeholderTextColor={themeColors.secondaryText}
          value={geminiApiKey}
          onChangeText={setGeminiApiKey}
          autoCapitalize="none"
          secureTextEntry={true}
        />
        <TouchableOpacity
          style={[
            styles.saveButton,
            { backgroundColor: themeColors.primary }
          ]}
          onPress={saveGeminiApiKey}
        >
          <Text style={styles.saveButtonText}>Save</Text>
        </TouchableOpacity>
        <Text style={[styles.apiKeyHelp, { color: themeColors.secondaryText }]}>
          Get your Gemini API key from https://ai.google.dev/
        </Text>
      </View>

      <View style={[styles.apiKeyContainer, { marginTop: 20 }]}>
        <Text style={[styles.apiKeyLabel, { color: themeColors.text }]}>
          OpenAI API Key
        </Text>
        <TextInput
          style={[
            styles.apiKeyInput,
            { 
              color: themeColors.text,
              backgroundColor: themeColors.borderColor,
              borderColor: themeColors.borderColor
            }
          ]}
          placeholder="Enter OpenAI API key"
          placeholderTextColor={themeColors.secondaryText}
          value={openAIApiKey}
          onChangeText={setOpenAIApiKey}
          autoCapitalize="none"
          secureTextEntry={true}
        />
        <TouchableOpacity
          style={[
            styles.saveButton,
            { backgroundColor: themeColors.primary }
          ]}
          onPress={saveOpenAIApiKey}
        >
          <Text style={styles.saveButtonText}>Save</Text>
        </TouchableOpacity>
        <Text style={[styles.apiKeyHelp, { color: themeColors.secondaryText }]}>
          Get your OpenAI API key from https://platform.openai.com/api-keys
        </Text>
      </View>

      <View style={[styles.apiKeyContainer, { marginTop: 20 }]}>
        <Text style={[styles.apiKeyLabel, { color: themeColors.text }]}>
          DeepSeek API Key
        </Text>
        <TextInput
          style={[
            styles.apiKeyInput,
            { 
              color: themeColors.text,
              backgroundColor: themeColors.borderColor,
              borderColor: themeColors.borderColor
            }
          ]}
          placeholder="Enter DeepSeek API key"
          placeholderTextColor={themeColors.secondaryText}
          value={deepSeekApiKey}
          onChangeText={setDeepSeekApiKey}
          autoCapitalize="none"
          secureTextEntry={true}
        />
        <TouchableOpacity
          style={[
            styles.saveButton,
            { backgroundColor: themeColors.primary }
          ]}
          onPress={saveDeepSeekApiKey}
        >
          <Text style={styles.saveButtonText}>Save</Text>
        </TouchableOpacity>
        <Text style={[styles.apiKeyHelp, { color: themeColors.secondaryText }]}>
          Get your DeepSeek API key from https://platform.deepseek.com
        </Text>
      </View>

      <View style={[styles.apiKeyContainer, { marginTop: 20 }]}>
        <Text style={[styles.apiKeyLabel, { color: themeColors.text }]}>
          Claude API Key
        </Text>
        <TextInput
          style={[
            styles.apiKeyInput,
            { 
              color: themeColors.text,
              backgroundColor: themeColors.borderColor,
              borderColor: themeColors.borderColor
            }
          ]}
          placeholder="Enter Claude API key"
          placeholderTextColor={themeColors.secondaryText}
          value={claudeApiKey}
          onChangeText={setClaudeApiKey}
          autoCapitalize="none"
          secureTextEntry={true}
        />
        <TouchableOpacity
          style={[
            styles.saveButton,
            { backgroundColor: themeColors.primary }
          ]}
          onPress={saveClaudeApiKey}
        >
          <Text style={styles.saveButtonText}>Save</Text>
        </TouchableOpacity>
        <Text style={[styles.apiKeyHelp, { color: themeColors.secondaryText }]}>
          Get your Claude API key from https://console.anthropic.com/
        </Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  apiKeysContainer: {
    marginBottom: 25,
    padding: 16,
    backgroundColor: 'rgba(150, 150, 150, 0.08)',
    borderRadius: 12,
  },
  apiKeysTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 16,
  },
  apiKeyContainer: {
    marginBottom: 8,
  },
  apiKeyLabel: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  apiKeyInput: {
    height: 48,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    fontSize: 16,
    marginBottom: 8,
  },
  saveButton: {
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 8,
  },
  saveButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  apiKeyHelp: {
    fontSize: 14,
    marginTop: 2,
  },
});

export default ApiKeySection; 