import * as FileSystem from 'expo-file-system';
import Server from '@dr.pogodin/react-native-static-server';
import { modelDownloader } from './ModelDownloader';
import { llamaManager } from '../utils/LlamaManager';

class SimpleEventEmitter {
  private listeners: { [event: string]: Function[] } = {};

  on(event: string, listener: Function) {
    if (!this.listeners[event]) {
      this.listeners[event] = [];
    }
    this.listeners[event].push(listener);
  }

  off(event: string, listener: Function) {
    if (this.listeners[event]) {
      const index = this.listeners[event].indexOf(listener);
      if (index > -1) {
        this.listeners[event].splice(index, 1);
      }
    }
  }

  emit(event: string, ...args: any[]) {
    if (this.listeners[event]) {
      this.listeners[event].forEach(listener => listener(...args));
    }
  }

  removeAllListeners(event?: string) {
    if (event) {
      delete this.listeners[event];
    } else {
      this.listeners = {};
    }
  }
}

interface ServerInfo {
  isRunning: boolean;
  url: string;
  port: number;
  ipAddress: string;
}

interface ServerStatus {
  isRunning: boolean;
  url?: string;
  port: number;
  connections: number;
  startTime?: Date;
}

export class LocalServerService extends SimpleEventEmitter {
  private isRunning: boolean = false;
  private serverInfo: ServerInfo | null = null;
  private staticServer: Server | null = null;
  private serverDirectory: string | null = null;
  private startTime: Date | null = null;

  constructor() {
    super();
    this.setupModelChangeListener();
  }

  private setupModelChangeListener() {
  }

  private async updateWebContent(): Promise<void> {
    if (!this.serverDirectory) return;
    
    try {
      const updatedModelsJSON = await this.getStoredModelsJSON();
      const serverDirURI = `file://${this.serverDirectory}`;
      
      const htmlContent = await this.generateModelsHTMLContent();
      
      await FileSystem.writeAsStringAsync(`${serverDirURI}/index.html`, htmlContent);
      await FileSystem.writeAsStringAsync(`${serverDirURI}/models.json`, updatedModelsJSON);
    } catch {
    }
  }

  private async generateModelsHTMLContent(): Promise<string> {
    try {
      const storedModels = await modelDownloader.getStoredModels();
      
      if (!storedModels || storedModels.length === 0) {
        return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Inferra Models</title>
</head>
<body>
<h1>INFERRA MODELS</h1>
<p>No models found</p>
</body>
</html>`;
      }
      
      let modelsList = '';
      storedModels.forEach((model, index) => {
        const sizeInMB = Math.round(model.size / (1024 * 1024));
        const modelType = model.modelType || 'LLM';
        const capabilities = model.capabilities ? model.capabilities.join(', ') : 'text';
        
        modelsList += `<div>
<h3>${index + 1}. ${model.name}</h3>
<p>Size: ${sizeInMB}MB</p>
<p>Type: ${modelType}</p>
<p>Capabilities: ${capabilities}</p>
<p>Path: ${model.path}</p>`;

        if (model.isExternal) {
          modelsList += `<p>External: Yes</p>`;
        }
        
        if (model.modified) {
          const modifiedDate = new Date(model.modified).toLocaleDateString();
          modelsList += `<p>Modified: ${modifiedDate}</p>`;
        }
        
        modelsList += `<button onclick="initializeModel('${model.path.replace(/'/g, "\\'")}')">Initialize Model</button>
</div><br>`;
      });
      
      return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Inferra Models</title>
</head>
<body>
<h1>INFERRA MODELS</h1>
${modelsList}
<div id="status"></div>

<script>
window.ReactNativeWebView = window.ReactNativeWebView || {};

function initializeModel(modelPath) {
  const statusDiv = document.getElementById('status');
  statusDiv.innerHTML = 'Initializing model: ' + modelPath;
  
  try {
    if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
      window.ReactNativeWebView.postMessage(JSON.stringify({
        action: 'initializeModel',
        modelPath: modelPath
      }));
    } else {
      statusDiv.innerHTML = 'Error: Cannot communicate with app';
    }
  } catch (error) {
    statusDiv.innerHTML = 'Error: ' + error.message;
  }
}

window.addEventListener('message', function(event) {
  const statusDiv = document.getElementById('status');
  try {
    const data = JSON.parse(event.data);
    if (data.type === 'modelInitialized') {
      statusDiv.innerHTML = 'Model initialized successfully: ' + data.modelPath;
    } else if (data.type === 'modelInitializationError') {
      statusDiv.innerHTML = 'Error initializing model: ' + data.error;
    }
  } catch (error) {
    statusDiv.innerHTML = 'Message received: ' + event.data;
  }
});
</script>
</body>
</html>`;
    } catch {
      return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Inferra Models</title>
</head>
<body>
<h1>INFERRA MODELS</h1>
<p>Error loading models</p>
</body>
</html>`;
    }
  }

  private async getStoredModelsJSON(): Promise<string> {
    try {
      const storedModels = await modelDownloader.getStoredModels();
      return JSON.stringify(storedModels, null, 2);
    } catch (error) {
      return JSON.stringify({ error: 'Failed to fetch models', details: error instanceof Error ? error.message : 'Unknown error' }, null, 2);
    }
  }
  async start(port?: number): Promise<{ success: boolean; url?: string; error?: string }> {
    if (this.isRunning) {
      return { success: false, error: 'Server is already running' };
    }

    try {
      await this.createWebContent();

      if (!this.serverDirectory) {
        throw new Error('Server directory not created');
      }

      this.staticServer = new Server({
        fileDir: this.serverDirectory,
        port: port || 0,
        nonLocal: true,
        stopInBackground: false,
      });

      const origin = await this.staticServer.start();
      const actualIP = this.extractIPFromURL(origin) || 'localhost';
      const actualPort = this.extractPortFromURL(origin) || 8080;

      this.serverInfo = {
        isRunning: true,
        url: origin,
        port: actualPort,
        ipAddress: actualIP,
      };

      this.isRunning = true;
      this.startTime = new Date();

      this.emit('serverStarted', {
        url: origin,
        port: actualPort,
        ipAddress: actualIP,
        isRunning: true
      });

      return { success: true, url: origin };
    } catch (error) {
      return {
        success: false,
        error: `Failed to start server: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  async stop(): Promise<{ success: boolean; error?: string }> {
    if (!this.isRunning) {
      return { success: false, error: 'Server is not running' };
    }

    try {
      if (this.staticServer) {
        await this.staticServer.stop();
        this.staticServer = null;
      }

      await this.cleanupServerFiles();

      this.isRunning = false;
      this.startTime = null;
      this.serverInfo = null;
      this.serverDirectory = null;

      this.emit('serverStopped');

      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: `Failed to stop server: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  private async createWebContent(): Promise<void> {
    try {
      const cacheDir = FileSystem.cacheDirectory;
      if (!cacheDir) {
        throw new Error('Cache directory not available');
      }

      const serverDirName = 'web_server';
      const serverDirURI = `${cacheDir}${serverDirName}`;
      const serverDirLocal = cacheDir.replace('file://', '') + serverDirName;

      const dirInfo = await FileSystem.getInfoAsync(serverDirURI);
      if (!dirInfo.exists) {
        await FileSystem.makeDirectoryAsync(serverDirURI, { intermediates: true });
      }

      const modelsJSON = await this.getStoredModelsJSON();
      const htmlContent = await this.generateModelsHTMLContent();

      await FileSystem.writeAsStringAsync(`${serverDirURI}/index.html`, htmlContent);
      await FileSystem.writeAsStringAsync(`${serverDirURI}/models.json`, modelsJSON);
      
      this.serverDirectory = serverDirLocal;
    } catch (error) {
      throw new Error(`Failed to create web content: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private async cleanupServerFiles(): Promise<void> {
    try {
      if (this.serverDirectory) {
        const serverDirURI = `file://${this.serverDirectory}`;
        const dirInfo = await FileSystem.getInfoAsync(serverDirURI);
        if (dirInfo.exists) {
          await FileSystem.deleteAsync(serverDirURI, { idempotent: true });
        }
      }
    } catch {
    }
  }

  private extractIPFromURL(url: string): string | null {
    try {
      const match = url.match(/http:\/\/([0-9.]+):[0-9]+/);
      return match ? match[1] : null;
    } catch {
      return null;
    }
  }

  private extractPortFromURL(url: string): number | null {
    try {
      const match = url.match(/http:\/\/[0-9.]+:([0-9]+)/);
      return match ? parseInt(match[1], 10) : null;
    } catch (error) {
      return null;
    }
  }

  getStatus(): ServerStatus {
    return {
      isRunning: this.isRunning,
      url: this.serverInfo?.url,
      port: this.serverInfo?.port || 0,
      connections: 0,
      startTime: this.startTime || undefined
    };
  }

  isServerRunning(): boolean {
    return this.isRunning;
  }

  getServerURL(): string | null {
    return this.serverInfo?.url || null;
  }

  getServerContent(): string | null {
    return this.isRunning && this.serverInfo ? `Models Server running at ${this.serverInfo.url}` : null;
  }

  async refreshModels(): Promise<void> {
    if (this.isRunning) {
      await this.updateWebContent();
    }
  }

  async handleModelInitialization(modelPath: string): Promise<{ success: boolean; error?: string }> {
    try {
      const success = await llamaManager.loadModel(modelPath);
      if (success) {
        this.emit('modelInitialized', { modelPath });
        return { success: true };
      } else {
        const error = 'Failed to initialize model';
        this.emit('modelInitializationError', { error, modelPath });
        return { success: false, error };
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.emit('modelInitializationError', { error: errorMessage, modelPath });
      return { success: false, error: errorMessage };
    }
  }
}

export const localServer = new LocalServerService();