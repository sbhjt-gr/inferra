import React from 'react';
import { View, ViewProps } from 'react-native';
import { useResponsive } from '../hooks/useResponsive';

interface ResponsiveViewProps extends ViewProps {
  marginSize?: 'small' | 'medium' | 'large' | 'section';
  paddingSize?: 'small' | 'medium' | 'large';
  useMargins?: boolean;
  children: React.ReactNode;
}

export default function ResponsiveView({
  marginSize = 'medium',
  paddingSize,
  useMargins = false,
  style,
  children,
  ...props
}: ResponsiveViewProps) {
  const { margins, paddingHorizontal } = useResponsive();
  
  const responsiveStyle = {
    ...(useMargins && { marginHorizontal: margins[marginSize] }),
    ...(paddingSize && { padding: margins[paddingSize] }),
  };
  
  return (
    <View 
      style={[
        responsiveStyle,
        style
      ]}
      {...props}
    >
      {children}
    </View>
  );
}