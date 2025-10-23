import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Searchbar, Button } from 'react-native-paper';
import { useTheme } from '../../context/ThemeContext';
import { theme } from '../../constants/theme';

interface HuggingFaceSearchBarProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  onClearSearch: () => void;
}

export const HuggingFaceSearchBar: React.FC<HuggingFaceSearchBarProps> = ({
  searchQuery,
  onSearchChange,
  onClearSearch
}) => {
  const { theme: currentTheme } = useTheme();
  const themeColors = theme[currentTheme];

  return (
    <>
      <Searchbar
        placeholder="Search on HuggingFace..."
        onChangeText={onSearchChange}
        value={searchQuery}
        style={[styles.searchBar, { backgroundColor: themeColors.cardBackground }]}
        inputStyle={{ color: themeColors.text }}
        iconColor={themeColors.text}
      />

      {searchQuery.length > 0 && (
        <View style={styles.searchActions}>
          <Button
            mode="outlined"
            onPress={onClearSearch}
            style={styles.clearButton}
            icon="close"
          >
            Clear Search
          </Button>
        </View>
      )}
    </>
  );
};

const styles = StyleSheet.create({
  searchBar: {
    marginBottom: 16,
  },
  searchActions: {
    marginBottom: 16,
  },
  clearButton: {
    alignSelf: 'flex-start',
  },
});
