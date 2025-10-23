import { NativeModules, Platform } from 'react-native';
import * as Device from 'expo-device';

const { DeviceInfoModule } = NativeModules as {
  DeviceInfoModule?: {
    getGPUInfo?: () => Promise<{ hasAdreno?: boolean }>;
    getCPUInfo?: () => Promise<{
      hasI8mm?: boolean;
      hasDotProd?: boolean;
    }>;
  };
};

export type GpuSupportReason = 'ios_version' | 'no_adreno' | 'missing_cpu_features' | 'unknown';

export interface GpuSupport {
  isSupported: boolean;
  reason?: GpuSupportReason;
  details?: {
    iosVersion?: number;
    hasAdreno?: boolean;
    hasI8mm?: boolean;
    hasDotProd?: boolean;
  };
}

const parseIosMajorVersion = (): number => {
  const versionString = typeof Device.osVersion === 'string' && Device.osVersion
    ? Device.osVersion
    : Platform.Version?.toString() ?? '0';
  const [major] = versionString.split('.');
  const parsed = parseInt(major ?? '0', 10);
  return Number.isFinite(parsed) ? parsed : 0;
};

export const checkGpuSupport = async (): Promise<GpuSupport> => {
  if (Platform.OS === 'ios') {
    const iosVersion = parseIosMajorVersion();
    const isSupported = iosVersion >= 18;
    return {
      isSupported,
      reason: isSupported ? undefined : 'ios_version',
      details: {
        iosVersion,
      },
    };
  }

  if (Platform.OS === 'android') {
    if (!DeviceInfoModule?.getGPUInfo || !DeviceInfoModule?.getCPUInfo) {
      // Unable to verify capabilities. Allow toggling but surface uncertainty.
      return {
        isSupported: true,
        reason: 'unknown',
      };
    }

    try {
      const [gpuInfo, cpuInfo] = await Promise.all([
        DeviceInfoModule.getGPUInfo(),
        DeviceInfoModule.getCPUInfo(),
      ]);

      const hasAdreno = Boolean(gpuInfo?.hasAdreno);
      const hasI8mm = Boolean(cpuInfo?.hasI8mm);
      const hasDotProd = Boolean(cpuInfo?.hasDotProd);
      const isSupported = hasAdreno && hasI8mm && hasDotProd;

      let reason: GpuSupportReason | undefined;
      if (!isSupported) {
        if (!hasAdreno) {
          reason = 'no_adreno';
        } else if (!hasI8mm || !hasDotProd) {
          reason = 'missing_cpu_features';
        } else {
          reason = 'unknown';
        }
      }

      return {
        isSupported,
        reason,
        details: {
          hasAdreno,
          hasI8mm,
          hasDotProd,
        },
      };
    } catch (error) {
      console.warn('Failed to check GPU support', error);
      return {
        isSupported: false,
        reason: 'unknown',
      };
    }
  }

  return {
    isSupported: false,
    reason: 'unknown',
  };
};
