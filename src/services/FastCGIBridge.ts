import * as FileSystem from 'expo-file-system';
import { Platform } from 'react-native';
import { fastCGIHandler } from './FastCGIHandler';

interface FastCGIConfig {
  socketPath?: string;
  host?: string;
  port?: number;
  requestTimeout?: number;
}

export class FastCGIBridge {
  private config: FastCGIConfig;
  private isRunning: boolean = false;
  private requestQueue: Map<string, any> = new Map();
  private socketPath: string = '';
  private pollInterval: NodeJS.Timeout | null = null;

  constructor(config: FastCGIConfig = {}) {
    this.config = {
      host: '127.0.0.1',
      port: 9000,
      requestTimeout: 30000,
      ...config
    };
  }

  async start(): Promise<{ success: boolean; error?: string }> {
    if (this.isRunning) {
      return { success: false, error: 'FastCGI bridge already running' };
    }

    try {
      console.log('fastcgi_bridge_starting');

      await this.setupBridge();
      console.log('fastcgi_bridge_setup_complete');

      await this.startRequestProcessor();
      console.log('fastcgi_bridge_processor_started');

      this.isRunning = true;
      console.log('fastcgi_bridge_started');

      return { success: true };
    } catch (error) {
      console.error('fastcgi_bridge_start_error', error);
      return {
        success: false,
        error: `Failed to start FastCGI bridge: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  async stop(): Promise<{ success: boolean; error?: string }> {
    if (!this.isRunning) {
      return { success: false, error: 'FastCGI bridge not running' };
    }

    try {
      if (this.pollInterval) {
        clearInterval(this.pollInterval);
        this.pollInterval = null;
      }

      await this.cleanup();

      this.isRunning = false;
      console.log('fastcgi_bridge_stopped');

      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: `Failed to stop FastCGI bridge: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  private async setupBridge(): Promise<void> {
    const cacheDir = FileSystem.cacheDirectory;
    if (!cacheDir) {
      throw new Error('Cache directory not available');
    }

    console.log('fastcgi_bridge_setup_start', { cacheDir });

    const bridgeDir = `${cacheDir}fastcgi_bridge/`;
    const bridgeDirInfo = await FileSystem.getInfoAsync(bridgeDir);

    console.log('fastcgi_bridge_dir_check', { bridgeDir, exists: bridgeDirInfo.exists });

    if (!bridgeDirInfo.exists) {
      await FileSystem.makeDirectoryAsync(bridgeDir, { intermediates: true });
      console.log('fastcgi_bridge_dir_created');
    }

    this.socketPath = `${bridgeDir}socket`;

    await this.createFastCGIScript();
    console.log('fastcgi_bridge_setup_complete', this.socketPath);
  }

  private async createFastCGIScript(): Promise<void> {
    const cacheDir = FileSystem.cacheDirectory;
    if (!cacheDir) {
      throw new Error('Cache directory not available');
    }

    const scriptContent = `#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const BRIDGE_DIR = '${cacheDir}fastcgi_bridge/';
const REQUEST_FILE = path.join(BRIDGE_DIR, 'request.json');
const RESPONSE_FILE = path.join(BRIDGE_DIR, 'response.json');

function writeFastCGIResponse(status, headers, body) {
  process.stdout.write('Status: ' + status + '\\r\\n');

  Object.keys(headers).forEach(key => {
    process.stdout.write(key + ': ' + headers[key] + '\\r\\n');
  });

  process.stdout.write('\\r\\n');
  process.stdout.write(body);
  process.exit(0);
}

async function handleFastCGIRequest() {
  try {
    const env = process.env;
    const method = env.REQUEST_METHOD || 'GET';
    const uri = env.REQUEST_URI || '/';
    const contentLength = parseInt(env.CONTENT_LENGTH || '0', 10);

    let body = '';
    if (contentLength > 0 && method === 'POST') {
      const chunks = [];
      process.stdin.on('data', chunk => chunks.push(chunk));

      await new Promise(resolve => {
        process.stdin.on('end', () => {
          body = Buffer.concat(chunks).toString('utf8');
          resolve();
        });
      });
    }

    if (uri.startsWith('/api/')) {
      const requestData = {
        REQUEST_METHOD: method,
        REQUEST_URI: uri,
        QUERY_STRING: env.QUERY_STRING || '',
        CONTENT_LENGTH: contentLength.toString(),
        CONTENT: body,
        TIMESTAMP: Date.now(),
        HTTP_CONTENT_TYPE: env.CONTENT_TYPE || env.HTTP_CONTENT_TYPE || 'application/json'
      };

      Object.keys(env).forEach(key => {
        if (key.startsWith('HTTP_')) {
          requestData[key] = env[key];
        }
      });

      fs.writeFileSync(REQUEST_FILE, JSON.stringify(requestData), 'utf8');

      let responseData = null;
      let attempts = 0;
      const maxAttempts = 200;

      while (attempts < maxAttempts && !responseData) {
        if (fs.existsSync(RESPONSE_FILE)) {
          try {
            const responseContent = fs.readFileSync(RESPONSE_FILE, 'utf8');
            responseData = JSON.parse(responseContent);
            fs.unlinkSync(RESPONSE_FILE);
            break;
          } catch (e) {
            // Response file might be being written
          }
        }

        await new Promise(resolve => setTimeout(resolve, 50));
        attempts++;
      }

      if (!responseData) {
        writeFastCGIResponse(500, {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }, JSON.stringify({ error: 'Request timeout' }));
        return;
      }

      const headers = responseData.headers || {};
      const status = responseData.status || 200;
      const responseBody = responseData.body || '';

      writeFastCGIResponse(status, headers, responseBody);
    } else {
      // Not an API request, return 404
      writeFastCGIResponse(404, {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }, JSON.stringify({ error: 'Not found' }));
    }
  } catch (error) {
    writeFastCGIResponse(500, {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*'
    }, JSON.stringify({
      error: 'Internal server error',
      details: error.message
    }));
  }
}

handleFastCGIRequest().catch(error => {
  writeFastCGIResponse(500, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*'
  }, JSON.stringify({
    error: 'Script error',
    details: error.message
  }));
});
`;

    const scriptPath = `${cacheDir}fastcgi_bridge/api_handler`;
    await FileSystem.writeAsStringAsync(scriptPath, scriptContent);

    console.log('fastcgi_script_created', scriptPath);
  }

  private async startRequestProcessor(): Promise<void> {
    const cacheDir = FileSystem.cacheDirectory;
    if (!cacheDir) {
      throw new Error('Cache directory not available');
    }

    const requestFile = `${cacheDir}fastcgi_bridge/request.json`;
    const responseFile = `${cacheDir}fastcgi_bridge/response.json`;

    this.pollInterval = setInterval(async () => {
      try {
        const requestInfo = await FileSystem.getInfoAsync(requestFile);
        if (requestInfo.exists) {
          const requestContent = await FileSystem.readAsStringAsync(requestFile);
          const requestData = JSON.parse(requestContent);

          await FileSystem.deleteAsync(requestFile, { idempotent: true });

          const response = await fastCGIHandler.handleRequest(requestData);

          await FileSystem.writeAsStringAsync(responseFile, JSON.stringify(response));

          console.log('fastcgi_request_processed', requestData.REQUEST_METHOD, requestData.REQUEST_URI);
        }
      } catch (error) {
        console.error('fastcgi_processor_error', error);
      }
    }, 25);

    console.log('fastcgi_request_processor_started');
  }

  private async cleanup(): Promise<void> {
    try {
      const cacheDir = FileSystem.cacheDirectory;
      if (cacheDir) {
        const bridgeDir = `${cacheDir}fastcgi_bridge/`;
        const bridgeDirInfo = await FileSystem.getInfoAsync(bridgeDir);
        if (bridgeDirInfo.exists) {
          await FileSystem.deleteAsync(bridgeDir, { idempotent: true });
        }
      }
    } catch (error) {
      console.warn('fastcgi_cleanup_error', error);
    }
  }

  getConfig(): FastCGIConfig {
    return { ...this.config };
  }

  getStatus() {
    return {
      isRunning: this.isRunning,
      socketPath: this.socketPath,
      config: this.config
    };
  }

  getScriptPath(): string {
    const cacheDir = FileSystem.cacheDirectory;
    if (!cacheDir) return '';

    const localPath = cacheDir.replace('file://', '');
    return `${localPath}fastcgi_bridge/api_handler`;
  }
}

export const fastCGIBridge = new FastCGIBridge();