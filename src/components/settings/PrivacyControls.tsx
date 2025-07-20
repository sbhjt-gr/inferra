import React, { useState, useEffect } from 'react';
import { View, StyleSheet, ScrollView, Alert } from 'react-native';
import { Text, Switch, Button, Divider, Portal, Dialog } from 'react-native-paper';
import { useTheme } from '../../context/ThemeContext';
import { theme } from '../../constants/theme';
import { DataCollectionSettings, PrivacyConsent } from '../../types/privacy';
import { 
  getDataCollectionSettings,
  storeDataCollectionSettings,
  getPrivacyConsent,
  storePrivacyConsent,
  deleteAllUserData 
} from '../../services/PrivacyService';
import { logoutUser } from '../../services/FirebaseService';
import { useDialog } from '../../context/DialogContext';

interface PrivacyControlsProps {
  isMinor?: boolean;
}

export default function PrivacyControls({ isMinor = false }: PrivacyControlsProps) {
  const { theme: currentTheme } = useTheme();
  const themeColors = theme[currentTheme];
  const { showDialog } = useDialog();
  
  const [settings, setSettings] = useState<DataCollectionSettings>({
    locationTracking: false,
    usageAnalytics: false,
    securityLogging: true,
    chatHistoryStorage: true,
    crashReporting: true,
  });
  
  const [consent, setConsent] = useState<PrivacyConsent | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [deleteDialogVisible, setDeleteDialogVisible] = useState(false);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const storedSettings = await getDataCollectionSettings();
      const storedConsent = await getPrivacyConsent();
      setSettings(storedSettings);
      setConsent(storedConsent);
    } catch (error) {
      console.error('Failed to load privacy settings:', error);
    }
  };

  const updateSetting = async (key: keyof DataCollectionSettings, value: boolean) => {
    if (key === 'securityLogging' && !value) {
      showDialog({
        title: 'Security Logging Required',
        message: 'Security logging cannot be disabled as it is required for account protection.'
      });
      return;
    }

    const newSettings = { ...settings, [key]: value };
    setSettings(newSettings);
    await storeDataCollectionSettings(newSettings);
  };

  const updateConsent = async (key: keyof PrivacyConsent, value: boolean) => {
    const newConsent: PrivacyConsent = {
      ...consent,
      [key]: value,
      timestamp: new Date().toISOString(),
    } as PrivacyConsent;
    
    setConsent(newConsent);
    await storePrivacyConsent(newConsent);
  };

  const handleDeleteAccount = async () => {
    setDeleteDialogVisible(false);
    setIsLoading(true);

    try {
      await deleteAllUserData();
      await logoutUser();
      
      showDialog({
        title: 'Account Deleted',
        message: 'Your account and all associated data have been permanently deleted.'
      });
    } catch (error) {
      showDialog({
        title: 'Delete Failed',
        message: 'Failed to delete account data. Please try again or contact support.'
      });
    } finally {
      setIsLoading(false);
    }
  };

  const SettingItem = ({ 
    title, 
    description, 
    value, 
    onToggle, 
    disabled = false 
  }: {
    title: string;
    description: string;
    value: boolean;
    onToggle: (value: boolean) => void;
    disabled?: boolean;
  }) => (
    <View style={styles.settingItem}>
      <View style={styles.settingText}>
        <Text style={[styles.settingTitle, { color: themeColors.text }]}>
          {title}
        </Text>
        <Text style={[styles.settingDescription, { color: themeColors.secondaryText }]}>
          {description}
        </Text>
      </View>
      <Switch
        value={value}
        onValueChange={onToggle}
        disabled={disabled}
        thumbColor={value ? themeColors.primary : undefined}
      />
    </View>
  );

  return (
    <ScrollView style={[styles.container, { backgroundColor: themeColors.background }]}>
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: themeColors.text }]}>
          Data Collection Settings
        </Text>
        <Text style={[styles.sectionDescription, { color: themeColors.secondaryText }]}>
          Control what data the app collects and how it's used.
        </Text>

        <SettingItem
          title="Location Tracking"
          description="Allow the app to access your location for enhanced features"
          value={settings.locationTracking}
          onToggle={(value) => updateSetting('locationTracking', value)}
          disabled={isMinor}
        />

        <SettingItem
          title="Usage Analytics"
          description="Help improve the app by sharing anonymous usage data"
          value={settings.usageAnalytics}
          onToggle={(value) => updateSetting('usageAnalytics', value)}
          disabled={isMinor}
        />

        <SettingItem
          title="Security Logging"
          description="Required for account protection and fraud prevention"
          value={settings.securityLogging}
          onToggle={(value) => updateSetting('securityLogging', value)}
          disabled={true}
        />

        <SettingItem
          title="Chat History Storage"
          description="Save your conversations for future reference"
          value={settings.chatHistoryStorage}
          onToggle={(value) => updateSetting('chatHistoryStorage', value)}
        />

        <SettingItem
          title="Crash Reporting"
          description="Automatically report app crashes to help fix bugs"
          value={settings.crashReporting}
          onToggle={(value) => updateSetting('crashReporting', value)}
        />
      </View>

      <Divider style={{ marginVertical: 20 }} />

      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: themeColors.text }]}>
          AI Content & Services
        </Text>
        <Text style={[styles.sectionDescription, { color: themeColors.secondaryText }]}>
          Manage consent for AI-powered features and third-party services.
        </Text>

        <SettingItem
          title="AI Content Generation"
          description="Allow the app to generate AI-powered responses and content"
          value={consent?.aiContentGeneration ?? true}
          onToggle={(value) => updateConsent('aiContentGeneration', value)}
        />

        <SettingItem
          title="Third-Party AI Services"
          description="Use external AI services (OpenAI, Google, Anthropic) when configured"
          value={consent?.thirdPartyServices ?? true}
          onToggle={(value) => updateConsent('thirdPartyServices', value)}
        />
      </View>

      {isMinor && (
        <View style={[styles.minorNotice, { backgroundColor: themeColors.primary + '20' }]}>
          <Text style={[styles.minorNoticeText, { color: themeColors.text }]}>
            ⚠️ Additional privacy protections are active because you are under 18.
          </Text>
        </View>
      )}

      <Divider style={{ marginVertical: 20 }} />

      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: themeColors.text }]}>
          Data Management
        </Text>
        
        <Button
          mode="outlined"
          onPress={() => setDeleteDialogVisible(true)}
          style={styles.deleteButton}
          textColor="#FF4444"
          disabled={isLoading}
        >
          Delete All Data & Account
        </Button>
        
        <Text style={[styles.deleteDescription, { color: themeColors.secondaryText }]}>
          This will permanently delete your account, chat history, and all associated data.
        </Text>
      </View>

      <Portal>
        <Dialog 
          visible={deleteDialogVisible} 
          onDismiss={() => setDeleteDialogVisible(false)}
          style={{ backgroundColor: themeColors.background }}
        >
          <Dialog.Title style={{ color: themeColors.text }}>
            Delete Account & Data
          </Dialog.Title>
          <Dialog.Content>
            <Text style={{ color: themeColors.text }}>
              Are you sure you want to permanently delete your account and all data? This action cannot be undone.
            </Text>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setDeleteDialogVisible(false)}>
              Cancel
            </Button>
            <Button 
              onPress={handleDeleteAccount}
              textColor="#FF4444"
              loading={isLoading}
            >
              Delete
            </Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 8,
  },
  sectionDescription: {
    fontSize: 14,
    marginBottom: 16,
    lineHeight: 20,
  },
  settingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginBottom: 8,
    borderRadius: 8,
    backgroundColor: 'rgba(0,0,0,0.05)',
  },
  settingText: {
    flex: 1,
    marginRight: 16,
  },
  settingTitle: {
    fontSize: 16,
    fontWeight: '500',
    marginBottom: 4,
  },
  settingDescription: {
    fontSize: 14,
    lineHeight: 18,
  },
  minorNotice: {
    padding: 16,
    borderRadius: 8,
    marginVertical: 16,
  },
  minorNoticeText: {
    fontSize: 14,
    fontWeight: '500',
    textAlign: 'center',
  },
  deleteButton: {
    marginBottom: 8,
    borderColor: '#FF4444',
  },
  deleteDescription: {
    fontSize: 12,
    textAlign: 'center',
    fontStyle: 'italic',
  },
});
