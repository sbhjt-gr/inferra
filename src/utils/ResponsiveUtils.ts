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
  const { width, height } = Dimensions.get('window');
  
  const minTabletSize = 768;
  const minLargePhoneSize = 480;
  
  const isTablet = Math.min(width, height) >= minTabletSize;
  const isLargePhone = width >= minLargePhoneSize && !isTablet;
  const isPhone = width < minLargePhoneSize;
  
  let deviceType: 'phone' | 'large-phone' | 'tablet';
  if (isTablet) deviceType = 'tablet';
  else if (isLargePhone) deviceType = 'large-phone';
  else deviceType = 'phone';
  
  return {
    width,
    height,
    isTablet,
    isPhone,
    isLargePhone,
    deviceType,
    orientation: width > height ? 'landscape' : 'portrait'
  };
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