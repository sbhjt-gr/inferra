import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system';
import Server from '@dr.pogodin/react-native-static-server';

// Simple event emitter
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
  }

  async start(port?: number): Promise<{ success: boolean; url?: string; error?: string }> {
    if (this.isRunning) {
      return { success: false, error: 'Server is already running' };
    }

    try {
      await this.createHelloWorldContent();

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

  private async createHelloWorldContent(): Promise<void> {
    try {
      const cacheDir = FileSystem.cacheDirectory;
      if (!cacheDir) {
        throw new Error('Cache directory not available');
      }

      const serverDirName = 'hello_world_server';
      const serverDirURI = `${cacheDir}${serverDirName}`;
      const serverDirLocal = cacheDir.replace('file://', '') + serverDirName;

      const dirInfo = await FileSystem.getInfoAsync(serverDirURI);
      if (!dirInfo.exists) {
        await FileSystem.makeDirectoryAsync(serverDirURI, { intermediates: true });
      }

      const homeScreenHTML = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Inferra - AI Chat</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: #1E1326;
            color: #fff;
            height: 100vh;
            overflow: hidden;
        }

        .app-container {
            display: flex;
            flex-direction: column;
            height: 100vh;
        }

        .app-header {
            background: #660880;
            height: 52px;
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 0 16px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
            z-index: 10;
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
        }

        .header-left {
            display: flex;
            align-items: center;
        }

        .app-icon {
            width: 30px;
            height: 30px;
            background: linear-gradient(135deg, #9C38C0, #660880);
            border-radius: 15px;
            margin-right: 8px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 14px;
            font-weight: bold;
        }

        .app-title {
            font-size: 18px;
            font-weight: bold;
            color: #fff;
            letter-spacing: 0.2px;
        }

        .header-buttons {
            display: flex;
            gap: 8px;
        }

        .header-button {
            width: 36px;
            height: 36px;
            border-radius: 18px;
            background: rgba(255, 255, 255, 0.15);
            border: none;
            display: flex;
            align-items: center;
            justify-content: center;
            color: #fff;
            cursor: pointer;
            font-size: 18px;
        }

        .header-button:hover {
            background: rgba(255, 255, 255, 0.25);
        }

        .model-selector-container {
            border-bottom: 1px solid #3D2D4A;
            padding: 12px 16px;
            background: #1E1326;
            position: fixed;
            top: 52px;
            left: 0;
            right: 0;
            z-index: 9;
        }

        .model-selector {
            background: #2A1F37;
            border: 1px solid #3D2D4A;
            border-radius: 8px;
            padding: 12px 16px;
            color: #BDB7C4;
            display: flex;
            align-items: center;
            justify-content: space-between;
            cursor: pointer;
        }

        .model-selector:hover {
            border-color: #9C38C0;
        }

        .model-text {
            font-size: 14px;
        }

        .model-chevron {
            font-size: 16px;
            color: #BDB7C4;
        }

        .chat-container {
            flex: 1;
            display: flex;
            flex-direction: column;
            overflow: hidden;
            margin-top: 100px;
            margin-bottom: 100px;
        }

        .chat-view {
            flex: 1;
            padding: 16px;
            overflow-y: auto;
            display: flex;
            flex-direction: column;
            gap: 16px;
        }

        .message {
            max-width: 85%;
            padding: 12px 16px;
            border-radius: 18px;
            word-wrap: break-word;
            line-height: 1.4;
        }

        .message.user {
            background: #9C38C0;
            color: #fff;
            align-self: flex-end;
            margin-left: auto;
        }

        .message.assistant {
            background: #2A1F37;
            color: #fff;
            align-self: flex-start;
            border: 1px solid #3D2D4A;
        }

        .welcome-message {
            text-align: center;
            color: #BDB7C4;
            padding: 40px 20px;
            font-size: 16px;
        }

        .welcome-title {
            font-size: 24px;
            font-weight: bold;
            color: #9C38C0;
            margin-bottom: 12px;
        }

        .chat-input-container {
            border-top: 1px solid #3D2D4A;
            padding: 16px;
            background: #1E1326;
            position: fixed;
            bottom: 0;
            left: 0;
            right: 0;
            z-index: 9;
        }

        .chat-input-wrapper {
            display: flex;
            align-items: flex-end;
            gap: 12px;
            background: #2A1F37;
            border: 1px solid #3D2D4A;
            border-radius: 24px;
            padding: 8px 16px;
            min-height: 48px;
        }

        .chat-input {
            flex: 1;
            background: transparent;
            border: none;
            color: #fff;
            font-size: 16px;
            resize: none;
            outline: none;
            min-height: 32px;
            max-height: 120px;
            font-family: inherit;
            line-height: 1.4;
            padding: 8px 0;
        }

        .chat-input::placeholder {
            color: #BDB7C4;
        }

        .input-button {
            width: 32px;
            height: 32px;
            border: none;
            background: transparent;
            color: #BDB7C4;
            cursor: pointer;
            border-radius: 16px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 18px;
        }

        .input-button:hover {
            background: rgba(156, 56, 192, 0.1);
            color: #9C38C0;
        }

        .send-button {
            background: #9C38C0;
            color: #fff;
        }

        .send-button:hover {
            background: #7B2F99;
        }

        .send-button:disabled {
            background: #3D2D4A;
            color: #666;
            cursor: not-allowed;
        }

        .icon {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            width: 18px;
            height: 18px;
        }

        .icon-plus::before {
            content: "+";
            font-size: 20px;
            font-weight: bold;
        }

        .icon-clock::before {
            content: "⏲";
            font-size: 18px;
        }

        .icon-chevron-down::before {
            content: "▼";
            font-size: 12px;
        }

        .icon-paperclip::before {
            content: "📎";
            font-size: 16px;
            transform: rotate(45deg);
        }

        .icon-microphone::before {
            content: "●";
            font-size: 12px;
            border: 2px solid currentColor;
            border-radius: 50%;
            width: 8px;
            height: 12px;
            background: currentColor;
            position: relative;
        }

        .icon-microphone::after {
            content: "";
            position: absolute;
            bottom: -4px;
            left: 50%;
            transform: translateX(-50%);
            width: 12px;
            height: 3px;
            border: 1px solid currentColor;
            border-top: none;
            border-radius: 0 0 4px 4px;
        }

        .icon-send::before {
            content: "→";
            font-size: 16px;
            font-weight: bold;
        }

        .icon-stop::before {
            content: "■";
            font-size: 12px;
        }

        .icon-attachment {
            position: relative;
        }

        .icon-attachment::before {
            content: "";
            position: absolute;
            width: 12px;
            height: 16px;
            border: 2px solid currentColor;
            border-radius: 2px 2px 6px 6px;
            top: 1px;
            left: 3px;
        }

        .icon-attachment::after {
            content: "";
            position: absolute;
            width: 6px;
            height: 2px;
            background: currentColor;
            top: 5px;
            left: 6px;
        }

        .icon-mic {
            position: relative;
        }

        .icon-mic::before {
            content: "";
            position: absolute;
            width: 6px;
            height: 10px;
            border: 2px solid currentColor;
            border-radius: 4px 4px 0 0;
            top: 2px;
            left: 6px;
        }

        .icon-mic::after {
            content: "";
            position: absolute;
            width: 12px;
            height: 6px;
            border: 2px solid currentColor;
            border-top: none;
            border-radius: 0 0 6px 6px;
            bottom: 2px;
            left: 3px;
        }

        @media (max-width: 768px) {
            .message {
                max-width: 95%;
            }

            .chat-input-wrapper {
                padding: 6px 12px;
            }
        }
    </style>
</head>
<body>
    <div class="app-container">
        <div class="app-header">
            <div class="header-left">
                <div class="app-icon">AI</div>
                <div class="app-title">Inferra</div>
            </div>
            <div class="header-buttons">
                <button class="header-button" onclick="startNewChat()">
                    <span class="icon icon-plus"></span>
                </button>
                <button class="header-button" onclick="openChatHistory()">
                    <span class="icon icon-clock"></span>
                </button>
            </div>
        </div>

        <div class="model-selector-container">
            <div class="model-selector" onclick="openModelSelector()">
                <span class="model-text">Select a model to start chatting</span>
                <span class="icon icon-chevron-down"></span>
            </div>
        </div>

        <div class="chat-container">
            <div class="chat-view" id="chatView">
                <div class="welcome-message">
                    <div class="welcome-title">Welcome to Inferra</div>
                    <p>Your AI-powered chat assistant running on ${Platform.OS}</p>
                    <p>Select a model above to start your conversation</p>
                </div>
            </div>

            <div class="chat-input-container">
                <div class="chat-input-wrapper">
                    <button class="input-button" onclick="attachFile()">
                        <span class="icon icon-attachment"></span>
                    </button>
                    <textarea
                        class="chat-input"
                        id="messageInput"
                        placeholder="Type your message here..."
                        rows="1"
                        onkeydown="handleKeyDown(event)"
                        oninput="adjustTextareaHeight()"
                    ></textarea>
                    <button class="input-button" onclick="toggleMicrophone()">
                        <span class="icon icon-mic"></span>
                    </button>
                    <button class="send-button input-button" id="sendButton" onclick="sendMessage()">
                        <span class="icon icon-send"></span>
                    </button>
                </div>
            </div>
        </div>
    </div>

    <script>
        let messages = [];
        let isTyping = false;

        function startNewChat() {
            messages = [];
            renderMessages();
            showWelcomeMessage();
        }

        function openChatHistory() {
            alert('Chat history feature - connect to your app navigation');
        }

        function openModelSelector() {
            alert('Model selector - integrate with your model selection logic');
        }

        function attachFile() {
            alert('File attachment feature');
        }

        function toggleMicrophone() {
            alert('Voice recording feature');
        }

        function adjustTextareaHeight() {
            const textarea = document.getElementById('messageInput');
            textarea.style.height = 'auto';
            textarea.style.height = Math.min(textarea.scrollHeight, 120) + 'px';
        }

        function handleKeyDown(event) {
            if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                sendMessage();
            }
        }

        function sendMessage() {
            const input = document.getElementById('messageInput');
            const message = input.value.trim();

            if (!message || isTyping) return;

            messages.push({
                id: Date.now(),
                content: message,
                role: 'user'
            });

            input.value = '';
            input.style.height = 'auto';
            renderMessages();

            simulateAIResponse(message);
        }

        function simulateAIResponse(userMessage) {
            isTyping = true;
            updateSendButton();

            setTimeout(() => {
                const responses = [
                    "I'm a web replica of your Inferra app running on your ${Platform.OS} device. The actual AI processing would happen in your React Native app.",
                    "This is a demonstration of how your HomeScreen would look in a web browser. Your real AI models and chat functionality are in the mobile app.",
                    "Hello! I'm simulating the chat interface from your mobile app. The real magic happens in your React Native application with actual AI models.",
                ];

                messages.push({
                    id: Date.now(),
                    content: responses[Math.floor(Math.random() * responses.length)],
                    role: 'assistant'
                });

                isTyping = false;
                updateSendButton();
                renderMessages();
            }, 1500);
        }

        function renderMessages() {
            const chatView = document.getElementById('chatView');

            if (messages.length === 0) {
                showWelcomeMessage();
                return;
            }

            chatView.innerHTML = messages.map(message =>
                '<div class="message ' + message.role + '">' +
                message.content.replace(/\n/g, '<br>') +
                '</div>'
            ).join('');

            chatView.scrollTop = chatView.scrollHeight;
        }

        function showWelcomeMessage() {
            const chatView = document.getElementById('chatView');
            chatView.innerHTML =
                '<div class="welcome-message">' +
                '<div class="welcome-title">Welcome to Inferra</div>' +
                '<p>Your AI-powered chat assistant running on ${Platform.OS}</p>' +
                '<p>Select a model above to start your conversation</p>' +
                '<p><small>Server started: ${new Date().toLocaleString()}</small></p>' +
                '</div>';
        }

        function updateSendButton() {
            const sendButton = document.getElementById('sendButton');
            const icon = sendButton.querySelector('.icon');
            sendButton.disabled = isTyping;

            if (isTyping) {
                icon.className = 'icon icon-stop';
            } else {
                icon.className = 'icon icon-send';
            }
        }

        document.addEventListener('DOMContentLoaded', function() {
            showWelcomeMessage();
        });
    </script>
</body>
</html>`;

      await FileSystem.writeAsStringAsync(`${serverDirURI}/index.html`, homeScreenHTML);
      this.serverDirectory = serverDirLocal;
    } catch (error) {
      throw new Error(`Failed to create Hello World content: ${error instanceof Error ? error.message : 'Unknown error'}`);
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
    } catch (error) {
      // Cleanup errors are not critical
    }
  }

  private extractIPFromURL(url: string): string | null {
    try {
      const match = url.match(/http:\/\/([0-9.]+):[0-9]+/);
      return match ? match[1] : null;
    } catch (error) {
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
    // For the Hello World server, we don't need to return the HTML content
    // The server serves it directly via HTTP
    return null;
  }

  getWebViewSource(): { html: string } | null {
    // For network access, we don't need WebView fallback
    // The server is accessible via real HTTP URLs
    return null;
  }
}

export const localServer = new LocalServerService();