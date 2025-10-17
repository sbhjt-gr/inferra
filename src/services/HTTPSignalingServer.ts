import Server from '@dr.pogodin/react-native-static-server';
import * as FileSystem from 'expo-file-system';
import { logger } from '../utils/logger';

interface SignalingServerStatus {
  isRunning: boolean;
  url: string;
  port: number;
}

export class HTTPSignalingServer {
  private server: Server | null = null;
  private port: number = 8888;
  private offerSDP: string = '';
  private onAnswerReceived: ((answer: string, peerId: string) => void) | null = null;
  private tempDir: string = '';
  private signalingURL: string = '';
  private isRunning: boolean = false;

  async start(
    offerSDP: string,
    onAnswer: (answer: string, peerId: string) => void
  ): Promise<SignalingServerStatus> {
    if (this.isRunning) {
      return {
        isRunning: true,
        url: this.signalingURL,
        port: this.port,
      };
    }

    this.offerSDP = offerSDP;
    this.onAnswerReceived = onAnswer;

    const cacheDir = FileSystem.cacheDirectory;
    if (!cacheDir) {
      throw new Error('cache_directory_not_available');
    }

    this.tempDir = `${cacheDir}signaling`;

    const dirInfo = await FileSystem.getInfoAsync(this.tempDir);
    if (!dirInfo.exists) {
      await FileSystem.makeDirectoryAsync(this.tempDir, { intermediates: true });
    }

    await this.createSignalingEndpoints();

    this.server = new Server({
      fileDir: this.tempDir.replace('file://', ''),
      port: this.port,
      nonLocal: true,
      stopInBackground: false,
    });

    const origin = await this.server.start();
    this.signalingURL = origin;

    this.isRunning = true;
    logger.info(`signaling_server_started port:${this.port}`, 'webrtc');

    return {
      isRunning: true,
      url: this.signalingURL,
      port: this.port,
    };
  }

  private async createSignalingEndpoints(): Promise<void> {
    const indexHTML = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Inferra Signaling</title>
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { font-family: system-ui; max-width: 600px; margin: 50px auto; padding: 20px; }
    h1 { color: #660880; }
    .section { margin: 20px 0; padding: 15px; border: 1px solid #ddd; border-radius: 8px; }
    button { padding: 10px 20px; background: #660880; color: white; border: none; border-radius: 6px; cursor: pointer; }
    button:hover { background: #9C38C0; }
    pre { background: #f5f5f5; padding: 10px; border-radius: 4px; overflow-x: auto; font-size: 12px; }
    .status { padding: 10px; border-radius: 4px; margin: 10px 0; }
    .success { background: #d4edda; color: #155724; }
    .error { background: #f8d7da; color: #721c24; }
  </style>
</head>
<body>
  <h1>Inferra Signaling Server</h1>
  <div class="section">
    <h2>Status</h2>
    <div class="status success">Signaling server is running</div>
    <p>Access <a href="/offer">/offer</a> to get the WebRTC offer SDP</p>
  </div>
</body>
</html>`;

    const offerHTML = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>WebRTC Offer</title>
  <style>
    body { font-family: system-ui; max-width: 800px; margin: 50px auto; padding: 20px; }
    h1 { color: #660880; }
    pre { background: #f5f5f5; padding: 15px; border-radius: 6px; overflow-x: auto; font-size: 11px; }
    button { padding: 10px 20px; background: #660880; color: white; border: none; border-radius: 6px; cursor: pointer; margin: 5px; }
    button:hover { background: #9C38C0; }
    .status { padding: 10px; border-radius: 4px; margin: 15px 0; display: none; }
    .success { background: #d4edda; color: #155724; display: block; }
  </style>
</head>
<body>
  <h1>WebRTC Offer SDP</h1>
  <pre id="offer-sdp">${this.offerSDP.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</pre>
  <button onclick="copyOffer()">Copy Offer</button>
  <button onclick="window.location.href='/answer-form'">Submit Answer</button>
  <div id="copy-status" class="status"></div>
  
  <script>
    function copyOffer() {
      const offerText = document.getElementById('offer-sdp').textContent;
      navigator.clipboard.writeText(offerText).then(() => {
        const status = document.getElementById('copy-status');
        status.textContent = 'Offer SDP copied to clipboard!';
        status.className = 'status success';
        setTimeout(() => { status.className = 'status'; }, 3000);
      });
    }
    
    if (window.ReactNativeWebView) {
      window.ReactNativeWebView.postMessage(JSON.stringify({
        type: 'offer',
        sdp: document.getElementById('offer-sdp').textContent
      }));
    }
  </script>
</body>
</html>`;

    const answerFormHTML = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Submit Answer SDP</title>
  <style>
    body { font-family: system-ui; max-width: 800px; margin: 50px auto; padding: 20px; }
    h1 { color: #660880; }
    textarea { width: 100%; min-height: 150px; padding: 10px; font-family: monospace; font-size: 11px; margin: 10px 0; }
    button { padding: 10px 20px; background: #660880; color: white; border: none; border-radius: 6px; cursor: pointer; }
    button:hover { background: #9C38C0; }
    .status { padding: 10px; border-radius: 4px; margin: 15px 0; display: none; }
    .success { background: #d4edda; color: #155724; display: block; }
    .error { background: #f8d7da; color: #721c24; display: block; }
  </style>
</head>
<body>
  <h1>Submit Answer SDP</h1>
  <p>Paste the Answer SDP from your browser client:</p>
  <textarea id="answer-sdp" placeholder="Paste Answer SDP here..."></textarea>
  <button onclick="submitAnswer()">Submit Answer</button>
  <div id="status" class="status"></div>
  
  <script>
    function submitAnswer() {
      const answerSDP = document.getElementById('answer-sdp').value.trim();
      if (!answerSDP) {
        showStatus('Please paste the Answer SDP', 'error');
        return;
      }
      
      const peerId = 'browser_' + Date.now();
      const url = '/answer-received?peer=' + encodeURIComponent(peerId) + '&sdp=' + encodeURIComponent(answerSDP);
      
      fetch(url)
        .then(response => response.text())
        .then(() => {
          showStatus('Answer submitted successfully! Connection should be established.', 'success');
          if (window.ReactNativeWebView) {
            window.ReactNativeWebView.postMessage(JSON.stringify({
              type: 'answer',
              sdp: answerSDP,
              peerId: peerId
            }));
          }
        })
        .catch(err => {
          showStatus('Error submitting answer: ' + err.message, 'error');
        });
    }
    
    function showStatus(message, type) {
      const status = document.getElementById('status');
      status.textContent = message;
      status.className = 'status ' + type;
    }
  </script>
</body>
</html>`;

    const answerReceivedHTML = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Answer Received</title>
  <style>
    body { font-family: system-ui; max-width: 600px; margin: 50px auto; padding: 20px; text-align: center; }
    h1 { color: #660880; }
    .success { background: #d4edda; color: #155724; padding: 20px; border-radius: 8px; margin: 20px 0; }
  </style>
</head>
<body>
  <h1>Connection Established!</h1>
  <div class="success">
    <p>Answer SDP received and processed.</p>
    <p>WebRTC connection should be established now.</p>
    <p>You can close this page.</p>
  </div>
  
  <script>
    const urlParams = new URLSearchParams(window.location.search);
    const answerSDP = urlParams.get('sdp');
    const peerId = urlParams.get('peer');
    
    if (window.ReactNativeWebView && answerSDP) {
      window.ReactNativeWebView.postMessage(JSON.stringify({
        type: 'answer',
        sdp: answerSDP,
        peerId: peerId
      }));
    }
  </script>
</body>
</html>`;

    await FileSystem.writeAsStringAsync(`${this.tempDir}/index.html`, indexHTML);
    await FileSystem.writeAsStringAsync(`${this.tempDir}/offer.html`, offerHTML);
    await FileSystem.writeAsStringAsync(`${this.tempDir}/answer-form.html`, answerFormHTML);
    await FileSystem.writeAsStringAsync(`${this.tempDir}/answer-received.html`, answerReceivedHTML);
  }

  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    if (this.server) {
      await this.server.stop();
      this.server = null;
    }

    if (this.tempDir) {
      const dirInfo = await FileSystem.getInfoAsync(this.tempDir);
      if (dirInfo.exists) {
        await FileSystem.deleteAsync(this.tempDir, { idempotent: true });
      }
    }

    this.isRunning = false;
    this.offerSDP = '';
    this.onAnswerReceived = null;

    logger.info('signaling_server_stopped', 'webrtc');
  }

  handleWebViewMessage(message: string): void {
    try {
      const data = JSON.parse(message);

      if (data.type === 'answer' && data.sdp && this.onAnswerReceived) {
        this.onAnswerReceived(data.sdp, data.peerId || 'unknown');
      }
    } catch (error) {
      logger.error('webview_message_error');
    }
  }

  getStatus(): SignalingServerStatus {
    return {
      isRunning: this.isRunning,
      url: '',
      port: this.port,
    };
  }
}

export const httpSignalingServer = new HTTPSignalingServer();
