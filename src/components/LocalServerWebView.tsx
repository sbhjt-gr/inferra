import React, { useRef, useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import { WebView } from 'react-native-webview';
import { localServer } from '../services/LocalServer';
import { logger } from '../utils/logger';

interface LocalServerWebViewProps {
  serverUrl: string;
  onClose?: () => void;
}

export const LocalServerWebView: React.FC<LocalServerWebViewProps> = ({ serverUrl, onClose }) => {
  const webViewRef = useRef<WebView>(null);

  useEffect(() => {
    logger.info('local_server_webview_mounted', 'webview');

    const handleModelInitialized = (data: any) => {
      logger.info(`webview_model_initialized: ${data.modelPath}`, 'webview');
      const message = {
        type: 'modelInitialized',
        modelPath: data.modelPath
      };
      if (webViewRef.current) {
        webViewRef.current.postMessage(JSON.stringify(message));
      }
    };

    const handleModelInitializationError = (data: any) => {
      logger.info(`webview_model_init_error: ${data.error}`, 'webview');
      const message = {
        type: 'modelInitializationError',
        error: data.error,
        modelPath: data.modelPath
      };
      if (webViewRef.current) {
        webViewRef.current.postMessage(JSON.stringify(message));
      }
    };

    const handleMessageToken = (data: any) => {
      const message = {
        type: 'messageToken',
        token: data.token
      };
      if (webViewRef.current) {
        webViewRef.current.postMessage(JSON.stringify(message));
      }
    };

    const handleMessageComplete = (data: any) => {
      const message = {
        type: 'messageComplete',
        response: data.response || '',
        stopped: data.stopped || false
      };
      if (webViewRef.current) {
        webViewRef.current.postMessage(JSON.stringify(message));
      }
    };

    const handleMessageError = (data: any) => {
      const message = {
        type: 'messageError',
        error: data.error
      };
      if (webViewRef.current) {
        webViewRef.current.postMessage(JSON.stringify(message));
      }
    };

    localServer.on('modelInitialized', handleModelInitialized);
    localServer.on('modelInitializationError', handleModelInitializationError);
    localServer.on('messageToken', handleMessageToken);
    localServer.on('messageComplete', handleMessageComplete);
    localServer.on('messageError', handleMessageError);

    return () => {
      localServer.off('modelInitialized', handleModelInitialized);
      localServer.off('modelInitializationError', handleModelInitializationError);
      localServer.off('messageToken', handleMessageToken);
      localServer.off('messageComplete', handleMessageComplete);
      localServer.off('messageError', handleMessageError);
    };
  }, []);

  const handleMessage = (event: any) => {
    const { data } = event.nativeEvent;
    logger.info(`webview_received_message: ${data}`, 'webview');

    try {
      const message = JSON.parse(data);
      logger.info(`webview_parsed_message: ${JSON.stringify(message)}`, 'webview');

      if (message.action === 'initializeModel') {
        logger.info(`webview_initialize_model: ${message.modelPath}`, 'webview');

        localServer.handleModelInitialization(message.modelPath)
          .then((result) => {
            logger.info(`model_init_result: ${JSON.stringify(result)}`, 'webview');
          })
          .catch((error) => {
            logger.error(`model_init_exception: ${error.message}`, 'webview');
          });

      } else if (message.action === 'sendMessage') {
        logger.info(`webview_send_message: ${message.message}`, 'webview');

        localServer.handleChatMessage(message.message)
          .then((result) => {
            logger.info(`chat_result: ${JSON.stringify(result)}`, 'webview');
          })
          .catch((error) => {
            logger.error(`chat_exception: ${error.message}`, 'webview');
          });

      } else if (message.action === 'stopGeneration') {
        logger.info('webview_stop_generation', 'webview');

        localServer.handleStopGeneration()
          .then((result) => {
            logger.info(`stop_result: ${JSON.stringify(result)}`, 'webview');
          })
          .catch((error) => {
            logger.error(`stop_exception: ${error.message}`, 'webview');
          });

      } else {
        logger.info(`webview_unknown_action: ${message.action}`, 'webview');
      }

    } catch (error) {
      logger.error(`webview_message_parse_error: ${error instanceof Error ? error.message : 'Unknown error'}`, 'webview');
    }
  };

  const handleLoadStart = () => {
    logger.info('webview_load_start', 'webview');
  };

  const handleLoadEnd = () => {
    logger.info('webview_load_end', 'webview');

    // Inject JavaScript to ensure ReactNativeWebView is available
    const injectedJS = `
      (function() {
        console.log('[INJECTED] Ensuring ReactNativeWebView is available');
        if (!window.ReactNativeWebView) {
          console.log('[INJECTED] ReactNativeWebView not found, creating fallback');
          window.ReactNativeWebView = {
            postMessage: function(message) {
              console.log('[INJECTED] Fallback postMessage called with:', message);
              if (window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.ReactNativeWebView) {
                window.webkit.messageHandlers.ReactNativeWebView.postMessage(message);
              } else {
                window.postMessage(message, '*');
              }
            }
          };
        } else {
          console.log('[INJECTED] ReactNativeWebView already available');
        }
        console.log('[INJECTED] Bridge setup complete');
        true;
      })();
    `;

    if (webViewRef.current) {
      webViewRef.current.injectJavaScript(injectedJS);
    }
  };

  const handleError = (error: any) => {
    logger.error(`webview_load_error: ${JSON.stringify(error)}`, 'webview');
  };

  return (
    <View style={styles.container}>
      <WebView
        ref={webViewRef}
        source={{ uri: serverUrl }}
        onMessage={handleMessage}
        onLoadStart={handleLoadStart}
        onLoadEnd={handleLoadEnd}
        onError={handleError}
        javaScriptEnabled={true}
        domStorageEnabled={true}
        startInLoadingState={true}
        scalesPageToFit={true}
        mixedContentMode="compatibility"
        allowsInlineMediaPlayback={true}
        mediaPlaybackRequiresUserAction={false}
        allowsFullscreenVideo={true}
        allowsBackForwardNavigationGestures={false}
        decelerationRate="normal"
        bounces={false}
        scrollEnabled={true}
        showsHorizontalScrollIndicator={false}
        showsVerticalScrollIndicator={false}
        originWhitelist={['*']}
        style={styles.webView}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  webView: {
    flex: 1,
  },
});