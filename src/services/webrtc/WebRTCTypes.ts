import { MediaStream } from 'react-native-webrtc';

export interface WebRTCPeer {
  id: string;
  peerId: string;
  connected: boolean;
  stream?: MediaStream;
  connectionTime?: Date;
}

export interface WebRTCMessage {
  id: string;
  endpoint: string;
  method: string;
  data?: any;
}

export interface WebRTCResponse {
  id: string;
  endpoint: string;
  success: boolean;
  data?: any;
  error?: string;
}

export interface WebRTCStreamChunk {
  id: string;
  type: 'stream_chunk';
  data: any;
  done?: boolean;
}

export interface SignalingData {
  type: 'offer' | 'answer';
  sdp: string;
  peerId: string;
  timestamp: number;
}

export interface WebRTCServerStatus {
  isRunning: boolean;
  offerSDP: string | null;
  connectedPeers: number;
  qrData: string | null;
}
