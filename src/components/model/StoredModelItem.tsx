import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import { theme } from '../../constants/theme';
import { getThemeAwareColor, getDocumentIconColor } from '../../utils/ColorUtils';
import { useResponsive } from '../../hooks/useResponsive';
import { getResponsiveValue } from '../../utils/ResponsiveUtils';

interface StoredModelProps {
  id: string;
  name: string;
  path: string;
  size: number;
  isExternal: boolean;
  onDelete: (id: string, path: string) => void;
  onExport?: (path: string, name: string) => void;
}

const formatBytes = (bytes?: number) => {
  if (bytes === undefined || bytes === null || isNaN(bytes) || bytes === 0) return '0 B';
  try {
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    if (i < 0 || i >= sizes.length || !isFinite(bytes)) return '0 B';
    return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
  } catch (error) {
    console.error('Error formatting bytes:', error, bytes);
    return '0 B';
  }
};

const getDisplayName = (filename: string) => {
  return filename.split('.')[0];
};

const StoredModelItem: React.FC<StoredModelProps> = ({
  id,
  name,
  path,
  size,
  isExternal,
  onDelete,
  onExport,
}) => {
  const { theme: currentTheme } = useTheme();
  const themeColors = theme[currentTheme as 'light' | 'dark'];
  const { fontSize, isTablet } = useResponsive();
  const marginHorizontal = getResponsiveValue(8, 16);
  const displayName = getDisplayName(name);
  const formattedSize = formatBytes(size);

  return (
    <View style={[
      styles.modelItem, 
      { 
        backgroundColor: themeColors.borderColor,
        marginHorizontal: isTablet ? marginHorizontal : 0,
        flex: isTablet ? 1 : undefined
      }
    ]}>
      <View style={styles.modelIconContainer}>
        <MaterialCommunityIcons 
          name={isExternal ? "link" : "file-document-outline"} 
          size={24} 
          color={isExternal ? 
            getThemeAwareColor("#4a90e2", currentTheme) : 
            getDocumentIconColor(currentTheme)
          }
        />
      </View>
      <View style={styles.modelInfo}>
        <View style={styles.modelHeader}>
          <Text style={[styles.modelName, { color: themeColors.text, fontSize: fontSize.medium }]} numberOfLines={1}>
            {displayName}
          </Text>
          {isExternal ? (
            <View style={styles.externalBadgeContainer}>
              <MaterialCommunityIcons name="link" size={12} color="white" style={{ marginRight: 4 }} />
              <Text style={[styles.externalBadgeText, { fontSize: fontSize.small }]}>External</Text>
            </View>
          ) : ( 
            <></>
          )}
        </View>
        <View style={styles.modelMetaInfo}>
          <View style={styles.metaItem}>
            <MaterialCommunityIcons name="disc" size={14} color={themeColors.secondaryText} />
            <Text style={[styles.metaText, { color: themeColors.secondaryText, fontSize: fontSize.small }]}>
              {formattedSize}
            </Text>
          </View>
        </View>
      </View>
      <View style={styles.buttonContainer}>
                {!isExternal && onExport && (
          <TouchableOpacity
            style={styles.actionButton}
            onPress={() => onExport(path, name)}
          >
            <MaterialCommunityIcons name="share" size={20} color={getThemeAwareColor('#72026eff', currentTheme)} />
          </TouchableOpacity>
        )}
        <TouchableOpacity
          style={[styles.actionButton, { backgroundColor: 'transparent' }]}
          onPress={() => onDelete(id, path)}
        >
          <MaterialCommunityIcons name="delete-outline" size={20} color={getThemeAwareColor('#ff4444', currentTheme)} />
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  modelItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: 16,
    borderRadius: 12,
    marginBottom: 8,
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
  },
  modelIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(74, 6, 96, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  modelInfo: {
    flex: 1,
    gap: 4,
  },
  modelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  modelName: {
    fontSize: 16,
    fontWeight: '500',
    marginRight: 8,
  },
  externalBadgeContainer: {
    backgroundColor: '#4a90e2',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  externalBadgeText: {
    color: 'white',
    fontSize: 11,
    fontWeight: '600',
  },
  modelMetaInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  metaText: {
    fontSize: 13,
    marginLeft: 4,
  },
  buttonContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  actionButton: {
    padding: 8,
    marginLeft: 8,
  },
  deleteButton: {
    padding: 8,
    marginLeft: 12,
  },
});

export default StoredModelItem; 