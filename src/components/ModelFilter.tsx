import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { theme } from '../constants/theme';
import { getThemeAwareColor } from '../utils/ColorUtils';

export interface FilterOptions {
  tags: string[];
  modelFamilies: string[];
  quantizations: string[];
}

interface ModelFilterProps {
  onFiltersChange: (filters: FilterOptions) => void;
  availableTags: string[];
  availableModelFamilies: string[];
  availableQuantizations: string[];
  initialFilters?: FilterOptions;
  onExpandChange?: (isExpanded: boolean) => void;
}

const ModelFilter: React.FC<ModelFilterProps> = ({
  onFiltersChange,
  availableTags,
  availableModelFamilies,
  availableQuantizations,
  initialFilters,
  onExpandChange,
}) => {
  const { theme: currentTheme } = useTheme();
  const themeColors = theme[currentTheme as 'light' | 'dark'];
  
  const [isExpanded, setIsExpanded] = useState(false);
  const [selectedTags, setSelectedTags] = useState<string[]>(initialFilters?.tags || []);
  const [selectedModelFamilies, setSelectedModelFamilies] = useState<string[]>(initialFilters?.modelFamilies || []);
  const [selectedQuantizations, setSelectedQuantizations] = useState<string[]>(initialFilters?.quantizations || []);


  const toggleTag = (tag: string) => {
    const newTags = selectedTags.includes(tag)
      ? selectedTags.filter(t => t !== tag)
      : [...selectedTags, tag];
    setSelectedTags(newTags);
    onFiltersChange({
      tags: newTags,
      modelFamilies: selectedModelFamilies,
      quantizations: selectedQuantizations,
    });
  };

  const toggleModelFamily = (family: string) => {
    const newFamilies = selectedModelFamilies.includes(family)
      ? selectedModelFamilies.filter(f => f !== family)
      : [...selectedModelFamilies, family];
    setSelectedModelFamilies(newFamilies);
    onFiltersChange({
      tags: selectedTags,
      modelFamilies: newFamilies,
      quantizations: selectedQuantizations,
    });
  };

  const toggleQuantization = (quantization: string) => {
    const newQuantizations = selectedQuantizations.includes(quantization)
      ? selectedQuantizations.filter(q => q !== quantization)
      : [...selectedQuantizations, quantization];
    setSelectedQuantizations(newQuantizations);
    onFiltersChange({
      tags: selectedTags,
      modelFamilies: selectedModelFamilies,
      quantizations: newQuantizations,
    });
  };

  const clearAllFilters = () => {
    setSelectedTags([]);
    setSelectedModelFamilies([]);
    setSelectedQuantizations([]);
    onFiltersChange({
      tags: [],
      modelFamilies: [],
      quantizations: [],
    });
  };

  const hasActiveFilters = selectedTags.length > 0 || selectedModelFamilies.length > 0 || selectedQuantizations.length > 0;

  const renderFilterChips = (
    items: string[],
    selectedItems: string[],
    onToggle: (item: string) => void,
    getColor: (item: string) => string
  ) => {
    return (
      <View style={styles.chipContainer}>
        {items.map((item) => {
          const isSelected = selectedItems.includes(item);
          return (
            <TouchableOpacity
              key={item}
              style={[
                styles.chip,
                {
                  backgroundColor: isSelected ? getColor(item) : themeColors.borderColor,
                  borderColor: getColor(item),
                },
              ]}
              onPress={() => onToggle(item)}
            >
              <Text
                style={[
                  styles.chipText,
                  {
                    color: isSelected ? '#fff' : themeColors.text,
                  },
                ]}
              >
                {item}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    );
  };

  const getTagColor = (tag: string): string => {
    switch (tag) {
      case 'fastest':
        return getThemeAwareColor('#00a67e', currentTheme);
      case 'recommended':
        return getThemeAwareColor('#FF8C00', currentTheme);
      case 'vision':
        return getThemeAwareColor('#9C27B0', currentTheme);
      default:
        return getThemeAwareColor('#666', currentTheme);
    }
  };

  const getModelFamilyColor = (): string => {
    return getThemeAwareColor('#4a0660', currentTheme);
  };

  const getQuantizationColor = (): string => {
    return getThemeAwareColor('#2c7fb8', currentTheme);
  };

  return (
    <View style={[styles.container, { backgroundColor: themeColors.borderColor }]}>
      <TouchableOpacity
        style={styles.header}
        onPress={() => {
          const newExpanded = !isExpanded;
          setIsExpanded(newExpanded);
          onExpandChange?.(newExpanded);
        }}
      >
        <View style={styles.headerLeft}>
          <MaterialCommunityIcons
            name="filter-variant"
            size={20}
            color={themeColors.text}
            style={{ marginRight: 8 }}
          />
          <Text style={[styles.headerText, { color: themeColors.text }]}>
            Filter Models
          </Text>
          {hasActiveFilters && (
            <View style={[styles.activeIndicator, { backgroundColor: getThemeAwareColor('#4a0660', currentTheme) }]}>
              <Text style={styles.activeIndicatorText}>
                {selectedTags.length + selectedModelFamilies.length + selectedQuantizations.length}
              </Text>
            </View>
          )}
        </View>
        <View style={styles.headerRight}>
          {hasActiveFilters && (
            <TouchableOpacity
              style={styles.clearButton}
              onPress={clearAllFilters}
            >
              <Text style={[styles.clearButtonText, { color: getThemeAwareColor('#4a0660', currentTheme) }]}>
                Clear
              </Text>
            </TouchableOpacity>
          )}
          <MaterialCommunityIcons
            name={isExpanded ? "chevron-up" : "chevron-down"}
            size={24}
            color={themeColors.secondaryText}
          />
        </View>
      </TouchableOpacity>

      {isExpanded && (
        <View style={styles.content}>
          {availableTags.length > 0 && (
            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { color: themeColors.text }]}>
                Tags
              </Text>
              {renderFilterChips(availableTags, selectedTags, toggleTag, getTagColor)}
            </View>
          )}

          {availableModelFamilies.length > 0 && (
            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { color: themeColors.text }]}>
                Model Size
              </Text>
              {renderFilterChips(
                availableModelFamilies,
                selectedModelFamilies,
                toggleModelFamily,
                getModelFamilyColor
              )}
            </View>
          )}

          {availableQuantizations.length > 0 && (
            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { color: themeColors.text }]}>
                Quantization
              </Text>
              {renderFilterChips(
                availableQuantizations,
                selectedQuantizations,
                toggleQuantization,
                getQuantizationColor
              )}
            </View>
          )}
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginBottom: 16,
    borderRadius: 12,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  headerText: {
    fontSize: 16,
    fontWeight: '600',
  },
  activeIndicator: {
    marginLeft: 8,
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 2,
    minWidth: 20,
    alignItems: 'center',
  },
  activeIndicatorText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  clearButton: {
    marginRight: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  clearButtonText: {
    fontSize: 14,
    fontWeight: '600',
  },
  content: {
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  section: {
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
  },
  chipContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
  },
  chipText: {
    fontSize: 13,
    fontWeight: '500',
  },
});

export default ModelFilter; 
