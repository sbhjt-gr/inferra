import { Dimensions, PixelRatio } from 'react-native';
import * as Device from 'expo-device';

export interface DeviceInfo {
  width: number;
  height: number;
  isTablet: boolean;
  isPhone: boolean;
  isLargePhone: boolean;
  deviceType: 'phone' | 'large-phone' | 'tablet';
  orientation: 'portrait' | 'landscape';
}

export const getDeviceInfo = (): DeviceInfo => {
  try {
    const { width, height } = Dimensions.get('window');
    
    const safeWidth = width || 360;
    const safeHeight = height || 640;
    
    const minTabletSize = 768;
    const minLargePhoneSize = 480;
    
    const smallerDimension = Math.min(safeWidth, safeHeight);
    const isTablet = smallerDimension >= minTabletSize;
    const isLargePhone = safeWidth >= minLargePhoneSize && !isTablet;
    const isPhone = safeWidth < minLargePhoneSize;
  
  let deviceType: 'phone' | 'large-phone' | 'tablet';
  if (isTablet) deviceType = 'tablet';
  else if (isLargePhone) deviceType = 'large-phone';
  else deviceType = 'phone';
  
  return {
    width: safeWidth,
    height: safeHeight,
    isTablet,
    isPhone,
    isLargePhone,
    deviceType,
    orientation: safeWidth > safeHeight ? 'landscape' : 'portrait'
  };
  } catch (error) {
    return {
      width: 360,
      height: 640,
      isTablet: false,
      isPhone: true,
      isLargePhone: false,
      deviceType: 'phone',
      orientation: 'portrait'
    };
  }
};

export const getResponsiveValue = <T>(
  phone: T, 
  tablet: T, 
  largePhone?: T
): T => {
  const { deviceType } = getDeviceInfo();
  
  switch (deviceType) {
    case 'tablet':
      return tablet;
    case 'large-phone':
      return largePhone !== undefined ? largePhone : phone;
    default:
      return phone;
  }
};

export const getResponsiveDimensions = () => {
  const deviceInfo = getDeviceInfo();
  
  return {
    screenWidth: deviceInfo.width,
    screenHeight: deviceInfo.height,
    paddingHorizontal: getResponsiveValue(16, 64, 24),
    modalWidth: deviceInfo.width * getResponsiveValue(0.9, 0.6, 0.8),
    modalMaxWidth: getResponsiveValue(400, 600, 500),
    chatMessageMaxWidth: getResponsiveValue('85%', '70%', '80%'),
    tabBarHeight: getResponsiveValue(70, 80, 75),
    gridColumns: getResponsiveValue(1, 2, 1),
    dialog: {
      width: getResponsiveValue('90%', '60%', '80%'),
      maxWidth: getResponsiveValue(400, 600, 500),
      padding: getResponsiveValue(20, 32, 24),
      inputHeight: getResponsiveValue(44, 52, 48),
      inputPadding: getResponsiveValue(12, 16, 14),
      buttonHeight: getResponsiveValue(44, 48, 46),
      borderRadius: getResponsiveValue(12, 16, 14),
    },
    fontSize: {
      small: getResponsiveValue(12, 14, 13),
      medium: getResponsiveValue(14, 16, 15),
      large: getResponsiveValue(16, 18, 17),
      xlarge: getResponsiveValue(18, 20, 19)
    },
    margins: {
      small: getResponsiveValue(8, 12, 10),
      medium: getResponsiveValue(16, 24, 20),
      large: getResponsiveValue(24, 32, 28),
      section: getResponsiveValue(16, 32, 24)
    },
    iconSizes: {
      small: getResponsiveValue(16, 18, 17),
      medium: getResponsiveValue(20, 24, 22),
      large: getResponsiveValue(24, 28, 26)
    }
  };
};

export const isTabletDevice = (): boolean => {
  return getDeviceInfo().isTablet;
};

export const getDeviceTypeInfo = () => {
  const deviceInfo = getDeviceInfo();
  const deviceName = Device.deviceName || 'Unknown Device';
  const deviceYearClass = Device.deviceYearClass || 0;
  
  return {
    ...deviceInfo,
    deviceName,
    deviceYearClass,
    pixelDensity: PixelRatio.get(),
    fontScale: PixelRatio.getFontScale()
  };
};