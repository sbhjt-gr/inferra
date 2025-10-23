import React from 'react';
import { View, TouchableOpacity, Text, StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import { theme } from '../../constants/theme';

export type TabType = 'stored' | 'downloadable' | 'remote';

interface ModelScreenTabsProps {
  activeTab: TabType;
  onTabPress: (tab: TabType) => void;
  enableRemoteModels: boolean;
}

export const ModelScreenTabs: React.FC<ModelScreenTabsProps> = ({
  activeTab,
  onTabPress,
  enableRemoteModels
}) => {
  const { theme: currentTheme } = useTheme();
  const themeColors = theme[currentTheme as 'light' | 'dark'];

  return (
    <View style={styles.tabContainer}>
      <View style={[styles.segmentedControl, { backgroundColor: themeColors.borderColor }]}>
        <TouchableOpacity
          style={[
            styles.segmentButton,
            { borderColor: themeColors.primary },
            activeTab === 'stored' && styles.activeSegment,
            activeTab === 'stored' && { backgroundColor: themeColors.primary }
          ]}
          onPress={() => onTabPress('stored')}
        >
          <MaterialCommunityIcons 
            name="folder" 
            size={18} 
            color={activeTab === 'stored' ? '#fff' : themeColors.text} 
            style={styles.segmentIcon}
          />
          <Text style={[
            styles.segmentText,
            { color: activeTab === 'stored' ? '#fff' : themeColors.text }
          ]}>
            Stored Models
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.segmentButton,
            { borderColor: themeColors.primary },
            activeTab === 'downloadable' && styles.activeSegment,
            activeTab === 'downloadable' && { backgroundColor: themeColors.primary }
          ]}
          onPress={() => onTabPress('downloadable')}
        >
          <MaterialCommunityIcons 
            name="cloud-download" 
            size={18} 
            color={activeTab === 'downloadable' ? '#fff' : themeColors.text}
            style={styles.segmentIcon}
          />
          <Text style={[
            styles.segmentText,
            { color: activeTab === 'downloadable' ? '#fff' : themeColors.text }
          ]}>
            Download Models
          </Text>
        </TouchableOpacity>
        {enableRemoteModels && (
          <TouchableOpacity
            style={[
              styles.segmentButton,
              { borderColor: themeColors.primary },
              activeTab === 'remote' && styles.activeSegment,
              activeTab === 'remote' && { backgroundColor: themeColors.primary }
            ]}
            onPress={() => onTabPress('remote')}
          >
            <MaterialCommunityIcons 
              name="cloud" 
              size={18} 
              color={activeTab === 'remote' ? '#fff' : themeColors.text}
              style={styles.segmentIcon}
            />
            <Text style={[
              styles.segmentText,
              { color: activeTab === 'remote' ? '#fff' : themeColors.text }
            ]}>
              Remote Models
            </Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  tabContainer: {
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  segmentedControl: {
    flexDirection: 'row',
    borderRadius: 8,
    padding: 2,
    marginTop: 8,
  },
  segmentButton: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  activeSegment: {
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 3,
  },
  segmentText: {
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
  segmentIcon: {
    marginRight: 6,
  },
});
