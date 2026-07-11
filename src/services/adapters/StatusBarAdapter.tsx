import { useLayoutEffect } from 'react';
import { Platform, StatusBar as NativeStatusBar } from 'react-native';
import { ThemeColors } from '../../types/theme';

type StatusBarHostProps = {
  themeName: ThemeColors;
  forceLight?: boolean;
  translucent?: boolean;
  animated?: boolean;
};

/*
 On iOS the status bar is owned by the view controllers through react-native-screens
 (UIViewControllerBasedStatusBarAppearance is YES and the navigator statusBarStyle
 option drives it). Calling RCTStatusBarManager from JS there logs an error, so this
 host only drives the Android status bar.
*/
export function StatusBarHost({
  themeName,
  forceLight = false,
  translucent = true,
  animated = true,
}: StatusBarHostProps) {
  const barStyle = forceLight || themeName === 'dark' ? 'light-content' : 'dark-content';

  useLayoutEffect(() => {
    if (Platform.OS !== 'android') return;

    NativeStatusBar.setBarStyle(barStyle, animated);
    NativeStatusBar.setTranslucent(translucent);
    NativeStatusBar.setBackgroundColor('transparent', animated);
  }, [animated, barStyle, translucent]);

  return null;
}
