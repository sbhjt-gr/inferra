import React, { useEffect, useMemo, useState } from 'react';
import { View, StyleSheet, ScrollView, Text } from 'react-native';
import { useTheme } from '../context/ThemeContext';
import { theme } from '../constants/theme';
import AppHeader from '../components/AppHeader';
import SettingsSection from '../components/settings/SettingsSection';
import { localServerWebRTC } from '../services/LocalServerWebRTC';

type HttpMethod = 'GET' | 'POST' | 'DELETE';

type EndpointDoc = {
  method: HttpMethod;
  path: string;
  description: string;
  body?: string;
  sample?: string;
};

const restEndpoints: EndpointDoc[] = [
  {
    method: 'GET',
    path: '/api/tags',
    description: 'Lists installed models with metadata.',
    sample: `curl -X GET http://<host>:11434/api/tags`
  },
  {
    method: 'POST',
    path: '/api/pull',
    description: 'Downloads a model from a supplied URL or remote registry.',
    body: '{"url":"https://...","model":"model-name"}',
    sample: `curl -X POST http://<host>:11434/api/pull -H "Content-Type: application/json" -d '{"url":"https://huggingface.co/...","model":"example"}'`
  },
  {
    method: 'DELETE',
    path: '/api/delete',
    description: 'Removes an installed model by name.',
    body: '{"name":"model-name"}',
    sample: `curl -X DELETE http://<host>:11434/api/delete -H "Content-Type: application/json" -d '{"name":"example"}'`
  },
  {
    method: 'GET',
    path: '/api/ps',
    description: 'Displays the model currently loaded into memory.',
    sample: `curl -X GET http://<host>:11434/api/ps`
  },
  {
    method: 'POST',
    path: '/api/chat',
    description: 'Streams chat completions using a messages array.',
    body: '{"messages":[{"role":"user","content":"Hello"}],"stream":true}',
    sample: `curl -N -X POST http://<host>:11434/api/chat -H "Content-Type: application/json" -d '{"messages":[{"role":"user","content":"Hello"}],"stream":true}'`
  },
  {
    method: 'POST',
    path: '/api/generate',
    description: 'Generates a single completion from a prompt.',
    body: '{"prompt":"Write a haiku."}',
    sample: `curl -N -X POST http://<host>:11434/api/generate -H "Content-Type: application/json" -d '{"prompt":"Hello"}'`
  },
  {
    method: 'POST',
    path: '/api/embeddings',
    description: 'Returns vector embeddings when supported by the loaded model.',
    body: '{"input":"Vector me"}',
    sample: `curl -X POST http://<host>:11434/api/embeddings -H "Content-Type: application/json" -d '{"input":"Example"}'`
  },
  {
    method: 'POST',
    path: '/api/copy',
    description: 'Copies an existing model file to a new name.',
    body: '{"source":"model.gguf","destination":"model-copy"}',
    sample: `curl -X POST http://<host>:11434/api/copy -H "Content-Type: application/json" -d '{"source":"model.gguf","destination":"duplicate"}'`
  },
  {
    method: 'GET',
    path: '/api/version',
    description: 'Returns the Inferra local server version.',
    sample: `curl -X GET http://<host>:11434/api/version`
  }
];

const signalingEndpoints: EndpointDoc[] = [
  {
    method: 'GET',
    path: '/offer',
    description: 'Provides the current WebRTC offer for manual pairing.',
    sample: `curl -X GET http://<host>:11434/offer`
  },
  {
    method: 'POST',
    path: '/webrtc/answer',
    description: 'Accepts a WebRTC answer payload when pairing manually.',
    body: '{"peerId":"...","sdp":"..."}',
    sample: `curl -X POST http://<host>:11434/webrtc/answer -H "Content-Type: application/json" -d '{"peerId":"browser","sdp":"..."}'`
  }
];

const handshakeNotes = [
  'Browser clients request /offer to receive the SDP when automatic pairing fails.',
  'After creating an answer locally, POST it to /webrtc/answer with the same peerId returned alongside the offer.',
  'Once accepted, the HTTP REST endpoints operate over the established data channel connection.'
];

export default function ServerDocsScreen() {
  const { theme: currentTheme } = useTheme();
  const themeColors = theme[currentTheme as 'light' | 'dark'];
  const [signalingURL, setSignalingURL] = useState<string | undefined>(() => {
    const status = localServerWebRTC.getStatus();
    return status.signalingURL;
  });

  useEffect(() => {
    const server = localServerWebRTC;
    const handleStarted = (data: any) => {
      setSignalingURL(data.signalingURL);
    };
    const handleStopped = () => {
      setSignalingURL(undefined);
    };

    server.on('serverStarted', handleStarted);
    server.on('serverStopped', handleStopped);

    return () => {
      server.off('serverStarted', handleStarted);
      server.off('serverStopped', handleStopped);
    };
  }, []);

  const methodColor = useMemo(() => {
    return (method: HttpMethod) => {
      if (method === 'GET') return '#1D9BF0';
      if (method === 'POST') return '#2DBE60';
      if (method === 'DELETE') return '#E55353';
      return themeColors.primary;
    };
  }, [themeColors.primary]);

  return (
    <View style={[styles.container, { backgroundColor: themeColors.background }]}> 
      <AppHeader title="Server API" showBackButton showLogo={false} />
      <ScrollView
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={false}
      >
        <SettingsSection title="BASE URL">
          <View style={[styles.infoCard, { backgroundColor: currentTheme === 'dark' ? 'rgba(255,255,255,0.06)' : '#FFFFFF' }] }>
            <Text style={[styles.infoLabel, { color: themeColors.secondaryText }]}>Current address</Text>
            <Text style={[styles.infoValue, { color: themeColors.text }]}>
              {signalingURL ? signalingURL : 'Start the server to view the reachable URL.'}
            </Text>
            <Text style={[styles.infoHint, { color: themeColors.secondaryText }]}>
              {'Replace <host> in the examples below with the device IP and port presented here.'}
            </Text>
          </View>
        </SettingsSection>

        <SettingsSection title="REST ENDPOINTS">
          <View style={{ padding: 16 }}>
            {restEndpoints.map((endpoint) => (
              <View
                key={`${endpoint.method}-${endpoint.path}`}
                style={[
                  styles.endpointCard,
                  {
                    borderColor: themeColors.borderColor,
                    backgroundColor: currentTheme === 'dark' ? 'rgba(255,255,255,0.04)' : '#FFFFFF'
                  }
                ]}
              >
                <View style={styles.endpointHeader}>
                  <View style={[styles.methodBadge, { backgroundColor: methodColor(endpoint.method) }]}>
                    <Text style={styles.methodText}>{endpoint.method}</Text>
                  </View>
                  <Text style={[styles.endpointPath, { color: themeColors.text }]}>{endpoint.path}</Text>
                </View>
                <Text style={[styles.endpointDescription, { color: themeColors.secondaryText }]}>
                  {endpoint.description}
                </Text>
                {endpoint.body && (
                  <View
                    style={[styles.bodyBlock, { backgroundColor: currentTheme === 'dark' ? 'rgba(255,255,255,0.08)' : '#F5F5F5' }]}
                  >
                    <Text style={[styles.bodyLabel, { color: themeColors.secondaryText }]}>Body</Text>
                    <Text style={[styles.codeText, { color: themeColors.text }]}>
                      {endpoint.body}
                    </Text>
                  </View>
                )}
                {endpoint.sample && (
                  <View
                    style={[styles.bodyBlock, { backgroundColor: currentTheme === 'dark' ? 'rgba(255,255,255,0.08)' : '#F5F5F5' }]}
                  >
                    <Text style={[styles.bodyLabel, { color: themeColors.secondaryText }]}>Example</Text>
                    <Text style={[styles.codeText, { color: themeColors.text }]}>
                      {endpoint.sample}
                    </Text>
                  </View>
                )}
              </View>
            ))}
          </View>
        </SettingsSection>

        <SettingsSection title="WEBRTC SIGNALING">
          <View style={{ padding: 16 }}>
            {signalingEndpoints.map((endpoint) => (
              <View
                key={`${endpoint.method}-${endpoint.path}`}
                style={[
                  styles.endpointCard,
                  {
                    borderColor: themeColors.borderColor,
                    backgroundColor: currentTheme === 'dark' ? 'rgba(255,255,255,0.04)' : '#FFFFFF'
                  }
                ]}
              >
                <View style={styles.endpointHeader}>
                  <View style={[styles.methodBadge, { backgroundColor: methodColor(endpoint.method) }]}>
                    <Text style={styles.methodText}>{endpoint.method}</Text>
                  </View>
                  <Text style={[styles.endpointPath, { color: themeColors.text }]}>{endpoint.path}</Text>
                </View>
                <Text style={[styles.endpointDescription, { color: themeColors.secondaryText }]}>
                  {endpoint.description}
                </Text>
                {endpoint.body && (
                  <View
                    style={[styles.bodyBlock, { backgroundColor: currentTheme === 'dark' ? 'rgba(255,255,255,0.08)' : '#F5F5F5' }]}
                  >
                    <Text style={[styles.bodyLabel, { color: themeColors.secondaryText }]}>Body</Text>
                    <Text style={[styles.codeText, { color: themeColors.text }]}>
                      {endpoint.body}
                    </Text>
                  </View>
                )}
                {endpoint.sample && (
                  <View
                    style={[styles.bodyBlock, { backgroundColor: currentTheme === 'dark' ? 'rgba(255,255,255,0.08)' : '#F5F5F5' }]}
                  >
                    <Text style={[styles.bodyLabel, { color: themeColors.secondaryText }]}>Example</Text>
                    <Text style={[styles.codeText, { color: themeColors.text }]}>
                      {endpoint.sample}
                    </Text>
                  </View>
                )}
              </View>
            ))}
            <View
              style={[styles.notesCard, { backgroundColor: currentTheme === 'dark' ? 'rgba(255,255,255,0.06)' : '#FFFFFF', borderColor: themeColors.borderColor }]}
            >
              <Text style={[styles.notesTitle, { color: themeColors.text }]}>Pairing overview</Text>
              {handshakeNotes.map((note) => (
                <Text key={note} style={[styles.notesText, { color: themeColors.secondaryText }]}>- {note}</Text>
              ))}
            </View>
          </View>
        </SettingsSection>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  contentContainer: {
    paddingBottom: 32,
  },
  infoCard: {
    padding: 16,
    borderRadius: 12,
    margin: 16,
  },
  infoLabel: {
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 4,
  },
  infoValue: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 8,
  },
  infoHint: {
    fontSize: 14,
    lineHeight: 20,
  },
  endpointCard: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  endpointHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  methodBadge: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 6,
    marginRight: 12,
  },
  methodText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
  },
  endpointPath: {
    fontSize: 16,
    fontWeight: '600',
  },
  endpointDescription: {
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 8,
  },
  bodyBlock: {
    borderRadius: 8,
    padding: 12,
    marginTop: 12,
  },
  bodyLabel: {
    fontSize: 12,
    textTransform: 'uppercase',
    marginBottom: 6,
    letterSpacing: 0.5,
  },
  codeText: {
    fontFamily: 'Menlo',
    fontSize: 12,
    lineHeight: 16,
  },
  notesCard: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 16,
  },
  notesTitle: {
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 8,
  },
  notesText: {
    fontSize: 14,
    lineHeight: 20,
  },
});
