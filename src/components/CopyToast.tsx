import React from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';

interface CopyToastProps {
  visible: boolean;
  message: string;
}

const CopyToast: React.FC<CopyToastProps> = ({ visible, message }) => {
  if (!visible) return null;

  return (
    <View style={styles.copyToast}>
      <Text style={styles.copyToastText}>{message}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  copyToast: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 60 : 20,
    alignSelf: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    zIndex: 1000,
  },
  copyToastText: {
    color: '#fff',
    fontSize: 14,
  },
});

export default CopyToast;
