import { useState, useEffect } from 'react';
import { useWindowDimensions } from 'react-native';

interface ResponsiveLayoutInfo {
  isWideScreen: boolean;
  screenWidth: number;
  screenHeight: number;
  sidebarWidth: number;
  chatWidth: number;
}

const WIDE_SCREEN_BREAKPOINT = 800;
const SIDEBAR_PERCENTAGE = 0.45;
const CHAT_PERCENTAGE = 0.55;

export function useResponsiveLayout(): ResponsiveLayoutInfo {
  const { width, height } = useWindowDimensions();
  const [layoutInfo, setLayoutInfo] = useState<ResponsiveLayoutInfo>({
    isWideScreen: width >= WIDE_SCREEN_BREAKPOINT,
    screenWidth: width,
    screenHeight: height,
    sidebarWidth: width * SIDEBAR_PERCENTAGE,
    chatWidth: width * CHAT_PERCENTAGE,
  });

  useEffect(() => {
    const isWideScreen = width >= WIDE_SCREEN_BREAKPOINT;
    setLayoutInfo({
      isWideScreen,
      screenWidth: width,
      screenHeight: height,
      sidebarWidth: width * SIDEBAR_PERCENTAGE,
      chatWidth: width * CHAT_PERCENTAGE,
    });
  }, [width, height]);

  return layoutInfo;
}
