import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { WebView } from 'react-native-webview';

import { backgroundWebViewManager, type BackgroundTask } from '../../services/WebViewManager';

const IDLE_HTML = '<!doctype html><html><head><meta charset="utf-8"></head><body></body></html>';

export default function SkillRuntimeHost() {
  const [task, setTask] = useState<BackgroundTask | null>(backgroundWebViewManager.getTask());

  useEffect(() => backgroundWebViewManager.subscribe(setTask), []);

  const source = task?.uri
    ? { uri: task.uri }
    : { html: task?.html || IDLE_HTML };

  return (
    <View pointerEvents="none" style={styles.wrap}>
      <WebView
        key={task?.id || 'idle'}
        originWhitelist={['file://', 'about:blank']}
        source={source}
        injectedJavaScript={task?.uri ? task.bridge : undefined}
        onLoadEnd={() => backgroundWebViewManager.markReady(task?.id)}
        onMessage={event => backgroundWebViewManager.handleMessage(event.nativeEvent.data)}
        javaScriptEnabled
        domStorageEnabled={false}
        cacheEnabled={false}
        mixedContentMode="never"
        allowingReadAccessToURL={task?.uri}
        sharedCookiesEnabled={false}
        thirdPartyCookiesEnabled={false}
        setSupportMultipleWindows={false}
        allowFileAccess
        allowUniversalAccessFromFileURLs={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    width: 1,
    height: 1,
    opacity: 0,
    left: -9999,
    top: -9999,
  },
});
