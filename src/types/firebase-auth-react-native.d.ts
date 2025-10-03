declare module 'firebase/auth' {
  export * from '@firebase/auth';
  import type { Persistence } from '@firebase/auth';

  type ReactNativeAsyncStorage = {
    setItem(key: string, value: string): Promise<void>;
    getItem(key: string): Promise<string | null>;
    removeItem(key: string): Promise<void>;
  };

  export function getReactNativePersistence(storage: ReactNativeAsyncStorage): Persistence;
}
