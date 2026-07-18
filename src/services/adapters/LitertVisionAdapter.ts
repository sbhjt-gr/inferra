import type { MultimodalPart } from 'react-native-litert-lm';

/**
 * LiteRT-LM expects media parts before text (matches Google Gallery /
 * sendMultimodalMessage docs). Legacy sendMessageWithImage used text-first.
 */
export const visionParts = (prompt: string, imagePath: string): MultimodalPart[] => {
  console.log('litert_vision_parts');
  return [
    { type: 'image', path: imagePath },
    { type: 'text', text: prompt },
  ];
};

export const audioParts = (prompt: string, audioPath: string): MultimodalPart[] => {
  console.log('litert_audio_parts');
  return [
    { type: 'audio', path: audioPath },
    { type: 'text', text: prompt },
  ];
};
