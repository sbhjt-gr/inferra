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
<style>
:root {
  --bg-primary: #1E1326;
  --bg-secondary: #2A1F37;
  --text-primary: #fff;
  --text-secondary: #BDB7C4;
  --accent: #660880;
  --accent-light: #9C38C0;
  --border: #3D2D4A;
  --success: #28a745;
  --danger: #dc3545;
  --warning: #ffc107;
}

* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
  background: var(--bg-primary);
  color: var(--text-primary);
  height: 100vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.header {
  background: var(--accent);
  padding: 16px 20px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  box-shadow: 0 2px 8px rgba(0,0,0,0.2);
  min-height: 64px;
}

.header h1 {
  font-size: 20px;
  font-weight: 600;
  margin: 0;
}

.model-selector {
  background: var(--bg-secondary);
  margin: 16px 20px;
  border-radius: 12px;
  padding: 16px;
  border: 1px solid var(--border);
}

.model-selector label {
  display: block;
  font-size: 14px;
  font-weight: 500;
  margin-bottom: 8px;
  color: var(--text-secondary);
}

.model-select-row {
  display: flex;
  gap: 12px;
  align-items: center;
}

.model-select {
  flex: 1;
  background: var(--bg-primary);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 12px 16px;
  color: var(--text-primary);
  font-size: 14px;
}

.model-select:focus {
  outline: none;
  border-color: var(--accent-light);
}

.load-button {
  background: var(--accent);
  color: white;
  border: none;
  border-radius: 8px;
  padding: 12px 20px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.load-button:hover {
  background: var(--accent-light);
}

.load-button:disabled {
  background: #666;
  cursor: not-allowed;
}

.status {
  background: var(--bg-secondary);
  margin: 0 20px 16px;
  padding: 12px 16px;
  border-radius: 8px;
  font-size: 14px;
  color: var(--text-secondary);
  border: 1px solid var(--border);
}

.chat-container {
  flex: 1;
  display: flex;
  flex-direction: column;
  margin: 0 20px 0;
  background: var(--bg-secondary);
  border-radius: 12px 12px 0 0;
  border: 1px solid var(--border);
  border-bottom: none;
  overflow: hidden;
  margin-bottom: 0;
}

.messages-container {
  flex: 1;
  overflow-y: auto;
  padding: 16px 16px 120px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.message {
  display: flex;
  flex-direction: column;
  max-width: 85%;
  word-wrap: break-word;
}

.message.user {
  align-self: flex-end;
}

.message.assistant {
  align-self: flex-start;
}

.message-content {
  padding: 12px 16px;
  border-radius: 18px;
  font-size: 15px;
  line-height: 1.4;
}

.message.user .message-content {
  background: var(--accent);
  color: white;
}

.message.assistant .message-content {
  background: var(--bg-primary);
  color: var(--text-primary);
  border: 1px solid var(--border);
}

.message-time {
  font-size: 12px;
  color: var(--text-secondary);
  margin: 4px 16px 0;
}

.input-container {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  padding: 16px 20px;
  border-top: 1px solid var(--border);
  background: var(--bg-primary);
  z-index: 100;
}

.input-row {
  display: flex;
  gap: 8px;
  align-items: flex-end;
}

.message-input {
  flex: 1;
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: 20px;
  padding: 12px 16px;
  color: var(--text-primary);
  font-size: 15px;
  resize: none;
  max-height: 100px;
  min-height: 44px;
}

.message-input:focus {
  outline: none;
  border-color: var(--accent-light);
}

.message-input:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.send-button, .stop-button {
  background: var(--accent);
  color: white;
  border: none;
  border-radius: 20px;
  width: 44px;
  height: 44px;
  cursor: pointer;
  transition: all 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
}

.send-button:hover, .stop-button:hover {
  background: var(--accent-light);
}

.send-button:disabled, .stop-button:disabled {
  background: #666;
  cursor: not-allowed;
}

.stop-button {
  background: var(--danger);
}

.stop-button:hover {
  background: #c82333;
}

.generating {
  color: var(--text-secondary);
  font-style: italic;
}

@media (max-width: 768px) {
  .header {
    padding: 12px 16px;
  }

  .model-selector {
    margin: 12px 16px;
    padding: 12px;
  }

  .status {
    margin: 0 16px 12px;
  }

  .chat-container {
    margin: 0 16px 0;
  }

  .input-container {
    padding: 12px 16px;
  }

  .model-select-row {
    flex-direction: column;
    align-items: stretch;
  }

  .load-button {
    margin-top: 8px;
  }
}
</style>
</head>
<body>
<div class="header">
  <h1>Inferra</h1>
</div>

<div class="model-selector">
  <label for="modelSelect">Select Model</label>
  <div class="model-select-row">
    <select id="modelSelect" class="model-select">
      <option value="">Choose a model...</option>
      ${modelsOptions}
    </select>
    <button onclick="loadSelectedModel()" class="load-button">Load Model</button>
  </div>
</div>

<div id="status" class="status">No model loaded</div>

<div class="chat-container">
  <div id="messages" class="messages-container"></div>
</div>

<div class="input-container">
  <div class="input-row">
    <textarea
      id="messageInput"
      class="message-input"
      placeholder="Type your message..."
      disabled
      rows="1"
    ></textarea>
    <button id="sendButton" onclick="sendMessage()" class="send-button" disabled>
      ➤
    </button>
    <button id="stopButton" onclick="stopGeneration()" class="stop-button" disabled style="display: none;">
      ■
    </button>
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
  messageDiv.className = 'message ' + role.toLowerCase();

  const contentDiv = document.createElement('div');
  contentDiv.className = 'message-content';
  contentDiv.textContent = content;

  const timeDiv = document.createElement('div');
  timeDiv.className = 'message-time';
  timeDiv.textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  messageDiv.appendChild(contentDiv);
  messageDiv.appendChild(timeDiv);
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
  document.getElementById('stopButton').style.display = 'flex';

  isGenerating = true;
  currentResponse = '';

  // Create assistant message container
  const messagesDiv = document.getElementById('messages');
  const assistantDiv = document.createElement('div');
  assistantDiv.className = 'message assistant';

  const contentDiv = document.createElement('div');
  contentDiv.className = 'message-content generating';
  contentDiv.id = 'currentResponse';
  contentDiv.textContent = 'Generating...';

  const timeDiv = document.createElement('div');
  timeDiv.className = 'message-time';
  timeDiv.textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  assistantDiv.appendChild(contentDiv);
  assistantDiv.appendChild(timeDiv);
  messagesDiv.appendChild(assistantDiv);
  messagesDiv.scrollTop = messagesDiv.scrollHeight;


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
  document.getElementById('stopButton').style.display = 'none';
  isGenerating = false;
}


document.getElementById('messageInput').addEventListener('keypress', function(event) {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault();
    sendMessage();
  }
});

document.getElementById('messageInput').addEventListener('input', function() {
  const textarea = this;
  textarea.style.height = 'auto';
  const newHeight = Math.min(textarea.scrollHeight, 100);
  textarea.style.height = newHeight + 'px';
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
<h1>Inferra</h1>
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