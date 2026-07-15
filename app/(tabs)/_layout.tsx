import { Platform } from 'react-native';
import { NativeTabs } from 'expo-router/unstable-native-tabs';
import { useTheme } from '../../src/context/ThemeContext';
import { theme } from '../../src/constants/theme';
import { OpenSansFont } from '../../src/hooks/OpenSansFont';
import { useResponsiveLayout } from '../../src/hooks/useResponsiveLayout';
import WideScreenLayout from '../../src/components/WideScreenLayout';

export default function TabLayout() {
  const { isWideScreen } = useResponsiveLayout();
  const { theme: currentTheme } = useTheme();
  const themeColors = theme[currentTheme];
  const { fonts } = OpenSansFont();

  if (isWideScreen) {
    return <WideScreenLayout />;
  }

  const isIOS = Platform.OS === 'ios';

  return (
    <NativeTabs
      backBehavior="history"
      labelVisibilityMode="labeled"
      backgroundColor={isIOS ? undefined : themeColors.tabBarBackground}
      unstable_nativeProps={{ ios: { tabBarControllerMode: 'tabBar' } }}
      tintColor={isIOS ? themeColors.primary : themeColors.tabBarActiveText}
      indicatorColor="rgba(255, 255, 255, 0.15)"
      rippleColor="rgba(255, 255, 255, 0.15)"
      iconColor={{
        default: isIOS ? themeColors.textSecondary : themeColors.tabBarInactiveText,
        selected: isIOS ? themeColors.primary : themeColors.tabBarActiveText,
      }}
      labelStyle={{
        default: { fontFamily: fonts.medium.fontFamily, color: isIOS ? themeColors.textSecondary : themeColors.tabBarInactiveText },
        selected: { fontFamily: fonts.medium.fontFamily, color: isIOS ? themeColors.primary : themeColors.tabBarActiveText },
      }}
    >
      <NativeTabs.Trigger
        name="index"
        disableAutomaticContentInsets={isIOS}
      >
        <NativeTabs.Trigger.Icon
          sf={{ default: 'house', selected: 'house.fill' }}
          md={{ default: 'home', selected: 'home_filled' }}
        />
        <NativeTabs.Trigger.Label>Chat</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="models" disableTransparentOnScrollEdge>
        <NativeTabs.Trigger.Icon
          sf={{ default: 'cube', selected: 'cube.fill' }}
          md="deployed_code"
        />
        <NativeTabs.Trigger.Label>Models</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="tools" disableTransparentOnScrollEdge>
        <NativeTabs.Trigger.Icon
          sf={{ default: 'wrench.and.screwdriver', selected: 'wrench.and.screwdriver.fill' }}
          md="build"
        />
        <NativeTabs.Trigger.Label>Tools</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="settings" disableTransparentOnScrollEdge>
        <NativeTabs.Trigger.Icon
          sf={{ default: 'gearshape', selected: 'gearshape.fill' }}
          md="settings"
        />
        <NativeTabs.Trigger.Label>Settings</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
