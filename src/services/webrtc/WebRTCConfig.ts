export const ICE_SERVERS = {
  iceServers: [
    {
      urls: [
        'stun:stun.l.google.com:19302',
        'stun:stun1.l.google.com:19302',
        'stun:stun2.l.google.com:19302',
      ],
    },
  ],
  iceCandidatePoolSize: 10,
};

export const WEBRTC_CONFIG = {
  timeout: 30000,
  reconnectionAttempts: 3,
  reconnectionDelay: 2000,
  maxMessageSize: 1048576,
  rateLimit: {
    maxRequestsPerMinute: 60,
    maxConcurrentStreams: 10,
  },
};
