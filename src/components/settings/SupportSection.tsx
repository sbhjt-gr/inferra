import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { MaterialCommunityIcons, MaterialIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from '../../context/ThemeContext';
import { theme } from '../../constants/theme';
import SettingsSection from './SettingsSection';
import AITermsDialog from '../chat/AITermsDialog';

const AI_TERMS_ACCEPTED_KEY = '@ai_terms_accepted';

type SupportSectionProps = {
  onOpenLink: (url: string) => void;
  onNavigateToLicenses: () => void;
};

const SupportSection = ({ onOpenLink, onNavigateToLicenses }: SupportSectionProps) => {
  const { theme: currentTheme } = useTheme();
  const themeColors = theme[currentTheme];
  const iconColor = currentTheme === 'dark' ? '#FFFFFF' : themeColors.primary;
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [showTermsDialog, setShowTermsDialog] = useState(false);

  useEffect(() => {
    loadTermsAcceptance();
  }, []);

  const loadTermsAcceptance = async () => {
    try {
      const termsValue = await AsyncStorage.getItem(AI_TERMS_ACCEPTED_KEY);
      setTermsAccepted(termsValue === 'true');
    } catch (error) {
    }
  };

  const handleAcceptTerms = async () => {
    try {
      await AsyncStorage.setItem(AI_TERMS_ACCEPTED_KEY, 'true');
      setTermsAccepted(true);
      setShowTermsDialog(false);
    } catch (error) {
    }
  };

  return (
    <>
      <SettingsSection title="SUPPORT">

        <TouchableOpacity 
          style={[styles.settingItem, styles.settingItemBorder]}
          onPress={() => onOpenLink('https://play.google.com/store/apps/details?id=com.gorai.ragionare')}
        >
        <View style={styles.settingLeft}>
          <View style={[styles.iconContainer, { backgroundColor: currentTheme === 'dark' ? 'rgba(255, 255, 255, 0.2)' : themeColors.primary + '20' }]}>
            <MaterialCommunityIcons name="google-play" size={22} color={iconColor} />
          </View>
          <View style={styles.settingTextContainer}>
            <Text style={[styles.settingText, { color: themeColors.text }]}>
              Liked My App?
            </Text>
            <Text style={[styles.settingDescription, { color: themeColors.secondaryText }]}>
              Please rate my app 5 stars
            </Text>
          </View>
        </View>
        <MaterialCommunityIcons name="chevron-right" size={20} color={themeColors.secondaryText} />
      </TouchableOpacity>

      <TouchableOpacity 
        style={[styles.settingItem, styles.settingItemBorder]}
        onPress={() => onOpenLink('https://github.com/sbhjt-gr/inferra')}
      >
        <View style={styles.settingLeft}>
          <View style={[styles.iconContainer, { backgroundColor: currentTheme === 'dark' ? 'rgba(255, 255, 255, 0.2)' : themeColors.primary + '20' }]}>
            <MaterialCommunityIcons name="github" size={22} color={iconColor} />
          </View>
          <View style={styles.settingTextContainer}>
            <Text style={[styles.settingText, { color: themeColors.text }]}>
              GitHub Repository
            </Text>
            <Text style={[styles.settingDescription, { color: themeColors.secondaryText }]}>
              Star my project on GitHub
            </Text>
          </View>
        </View>
        <MaterialCommunityIcons name="chevron-right" size={20} color={themeColors.secondaryText} />
      </TouchableOpacity>

      <TouchableOpacity 
        style={[styles.settingItem, styles.settingItemBorder]}
        onPress={() => onOpenLink('https://inferra.me/privacy-policy')}
      >
        <View style={styles.settingLeft}>
          <View style={[styles.iconContainer, { backgroundColor: currentTheme === 'dark' ? 'rgba(255, 255, 255, 0.2)' : themeColors.primary + '20' }]}>
            <MaterialCommunityIcons name="shield-check-outline" size={22} color={iconColor} />
          </View>
          <View style={styles.settingTextContainer}>
            <Text style={[styles.settingText, { color: themeColors.text }]}>
              Privacy Policy
            </Text>
            <Text style={[styles.settingDescription, { color: themeColors.secondaryText }]}>
              View the app's privacy policy page
            </Text>
          </View>
        </View>
        <MaterialCommunityIcons name="chevron-right" size={20} color={themeColors.secondaryText} />
      </TouchableOpacity>

      <TouchableOpacity 
        style={[styles.settingItem, styles.settingItemBorder]}
        onPress={() => onOpenLink('https://ko-fi.com/subhajitgorai')}
      >
        <View style={styles.settingLeft}>
          <View style={[styles.iconContainer, { backgroundColor: currentTheme === 'dark' ? 'rgba(255, 255, 255, 0.2)' : themeColors.primary + '20' }]}>
            <MaterialCommunityIcons name="currency-usd" size={22} color={iconColor} />
          </View>
          <View style={styles.settingTextContainer}>
            <Text style={[styles.settingText, { color: themeColors.text }]}>
              Support Development
            </Text>
            <Text style={[styles.settingDescription, { color: themeColors.secondaryText }]}>
              Donate to me for my work
            </Text>
          </View>
        </View>
        <MaterialCommunityIcons name="chevron-right" size={20} color={themeColors.secondaryText} />
      </TouchableOpacity>

      <TouchableOpacity 
          style={[styles.settingItem, styles.settingItemBorder]}
          onPress={() => setShowTermsDialog(true)}
        >
          <View style={styles.settingLeft}>
          <View style={[styles.iconContainer, { backgroundColor: currentTheme === 'dark' ? 'rgba(255, 255, 255, 0.2)' : themeColors.primary + '20' }]}>
              <MaterialIcons name="description" size={22} color={iconColor} />
            </View>
            <View style={styles.settingTextContainer}>
              <Text style={[styles.settingText, { color: themeColors.text }]}>
                AI Content Terms
              </Text>
              <Text style={[styles.settingDescription, { color: themeColors.secondaryText }]}>
                Review terms for AI-generated content
              </Text>
            </View>
          </View>
          <MaterialCommunityIcons 
            name="chevron-right" 
            size={24} 
            color={themeColors.secondaryText} 
          />
        </TouchableOpacity>

        <TouchableOpacity 
          style={[styles.settingItem, styles.settingItemBorder]}
          onPress={onNavigateToLicenses}
        >
          <View style={styles.settingLeft}>
            <View style={[styles.iconContainer, { backgroundColor: currentTheme === 'dark' ? 'rgba(255, 255, 255, 0.2)' : themeColors.primary + '20' }]}>
              <MaterialCommunityIcons name="license" size={22} color={iconColor} />
            </View>
            <View style={styles.settingTextContainer}>
              <Text style={[styles.settingText, { color: themeColors.text }]}>
                Open Source Licenses
              </Text>
              <Text style={[styles.settingDescription, { color: themeColors.secondaryText }]}>
                View licenses of open source libraries
              </Text>
            </View>
          </View>
          <MaterialCommunityIcons 
            name="chevron-right" 
            size={20} 
            color={themeColors.secondaryText} 
          />
        </TouchableOpacity>
    </SettingsSection>

    <AITermsDialog
      visible={showTermsDialog}
      onDismiss={() => setShowTermsDialog(false)}
      onAccept={handleAcceptTerms}
    />
  </>
  );
};

const styles = StyleSheet.create({
  settingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
  },
  settingItemBorder: {
    borderTopWidth: 1,
    borderTopColor: 'rgba(150, 150, 150, 0.1)',
  },
  settingLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  iconContainer: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  settingTextContainer: {
    flex: 1,
  },
  settingText: {
    fontSize: 16,
    fontWeight: '500',
    marginBottom: 2,
  },
  settingDescription: {
    fontSize: 13,
  },
});

export default SupportSection; 
