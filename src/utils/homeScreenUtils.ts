import { Dimensions } from 'react-native';

export const windowWidth = Dimensions.get('window').width;

export function debounce<T extends (...args: any[]) => any>(func: T, wait: number) {
  let timeout: NodeJS.Timeout | null = null;

  const debounced = (...args: Parameters<T>) => {
    if (timeout !== null) {
      clearTimeout(timeout);
    }
    timeout = setTimeout(() => {
      func(...args);
      timeout = null;
    }, wait);
  };

  debounced.cancel = () => {
    if (timeout !== null) {
      clearTimeout(timeout);
      timeout = null;
    }
  };

  return debounced;
}

export const generateRandomId = () => {
  return Math.random().toString(36).substring(2) + Date.now().toString(36);
};
