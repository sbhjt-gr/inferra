import { getDeviceInfo, getResponsiveValue, isTabletDevice } from '../ResponsiveUtils';

jest.mock('react-native', () => ({
  Dimensions: {
    get: jest.fn(() => ({ width: 320, height: 568 }))
  },
  PixelRatio: {
    get: jest.fn(() => 2),
    getFontScale: jest.fn(() => 1)
  }
}));

jest.mock('expo-device', () => ({
  deviceName: 'iPhone SE',
  deviceYearClass: 2020
}));

describe('ResponsiveUtils', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getDeviceInfo', () => {
    it('should identify phone correctly', () => {
      const { Dimensions } = require('react-native');
      Dimensions.get.mockReturnValue({ width: 320, height: 568 });
      
      const deviceInfo = getDeviceInfo();
      
      expect(deviceInfo.isPhone).toBe(true);
      expect(deviceInfo.isTablet).toBe(false);
      expect(deviceInfo.deviceType).toBe('phone');
      expect(deviceInfo.orientation).toBe('portrait');
    });

    it('should identify tablet correctly', () => {
      const { Dimensions } = require('react-native');
      Dimensions.get.mockReturnValue({ width: 1024, height: 768 });
      
      const deviceInfo = getDeviceInfo();
      
      expect(deviceInfo.isTablet).toBe(true);
      expect(deviceInfo.isPhone).toBe(false);
      expect(deviceInfo.deviceType).toBe('tablet');
      expect(deviceInfo.orientation).toBe('landscape');
    });

    it('should identify large phone correctly', () => {
      const { Dimensions } = require('react-native');
      Dimensions.get.mockReturnValue({ width: 600, height: 900 });
      
      const deviceInfo = getDeviceInfo();
      
      expect(deviceInfo.isLargePhone).toBe(true);
      expect(deviceInfo.isTablet).toBe(false);
      expect(deviceInfo.deviceType).toBe('large-phone');
    });
  });

  describe('getResponsiveValue', () => {
    it('should return phone value for phone devices', () => {
      const { Dimensions } = require('react-native');
      Dimensions.get.mockReturnValue({ width: 320, height: 568 });
      
      const result = getResponsiveValue('phone', 'tablet', 'large');
      expect(result).toBe('phone');
    });

    it('should return tablet value for tablet devices', () => {
      const { Dimensions } = require('react-native');
      Dimensions.get.mockReturnValue({ width: 1024, height: 768 });
      
      const result = getResponsiveValue('phone', 'tablet', 'large');
      expect(result).toBe('tablet');
    });

    it('should return large phone value when provided', () => {
      const { Dimensions } = require('react-native');
      Dimensions.get.mockReturnValue({ width: 600, height: 900 });
      
      const result = getResponsiveValue('phone', 'tablet', 'large');
      expect(result).toBe('large');
    });
  });

  describe('isTabletDevice', () => {
    it('should return true for tablet dimensions', () => {
      const { Dimensions } = require('react-native');
      Dimensions.get.mockReturnValue({ width: 1024, height: 768 });
      
      expect(isTabletDevice()).toBe(true);
    });

    it('should return false for phone dimensions', () => {
      const { Dimensions } = require('react-native');
      Dimensions.get.mockReturnValue({ width: 320, height: 568 });
      
      expect(isTabletDevice()).toBe(false);
    });
  });
});