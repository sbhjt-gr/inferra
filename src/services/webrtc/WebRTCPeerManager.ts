import { RTCPeerConnection, MediaStream } from 'react-native-webrtc';
import { ICE_SERVERS, WEBRTC_CONFIG } from './WebRTCConfig';
import { WebRTCPeer, WebRTCMessage, WebRTCResponse } from './WebRTCTypes';

const generateId = () => `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

export class WebRTCPeerManager {
  private peerConnections = new Map<string, RTCPeerConnection>();
  private dataChannels = new Map<string, any>();
  private peers = new Map<string, WebRTCPeer>();
  private localPeerId: string = '';
  private pendingCandidates = new Map<string, RTCIceCandidate[]>();
  private requestHandlers = new Map<string, (message: WebRTCMessage) => Promise<WebRTCResponse>>();
  private streamHandlers = new Map<string, (message: WebRTCMessage, sendChunk: (chunk: any) => void) => void>();

  private onPeerConnected?: (peer: WebRTCPeer) => void;
  private onPeerDisconnected?: (peerId: string) => void;
  private onMessageReceived?: (peerId: string, message: any) => void;

  constructor() {
    this.localPeerId = generateId();
  }

  setCallbacks(callbacks: {
    onPeerConnected?: (peer: WebRTCPeer) => void;
    onPeerDisconnected?: (peerId: string) => void;
    onMessageReceived?: (peerId: string, message: any) => void;
  }) {
    this.onPeerConnected = callbacks.onPeerConnected;
    this.onPeerDisconnected = callbacks.onPeerDisconnected;
    this.onMessageReceived = callbacks.onMessageReceived;
  }

  registerRequestHandler(endpoint: string, handler: (message: WebRTCMessage) => Promise<WebRTCResponse>) {
    this.requestHandlers.set(endpoint, handler);
  }

  registerStreamHandler(endpoint: string, handler: (message: WebRTCMessage, sendChunk: (chunk: any) => void) => void) {
    this.streamHandlers.set(endpoint, handler);
  }

  async createOffer(): Promise<string> {
    const peerId = `browser-${generateId()}`;
    const pc = new RTCPeerConnection(ICE_SERVERS);
    
    this.peerConnections.set(peerId, pc);
    this.setupPeerConnection(pc, peerId);

    const dataChannel = pc.createDataChannel('inferra-api', {
      ordered: true,
      maxRetransmits: 3,
    });
    
    this.dataChannels.set(peerId, dataChannel);
    this.setupDataChannel(dataChannel, peerId);

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    await this.waitForICEGathering(pc);

    return pc.localDescription!.sdp;
  }

  async handleAnswer(answerSDP: string, peerId: string): Promise<void> {
    const pc = this.peerConnections.get(peerId);
    if (!pc) {
      throw new Error('peer_connection_not_found');
    }

    await pc.setRemoteDescription({
      type: 'answer',
      sdp: answerSDP,
    });

    const pending = this.pendingCandidates.get(peerId);
    if (pending) {
      for (const candidate of pending) {
        await pc.addIceCandidate(candidate);
      }
      this.pendingCandidates.delete(peerId);
    }
  }

  private setupPeerConnection(pc: RTCPeerConnection, peerId: string) {
    pc.addEventListener('icecandidate', (event: any) => {
      if (event.candidate) {
        if (!pc.remoteDescription) {
          let candidates = this.pendingCandidates.get(peerId) || [];
          candidates.push(event.candidate);
          this.pendingCandidates.set(peerId, candidates);
        }
      }
    });

    pc.addEventListener('connectionstatechange', () => {
      const state = pc.connectionState;
      console.log('webrtc_peer_state', { peerId, state });

      if (state === 'connected') {
        const peer: WebRTCPeer = {
          id: peerId,
          peerId: peerId,
          connected: true,
          connectionTime: new Date(),
        };
        this.peers.set(peerId, peer);
        
        if (this.onPeerConnected) {
          this.onPeerConnected(peer);
        }
      } else if (state === 'disconnected' || state === 'failed' || state === 'closed') {
        this.closePeerConnection(peerId);
        
        if (this.onPeerDisconnected) {
          this.onPeerDisconnected(peerId);
        }
      }
    });

    pc.addEventListener('datachannel', (event: any) => {
      const dataChannel = event.channel;
      this.dataChannels.set(peerId, dataChannel);
      this.setupDataChannel(dataChannel, peerId);
    });
  }

  private setupDataChannel(dataChannel: any, peerId: string) {
    dataChannel.onopen = () => {
      console.log('webrtc_datachannel_open', peerId);
    };

    dataChannel.onclose = () => {
      console.log('webrtc_datachannel_close', peerId);
    };

    dataChannel.onerror = (error: any) => {
      console.error('webrtc_datachannel_error', { peerId, error });
    };

    dataChannel.onmessage = async (event: any) => {
      try {
        const message = JSON.parse(event.data) as WebRTCMessage;
        console.log('webrtc_message_received', { peerId, endpoint: message.endpoint });

        if (this.onMessageReceived) {
          this.onMessageReceived(peerId, message);
        }

        if (message.endpoint.includes('/stream')) {
          const handler = this.streamHandlers.get(message.endpoint);
          if (handler) {
            handler(message, (chunk) => {
              this.sendToChannel(dataChannel, {
                id: message.id,
                type: 'stream_chunk',
                data: chunk,
              });
            });
          }
        } else {
          const handler = this.requestHandlers.get(message.endpoint);
          if (handler) {
            const response = await handler(message);
            this.sendToChannel(dataChannel, response);
          } else {
            this.sendToChannel(dataChannel, {
              id: message.id,
              endpoint: message.endpoint,
              success: false,
              error: 'endpoint_not_found',
            });
          }
        }
      } catch (error) {
        console.error('webrtc_message_error', { peerId, error });
      }
    };
  }

  private sendToChannel(channel: RTCDataChannel, data: any) {
    if (channel.readyState === 'open') {
      const message = JSON.stringify(data);
      if (message.length > WEBRTC_CONFIG.maxMessageSize) {
        console.error('webrtc_message_too_large', message.length);
        return;
      }
      channel.send(message);
    }
  }

  private async waitForICEGathering(pc: RTCPeerConnection): Promise<void> {
    return new Promise((resolve) => {
      if (pc.iceGatheringState === 'complete') {
        resolve();
        return;
      }

      const checkState = () => {
        if (pc.iceGatheringState === 'complete') {
          if (pc.removeEventListener) {
            pc.removeEventListener('icegatheringstatechange', checkState);
          }
          resolve();
        }
      };

      pc.addEventListener('icegatheringstatechange', checkState);

      setTimeout(() => {
        if (pc.removeEventListener) {
          pc.removeEventListener('icegatheringstatechange', checkState);
        }
        resolve();
      }, 5000);
    });
  }

  closePeerConnection(peerId: string): void {
    const pc = this.peerConnections.get(peerId);
    if (pc) {
      pc.close();
      this.peerConnections.delete(peerId);
    }

    const channel = this.dataChannels.get(peerId);
    if (channel) {
      channel.close();
      this.dataChannels.delete(peerId);
    }

    this.peers.delete(peerId);
    this.pendingCandidates.delete(peerId);
  }

  closeAllConnections(): void {
    this.peerConnections.forEach((pc) => pc.close());
    this.dataChannels.forEach((channel) => channel.close());
    
    this.peerConnections.clear();
    this.dataChannels.clear();
    this.peers.clear();
    this.pendingCandidates.clear();
  }

  getConnectedPeers(): WebRTCPeer[] {
    return Array.from(this.peers.values());
  }

  getConnectionCount(): number {
    return this.peers.size;
  }

  getLocalPeerId(): string {
    return this.localPeerId;
  }
}
