import React from 'react';
import { ScrollView, StyleSheet, View, Platform, TouchableOpacity } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';

import AppHeader from '../components/AppHeader';
import { theme } from '../constants/theme';
import { GradientBg } from '../services/adapters/GradientBgAdapter';
import { useTheme } from '../context/ThemeContext';
import { useRemoteModel } from '../context/RemoteModelContext';
import { useResponsiveLayout } from '../hooks/useResponsiveLayout';
import LabsTasksSection from '../components/settings/LabsTasksSection';
import { headerBtn, headerTint } from '../utils/headerChrome';

export default function BenchmarkScreen() {
  const insets = useSafeAreaInsets();
  const { theme: currentTheme } = useTheme();
  const themeColors = theme[currentTheme];
  const router = useRouter();
  const { isLoggedIn } = useRemoteModel();
  const { isWideScreen } = useResponsiveLayout();
  const tint = headerTint(
    isWideScreen,
    currentTheme === 'light',
    themeColors.primary,
    themeColors.headerText,
  );

  const profileButton = (
    <TouchableOpacity
      style={headerBtn(isWideScreen)}
      onPress={() => {
        if (isLoggedIn) {
          router.push('/profile');
        } else {
          router.push({ pathname: '/login', params: { redirectTo: '/(tabs)/tools' } });
        }
      }}
      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
    >
      <MaterialCommunityIcons
        name={isLoggedIn ? 'account-circle' : 'login'}
        size={22}
        color={tint}
      />
    </TouchableOpacity>
  );

  return (
    <View style={{ flex: 1, backgroundColor: themeColors.background }}>
      <GradientBg />
      <AppHeader title="Tools" rightButtons={profileButton} />
      <ScrollView style={styles.container} contentContainerStyle={[styles.content, Platform.OS === 'ios' && { paddingBottom: insets.bottom }]} showsVerticalScrollIndicator={false}>
        <LabsTasksSection
          onOpenPromptLab={() => router.push('/prompt-lab')}
          onOpenSkillManager={() => router.push('/skill-manager')}
          onOpenAudioScribe={() => router.push('/audio-scribe')}
          onOpenMobileActions={() => router.push('/mobile-actions')}
          onOpenBenchmark={() => router.push('/benchmark')}
          onOpenServer={() => router.push('/local-server')}
        />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16, paddingTop: 20 },
});
