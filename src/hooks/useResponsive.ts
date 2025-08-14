import { useState, useEffect } from 'react';
import { Dimensions, Platform } from 'react-native';
import { getDeviceInfo, getResponsiveDimensions, DeviceInfo } from '../utils/ResponsiveUtils';

export const useResponsive = () => {
  const [deviceInfo, setDeviceInfo] = useState<DeviceInfo>(getDeviceInfo());
  const [dimensions, setDimensions] = useState(getResponsiveDimensions());

  useEffect(() => {
    let subscription: any = null;
    
    try {
      subscription = Dimensions.addEventListener('change', () => {
        try {
          const newDeviceInfo = getDeviceInfo();
          const newDimensions = getResponsiveDimensions();
          
          setDeviceInfo(newDeviceInfo);
          setDimensions(newDimensions);
        } catch (error) {
          console.warn('Error updating responsive dimensions:', error);
        }
      });
    } catch (error) {
      console.warn('Error setting up dimension listener:', error);
    }

    return () => {
      try {
        if (subscription?.remove) {
          subscription.remove();
        }
      } catch (error) {
        console.warn('Error removing dimension listener:', error);
      }
    };
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
    let subscription: any = null;
    
    try {
      subscription = Dimensions.addEventListener('change', () => {
        try {
          const newOrientation = getDeviceInfo().orientation;
          setOrientation(newOrientation);
        } catch (error) {
          console.warn('Error updating device orientation:', error);
        }
      });
    } catch (error) {
      console.warn('Error setting up orientation listener:', error);
    }

    return () => {
      try {
        if (subscription?.remove) {
          subscription.remove();
        }
      } catch (error) {
        console.warn('Error removing orientation listener:', error);
      }
    };
  }, []);

  return orientation;
};