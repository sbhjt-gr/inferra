import React from 'react';
import {
  StyleSheet,
  TouchableOpacity,
  TouchableOpacityProps,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

export interface StopButtonProps {
  onPress?: () => void;
  color?: string;
  size?: number;
  touchableOpacityProps?: TouchableOpacityProps;
}

export const StopButton: React.FC<StopButtonProps> = ({
  onPress,
  color = '#ff4444',
  size = 24,
  touchableOpacityProps,
}) => {
  const handlePress = () => {
    if (onPress) {
      onPress();
    }
  };

  return (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityLabel="Stop generation"
      testID="stop-button"
      {...touchableOpacityProps}
      onPress={handlePress}
      style={[styles.stopButton, touchableOpacityProps?.style]}
    >
      <MaterialCommunityIcons 
        name="stop-circle-outline" 
        size={size} 
        color={color} 
      />
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  stopButton: {
    minHeight: 40,
    minWidth: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
});

export default StopButton;