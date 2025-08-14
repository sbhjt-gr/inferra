import React from 'react';
import { Text, TextProps } from 'react-native';
import { useResponsive } from '../hooks/useResponsive';

interface ResponsiveTextProps extends TextProps {
  size?: 'small' | 'medium' | 'large' | 'xlarge';
  children: React.ReactNode;
}

export default function ResponsiveText({
  size = 'medium',
  style,
  children,
  ...props
}: ResponsiveTextProps) {
  const { fontSize } = useResponsive();
  
  return (
    <Text 
      style={[
        { fontSize: fontSize[size] },
        style
      ]}
      {...props}
    >
      {children}
    </Text>
  );
}