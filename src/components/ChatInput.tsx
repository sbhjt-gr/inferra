import React, { useState, useRef, useEffect } from 'react';
import {
  StyleSheet,
  View,
  TextInput,
  TouchableOpacity,
  Platform,
  ActivityIndicator,
  Keyboard,
  LayoutAnimation,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { theme } from '../constants/theme';
import { getThemeAwareColor } from '../utils/ColorUtils';

type ChatInputProps = {
  onSend: (text: string) => void;
  disabled?: boolean;
  isLoading?: boolean;
  onCancel?: () => void;
  style?: any;
  placeholderColor?: string;
};

export default function ChatInput({ 
  onSend, 
  disabled = false,
  isLoading = false,
  onCancel = () => {},
  style = {},
  placeholderColor = 'rgba(0, 0, 0, 0.6)'
}: ChatInputProps) {
  const [text, setText] = useState('');
  const [inputHeight, setInputHeight] = useState(48);
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const inputRef = useRef<TextInput>(null);
  const { theme: currentTheme } = useTheme();
  const themeColors = theme[currentTheme as 'light' | 'dark'];
  const isDark = currentTheme === 'dark';

  useEffect(() => {
    const showSubscription = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      () => {
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        setKeyboardVisible(true);
      }
    );
    const hideSubscription = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      () => {
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        setKeyboardVisible(false);
      }
    );

    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, []);

  const handleSend = () => {
    if (!text.trim()) return;
    onSend(text);
    setText('');
    setInputHeight(48);
  };

  const handleContentSizeChange = (event: any) => {
    const height = Math.min(120, Math.max(48, event.nativeEvent.contentSize.height));
    if (height !== inputHeight) {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setInputHeight(height);
    }
  };

  return (
    <View style={[
      styles.container,
      style,
      !keyboardVisible && { paddingBottom: Platform.OS === 'ios' ? 8 : 4 }
    ]}>
      <View style={[
        styles.inputWrapper,
        isDark && { backgroundColor: 'rgba(255, 255, 255, 0.1)' },
        { height: inputHeight }
      ]}>
        <TextInput
          ref={inputRef}
          style={[
            styles.input,
            isDark && { color: '#fff' },
          ]}
          value={text}
          onChangeText={setText}
          placeholder="Send a message..."
          placeholderTextColor={placeholderColor}
          multiline
          editable={!disabled}
          textAlignVertical="center"
          returnKeyType="default"
          blurOnSubmit={false}
          onContentSizeChange={handleContentSizeChange}
          keyboardAppearance={isDark ? 'dark' : 'light'}
        />
      </View>
      
      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator
            size="small"
            color={getThemeAwareColor('#0084ff', currentTheme)}
            style={styles.loadingIndicator}
          />
          <TouchableOpacity
            onPress={onCancel}
            style={styles.cancelButton}
          >
            <MaterialCommunityIcons 
              name="close" 
              size={24} 
              color={isDark ? '#ffffff' : "#660880"} 
            />
          </TouchableOpacity>
        </View>
      ) : (
        <TouchableOpacity 
          style={[
            styles.sendButton,
            !text.trim() && styles.sendButtonDisabled
          ]} 
          onPress={handleSend}
          disabled={!text.trim() || disabled}
        >
          <MaterialCommunityIcons 
            name="send" 
            size={24} 
            color={text.trim() ? getThemeAwareColor('#660880', currentTheme) : isDark ? themeColors.secondaryText : '#999'} 
          />
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 4,
    paddingVertical: 8,
    backgroundColor: 'transparent',
    width: '100%',
    marginBottom: 5,
  },
  inputWrapper: {
    flex: 1,
    backgroundColor: '#f0f0f0',
    borderRadius: 24,
    marginRight: 8,
    paddingHorizontal: 16,
    minHeight: 48,
    justifyContent: 'center',
    marginHorizontal: 12,
  },
  input: {
    fontSize: 16,
    color: '#000',
    paddingVertical: 4,
  },
  sendButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'transparent',
    marginRight: 8,
  },
  sendButtonDisabled: {
    opacity: 0.6,
  },
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 8,
  },
  loadingIndicator: {
    marginRight: 12,
  },
  cancelButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
}); 