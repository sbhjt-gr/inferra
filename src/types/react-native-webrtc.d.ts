import 'react-native-webrtc';

declare module 'react-native-webrtc' {
  interface RTCPeerConnection {
    addEventListener: (type: string, listener: (...args: any[]) => void) => void;
    removeEventListener?: (type: string, listener: (...args: any[]) => void) => void;
  }
}
