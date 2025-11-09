import { NativeModules, Platform } from 'react-native';
import * as Device from 'expo-device';

const { DeviceInfoModule } = NativeModules as {
  DeviceInfoModule?: {
    getGPUInfo?: () => Promise<{ 
      hasAdreno?: boolean;
      renderer?: string;
      vendor?: string;
      version?: string;
      hasMali?: boolean;
      hasPowerVR?: boolean;
      supportsOpenCL?: boolean;
      gpuType?: string;
    }>;
    getCPUInfo?: () => Promise<{
      cores?: number;
      hasI8mm?: boolean;
      hasDotProd?: boolean;
      hasFp16?: boolean;
      hasSve?: boolean;
      socModel?: string;
      features?: string[];
      processors?: Array<{
        processor?: string;
        'model name'?: string;
        'cpu MHz'?: string;
        vendor_id?: string;
      }>;
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

export interface CpuInfo {
  cores: number;
  hasFp16?: boolean;
  hasDotProd?: boolean;
  hasSve?: boolean;
  hasI8mm?: boolean;
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

export const getCpuInfo = async (): Promise<CpuInfo | null> => {
  if (!DeviceInfoModule?.getCPUInfo) {
    return null;
  }

  try {
    const info = await DeviceInfoModule.getCPUInfo();
    if (!info) {
      return null;
    }

    if (Platform.OS === 'ios') {
      return {
        cores: info.cores || 0,
        hasFp16: false,
        hasDotProd: false,
        hasSve: false,
        hasI8mm: false,
      };
    }

    return {
      cores: info.cores || 4,
      hasFp16: info.hasFp16,
      hasDotProd: info.hasDotProd,
      hasSve: info.hasSve,
      hasI8mm: info.hasI8mm,
    };
  } catch (error) {
    return null;
  }
};

export const getCpuCoreCount = async (): Promise<number> => {
  const cpuInfo = await getCpuInfo();
  return cpuInfo?.cores || 4;
};

export const getRecommendedThreadCount = async (): Promise<number> => {
  const cores = await getCpuCoreCount();
  return cores <= 4 ? cores : Math.floor(cores * 0.8);
};

export const isHighEndDevice = async (): Promise<boolean> => {
  try {
    const ram = Device.totalMemory;
    if (!ram) {
      return false;
    }
    const ramGB = ram / 1000 / 1000 / 1000;

    const cpuInfo = await getCpuInfo();
    const cpuCount = cpuInfo?.cores || 4;

    const ramOK = ramGB >= 5.5;
    const cpuOK = cpuCount >= 6;

    return ramOK && cpuOK;
  } catch (error) {
    return false;
  }
};
