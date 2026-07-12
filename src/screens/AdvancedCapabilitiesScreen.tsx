import React, { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import AppHeader from '../components/AppHeader';
import SettingsSection from '../components/settings/SettingsSection';
import { theme } from '../constants/theme';
import { useTheme } from '../context/ThemeContext';
import { appFunctionsAdapter } from '../services/adapters/AppFunctionsAdapter';
import { rootAccessAdapter, type RootStatus } from '../services/adapters/RootAccessAdapter';
import { AppSwitch } from '../services/adapters/SwitchAdapter';
import { syncCapabilityTools } from '../services/capabilities/CapabilitySync';
import { toolAuditStore, type ToolAuditEvent } from '../services/capabilities/ToolAuditStore';
import { toolPolicyStore, type ToolPolicyState } from '../services/capabilities/ToolPolicyStore';

export default function AdvancedCapabilitiesScreen() {
  const { theme: currentTheme } = useTheme();
  const colors = theme[currentTheme];
  const [policy, setPolicy] = useState<ToolPolicyState>(toolPolicyStore.snapshot());
  const [events, setEvents] = useState<ToolAuditEvent[]>([]);
  const [appFnStatus, setAppFnStatus] = useState('unavailable');
  const [rootStatus, setRootStatus] = useState<RootStatus>('unavailable');

  useEffect(() => {
    console.log('advanced_caps_mount');
    const unsubPolicy = toolPolicyStore.subscribe(setPolicy);
    const unsubAudit = toolAuditStore.subscribe(setEvents);
    toolPolicyStore.load();
    toolAuditStore.load();
    appFunctionsAdapter.getCapabilities().then(caps => setAppFnStatus(caps.appFunctions));
    rootAccessAdapter.getCapabilities().then(caps => setRootStatus(caps.root));
    return () => {
      unsubPolicy();
      unsubAudit();
    };
  }, []);

  const row = (
    title: string,
    description: string,
    value: boolean,
    onChange: (next: boolean) => void,
    disabled = false,
  ) => (
    <View style={[styles.row, { backgroundColor: colors.cardBackground }]}>
      <View style={styles.rowText}>
        <Text style={[styles.rowTitle, { color: colors.text }]}>{title}</Text>
        <Text style={[styles.rowDesc, { color: colors.secondaryText }]}>{description}</Text>
      </View>
      <AppSwitch value={value} onValueChange={onChange} disabled={disabled} />
    </View>
  );

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <AppHeader title="Advanced Capabilities" />
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={[styles.notice, { color: colors.secondaryText, backgroundColor: colors.borderColor }]}>
          InferrLM does not root devices. Root and AppFunctions are optional, user-triggered, and disabled by default. No root-hiding or integrity bypass is provided.
        </Text>

        <SettingsSection title="Master">
          {row(
            'Enable advanced capabilities',
            'Required before AppFunctions or root tools can register.',
            policy.globalEnabled,
            enabled => {
              toolPolicyStore.setGlobal(enabled).then(syncCapabilityTools);
            },
          )}
          {row(
            'Emergency disable',
            'Immediately blocks all elevated tools.',
            policy.emergencyDisabled,
            disabled => {
              toolPolicyStore.setEmergency(disabled).then(syncCapabilityTools);
            },
          )}
        </SettingsSection>

        <SettingsSection title="AppFunctions">
          <Text style={[styles.status, { color: colors.secondaryText }]}>Status: {appFnStatus}</Text>
          {row(
            'Use other apps as tools',
            'Discover and call enabled AppFunctions from other apps.',
            policy.sources.app_functions,
            enabled => {
              toolPolicyStore.setSource('app_functions', enabled).then(syncCapabilityTools);
            },
            !policy.globalEnabled || policy.emergencyDisabled,
          )}
          {row(
            'Expose InferrLM composePrompt',
            'Allow agents to open InferrLM with a draft prompt.',
            policy.providerEnabled,
            async enabled => {
              await toolPolicyStore.setProvider(enabled);
              await appFunctionsAdapter.setProviderEnabled(enabled);
            },
            !policy.globalEnabled || policy.emergencyDisabled,
          )}
        </SettingsSection>

        <SettingsSection title="Root elevation">
          <Text style={[styles.status, { color: colors.secondaryText }]}>Status: {rootStatus}</Text>
          {row(
            'Enable root tools',
            'Registers allowlisted elevated diagnostics and maintenance tools.',
            policy.sources.root,
            enabled => {
              toolPolicyStore.setSource('root', enabled).then(syncCapabilityTools);
            },
            !policy.globalEnabled || policy.emergencyDisabled,
          )}
          <TouchableOpacity
            style={[styles.button, { backgroundColor: colors.primary }]}
            onPress={async () => {
              const status = await rootAccessAdapter.requestAccess();
              setRootStatus(status);
              console.log('root_request_ui', status);
            }}
          >
            <Text style={styles.buttonText}>Request root access</Text>
          </TouchableOpacity>
        </SettingsSection>

        <SettingsSection title="Recent outcomes">
          {events.length === 0 ? (
            <Text style={[styles.empty, { color: colors.secondaryText }]}>No elevated tool events yet.</Text>
          ) : (
            events.slice(0, 12).map(event => (
              <View key={event.id} style={[styles.event, { backgroundColor: colors.cardBackground }]}>
                <MaterialCommunityIcons
                  name={event.outcome === 'ok' ? 'check-circle' : 'alert-circle'}
                  size={18}
                  color={event.outcome === 'ok' ? colors.primary : colors.secondaryText}
                />
                <View style={styles.eventText}>
                  <Text style={[styles.rowTitle, { color: colors.text }]}>
                    {event.tool} · {event.outcome}
                  </Text>
                  <Text style={[styles.rowDesc, { color: colors.secondaryText }]}>
                    {event.source} · {event.durationMs}ms
                  </Text>
                </View>
              </View>
            ))
          )}
        </SettingsSection>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { paddingBottom: 40 },
  notice: {
    marginHorizontal: 16,
    marginBottom: 16,
    marginTop: 8,
    padding: 12,
    borderRadius: 12,
    fontSize: 13,
    lineHeight: 18,
  },
  row: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  rowText: { flex: 1 },
  rowTitle: { fontSize: 15, fontWeight: '600' },
  rowDesc: { fontSize: 12, marginTop: 4, lineHeight: 16 },
  status: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4, fontSize: 12 },
  button: {
    margin: 16,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  buttonText: { color: '#fff', fontWeight: '700' },
  empty: { padding: 16, fontSize: 13 },
  event: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  eventText: { flex: 1 },
});
