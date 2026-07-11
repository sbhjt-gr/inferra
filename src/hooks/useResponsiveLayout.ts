import { useState, useEffect } from 'react';
import { useWindowDimensions } from 'react-native';
import { iosHeader } from '../utils/headerChrome';

interface ResponsiveLayoutInfo {
  isWideScreen: boolean;
  useIosHeader: boolean;
  screenWidth: number;
  screenHeight: number;
  sidebarWidth: number;
  chatWidth: number;
}

const WIDE_SCREEN_BREAKPOINT = 800;
const SIDEBAR_PERCENTAGE = 0.45;
const CHAT_PERCENTAGE = 0.55;

function buildLayout(width: number, height: number): ResponsiveLayoutInfo {
  const isWideScreen = width >= WIDE_SCREEN_BREAKPOINT;
  return {
    isWideScreen,
    useIosHeader: iosHeader(isWideScreen),
    screenWidth: width,
    screenHeight: height,
    sidebarWidth: width * SIDEBAR_PERCENTAGE,
    chatWidth: width * CHAT_PERCENTAGE,
  };
}

export function useResponsiveLayout(): ResponsiveLayoutInfo {
  const { width, height } = useWindowDimensions();
  const [layoutInfo, setLayoutInfo] = useState(() => buildLayout(width, height));

  useEffect(() => {
    setLayoutInfo(buildLayout(width, height));
  }, [width, height]);

  return layoutInfo;
}
