import { EventEmitter } from './EventEmitter';
import { webBridgeService } from './WebBridgeService';

let fastCGIHandlerInstance: any = null;

interface ProxyRequest {
  id: string;
  method: string;
  data: any;
  timestamp: number;
  fromExternal: boolean;
}

interface ProxyResponse {
  id: string;
  success: boolean;
  data?: any;
  error?: string;
  timestamp: number;
}

interface ExternalClient {
  id: string;
  connected: boolean;
  lastSeen: number;
  sendResponse: (response: any) => void;
}

export class WebViewProxyService extends EventEmitter {
  private webViewRef: any = null;
  private externalClients: Map<string, ExternalClient> = new Map();
  private pendingRequests: Map<string, ProxyRequest> = new Map();
  private stateSync: Map<string, any> = new Map();
  private isWebViewReady: boolean = false;

  constructor() {
    super();
    this.setupResponseHandler();
  }

  setFastCGIHandler(handler: any) {
    fastCGIHandlerInstance = handler;
  }

  setWebView(webView: any) {
    this.webViewRef = webView;
    this.isWebViewReady = true;

    this.processQueuedRequests();

    this.emit('webview_ready');
  }

  removeWebView() {
    this.webViewRef = null;
    this.isWebViewReady = false;
  }

  private setupResponseHandler() {
  }

  registerExternalClient(clientId: string, sendResponseFn: (response: any) => void): void {
    const client: ExternalClient = {
      id: clientId,
      connected: true,
      lastSeen: Date.now(),
      sendResponse: sendResponseFn
    };

    this.externalClients.set(clientId, client);

    this.emit('client_connected', { clientId });
  }

  unregisterExternalClient(clientId: string): void {
    this.externalClients.delete(clientId);

    this.emit('client_disconnected', { clientId });
  }

  // Handle request from external device
  async handleExternalRequest(clientId: string, request: any): Promise<any> {
    const proxyRequest: ProxyRequest = {
      id: `ext_${clientId}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      method: request.method,
      data: request.data,
      timestamp: Date.now(),
      fromExternal: true
    };

    console.log('webview_proxy_external_request', {
      clientId,
      requestId: proxyRequest.id,
      method: request.method
    });

    // Update client last seen
    const client = this.externalClients.get(clientId);
    if (client) {
      client.lastSeen = Date.now();
    }

    // Store the request for tracking
    this.pendingRequests.set(proxyRequest.id, proxyRequest);

    // If WebView is ready, forward immediately
    if (this.isWebViewReady && this.webViewRef) {
      return await this.forwardToWebView(proxyRequest);
    } else {
      // Queue the request for when WebView becomes available
      console.log('webview_proxy_webview_not_ready_queuing', proxyRequest.id);
      return new Promise((resolve) => {
        const checkReady = () => {
          if (this.isWebViewReady && this.webViewRef) {
            this.forwardToWebView(proxyRequest).then(resolve);
          } else {
            setTimeout(checkReady, 100);
          }
        };
        checkReady();
      });
    }
  }

  private async forwardToWebView(proxyRequest: ProxyRequest): Promise<any> {
    return new Promise((resolve, reject) => {
      const timeoutMs = 30000; // 30 second timeout

      console.log('webview_proxy_forwarding_to_webview', proxyRequest.id);

      // Set up timeout
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(proxyRequest.id);
        reject(new Error('Request timeout'));
      }, timeoutMs);

      // Store resolve function for when response comes back
      const originalRequest = this.pendingRequests.get(proxyRequest.id);
      if (originalRequest) {
        (originalRequest as any).resolve = resolve;
        (originalRequest as any).timeout = timeout;
      }

      // Create the bridge message format expected by WebBridgeService
      const bridgeMessage = {
        id: proxyRequest.id,
        method: proxyRequest.method,
        data: proxyRequest.data
      };

      // Inject JavaScript into WebView to handle the request
      const injectedScript = `
        (function() {
          console.log('webview_proxy_injected_handling_request', '${proxyRequest.id}');

          try {
            // Use the existing sendBridgeMessage function if available
            if (typeof window.sendBridgeMessage === 'function') {
              console.log('webview_proxy_using_existing_bridge_function');
              window.sendBridgeMessage('${proxyRequest.method}', ${JSON.stringify(proxyRequest.data)})
                .then(function(response) {
                  console.log('webview_proxy_bridge_response', response);
                  // Send response back to React Native for external client
                  window.ReactNativeWebView.postMessage(JSON.stringify({
                    id: '${proxyRequest.id}',
                    success: true,
                    data: response
                  }));
                })
                .catch(function(error) {
                  console.error('webview_proxy_bridge_error', error);
                  window.ReactNativeWebView.postMessage(JSON.stringify({
                    id: '${proxyRequest.id}',
                    success: false,
                    error: error.message || 'Bridge communication failed'
                  }));
                });
            } else {
              // Fallback to direct message posting
              console.log('webview_proxy_using_direct_message');
              var bridgeMessage = ${JSON.stringify(bridgeMessage)};
              window.ReactNativeWebView.postMessage(JSON.stringify(bridgeMessage));
            }

            console.log('webview_proxy_message_sent_to_rn', '${proxyRequest.id}');
          } catch (error) {
            console.error('webview_proxy_injection_error', error);
            window.ReactNativeWebView.postMessage(JSON.stringify({
              id: '${proxyRequest.id}',
              success: false,
              error: 'Injection error: ' + error.message
            }));
          }

          return true;
        })();
      `;

      this.webViewRef.injectJavaScript(injectedScript);
    });
  }

  private handleWebViewResponse(response: any): void {
    const requestId = response.id;
    const pendingRequest = this.pendingRequests.get(requestId);

    if (!pendingRequest) {
      console.log('webview_proxy_no_pending_request', requestId);
      return;
    }

    console.log('webview_proxy_handling_webview_response', {
      requestId,
      success: response.success
    });

    // Clear timeout
    if ((pendingRequest as any).timeout) {
      clearTimeout((pendingRequest as any).timeout);
    }

    // Resolve the promise if it exists
    if ((pendingRequest as any).resolve) {
      (pendingRequest as any).resolve(response);
    }

    // Clean up
    this.pendingRequests.delete(requestId);

    // If this was a state-changing operation, broadcast to all external clients
    if (this.isStateChangingOperation(pendingRequest.method)) {
      this.broadcastStateChange(response);
    }
  }

  private processQueuedRequests(): void {
    console.log('webview_proxy_processing_queued_requests', this.pendingRequests.size);

    // Process all pending requests now that WebView is ready
    for (const [requestId, request] of this.pendingRequests.entries()) {
      if (!request.fromExternal || (request as any).resolve) {
        continue; // Skip internal requests or already processed requests
      }

      console.log('webview_proxy_processing_queued_request', requestId);
      this.forwardToWebView(request);
    }
  }

  private isStateChangingOperation(method: string): boolean {
    const stateChangingMethods = [
      'sendMessage',
      'setModel',
      'clearHistory',
      'updateSettings',
      'startChat',
      'stopGeneration',
      'dom_update',
      'dom_interaction',
      'ui_interaction',
      'modal_state_change',
      'model_selector_change'
    ];
    return stateChangingMethods.includes(method);
  }

  private broadcastStateChange(stateUpdate: any): void {
    console.log('webview_proxy_broadcasting_state_change', {
      clients: this.externalClients.size,
      update: stateUpdate.method
    });

    // Send state update to all connected external clients (HTTP clients)
    for (const [clientId, client] of this.externalClients.entries()) {
      if (client.connected) {
        try {
          client.sendResponse({
            type: 'state_update',
            data: stateUpdate,
            timestamp: Date.now()
          });
        } catch (error) {
          console.error('webview_proxy_broadcast_error', clientId, error);
          this.unregisterExternalClient(clientId);
        }
      }
    }

    // Also broadcast via FastCGI handler for real-time updates
    try {
      if (fastCGIHandlerInstance) {
        fastCGIHandlerInstance.broadcastStateChange(stateUpdate);
        console.log('webview_proxy_fastcgi_broadcast_sent', stateUpdate.method);
      } else {
        console.warn('webview_proxy_fastcgi_handler_not_set');
      }
    } catch (error) {
      console.error('webview_proxy_fastcgi_broadcast_error', error);
    }
  }

  // Handle message from internal WebView (for bidirectional sync)
  async handleWebViewMessage(message: string): Promise<void> {
    try {
      const parsedMessage = JSON.parse(message);
      console.log('webview_proxy_internal_webview_message', parsedMessage);

      // Check if this is a response to a pending external request
      if (parsedMessage.id && this.pendingRequests.has(parsedMessage.id)) {
        console.log('webview_proxy_handling_external_request_response', parsedMessage.id);
        this.handleWebViewResponse(parsedMessage);
        return;
      }

      // Process through bridge service for internal messages
      const response = await webBridgeService.handleBridgeMessage(parsedMessage);

      // If this is a state-changing operation, broadcast to external clients
      if (this.isStateChangingOperation(parsedMessage.method)) {
        this.broadcastStateChange(response);
      }

      // Send response back to WebView
      if (this.webViewRef) {
        const responseScript = `
          window.dispatchEvent(new MessageEvent('message', {
            data: ${JSON.stringify(JSON.stringify(response))}
          }));
        `;
        this.webViewRef.injectJavaScript(responseScript);
      }
    } catch (error) {
      console.error('webview_proxy_message_error', error);
    }
  }

  // Get status of proxy service
  getStatus() {
    return {
      isWebViewReady: this.isWebViewReady,
      externalClients: this.externalClients.size,
      pendingRequests: this.pendingRequests.size,
      connectedClients: Array.from(this.externalClients.values()).filter(c => c.connected).length
    };
  }

  // Clean up disconnected clients
  cleanup(): void {
    const now = Date.now();
    const timeoutMs = 60000; // 1 minute timeout

    for (const [clientId, client] of this.externalClients.entries()) {
      if (now - client.lastSeen > timeoutMs) {
        console.log('webview_proxy_cleaning_up_stale_client', clientId);
        this.unregisterExternalClient(clientId);
      }
    }

    // Clear old pending requests
    for (const [requestId, request] of this.pendingRequests.entries()) {
      if (now - request.timestamp > timeoutMs) {
        console.log('webview_proxy_cleaning_up_stale_request', requestId);
        this.pendingRequests.delete(requestId);
      }
    }
  }
}

export const webViewProxyService = new WebViewProxyService();