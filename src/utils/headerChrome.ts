import { Platform, ViewStyle } from 'react-native';

export function iosHeader(wide: boolean): boolean {
  return Platform.OS === 'ios' || wide;
}

export function headerTint(
  wide: boolean,
  isLight: boolean,
  primary: string,
  headerText: string,
): string {
  return iosHeader(wide) && isLight ? primary : headerText;
}

export function headerBtn(wide: boolean): ViewStyle {
  const ios = iosHeader(wide);
  return {
    width: ios ? 44 : 36,
    height: ios ? 44 : 36,
    borderRadius: ios ? 0 : 18,
    backgroundColor: ios ? 'transparent' : 'rgba(255, 255, 255, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  };
}
