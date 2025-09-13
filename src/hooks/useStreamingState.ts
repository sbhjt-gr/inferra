import { useState, useRef } from 'react';

export const useStreamingState = () => {
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingMessage, setStreamingMessage] = useState('');
  const [streamingThinking, setStreamingThinking] = useState('');
  const [streamingMessageId, setStreamingMessageId] = useState<string | null>(null);
  const [streamingStats, setStreamingStats] = useState<{
    tokens: number;
    duration: number;
    firstTokenTime?: number;
    avgTokenTime?: number;
  } | null>(null);
  const [isRegenerating, setIsRegenerating] = useState(false);
  
  const cancelGenerationRef = useRef(false);

  const resetStreamingState = () => {
    setIsStreaming(false);
    setStreamingMessage('');
    setStreamingThinking('');
    setStreamingMessageId(null);
    setStreamingStats(null);
    setIsRegenerating(false);
    cancelGenerationRef.current = false;
  };

  const cancelGeneration = () => {
    cancelGenerationRef.current = true;
    setIsStreaming(false);
    setIsRegenerating(false);
  };

  return {
    isStreaming,
    setIsStreaming,
    streamingMessage,
    setStreamingMessage,
    streamingThinking,
    setStreamingThinking,
    streamingMessageId,
    setStreamingMessageId,
    streamingStats,
    setStreamingStats,
    isRegenerating,
    setIsRegenerating,
    cancelGenerationRef,
    resetStreamingState,
    cancelGeneration,
  };
};
