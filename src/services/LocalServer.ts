import * as FileSystem from 'expo-file-system';
import Server from '@dr.pogodin/react-native-static-server';
import { modelDownloader } from './ModelDownloader';
import { llamaManager } from '../utils/LlamaManager';
import { logger } from '../utils/logger';

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
      
      const htmlContent = await this.generateChatHTMLContent();
      
      await FileSystem.writeAsStringAsync(`${serverDirURI}/index.html`, htmlContent);
      await FileSystem.writeAsStringAsync(`${serverDirURI}/models.json`, updatedModelsJSON);
    } catch {
    }
  }

  private async generateChatHTMLContent(): Promise<string> {
    try {
      const storedModels = await modelDownloader.getStoredModels();
      
      let modelsOptions = '';
      if (storedModels && storedModels.length > 0) {
        modelsOptions = storedModels.map(model => 
          `<option value="${model.path.replace(/"/g, '&quot;')}">${model.name}</option>`
        ).join('');
      }
      
      return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Inferra Chat</title>
</head>
<body>
<h1>Inferra AI Chat</h1>

<div>
<label for="modelSelect">Select Model:</label>
<select id="modelSelect">
<option value="">Choose a model...</option>
${modelsOptions}
</select>
<button onclick="loadSelectedModel()">Initialize Model</button>
</div>

<div id="status">No model loaded</div>

<div id="chatContainer">
<div id="messages"></div>
<div>
<input type="text" id="messageInput" placeholder="Type your message..." disabled>
<button id="sendButton" onclick="sendMessage()" disabled>Send</button>
<button id="stopButton" onclick="stopGeneration()" disabled>Stop</button>
</div>
</div>

<script>
let currentModel = null;
let isGenerating = false;
let currentResponse = '';
let pendingCommands = new Map();
let pollingInterval;

async function submitCommand(command) {
  try {
    const response = await fetch('/api_commands.json');
    let commandsData = { commands: [], timestamp: Date.now() };

    if (response.ok) {
      commandsData = await response.json();
    }

    commandsData.commands.push(command);
    commandsData.timestamp = Date.now();

    console.log('[DEBUG] Submitting command to server');
    return true;
  } catch (error) {
    console.log('[DEBUG] Error submitting command:', error);
    return false;
  }
}

window.ReactNativeWebView = window.ReactNativeWebView || {};

function updateStatus(message) {
  document.getElementById('status').innerHTML = message;
}

function addMessage(role, content) {
  const messagesDiv = document.getElementById('messages');
  const messageDiv = document.createElement('div');
  messageDiv.innerHTML = '<strong>' + role + ':</strong> ' + content;
  messagesDiv.appendChild(messageDiv);
  messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

async function loadSelectedModel() {
  const select = document.getElementById('modelSelect');
  const modelPath = select.value;

  console.log('[DEBUG] loadSelectedModel called');
  console.log('[DEBUG] Selected model path:', modelPath);

  if (!modelPath) {
    console.log('[DEBUG] No model path selected');
    alert('Please select a model first');
    return;
  }

  const modelName = select.options[select.selectedIndex].text;
  console.log('[DEBUG] Selected model name:', modelName);
  updateStatus('Initializing model: ' + modelName + ' - Please wait...');

  document.getElementById('messageInput').disabled = true;
  document.getElementById('sendButton').disabled = true;
  document.getElementById('messageInput').placeholder = 'Model loading...';

  try {
    const commandId = 'init_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    const command = {
      id: commandId,
      command: 'initialize_model',
      data: { modelPath: modelPath },
      timestamp: Date.now()
    };

    console.log('[DEBUG] Sending command via file API:', JSON.stringify(command));
    await submitCommand(command);

    pendingCommands.set(commandId, {
      type: 'initialize_model',
      modelPath: modelPath,
      timestamp: Date.now()
    });

    updateStatus('Command sent - waiting for model initialization...');
  } catch (error) {
    console.log('[DEBUG] Error in loadSelectedModel:', error);
    updateStatus('Error submitting command: ' + error.message);
  }
}

async function sendMessage() {
  const input = document.getElementById('messageInput');
  const message = input.value.trim();

  if (!message || isGenerating) return;
  if (!currentModel) {
    alert('Please load a model first');
    return;
  }

  addMessage('User', message);
  input.value = '';
  input.disabled = true;
  document.getElementById('sendButton').disabled = true;
  document.getElementById('stopButton').disabled = false;

  isGenerating = true;
  currentResponse = '';

  const assistantDiv = document.createElement('div');
  assistantDiv.innerHTML = '<strong>Assistant:</strong> <span id="currentResponse">Generating...</span>';
  document.getElementById('messages').appendChild(assistantDiv);

  try {
    const commandId = 'cmd_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);

    const command = {
      id: commandId,
      type: 'send_message',
      message: message,
      timestamp: Date.now()
    };

    console.log('[DEBUG] Submitting chat command:', JSON.stringify(command));
    await submitCommand(command);

    pendingCommands.set(commandId, {
      type: 'send_message',
      message: message,
      timestamp: Date.now()
    });

    updateStatus('Message sent - waiting for response...');
  } catch (error) {
    console.log('[DEBUG] Error in sendMessage:', error);
    updateStatus('Error submitting message: ' + error.message);
    resetChatInput();
  }
}

async function stopGeneration() {
  if (!isGenerating) return;

  try {
    const commandId = 'cmd_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);

    const command = {
      id: commandId,
      type: 'stop_generation',
      timestamp: Date.now()
    };

    console.log('[DEBUG] Submitting stop command:', JSON.stringify(command));
    await submitCommand(command);

    pendingCommands.set(commandId, {
      type: 'stop_generation',
      timestamp: Date.now()
    });

    updateStatus('Stopping generation...');
  } catch (error) {
    console.log('[DEBUG] Error in stopGeneration:', error);
    updateStatus('Error submitting stop command: ' + error.message);
  }

  resetChatInput();
}

function resetChatInput() {
  document.getElementById('messageInput').disabled = false;
  document.getElementById('sendButton').disabled = false;
  document.getElementById('stopButton').disabled = true;
  isGenerating = false;
}


document.getElementById('messageInput').addEventListener('keypress', function(event) {
  if (event.key === 'Enter') {
    sendMessage();
  }
});

function updateCurrentResponse(token) {
  currentResponse += token;
  const responseElement = document.getElementById('currentResponse');
  if (responseElement) {
    responseElement.textContent = currentResponse;
  }
}

function finishResponse() {
  resetChatInput();
  const responseElement = document.getElementById('currentResponse');
  if (responseElement) {
    responseElement.id = '';
  }
}

async function pollServer() {
  try {
    const statusResponse = await fetch('/api_status.json?' + Date.now());
    if (statusResponse.ok) {
      const status = await statusResponse.json();

      if (status.modelInitialized && !currentModel) {
        currentModel = status.modelPath || 'loaded';
        updateStatus('Model loaded successfully - Ready to chat');
        document.getElementById('messageInput').disabled = false;
        document.getElementById('sendButton').disabled = false;
        document.getElementById('messageInput').placeholder = 'Type your message...';
      }
    }

    const resultsResponse = await fetch('/api_results.json?' + Date.now());
    if (resultsResponse.ok) {
      const results = await resultsResponse.json();

      for (const [commandId, commandData] of pendingCommands.entries()) {
        if (results.results[commandId]) {
          const result = results.results[commandId];
          console.log('[DEBUG] Processing result for:', commandId, result);

          if (commandData.type === 'initialize_model') {
            if (result.success) {
              currentModel = commandData.modelPath;
              updateStatus('Model loaded successfully - Ready to chat');
              document.getElementById('messageInput').disabled = false;
              document.getElementById('sendButton').disabled = false;
              document.getElementById('messageInput').placeholder = 'Type your message...';
            } else {
              updateStatus('Error loading model: ' + (result.error || 'Unknown error'));
              currentModel = null;
              document.getElementById('messageInput').disabled = true;
              document.getElementById('sendButton').disabled = true;
              document.getElementById('messageInput').placeholder = 'Please load a model first...';
            }
          } else if (commandData.type === 'send_message') {
            if (result.success) {
              document.getElementById('currentResponse').textContent = 'Response completed';
              updateStatus('Message sent successfully');
            } else {
              document.getElementById('currentResponse').textContent = 'Error: ' + (result.error || 'Unknown error');
              updateStatus('Error: ' + (result.error || 'Chat failed'));
            }
            resetChatInput();
          } else if (commandData.type === 'stop_generation') {
            if (result.success) {
              updateStatus('Generation stopped');
            } else {
              updateStatus('Error stopping generation: ' + (result.error || 'Unknown error'));
            }
            resetChatInput();
          }

          pendingCommands.delete(commandId);
        }
      }
    }
  } catch (error) {
    console.log('[DEBUG] Polling error:', error);
  }
}

function startPolling() {
  console.log('[DEBUG] Starting server polling');
  if (pollingInterval) {
    clearInterval(pollingInterval);
  }
  pollingInterval = setInterval(pollServer, 2000);
  pollServer();
}

function stopPolling() {
  console.log('[DEBUG] Stopping server polling');
  if (pollingInterval) {
    clearInterval(pollingInterval);
    pollingInterval = null;
  }
}

document.addEventListener('DOMContentLoaded', function() {
  console.log('[DEBUG] DOM Content Loaded - File-based API mode initialized');
  console.log('[DEBUG] User Agent:', navigator.userAgent);
  console.log('[DEBUG] Location:', window.location.href);

  updateStatus('Ready - Please select and load a model');
  startPolling();
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
<title>Inferra Chat</title>
</head>
<body>
<h1>Inferra AI Chat</h1>
<p>Error loading chat interface</p>
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

      await this.updateStatusFile();
      await this.updateResultsFile();
      await this.updateCommandsFile();

      this.startApiPolling();

      logger.logServerStart(actualPort, origin);

      this.emit('serverStarted', {
        url: origin,
        port: actualPort,
        ipAddress: actualIP,
        isRunning: true
      });

      return { success: true, url: origin };
    } catch (error) {
      const errorMessage = `Failed to start server: ${error instanceof Error ? error.message : 'Unknown error'}`;
      logger.logServerError(errorMessage);
      return {
        success: false,
        error: errorMessage
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

      this.stopApiPolling();

      await this.cleanupServerFiles();

      this.isRunning = false;
      this.startTime = null;
      this.serverInfo = null;
      this.serverDirectory = null;

      this.pendingCommands = [];
      this.commandResults.clear();

      logger.logServerStop();

      this.emit('serverStopped');

      return { success: true };
    } catch (error) {
      const errorMessage = `Failed to stop server: ${error instanceof Error ? error.message : 'Unknown error'}`;
      logger.logServerError(errorMessage);
      return {
        success: false,
        error: errorMessage
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
      const htmlContent = await this.generateChatHTMLContent();

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

  private pendingCommands: Array<{ id: string; command: string; data?: any; timestamp: number }> = [];
  private commandResults: Map<string, { success: boolean; data?: any; error?: string; timestamp: number }> = new Map();

  private async writeApiFile(filename: string, data: any): Promise<void> {
    if (!this.serverDirectory) return;

    try {
      const serverDirURI = `file://${this.serverDirectory}`;
      await FileSystem.writeAsStringAsync(`${serverDirURI}/${filename}`, JSON.stringify(data, null, 2));
    } catch (error) {
      logger.error(`failed_to_write_${filename}`, 'server');
    }
  }

  private async readApiFile(filename: string): Promise<any> {
    if (!this.serverDirectory) return null;

    try {
      const serverDirURI = `file://${this.serverDirectory}`;
      const content = await FileSystem.readAsStringAsync(`${serverDirURI}/${filename}`);
      return JSON.parse(content);
    } catch (error) {
      return null;
    }
  }

  private async updateCommandsFile(): Promise<void> {
    const commandsData = {
      commands: this.pendingCommands,
      timestamp: Date.now()
    };
    await this.writeApiFile('api_commands.json', commandsData);
  }

  private async updateResultsFile(): Promise<void> {
    const resultsData = {
      results: Object.fromEntries(this.commandResults),
      timestamp: Date.now()
    };
    await this.writeApiFile('api_results.json', resultsData);
  }

  private async updateStatusFile(): Promise<void> {
    const statusData = {
      serverRunning: this.isRunning,
      modelInitialized: llamaManager.isInitialized(),
      modelPath: llamaManager.getModelPath(),
      uptime: this.startTime ? Date.now() - this.startTime.getTime() : 0,
      timestamp: Date.now()
    };
    await this.writeApiFile('api_status.json', statusData);
  }

  private pollInterval?: NodeJS.Timeout;

  private async processApiCommands(): Promise<void> {
    logger.info('polling_api_commands', 'server');

    const commandsData = await this.readApiFile('api_commands.json');
    logger.info(`commands_data: ${JSON.stringify(commandsData)}`, 'server');

    if (!commandsData || !commandsData.commands) {
      logger.info('no_commands_found', 'server');
      return;
    }

    const newCommands = commandsData.commands.filter((cmd: any) =>
      !this.pendingCommands.some(existing => existing.id === cmd.id)
    );

    logger.info(`new_commands_count: ${newCommands.length}`, 'server');

    for (const cmd of newCommands) {
      logger.info(`processing_command: ${cmd.type} id:${cmd.id} data:${JSON.stringify(cmd)}`, 'server');

      try {
        if (cmd.type === 'initialize_model' && cmd.modelPath) {
          logger.info(`calling_handleModelInitialization: ${cmd.modelPath}`, 'server');
          const result = await this.handleModelInitialization(cmd.modelPath);
          logger.info(`init_result: ${JSON.stringify(result)}`, 'server');
          this.commandResults.set(cmd.id, { ...result, timestamp: Date.now() });
        } else if (cmd.type === 'send_message' && cmd.message) {
          const result = await this.handleChatMessage(cmd.message);
          this.commandResults.set(cmd.id, { ...result, timestamp: Date.now() });
        } else if (cmd.type === 'stop_generation') {
          const result = await this.handleStopGeneration();
          this.commandResults.set(cmd.id, { ...result, timestamp: Date.now() });
        } else {
          logger.info(`unknown_command: ${cmd.type}`, 'server');
          this.commandResults.set(cmd.id, { success: false, error: 'Unknown command', timestamp: Date.now() });
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        logger.error(`command_error: ${errorMessage}`, 'server');
        this.commandResults.set(cmd.id, { success: false, error: errorMessage, timestamp: Date.now() });
      }

      this.pendingCommands.push({
        id: cmd.id,
        command: cmd.type,
        data: cmd,
        timestamp: Date.now()
      });
    }

    logger.info(`updating_results_file`, 'server');
    await this.updateResultsFile();
    await this.updateStatusFile();
  }

  private startApiPolling(): void {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
    }

    this.pollInterval = setInterval(async () => {
      await this.processApiCommands();
      await this.updateStatusFile();
    }, 1000);
  }

  private stopApiPolling(): void {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = undefined;
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
      logger.info(`model_initialization_started: ${modelPath}`, 'model');
      logger.info(`llama_manager_available: ${!!llamaManager}`, 'model');
      logger.info(`llama_manager_initialized: ${llamaManager.isInitialized()}`, 'model');

      await llamaManager.loadModel(modelPath);

      logger.info(`model_load_success`, 'model');
      logger.logModelInitialization(modelPath, true);
      logger.info(`model_initialization_success: ${modelPath}`, 'model');
      this.emit('modelInitialized', { modelPath });
      return { success: true };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error during model initialization';
      logger.logModelInitialization(modelPath, false);
      logger.error(`model_initialization_error: ${errorMessage}`, 'model');
      this.emit('modelInitializationError', { error: errorMessage, modelPath });
      return { success: false, error: errorMessage };
    }
  }

  async handleChatMessage(message: string): Promise<{ success: boolean; error?: string }> {
    try {
      if (!llamaManager.isInitialized()) {
        const error = 'No model loaded';
        this.emit('messageError', { error });
        return { success: false, error };
      }

      logger.info(`chat_message_sent: ${message.substring(0, 50)}...`, 'chat');
      
      const messages = [{ role: 'user', content: message }];
      
      let fullResponse = '';
      
      const response = await llamaManager.generateResponse(
        messages,
        (token: string) => {
          fullResponse += token;
          this.emit('messageToken', { token });
          return true;
        }
      );

      this.emit('messageComplete', { response: fullResponse });
      logger.info(`chat_response_completed: ${fullResponse.length} chars`, 'chat');
      
      return { success: true };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`chat_error: ${errorMessage}`, 'chat');
      this.emit('messageError', { error: errorMessage });
      return { success: false, error: errorMessage };
    }
  }

  async handleStopGeneration(): Promise<{ success: boolean; error?: string }> {
    try {
      await llamaManager.stopCompletion();
      logger.info('chat_generation_stopped', 'chat');
      this.emit('messageComplete', { response: '', stopped: true });
      return { success: true };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`stop_generation_error: ${errorMessage}`, 'chat');
      return { success: false, error: errorMessage };
    }
  }
}

export const localServer = new LocalServerService();