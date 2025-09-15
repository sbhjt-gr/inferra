import { EventEmitter } from './EventEmitter';
import { webBridgeService } from './WebBridgeService';
import { webViewProxyService } from './WebViewProxyService';

interface SyncClient {
  id: string;
  isConnected: boolean;
  lastPing: number;
  pendingMessages: any[];
}

interface FastCGIRequest {
  id: string;
  method: string;
  path: string;
  headers: Record<string, string>;
  body: string;
  query: Record<string, string>;
}

interface FastCGIResponse {
  status: number;
  headers: Record<string, string>;
  body: string;
}

export class FastCGIHandler extends EventEmitter {
  private server: any = null;
  private port: number = 0;
  private isRunning: boolean = false;
  private startTime: number = 0;

  private syncClients: Map<string, SyncClient> = new Map();
  private broadcastMessages: any[] = [];

  async start(port: number = 9000): Promise<{ success: boolean; port?: number; error?: string }> {
    if (this.isRunning) {
      return { success: false, error: 'FastCGI handler already running' };
    }

    try {
      this.port = port;
      console.log('fastcgi_starting_http_server_debug', { port: this.port });

      if (typeof global.base64FromArrayBuffer === 'undefined') {
        console.log('fastcgi_adding_base64_polyfill');
        global.base64FromArrayBuffer = function(arrayBuffer: ArrayBuffer) {
          const uint8Array = new Uint8Array(arrayBuffer);
          let binaryString = '';
          for (let i = 0; i < uint8Array.length; i++) {
            binaryString += String.fromCharCode(uint8Array[i]);
          }
          return btoa(binaryString);
        };
      }

      if (typeof global.arrayBufferFromBase64 === 'undefined') {
        console.log('fastcgi_adding_array_buffer_polyfill');
        global.arrayBufferFromBase64 = function(base64: string) {
          const binaryString = atob(base64);
          const uint8Array = new Uint8Array(binaryString.length);
          for (let i = 0; i < binaryString.length; i++) {
            uint8Array[i] = binaryString.charCodeAt(i);
          }
          return uint8Array.buffer;
        };
      }

      if (typeof global.Buffer === 'undefined') {
        console.log('fastcgi_adding_buffer_polyfill');
        try {
          const { Buffer } = require('@craftzdog/react-native-buffer');
          global.Buffer = Buffer;
        } catch (bufferError) {
          console.error('fastcgi_buffer_polyfill_failed', bufferError);
        }
      }

      if (typeof global.btoa === 'undefined') {
        console.log('fastcgi_adding_btoa_polyfill');
        global.btoa = function(str: string) {
          return Buffer.from(str, 'binary').toString('base64');
        };
      }

      if (typeof global.atob === 'undefined') {
        console.log('fastcgi_adding_atob_polyfill');
        global.atob = function(str: string) {
          return Buffer.from(str, 'base64').toString('binary');
        };
      }

      let http: any;
      try {
        console.log('fastcgi_importing_http_module');

        try {
          http = require('@iwater/react-native-http-server');
          console.log('fastcgi_direct_require_result', {
            type: typeof http,
            createServer: typeof http?.createServer,
            keys: Object.keys(http || {}),
            default: http?.default
          });
        } catch (directError) {
          console.log('fastcgi_direct_require_failed', directError.message);
        }

        if (!http?.createServer && http?.default) {
          console.log('fastcgi_trying_default_export');
          http = http.default;
        }

        if (!http?.createServer) {
          console.log('fastcgi_trying_alternative_imports');
          try {
            const httpModule = require('@iwater/react-native-http-server');
            console.log('fastcgi_alternative_import', {
              module: httpModule,
              createServer: httpModule?.createServer,
              Server: httpModule?.Server
            });
            if (httpModule?.createServer) {
              http = httpModule;
            } else if (httpModule?.default?.createServer) {
              http = httpModule.default;
            }
          } catch (altError) {
            console.error('fastcgi_alternative_import_failed', altError);
          }
        }

        console.log('fastcgi_final_http_module', {
          type: typeof http,
          createServer: typeof http?.createServer,
          keys: Object.keys(http || {}),
          http: http
        });
      } catch (importError) {
        console.error('fastcgi_http_import_error', importError);
        throw new Error(`Failed to import HTTP module: ${importError.message}`);
      }

      if (!http || typeof http.createServer !== 'function') {
        console.error('fastcgi_http_createserver_not_function', {
          http: http,
          createServer: http?.createServer,
          type: typeof http?.createServer
        });
        throw new Error(`http.createServer is not a function (http: ${typeof http}, createServer: ${typeof http?.createServer})`);
      }

      console.log('fastcgi_creating_server');
      const server = http.createServer((req: any, res: any) => {
        console.log('fastcgi_http_request', req.method, req.url, req.headers.host);

        const clientId = `${req.socket.remoteAddress}_${req.headers['user-agent']?.substring(0, 50) || 'unknown'}_${Date.now()}`;

        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

        if (req.method === 'OPTIONS') {
          res.writeHead(200);
          res.end();
          return;
        }

        let body = '';
        req.on('data', (chunk: any) => {
          body += chunk.toString();
        });

        req.on('end', async () => {
          try {
            if (req.url === '/test') {
              console.log('fastcgi_serving_test_endpoint');
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ status: 'ok', message: 'FastCGI handler is running', timestamp: Date.now() }));
            } else if (req.url === '/sync/connect' && req.method === 'POST') {
              console.log('fastcgi_sync_connect_request');
              this.handleSyncConnect(res);
            } else if (req.url.startsWith('/sync/poll/') && req.method === 'GET') {
              const clientId = req.url.split('/')[3];
              console.log('fastcgi_sync_poll_request', clientId);
              this.handleSyncPoll(clientId, res);
            } else if (req.url.startsWith('/sync/send/') && req.method === 'POST') {
              const clientId = req.url.split('/')[3];
              console.log('fastcgi_sync_send_request', clientId);
              this.handleSyncSend(clientId, body, res);
            } else if (req.url === '/message' && req.method === 'POST') {
              console.log('fastcgi_handling_message_endpoint_via_proxy', {
                clientId,
                bodyLength: body.length,
                body: body.substring(0, 200)
              });

              const requestData = JSON.parse(body);
              console.log('fastcgi_proxying_to_webview', requestData.method, requestData.id);

              webViewProxyService.registerExternalClient(clientId, (proxyResponse) => {
                console.log('fastcgi_proxy_update_received', proxyResponse.type);
              });

              try {
                const response = await webViewProxyService.handleExternalRequest(clientId, requestData);

                console.log('fastcgi_proxy_response', {
                  success: response.success,
                  hasData: !!response.data
                });

                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(response));
              } catch (proxyError) {
                console.error('fastcgi_proxy_error', proxyError);
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                  id: requestData.id,
                  success: false,
                  error: 'WebView proxy error: ' + (proxyError instanceof Error ? proxyError.message : 'Unknown error')
                }));
              } finally {
                webViewProxyService.unregisterExternalClient(clientId);
              }
            } else if (req.url === '/status') {
              const proxyStatus = webViewProxyService.getStatus();
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({
                status: 'running',
                port: this.port,
                uptime: Date.now() - this.startTime,
                proxy: proxyStatus
              }));
            } else {
              res.writeHead(404, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: 'Not found' }));
            }
          } catch (error) {
            console.error('fastcgi_request_error', error);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Internal server error' }));
          }
        });
      });

      await new Promise<void>((resolve, reject) => {
        server.listen({ port: this.port, host: '0.0.0.0' }, () => {
          console.log('fastcgi_http_server_listening', `0.0.0.0:${this.port}`);
          resolve();
        });
        server.on('error', reject);
      });

      this.server = server;
      this.isRunning = true;
      this.startTime = Date.now();

      console.log('fastcgi_handler_started', `port:${this.port}`);

      this.emit('started', { port: this.port });
      return { success: true, port: this.port };
    } catch (error) {
      this.isRunning = false;
      return {
        success: false,
        error: `Failed to start FastCGI handler: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  async stop(): Promise<{ success: boolean; error?: string }> {
    if (!this.isRunning) {
      return { success: false, error: 'FastCGI handler not running' };
    }

    try {
      if (this.server) {
        this.server.close();
        this.server = null;
      }

      this.isRunning = false;
      this.port = 0;
      this.startTime = 0;

      console.log('fastcgi_handler_stopped');
      this.emit('stopped');
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: `Failed to stop FastCGI handler: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  async handleRequest(requestData: any): Promise<FastCGIResponse> {
    try {
      const request = this.parseFastCGIRequest(requestData);
      console.log('fastcgi_request', request.method, request.path);

      if (request.path.startsWith('/api/') || request.path === '/message' || request.path === '/test' || request.path === '/status') {
        return await this.handleAPIRequest(request);
      }

      return {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Not found' })
      };
    } catch (error) {
      console.error('fastcgi_request_error', error);
      return {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Internal server error' })
      };
    }
  }

  private parseFastCGIRequest(data: any): FastCGIRequest {
    const method = data.REQUEST_METHOD || 'GET';
    const path = data.REQUEST_URI || '/';
    const queryString = data.QUERY_STRING || '';
    const contentLength = parseInt(data.CONTENT_LENGTH || '0', 10);

    const headers: Record<string, string> = {};
    Object.keys(data).forEach(key => {
      if (key.startsWith('HTTP_')) {
        const headerName = key.substring(5).toLowerCase().replace(/_/g, '-');
        headers[headerName] = data[key];
      }
    });

    const query: Record<string, string> = {};
    if (queryString) {
      queryString.split('&').forEach(pair => {
        const [key, value] = pair.split('=');
        if (key && value) {
          query[decodeURIComponent(key)] = decodeURIComponent(value);
        }
      });
    }

    return {
      id: `fcgi_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      method,
      path,
      headers,
      body: data.CONTENT || '',
      query
    };
  }

  private async handleAPIRequest(request: FastCGIRequest): Promise<FastCGIResponse> {
    const pathParts = request.path.split('/').filter(Boolean);
    console.log('fastcgi_api_request_pathparts', { path: request.path, pathParts });

    if (pathParts.length === 0) {
      return {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Invalid API endpoint' })
      };
    }

    let endpoint: string;
    if (pathParts[0] === 'api' && pathParts.length >= 2) {
      endpoint = pathParts[1];
    } else {
      endpoint = pathParts[0];
    }

    console.log('fastcgi_api_endpoint', endpoint);

    switch (endpoint) {
      case 'test':
        return await this.handleTestEndpoint(request);

      case 'message':
        return await this.handleMessageEndpoint(request);

      case 'status':
        return await this.handleStatusEndpoint(request);

      default:
        return {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ error: `Unknown endpoint: ${endpoint}` })
        };
    }
  }

  private async handleTestEndpoint(request: FastCGIRequest): Promise<FastCGIResponse> {
    return {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type'
      },
      body: JSON.stringify({
        status: 'ok',
        message: 'FastCGI API is working',
        timestamp: new Date().toISOString()
      })
    };
  }

  private async handleMessageEndpoint(request: FastCGIRequest): Promise<FastCGIResponse> {
    if (request.method === 'OPTIONS') {
      return {
        status: 200,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type'
        },
        body: ''
      };
    }

    if (request.method !== 'POST') {
      return {
        status: 405,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Method not allowed' })
      };
    }

    try {
      const messageData = JSON.parse(request.body);
      console.log('fastcgi_proxy_message', messageData.method, messageData.id);

      const clientId = `fcgi_${request.id}_${Date.now()}`;

      const response = await webViewProxyService.handleExternalRequest(clientId, messageData);

      return {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type'
        },
        body: JSON.stringify(response)
      };
    } catch (error) {
      console.error('fastcgi_proxy_message_error', error);
      return {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          error: 'WebView proxy error',
          details: error instanceof Error ? error.message : 'Unknown error'
        })
      };
    }
  }

  private async handleStatusEndpoint(request: FastCGIRequest): Promise<FastCGIResponse> {
    const status = {
      fastcgi: {
        running: this.isRunning,
        port: this.port
      },
      api: 'available',
      timestamp: new Date().toISOString()
    };

    return {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type'
      },
      body: JSON.stringify(status)
    };
  }

  // Sync functionality methods
  private handleSyncConnect(res: any): void {
    const clientId = `sync_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const client: SyncClient = {
      id: clientId,
      isConnected: true,
      lastPing: Date.now(),
      pendingMessages: []
    };

    this.syncClients.set(clientId, client);
    console.log('fastcgi_sync_client_connected', { clientId, clients: this.syncClients.size });

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      success: true,
      clientId,
      message: 'Connected to sync server'
    }));
  }

  private handleSyncPoll(clientId: string, res: any): void {
    const client = this.syncClients.get(clientId);
    if (!client) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Client not found' }));
      return;
    }

    client.lastPing = Date.now();

    const messages = [...client.pendingMessages, ...this.broadcastMessages];
    client.pendingMessages = [];

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      messages,
      timestamp: Date.now()
    }));
  }

  private async handleSyncSend(clientId: string, body: string, res: any): Promise<void> {
    const client = this.syncClients.get(clientId);
    if (!client) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Client not found' }));
      return;
    }

    try {
      const message = JSON.parse(body);
      console.log('fastcgi_sync_message_from_client', { clientId, type: message.type });

      if (message.type === 'dom_interaction') {
        await webViewProxyService.handleExternalRequest(clientId, {
          method: 'dom_interaction',
          data: message.data
        });
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true }));
    } catch (error) {
      console.error('fastcgi_sync_message_parse_error', error);
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Invalid message format' }));
    }
  }

  broadcastStateChange(stateData: any): void {
    if (this.syncClients.size === 0) {
      return;
    }

    console.log('fastcgi_broadcasting_state_change', {
      clients: this.syncClients.size,
      type: stateData.type
    });

    const message = {
      type: 'state_update',
      timestamp: Date.now(),
      data: stateData
    };

    // Add to broadcast messages array for polling clients
    this.broadcastMessages.push(message);

    // Keep only the last 50 broadcast messages to prevent memory issues
    if (this.broadcastMessages.length > 50) {
      this.broadcastMessages = this.broadcastMessages.slice(-50);
    }
  }

  // Clean up disconnected sync clients
  cleanupSyncClients(): void {
    const now = Date.now();
    const timeoutMs = 60000; // 1 minute timeout

    for (const [clientId, client] of this.syncClients.entries()) {
      if (now - client.lastPing > timeoutMs) {
        console.log('fastcgi_cleaning_up_stale_sync_client', clientId);
        this.syncClients.delete(clientId);
      }
    }
  }

  getStatus() {
    return {
      isRunning: this.isRunning,
      port: this.port,
      syncClients: this.syncClients.size
    };
  }
}

export const fastCGIHandler = new FastCGIHandler();