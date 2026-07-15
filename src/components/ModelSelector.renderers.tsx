import React from 'react';
import { View, TouchableOpacity, ActivityIndicator, Text as RNText } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Text } from 'react-native-paper';
import { getThemeAwareColor } from '../utils/ColorUtils';
import { ThemeColors } from '../types/theme';
import {
  StoredModel,
  MLXGroup,
  OnlineModel,
  AppleFoundationModel,
  Model,
  SectionData,
} from './ModelSelector.types';
import { formatBytes, getDisplayName, isLiteRTModel, isMLXModel } from './ModelSelector.utils';
import { styles } from './ModelSelector.styles';

export interface RenderContext {
  currentTheme: 'light' | 'dark';
  themeColors: any;
  selectedModelPath: string | null;
  isGenerating: boolean;
  expandedGroups: Set<string>;
  onlineModelStatuses: { [key: string]: boolean };
  isOnlineModelsExpanded: boolean;
  isLocalModelsExpanded: boolean;
  isRefreshingLocalModels: boolean;
  enableRemoteModels: boolean;
  isLoggedIn: boolean;
  handleModelSelect: (model: Model) => void;
  toggleGroup: (key: string) => void;
  toggleOnlineModelsDropdown: () => void;
  toggleLocalModelsDropdown: () => void;
  refreshStoredModels: () => void;
  hasAnyApiKey: () => boolean;
}

export const renderAppleFoundationItem = (
  item: AppleFoundationModel,
  context: RenderContext
) => {
  const { currentTheme, themeColors, selectedModelPath, isGenerating, handleModelSelect } = context;
  const isSelected = selectedModelPath === item.id;
  const darkPurple = '#C060E0';
  const selectedColor = isSelected ? (currentTheme === 'dark' ? darkPurple : getThemeAwareColor('#4a0660', currentTheme)) : currentTheme === 'dark' ? '#fff' : themeColors.text;

  return (
    <TouchableOpacity
      style={[
        styles.modelItem,
        { backgroundColor: themeColors.borderColor },
        isSelected && (currentTheme === 'dark' ? { backgroundColor: 'rgba(192, 96, 224, 0.22)' } : styles.selectedModelItem),
        isGenerating && styles.modelItemDisabled,
      ]}
      onPress={() => handleModelSelect(item)}
      disabled={isGenerating}
    >
      <View style={styles.modelIconContainer}>
        <MaterialCommunityIcons
          name={isSelected ? 'apple' : 'apple'}
          size={28}
          color={selectedColor}
        />
      </View>
      <View style={styles.modelInfo}>
        <View style={styles.modelNameRow}>
          <Text
            style={[
              styles.modelName,
              { color: currentTheme === 'dark' ? '#fff' : themeColors.text },
              isSelected && { color: currentTheme === 'dark' ? darkPurple : getThemeAwareColor('#4a0660', currentTheme) },
            ]}
          >
            {item.name}
          </Text>
          <View
            style={[
              styles.connectionTypeBadge,
              { backgroundColor: currentTheme === 'dark' ? 'rgba(255, 255, 255, 0.15)' : 'rgba(74, 6, 96, 0.1)' },
            ]}
          >
            <Text
              style={[
                styles.connectionTypeText,
                { color: currentTheme === 'dark' ? '#fff' : '#4a0660' },
              ]}
            >
              LOCAL
            </Text>
          </View>
        </View>
        <View style={styles.modelMetaInfo}>
          <View
            style={[
              styles.modelTypeBadge,
              {
                backgroundColor: isSelected
                  ? currentTheme === 'dark'
                    ? 'rgba(255, 255, 255, 0.15)'
                    : 'rgba(74, 6, 96, 0.1)'
                  : 'rgba(150, 150, 150, 0.1)',
              },
            ]}
          >
            <Text
              style={[
                styles.modelTypeText,
                {
                  color: isSelected
                    ? currentTheme === 'dark'
                      ? '#fff'
                      : '#4a0660'
                    : currentTheme === 'dark'
                      ? '#fff'
                      : themeColors.secondaryText,
                },
              ]}
            >
              {item.provider}
            </Text>
          </View>
        </View>
      </View>
      {isSelected && (
        <View style={styles.selectedIndicator}>
          <MaterialCommunityIcons
            name="check-circle"
            size={24}
            color={currentTheme === 'dark' ? darkPurple : getThemeAwareColor('#4a0660', currentTheme)}
          />
        </View>
      )}
    </TouchableOpacity>
  );
};

export const renderLocalModelItem = (
  item: StoredModel | MLXGroup,
  context: RenderContext
) => {
  const {
    currentTheme,
    themeColors,
    selectedModelPath,
    isGenerating,
    expandedGroups,
    handleModelSelect,
    toggleGroup,
  } = context;

  const isGroup = 'isMLXGroup' in item && item.isMLXGroup;
  const darkPurple = '#C060E0';

  if (isGroup) {
    const group = item as MLXGroup;
    const isSelected = selectedModelPath === group.path;
    const expanded = expandedGroups.has(group.groupKey);

    return (
      <View
        style={[
          styles.groupCard,
          { backgroundColor: themeColors.borderColor },
          isSelected && (currentTheme === 'dark' ? { backgroundColor: 'rgba(192, 96, 224, 0.22)' } : styles.selectedModelItem),
        ]}
      >
        <TouchableOpacity
          style={[
            styles.groupHeaderRow,
            isGenerating && styles.modelItemDisabled,
          ]}
          onPress={() => handleModelSelect(group)}
          disabled={isGenerating}
        >
          <View style={styles.modelIconContainer}>
            <MaterialCommunityIcons
              name={isSelected ? 'cube' : 'cube-outline'}
              size={28}
              color={
                isSelected
                  ? currentTheme === 'dark'
                    ? darkPurple
                    : getThemeAwareColor('#4a0660', currentTheme)
                  : currentTheme === 'dark'
                    ? '#fff'
                    : themeColors.text
              }
            />
          </View>
          <View style={styles.modelInfo}>
            <View style={styles.modelNameRow}>
              <Text
                style={[
                  styles.modelName,
                  { color: currentTheme === 'dark' ? '#fff' : themeColors.text },
                  isSelected && { color: currentTheme === 'dark' ? darkPurple : getThemeAwareColor('#4a0660', currentTheme) },
                ]}
              >
                {getDisplayName(group.name)}
              </Text>
              <View
                style={[
                  styles.connectionTypeBadge,
                  { backgroundColor: currentTheme === 'dark' ? 'rgba(255, 255, 255, 0.15)' : 'rgba(74, 6, 96, 0.1)' },
                ]}
              >
                <Text style={[styles.connectionTypeText, { color: currentTheme === 'dark' ? '#fff' : '#4a0660' }]}>
                  LOCAL
                </Text>
              </View>
            </View>
            <View style={styles.modelMetaInfo}>
              <View
                style={[
                  styles.modelTypeBadge,
                  { backgroundColor: currentTheme === 'dark' ? 'rgba(95, 213, 132, 0.25)' : 'rgba(42, 140, 66, 0.1)' },
                ]}
              >
                <Text style={[styles.modelTypeText, { color: currentTheme === 'dark' ? '#5FD584' : '#2a8c42' }]}>
                  MLX
                </Text>
              </View>
              <Text style={[styles.modelDetails, { color: currentTheme === 'dark' ? '#fff' : themeColors.secondaryText }]}>
                {formatBytes(group.size || 0)} • {group.mlxFiles.length} files
              </Text>
            </View>
          </View>
          <View style={styles.groupActions}>
            <TouchableOpacity
              onPress={(e) => {
                e.stopPropagation();
                toggleGroup(group.groupKey);
              }}
              style={[
                styles.expandButton,
                { backgroundColor: currentTheme === 'dark' ? 'rgba(255, 255, 255, 0.08)' : 'rgba(74, 6, 96, 0.08)' },
              ]}
            >
              <MaterialCommunityIcons
                name={expanded ? 'chevron-up' : 'chevron-down'}
                size={20}
                color={currentTheme === 'dark' ? '#fff' : themeColors.secondaryText}
              />
            </TouchableOpacity>
            {isSelected && (
              <MaterialCommunityIcons
                name="check-circle"
                size={20}
                color={currentTheme === 'dark' ? darkPurple : getThemeAwareColor('#4a0660', currentTheme)}
              />
            )}
          </View>
        </TouchableOpacity>
        {expanded && (
          <View
            style={[
              styles.groupFiles,
              { borderTopColor: themeColors.borderColor },
            ]}
          >
            {group.mlxFiles.map((file) => (
              <View key={file.path} style={styles.groupFileRow}>
                <View style={styles.groupFileNameRow}>
                  <MaterialCommunityIcons
                    name="file-document-outline"
                    size={16}
                    color={currentTheme === 'dark' ? '#fff' : themeColors.secondaryText}
                    style={{ marginRight: 8 }}
                  />
                  <Text
                    style={[
                      styles.groupFileName,
                      { color: currentTheme === 'dark' ? '#fff' : themeColors.text },
                    ]}
                    numberOfLines={1}
                  >
                    {file.name.split('_').slice(2).join('_') || file.name}
                  </Text>
                </View>
                <Text
                  style={[
                    styles.groupFileSize,
                    { color: currentTheme === 'dark' ? '#fff' : themeColors.secondaryText },
                  ]}
                >
                  {formatBytes(file.size)}
                </Text>
              </View>
            ))}
          </View>
        )}
      </View>
    );
  }

  const storedItem = item as StoredModel;
  const isMLX = isMLXModel(storedItem);
  const isLiteRT = isLiteRTModel(storedItem);
  const formatBadge = isMLX ? 'MLX' : isLiteRT ? 'LiteRT' : 'GGUF';
  const formatColor = isMLX
    ? (currentTheme === 'dark' ? '#5FD584' : '#2a8c42')
    : isLiteRT
      ? (currentTheme === 'dark' ? '#7EB4FF' : '#4285F4')
      : (currentTheme === 'dark' ? '#fff' : '#4a0660');

  return (
    <TouchableOpacity
      style={[
        styles.modelItem,
        { backgroundColor: themeColors.borderColor },
        selectedModelPath === item.path && (currentTheme === 'dark' ? { backgroundColor: 'rgba(192, 96, 224, 0.22)' } : styles.selectedModelItem),
        isGenerating && styles.modelItemDisabled,
      ]}
      onPress={() => handleModelSelect(item)}
      disabled={isGenerating}
    >
      <View style={styles.modelIconContainer}>
        <MaterialCommunityIcons
          name={selectedModelPath === item.path ? 'cube' : 'cube-outline'}
          size={28}
          color={selectedModelPath === item.path
            ? currentTheme === 'dark' ? darkPurple : getThemeAwareColor('#4a0660', currentTheme)
            : currentTheme === 'dark' ? '#fff' : themeColors.text}
        />
      </View>
      <View style={styles.modelInfo}>
        <View style={styles.modelNameRow}>
          <Text
            style={[
              styles.modelName,
              { color: currentTheme === 'dark' ? '#fff' : themeColors.text },
              selectedModelPath === item.path && { color: currentTheme === 'dark' ? darkPurple : getThemeAwareColor('#4a0660', currentTheme) },
            ]}
          >
            {getDisplayName(item.name)}
          </Text>
          <View
            style={[
              styles.connectionTypeBadge,
              { backgroundColor: currentTheme === 'dark' ? 'rgba(255, 255, 255, 0.15)' : 'rgba(74, 6, 96, 0.1)' },
            ]}
          >
            <Text style={[styles.connectionTypeText, { color: currentTheme === 'dark' ? '#fff' : '#4a0660' }]}>
              LOCAL
            </Text>
          </View>
        </View>
        <View style={styles.modelMetaInfo}>
          <View
            style={[
              styles.modelTypeBadge,
              { backgroundColor: isMLX
                ? (currentTheme === 'dark' ? 'rgba(95, 213, 132, 0.25)' : 'rgba(42, 140, 66, 0.1)')
                : isLiteRT
                  ? (currentTheme === 'dark' ? 'rgba(66, 133, 244, 0.25)' : 'rgba(66, 133, 244, 0.1)')
                  : (currentTheme === 'dark' ? 'rgba(255, 255, 255, 0.15)' : 'rgba(74, 6, 96, 0.1)')
              },
            ]}
          >
            <Text style={[styles.modelTypeText, { color: formatColor }]}>
              {formatBadge}
            </Text>
          </View>
          <Text style={[styles.modelDetails, { color: currentTheme === 'dark' ? '#fff' : themeColors.secondaryText }]}>
            {formatBytes(item.size)}
          </Text>
        </View>
      </View>
      {selectedModelPath === item.path && (
        <View style={styles.selectedIndicator}>
          <MaterialCommunityIcons
            name="check-circle"
            size={24}
            color={currentTheme === 'dark' ? darkPurple : getThemeAwareColor('#4a0660', currentTheme)}
          />
        </View>
      )}
    </TouchableOpacity>
  );
};

export const renderOnlineModelItem = (
  item: OnlineModel,
  context: RenderContext
) => {
  const {
    currentTheme,
    themeColors,
    selectedModelPath,
    isGenerating,
    onlineModelStatuses,
    enableRemoteModels,
    isLoggedIn,
    handleModelSelect,
  } = context;

  const isSelected = selectedModelPath === item.id;
  const hasApiKey = onlineModelStatuses[item.id];
  const isRemoteModelsDisabled = !enableRemoteModels || !isLoggedIn;
  const darkPurple = '#C060E0';

  return (
    <TouchableOpacity
      style={[
        styles.modelItem,
        { backgroundColor: themeColors.borderColor },
        isSelected && (currentTheme === 'dark' ? { backgroundColor: 'rgba(192, 96, 224, 0.22)' } : styles.selectedModelItem),
        isGenerating && styles.modelItemDisabled
      ]}
      onPress={() => handleModelSelect(item)}
      disabled={isGenerating}
    >
      <View style={styles.modelIconContainer}>
        <MaterialCommunityIcons 
          name={isSelected ? "cloud" : "cloud-outline"} 
          size={28} 
          color={isSelected
            ? currentTheme === 'dark' ? darkPurple : getThemeAwareColor('#4a0660', currentTheme)
            : hasApiKey
              ? currentTheme === 'dark' ? '#fff' : getThemeAwareColor('#4a0660', currentTheme)
              : currentTheme === 'dark' ? '#fff' : themeColors.secondaryText} 
        />
      </View>
      <View style={styles.modelInfo}>
        <View style={styles.modelNameRow}>
          <Text style={[
            styles.modelName, 
            { color: currentTheme === 'dark' ? '#fff' : themeColors.text },
            isSelected && { color: currentTheme === 'dark' ? darkPurple : getThemeAwareColor('#4a0660', currentTheme) }
          ]}>
            {item.name}
          </Text>
          <View style={[
            styles.connectionTypeBadge,
            { backgroundColor: currentTheme === 'dark' ? 'rgba(74, 180, 96, 0.25)' : 'rgba(74, 180, 96, 0.15)' }
          ]}>
            <Text style={[styles.connectionTypeText, { color: currentTheme === 'dark' ? '#5FD584' : '#2a8c42' }]}>
              REMOTE
            </Text>
          </View>
        </View>
        <View style={styles.modelMetaInfo}>
          <View style={[
            styles.modelTypeBadge,
            { 
              backgroundColor: (isSelected || hasApiKey) ? 
                currentTheme === 'dark' ? 'rgba(255, 255, 255, 0.15)' : 'rgba(74, 6, 96, 0.1)' : 
                'rgba(150, 150, 150, 0.1)' 
            }
          ]}>
            <Text style={[
              styles.modelTypeText, 
              { 
                color: (isSelected || hasApiKey) ? 
                  currentTheme === 'dark' ? '#fff' : '#4a0660' : 
                  currentTheme === 'dark' ? '#fff' : themeColors.secondaryText 
              }
            ]}>
              {item.provider}
            </Text>
          </View>
          {isRemoteModelsDisabled && (
            <Text style={[styles.modelApiKeyMissing, { color: currentTheme === 'dark' ? '#FF9494' : '#d32f2f' }]}>
              Remote models disabled
            </Text>
          )}
        </View>
      </View>
      {isSelected && (
        <View style={styles.selectedIndicator}>
          <MaterialCommunityIcons 
            name="check-circle" 
            size={24} 
            color={currentTheme === 'dark' ? darkPurple : getThemeAwareColor('#4a0660', currentTheme)} 
          />
        </View>
      )}
    </TouchableOpacity>
  );
};

export const renderSectionHeader = (
  section: SectionData,
  context: RenderContext
) => {
  const {
    currentTheme,
    themeColors,
    isOnlineModelsExpanded,
    isLocalModelsExpanded,
    isRefreshingLocalModels,
    toggleOnlineModelsDropdown,
    toggleLocalModelsDropdown,
    refreshStoredModels,
    hasAnyApiKey,
  } = context;

  if (section.title === 'Remote Models') {
    const hasApiKeys = hasAnyApiKey();
    return (
      <TouchableOpacity 
        onPress={toggleOnlineModelsDropdown}
        style={[
          styles.sectionHeader, 
          { backgroundColor: themeColors.background },
          styles.modelSectionHeader,
          styles.onlineModelsHeader,
          hasApiKeys && styles.onlineModelsHeaderWithKeys,
          currentTheme === 'dark' && {
            backgroundColor: 'rgba(255, 255, 255, 0.1)',
            borderColor: 'rgba(255, 255, 255, 0.2)'
          }
        ]}
      >
        <View style={styles.sectionHeaderContent}>
          <Text style={[
            styles.sectionHeaderText, 
            { color: currentTheme === 'dark' ? '#fff' : themeColors.secondaryText },
            currentTheme === 'dark' && { opacity: 0.9 }
          ]}>
            {section.title}
          </Text>
          <MaterialCommunityIcons 
            name={isOnlineModelsExpanded ? "chevron-up" : "chevron-down"} 
            size={24} 
            color={hasApiKeys ? 
              currentTheme === 'dark' ? '#5FD584' : getThemeAwareColor('#2a8c42', currentTheme) : 
              currentTheme === 'dark' ? '#fff' : themeColors.secondaryText} 
          />
        </View>
      </TouchableOpacity>
    );
  }
  
  return (
    <View
      style={[
        styles.sectionHeader,
        { backgroundColor: themeColors.background },
        styles.modelSectionHeader,
        styles.sectionHeaderWithControls,
        currentTheme === 'dark' && {
          backgroundColor: 'rgba(255, 255, 255, 0.1)',
          borderColor: 'rgba(255, 255, 255, 0.2)'
        }
      ]}
    >
      <TouchableOpacity
        onPress={toggleLocalModelsDropdown}
        style={styles.sectionHeaderToggle}
      >
        <Text
          style={[
            styles.sectionHeaderText,
            { color: currentTheme === 'dark' ? '#fff' : themeColors.secondaryText },
            currentTheme === 'dark' && { opacity: 0.9 }
          ]}
        >
          {section.title}
        </Text>
        <MaterialCommunityIcons
          name={isLocalModelsExpanded ? "chevron-up" : "chevron-down"}
          size={24}
          color={currentTheme === 'dark' ? '#fff' : themeColors.secondaryText}
        />
      </TouchableOpacity>
      <TouchableOpacity
        onPress={refreshStoredModels}
        style={[
          styles.sectionRefreshButton,
          { backgroundColor: themeColors.borderColor }
        ]}
        disabled={isRefreshingLocalModels}
      >
        {isRefreshingLocalModels ? (
          <ActivityIndicator size="small" color={getThemeAwareColor('#4a0660', currentTheme)} />
        ) : (
          <MaterialCommunityIcons
            name="refresh"
            size={20}
            color={currentTheme === 'dark' ? '#fff' : themeColors.secondaryText}
          />
        )}
      </TouchableOpacity>
    </View>
  );
};

export const renderItem = (
  item: Model,
  section: SectionData,
  context: RenderContext
) => {
  const { isOnlineModelsExpanded, isLocalModelsExpanded } = context;

  if (section.title === 'Remote Models' && !isOnlineModelsExpanded) {
    return null;
  }
  if (section.title === 'Local Models' && !isLocalModelsExpanded) {
    return null;
  }
  
  if ('isAppleFoundation' in item) {
    return renderAppleFoundationItem(item, context);
  }
  if ('isOnline' in item) {
    return renderOnlineModelItem(item, context);
  } else {
    return renderLocalModelItem(item as StoredModel, context);
  }
};
