import { useState, useEffect } from 'react';
import { Dimensions } from 'react-native';
import { getDeviceInfo, getResponsiveDimensions, DeviceInfo } from '../utils/ResponsiveUtils';

export const useResponsive = () => {
  const [deviceInfo, setDeviceInfo] = useState<DeviceInfo>(getDeviceInfo());
  const [dimensions, setDimensions] = useState(getResponsiveDimensions());

  useEffect(() => {
    const subscription = Dimensions.addEventListener('change', () => {
      const newDeviceInfo = getDeviceInfo();
      const newDimensions = getResponsiveDimensions();
      
      setDeviceInfo(newDeviceInfo);
      setDimensions(newDimensions);
    });

    return () => subscription?.remove();
  }, []);

  return {
    ...deviceInfo,
    ...dimensions,
    isTablet: deviceInfo.isTablet,
    isPhone: deviceInfo.isPhone,
    isLargePhone: deviceInfo.isLargePhone,
    deviceType: deviceInfo.deviceType,
    orientation: deviceInfo.orientation
  };
};

export const useDeviceOrientation = () => {
  const [orientation, setOrientation] = useState(getDeviceInfo().orientation);

  useEffect(() => {
    const subscription = Dimensions.addEventListener('change', () => {
      const newOrientation = getDeviceInfo().orientation;
      setOrientation(newOrientation);
    });

    return () => subscription?.remove();
  }, []);

  return orientation;
};